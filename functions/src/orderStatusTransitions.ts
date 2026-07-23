/**
 * orderStatusTransitions.ts
 * ============================================================
 * SOURCE UNIQUE DE VÉRITÉ POUR LES TRANSITIONS DE STATUT CÔTÉ CLIENT
 * ============================================================
 *
 * Pourquoi ce fichier existe :
 * Avant, chaque écran client (account/page.tsx, account/orders/page.tsx,
 * main/account/page.tsx, orders/page.tsx) écrivait DIRECTEMENT dans
 * Firestore via un writeBatch touchant à la fois `orders` et
 * `seller_orders`. Deux problèmes structurels :
 *
 *  1. Un writeBatch est atomique : si UNE SEULE des écritures est refusée
 *     par les règles de sécurité (typiquement seller_orders, réservé au
 *     vendeur), TOUT le batch échoue — y compris l'update sur `orders`
 *     qui, seul, aurait dû être accepté. → permission-denied fantôme.
 *
 *  2. La validation métier ("le client peut confirmer réception
 *     seulement si en_livraison", "annuler seulement si en_attente")
 *     vivait à la fois dans firestore.rules ET dans orderStatus.ts
 *     (canClientCancel / canClientConfirmDelivery), dupliquée dans 4
 *     écrans. Le jour où l'un désynchronise, on a un bouton actif dans
 *     l'UI que Firestore rejette en silence, ou pire, une règle trop
 *     permissive.
 *
 * La solution : UNE SEULE porte d'entrée serveur, exécutée avec les
 * droits Admin SDK (donc immunisée aux règles de sécurité — mais elle
 * réimplémente elle-même, explicitement, tout ce que les règles
 * auraient vérifié). Le client n'écrit plus jamais directement le champ
 * `status` d'une commande : il appelle cette Cloud Function.
 *
 * Bénéfices :
 *  - Atomicité réelle (transaction Firestore, pas un batch aveugle).
 *  - Idempotence : un double-clic ou un retry réseau ne recrée pas
 *    d'effets de bord (pas de double notification, pas de log dupliqué).
 *  - Horodatage serveur (FieldValue.serverTimestamp) au lieu de
 *    Timestamp.now() côté client — insensible à une horloge locale
 *    fausse ou à un décalage réseau.
 *  - Audit trail : chaque transition est journalisée dans
 *    order_status_log, avec qui/quand/depuis/vers — indispensable en
 *    cas de litige acheteur/vendeur ("j'ai jamais confirmé réception").
 *  - Un seul endroit à faire évoluer si le pipeline de statuts change.
 */

import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

// ------------------------------------------------------------------
// Vocabulaire de statut — DOIT rester identique à src/lib/orderStatus.ts
// (le fichier frontend, importé par les 5 écrans). Les deux copies sont
// volontairement séparées (le frontend n'a pas accès à ce dossier
// functions/ dans son bundle), mais toute évolution du pipeline de
// statuts doit être appliquée AUX DEUX ENDROITS. Un test partagé
// (functions/src/__tests__/statusParity.test.ts, cf. plus bas) échoue
// en CI si les deux tables divergent, pour qu'on ne l'oublie pas.
// ------------------------------------------------------------------
type OrderStatus = 'en_attente' | 'en_preparation' | 'en_livraison' | 'livre' | 'annule';

type ClientAction = 'confirm_delivery' | 'cancel';

interface TransitionRule {
  /** Statut(s) actuel(s) de la commande à partir desquels l'action est permise. */
  from: OrderStatus[];
  to: OrderStatus;
  statusLabel: string;
}

const TRANSITIONS: Record<ClientAction, TransitionRule> = {
  confirm_delivery: {
    from: ['en_livraison'],
    to: 'livre',
    statusLabel: 'Livrée – confirmée par le client',
  },
  cancel: {
    from: ['en_attente'],
    to: 'annule',
    statusLabel: 'Annulée par le client',
  },
};

interface UpdateOrderStatusRequest {
  orderId: string;
  action: ClientAction;
}

interface UpdateOrderStatusResponse {
  success: true;
  status: OrderStatus;
  alreadyApplied: boolean;
}

export const updateOrderStatus = onCall<UpdateOrderStatusRequest, Promise<UpdateOrderStatusResponse>>(
  {
    region: 'us-central1', // aligné sur le reste de functions/src/index.ts
    // ✅ App Check obligatoire : seule l'app AgriMarché légitime (iOS/Android/
    // web enregistrée) peut appeler cette fonction — bloque les scripts qui
    // tenteraient d'appeler l'endpoint callable directement avec un simple
    // ID token vol é/rejoué. Nécessite d'avoir activé App Check côté client
    // (déjà le cas si le SDK Firebase App Check est initialisé dans
    // firebase.ts — sinon voir DEPLOYMENT.md).
    enforceAppCheck: true,
    // Une transaction à 2 lectures + 2 écritures ne demande ni beaucoup de
    // mémoire ni beaucoup de temps — on le rend explicite plutôt que de
    // laisser les valeurs par défaut, pour un coût prévisible et une
    // détection rapide si une régression fait exploser la durée d'exécution.
    memory: '256MiB',
    timeoutSeconds: 30,
    // Le design même de la fonction limite l'abus : une commande ne peut
    // recevoir qu'une seule confirmation ou annulation valide (transition
    // gardée par le statut courant), donc spammer l'appel ne produit aucun
    // effet après la première exécution réussie — pas besoin d'un rate
    // limiter applicatif dédié ici.
    maxInstances: 20,
  },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError('unauthenticated', 'Connexion requise.');
    }

    const { orderId, action } = request.data ?? {};
    if (!orderId || typeof orderId !== 'string') {
      throw new HttpsError('invalid-argument', 'orderId manquant ou invalide.');
    }
    const rule = TRANSITIONS[action as ClientAction];
    if (!rule) {
      throw new HttpsError('invalid-argument', `Action inconnue: ${action}`);
    }

    const ordersRef = db.collection('orders').doc(orderId);
    const sellerOrderRef = db.collection('seller_orders').doc(orderId);
    const logRef = db.collection('order_status_log').doc();

    const result = await db.runTransaction(async (tx) => {
      // Toutes les lectures d'une transaction Firestore doivent précéder
      // toutes les écritures — d'où les deux .get() groupés ici.
      const [orderSnap, sellerOrderSnap] = await Promise.all([
        tx.get(ordersRef),
        tx.get(sellerOrderRef),
      ]);

      if (!orderSnap.exists) {
        throw new HttpsError('not-found', 'Commande introuvable.');
      }

      const order = orderSnap.data() as any;

      // Ownership : seul l'acheteur de CETTE commande peut agir dessus.
      if (order.userId !== uid) {
        logger.warn('[updateOrderStatus] Tentative non autorisée', {
          orderId, uid, ownerUid: order.userId, action,
        });
        throw new HttpsError('permission-denied', "Cette commande ne vous appartient pas.");
      }

      const currentStatus = (order.status ?? 'en_attente') as OrderStatus;

      // Idempotence : si la commande est déjà dans l'état cible (retry
      // réseau, double-clic malgré le disabled côté UI, webhook rejoué),
      // on répond succès sans ré-écrire ni ré-journaliser.
      if (currentStatus === rule.to) {
        return { alreadyApplied: true, status: rule.to };
      }

      if (!rule.from.includes(currentStatus)) {
        throw new HttpsError(
          'failed-precondition',
          `Action "${action}" impossible depuis le statut "${currentStatus}".`,
        );
      }

      const now = admin.firestore.FieldValue.serverTimestamp();
      const payload: Record<string, any> = {
        status: rule.to,
        statusLabel: rule.statusLabel,
        updatedAt: now,
      };
      if (action === 'cancel') {
        payload.cancelledBy = 'client';
        payload.cancelledAt = now;
      }

      tx.set(ordersRef, payload, { merge: true });
      if (sellerOrderSnap.exists) {
        tx.set(sellerOrderRef, payload, { merge: true });
      }

      tx.set(logRef, {
        orderId,
        uid,
        action,
        fromStatus: currentStatus,
        toStatus: rule.to,
        seller_orders_synced: sellerOrderSnap.exists,
        createdAt: now,
      });

      return { alreadyApplied: false, status: rule.to };
    });

    logger.info('[updateOrderStatus] Transition appliquée', {
      orderId, uid, action, toStatus: result.status, alreadyApplied: result.alreadyApplied,
    });

    return { success: true, status: result.status, alreadyApplied: result.alreadyApplied };
  },
);
