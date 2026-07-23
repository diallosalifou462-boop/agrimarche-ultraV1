/**
 * reviewSubmission.ts
 * ============================================================
 * PORTE D'ENTREE UNIQUE POUR LES AVIS LIES A UNE COMMANDE
 * ============================================================
 *
 * Concerne le flux de src/app/review/page.tsx ("Donner mon avis" depuis
 * une commande precise, id=orderId dans l'URL). Ne touche PAS au widget
 * ReviewsSection.tsx (avis general sur un vendeur, sans commande liee),
 * qui reste en ecriture directe cote client pour l'instant -- c'est un
 * flux distinct, volontairement non lie a un achat prouve.
 *
 * Pourquoi passer par une Cloud Function ici aussi :
 *
 * 1. Ownership + preuve d'achat verifiees cote serveur. Le client
 *    envoyait deja sellerId, sellerName, productNames -- des valeurs
 *    qu'il aurait pu falsifier. Ici, on les relit depuis
 *    orders/{orderId} cote serveur : la seule source fiable.
 *
 * 2. La commande doit etre 'livre' pour etre notee. Cette regle vivait
 *    uniquement dans firestore.rules (invisible dans le code
 *    applicatif) ; elle est maintenant explicite et testable ici.
 *
 * 3. Anti-doublon sans race condition. Avant : le client faisait un
 *    getDocs() pour verifier "ai-je deja note ?", PUIS un addDoc()
 *    separe -- deux onglets ouverts, ou un double-tap reseau lent,
 *    pouvaient tous les deux passer le check avant que l'un des deux
 *    n'ecrive. Ici, l'ID du document est deterministe
 *    (`${orderId}_${uid}`) et la lecture+ecriture sont dans la meme
 *    transaction : structurellement impossible d'avoir deux avis pour
 *    la meme commande.
 *
 * 4. Sur "Erreur lors de l'envoi" : la cause la plus probable, si tes
 *    regles Firestore actuelles exigent
 *    get(orders/{orderId}).data.status == 'livre' avant d'autoriser
 *    l'ecriture, est qu'une commande restee bloquee a un statut
 *    anterieur (a cause du bug de batch orders/seller_orders corrige
 *    precedemment) se voyait refuser l'avis pour la meme raison
 *    structurelle. En passant par l'Admin SDK, cette classe de
 *    probleme disparait, quelle que soit la regle exacte en cause.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// Doit rester synchronise avec src/lib/orderStatus.ts (LEGACY_STATUS) --
// memes precautions que dans orderStatusTransitions.ts.
const LEGACY_LIVRE: Record<string, boolean> = {
  livre: true, livree: true, delivered: true,
};
function isDelivered(raw: string | undefined | null): boolean {
  if (!raw) return false;
  const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return !!LEGACY_LIVRE[key];
}

interface SubmitReviewRequest {
  orderId: string;
  rating: number;
  comment?: string;
}

interface SubmitReviewResponse {
  success: true;
  reviewId: string;
  alreadyReviewed: boolean;
}

export const submitReview = onCall<SubmitReviewRequest, Promise<SubmitReviewResponse>>(
  {
    region: 'us-central1', // aligné sur le reste de functions/src/index.ts
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 30,
    // L'ID déterministe (${orderId}_${uid}) fait qu'un même utilisateur ne
    // peut produire qu'un seul avis par commande, quel que soit le nombre
    // d'appels — même protection intrinsèque contre l'abus qu'updateOrderStatus.
    maxInstances: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Connexion requise.');
    }

    const { orderId, rating, comment } = request.data ?? {};

    if (!orderId || typeof orderId !== 'string') {
      throw new HttpsError('invalid-argument', 'orderId manquant ou invalide.');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new HttpsError('invalid-argument', 'La note doit etre un entier entre 1 et 5.');
    }
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    if (trimmedComment.length > 0 && trimmedComment.length < 5) {
      throw new HttpsError('invalid-argument', 'Commentaire trop court (minimum 5 caracteres), ou laissez-le vide.');
    }
    if (trimmedComment.length > 500) {
      throw new HttpsError('invalid-argument', 'Commentaire trop long (500 caracteres maximum).');
    }

    const orderRef = db.collection('orders').doc(orderId);
    // ID deterministe : une commande ne peut produire qu'un seul avis,
    // par construction -- pas besoin de query anti-doublon separee.
    const reviewRef = db.collection('reviews').doc(`${orderId}_${uid}`);

    const result = await db.runTransaction(async (tx) => {
      const [orderSnap, reviewSnap] = await Promise.all([
        tx.get(orderRef),
        tx.get(reviewRef),
      ]);

      if (!orderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.');
      }

      const order = orderSnap.data() as any;

      if (order.userId !== uid) {
        logger.warn('[submitReview] Tentative non autorisee', { orderId, uid, ownerUid: order.userId });
        throw new HttpsError('permission-denied', "Cette commande ne vous appartient pas.");
      }

      if (!isDelivered(order.status)) {
        throw new HttpsError(
          'failed-precondition',
          "Vous ne pouvez noter qu'une commande livree.",
        );
      }

      if (reviewSnap.exists) {
        return { alreadyReviewed: true, reviewId: reviewRef.id };
      }

      const items = order.items || [];
      const productNames = items.map((item: any) => item.productName || item.name).filter(Boolean);

      // Nom/email affiches : priorite au token Auth (non falsifiable),
      // repli sur les infos de commande si le token n'en a pas.
      const userName = request.auth?.token?.name || order.userName || 'Client';
      const userEmail = request.auth?.token?.email || order.userEmail || null;

      tx.create(reviewRef, {
        orderId,
        sellerId: order.sellerId ?? '',
        sellerName: order.sellerName || 'Vendeur',
        userId: uid,
        userName,
        userEmail,
        rating,
        comment: trimmedComment,
        productNames,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { alreadyReviewed: false, reviewId: reviewRef.id };
    });

    logger.info('[submitReview] Avis traité', {
      orderId, uid, reviewId: result.reviewId, alreadyReviewed: result.alreadyReviewed, rating,
    });

    return { success: true, reviewId: result.reviewId, alreadyReviewed: result.alreadyReviewed };
  },
);
