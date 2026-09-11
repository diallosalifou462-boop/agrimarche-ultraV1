// ============================================================
//   passwordReset.ts — Réinitialisation de mot de passe, UNIQUEMENT
//   pour Free/Yas et Expresso (Orange repasse par Firebase Phone Auth
//   nativement, comme à l'inscription et au login — voir
//   orangeRegistration.ts et loginOtp.ts).
//
//   Différence structurante avec l'inscription (registration.ts) :
//   ici le numéro DOIT déjà appartenir à un compte existant
//   (phoneIndex/{phone}.accountId) — exactement l'inverse de
//   registrationStart, qui refuse au contraire un numéro déjà pris.
//
//   Le client n'est PAS authentifié à cet instant (c'est justement le
//   mot de passe oublié) : /verify renvoie un customToken, à utiliser
//   côté client avec signInWithCustomToken() PUIS updatePassword()
//   (SDK client, pas ici) — voir app/auth/forgot-password/page.tsx.
//   Aucun nouveau mot de passe ne transite donc par cette fonction.
// ============================================================
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizePhoneSN, detectCarrier } from './carrier';
import { getAccountIdForPhone } from './phoneUniqueness';
import { generateOtp, hashOtp, verifyOtpHash } from './otp';
import { checkAndConsumeRateLimit, RateLimitedError } from './rateLimit';
import { decideChannelAndSend, getMostRecentPushToken } from './otpChannel';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;

function throwLocalized(httpsCode: Parameters<typeof HttpsError>[0], techCode: string): never {
  throw new HttpsError(httpsCode, techCode, { message: localizeError(techCode) });
}

function sessionsCol() {
  return admin.firestore().collection('passwordResetSessions');
}

function clientIp(rawRequest: any): string {
  return (
    rawRequest?.ip ||
    (rawRequest?.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export const resetPasswordSendOtp = onCall(
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true },
  async (request) => {
    const phoneRaw = String(request.data?.phone ?? '');
    const phone = normalizePhoneSN(phoneRaw);
    if (!phone) throwLocalized('invalid-argument', 'INVALID_PHONE');

    const ip = clientIp(request.rawRequest);
    try {
      // Plafonds volontairement identiques à registrationStart : même
      // profil d'abus possible (spam SMS sur un numéro tiers), même
      // défense.
      await checkAndConsumeRateLimit(`reset:phone:${phone}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
      await checkAndConsumeRateLimit(`reset:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      throw err;
    }

    const carrier = await detectCarrier(phone);
    if (carrier === 'orange') {
      // Cohérent avec registrationStart : Orange ne passe jamais par ce
      // backend — le frontend doit rediriger vers Firebase Phone Auth
      // (déjà le cas dans forgot-password/page.tsx via detectCarrier()).
      throwLocalized('failed-precondition', 'ORANGE_USE_FIREBASE_AUTH');
    }

    const uid = await getAccountIdForPhone(phone);
    if (!uid) {
      await logAuditEvent({ type: 'reset_otp_rejected', phone, ip, reason: 'account_not_found' });
      throwLocalized('not-found', 'ACCOUNT_NOT_FOUND');
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

    // Le compte existe déjà (vérifié juste au-dessus via uid) : on va
    // chercher un token push déjà enregistré pour lui, même si
    // l'utilisateur n'est plus authentifié sur CETTE session (mot de
    // passe oublié) — voir otpChannel.ts.
    const pushToken = await getMostRecentPushToken(uid);
    let channel: 'push' | 'sms_infobip';
    try {
      channel = await decideChannelAndSend(sessionRef.id, phone, pushToken, code, 'réinitialisation', 'reset');
    } catch (err) {
      await sessionRef.update({ status: 'send_failed' });
      throw err; // déjà un HttpsError('unavailable', 'SMS_SEND_FAILED') localisé côté client
    }

    await logAuditEvent({ type: 'reset_otp_sent', sessionId: sessionRef.id, phone, ip, channel });

    return { sessionId: sessionRef.id, otpTtlSeconds: OTP_TTL_MS / 1000 };
  }
);

export const resetPasswordVerifyOtp = onCall(
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: true },
  async (request) => {
    const sessionId = String(request.data?.sessionId ?? '');
    const code = String(request.data?.code ?? '');
    if (!sessionId || !code) throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');

    try {
      await checkAndConsumeRateLimit(`reset_verify:${sessionId}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
    } catch (err) {
      if (err instanceof RateLimitedError) throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
      throw err;
    }

    const ref = sessionsCol().doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists) throwLocalized('not-found', 'SESSION_NOT_FOUND');
    const data = snap.data()!;

    if (data.status === 'verified') {
      // Rejouable : le client peut avoir perdu la réponse réseau après un
      // premier succès (retry). On renvoie un nouveau customToken plutôt
      // que d'échouer, tant que la session existe encore.
      const customToken = await admin.auth().createCustomToken(data.uid as string);
      return { uid: data.uid, customToken };
    }
    if (data.status !== 'pending') throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    if ((data.otpExpiresAt as FirebaseFirestore.Timestamp).toMillis() < Date.now()) {
      await ref.update({ status: 'expired' });
      await logAuditEvent({ type: 'reset_otp_verify_failed', sessionId, phone: data.phone, reason: 'expired' });
      throwLocalized('deadline-exceeded', 'CODE_EXPIRED');
    }
    if (data.attempts >= data.maxAttempts) {
      await ref.update({ status: 'locked' });
      await logAuditEvent({ type: 'reset_otp_verify_failed', sessionId, phone: data.phone, reason: 'locked' });
      throwLocalized('resource-exhausted', 'TOO_MANY_ATTEMPTS');
    }

    const ok = verifyOtpHash(code, sessionId, data.otpHash);
    if (!ok) {
      await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
      await bumpRegistrationMetric('reset_otp_invalid_code');
      throwLocalized('invalid-argument', `INVALID_CODE:${data.maxAttempts - data.attempts - 1}`);
    }

    await ref.update({ status: 'verified', otpHash: admin.firestore.FieldValue.delete() });
    await bumpRegistrationMetric('reset_otp_verify_success');
    await logAuditEvent({ type: 'reset_otp_verify_success', sessionId, phone: data.phone, accountId: data.uid });

    const customToken = await admin.auth().createCustomToken(data.uid as string);
    return { uid: data.uid, customToken };
  }
);

// Purge quotidienne, même logique que purgeOldRegistrationSessions
// (registration.ts) — évite que la collection grossisse indéfiniment.
export async function purgeOldPasswordResetSessions(olderThanMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
  const snap = await sessionsCol().where('createdAt', '<', cutoff).limit(400).get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}
