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

export const API_BASE_URL = 'https://agrimarche-ultra-v1.vercel.app';

function isLocalWebDev(): boolean {
  if (typeof window === 'undefined') return false; // SSR / build : pas de window
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
