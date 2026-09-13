// ============================================================
//   registration.ts — Parcours d'inscription EXPRESSO / TIGO.
//
//   Stratégie de canal, par session, réévaluée à CHAQUE envoi
//   (start ET resend) :
//     - un push token est associé à la session → OTP envoyé par
//       PUSH UNIQUEMENT, jamais de SMS, quel que soit l'opérateur.
//     - aucun push token n'est associé à la session → fallback
//       SMS InfoBip (uniquement pour Expresso/Tigo — jamais pour
//       Orange, qui suit un tout autre parcours, voir
//       orangeRegistration.ts).
//
//   Ajouts "extraordinaire" (v2) :
//     - anti-fraude comportemental (fraud.ts), au-delà du simple
//       plafond de volume du rate-limiting ;
//     - journal d'audit append-only (audit.ts) pour chaque étape ;
//     - métriques agrégées quotidiennes (metrics.ts) pour le
//       dashboard admin et l'alerting (monitoring.ts) ;
//     - messages d'erreur localisés FR/EN/Wolof (errorMessages.ts),
//       renvoyés dans HttpsError.details.message en plus du code
//       technique dans HttpsError.code/message.
//
//   ⚠️ Ce module ne gère PAS les numéros Orange. Le frontend doit
//   détecter l'opérateur (ou laisser /registration/start le faire
//   et suivre l'erreur ORANGE_USE_FIREBASE_AUTH) et rediriger vers
//   le parcours Firebase Phone Auth pour Orange.
// ============================================================
import { onCall, HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizePhoneSN, detectCarrier, phoneToSyntheticEmail } from './carrier';
import { generateOtp, hashOtp, verifyOtpHash } from './otp';
import {
  reservePhoneForSession,
  releasePhoneReservation,
  claimPhoneForAccount,
  isPhoneAlreadyUsed,
  PhoneAlreadyUsedError,
} from './phoneUniqueness';
import { checkAndConsumeRateLimit, enforceMinDelay, RateLimitedError } from './rateLimit';
import { sendOtpSmsInfobip } from './smsInfobip';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { evaluateFraudSignals } from './fraud';
import { localizeError } from './errorMessages';

// ⚠️ SÉCURITÉ : le champ `role` envoyé dans `profile` vient du CLIENT.
// Ces fonctions utilisent le Admin SDK, qui contourne entièrement
// firestore.rules (la restriction `role in ['client','seller']` sur
// users/{userId}.create ne protège donc QUE les écritures directes SDK
// client, pas cette Cloud Function). Sans validation ici, un appelant
// peut s'auto-attribuer role: 'admin' ou 'delivery' lors de l'inscription.
// Seuls 'client' et 'seller' sont auto-attribuables ; tout le reste
// retombe sur 'client'. ⚠️ Aussi un FIX de cohérence : la valeur par
// défaut était 'buyer', qui n'existe dans AUCUNE vérification de rôle du
// reste de l'app (firestore.rules et les dashboards utilisent 'client').
const SELF_ASSIGNABLE_ROLES = new Set(['client', 'seller']);
function sanitizeSelfRegisteredRole(candidate: unknown): 'client' | 'seller' {
  return typeof candidate === 'string' && SELF_ASSIGNABLE_ROLES.has(candidate)
    ? (candidate as 'client' | 'seller')
    : 'client';
}

const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes — section 4
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESENDS = 5;
const RESEND_MIN_DELAY_MS = 45 * 1000;
const PHONE_RESERVATION_TTL_MS = OTP_TTL_MS + 10 * 60 * 1000;

// Machine à états de registrationSessions.status (documentée ici car
// dispersée entre start/resend/verify) :
//   pending                 → OTP valide, en attente de /verify
//   send_failed             → l'envoi (push ou SMS) a échoué, /resend possible
//   verifying               → transitoire, le temps de créer le compte (hors
//                             transaction) ; jamais persistant, jamais reçu
//                             tel quel par le client (mappé sur 'aborted'
//                             VERIFICATION_IN_PROGRESS)
//   account_creation_failed → OTP déjà consommé (hash supprimé) mais la
//                             création de compte a échoué après coup ;
//                             /verify est impossible à ce stade (plus de
//                             hash), seul /resend peut relancer un nouveau
//                             code sur la même session/réservation
//   verified                → compte créé, accountId renseigné, terminal
//   expired / locked        → terminal, recommencer une nouvelle inscription

type Channel = 'push' | 'sms_infobip';

function sessionsCol() {
  return admin.firestore().collection('registrationSessions');
}

// ⚠️ SÉCURITÉ : `rawRequest.ip` (l'IP de connexion TCP vue par le
// runtime Cloud Functions/Cloud Run) est la SEULE valeur fiable ici.
// L'en-tête X-Forwarded-For est en partie contrôlable par l'appelant :
// un client peut envoyer son propre X-Forwarded-For, et selon la
// façon dont l'infrastructure devant la fonction le complète (append
// vs remplacement), le premier maillon de la liste peut être une
// valeur forgée plutôt que la vraie IP du client. Faire confiance à ce
// premier maillon pour du rate-limiting/anti-fraude par IP le rend
// contournable en changeant simplement cet en-tête à chaque requête —
// exactement le contournement que ces défenses doivent empêcher.
// `rawRequest.ip` reste donc la source primaire ; X-Forwarded-For n'est
// qu'un dernier recours si elle est absente (jamais en pratique sur
// Cloud Functions v2), et seulement pour éviter un vide total plutôt
// que pour être considéré fiable.
function clientIp(rawRequest: any): string {
  return (
    rawRequest?.ip ||
    (rawRequest?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// Centralise la levée d'erreur : code technique (pour la logique
// frontend) + message déjà traduit (pour l'affichage direct, sans
// que le client ait besoin de dupliquer la table de traduction).
function throwLocalized(httpsCode: FunctionsErrorCode, techCode: string): never {
  throw new HttpsError(httpsCode, techCode, { message: localizeError(techCode) });
}

// ⚠️ FIX (13/09) : avant, un échec du push (token périmé, appareil
// changé entre la capture du token et l'envoi...) faisait échouer
// l'inscription ENTIÈRE au lieu de retomber sur SMS Infobip — seul
// otpChannel.ts (utilisé par login/reset) avait ce filet. Sans
// conséquence tant qu'aucun pushToken n'était jamais transmis, mais
// désormais réellement atteignable puisque l'inscription en capte un.
// On garde les noms de métriques historiques (sent_push, sent_sms...)
// plutôt que de migrer vers otpChannel.ts, pour ne pas casser le
// dashboard admin qui les lit sous ces noms précis pour l'inscription.
async function decideChannelAndSend(sessionId: string, phone: string, pushToken: string | undefined, code: string): Promise<Channel> {
  if (pushToken) {
    try {
      await admin.messaging().send({
        token: pushToken,
        notification: {
          title: 'AgriMarché',
          body: `Votre code de confirmation AgriMarché est : ${code}. Ce code expire dans 5 minutes.`,
        },
        data: { type: 'registration_otp', sessionId },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
      });
      await bumpRegistrationMetric('sent_push');
      return 'push';
    } catch (err: any) {
      console.error(`❌ Échec envoi push OTP (session ${sessionId}):`, err?.code || err);
      await bumpRegistrationMetric('send_failed_push');
      // tombe dans l'envoi SMS ci-dessous plutôt que d'échouer ici
    }
  }

  try {
    await sendOtpSmsInfobip(phone, code);
  } catch (err: any) {
    console.error(`❌ Échec envoi SMS OTP (session ${sessionId}):`, err?.message || err);
    await bumpRegistrationMetric('send_failed_sms');
    throw new HttpsError('unavailable', 'SMS_SEND_FAILED');
  }
  await bumpRegistrationMetric('sent_sms');
  return 'sms_infobip';
}

// ── POST /registration/start ────────────────────────────────────────────
export const registrationStart = onCall(
  // enforceAppCheck: active en code la protection décrite dans fraud.ts —
  // sans ce flag, App Check n'était que "recommandé côté client" mais
  // jamais réellement vérifié côté serveur ; un appelant sans jeton valide
  // était accepté quand même. À activer seulement après avoir déployé
  // App Check (Play Integrity / DeviceCheck) sur l'app mobile, sous peine
  // de bloquer les inscriptions légitimes.
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true },
  async (request) => {
    const phoneRaw = String(request.data?.phone ?? '');
    const pushToken: string | undefined = request.data?.pushToken || undefined;
    const phone = normalizePhoneSN(phoneRaw);
    if (!phone) throwLocalized('invalid-argument', 'INVALID_PHONE');

    const ip = clientIp(request.rawRequest);
    try {
      await checkAndConsumeRateLimit(`start:phone:${phone}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
      await checkAndConsumeRateLimit(`start:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) {
        await bumpRegistrationMetric('rejected_rate_limited');
        await logAuditEvent({ type: 'start_rejected', phone, ip, reason: 'rate_limited' });
        throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      }
      throw err;
    }

    // Anti-fraude comportemental — ne bloque que sur signal 'high'
    // (cf. fraud.ts). Les signaux 'medium' sont journalisés mais ne
    // pénalisent pas un utilisateur probablement légitime.
    const fraud = await evaluateFraudSignals(ip, phone, pushToken);
    if (fraud.signals.length > 0) {
      await logAuditEvent({ type: 'fraud_flagged', phone, ip, reason: fraud.signals.map((s) => `${s.severity}:${s.reason}`).join('; ') });
      await bumpRegistrationMetric('fraud_flagged');
    }
    if (fraud.blocked) {
      await bumpRegistrationMetric('rejected_rate_limited'); // regroupé avec le même compteur dashboard "rejeté avant OTP"
      throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
    }

    if (await isPhoneAlreadyUsed(phone)) {
      await bumpRegistrationMetric('rejected_phone_used');
      await logAuditEvent({ type: 'start_rejected', phone, ip, reason: 'phone_already_used' });
      throwLocalized('already-exists', 'PHONE_ALREADY_USED');
    }

    const carrier = await detectCarrier(phone);
    if (carrier === 'orange') {
      await logAuditEvent({ type: 'start_rejected', phone, ip, carrier, reason: 'orange_redirect' });
      throwLocalized('failed-precondition', 'ORANGE_USE_FIREBASE_AUTH');
    }

    const sessionRef = sessionsCol().doc();
    try {
      await reservePhoneForSession(phone, sessionRef.id, PHONE_RESERVATION_TTL_MS);
    } catch (err) {
      if (err instanceof PhoneAlreadyUsedError) {
        await bumpRegistrationMetric('rejected_phone_used');
        throwLocalized('already-exists', 'PHONE_ALREADY_USED');
      }
      await logAuditEvent({ type: 'start_rejected', phone, ip, carrier, reason: 'reservation_conflict' });
      throwLocalized('aborted', 'REGISTRATION_IN_PROGRESS');
    }

    const code = generateOtp();
    const otpHash = hashOtp(code, sessionRef.id);
    const now = admin.firestore.Timestamp.now();

    await sessionRef.set({
      phone,
      carrier,
      pushToken: pushToken ?? null,
      otpHash,
      otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
      attempts: 0,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
      resendCount: 0,
      status: 'pending',
      createdAt: now,
      lastSentAt: now,
      ip,
    });

    let channel: Channel;
    try {
      channel = await decideChannelAndSend(sessionRef.id, phone, pushToken, code);
    } catch (err) {
      await sessionRef.update({ status: 'send_failed' });
      await releasePhoneReservation(phone, sessionRef.id);
      const techCode = err instanceof HttpsError ? err.message : 'PUSH_SEND_FAILED';
      throwLocalized('unavailable', techCode);
    }

    await sessionRef.update({ channel });
    await bumpRegistrationMetric('started');
    await bumpRegistrationMetric(`started_${carrier}`);
    await logAuditEvent({ type: 'start', sessionId: sessionRef.id, phone, carrier, channel, ip });

    return { sessionId: sessionRef.id, channel, maxAttempts: MAX_VERIFY_ATTEMPTS, otpTtlSeconds: OTP_TTL_MS / 1000 };
  }
);

// ── POST /registration/resend ───────────────────────────────────────────
export const registrationResend = onCall(
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true },
  async (request) => {
    const sessionId = String(request.data?.sessionId ?? '');
    const newPushToken: string | undefined = request.data?.pushToken || undefined;
    if (!sessionId) throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');

    const ip = clientIp(request.rawRequest);
    try {
      await enforceMinDelay(`resend:${sessionId}`, RESEND_MIN_DELAY_MS);
      await checkAndConsumeRateLimit(`resend:count:${sessionId}`, { maxAttempts: MAX_RESENDS, windowMs: 30 * 60 * 1000 });
      await checkAndConsumeRateLimit(`resend:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) {
        await logAuditEvent({ type: 'resend_rejected', sessionId, ip, reason: 'rate_limited' });
        throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      }
      throw err;
    }

    const ref = sessionsCol().doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) throwLocalized('not-found', 'SESSION_NOT_FOUND');
    const data = snap.data()!;
    if (data.status !== 'pending' && data.status !== 'send_failed' && data.status !== 'account_creation_failed') {
      throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    }

    const pushToken = newPushToken ?? data.pushToken ?? undefined;
    const code = generateOtp();
    const otpHash = hashOtp(code, sessionId);
    const now = admin.firestore.Timestamp.now();

    await ref.update({
      pushToken: pushToken ?? null,
      otpHash,
      otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
      attempts: 0,
      resendCount: admin.firestore.FieldValue.increment(1),
      status: 'pending',
      lastSentAt: now,
    });

    let channel: Channel;
    try {
      channel = await decideChannelAndSend(sessionId, data.phone, pushToken, code);
    } catch (err) {
      await ref.update({ status: 'send_failed' });
      const techCode = err instanceof HttpsError ? err.message : 'PUSH_SEND_FAILED';
      throwLocalized('unavailable', techCode);
    }

    await ref.update({ channel });
    await logAuditEvent({ type: 'resend', sessionId, phone: data.phone, carrier: data.carrier, channel, ip });

    return { sessionId, channel, resendsLeft: MAX_RESENDS - ((data.resendCount ?? 0) + 1) };
  }
);

// Purge des sessions d'inscription terminales (verified / expired / locked /
// send_failed / account_creation_failed) — sans ce nettoyage,
// registrationSessions grossit indéfiniment (une session par tentative
// d'inscription, jamais supprimée). L'historique utile pour l'investigation
// reste dans registrationAuditLog, qui lui n'est jamais purgé : on peut donc
// supprimer une session en confiance dès qu'elle est ancienne, rien n'est
// perdu côté audit.
// ⚠️ Nécessite un index composite Firestore (createdAt + status) — au
// premier déploiement, la Cloud Console affichera un lien direct pour le
// créer en un clic si la requête échoue faute d'index. Le prévoir avant
// mise en prod plutôt que de découvrir l'erreur à la première exécution
// planifiée.
export async function purgeOldRegistrationSessions(olderThanMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
  const snap = await sessionsCol()
    .where('createdAt', '<', cutoff)
    .where('status', 'in', ['verified', 'expired', 'locked', 'send_failed', 'account_creation_failed'])
    .limit(400)
    .get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

// ── POST /registration/verify ───────────────────────────────────────────
export const registrationVerify = onCall(
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: true },
  async (request) => {
    const sessionId = String(request.data?.sessionId ?? '');
    const code = String(request.data?.code ?? '');
    const profile = request.data?.profile ?? {};
    if (!sessionId || !code) throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');

    // Vérifié ICI, avant de consommer la tentative OTP dans la
    // transaction plus bas : un mot de passe manquant/trop court ne doit
    // jamais coûter une tentative au client ni faire avancer la session
    // vers 'verifying' pour rien.
    const password = typeof profile.password === 'string' ? profile.password : '';
    if (password.length < 6) throwLocalized('invalid-argument', 'PASSWORD_REQUIRED');

    try {
      await checkAndConsumeRateLimit(`verify:${sessionId}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      throw err;
    }

    const ref = sessionsCol().doc(sessionId);

    // Code technique → (statut https, type audit, compteur métrique).
    // Table explicite plutôt que de relire une propriété interne de
    // HttpsError (non garantie stable entre versions du SDK).
    const VERIFY_ERROR_MAP: Record<string, { https: FunctionsErrorCode; audit: string; metric: string }> = {
      SESSION_NOT_FOUND: { https: 'not-found', audit: 'verify_failed', metric: 'verify_invalid_code' },
      SESSION_NOT_ACTIVE: { https: 'failed-precondition', audit: 'verify_failed', metric: 'verify_invalid_code' },
      CODE_EXPIRED: { https: 'deadline-exceeded', audit: 'verify_expired', metric: 'verify_expired' },
      TOO_MANY_ATTEMPTS: { https: 'resource-exhausted', audit: 'verify_locked', metric: 'verify_locked' },
    };

    let claim: { alreadyDone: boolean; uid?: string; phone?: string; pushToken?: string | null; carrier?: string };
    try {
      claim = await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'SESSION_NOT_FOUND');
        const data = snap.data()!;

        if (data.status === 'verified') {
          return { alreadyDone: true, uid: data.accountId as string | undefined };
        }
        // ⚠️ FIX course critique : 'verifying' est un état transitoire posé
        // juste avant la création du compte (hors transaction, voir plus
        // bas), le temps d'appeler admin.auth().createUser(). Un
        // double-clic ou un retry réseau du client qui soumet deux fois le
        // même code peut donc atterrir ici PENDANT que la première requête
        // finit de créer le compte. Avant ce fix, ce cas tombait dans le
        // même bucket que 'SESSION_NOT_ACTIVE' (erreur dure, session à
        // recommencer) — alors qu'il s'agit d'un simple "patiente, c'est
        // en cours", pas d'une session invalide. On le distingue donc avec
        // son propre code technique, mappé côté client à un message
        // invitant à réessayer dans un instant plutôt qu'à tout
        // recommencer.
        if (data.status === 'verifying') {
          throw new HttpsError('aborted', 'VERIFICATION_IN_PROGRESS');
        }
        if (data.status !== 'pending') {
          throw new HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
        }
        if ((data.otpExpiresAt as FirebaseFirestore.Timestamp).toMillis() < Date.now()) {
          tx.update(ref, { status: 'expired' });
          throw new HttpsError('deadline-exceeded', 'CODE_EXPIRED');
        }
        if (data.attempts >= data.maxAttempts) {
          tx.update(ref, { status: 'locked' });
          throw new HttpsError('resource-exhausted', 'TOO_MANY_ATTEMPTS');
        }

        const ok = verifyOtpHash(code, sessionId, data.otpHash);
        if (!ok) {
          tx.update(ref, { attempts: admin.firestore.FieldValue.increment(1) });
          throw new HttpsError('invalid-argument', `INVALID_CODE:${data.maxAttempts - data.attempts - 1}`);
        }

        tx.update(ref, { status: 'verifying', otpHash: admin.firestore.FieldValue.delete() });
        return { alreadyDone: false, phone: data.phone as string, pushToken: data.pushToken as string | null, carrier: data.carrier as string };
      });
    } catch (err) {
      if (err instanceof HttpsError) {
        const techCode = err.message; // le code technique a été passé comme 2ᵉ argument de HttpsError

        // Ni un échec ni une session invalide : une requête concurrente
        // pour la même session est déjà en train de finaliser la
        // vérification. Ne pollue donc ni l'audit ni les métriques
        // d'échec — le client est invité à réessayer dans un instant.
        if (techCode === 'VERIFICATION_IN_PROGRESS') {
          throwLocalized('aborted', techCode);
        }

        const isInvalidCode = techCode.startsWith('INVALID_CODE:');
        const mapping = VERIFY_ERROR_MAP[techCode];

        await logAuditEvent({ type: (isInvalidCode ? 'verify_failed' : mapping?.audit ?? 'verify_failed') as any, sessionId, reason: techCode });
        await bumpRegistrationMetric(isInvalidCode ? 'verify_invalid_code' : mapping?.metric ?? 'verify_invalid_code');

        const httpsCode = isInvalidCode ? 'invalid-argument' : mapping?.https ?? 'internal';
        throwLocalized(httpsCode, techCode);
      }
      throw err;
    }

    if (claim.alreadyDone) {
      if (!claim.uid) throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
      return { uid: claim.uid };
    }

    const { phone, pushToken, carrier } = claim as { phone: string; pushToken: string | null; carrier: string };

    // ⚠️ COHÉRENCE LOGIN : le reste de l'app authentifie par email
    // synthétique + mot de passe (voir phoneToEmail() côté client,
    // src/contexts/AuthContext.tsx). Sans ce mot de passe, le compte créé
    // ici ne serait accessible qu'une seule fois — via le customToken
    // renvoyé en fin d'inscription — avec ensuite aucun moyen de se
    // reconnecter depuis l'écran de login. On réplique donc le même
    // format d'email synthétique et on fixe le mot de passe (déjà validé
    // plus haut) dès la création du compte.
    const syntheticEmail = phoneToSyntheticEmail(phone);

    let uid: string | undefined;
    try {
      const userRecord = await admin.auth().createUser({ phoneNumber: phone, email: syntheticEmail, password });
      uid = userRecord.uid;

      await claimPhoneForAccount(phone, sessionId, uid);

      await admin.firestore().collection('users').doc(uid).set({
        phone,
        phoneVerified: true,
        role: sanitizeSelfRegisteredRole(profile.role),
        name: profile.name ?? null,
        // Champs non sensibles, passés tels quels comme le faisait déjà
        // signUp() côté client (contexts/AuthContext.tsx) — pas de
        // validation stricte nécessaire, ce ne sont pas des droits.
        region: typeof profile.region === 'string' ? profile.region : '',
        departement: typeof profile.departement === 'string' ? profile.departement : '',
        commune: typeof profile.commune === 'string' ? profile.commune : '',
        quartier: typeof profile.quartier === 'string' ? profile.quartier : '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        registrationChannel: 'push_or_infobip',
      });

      if (pushToken) {
        await admin.firestore().collection('users').doc(uid).collection('tokens').doc(pushToken).set({
          platform: profile.platform ?? 'unknown',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'registration',
        });
      }

      await ref.update({ status: 'verified', accountId: uid });
    } catch (err) {
      if (uid) await admin.auth().deleteUser(uid).catch(() => {});
      // ⚠️ FIX bug crash : NE PAS remettre 'pending' ici. otpHash a déjà
      // été supprimé par la transaction ci-dessus (passage par 'verifying'),
      // donc un retry de /verify sur ce statut ferait planter
      // verifyOtpHash() (Buffer.from(undefined, 'hex')) avec une erreur
      // non-HttpsError, renvoyée telle quelle au client (500 générique,
      // sans message localisé, sans audit). 'account_creation_failed' est
      // un statut dédié, ajouté à la liste des statuts autorisant un
      // /resend (voir registrationResend) : le client peut donc relancer
      // proprement l'envoi d'un nouveau code sur la même session/réservation
      // de numéro, sans jamais retenter /verify sur l'ancien hash.
      await ref.update({ status: 'account_creation_failed' }).catch(() => {});

      if (err instanceof PhoneAlreadyUsedError) {
        await bumpRegistrationMetric('rejected_phone_used');
        await logAuditEvent({ type: 'account_creation_failed', sessionId, phone, reason: 'phone_claimed_concurrently' });
        throwLocalized('already-exists', 'PHONE_ALREADY_USED');
      }
      console.error(`❌ Échec création de compte (session ${sessionId}):`, err);
      await bumpRegistrationMetric('account_creation_failed');
      await logAuditEvent({ type: 'account_creation_failed', sessionId, phone, reason: String(err) });
      throwLocalized('internal', 'ACCOUNT_CREATION_FAILED');
    }

    await bumpRegistrationMetric('verify_success');
    await bumpRegistrationMetric(`accounts_created_${carrier === 'orange' ? 'orange' : 'push_infobip'}`);
    await logAuditEvent({ type: 'verify_success', sessionId, phone, carrier, accountId: uid });
    await logAuditEvent({ type: 'account_created', sessionId, phone, carrier, accountId: uid });

    const customToken = await admin.auth().createCustomToken(uid);
    return { uid, customToken };
  }
);
