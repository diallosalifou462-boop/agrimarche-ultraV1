// ============================================================
//   pushDiagnostics.ts — Journal de diagnostic du push OTP, affiché
//   à l'écran par components/PushDiagnosticPanel.tsx.
//
//   Chaque étape (plateforme, permission, token, envoi serveur,
//   réception) est notée ici. analyzePushDiag() lit ces étapes et
//   produit un verdict en français : où ça bloque + quoi faire.
//
//   Activation : NEXT_PUBLIC_PUSH_DEBUG=1 au build, OU
//   localStorage.setItem('agrimarche_push_debug', '1').
//   ⚠️ À désactiver pour la version publiée sur les stores.
// ============================================================

export type DiagLevel = 'ok' | 'info' | 'warn' | 'error';

export type DiagKey =
  | 'platform'
  | 'permission'
  | 'token'
  | 'token_error'
  | 'local_save'
  | 'firestore_save'
  | 'carrier'
  | 'send_token'
  | 'server'
  | 'received';

export interface DiagStep {
  t: number;
  key: DiagKey;
  level: DiagLevel;
  label: string;
  detail?: string;
}

// Renvoyé par registrationStart / registrationResend (functions/src/registration.ts)
export interface ServerPushDiag {
  tokenReceived: boolean;
  pushAttempted: boolean;
  pushOk: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
}

const DEBUG_FLAG_KEY = 'agrimarche_push_debug';
const steps: DiagStep[] = [];
const listeners = new Set<(s: DiagStep[]) => void>();
const startedAt = Date.now();

export function isPushDebugEnabled(): boolean {
  // Toujours visible en local (npm run dev), sans dépendre du .env.
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.NEXT_PUBLIC_PUSH_DEBUG === '1') return true;
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(DEBUG_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

export function pushDiag(key: DiagKey, level: DiagLevel, label: string, detail?: unknown) {
  const d =
    detail === undefined ? undefined : typeof detail === 'string' ? detail : safeStringify(detail);
  const step: DiagStep = { t: Date.now() - startedAt, key, level, label, detail: d };
  steps.push(step);
  if (steps.length > 200) steps.shift();
  const icon = { ok: '✅', info: 'ℹ️', warn: '⚠️', error: '❌' }[level];
  console.log(`[PushDiag] ${icon} ${label}${d ? ` — ${d}` : ''}`);
  listeners.forEach((l) => l([...steps]));
}

export function subscribePushDiag(cb: (s: DiagStep[]) => void): () => void {
  listeners.add(cb);
  cb([...steps]);
  return () => listeners.delete(cb);
}

export function clearPushDiag() {
  steps.length = 0;
  listeners.forEach((l) => l([]));
}

export function maskToken(t?: string | null): string {
  if (!t) return '(aucun)';
  return `${t.slice(0, 10)}…${t.slice(-6)} (${t.length} car.)`;
}

function safeStringify(v: unknown): string {
  if (v instanceof Error) return v.message;
  const anyV = v as any;
  if (anyV?.message) return String(anyV.code ? `${anyV.code}: ${anyV.message}` : anyV.message);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// ─── Explications ────────────────────────────────────────────

export interface Explanation {
  problem: string;
  fix: string;
}

// Erreurs renvoyées par getToken() CÔTÉ APPAREIL.
export function explainClientTokenError(msg: string): Explanation {
  const m = msg.toLowerCase();
  if (/not implemented|unimplemented|not available|cannot find module/.test(m))
    return {
      problem: "Le plugin @capacitor-firebase/messaging n'est pas présent dans l'app native.",
      fix: 'npm i @capacitor-firebase/messaging, puis npx cap sync, puis reconstruire l’APK/IPA.',
    };
  if (/apns/.test(m))
    return {
      problem: "iOS n'a pas fourni de token APNs, donc Firebase ne peut pas créer de token FCM.",
      fix: "Xcode : capability « Push Notifications » + Background Modes « Remote notifications ». Firebase Console : clé APNs (.p8) chargée. Tester sur un vrai iPhone (pas le simulateur).",
    };
  if (/service_not_available|missing_instanceid|play services/.test(m))
    return {
      problem: 'Google Play Services indisponible ou pas de réseau sur le téléphone.',
      fix: 'Vérifier la connexion internet et que Google Play Services est à jour (les émulateurs sans Play Store ne reçoivent pas de push).',
    };
  if (/fis_auth_error|installations|api key|api-key|403/.test(m))
    return {
      problem: 'Firebase refuse l’appareil : configuration Firebase incorrecte.',
      fix: 'Vérifier que google-services.json / GoogleService-Info.plist viennent du MÊME projet Firebase que les functions, et que la clé API n’a pas de restriction qui bloque « Firebase Installations API ».',
    };
  if (/vapid|token-subscribe-failed|applicationserverkey/.test(m))
    return {
      problem: 'Clé VAPID web absente ou incorrecte.',
      fix: 'Renseigner NEXT_PUBLIC_VAPID_KEY avec la clé « Web Push certificates » de Firebase Console > Cloud Messaging.',
    };
  if (/service ?worker|serviceworker/.test(m))
    return {
      problem: 'Le service worker web ne s’est pas enregistré.',
      fix: 'Vérifier que /sw.js existe, est servi en HTTPS, et importe firebase-messaging.',
    };
  return {
    problem: `getToken() a échoué : ${msg}`,
    fix: 'Copier ce diagnostic et chercher ce message exact dans la doc @capacitor-firebase/messaging.',
  };
}

// Erreurs renvoyées par admin.messaging().send() CÔTÉ SERVEUR.
export function explainFcmServerError(code?: string | null, message?: string | null): Explanation {
  switch (code) {
    case 'messaging/registration-token-not-registered':
      return {
        problem: 'Token périmé : l’app a été réinstallée, ses données effacées, ou le token vient d’un ancien build.',
        fix: 'Fermer/rouvrir l’app pour régénérer le token (le bouton « Effacer le token » du panneau force un nouveau token).',
      };
    case 'messaging/invalid-registration-token':
    case 'messaging/invalid-argument':
      return {
        problem: 'Token invalide : souvent un token APNs brut au lieu d’un token FCM, ou un token tronqué.',
        fix: 'Utiliser uniquement FirebaseMessaging.getToken() (pas @capacitor/push-notifications) pour obtenir le token.',
      };
    case 'messaging/mismatched-credential':
    case 'messaging/sender-id-mismatch':
      return {
        problem: 'Le token a été créé par un AUTRE projet Firebase que celui des Cloud Functions.',
        fix: 'Comparer le project_id de google-services.json / GoogleService-Info.plist avec celui de firebase use. Ils doivent être identiques.',
      };
    case 'messaging/third-party-auth-error':
    case 'messaging/invalid-apns-credentials':
      return {
        problem: 'Apple refuse l’envoi : clé APNs absente ou incorrecte dans Firebase.',
        fix: 'Firebase Console > Paramètres > Cloud Messaging > Apple : charger la clé .p8 avec le bon Key ID et Team ID.',
      };
    case 'messaging/authentication-error':
    case 'app/invalid-credential':
      return {
        problem: 'Les Cloud Functions n’ont pas le droit d’utiliser FCM.',
        fix: 'Google Cloud Console : activer « Firebase Cloud Messaging API (V1) » et vérifier le rôle du compte de service des functions.',
      };
    case 'messaging/quota-exceeded':
    case 'messaging/server-unavailable':
    case 'messaging/internal-error':
      return {
        problem: 'Problème temporaire côté Firebase.',
        fix: 'Réessayer dans quelques minutes.',
      };
    default:
      return {
        problem: `Échec d’envoi FCM : ${code || 'code inconnu'}${message ? ` (${message})` : ''}`,
        fix: 'Voir les logs Cloud Functions (« Échec envoi push OTP ») pour le détail complet.',
      };
  }
}

// ─── Verdict global ──────────────────────────────────────────

export interface Verdict {
  level: 'ok' | 'warn' | 'error' | 'pending';
  title: string;
  explanation?: Explanation;
}

function last(all: DiagStep[], key: DiagKey) {
  for (let i = all.length - 1; i >= 0; i--) if (all[i].key === key) return all[i];
  return undefined;
}

export function analyzePushDiag(all: DiagStep[], serverDiag: ServerPushDiag | null): Verdict {
  const carrier = last(all, 'carrier');
  if (carrier && carrier.detail !== 'free' && carrier.detail !== 'expresso')
    return {
      level: 'warn',
      title: `Opérateur ${carrier.detail} : le push n’est pas utilisé`,
      explanation: {
        problem: 'Seuls Free/Yas et Expresso passent par le backend avec push. Les autres numéros (Orange…) utilisent Firebase Phone Auth, qui envoie toujours un SMS Google.',
        fix: 'Tester avec un numéro Free/Yas ou Expresso pour vérifier le push.',
      },
    };

  if (last(all, 'permission')?.level === 'error')
    return {
      level: 'error',
      title: 'Notifications refusées sur ce téléphone',
      explanation: {
        problem: 'L’utilisateur (ou le système) a refusé la permission de notifications.',
        fix: 'Réglages du téléphone > Applications > SunuMëñëf > Notifications : autoriser. Puis relancer l’app.',
      },
    };

  const tokenErr = last(all, 'token_error');
  const token = last(all, 'token');
  if (tokenErr && (!token || tokenErr.t > token.t))
    return { level: 'error', title: 'Le téléphone n’a pas obtenu de token push', explanation: explainClientTokenError(tokenErr.detail || '') };

  if (serverDiag) {
    if (!serverDiag.tokenReceived)
      return {
        level: 'error',
        title: 'Aucun token envoyé au serveur → SMS',
        explanation: {
          problem: 'Au moment d’envoyer le code, aucun token n’était disponible sur l’appareil.',
          fix: 'Regarder les étapes « Permission » et « Token » ci-dessous : l’une d’elles n’a pas abouti avant l’envoi.',
        },
      };
    if (!serverDiag.pushOk)
      return { level: 'error', title: 'Le serveur a reçu le token mais FCM a refusé l’envoi → SMS', explanation: explainFcmServerError(serverDiag.errorCode, serverDiag.errorMessage) };
    if (last(all, 'received'))
      return { level: 'ok', title: 'Tout fonctionne : push envoyé ET reçu par l’appareil' };
    return {
      level: 'warn',
      title: 'Push accepté par FCM, pas encore reçu par l’app',
      explanation: {
        problem: 'Firebase a bien accepté le message. S’il n’apparaît pas, c’est l’appareil qui ne l’affiche pas.',
        fix: 'App ouverte : ajouter presentationOptions ["alert","sound"] à FirebaseMessaging dans capacitor.config. Android : désactiver l’optimisation de batterie pour l’app. Attendre 30 s (réseau lent).',
      },
    };
  }

  if (token) return { level: 'pending', title: 'Token prêt — envoie le code pour tester le serveur' };
  return { level: 'pending', title: 'En attente du token push…' };
}
