/**
 * orderActions.ts
 * ============================================================
 * Remplace `clientUpdateOrder` (dupliqué dans account/page.tsx,
 * account/orders/page.tsx, main/account/page.tsx, orders/page.tsx).
 *
 * Avant : chaque écran écrivait directement dans Firestore (`orders` +
 * `seller_orders`) via un writeBatch → permission-denied fantôme dès que
 * seller_orders refusait l'écriture côté client (cf. commit précédent).
 *
 * Maintenant : un seul appel à la Cloud Function `updateOrderStatus`
 * (functions/src/orderStatusTransitions.ts), qui fait la transaction
 * atomique côté serveur avec les droits Admin SDK. Le client ne
 * manipule plus jamais directement le champ `status` d'une commande.
 *
 * Import dans chaque écran :
 *   import { confirmOrderDelivery, cancelClientOrder, OrderActionError } from '@/lib/orderActions';
 */

import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { app } from '@/lib/firebase/firebase';
import { callWithRetry } from '@/lib/callWithRetry';

const functions = getFunctions(app, 'europe-west1'); // même région que la Cloud Function

type ClientAction = 'confirm_delivery' | 'cancel';

interface UpdateOrderStatusRequest {
  orderId: string;
  action: ClientAction;
}

interface UpdateOrderStatusResponse {
  success: true;
  status: 'en_attente' | 'en_preparation' | 'en_livraison' | 'livre' | 'annule';
  alreadyApplied: boolean;
}

/**
 * Erreur normalisée pour l'UI. On mappe les codes HttpsError renvoyés
 * par la Cloud Function vers des messages français directement
 * affichables, plutôt que de laisser chaque écran réinventer son propre
 * mapping (comme c'était le cas avec les 4 blocs catch quasi-identiques
 * mais légèrement différents qu'on avait avant).
 */
export class OrderActionError extends Error {
  code: string;
  isOffline: boolean;

  constructor(code: string, message: string, isOffline: boolean) {
    super(message);
    this.code = code;
    this.isOffline = isOffline;
  }
}

function toOrderActionError(e: any): OrderActionError {
  // Erreur réseau pure (pas de réponse du tout) : le SDK Functions la
  // remonte généralement avec code 'unavailable' ou 'internal', ou un
  // message contenant 'network'/'offline'. On la traite comme un
  // problème de connexion — message rassurant plutôt que technique.
  const code: string = e?.code || 'unknown';
  const isOffline =
    typeof navigator !== 'undefined' && !navigator.onLine
      ? true
      : code === 'functions/unavailable' || /network|offline/i.test(e?.message || '');

  const messages: Record<string, string> = {
    'functions/failed-precondition':
      "Cette commande a changé de statut entre-temps — recharge la page et réessaie.",
    'functions/permission-denied': "Cette commande ne t'appartient pas.",
    'functions/not-found': "Commande introuvable.",
    'functions/unauthenticated': "Ta session a expiré, reconnecte-toi.",
  };

  const message = isOffline
    ? '📶 Pas de connexion internet. Reconnecte-toi et réessaie.'
    : messages[code] ??
      "😊 Petit souci technique de notre côté — réessaie dans un instant, ou contacte-nous si ça persiste.";

  return new OrderActionError(code, message, isOffline);
}

async function callUpdateOrderStatus(
  orderId: string,
  action: ClientAction,
): Promise<UpdateOrderStatusResponse> {
  try {
    const fn = httpsCallable<UpdateOrderStatusRequest, UpdateOrderStatusResponse>(
      functions,
      'updateOrderStatus',
    );
    // Idempotent cote serveur (statut deja verifie avant ecriture) : un
    // retry apres coupure reseau est donc sans danger, meme si le
    // premier appel a en fait deja reussi.
    const res: HttpsCallableResult<UpdateOrderStatusResponse> = await callWithRetry(() =>
      fn({ orderId, action }),
    );
    return res.data;
  } catch (e: any) {
    throw toOrderActionError(e);
  }
}

/** Le client confirme avoir reçu sa commande (en_livraison → livre). */
export const confirmOrderDelivery = (orderId: string) =>
  callUpdateOrderStatus(orderId, 'confirm_delivery');

/** Le client annule sa commande tant qu'elle est encore en_attente. */
export const cancelClientOrder = (orderId: string) =>
  callUpdateOrderStatus(orderId, 'cancel');
