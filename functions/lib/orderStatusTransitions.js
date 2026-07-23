"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateOrderStatus = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const https_1 = require("firebase-functions/v2/https");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
const TRANSITIONS = {
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
exports.updateOrderStatus = (0, https_1.onCall)({
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
}, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Connexion requise.');
    }
    const { orderId, action } = (_b = request.data) !== null && _b !== void 0 ? _b : {};
    if (!orderId || typeof orderId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'orderId manquant ou invalide.');
    }
    const rule = TRANSITIONS[action];
    if (!rule) {
        throw new https_1.HttpsError('invalid-argument', `Action inconnue: ${action}`);
    }
    const ordersRef = db.collection('orders').doc(orderId);
    const sellerOrderRef = db.collection('seller_orders').doc(orderId);
    const logRef = db.collection('order_status_log').doc();
    const result = await db.runTransaction(async (tx) => {
        var _a;
        // Toutes les lectures d'une transaction Firestore doivent précéder
        // toutes les écritures — d'où les deux .get() groupés ici.
        const [orderSnap, sellerOrderSnap] = await Promise.all([
            tx.get(ordersRef),
            tx.get(sellerOrderRef),
        ]);
        if (!orderSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Commande introuvable.');
        }
        const order = orderSnap.data();
        // Ownership : seul l'acheteur de CETTE commande peut agir dessus.
        if (order.userId !== uid) {
            v2_1.logger.warn('[updateOrderStatus] Tentative non autorisée', {
                orderId, uid, ownerUid: order.userId, action,
            });
            throw new https_1.HttpsError('permission-denied', "Cette commande ne vous appartient pas.");
        }
        const currentStatus = ((_a = order.status) !== null && _a !== void 0 ? _a : 'en_attente');
        // Idempotence : si la commande est déjà dans l'état cible (retry
        // réseau, double-clic malgré le disabled côté UI, webhook rejoué),
        // on répond succès sans ré-écrire ni ré-journaliser.
        if (currentStatus === rule.to) {
            return { alreadyApplied: true, status: rule.to };
        }
        if (!rule.from.includes(currentStatus)) {
            throw new https_1.HttpsError('failed-precondition', `Action "${action}" impossible depuis le statut "${currentStatus}".`);
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        const payload = {
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
    v2_1.logger.info('[updateOrderStatus] Transition appliquée', {
        orderId, uid, action, toStatus: result.status, alreadyApplied: result.alreadyApplied,
    });
    return { success: true, status: result.status, alreadyApplied: result.alreadyApplied };
});
