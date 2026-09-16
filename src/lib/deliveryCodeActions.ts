/**
 * deliveryCodeActions.ts
 * ============================================================
 * Client léger pour les Cloud Functions de deliveryCode.ts. Même
 * philosophie qu'orderActions.ts : plus aucune écriture Firestore
 * directe sur delivererId/status/deliveryCode depuis le frontend — tout
 * passe par le serveur, en transaction, avec vérification d'ownership.
 *
 * Règle fondamentale : le code appartient au client. Ces fonctions ne
 * l'exposent jamais au livreur (getDeliveryCode vérifie order.userId
 * côté serveur) et ne l'envoient jamais par SMS.
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { app, auth } from '@/lib/firebase/firebase';
import { callWithRetry } from '@/lib/callWithRetry';

const functions = getFunctions(app, 'us-central1');

export class DeliveryCodeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function toDeliveryCodeError(e: any): DeliveryCodeError {
  const code: string = e?.code || 'unknown';
  const messages: Record<string, string> = {
    'functions/failed-precondition': e?.message || "Cette commande a changé d'état entre-temps.",
    'functions/permission-denied': e?.message || "Vous n'avez pas accès à cette commande.",
    'functions/not-found': 'Commande introuvable.',
    'functions/unauthenticated': "Votre session a expiré, reconnectez-vous.",
    'functions/invalid-argument': e?.message || 'Code incorrect.',
    'functions/resource-exhausted': e?.message || 'Trop de tentatives — réessayez plus tard.',
  };
  return new DeliveryCodeError(code, messages[code] ?? "😊 Petit souci technique — réessayez dans un instant.");
}

/** Livreur : accepte une commande 'en_preparation'. Génère le code côté serveur. */
export async function claimOrder(orderId: string): Promise<void> {
  try {
    const fn = httpsCallable<{ orderId: string }, { success: true }>(functions, 'claimOrder');
    await callWithRetry(() => fn({ orderId }));
  } catch (e: any) {
    throw toDeliveryCodeError(e);
  }
}

/** Checkout sans compte : session invité (sans mot de passe, sans SMS) avant création de la commande. */
export async function startGuestCheckoutSession(phone: string, name?: string): Promise<string> {
  try {
    const fn = httpsCallable<{ phone: string; name?: string }, { customToken: string; guestPhone: string }>(functions, 'startGuestCheckoutSession');
    const res = await callWithRetry(() => fn({ phone, name }));
    await signInWithCustomToken(auth, res.data.customToken);
    return res.data.guestPhone;
  } catch (e: any) {
    throw toDeliveryCodeError(e);
  }
}

/** Livreur : transmet le code que le client vient de lui dicter. */
export async function confirmDeliveryWithCode(orderId: string, code: string): Promise<void> {
  try {
    const fn = httpsCallable<{ orderId: string; code: string }, { success: true }>(functions, 'confirmDeliveryWithCode');
    await fn({ orderId, code }); // pas de retry ici : un code faux ne doit jamais être rejoué automatiquement
  } catch (e: any) {
    throw toDeliveryCodeError(e);
  }
}

/** Client (avec compte) : lit son propre code de livraison. */
export async function getDeliveryCode(orderId: string): Promise<string | null> {
  try {
    const fn = httpsCallable<{ orderId: string }, { code: string | null; reason: 'ok' | 'not_generated' }>(functions, 'getDeliveryCode');
    const res = await callWithRetry(() => fn({ orderId }));
    return res.data.code;
  } catch (e: any) {
    throw toDeliveryCodeError(e);
  }
}

export interface GuestOrderSummary {
  orderId: string;
  summary: string;
  total: number | null;
  sellerName: string | null;
  status: string;
}

/** Invité, étape 1 : retrouve ses commandes actives par téléphone (aucun code renvoyé ici). */
export async function findGuestOrders(phone: string): Promise<GuestOrderSummary[]> {
  try {
    const fn = httpsCallable<{ phone: string }, { orders: GuestOrderSummary[] }>(functions, 'findGuestOrders');
    const res = await fn({ phone });
    return res.data.orders;
  } catch (e: any) {
    throw toDeliveryCodeError(e);
  }
}

/** Invité, étape 2 : confirme sa commande → session sans mot de passe, sans SMS. */
export async function claimGuestOrderSession(orderId: string, phone: string): Promise<void> {
  try {
    const fn = httpsCallable<{ orderId: string; phone: string }, { customToken: string }>(functions, 'claimGuestOrderSession');
    const res = await fn({ orderId, phone });
    await signInWithCustomToken(auth, res.data.customToken);
  } catch (e: any) {
    throw toDeliveryCodeError(e);
  }
}
