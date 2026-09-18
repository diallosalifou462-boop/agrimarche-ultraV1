'use client';

// ============================================================================
//  lib/firebase/appCheck.ts — App Check (anti-abus des Cloud Functions)
// ============================================================================
//
// App Check prouve à Google que l'appel vient BIEN de ton app, et pas d'un
// script. Sans lui, n'importe qui peut appeler tes functions et déclencher
// des SMS à tes frais.
//
// Il était activé côté serveur (`enforceAppCheck: true`) sur le mot de passe
// oublié alors qu'aucun jeton n'était jamais envoyé par l'app : tous les
// appels revenaient en 401 « app: MISSING ». Le serveur ne l'exige donc plus
// pour l'instant : on met d'abord l'app en règle, on vérifie dans la console
// que les jetons arrivent, ET SEULEMENT APRÈS on réactive l'exigence.
//
// Mise en route, dans l'ordre :
//  1. Console Firebase > App Check > enregistrer chaque app :
//       - Web      : reCAPTCHA v3 (récupérer la clé de site)
//       - iOS      : App Attest
//       - Android  : Play Integrity
//  2. Vercel : NEXT_PUBLIC_RECAPTCHA_SITE_KEY = la clé de site reCAPTCHA v3.
//  3. Natif : installer le plugin, puis refaire les builds
//       npm i @capacitor-firebase/app-check && npx cap sync
//  4. Vérifier dans Console > App Check > Métriques que les requêtes
//     « vérifiées » montent.
//  5. Alors seulement, remettre enforceAppCheck: true dans les functions
//     (registration.ts, passwordReset.ts, loginOtp.ts, orangeRegistration.ts).
//
// Tant que la clé n'est pas fournie, ce module ne fait RIEN : aucun risque de
// casser l'app.

import type { FirebaseApp } from 'firebase/app';

let started = false;

export async function initAppCheck(app: FirebaseApp): Promise<void> {
  if (started || typeof window === 'undefined') return;
  started = true;

  try {
    const { Capacitor } = await import('@capacitor/core');

    if (Capacitor.isNativePlatform()) {
      // iOS (App Attest) / Android (Play Integrity) via le plugin Capacitor.
      // Absent du projet tant que `npm i @capacitor-firebase/app-check` n'a
      // pas été fait : on sort sans bruit dans ce cas.
      try {
        const mod: any = await import(
          /* webpackIgnore: true */ '@capacitor-firebase/app-check'
        ).catch(() => null);
        if (!mod?.FirebaseAppCheck) return;
        await mod.FirebaseAppCheck.initialize({ isTokenAutoRefreshEnabled: true });
        console.log('[AppCheck] actif (natif)');
      } catch (err) {
        console.warn('[AppCheck] non initialisé sur natif :', err);
      }
      return;
    }

    // Web : reCAPTCHA v3.
    const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
    if (!siteKey) return; // pas encore configuré → on n'active rien

    const debugToken = process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN;
    if (debugToken) {
      // Jeton de debug pour localhost (à créer dans Console > App Check).
      (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
    }

    const { initializeAppCheck, ReCaptchaV3Provider } = await import('firebase/app-check');
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
    console.log('[AppCheck] actif (web)');
  } catch (err) {
    // Jamais bloquant : une erreur ici ne doit pas empêcher l'app de démarrer.
    console.warn('[AppCheck] initialisation ignorée :', err);
  }
}
