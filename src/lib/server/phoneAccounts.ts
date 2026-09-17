// src/lib/server/phoneAccounts.ts — SERVEUR UNIQUEMENT (routes /api)
//
// Retrouver LE compte d'un numéro, quel que soit l'historique de sa création.
//
// Pourquoi : selon l'époque et l'opérateur, un même numéro peut avoir un
// compte Firebase Auth sous l'une de ces formes :
//   - téléphone attaché (+221XXXXXXXXX) ET email ;
//   - email seul : 221XXXXXXXXX@sunnumenef.sn (format actuel), ou anciens
//     formats @agrimarche.sn avec/sans 221, voire @gmail.com ;
//   - téléphone seul : compte VIDE créé par Firebase Phone Auth (Orange)
//     quand l'email du vrai compte n'avait pas le numéro attaché.
// Ce dernier cas produisait les « deux identifiants » visibles dans la
// console pour les numéros Orange.

import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type UserRecord } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

export function getAdminApp(): App {
  if (getApps().length) return getApps()[0];
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson && serviceAccountJson.trim() !== '') {
    return initializeApp({ credential: cert(JSON.parse(serviceAccountJson)) });
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!projectId || !clientEmail || !privateKey) throw new Error("Firebase Admin n'est pas configuré.");
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

export function toE164Senegal(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('221')) digits = '+' + digits;
    else if (digits.length === 9) digits = '+221' + digits;
    else digits = '+' + digits;
  }
  return /^\+221\d{9}$/.test(digits) ? digits : null;
}

/** Format officiel des nouveaux comptes (identique aux functions : carrier.ts). */
export function canonicalSyntheticEmail(e164: string): string {
  return `${e164.replace(/\D/g, '')}@sunnumenef.sn`;
}

/** Toutes les formes d'email synthétique ayant existé pour ce numéro. */
export function syntheticEmailCandidates(e164: string): string[] {
  const local = e164.replace(/\D/g, '').replace(/^221/, '');
  return [
    `221${local}@sunnumenef.sn`,
    `${local}@sunnumenef.sn`,
    `221${local}@agrimarche.sn`,
    `${local}@agrimarche.sn`,
    `${local}@gmail.com`,
    `221${local}@gmail.com`,
  ];
}

const hasPassword = (u: UserRecord | null | undefined) => !!u?.providerData?.some((p) => p.providerId === 'password');

export interface PhoneAccounts {
  e164: string;
  /** Compte qui porte le numéro dans Firebase Auth (peut être un doublon vide). */
  phoneUser: UserRecord | null;
  /** Compte à utiliser : celui qui a un mot de passe, sinon celui du téléphone. */
  main: UserRecord | null;
}

export async function findAccountsForPhone(e164: string): Promise<PhoneAccounts> {
  const auth = getAuth(getAdminApp());
  const phoneUser = await auth.getUserByPhoneNumber(e164).catch(() => null);
  if (phoneUser && hasPassword(phoneUser)) return { e164, phoneUser, main: phoneUser };

  const { users } = await auth.getUsers(syntheticEmailCandidates(e164).map((email) => ({ email })));
  const byEmail = syntheticEmailCandidates(e164)
    .map((email) => users.find((u) => u.email?.toLowerCase() === email))
    .filter((u): u is UserRecord => !!u);
  const emailMain = byEmail.find(hasPassword) ?? null;

  return { e164, phoneUser, main: emailMain ?? phoneUser };
}

/**
 * Un compte « téléphone seul » est-il un doublon VIDE, supprimable sans perte ?
 * Oui seulement si : aucun mot de passe/email, et aucun profil réel, aucune
 * commande (client ou vendeur), aucun produit.
 */
async function isEmptyDuplicate(user: UserRecord): Promise<boolean> {
  if (user.email || hasPassword(user)) return false;
  const db = getFirestore(getAdminApp());
  const profile = await db.collection('users').doc(user.uid).get();
  if (profile.exists) {
    const p = profile.data() || {};
    if (p.role && p.role !== 'client') return false;
    if (p.registrationChannel) return false;
    if ((p.displayName && String(p.displayName).trim()) || (p.name && String(p.name).trim())) return false;
  }
  const [asBuyer, asSeller, products] = await Promise.all([
    db.collection('orders').where('userId', '==', user.uid).limit(1).get(),
    db.collection('orders').where('sellerId', '==', user.uid).limit(1).get(),
    db.collection('products').where('sellerId', '==', user.uid).limit(1).get(),
  ]);
  return asBuyer.empty && asSeller.empty && products.empty;
}

export class DuplicateAccountWithDataError extends Error {
  constructor() {
    super('DUPLICATE_WITH_DATA');
  }
}

/**
 * Le numéro vient d'être VÉRIFIÉ (code SMS). Rend l'uid du vrai compte en
 * réparant au passage :
 *  - doublon vide « téléphone seul » → supprimé ;
 *  - numéro attaché au vrai compte (email), pour que Firebase Phone Auth
 *    retombe dessus la prochaine fois.
 * Lève DuplicateAccountWithDataError si le doublon contient des données.
 */
export async function resolveVerifiedPhoneAccount(e164: string): Promise<string | null> {
  const auth = getAuth(getAdminApp());
  const db = getFirestore(getAdminApp());
  const { phoneUser, main } = await findAccountsForPhone(e164);
  if (!main) return null;

  if (phoneUser && phoneUser.uid !== main.uid) {
    if (!(await isEmptyDuplicate(phoneUser))) throw new DuplicateAccountWithDataError();
    const profileRef = db.collection('users').doc(phoneUser.uid);
    await db.recursiveDelete(profileRef).catch(() => {});
    await auth.deleteUser(phoneUser.uid);
    console.log(`[phoneAccounts] doublon vide ${phoneUser.uid} supprimé, numéro ${e164} rattaché à ${main.uid}`);
  }

  if (main.phoneNumber !== e164) {
    await auth.updateUser(main.uid, { phoneNumber: e164 });
  }
  await db.collection('users').doc(main.uid).set({ phone: e164, phoneVerified: true }, { merge: true });
  await db.collection('phoneIndex').doc(e164).set({ accountId: main.uid }, { merge: true });
  return main.uid;
}
