// lib/api-config.ts
//
// Depuis l'étape 3, les routes API (app/api/...) ne sont plus incluses dans
// le build mobile Capacitor — elles restent hébergées sur Vercel. L'app
// mobile doit donc les appeler via une URL absolue plutôt qu'un chemin
// relatif comme '/api/...' (qui ne pointe vers rien une fois l'app chargée
// localement sur le téléphone).
//
// Le site web (déployé sur Vercel) continue de fonctionner normalement avec
// ces mêmes chemins, puisqu'il est servi depuis ce même domaine.
//
// En dev local (npm run dev sur localhost), on utilise un chemin relatif :
// ça tape directement les routes API de ce même serveur Next local, et ça
// évite un aller-retour CORS vers Vercel (qui bloquait les requêtes tant que
// la route distante n'avait pas de headers CORS).

import { Capacitor } from '@capacitor/core';

export const API_BASE_URL = 'https://agrimarche-ultra-v1.vercel.app';

function isLocalWebDev(): boolean {
  if (typeof window === 'undefined') return false; // SSR / build : pas de window

  // ⚠️ FIX : l'app Capacitor packagée (Android ET iOS) sert elle aussi ses
  // pages depuis l'hostname 'localhost' par défaut — ce n'est pas propre à
  // `npm run dev`. Sans ce check, isLocalWebDev() renvoyait `true` à tort
  // sur le téléphone, apiUrl() renvoyait un chemin relatif ('/api/...') qui
  // n'existe pas dans le build mobile (routes API non embarquées, voir plus
  // haut), le WebView retombait sur index.html (SPA fallback, statut 200),
  // et le code croyait donc que l'appel avait réussi — sans jamais toucher
  // le vrai backend Vercel. C'est ce qui empêchait tout SMS Infobip
  // d'arriver sur mobile (OTP inscription, mot de passe oublié, etc.) tout
  // en fonctionnant normalement sur localhost.
  if (Capacitor.isNativePlatform()) return false;

  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (isLocalWebDev()) {
    return normalizedPath; // relatif -> tape la route Next locale
  }

  return `${API_BASE_URL}${normalizedPath}`;
}
