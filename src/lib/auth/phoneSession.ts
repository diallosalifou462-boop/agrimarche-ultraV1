'use client';

// Connexion par numéro : retrouver le bon compte, et ne jamais rester sur un
// doublon « téléphone seul » créé par Firebase Phone Auth (numéros Orange).
// Voir src/lib/server/phoneAccounts.ts pour l'explication complète.

import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { apiUrl } from '@/lib/api-config';

function toE164(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  // « 00221… » (format international saisi à la main) → « 221… ». Sans ça
  // on obtenait « +00221… », qui ne correspondait jamais au numéro Firebase.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return `+${digits}`;
}

export class NoAccountForPhoneError extends Error {
  constructor() {
    super("Aucun compte n'est associé à ce numéro.");
  }
}

/**
 * Emails à essayer pour la connexion, dans l'ordre. D'abord l'email RÉEL du
 * compte donné par le serveur ; en cas de réseau indisponible, les deux
 * formats historiques (avec et sans 221). Avant, l'email était fabriqué à
 * partir de ce que l'utilisateur tapait : « 77… » et « +221 77… » ne
 * donnaient pas le même email, et un des deux échouait toujours.
 */
export async function resolveLoginEmails(phone: string): Promise<string[]> {
  const e164 = toE164(phone);
  const local = e164.replace(/\D/g, '').replace(/^221/, '');
  // ⚠️ FIX (26/09) : le format OFFICIEL des comptes récents est
  // 221XXXXXXXXX@sunumenef.sn (un seul « n », voir canonicalSyntheticEmail
  // côté serveur). Il manquait de cette liste : si /api/auth/check-phone
  // était injoignable, AUCUN compte récent ne pouvait se connecter.
  const fallback = [
    `221${local}@sunumenef.sn`,
    `${local}@sunumenef.sn`,
    `221${local}@sunnumenef.sn`,
    `${local}@sunnumenef.sn`,
    `221${local}@agrimarche.sn`,
    `${local}@agrimarche.sn`,
  ];
  try {
    const res = await fetch(apiUrl('/api/auth/check-phone'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: e164, purpose: 'login' }),
    });
    if (res.status === 404) throw new NoAccountForPhoneError();
    const json = await res.json().catch(() => null);
    if (res.ok && typeof json?.email === 'string' && json.email) return [json.email];
  } catch (err) {
    if (err instanceof NoAccountForPhoneError) throw err;
    /* serveur injoignable : on essaie les formats connus */
  }
  return fallback;
}

/** Attend que le SDK web reflète la connexion faite côté natif (Capacitor). */
async function waitForPhoneUser(e164: string, timeoutMs = 6000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (auth.currentUser?.phoneNumber === e164) return;
    await new Promise((r) => setTimeout(r, 150));
  }
}

/**
 * À appeler juste APRÈS la validation d'un code SMS Firebase (Orange).
 * Si Firebase a connecté un compte « téléphone seul » (sans email), le serveur
 * supprime ce doublon vide, attache le numéro au vrai compte et on s'y
 * reconnecte. Si l'on est déjà sur le vrai compte, ne fait rien.
 */
export async function ensureMainAccountAfterPhoneCode(phone: string): Promise<void> {
  const e164 = toE164(phone);
  await waitForPhoneUser(e164);
  const current = auth.currentUser;
  // ⚠️ FIX (26/09) : avant, `!current` faisait un `return` SILENCIEUX — la
  // page passait alors à l'écran « Nouveau mot de passe » SANS aucune
  // session, et l'échec n'apparaissait qu'à la validation
  // (« Session invalide [user0=false …] »). On échoue ici, tout de suite,
  // avec un message clair, sur l'écran du code.
  if (!current) {
    throw new Error('Connexion non établie après le code SMS. Réessayez.');
  }
  // Le code SMS a directement ouvert le vrai compte (numéro déjà rattaché,
  // email présent) : aucune modification serveur, la session est saine.
  if (current.email) return;

  const idToken = await current.getIdToken(true);
  const res = await fetch(apiUrl('/api/auth/phone-session'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  const json = await res.json().catch(() => null);
  if (res.status === 404) return; // compte « téléphone seul » légitime : on le garde
  if (!res.ok || typeof json?.customToken !== 'string') {
    throw new Error(json?.error || 'Impossible de retrouver votre compte. Réessayez.');
  }
  // ⚠️ FIX (26/09) — CAUSE RACINE de la session perdue au mot de passe
  // oublié : le serveur MODIFIE le compte (ajout de l'email, rattachement
  // du numéro, suppression du doublon). Pour Firebase, ce sont des
  // changements majeurs qui RÉVOQUENT la session en cours. Avant, on ne se
  // reconnectait avec le jeton frais QUE si l'uid changeait — sinon on
  // gardait une session révoquée, qui tombait au premier appel suivant
  // (getIdToken/updatePassword → auth/user-token-expired → déconnexion).
  // On se reconnecte donc TOUJOURS avec le jeton émis après les changements.
  await signInWithCustomToken(auth, json.customToken);
}
