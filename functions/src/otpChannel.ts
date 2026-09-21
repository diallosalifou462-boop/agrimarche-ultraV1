// ============================================================
//   otpChannel.ts — Envoi du code OTP, factorisé pour être partagé
//   entre registration.ts (via son propre wrapper, voir plus bas),
//   loginOtp.ts et passwordReset.ts.
//
//   ⚠️ HISTORIQUE (jusqu'au 21/09) : ce fichier essayait d'abord une
//   notification push (FCM) avant de retomber sur SMS Infobip. Décision
//   produit du 20/09 : on abandonne complètement le push pour Free/Yas
//   et Expresso — l'expérience utilisateur doit primer sur l'archi
//   déjà en place, et le push ajoutait un aller-retour FCM (avec ses
//   propres échecs silencieux : token périmé, canal Android mal
//   configuré, capacité iOS manquante...) avant même d'arriver au SMS,
//   qui est le seul canal qui marche de façon fiable et vérifiable.
//   Le canal est désormais TOUJOURS 'sms_infobip', pour l'inscription
//   comme pour la connexion et la réinitialisation — les trois
//   parcours utilisent maintenant exactement le même chemin.
// ============================================================
import { HttpsError } from 'firebase-functions/v2/https';
import { sendOtpSmsInfobip } from './smsInfobip';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

export type OtpChannel = 'sms_infobip';

// Envoie le code par SMS Infobip. `metricPrefix` distingue les
// métriques par parcours (ex: 'login', 'reset', 'registration') tout
// en gardant les mêmes noms de suffixe ('_sent_sms', '_send_failed_sms')
// pour rester lisible dans le dashboard admin.
export async function decideChannelAndSend(
  sessionId: string,
  phone: string,
  code: string,
  purpose: 'confirmation' | 'connexion' | 'réinitialisation',
  metricPrefix: string,
): Promise<OtpChannel> {
  try {
    await sendOtpSmsInfobip(phone, code, purpose);
  } catch (err: any) {
    // Le détail réel (statut HTTP Infobip / erreur réseau) est déjà
    // journalisé par sendOtpSmsInfobip lui-même — on ne le duplique pas
    // ici, on se contente de tracer le contexte (parcours + session).
    console.error(`❌ Échec envoi SMS OTP (${metricPrefix}, session ${sessionId})`);
    await bumpRegistrationMetric(`${metricPrefix}_send_failed_sms`);
    // ⚠️ Toujours passer `details.message` : c'est ce champ que lit
    // registrationActions.ts côté front (toActionError). Sans lui, le
    // client retombe sur son texte générique "Une erreur est survenue.
    // Réessaie."
    throw new HttpsError('unavailable', 'SMS_SEND_FAILED', { message: localizeError('SMS_SEND_FAILED') });
  }
  await bumpRegistrationMetric(`${metricPrefix}_sent_sms`);
  return 'sms_infobip';
}
