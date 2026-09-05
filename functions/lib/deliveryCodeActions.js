"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeliveryCodeError = void 0;
exports.claimOrder = claimOrder;
exports.startGuestCheckoutSession = startGuestCheckoutSession;
exports.confirmDeliveryWithCode = confirmDeliveryWithCode;
exports.getDeliveryCode = getDeliveryCode;
exports.getDeliveryCodeAdmin = getDeliveryCodeAdmin;
exports.findGuestOrders = findGuestOrders;
exports.claimGuestOrderSession = claimGuestOrderSession;
const functions_1 = require("firebase/functions");
const auth_1 = require("firebase/auth");
const firebase_1 = require("@/lib/firebase/firebase");
const callWithRetry_1 = require("@/lib/callWithRetry");
const functions = (0, functions_1.getFunctions)(firebase_1.app, 'us-central1');
class DeliveryCodeError extends Error {
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
exports.DeliveryCodeError = DeliveryCodeError;
function toDeliveryCodeError(e) {
    var _a;
    const code = (e === null || e === void 0 ? void 0 : e.code) || 'unknown';
    const messages = {
        'functions/failed-precondition': (e === null || e === void 0 ? void 0 : e.message) || "Cette commande a changé d'état entre-temps.",
        'functions/permission-denied': (e === null || e === void 0 ? void 0 : e.message) || "Vous n'avez pas accès à cette commande.",
        'functions/not-found': 'Commande introuvable.',
        'functions/unauthenticated': "Votre session a expiré, reconnectez-vous.",
        'functions/invalid-argument': (e === null || e === void 0 ? void 0 : e.message) || 'Code incorrect.',
        'functions/resource-exhausted': (e === null || e === void 0 ? void 0 : e.message) || 'Trop de tentatives — réessayez plus tard.',
    };
    return new DeliveryCodeError(code, (_a = messages[code]) !== null && _a !== void 0 ? _a : "😊 Petit souci technique — réessayez dans un instant.");
}
/** Livreur : accepte une commande 'en_preparation'. Génère le code côté serveur. */
async function claimOrder(orderId) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'claimOrder');
        await (0, callWithRetry_1.callWithRetry)(() => fn({ orderId }));
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
/** Checkout sans compte : session invité (sans mot de passe, sans SMS) avant création de la commande. */
async function startGuestCheckoutSession(phone, name) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'startGuestCheckoutSession');
        const res = await (0, callWithRetry_1.callWithRetry)(() => fn({ phone, name }));
        await (0, auth_1.signInWithCustomToken)(firebase_1.auth, res.data.customToken);
        return res.data.guestPhone;
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
/** Livreur : transmet le code que le client vient de lui dicter. */
async function confirmDeliveryWithCode(orderId, code) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'confirmDeliveryWithCode');
        await fn({ orderId, code }); // pas de retry ici : un code faux ne doit jamais être rejoué automatiquement
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
/** Client (avec compte) : lit son propre code de livraison. */
async function getDeliveryCode(orderId) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'getDeliveryCode');
        const res = await (0, callWithRetry_1.callWithRetry)(() => fn({ orderId }));
        return res.data.code;
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
/** Admin uniquement : code de référence + historique des tentatives ratées,
 * pour trancher un litige "le code était bon et ça a refusé" avec des faits
 * plutôt qu'en devinant (voir getDeliveryCodeAdmin côté serveur). */
async function getDeliveryCodeAdmin(orderId) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'getDeliveryCodeAdmin');
        const res = await (0, callWithRetry_1.callWithRetry)(() => fn({ orderId }));
        return res.data;
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
/** Invité, étape 1 : retrouve ses commandes actives par téléphone (aucun code renvoyé ici). */
async function findGuestOrders(phone) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'findGuestOrders');
        const res = await fn({ phone });
        return res.data.orders;
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
/** Invité, étape 2 : confirme sa commande → session sans mot de passe, sans SMS. */
async function claimGuestOrderSession(orderId, phone) {
    try {
        const fn = (0, functions_1.httpsCallable)(functions, 'claimGuestOrderSession');
        const res = await fn({ orderId, phone });
        await (0, auth_1.signInWithCustomToken)(firebase_1.auth, res.data.customToken);
    }
    catch (e) {
        throw toDeliveryCodeError(e);
    }
}
