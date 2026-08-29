"use strict";
// ============================================================
//   CODE DE LIVRAISON — le code appartient au client.
// ============================================================
// Règle fondamentale (voir échange produit) : le livreur ne voit JAMAIS
// le code en clair. Il le demande au client, le saisit, et c'est le
// serveur — jamais le frontend — qui tranche. Symétriquement, le SMS
// n'est plus le mécanisme de diffusion : le code vit dans l'app, lisible
// uniquement par le propriétaire de la commande (compte réel OU session
// invité créée à la volée, sans mot de passe, à partir du seul numéro
// de téléphone saisi au checkout).
//
// Trois familles de fonctions ici :
//   1. claimOrder / confirmDeliveryWithCode — cycle de vie du code
//   2. getDeliveryCode                      — lecture par le propriétaire
//   3. findGuestOrders / claimGuestOrderSession — accès sans compte
//
// Toutes utilisent des transactions Firestore pour éviter les doubles
// validations et les races entre deux appareils.
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
exports.startGuestCheckoutSession = exports.claimGuestOrderSession = exports.findGuestOrders = exports.getDeliveryCode = exports.confirmDeliveryWithCode = exports.claimOrder = void 0;
const crypto = __importStar(require("crypto"));
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const REGION = 'us-central1';
// ── Utilitaires ──────────────────────────────────────────────────────
function generateFourDigitCode() {
    // crypto.randomInt est cryptographiquement sûr — Math.random() ne
    // l'est pas et n'a rien à faire dans la génération d'un code de
    // sécurité, même à 4 chiffres.
    return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}
function hashCode(code, salt) {
    return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
}
function normalizePhone(raw) {
    return String(raw || '').replace(/[^\d+]/g, '');
}
/** uid déterministe par numéro — un même invité, à la commande comme à la
 * récupération de son code, retrouve toujours le même compte. */
function guestUidFromPhone(normalizedPhone) {
    return `guest_${crypto.createHash('sha256').update(normalizedPhone).digest('hex').slice(0, 24)}`;
}
async function ensureGuestUser(uid, normalizedPhone, displayName) {
    const userRef = db().collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        await userRef.set({
            uid, phone: normalizedPhone, role: 'buyer', isGuest: true,
            displayName: displayName || 'Client AgriMarché',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
}
const db = () => admin.firestore();
// ============================================================
//   1. CYCLE DE VIE DU CODE
// ============================================================
/**
 * Remplace l'ancienne écriture directe côté client dans
 * delivery/dashboard/page.tsx::claimOrder. Comportement fonctionnel
 * IDENTIQUE (cible les commandes 'en_preparation', pose delivererId/
 * Name/Phone, fait passer status → 'en_livraison', tracking.phase →
 * 'assigned', miroir dans seller_orders) — seule différence : exécuté
 * en transaction Admin SDK côté serveur, ce qui permet d'y greffer la
 * génération sécurisée du code sans jamais l'exposer au livreur.
 */
exports.claimOrder = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Connectez-vous pour accepter une commande.');
    const { orderId } = (request.data || {});
    if (!orderId)
        throw new https_1.HttpsError('invalid-argument', 'orderId manquant.');
    const delivererSnap = await db().collection('users').doc(uid).get();
    const deliverer = delivererSnap.data();
    if (!delivererSnap.exists || (deliverer === null || deliverer === void 0 ? void 0 : deliverer.role) !== 'delivery') {
        throw new https_1.HttpsError('permission-denied', 'Seuls les livreurs peuvent accepter une commande.');
    }
    const orderRef = db().collection('orders').doc(orderId);
    const sellerOrderRef = db().collection('seller_orders').doc(orderId);
    const plainCode = await db().runTransaction(async (tx) => {
        // IMPORTANT : Firestore exige que TOUTES les lectures d'une transaction
        // soient effectuées avant TOUTE écriture. Les deux tx.get() sont donc
        // regroupés ici, avant le premier tx.set() plus bas. (Bug précédent :
        // sellerOrderRef était lu après le premier tx.set(orderRef, ...), ce qui
        // fait échouer la transaction à coup sûr avec une erreur interne générique
        // — d'où le message "Petit souci technique" quasi systématique.)
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists)
            throw new https_1.HttpsError('not-found', 'Commande introuvable.');
        const order = orderSnap.data();
        if (order.delivererId && order.delivererId !== uid) {
            throw new https_1.HttpsError('failed-precondition', "Cette commande vient d'être prise par un autre livreur.");
        }
        if (order.delivererId === uid) {
            // Rejeu (callWithRetry) après une 1ère tentative qui a en fait réussi
            // côté serveur mais dont la réponse ne nous est jamais revenue
            // (timeout réseau, etc.) : c'est le même livreur, rien à refaire.
            return null;
        }
        if (order.status !== 'en_preparation' && order.status !== 'en_attente') {
            throw new https_1.HttpsError('failed-precondition', "Cette commande n'est plus disponible.");
        }
        const sellerOrderSnap = await tx.get(sellerOrderRef);
        // Règle #4 du cahier des charges : un seul code, jamais régénéré —
        // utile si cette fonction est rejouée après une coupure réseau.
        const salt = order.deliveryCodeSalt || crypto.randomBytes(8).toString('hex');
        const code = order.deliveryCodeHash ? null : generateFourDigitCode();
        const payload = {
            delivererId: uid,
            delivererName: deliverer.displayName || deliverer.name || 'Livreur',
            delivererPhone: deliverer.phone || '',
            delivererAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        // Si le vendeur a déjà confirmé (en_preparation), la prise en charge
        // du livreur démarre immédiatement la livraison — comportement
        // historique inchangé. Si la commande est encore 'en_attente' (le
        // vendeur ne l'a pas encore confirmée), le livreur se positionne à
        // l'avance : delivererId est posé, mais `status` ne bouge pas tant
        // que le vendeur n'a pas confirmé — c'est cette confirmation,
        // ailleurs, qui fera passer la commande à 'en_preparation' puis
        // 'en_livraison'.
        if (order.status === 'en_preparation') {
            payload.status = 'en_livraison';
            payload['tracking.phase'] = 'assigned';
        }
        if (code) {
            payload.deliveryCodeHash = hashCode(code, salt);
            payload.deliveryCodeSalt = salt;
            payload.deliveryCodeAttempts = 0;
            payload.deliveryCodeUsedAt = null;
        }
        // À partir d'ici, plus aucune lecture — uniquement des écritures.
        tx.set(orderRef, payload, { merge: true });
        if (sellerOrderSnap.exists)
            tx.set(sellerOrderRef, payload, { merge: true });
        // Le code EN CLAIR ne vit que dans une sous-collection à part,
        // jamais renvoyée par une lecture Firestore classique de la
        // commande — seule la fonction getDeliveryCode, après vérification
        // d'ownership, y accède. C'est ce qui garantit la règle #8 (le
        // livreur ne voit jamais 5827) même si les règles Firestore
        // autorisent par ailleurs le livreur à lire le document 'orders'.
        if (code) {
            tx.set(orderRef.collection('secure').doc('delivery'), {
                code,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
        return code;
    });
    console.log(`🚚 Commande ${orderId} acceptée par ${uid}${plainCode ? ' — code généré' : ' — code déjà existant'}`);
    return { success: true };
});
const MAX_CODE_ATTEMPTS = 5;
/**
 * Remplace markAsDelivered (qui validait la livraison sur un simple
 * `confirm()` navigateur, sans aucune vérification). Le livreur transmet
 * ici le code que le CLIENT vient de lui dicter — jamais l'inverse.
 */
exports.confirmDeliveryWithCode = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Connectez-vous.');
    const { orderId, code } = (request.data || {});
    if (!orderId || !code)
        throw new https_1.HttpsError('invalid-argument', 'orderId et code requis.');
    const orderRef = db().collection('orders').doc(orderId);
    const sellerOrderRef = db().collection('seller_orders').doc(orderId);
    const legacy = await db().runTransaction(async (tx) => {
        var _a;
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists)
            throw new https_1.HttpsError('not-found', 'Commande introuvable.');
        const order = orderSnap.data();
        if (order.delivererId !== uid) {
            throw new https_1.HttpsError('permission-denied', "Vous n'êtes pas le livreur assigné à cette commande.");
        }
        if (order.status === 'livre') {
            throw new https_1.HttpsError('failed-precondition', 'Cette commande a déjà été livrée.');
        }
        if (order.deliveryCodeUsedAt) {
            throw new https_1.HttpsError('failed-precondition', 'Ce code a déjà servi — impossible de confirmer deux fois.');
        }
        const now = admin.firestore.FieldValue.serverTimestamp();
        const payload = {
            status: 'livre', statusLabel: 'Livrée',
            deliveredAt: now, updatedAt: now, 'tracking.enabled': false,
        };
        if (!order.deliveryCodeHash) {
            // Règle #13 (compatibilité ascendante) : commande créée avant ce
            // système, jamais de deliveryCode — on ne bloque pas une livraison
            // légitime qui n'a simplement jamais eu de code à vérifier.
            const sellerOrderSnap = await tx.get(sellerOrderRef);
            tx.set(orderRef, payload, { merge: true });
            if (sellerOrderSnap.exists)
                tx.set(sellerOrderRef, payload, { merge: true });
            return true;
        }
        const attempts = (_a = order.deliveryCodeAttempts) !== null && _a !== void 0 ? _a : 0;
        if (attempts >= MAX_CODE_ATTEMPTS) {
            throw new https_1.HttpsError('resource-exhausted', 'Trop de tentatives sur cette commande — contactez le support AgriMarché.');
        }
        const submitted = hashCode(String(code).trim(), order.deliveryCodeSalt);
        if (submitted !== order.deliveryCodeHash) {
            tx.set(orderRef, { deliveryCodeAttempts: attempts + 1 }, { merge: true });
            throw new https_1.HttpsError('invalid-argument', 'Code incorrect.');
        }
        payload.deliveryCodeUsedAt = now;
        const sellerOrderSnap = await tx.get(sellerOrderRef);
        tx.set(orderRef, payload, { merge: true });
        if (sellerOrderSnap.exists)
            tx.set(sellerOrderRef, payload, { merge: true });
        return false;
    });
    console.log(`✅ Livraison confirmée par code pour ${orderId} (legacy: ${legacy})`);
    // Notifications acheteur/vendeur : voir notifyOrderStatusStep, déclenché
    // automatiquement par l'écriture status → 'livre' ci-dessus. Rien à
    // envoyer manuellement ici.
    return { success: true };
});
// ============================================================
//   2. LECTURE DU CODE PAR LE PROPRIÉTAIRE
// ============================================================
exports.getDeliveryCode = (0, https_1.onCall)({ region: REGION }, async (request) => {
    var _a;
    const uid = (_a = request.auth) === null || _a === void 0 ? void 0 : _a.uid;
    if (!uid)
        throw new https_1.HttpsError('unauthenticated', 'Connectez-vous pour voir votre code.');
    const { orderId } = (request.data || {});
    if (!orderId)
        throw new https_1.HttpsError('invalid-argument', 'orderId manquant.');
    const orderRef = db().collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists)
        throw new https_1.HttpsError('not-found', 'Commande introuvable.');
    const order = orderSnap.data();
    if (order.userId !== uid) {
        throw new https_1.HttpsError('permission-denied', "Ce n'est pas votre commande.");
    }
    const secureSnap = await orderRef.collection('secure').doc('delivery').get();
    if (!secureSnap.exists) {
        return { code: null, reason: 'not_generated' };
    }
    return { code: secureSnap.data().code, reason: 'ok' };
});
// ============================================================
//   3. ACCÈS INVITÉ — retrouver sa commande sans SMS ni mot de passe
// ============================================================
// Le livreur est physiquement présent et vérifie déjà l'adresse : c'est
// cette présence qui constitue la vraie barrière de sécurité pour un
// invité, pas un deuxième canal (OTP/SMS). Le numéro de téléphone saisi
// au checkout suffit donc comme identifiant, à condition d'être
// rate-limité sérieusement pour empêcher tout brute-force.
const GUEST_WINDOW_MS = 60 * 60 * 1000;
const GUEST_MAX_ATTEMPTS = 8;
async function checkGuestRateLimit(key) {
    const ref = db().collection('guestAccessAttempts').doc(key);
    await db().runTransaction(async (tx) => {
        var _a, _b, _c;
        const snap = await tx.get(ref);
        const data = snap.data();
        const now = Date.now();
        const windowStart = (_a = data === null || data === void 0 ? void 0 : data.windowStartMs) !== null && _a !== void 0 ? _a : 0;
        if (now - windowStart > GUEST_WINDOW_MS) {
            tx.set(ref, { windowStartMs: now, count: 1 });
            return;
        }
        if (((_b = data === null || data === void 0 ? void 0 : data.count) !== null && _b !== void 0 ? _b : 0) >= GUEST_MAX_ATTEMPTS) {
            throw new https_1.HttpsError('resource-exhausted', 'Trop de tentatives — réessayez dans une heure.');
        }
        tx.set(ref, { windowStartMs: windowStart, count: ((_c = data === null || data === void 0 ? void 0 : data.count) !== null && _c !== void 0 ? _c : 0) + 1 }, { merge: true });
    });
}
/**
 * Étape 1 : le client tape son numéro. On ne renvoie JAMAIS le code ici
 * — seulement de quoi reconnaître sa propre commande sans ambiguïté.
 */
exports.findGuestOrders = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const { phone } = (request.data || {});
    if (!phone)
        throw new https_1.HttpsError('invalid-argument', 'Numéro de téléphone requis.');
    const normalized = normalizePhone(phone);
    if (normalized.length < 8)
        throw new https_1.HttpsError('invalid-argument', 'Numéro invalide.');
    await checkGuestRateLimit(normalized);
    const snap = await db()
        .collection('orders')
        .where('guestPhone', '==', normalized)
        .where('status', 'in', ['en_preparation', 'en_livraison'])
        .limit(5)
        .get();
    return {
        orders: snap.docs.map((d) => {
            var _a, _b, _c, _d, _e, _f;
            const o = d.data();
            const items = Array.isArray(o.items) ? o.items : [];
            const summary = items.length
                ? `${(_b = (_a = items[0]) === null || _a === void 0 ? void 0 : _a.quantity) !== null && _b !== void 0 ? _b : 1}× ${(_d = (_c = items[0]) === null || _c === void 0 ? void 0 : _c.productName) !== null && _d !== void 0 ? _d : 'Produit'}${items.length > 1 ? ` +${items.length - 1}` : ''}`
                : `Commande #${d.id.slice(0, 6)}`;
            return {
                orderId: d.id,
                summary,
                total: (_e = o.total) !== null && _e !== void 0 ? _e : null,
                sellerName: (_f = o.sellerName) !== null && _f !== void 0 ? _f : null,
                status: o.status,
            };
        }),
    };
});
/**
 * Étape 2 : le client confirme laquelle est la sienne. On crée (ou
 * retrouve) un compte invité déterministe lié au numéro, on lie la
 * commande à ce compte (conversion progressive — objectif business
 * §12), et on renvoie un custom token de connexion instantanée, sans
 * mot de passe, sans SMS.
 */
exports.claimGuestOrderSession = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const { orderId, phone } = (request.data || {});
    if (!orderId || !phone)
        throw new https_1.HttpsError('invalid-argument', 'orderId et téléphone requis.');
    const normalized = normalizePhone(phone);
    await checkGuestRateLimit(`${normalized}:claim`);
    const orderRef = db().collection('orders').doc(orderId);
    const orderSnap = await orderRef.get();
    if (!orderSnap.exists)
        throw new https_1.HttpsError('not-found', 'Commande introuvable.');
    const order = orderSnap.data();
    if (order.guestPhone !== normalized) {
        throw new https_1.HttpsError('permission-denied', 'Ce numéro ne correspond pas à cette commande.');
    }
    const uid = guestUidFromPhone(normalized);
    await ensureGuestUser(uid, normalized);
    if (!order.userId) {
        await orderRef.set({ userId: uid }, { merge: true });
    }
    let customToken;
    try {
        customToken = await admin.auth().createCustomToken(uid, { guest: true });
    }
    catch (err) {
        console.error('❌ Erreur création token invité:', err);
        throw new https_1.HttpsError('internal', 'Impossible de générer votre accès — réessayez.');
    }
    console.log(`🔓 Session invité créée pour la commande ${orderId} (uid ${uid})`);
    return { customToken };
});
// ============================================================
//   4. DÉMARRER UNE COMMANDE SANS COMPTE — au checkout
// ============================================================
// Avant : checkout/page.tsx bloquait tout achat sans compte (redirect
// /auth/login), ce qui aurait forcé un OTP SMS pour créer un compte
// juste pour commander — exactement le coût qu'on cherche à éviter.
// Ici : même schéma d'uid déterministe que claimGuestOrderSession, mais
// appelé AVANT la création de la commande, pour que le client reparte
// avec une session (signInWithCustomToken) et un userId Firestore valide
// dès le premier clic — sans jamais passer par un SMS.
exports.startGuestCheckoutSession = (0, https_1.onCall)({ region: REGION }, async (request) => {
    const { phone, name } = (request.data || {});
    if (!phone)
        throw new https_1.HttpsError('invalid-argument', 'Numéro de téléphone requis.');
    const normalized = normalizePhone(phone);
    if (normalized.length < 8)
        throw new https_1.HttpsError('invalid-argument', 'Numéro invalide.');
    await checkGuestRateLimit(`${normalized}:checkout`);
    const uid = guestUidFromPhone(normalized);
    await ensureGuestUser(uid, normalized, name);
    let customToken;
    try {
        customToken = await admin.auth().createCustomToken(uid, { guest: true });
    }
    catch (err) {
        console.error('❌ Erreur création token invité (checkout):', err);
        throw new https_1.HttpsError('internal', 'Impossible de démarrer votre commande — réessayez.');
    }
    console.log(`🛒 Session invité démarrée pour checkout (uid ${uid})`);
    return { customToken, guestPhone: normalized };
});
