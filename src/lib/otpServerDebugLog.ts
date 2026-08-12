// src/lib/otpServerDebugLog.ts
//
// Pendant SERVEUR de otpDiagnostics.ts (client). Écrit dans la même
// famille de logs (collection séparée `otp_debug_logs_server` pour ne
// jamais mélanger source client/serveur), à chaque tentative reçue par
// /api/otp/send — succès ou échec, y compris les échecs Infobip.
//
// L'INTÉRÊT DE LA COMPARAISON avec otp_debug_logs (client) :
//   - Un log CLIENT "fetch_network_error" SANS log SERVEUR correspondant
//     au même moment → la requête n'a jamais atteint Vercel (réseau,
//     DNS, proxy, ATS, ou protection au niveau plateforme/CDN).
//   - Un log SERVEUR "infobip_rejected" ou "infobip_http_error" → la
//     requête est bien arrivée, Infobip a répondu, et a refusé/échoué
//     pour CE numéro précis (là on regarde le message d'erreur Infobip
//     lui-même, plus un souci réseau iOS).
//   - Un log SERVEUR "success" (SMS envoyé par Infobip) alors que le
//     client n'a jamais reçu la réponse (pas de log client "fetch_success"
//     dans la foulée) → le SMS est bien parti, mais la réponse HTTP n'est
//     jamais revenue jusqu'au téléphone (timeout réseau côté retour).
//
// Best-effort, non-bloquant : ne doit jamais faire échouer l'envoi réel.

import type { Firestore } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';

export type OtpServerStep =
  | 'received'
  | 'invalid_phone'
  | 'rate_limited'
  | 'infobip_success'
  | 'infobip_rejected'
  | 'infobip_http_error'
  | 'unexpected_error'
  | 'already_registered'
  | 'no_account_for_reset';

function maskPhone(phone: string): string {
  if (!phone) return '(vide)';
  return phone.length > 3 ? `***${phone.slice(-3)}` : phone;
}

export async function logOtpServerAttempt(
  db: Firestore,
  params: {
    step: OtpServerStep;
    phoneE164: string;
    httpStatusToClient: number;
    infobipStatus?: string;
    errorMessage?: string;
    durationMs?: number;
  }
): Promise<void> {
  const { step, phoneE164, httpStatusToClient, infobipStatus, errorMessage, durationMs } = params;
  try {
    await db.collection('otp_debug_logs_server').add({
      step,
      phoneMasked: maskPhone(phoneE164),
      httpStatusToClient,
      infobipStatus: infobipStatus ?? null,
      errorMessage: errorMessage ?? null,
      durationMs: durationMs ?? null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[otpServerDebugLog] Échec écriture log (ignoré):', err);
  }
}
