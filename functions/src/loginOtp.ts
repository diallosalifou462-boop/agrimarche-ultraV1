// ============================================================
//   loginOtp.ts — 2ᵉ facteur de connexion, UNIQUEMENT pour Free/Yas
//   et Expresso (Orange utilise Firebase Phone Auth nativement, comme
//   à l'inscription — rien à faire ici pour Orange, voir
//   orangeRegistration.ts).
//
//   Contexte : le mot de passe est déjà vérifié côté CLIENT
//   (signInWithEmailAndPassword) AVANT d'appeler loginSendOtp — donc
//   request.auth est déjà renseigné ici. Conséquence de sécurité
//   importante : on ne fait JAMAIS confiance à un numéro envoyé par le
//   client. Le numéro utilisé est toujours celui déjà enregistré sur
//   users/{uid}, jamais une valeur reçue dans la requête — sans quoi
//   un compte authentifié A pourrait demander l'envoi d'un OTP vers le
//   numéro d'un compte B.
// ============================================================
import { onCall, HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { generateOtp, hashOtp, verifyOtpHash } from './otp';
import { checkAndConsumeRateLimit, RateLimitedError } from './rateLimit';
import { sendOtpSmsInfobip } from './smsInfobip';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
// ⚠️ FIX (26/09) : fenêtre de rejeu d'une session déjà 'verified' — voir
// loginVerifyOtp.
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

function throwLocalized(httpsCode: FunctionsErrorCode, techCode: string): never {
  throw new HttpsError(httpsCode, techCode, { message: localizeError(techCode) });
}

// ⚠️ FIX (26/09) : envoi SMS local plutôt que decideChannelAndSend
// (otpChannel.ts), qui transforme TOUTE erreur en SMS_SEND_FAILED et perd
// donc la différence entre « échec certain » et « timeout » (SMS très
// probablement livré en retard). Mêmes noms de métriques qu'otpChannel
// (`login_sent_sms`, `login_send_failed_sms`) pour ne pas casser le
// dashboard admin, plus `login_send_timeout_sms`.
// Renvoie 'timeout' au lieu de lever une erreur quand l'envoi a expiré.
async function sendLoginSms(sessionId: string, phone: string, code: string): Promise<'sent' | 'timeout'> {
  try {
    await sendOtpSmsInfobip(phone, code, 'connexion');
  } catch (err: any) {
    if (err?.message === 'SMS_SEND_TIMEOUT') {
      console.warn(`⏱️ Envoi SMS OTP en timeout (login, session ${sessionId}) — session gardée active.`);
      await bumpRegistrationMetric('login_send_timeout_sms');
      return 'timeout';
    }
    console.error(`❌ Échec envoi SMS OTP (login, session ${sessionId})`);
    await bumpRegistrationMetric('login_send_failed_sms');
    throw new HttpsError('unavailable', 'SMS_SEND_FAILED', { message: localizeError('SMS_SEND_FAILED') });
  }
  await bumpRegistrationMetric('login_sent_sms');
  return 'sent';
}

function sessionsCol() {
  return admin.firestore().collection('loginOtpSessions');
}

function clientIp(rawRequest: any): string {
  return (
    rawRequest?.ip ||
    (rawRequest?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export const loginSendOtp = onCall(
  // enforceAppCheck: DÉSACTIVÉ (18/09) — aligné sur registrationStart.
  // Avec App Check activé ici, l'app iOS recevait un 401 « app: MISSING »
  // avant même d'entrer dans la function : « Une erreur est survenue » à
  // chaque mot de passe oublié. Les protections anti-abus restent en place
  // (limites par numéro et par IP, 5 essais max, expiration 5 min).
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throwLocalized('unauthenticated', 'AUTH_REQUIRED');
    const uid = request.auth.uid;
    const ip = clientIp(request.rawRequest);

    try {
      await checkAndConsumeRateLimit(`login:uid:${uid}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
      await checkAndConsumeRateLimit(`login:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      throw err;
    }

    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const phone = userDoc.data()?.phone as string | undefined;
    if (!phone) {
      // Ne devrait jamais arriver pour un compte Free/Expresso (le
      // numéro est requis dès l'inscription) — on refuse proprement
      // plutôt que d'envoyer un SMS à personne.
      throwLocalized('failed-precondition', 'PHONE_NOT_VERIFIED');
    }

    const sessionRef = sessionsCol().doc();
    const code = generateOtp();
    const otpHash = hashOtp(code, sessionRef.id);
    const now = admin.firestore.Timestamp.now();

    await sessionRef.set({
      uid,
      phone,
      otpHash,
      otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
      attempts: 0,
      maxAttempts: MAX_VERIFY_ATTEMPTS,
      status: 'pending',
      createdAt: now,
      ip,
    });

    // Toujours par SMS Infobip, directement — voir sendLoginSms.
    const channel: 'sms_infobip' = 'sms_infobip';
    let sendResult: 'sent' | 'timeout';
    try {
      sendResult = await sendLoginSms(sessionRef.id, phone, code);
    } catch (err) {
      await sessionRef.update({ status: 'send_failed' });
      await logAuditEvent({ type: 'login_otp_rejected', sessionId: sessionRef.id, phone, ip, reason: 'send_failed' });
      throw err; // déjà un HttpsError('unavailable', 'SMS_SEND_FAILED') localisé côté client
    }
    // ⚠️ FIX (26/09) : en cas de timeout, la session reste 'pending' et on
    // répond comme un envoi réussi — le code arrive très probablement en
    // retard, et le déclarer « échoué » rendait ce code inutilisable.
    const smsMaybeDelayed = sendResult === 'timeout';

    await logAuditEvent({ type: 'login_otp_sent', sessionId: sessionRef.id, phone, ip, channel, ...(smsMaybeDelayed ? { reason: 'sms_timeout' } : {}) });

    return { sessionId: sessionRef.id, otpTtlSeconds: OTP_TTL_MS / 1000, ...(smsMaybeDelayed ? { smsMaybeDelayed: true } : {}) };
  }
);

export const loginVerifyOtp = onCall(
  // enforceAppCheck: DÉSACTIVÉ (18/09) — aligné sur registrationStart.
  // Avec App Check activé ici, l'app iOS recevait un 401 « app: MISSING »
  // avant même d'entrer dans la function : « Une erreur est survenue » à
  // chaque mot de passe oublié. Les protections anti-abus restent en place
  // (limites par numéro et par IP, 5 essais max, expiration 5 min).
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: false },
  async (request) => {
    if (!request.auth) throwLocalized('unauthenticated', 'AUTH_REQUIRED');
    const uid = request.auth.uid;
    const sessionId = String(request.data?.sessionId ?? '');
    const code = String(request.data?.code ?? '');
    if (!sessionId || !code) throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');

    try {
      await checkAndConsumeRateLimit(`login_verify:${sessionId}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      throw err;
    }

    const ref = sessionsCol().doc(sessionId);

    // ⚠️ FIX (26/09) : lecture + contrôle + incrément de `attempts` dans UNE
    // transaction (comme registrationVerify). Avant, tout se faisait hors
    // transaction : N requêtes parallèles lisaient toutes le même
    // `attempts` et passaient toutes le contrôle — la limite de 5 essais
    // se contournait en envoyant les devinettes en rafale.
    // La transaction RENVOIE l'issue (au lieu de lever une erreur) : une
    // exception dans la transaction annulerait aussi ses écritures
    // (incrément, passage en 'expired'/'locked').
    type VerifyOutcome =
      | { kind: 'fail'; httpsCode: FunctionsErrorCode; techCode: string; phone?: string; reason?: string }
      | { kind: 'verified' | 'replay'; phone?: string };

    const outcome = await admin.firestore().runTransaction(async (tx): Promise<VerifyOutcome> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: 'fail', httpsCode: 'not-found', techCode: 'SESSION_NOT_FOUND' };
      const data = snap.data()!;

      // ⚠️ La session doit appartenir au MÊME utilisateur authentifié qui a
      // demandé le code — sans ce contrôle, un uid A authentifié pourrait
      // essayer de deviner/valider le sessionId d'un uid B.
      if (data.uid !== uid) return { kind: 'fail', httpsCode: 'permission-denied', techCode: 'SESSION_NOT_FOUND' };

      if (data.status === 'verified') {
        // ⚠️ FIX (26/09) SÉCURITÉ : une session 'verified' renvoyait un
        // customToken pour N'IMPORTE QUEL code, sans limite de durée. Le
        // rejeu (réponse réseau perdue, double appui) n'est plus accepté que
        // dans les 10 min suivant la vérification ET avec le même code (hash
        // conservé, HMAC+pepper, comparaison à temps constant).
        const verifiedAtMs = (data.verifiedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
        const storedHash = typeof data.verifiedCodeHash === 'string' ? data.verifiedCodeHash : '';
        if (!storedHash || Date.now() - verifiedAtMs > REPLAY_WINDOW_MS || !verifyOtpHash(code, sessionId, storedHash)) {
          return { kind: 'fail', httpsCode: 'failed-precondition', techCode: 'SESSION_NOT_ACTIVE' };
        }
        return { kind: 'replay' };
      }
      if (data.status !== 'pending' || typeof data.otpHash !== 'string') {
        return { kind: 'fail', httpsCode: 'failed-precondition', techCode: 'SESSION_NOT_ACTIVE' };
      }
      if ((data.otpExpiresAt as FirebaseFirestore.Timestamp).toMillis() < Date.now()) {
        tx.update(ref, { status: 'expired' });
        return { kind: 'fail', httpsCode: 'deadline-exceeded', techCode: 'CODE_EXPIRED', phone: data.phone, reason: 'expired' };
      }
      const maxAttempts: number = data.maxAttempts ?? MAX_VERIFY_ATTEMPTS;
      const attempts: number = data.attempts ?? 0;
      if (attempts >= maxAttempts) {
        tx.update(ref, { status: 'locked' });
        return { kind: 'fail', httpsCode: 'resource-exhausted', techCode: 'TOO_MANY_ATTEMPTS', phone: data.phone, reason: 'locked' };
      }

      const ok = verifyOtpHash(code, sessionId, data.otpHash);
      if (!ok) {
        tx.update(ref, { attempts: admin.firestore.FieldValue.increment(1) });
        return {
          kind: 'fail',
          httpsCode: 'invalid-argument',
          techCode: `INVALID_CODE:${Math.max(0, maxAttempts - attempts - 1)}`,
          phone: data.phone,
          reason: 'invalid_code',
        };
      }

      // verifiedAt + verifiedCodeHash : seules preuves acceptées pour un
      // rejeu (voir plus haut).
      tx.update(ref, {
        status: 'verified',
        verifiedAt: admin.firestore.Timestamp.now(),
        verifiedCodeHash: data.otpHash,
        otpHash: admin.firestore.FieldValue.delete(),
      });
      return { kind: 'verified', phone: data.phone as string | undefined };
    });

    if (outcome.kind === 'fail') {
      if (outcome.reason === 'expired' || outcome.reason === 'locked') {
        await logAuditEvent({ type: 'login_otp_verify_failed', sessionId, phone: outcome.phone, reason: outcome.reason });
      }
      if (outcome.reason === 'invalid_code') {
        await bumpRegistrationMetric('login_otp_invalid_code');
      }
      throwLocalized(outcome.httpsCode, outcome.techCode);
    }

    if (outcome.kind === 'verified') {
      await bumpRegistrationMetric('login_otp_verify_success');
      await logAuditEvent({ type: 'login_otp_verify_success', sessionId, phone: outcome.phone, accountId: uid });
    }

    // Un customToken n'est pas strictement indispensable ici (le client
    // est déjà authentifié par mot de passe), mais on le renvoie quand
    // même pour rester symétrique avec le flow d'inscription, et pour
    // rafraîchir la session avec un token qui reflète bien le 2ᵉ facteur
    // validé.
    const customToken = await admin.auth().createCustomToken(uid);
    return { verified: true, customToken };
  }
);

// Purge quotidienne, même logique que purgeOldRegistrationSessions
// (registration.ts) — évite que la collection grossisse indéfiniment.
export async function purgeOldLoginOtpSessions(olderThanMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
  const snap = await sessionsCol().where('createdAt', '<', cutoff).limit(400).get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
