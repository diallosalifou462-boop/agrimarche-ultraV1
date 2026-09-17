'use client';

// Connexion par numéro : retrouver le bon compte, et ne jamais rester sur un
// doublon « téléphone seul » créé par Firebase Phone Auth (numéros Orange).
// Voir src/lib/server/phoneAccounts.ts pour l'explication complète.

import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { apiUrl } from '@/lib/api-config';

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
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
  const fallback = [`221${local}@sunnumenef.sn`, `221${local}@agrimarche.sn`, `${local}@agrimarche.sn`];
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
  if (!current || current.email) return;

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
  if (json.uid !== current.uid) {
    await signInWithCustomToken(auth, json.customToken);
  }
}
