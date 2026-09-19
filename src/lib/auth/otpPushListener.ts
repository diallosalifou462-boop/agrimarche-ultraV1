// ============================================================
//   otpPushListener.ts — Réception du code OTP envoyé par
//   notification push, pour remplissage et validation AUTOMATIQUES.
//
//   But : « j'appuie sur Envoyer → la notification arrive → le compte
//   se crée → je suis dans l'application », sans jamais taper le code.
//
//   Pourquoi un module dédié plutôt que useFCMToken.onMessageReceived :
//   1. useFCMToken ne branchait son écouteur natif que si un utilisateur
//      était DÉJÀ connecté (`if (!isNative || !user) return`). Or pendant
//      l'inscription il n'y a précisément aucun utilisateur : l'écouteur
//      n'existait jamais et le code reçu ne pouvait pas être lu.
//   2. onMessageReceived() teste `isSupportedBrowser`, un état React
//      rempli de façon asynchrone. Un abonnement au montage tombait donc
//      sur `false` et renvoyait un no-op silencieux.
//   3. Ce module ne dépend d'AUCUN état React : il détecte la plateforme
//      au moment de l'appel. Impossible de le prendre de vitesse.
//
//   Sécurité : le code n'est lu que depuis le data payload d'un push
//   envoyé à CET appareil, celui qui a demandé l'inscription. Il est
//   déjà affiché en clair dans le corps de la notification, sur l'écran
//   verrouillé du même téléphone : aucune exposition nouvelle.
// ============================================================

import { pushDiag } from '@/lib/pushDiagnostics';

/** Types de push qui transportent un code de vérification. */
const OTP_PUSH_TYPES = new Set(['registration_otp', 'login_otp', 'reset_otp']);

export type OtpPushEvent = {
  /** Code à 6 chiffres extrait du data payload. */
  code: string;
  /** Type de flux (registration_otp, login_otp…). */
  type: string;
  /** Session concernée, quand le serveur la transmet. */
  sessionId?: string;
  /** true si l'utilisateur a appuyé sur la notification (app en fond). */
  fromTap: boolean;
};

function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean((window as any).Capacitor?.isNativePlatform?.());
}

/**
 * Extrait un code OTP d'un data payload de notification.
 * Renvoie null si ce push n'en transporte pas (notification métier
 * ordinaire : promotion, commande, baisse de prix…).
 */
export function extractOtpFromPushData(
  data: Record<string, unknown> | null | undefined,
  opts: { fromTap?: boolean; expectedType?: string } = {},
): OtpPushEvent | null {
  if (!data) return null;
  const type = typeof data.type === 'string' ? data.type : '';
  if (!OTP_PUSH_TYPES.has(type)) return null;
  if (opts.expectedType && type !== opts.expectedType) return null;

  // Le data payload FCM est toujours transporté en chaînes de caractères,
  // même quand le serveur y a mis un nombre : on normalise.
  const code = String(data.code ?? '').replace(/\D/g, '');
  if (code.length !== 6) return null;

  const sessionId = typeof data.sessionId === 'string' ? data.sessionId : undefined;
  return { code, type, sessionId, fromTap: opts.fromTap === true };
}

/**
 * Écoute les notifications porteuses d'un code OTP et appelle `onCode`
 * dès qu'un code arrive — que l'app soit au premier plan (la notification
 * est reçue directement) ou en arrière-plan (l'utilisateur appuie sur la
 * notification, ce qui ramène l'app avec le payload).
 *
 * @param onCode    appelé avec le code reçu. Appelé une seule fois par code.
 * @param expected  restreint l'écoute à un seul type (ex. 'registration_otp').
 * @returns         fonction de désabonnement, sûre à appeler plusieurs fois.
 */
export function listenForOtpPush(
  onCode: (event: OtpPushEvent) => void,
  expected?: string,
): () => void {
  if (typeof window === 'undefined') return () => {};

  let cancelled = false;
  const cleanups: Array<() => void> = [];
  // Un même code peut arriver deux fois (réception au premier plan PUIS
  // appui sur la notification restée affichée). On ne le traite qu'une fois.
  const seen = new Set<string>();

  const deliver = (raw: Record<string, unknown> | null | undefined, fromTap: boolean) => {
    if (cancelled) return;
    const event = extractOtpFromPushData(raw, { fromTap, expectedType: expected });
    if (!event) return;
    const fingerprint = `${event.type}:${event.sessionId ?? ''}:${event.code}`;
    if (seen.has(fingerprint)) return;
    seen.add(fingerprint);
    pushDiag(
      'received',
      'ok',
      fromTap
        ? 'Code reçu en appuyant sur la notification'
        : 'Code reçu par notification (app ouverte)',
    );
    try {
      onCode(event);
    } catch (err) {
      console.error('[OTP push] Traitement du code reçu a échoué :', err);
    }
  };

  if (isNativePlatform()) {
    (async () => {
      try {
        const { FirebaseMessaging } = await import('@capacitor-firebase/messaging');

        // App au premier plan : la notification arrive directement ici.
        const received = await FirebaseMessaging.addListener(
          'notificationReceived',
          (event: any) => deliver(event?.notification?.data, false),
        );
        // App en arrière-plan ou fermée : l'utilisateur appuie sur la
        // notification, l'app revient avec le payload.
        const tapped = await FirebaseMessaging.addListener(
          'notificationActionPerformed',
          (event: any) => deliver(event?.notification?.data, true),
        );

        if (cancelled) {
          received.remove?.();
          tapped.remove?.();
        } else {
          cleanups.push(() => received.remove?.());
          cleanups.push(() => tapped.remove?.());
        }
      } catch (err) {
        console.warn('[OTP push] Écoute native indisponible :', err);
      }
    })();
  } else {
    (async () => {
      try {
        const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
        if (!(await isSupported().catch(() => false)) || cancelled) return;
        const unsubscribe = onMessage(getMessaging(), (payload) =>
          deliver(payload.data as Record<string, unknown> | undefined, false),
        );
        if (cancelled) unsubscribe();
        else cleanups.push(unsubscribe);
      } catch (err) {
        console.warn('[OTP push] Écoute web indisponible :', err);
      }
    })();
  }

  return () => {
    cancelled = true;
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {
        /* désabonnement best-effort */
      }
    }
  };
}
