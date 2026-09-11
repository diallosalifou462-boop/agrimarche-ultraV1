// ============================================================
//   audit.ts — Journal d'audit append-only du parcours
//   d'inscription. Distinct de registrationSessions (qui, lui, est
//   MUTABLE et sert à faire tourner la logique) : ce journal ne
//   sert qu'à reconstituer a posteriori "qui a fait quoi, quand,
//   avec quel résultat" — utile pour une investigation fraude,
//   un support client, ou un audit de sécurité.
//
//   ⚠️ Ne jamais écrire le code OTP ici, même en cas d'échec —
//   mêmes règles que pour les logs serveur (section 4).
// ============================================================
import * as admin from 'firebase-admin';

export type AuditEventType =
  | 'start'
  | 'start_rejected'
  | 'resend'
  | 'resend_rejected'
  | 'verify_success'
  | 'verify_failed'
  | 'verify_expired'
  | 'verify_locked'
  | 'account_created'
  | 'account_creation_failed'
  | 'fraud_flagged'
  // Login (2ᵉ facteur, voir loginOtp.ts)
  | 'login_otp_sent'
  | 'login_otp_rejected'
  | 'login_otp_verify_success'
  | 'login_otp_verify_failed'
  // Réinitialisation de mot de passe (voir passwordReset.ts)
  | 'reset_otp_sent'
  | 'reset_otp_rejected'
  | 'reset_otp_verify_success'
  | 'reset_otp_verify_failed';

export interface AuditEvent {
  type: AuditEventType;
  sessionId?: string;
  phone?: string; // conservé pour l'investigation — pas de code OTP, jamais
  carrier?: string;
  channel?: string;
  ip?: string;
  reason?: string;
  accountId?: string;
}

export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await admin.firestore().collection('registrationAuditLog').add({
      ...event,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // L'audit ne doit jamais faire échouer le parcours utilisateur —
    // un défaut d'écriture ici est une dégradation silencieuse
    // acceptable, pas une raison de bloquer une inscription légitime.
    console.error('⚠️ Échec écriture audit log:', err);
  }
}
