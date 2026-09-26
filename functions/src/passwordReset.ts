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
import { onCall, HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizePhoneSN, detectCarrier, phoneToSyntheticEmail } from './carrier';
import { getAccountIdForPhone } from './phoneUniqueness';
import { generateOtp, hashOtp, verifyOtpHash } from './otp';
import { checkAndConsumeRateLimit, RateLimitedError } from './rateLimit';
import { sendOtpSmsInfobip } from './smsInfobip';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
// ⚠️ FIX (26/09) : fenêtre de rejeu d'une session déjà 'verified' — voir
// resetPasswordVerifyOtp.
const REPLAY_WINDOW_MS = 10 * 60 * 1000;

function throwLocalized(httpsCode: FunctionsErrorCode, techCode: string): never {
  throw new HttpsError(httpsCode, techCode, { message: localizeError(techCode) });
}

// ⚠️ FIX (26/09) : envoi SMS local plutôt que decideChannelAndSend
// (otpChannel.ts). Celui-ci transforme TOUTE erreur en SMS_SEND_FAILED et
// perd donc la différence entre « échec certain » et « timeout » (SMS très
// probablement livré en retard). Mêmes noms de métriques qu'otpChannel
// (`reset_sent_sms`, `reset_send_failed_sms`) pour ne pas casser le
// dashboard admin, plus `reset_send_timeout_sms`.
// Renvoie 'timeout' au lieu de lever une erreur quand l'envoi a expiré.
async function sendResetSms(sessionId: string, phone: string, code: string): Promise<'sent' | 'timeout'> {
  try {
    await sendOtpSmsInfobip(phone, code, 'réinitialisation');
  } catch (err: any) {
    if (err?.message === 'SMS_SEND_TIMEOUT') {
      console.warn(`⏱️ Envoi SMS OTP en timeout (reset, session ${sessionId}) — session gardée active.`);
      await bumpRegistrationMetric('reset_send_timeout_sms');
      return 'timeout';
    }
    console.error(`❌ Échec envoi SMS OTP (reset, session ${sessionId})`);
    await bumpRegistrationMetric('reset_send_failed_sms');
    throw new HttpsError('unavailable', 'SMS_SEND_FAILED', { message: localizeError('SMS_SEND_FAILED') });
  }
  await bumpRegistrationMetric('reset_sent_sms');
  return 'sent';
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
  // enforceAppCheck: DÉSACTIVÉ (18/09) — aligné sur registrationStart.
  // Avec App Check activé ici, l'app iOS recevait un 401 « app: MISSING »
  // avant même d'entrer dans la function : « Une erreur est survenue » à
  // chaque mot de passe oublié. Les protections anti-abus restent en place
  // (limites par numéro et par IP, 5 essais max, expiration 5 min).
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: false },
  async (request) => {
    const phoneRaw = String(request.data?.phone ?? '');
    const phone = normalizePhoneSN(phoneRaw);
    // `pushToken`/`forceSms` : conservés dans le type de la requête pour ne
    // pas casser un client pas encore mis à jour, mais ignorés — voir
    // otpChannel.ts (TOUJOURS SMS Infobip, plus aucun essai push).
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

    // Toujours par SMS Infobip, directement — voir sendResetSms.
    const channel: 'sms_infobip' = 'sms_infobip';
    let sendResult: 'sent' | 'timeout';
    try {
      sendResult = await sendResetSms(sessionRef.id, phone, code);
    } catch (err) {
      await sessionRef.update({ status: 'send_failed' });
      throw err; // déjà un HttpsError('unavailable', 'SMS_SEND_FAILED') localisé côté client
    }
    // ⚠️ FIX (26/09) : en cas de timeout, la session reste 'pending' et on
    // répond comme un envoi réussi — le code arrive très probablement en
    // retard, et le déclarer « échoué » rendait ce code inutilisable.
    const smsMaybeDelayed = sendResult === 'timeout';

    await logAuditEvent({ type: 'reset_otp_sent', sessionId: sessionRef.id, phone, ip, channel, ...(smsMaybeDelayed ? { reason: 'sms_timeout' } : {}) });

    return { sessionId: sessionRef.id, channel, otpTtlSeconds: OTP_TTL_MS / 1000, ...(smsMaybeDelayed ? { smsMaybeDelayed: true } : {}) };
  }
);

export const resetPasswordVerifyOtp = onCall(
  // enforceAppCheck: DÉSACTIVÉ (18/09) — aligné sur registrationStart.
  // Avec App Check activé ici, l'app iOS recevait un 401 « app: MISSING »
  // avant même d'entrer dans la function : « Une erreur est survenue » à
  // chaque mot de passe oublié. Les protections anti-abus restent en place
  // (limites par numéro et par IP, 5 essais max, expiration 5 min).
  { region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: false },
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
      | { kind: 'verified' | 'replay'; uid: string; phone: string };

    const outcome = await admin.firestore().runTransaction(async (tx): Promise<VerifyOutcome> => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: 'fail', httpsCode: 'not-found', techCode: 'SESSION_NOT_FOUND' };
      const data = snap.data()!;

      if (data.status === 'verified') {
        // ⚠️ FIX (26/09) SÉCURITÉ : le rejeu (réponse réseau perdue après un
        // premier succès) renvoyait un customToken pour N'IMPORTE QUEL code,
        // sans limite de durée — le sessionId seul suffisait pour prendre
        // la main sur le compte. Désormais : seulement dans les 10 min
        // suivant la vérification ET avec le même code (hash conservé,
        // HMAC+pepper, comparaison à temps constant).
        const verifiedAtMs = (data.verifiedAt as FirebaseFirestore.Timestamp | undefined)?.toMillis() ?? 0;
        const storedHash = typeof data.verifiedCodeHash === 'string' ? data.verifiedCodeHash : '';
        if (!storedHash || Date.now() - verifiedAtMs > REPLAY_WINDOW_MS || !verifyOtpHash(code, sessionId, storedHash)) {
          return { kind: 'fail', httpsCode: 'failed-precondition', techCode: 'SESSION_NOT_ACTIVE' };
        }
        return { kind: 'replay', uid: data.uid as string, phone: data.phone as string };
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
      return { kind: 'verified', uid: data.uid as string, phone: data.phone as string };
    });

    if (outcome.kind === 'fail') {
      if (outcome.reason === 'expired' || outcome.reason === 'locked') {
        await logAuditEvent({ type: 'reset_otp_verify_failed', sessionId, phone: outcome.phone, reason: outcome.reason });
      }
      if (outcome.reason === 'invalid_code') {
        await bumpRegistrationMetric('reset_otp_invalid_code');
      }
      throwLocalized(outcome.httpsCode, outcome.techCode);
    }

    if (outcome.kind === 'verified') {
      await bumpRegistrationMetric('reset_otp_verify_success');
      await logAuditEvent({ type: 'reset_otp_verify_success', sessionId, phone: outcome.phone, accountId: outcome.uid });
    }

    // ⚠️ FIX (26/09) : un compte « téléphone seul » (sans email) recevait un
    // customToken, choisissait un nouveau mot de passe… qu'il ne pouvait
    // JAMAIS utiliser : la connexion retrouve le compte par EMAIL. On pose
    // donc l'email synthétique canonique AVANT de signer le jeton (le
    // jeton est ainsi émis après la modification). Un email réel déjà
    // présent n'est jamais remplacé.
    let authUser: admin.auth.UserRecord | null = null;
    try {
      authUser = await admin.auth().getUser(outcome.uid);
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found') {
        // Sans ce garde-fou, le customToken aurait créé un compte VIDE au
        // signInWithCustomToken côté client.
        await logAuditEvent({ type: 'reset_otp_verify_failed', sessionId, phone: outcome.phone, accountId: outcome.uid, reason: 'account_not_found' });
        throwLocalized('not-found', 'ACCOUNT_NOT_FOUND');
      }
      console.warn(`⚠️ Lecture du compte ${outcome.uid} impossible avant reset:`, err?.message || err);
    }
    if (authUser && !authUser.email && outcome.phone) {
      try {
        await admin.auth().updateUser(outcome.uid, { email: phoneToSyntheticEmail(outcome.phone) });
      } catch (err: any) {
        // Ex : email synthétique déjà pris par un AUTRE compte (doublon ou
        // squat). On ne bloque pas la réinitialisation, mais on trace pour
        // que l'admin puisse fusionner/réparer.
        console.error(`❌ Pose de l'email synthétique impossible (uid ${outcome.uid}):`, err?.code || err?.message || err);
        await logAuditEvent({ type: 'reset_otp_verify_failed', sessionId, phone: outcome.phone, accountId: outcome.uid, reason: `synthetic_email_not_set:${err?.code ?? 'unknown'}` });
      }
    }

    const customToken = await admin.auth().createCustomToken(outcome.uid);
    return { uid: outcome.uid, customToken };
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
