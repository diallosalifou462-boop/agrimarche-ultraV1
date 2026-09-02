// src/lib/otpDiagnostics.ts
//
// Journal AUTOMATIQUE de chaque tentative d'envoi d'OTP (register/login),
// envoyé au serveur (POST /api/diag/otp-log) qui l'écrit lui-même dans
// Firestore via le Admin SDK.
//
// ⚠️ Pourquoi passer par une route serveur plutôt qu'écrire directement
// depuis le client avec le SDK Firestore (comme la v1 de ce fichier) :
// le Admin SDK contourne TOUJOURS les règles de sécurité Firestore, donc
// cette approche ne nécessite AUCUNE modification de firestore.rules —
// pas de nouvelle collection à ouvrir en écriture publique.
//
// Compromis assumé : si le réseau est totalement coupé entre le
// téléphone et ce domaine, ce fetch échoue lui aussi (comme celui vers
// /api/otp/send) et rien n'est logué pour CET essai précis. Ce n'est pas
// grave : dans ce cas, l'utilisateur voit déjà le message d'erreur
// affiché à l'écran ("Connexion au serveur impossible...") — inutile
// d'un log pour savoir que rien n'est parti du tout. Ce qu'on veut
// capturer ici, c'est tout le reste : réponses d'erreur API, timeouts
// partiels, succès/échecs Infobip, incohérences client/serveur.
//
// Best-effort, non-bloquant, silencieux : un échec d'envoi de log ne
// doit jamais ralentir ni casser le flow d'inscription/connexion réel.

import { trace } from '@/lib/firebase/firebase';
import { apiUrl } from '@/lib/api-config';

export type OtpDiagStep =
  | 'fetch_start'
  | 'fetch_network_error'
  | 'fetch_api_error'
  | 'fetch_success'
  | 'fetch_bad_json';

export interface OtpDiagParams {
  flow: 'register' | 'login' | 'resend';
  step: OtpDiagStep;
  phoneE164: string;
  carrier: string;
  httpStatus?: number;
  errorMessage?: string;
  durationMs?: number;
}

/** Masque tout sauf les 3 derniers chiffres (suffisant pour recouper avec les logs serveur, sans exposer le numéro complet). */
function maskPhone(phone: string): string {
  if (!phone) return '(vide)';
  return phone.length > 3 ? `***${phone.slice(-3)}` : phone;
}

export function logOtpAttempt(params: OtpDiagParams): void {
  const { flow, step, phoneE164, carrier, httpStatus, errorMessage, durationMs } = params;

  // Toujours logué en console/trace aussi (gratuit, utile si le Mac est dispo).
  trace('otp-diag', `${flow}/${step}`, { carrier, httpStatus, errorMessage, durationMs });

  const payload = {
    flow,
    step,
    phoneMasked: maskPhone(phoneE164),
    carrier,
    platform: typeof window !== 'undefined' ? (window as any).Capacitor?.getPlatform?.() ?? 'web' : 'unknown',
    httpStatus: httpStatus ?? null,
    errorMessage: errorMessage ?? null,
    durationMs: durationMs ?? null,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
  };

  // Fire-and-forget : on ne fait jamais `await` ce log dans le flow
  // appelant, pour ne jamais ralentir l'UX réelle. `sendBeacon` (quand
  // disponible) survit même si la page/vue change juste après ; sinon
  // repli sur un `fetch` classique.
  try {
    const url = apiUrl('/api/diag/otp-log');
    const body = JSON.stringify(payload);
    const sentViaBeacon =
      typeof navigator !== 'undefined' &&
      typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));

    if (!sentViaBeacon) {
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch((err) => {
        // Best-effort : on ne logue même pas cette erreur en console pour
        // éviter du bruit — le but de ce fichier est justement de ne
        // jamais interférer avec le flow réel.
        void err;
      });
    }
  } catch {
    // idem : jamais bloquant.
  }
}
