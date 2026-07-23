"use strict";
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
exports.submitReview = void 0;
const admin = __importStar(require("firebase-admin"));
const v2_1 = require("firebase-functions/v2");
const https_1 = require("firebase-functions/v2/https");
if (admin.apps.length === 0) {
    admin.initializeApp();
}
const db = admin.firestore();
// Doit rester synchronise avec src/lib/orderStatus.ts (LEGACY_STATUS) --
// memes precautions que dans orderStatusTransitions.ts.
const LEGACY_LIVRE = {
    livre: true, livree: true, delivered: true,
};
function isDelivered(raw) {
    if (!raw)
        return false;
    const key = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return !!LEGACY_LIVRE[key];
}
exports.submitReview = (0, https_1.onCall)({
    region: 'us-central1', // aligné sur le reste de functions/src/index.ts
    enforceAppCheck: true,
    memory: '256MiB',
    timeoutSeconds: 30,
    // L'ID déterministe (${orderId}_${uid}) fait qu'un même utilisateur ne
    // peut produire qu'un seul avis par commande, quel que soit le nombre
    // d'appels — même protection intrinsèque contre l'abus qu'updateOrderStatus.
    maxInstances: 20,
}, async (request) => {
    var _a, _b;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid) {
        throw new https_1.HttpsError('unauthenticated', 'Connexion requise.');
    }
    const { orderId, rating, comment } = (_b = request.data) !== null && _b !== void 0 ? _b : {};
    if (!orderId || typeof orderId !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'orderId manquant ou invalide.');
    }
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        throw new https_1.HttpsError('invalid-argument', 'La note doit etre un entier entre 1 et 5.');
    }
    const trimmedComment = typeof comment === 'string' ? comment.trim() : '';
    if (trimmedComment.length > 0 && trimmedComment.length < 5) {
        throw new https_1.HttpsError('invalid-argument', 'Commentaire trop court (minimum 5 caracteres), ou laissez-le vide.');
    }
    if (trimmedComment.length > 500) {
        throw new https_1.HttpsError('invalid-argument', 'Commentaire trop long (500 caracteres maximum).');
    }
    const orderRef = db.collection('orders').doc(orderId);
    // ID deterministe : une commande ne peut produire qu'un seul avis,
    // par construction -- pas besoin de query anti-doublon separee.
    const reviewRef = db.collection('reviews').doc(`${orderId}_${uid}`);
    const result = await db.runTransaction(async (tx) => {
        var _a, _b, _c, _d, _e;
        const [orderSnap, reviewSnap] = await Promise.all([
            tx.get(orderRef),
            tx.get(reviewRef),
        ]);
        if (!orderSnap.exists) {
            throw new https_1.HttpsError('not-found', 'Commande introuvable.');
        }
        const order = orderSnap.data();
        if (order.userId !== uid) {
            v2_1.logger.warn('[submitReview] Tentative non autorisee', { orderId, uid, ownerUid: order.userId });
            throw new https_1.HttpsError('permission-denied', "Cette commande ne vous appartient pas.");
        }
        if (!isDelivered(order.status)) {
            throw new https_1.HttpsError('failed-precondition', "Vous ne pouvez noter qu'une commande livree.");
        }
        if (reviewSnap.exists) {
            return { alreadyReviewed: true, reviewId: reviewRef.id };
        }
        const items = order.items || [];
        const productNames = items.map((item) => item.productName || item.name).filter(Boolean);
        // Nom/email affiches : priorite au token Auth (non falsifiable),
        // repli sur les infos de commande si le token n'en a pas.
        const userName = ((_b = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.token) === null || _b === void 0 ? void 0 : _b.name) || order.userName || 'Client';
        const userEmail = ((_d = (_c = request.auth) === null || _c === void 0 ? void 0 : _c.token) === null || _d === void 0 ? void 0 : _d.email) || order.userEmail || null;
        tx.create(reviewRef, {
            orderId,
            sellerId: (_e = order.sellerId) !== null && _e !== void 0 ? _e : '',
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
    v2_1.logger.info('[submitReview] Avis traité', {
        orderId, uid, reviewId: result.reviewId, alreadyReviewed: result.alreadyReviewed, rating,
    });
    return { success: true, reviewId: result.reviewId, alreadyReviewed: result.alreadyReviewed };
});
