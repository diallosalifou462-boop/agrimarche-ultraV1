"use strict";
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
exports.remindUnconfirmedDelivery = exports.notifyNewReview = exports.notifyLowStock = exports.notifyOrderStatusStep = exports.notifyOrderCancelled = exports.notifyNewOrder = exports.notifyNewProduct = exports.onUserTokenSync = exports.processEmailQueue = void 0;
const functions = __importStar(require("firebase-functions/v2"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
admin.initializeApp();
exports.processEmailQueue = functions.firestore.onDocumentCreated({
    document: 'email_queue/{docId}',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 60,
    region: 'us-central1'
}, async (event) => {
    const snapshot = event.data;
    if (!snapshot)
        return;
    const data = snapshot.data();
    const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
    try {
        console.log(`📧 Envoi réel à: ${data.to}`);
        const { error } = await resend.emails.send({
            from: 'AgriMarché <onboarding@resend.dev>',
            to: data.to,
            subject: data.subject,
            html: `<div><h2>🌿 AgriMarché</h2><p>${data.body}</p></div>`,
        });
        if (error)
            throw new Error(error.message);
        await snapshot.ref.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`✅ Email envoyé à ${data.to}`);
    }
    catch (error) {
        console.error(`❌ Erreur: ${error.message}`);
        await snapshot.ref.update({
            status: 'failed',
            error: error.message
        });
    }
});
// ============================================================
//   NOTIFICATIONS PUSH (FCM) + EN-APP
// ============================================================
// Écrit une notification dans notifications/{userId}/items (pour la
// cloche en-app) et retourne l'id créé.
async function writeNotification(userId, payload) {
    var _a;
    try {
        await admin.firestore().collection('notifications').doc(userId).collection('items').add({
            title: payload.title,
            body: payload.body,
            type: payload.type,
            data: (_a = payload.data) !== null && _a !== void 0 ? _a : {},
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    }
    catch (err) {
        console.error(`❌ Erreur écriture notification pour ${userId}:`, err);
    }
}
// Envoie un push direct à un ou plusieurs utilisateurs connus (commande,
// annulation...) — pas pour la diffusion large, voir sendToTopic pour ça.
async function sendToUsers(userIds, notification, data = {}) {
    var _a;
    const uniqueIds = [...new Set(userIds)].filter(Boolean);
    if (uniqueIds.length === 0)
        return;
    const userSnaps = await admin.firestore().getAll(...uniqueIds.map((id) => admin.firestore().collection('users').doc(id)));
    const tokens = [];
    for (const snap of userSnaps) {
        const token = snap.exists ? (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.fcmToken : null;
        if (token)
            tokens.push(token);
    }
    if (tokens.length > 0) {
        try {
            const res = await admin.messaging().sendEachForMulticast({ tokens, notification, data });
            console.log(`📲 Push envoyé : ${res.successCount}/${tokens.length} succès`);
        }
        catch (err) {
            console.error('❌ Erreur envoi push:', err);
        }
    }
    // Historique en-app pour chaque destinataire, indépendamment du push.
    await Promise.all(uniqueIds.map((id) => { var _a; return writeNotification(id, { title: notification.title, body: notification.body, type: (_a = data.type) !== null && _a !== void 0 ? _a : 'info', data }); }));
}
// Abonne le token FCM de l'utilisateur au topic 'buyers' ou 'sellers' selon
// son rôle, dès qu'un token est enregistré/mis à jour sur son profil. Ça
// permet de diffuser à "tous les acheteurs" en un seul envoi (un topic),
// plutôt que de charger et boucler sur tous les documents users à chaque
// nouveau produit — ce qui ne tiendrait pas à l'échelle.
exports.onUserTokenSync = functions.firestore.onDocumentWritten({ document: 'users/{userId}', region: 'us-central1' }, async (event) => {
    var _a;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const data = after.data();
    const token = data === null || data === void 0 ? void 0 : data.fcmToken;
    if (!token)
        return;
    const topic = data.role === 'seller' ? 'sellers' : 'buyers';
    try {
        await admin.messaging().subscribeToTopic([token], topic);
        console.log(`🔔 Token abonné au topic "${topic}" pour ${event.params.userId}`);
    }
    catch (err) {
        console.error('❌ Erreur abonnement topic:', err);
    }
});
// Nouveau produit → diffusion à tous les acheteurs via le topic 'buyers'.
// Pas d'écriture individuelle dans notifications/{userId} ici : avec une
// diffusion large, un doc par acheteur à chaque produit ajouté ferait
// exploser les écritures Firestore. Le push suffit ; l'historique en-app
// reste réservé aux notifications personnelles (commandes, annulations).
exports.notifyNewProduct = functions.firestore.onDocumentCreated({ document: 'products/{productId}', region: 'us-central1' }, async (event) => {
    var _a;
    const product = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!product)
        return;
    try {
        await admin.messaging().send({
            topic: 'buyers',
            notification: {
                title: 'Nouveau produit 🌾',
                body: `${product.name} est maintenant disponible sur AgriMarché`,
            },
            data: { type: 'new_product', productId: event.params.productId },
        });
        console.log(`📣 Diffusion "nouveau produit" envoyée pour ${product.name}`);
    }
    catch (err) {
        console.error('❌ Erreur diffusion nouveau produit:', err);
    }
});
// Nouvelle commande → notifie l'acheteur ET le vendeur.
exports.notifyNewOrder = functions.firestore.onDocumentCreated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d;
    const order = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!order)
        return;
    const total = (_d = (_c = (_b = order.total) === null || _b === void 0 ? void 0 : _b.toLocaleString) === null || _c === void 0 ? void 0 : _c.call(_b, 'fr-FR')) !== null && _d !== void 0 ? _d : order.total;
    await Promise.all([
        sendToUsers([order.userId], { title: 'Commande reçue ✅', body: `Votre commande de ${total} FCFA a bien été enregistrée.` }, { type: 'order_created', orderId: event.params.orderId }),
        order.sellerId
            ? sendToUsers([order.sellerId], { title: 'Nouvelle commande 🛒', body: `Vous avez reçu une nouvelle commande de ${total} FCFA.` }, { type: 'order_created', orderId: event.params.orderId })
            : Promise.resolve(),
    ]);
});
// Commande annulée → notifie l'acheteur ET le vendeur, uniquement au
// moment où le statut BASCULE vers 'annule' (pas à chaque update).
// ✅ FIX : 'cancelled' → 'annule' pour matcher les statuts réellement
//         écrits par l'app (voir firestore.rules / SellerOrdersPage).
exports.notifyOrderCancelled = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.status === 'annule' || after.status !== 'annule')
        return;
    const recipients = [after.userId, after.sellerId].filter(Boolean);
    await sendToUsers(recipients, { title: 'Commande annulée ❌', body: `La commande #${event.params.orderId.slice(0, 6)} a été annulée.` }, { type: 'order_cancelled', orderId: event.params.orderId });
});
// ============================================================
//   1. CHAQUE ÉTAPE DE LA COMMANDE
// ============================================================
// Notifie l'acheteur à chaque changement de statut suivi
// (en_preparation, en_livraison, livre). 'annule' et 'en_attente'
// sont déjà gérés par les fonctions dédiées ci-dessus.
const STEP_NOTIFICATIONS = {
    en_preparation: {
        title: 'Commande en préparation 👨‍🌾',
        body: (id) => `Votre commande #${id.slice(0, 6)} est en cours de préparation.`,
    },
    en_livraison: {
        title: 'Commande en livraison 🚚',
        body: (id) => `Votre commande #${id.slice(0, 6)} est en route vers vous.`,
    },
    livre: {
        title: 'Commande livrée ✅',
        body: (id) => `Votre commande #${id.slice(0, 6)} a été livrée. Merci pour votre confiance !`,
    },
};
exports.notifyOrderStatusStep = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.status === after.status)
        return;
    const step = STEP_NOTIFICATIONS[after.status];
    if (!step)
        return;
    await sendToUsers([after.userId], { title: step.title, body: step.body(event.params.orderId) }, { type: 'order_status', orderId: event.params.orderId, status: after.status });
});
// ============================================================
//   2. STOCK FAIBLE / RUPTURE DE STOCK (alerte vendeur)
// ============================================================
const LOW_STOCK_THRESHOLD = 5;
exports.notifyLowStock = functions.firestore.onDocumentUpdated({ document: 'products/{productId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after || !after.sellerId)
        return;
    const beforeStock = (_c = before.stock) !== null && _c !== void 0 ? _c : 0;
    const afterStock = (_d = after.stock) !== null && _d !== void 0 ? _d : 0;
    if (beforeStock === afterStock)
        return;
    // Rupture : uniquement au moment où on passe à 0
    if (afterStock <= 0 && beforeStock > 0) {
        await sendToUsers([after.sellerId], { title: 'Rupture de stock ⚠️', body: `"${after.name}" est en rupture de stock.` }, { type: 'stock_out', productId: event.params.productId });
        return;
    }
    // Stock faible : uniquement au moment où on passe sous le seuil
    if (afterStock > 0 && afterStock <= LOW_STOCK_THRESHOLD && beforeStock > LOW_STOCK_THRESHOLD) {
        await sendToUsers([after.sellerId], { title: 'Stock faible 📉', body: `Il ne reste que ${afterStock} unité(s) de "${after.name}".` }, { type: 'stock_low', productId: event.params.productId });
    }
});
// ============================================================
//   3. NOUVEL AVIS CLIENT (alerte vendeur)
// ============================================================
exports.notifyNewReview = functions.firestore.onDocumentCreated({ document: 'reviews/{reviewId}', region: 'us-central1' }, async (event) => {
    var _a, _b;
    const review = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(review === null || review === void 0 ? void 0 : review.sellerId))
        return;
    const rating = Math.max(1, Math.min(5, (_b = review.rating) !== null && _b !== void 0 ? _b : 5));
    const stars = '⭐'.repeat(rating);
    const excerpt = review.comment ? String(review.comment).slice(0, 80) : 'Un client a laissé un avis.';
    await sendToUsers([review.sellerId], { title: 'Nouvel avis client 📝', body: `${stars} — ${excerpt}` }, { type: 'new_review', reviewId: event.params.reviewId });
});
// ============================================================
//   4. RAPPEL DE COMMANDE NON CONFIRMÉE APRÈS LIVRAISON
// ============================================================
// Tourne toutes les heures : relance une seule fois (reminderSentAt)
// les commandes en 'en_livraison' depuis plus de 24h sans confirmation.
exports.remindUnconfirmedDelivery = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
    var _a, _b, _c;
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000; // 24h
    const snap = await admin.firestore()
        .collection('orders')
        .where('status', '==', 'en_livraison')
        .get();
    const batch = admin.firestore().batch();
    let count = 0;
    for (const docSnap of snap.docs) {
        const order = docSnap.data();
        if (order.reminderSentAt)
            continue; // déjà relancé une fois
        const updatedAtMs = (_c = (_b = (_a = order.updatedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        if (updatedAtMs === 0 || updatedAtMs > cutoffMs)
            continue; // pas encore assez ancien
        await sendToUsers([order.userId], {
            title: 'Votre commande est arrivée ? 📦',
            body: `N'oubliez pas de confirmer la réception de votre commande #${docSnap.id.slice(0, 6)}.`,
        }, { type: 'delivery_reminder', orderId: docSnap.id });
        batch.update(docSnap.ref, { reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
        count++;
    }
    if (count > 0)
        await batch.commit();
    console.log(`⏰ ${count} relance(s) de livraison envoyée(s).`);
});
