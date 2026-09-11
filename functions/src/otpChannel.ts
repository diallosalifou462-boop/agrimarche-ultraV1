// ============================================================
//   otpChannel.ts — Choix du canal d'envoi OTP (push d'abord, SMS
//   Infobip en secours), factorisé pour être partagé entre
//   registration.ts, loginOtp.ts et passwordReset.ts.
//
//   Avant ce fichier, seul registration.ts avait cette logique
//   (voir son decideChannelAndSend interne) : loginOtp.ts et
//   passwordReset.ts envoyaient TOUJOURS par SMS Infobip, sans
//   jamais essayer le push, même quand un token existait déjà pour
//   ce compte. Une panne/mauvaise config Infobip cassait donc ces
//   deux parcours sans jamais toucher l'inscription.
//
//   Différence avec le decideChannelAndSend original de
//   registration.ts : celui-ci demandait un pushToken FOURNI PAR LE
//   CLIENT (capté avant même la création du compte, via
//   deviceTokens/{token} — voir useFCMToken.ts / migratePendingFcmToken
//   côté frontend). Ici, pour login et reset, le compte existe déjà :
//   on va donc chercher nous-mêmes le token le plus récent déjà
//   enregistré sur users/{uid}/tokens (écrit par
//   registerNotificationToken dans AuthContext.tsx), sans exiger un
//   changement du frontend.
// ============================================================
import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';
import { sendOtpSmsInfobip } from './smsInfobip';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

export type OtpChannel = 'push' | 'sms_infobip';

// Le token le plus récent d'un compte déjà existant (login, reset).
// Best-effort : une erreur de lecture Firestore ne doit jamais bloquer
// l'envoi du code, seulement le faire retomber sur SMS.
export async function getMostRecentPushToken(uid: string): Promise<string | undefined> {
  try {
    const snap = await admin
      .firestore()
      .collection('users')
      .doc(uid)
      .collection('tokens')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    return snap.docs[0]?.id;
  } catch (err) {
    console.warn(`⚠️ Lecture token push impossible pour ${uid}, fallback SMS:`, err);
    return undefined;
  }
}

// Envoie le code par push si un token est fourni, sinon par SMS
// Infobip. `metricPrefix` distingue les métriques par parcours
// (ex: 'login', 'reset', 'registration') tout en gardant les mêmes
// noms de suffixe ('_sent_push', '_send_failed_sms', etc.) que
// registration.ts pour rester lisible dans le dashboard admin.
export async function decideChannelAndSend(
  sessionId: string,
  phone: string,
  pushToken: string | undefined,
  code: string,
  purpose: 'confirmation' | 'connexion' | 'réinitialisation',
  metricPrefix: string,
): Promise<OtpChannel> {
  const channel: OtpChannel = pushToken ? 'push' : 'sms_infobip';

  if (channel === 'push') {
    try {
      await admin.messaging().send({
        token: pushToken!,
        notification: {
          title: 'AgriMarché',
          body: `Votre code de ${purpose} AgriMarché est : ${code}. Ce code expire dans 5 minutes.`,
        },
        data: { type: `${metricPrefix}_otp`, sessionId },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
      });
      await bumpRegistrationMetric(`${metricPrefix}_sent_push`);
      return 'push';
    } catch (err: any) {
      // ⚠️ Ne PAS abandonner ici : un token existe mais peut être
      // périmé (désinstallation, changement d'appareil...). On retombe
      // sur SMS plutôt que d'échouer l'envoi du code entièrement —
      // exactement le même filet que si aucun token n'avait existé.
      console.error(`❌ Échec envoi push OTP (${metricPrefix}, session ${sessionId}):`, err?.code || err);
      await bumpRegistrationMetric(`${metricPrefix}_send_failed_push`);
      // tombe dans le bloc SMS ci-dessous
    }
  }

  try {
    await sendOtpSmsInfobip(phone, code, purpose);
  } catch (err) {
    await bumpRegistrationMetric(`${metricPrefix}_send_failed_sms`);
    // ⚠️ Toujours passer `details.message` : c'est ce champ que lit
    // registrationActions.ts côté front (toActionError). Sans lui, le
    // client retombe sur son texte générique "Une erreur est survenue.
    // Réessaie." — exactement le symptôme observé sur le numéro 70.
    throw new HttpsError('unavailable', 'SMS_SEND_FAILED', { message: localizeError('SMS_SEND_FAILED') });
  }
  await bumpRegistrationMetric(`${metricPrefix}_sent_sms`);
  return 'sms_infobip';
}
