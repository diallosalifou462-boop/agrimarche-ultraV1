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
import { decideChannelAndSend, getMostRecentPushToken } from './otpChannel';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function throwLocalized(httpsCode: FunctionsErrorCode, techCode: string): never {
  throw new HttpsError(httpsCode, techCode, { message: localizeError(techCode) });
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
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true },
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

    // Compte déjà existant (on est en 2ᵉ facteur, pas en inscription) :
    // on va chercher nous-mêmes un token push déjà enregistré pour ce
    // uid, plutôt que d'exiger un changement côté client — voir
    // otpChannel.ts.
    const pushToken = await getMostRecentPushToken(uid);
    let channel: 'push' | 'sms_infobip';
    try {
      channel = await decideChannelAndSend(sessionRef.id, phone, pushToken, code, 'connexion', 'login');
    } catch (err) {
      await sessionRef.update({ status: 'send_failed' });
      await logAuditEvent({ type: 'login_otp_rejected', sessionId: sessionRef.id, phone, ip, reason: 'send_failed' });
      throw err; // déjà un HttpsError('unavailable', 'SMS_SEND_FAILED') localisé côté client
    }

    await logAuditEvent({ type: 'login_otp_sent', sessionId: sessionRef.id, phone, ip, channel });

    return { sessionId: sessionRef.id, otpTtlSeconds: OTP_TTL_MS / 1000 };
  }
);

export const loginVerifyOtp = onCall(
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: true },
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
    const snap = await ref.get();
    if (!snap.exists) throwLocalized('not-found', 'SESSION_NOT_FOUND');
    const data = snap.data()!;

    // ⚠️ La session doit appartenir au MÊME utilisateur authentifié qui a
    // demandé le code — sans ce contrôle, un uid A authentifié pourrait
    // essayer de deviner/valider le sessionId d'un uid B.
    if (data.uid !== uid) throwLocalized('permission-denied', 'SESSION_NOT_FOUND');

    if (data.status === 'verified') {
      const customToken = await admin.auth().createCustomToken(uid);
      return { verified: true, customToken };
    }
    if (data.status !== 'pending') throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    if ((data.otpExpiresAt as FirebaseFirestore.Timestamp).toMillis() < Date.now()) {
      await ref.update({ status: 'expired' });
      await logAuditEvent({ type: 'login_otp_verify_failed', sessionId, phone: data.phone, reason: 'expired' });
      throwLocalized('deadline-exceeded', 'CODE_EXPIRED');
    }
    if (data.attempts >= data.maxAttempts) {
      await ref.update({ status: 'locked' });
      await logAuditEvent({ type: 'login_otp_verify_failed', sessionId, phone: data.phone, reason: 'locked' });
      throwLocalized('resource-exhausted', 'TOO_MANY_ATTEMPTS');
    }

    const ok = verifyOtpHash(code, sessionId, data.otpHash);
    if (!ok) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      await bumpRegistrationMetric('login_otp_invalid_code');
      throwLocalized('invalid-argument', `INVALID_CODE:${data.maxAttempts - data.attempts - 1}`);
    }

    await ref.update({ status: 'verified', otpHash: admin.firestore.FieldValue.delete() });
    await bumpRegistrationMetric('login_otp_verify_success');
    await logAuditEvent({ type: 'login_otp_verify_success', sessionId, phone: data.phone, accountId: uid });

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
