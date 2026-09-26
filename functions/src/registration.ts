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
// ⚠️ FIX (26/09) : fenêtre de rejeu d'une session déjà 'verified' (voir
// registrationVerify) — assez pour un retry réseau, pas au-delà.
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

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
//                             (verifiedAt + verifiedCodeHash : rejeu borné,
//                             voir registrationVerify)
//   expired / locked        → code mort ; /resend relance un nouveau code
//                             sur la même session (FIX 26/09)

type Channel = 'sms_infobip';

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

// ⚠️ DÉCISION PRODUIT (20/09) : le push (FCM) est entièrement abandonné
// pour l'inscription Free/Yas et Expresso — comme pour login et le mot
// de passe oublié (voir otpChannel.ts). Il ajoutait un aller-retour FCM,
// avec ses propres échecs silencieux (token périmé, canal Android mal
// configuré, capacité iOS manquante...), avant même d'arriver au SMS —
// qui est le seul canal fiable et vérifiable. Le code est donc TOUJOURS
// envoyé par SMS Infobip, directement, sans jamais tenter de push
// d'abord — exactement le même chemin que login et le mot de passe
// oublié.
// On garde les noms de métriques historiques (sent_sms, send_failed_sms)
// plutôt que de migrer vers le decideChannelAndSend partagé
// d'otpChannel.ts, pour ne pas casser le dashboard admin qui les lit
// sous ces noms précis pour l'inscription.
async function decideChannelAndSend(sessionId: string, phone: string, code: string): Promise<Channel> {
  try {
    await sendOtpSmsInfobip(phone, code);
  } catch (err: any) {
    // ⚠️ FIX (26/09) : un timeout réseau n'est PAS un échec certain (le SMS
    // arrive très souvent, juste en retard) — code technique distinct, que
    // start/resend traitent comme un envoi réussi. Ce code n'est JAMAIS
    // renvoyé tel quel au client (pas d'entrée dans errorMessages.ts).
    if (err?.message === 'SMS_SEND_TIMEOUT') {
      console.warn(`⏱️ Envoi SMS OTP en timeout (session ${sessionId}) — session gardée active.`);
      await bumpRegistrationMetric('send_timeout_sms');
      throw new HttpsError('unavailable', 'SMS_SEND_TIMEOUT');
    }
    console.error(`❌ Échec envoi SMS OTP (session ${sessionId}):`, err?.message || err);
    await bumpRegistrationMetric('send_failed_sms');
    throw new HttpsError('unavailable', 'SMS_SEND_FAILED');
  }
  await bumpRegistrationMetric('sent_sms');
  return 'sms_infobip';
}

// ── POST /registration/start ────────────────────────────────────────────
export const registrationStart = onCall(
  // enforceAppCheck: DÉSACTIVÉ (12/09, ré-confirmé 14/09) — App Check
  // n'est toujours pas initialisé côté app mobile. À réactiver
  // seulement une fois App Check déployé et testé côté client.
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: false },
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
    let smsMaybeDelayed = false;
    try {
      channel = await decideChannelAndSend(sessionRef.id, phone, code);
    } catch (err) {
      const techCode = err instanceof HttpsError ? err.message : 'SMS_SEND_FAILED';
      if (techCode === 'SMS_SEND_TIMEOUT') {
        // ⚠️ FIX (26/09) : timeout ≠ échec. Avant, la session passait en
        // 'send_failed' et la réservation était libérée — alors que le SMS
        // arrivait quelques secondes plus tard avec un code devenu
        // inutilisable. On garde donc la session 'pending' et la
        // réservation, et on répond comme si l'envoi avait réussi.
        channel = 'sms_infobip';
        smsMaybeDelayed = true;
      } else {
        await sessionRef.update({ status: 'send_failed' });
        await releasePhoneReservation(phone, sessionRef.id);
        throwLocalized('unavailable', techCode === 'SMS_SEND_FAILED' ? techCode : 'SMS_SEND_FAILED');
      }
    }

    await sessionRef.update({ channel });
    await logAuditEvent({ type: 'start', sessionId: sessionRef.id, phone, carrier, channel, ip, ...(smsMaybeDelayed ? { reason: 'sms_timeout' } : {}) });
    await bumpRegistrationMetric('started');
    await bumpRegistrationMetric(`started_${carrier}`);

    return {
      sessionId: sessionRef.id,
      channel,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
      otpTtlSeconds: OTP_TTL_MS / 1000,
      ...(smsMaybeDelayed ? { smsMaybeDelayed: true } : {}),
    };
  }
);

// ── POST /registration/resend ───────────────────────────────────────────
export const registrationResend = onCall(
  // enforceAppCheck désactivé — voir commentaire sur registrationStart.
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: false },
  async (request) => {
    const sessionId = String(request.data?.sessionId ?? '');
    // `pushToken`/`forceSms` : ignorés désormais, conservés dans le type de
    // la requête pour ne pas casser un client pas encore mis à jour — voir
    // la note en tête de decideChannelAndSend (TOUJOURS SMS Infobip).
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
    const reopenableVerifying =
      data.status === 'verifying' &&
      Date.now() - ((data.verifyingAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0) > 90 * 1000;
    // ⚠️ FIX (26/09) : 'expired' et 'locked' sont désormais RELANÇABLES.
    // Les messages affichés pour CODE_EXPIRED et TOO_MANY_ATTEMPTS disent
    // « Demande un nouveau code », mais /resend refusait justement ces deux
    // statuts : l'utilisateur tombait sur « session plus active » et devait
    // tout recommencer. Le renvoi reste borné par les limites ci-dessus
    // (délai minimum, MAX_RESENDS par session, plafond par IP), et
    // l'update plus bas remet attempts à 0, un nouveau code et une
    // nouvelle expiration. 'verified' (compte créé) et un 'verifying'
    // récent restent refusés.
    if (
      data.status !== 'pending' &&
      data.status !== 'send_failed' &&
      data.status !== 'account_creation_failed' &&
      data.status !== 'expired' &&
      data.status !== 'locked' &&
      !reopenableVerifying
    ) {
      throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    }

    // ⚠️ FIX (26/09) : la réservation du numéro a pu expirer (TTL de 15 min
    // depuis /start) ou être libérée (échec d'envoi) — surtout maintenant
    // qu'on peut relancer une session 'expired'/'locked'. On la
    // rafraîchit, ce qui refuse aussi proprement le renvoi si un compte a
    // été créé entre-temps pour ce numéro. Toute autre erreur n'est pas
    // bloquante : l'unicité réelle reste tranchée par claimPhoneForAccount.
    try {
      await reservePhoneForSession(data.phone, sessionId, PHONE_RESERVATION_TTL_MS);
    } catch (err) {
      if (err instanceof PhoneAlreadyUsedError) {
        await logAuditEvent({ type: 'resend_rejected', sessionId, phone: data.phone, ip, reason: 'phone_already_used' });
        throwLocalized('already-exists', 'PHONE_ALREADY_USED');
      }
      console.warn(`⚠️ Rafraîchissement réservation impossible (session ${sessionId}):`, err);
    }

    const code = generateOtp();
    const otpHash = hashOtp(code, sessionId);
    const now = admin.firestore.Timestamp.now();

    await ref.update({
      otpHash,
      otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
      attempts: 0,
      resendCount: admin.firestore.FieldValue.increment(1),
      status: 'pending',
      lastSentAt: now,
    });

    let channel: Channel;
    let smsMaybeDelayed = false;
    try {
      channel = await decideChannelAndSend(sessionId, data.phone, code);
    } catch (err) {
      const techCode = err instanceof HttpsError ? err.message : 'SMS_SEND_FAILED';
      if (techCode === 'SMS_SEND_TIMEOUT') {
        // ⚠️ FIX (26/09) : timeout ≠ échec (voir registrationStart) — la
        // session reste 'pending' avec le nouveau code, qui arrivera très
        // probablement en retard.
        channel = 'sms_infobip';
        smsMaybeDelayed = true;
      } else {
        await ref.update({ status: 'send_failed' });
        throwLocalized('unavailable', techCode === 'SMS_SEND_FAILED' ? techCode : 'SMS_SEND_FAILED');
      }
    }

    await ref.update({ channel });
    await logAuditEvent({ type: 'resend', sessionId, phone: data.phone, carrier: data.carrier, channel, ip, ...(smsMaybeDelayed ? { reason: 'sms_timeout' } : {}) });

    return {
      sessionId,
      channel,
      resendsLeft: MAX_RESENDS - ((data.resendCount ?? 0) + 1),
      ...(smsMaybeDelayed ? { smsMaybeDelayed: true } : {}),
    };
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
  // enforceAppCheck désactivé — voir commentaire sur registrationStart.
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: false },
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

    // ⚠️ FIX (26/09) : une transaction Firestore dont la fonction LÈVE une
    // erreur est entièrement annulée — y compris les tx.update() faits
    // juste avant le throw. Résultat : l'incrément de `attempts` après un
    // mauvais code, et les passages en 'expired'/'locked', n'étaient
    // JAMAIS enregistrés (la limite de 5 essais n'existait pas en
    // pratique). Ces cas RENVOIENT désormais `failCode` depuis la
    // transaction (écritures validées), et l'erreur est levée juste après,
    // dans le même try, pour garder exactement le même traitement
    // audit/métriques/erreur localisée qu'avant.
    let claim: { alreadyDone: boolean; uid?: string; phone?: string; pushToken?: string | null; carrier?: string; failCode?: string };
    try {
      claim = await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) throw new HttpsError('not-found', 'SESSION_NOT_FOUND');
        const data = snap.data()!;

        if (data.status === 'verified') {
          // ⚠️ FIX (26/09) SÉCURITÉ : avant, une session 'verified' renvoyait
          // un customToken frais pour N'IMPORTE QUEL code — quiconque
          // connaissait le sessionId obtenait une connexion au compte, sans
          // limite de durée. Le rejeu (réponse réseau perdue, double appui)
          // n'est plus accepté que dans les 10 min suivant la vérification
          // ET avec le même code (comparé au hash conservé à la
          // vérification, HMAC+pepper, temps constant).
          const verifiedAtMs = (data.verifiedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
          const storedHash = typeof data.verifiedCodeHash === 'string' ? data.verifiedCodeHash : '';
          if (!storedHash || Date.now() - verifiedAtMs > REPLAY_WINDOW_MS || !verifyOtpHash(code, sessionId, storedHash)) {
            throw new HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
          }
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
          // ⚠️ PANNE OBSERVÉE : si la création de compte est interrompue
          // (plantage, timeout, permission manquante), la session restait
          // bloquée en 'verifying' POUR TOUJOURS : /verify répondait
          // « vérification en cours » et /resend refusait ce statut. Le
          // numéro devenait inutilisable. Passé 90 s, on considère la
          // tentative morte et on rouvre la session au renvoi de code.
          const startedAt = (data.verifyingAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
          if (Date.now() - startedAt > 90 * 1000) {
            tx.update(ref, { status: 'account_creation_failed' });
            return { alreadyDone: false, failCode: 'SESSION_NOT_ACTIVE' };
          }
          throw new HttpsError('aborted', 'VERIFICATION_IN_PROGRESS');
        }
        if (data.status !== 'pending' || typeof data.otpHash !== 'string') {
          throw new HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
        }
        if ((data.otpExpiresAt as FirebaseFirestore.Timestamp).toMillis() < Date.now()) {
          tx.update(ref, { status: 'expired' });
          return { alreadyDone: false, failCode: 'CODE_EXPIRED' };
        }
        const maxAttempts: number = data.maxAttempts ?? MAX_VERIFY_ATTEMPTS;
        const attempts: number = data.attempts ?? 0;
        if (attempts >= maxAttempts) {
          tx.update(ref, { status: 'locked' });
          return { alreadyDone: false, failCode: 'TOO_MANY_ATTEMPTS' };
        }

        const ok = verifyOtpHash(code, sessionId, data.otpHash);
        if (!ok) {
          tx.update(ref, { attempts: admin.firestore.FieldValue.increment(1) });
          return { alreadyDone: false, failCode: `INVALID_CODE:${Math.max(0, maxAttempts - attempts - 1)}` };
        }

        // verifiedCodeHash : copie du hash du code validé, seule preuve
        // acceptée pour un rejeu 'verified' (voir plus haut). otpHash est
        // toujours supprimé ici (voir le commentaire sur
        // account_creation_failed plus bas).
        tx.update(ref, {
          status: 'verifying',
          verifyingAt: admin.firestore.Timestamp.now(),
          verifiedCodeHash: data.otpHash,
          otpHash: admin.firestore.FieldValue.delete(),
        });
        return { alreadyDone: false, phone: data.phone as string, pushToken: data.pushToken as string | null, carrier: data.carrier as string };
      });
      // Écritures de la transaction validées → on lève maintenant l'erreur
      // métier, traitée par le catch ci-dessous comme avant.
      if (claim.failCode) {
        const failHttps: FunctionsErrorCode = claim.failCode.startsWith('INVALID_CODE:')
          ? 'invalid-argument'
          : VERIFY_ERROR_MAP[claim.failCode]?.https ?? 'failed-precondition';
        throw new HttpsError(failHttps, claim.failCode);
      }
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
      // Le compte a déjà été créé par un appel précédent (double appui, ou
      // reprise après un jeton non signé) : on ne recrée rien, on renvoie de
      // quoi se connecter.
      if (!claim.uid) throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
      const retryToken = await admin.auth().createCustomToken(claim.uid).catch(() => null);
      return { uid: claim.uid, ...(retryToken ? { customToken: retryToken } : {}) };
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

    // ⚠️ FIX (26/09) : displayName transmis à Firebase Auth quand un nom
    // (chaîne non vide) est fourni — createUser refuse une valeur non-string.
    const authDisplayName = typeof profile.name === 'string' && profile.name.trim() ? profile.name.trim() : undefined;

    let uid: string | undefined;
    try {
      const userRecord = await admin.auth().createUser({
        phoneNumber: phone,
        email: syntheticEmail,
        password,
        ...(authDisplayName ? { displayName: authDisplayName } : {}),
      });
      uid = userRecord.uid;

      await claimPhoneForAccount(phone, sessionId, uid);

      await admin.firestore().collection('users').doc(uid).set({
        // ⚠️ FIX (26/09) : uid / email / displayName manquaient au profil
        // Free/Expresso alors que l'app les lit (même forme que les comptes
        // créés côté client). email = l'email synthétique utilisé pour
        // createUser (celui qui sert à la connexion).
        uid,
        email: syntheticEmail,
        displayName: profile.name ?? null,
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

      // verifiedAt : point de départ de la fenêtre de rejeu (FIX 26/09).
      await ref.update({ status: 'verified', accountId: uid, verifiedAt: admin.firestore.Timestamp.now() });
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
      // Aucun compte n'a été créé : on LIBÈRE le numéro. Sinon il restait
      // réservé dans phoneIndex et l'inscription répondait « déjà inscrit »
      // alors qu'Authentication ne contenait rien (et le mot de passe oublié
      // « aucun compte »). Authentication reste la source de vérité.
      await releasePhoneReservation(phone, sessionId).catch(() => {});

      if (err instanceof PhoneAlreadyUsedError) {
        await bumpRegistrationMetric('rejected_phone_used');
        await logAuditEvent({ type: 'account_creation_failed', sessionId, phone, reason: 'phone_claimed_concurrently' });
        throwLocalized('already-exists', 'PHONE_ALREADY_USED');
      }
      console.error(`❌ Échec création de compte (session ${sessionId}):`, err);
      await bumpRegistrationMetric('account_creation_failed');
      await logAuditEvent({ type: 'account_creation_failed', sessionId, phone, reason: String(err) });
      // ⚠️ FIX (26/09) : 'failed-precondition' au lieu de 'internal'. Le
      // client relance automatiquement les erreurs 'internal' — sur un OTP
      // déjà consommé, ce retry ne pouvait qu'échouer et finissait par
      // afficher un message trompeur. L'utilisateur doit passer par /resend.
      throwLocalized('failed-precondition', 'ACCOUNT_CREATION_FAILED');
    }

    // ⚠️ FIX (26/09) : métriques et audit HORS du chemin critique (même
    // correctif que orangeRegistration.ts). Le compte EXISTE déjà : une
    // erreur d'écriture de statistique ne doit jamais transformer ce
    // succès en échec côté client.
    try {
      await bumpRegistrationMetric('verify_success');
      await bumpRegistrationMetric(`accounts_created_${carrier === 'orange' ? 'orange' : 'push_infobip'}`);
      await logAuditEvent({ type: 'verify_success', sessionId, phone, carrier, accountId: uid });
      await logAuditEvent({ type: 'account_created', sessionId, phone, carrier, accountId: uid });
    } catch (e) {
      console.warn(`⚠️ Métriques/audit inscription non écrits (uid ${uid}):`, e);
    }

    // Le compte EXISTE désormais. Si la signature du jeton échoue (droit
    // iam.serviceAccounts.signBlob manquant, panne IAM), on ne fait PAS
    // échouer l'inscription : on renvoie l'uid sans jeton, et l'app se
    // connecte avec le numéro et le mot de passe qu'elle vient de choisir.
    let customToken: string | null = null;
    try {
      customToken = await admin.auth().createCustomToken(uid);
    } catch (err) {
      console.error(`⚠️ createCustomToken impossible (uid ${uid}) — compte créé quand même :`, err);
      await logAuditEvent({ type: 'account_created', sessionId, phone, carrier, accountId: uid, reason: 'custom_token_failed' });
    }
    return { uid, ...(customToken ? { customToken } : {}) };
  }
);
