/**
 * reviewActions.ts
 * ============================================================
 * Helper client pour la creation d'un avis lie a une commande, via la
 * Cloud Function `submitReview` (functions/src/reviewSubmission.ts).
 *
 * Remplace l'ecriture Firestore directe qui existait dans
 * src/app/review/page.tsx (addDoc sur 'reviews'), et qui pouvait
 * echouer avec "Erreur lors de l'envoi" des que les regles de securite
 * refusaient la creation (ownership, statut de commande, etc.) sans
 * detail exploitable cote client.
 */

import { getFunctions, httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { app } from '@/lib/firebase/firebase';
import { callWithRetry } from '@/lib/callWithRetry';

const functions = getFunctions(app, 'us-central1'); // meme region que toutes les Cloud Functions (functions/src/index.ts)

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

export class ReviewActionError extends Error {
  code: string;
  isOffline: boolean;

  constructor(code: string, message: string, isOffline: boolean) {
    super(message);
    this.code = code;
    this.isOffline = isOffline;
  }
}

function toReviewActionError(e: any): ReviewActionError {
  const code: string = e?.code || 'unknown';
  const isOffline =
    typeof navigator !== 'undefined' && !navigator.onLine
      ? true
      : code === 'functions/unavailable' || /network|offline/i.test(e?.message || '');

  // Les messages HttpsError renvoyes par submitReview sont deja en
  // francais et directement affichables (cf. reviewSubmission.ts) --
  // on les relaie tels quels plutot que de les remapper.
  const messages: Record<string, string> = {
    'functions/permission-denied': "Cette commande ne vous appartient pas.",
    'functions/not-found': 'Commande introuvable.',
    'functions/unauthenticated': 'Votre session a expire, reconnectez-vous.',
  };

  const message = isOffline
    ? '📶 Pas de connexion internet. Reconnecte-toi et réessaie.'
    : (e?.message && !/^internal$/i.test(e.message) ? e.message : null) ??
      messages[code] ??
      "😊 Petit souci technique de notre côté — réessaie dans un instant, ou contacte-nous si ça persiste.";

  return new ReviewActionError(code, message, isOffline);
}

/**
 * Soumet un avis pour une commande. `alreadyReviewed: true` dans la
 * reponse signifie qu'un avis existait deja pour cette commande --
 * ce n'est pas une erreur (idempotent), a traiter comme un succes doux
 * cote UI (ex: "vous avez deja note cette commande").
 */
export async function submitOrderReview(
  orderId: string,
  rating: number,
  comment: string,
): Promise<SubmitReviewResponse> {
  try {
    const fn = httpsCallable<SubmitReviewRequest, SubmitReviewResponse>(functions, 'submitReview');
    // Idempotent cote serveur (ID deterministe orderId+uid) : un retry
    // apres coupure reseau ne peut pas creer de doublon.
    const res: HttpsCallableResult<SubmitReviewResponse> = await callWithRetry(() =>
      fn({ orderId, rating, comment }),
    );
    return res.data;
  } catch (e: any) {
    throw toReviewActionError(e);
  }
}
