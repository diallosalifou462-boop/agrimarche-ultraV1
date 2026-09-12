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
exports.cleanupRegistrationLeftovers = exports.cleanupRegistrationRateLimits = exports.cleanupProcessedEvents = exports.notifyDeliveryPhaseChange = exports.checkDeliveryProximity = exports.weeklyInterestDigest = exports.notifyRestockMatch = exports.flushQueuedPersonalizedNotifications = exports.syncProductSearchKeywords = exports.remindUnconfirmedDelivery = exports.notifyNewReview = exports.notifyDelivererClaimed = exports.notifyLowStock = exports.notifyOrderStatusStep = exports.notifyOrderCancelled = exports.notifyNewOrder = exports.notifyNewProduct = exports.onUserTokenSync = exports.processEmailQueue = exports.getRegistrationMetrics = exports.checkRegistrationHealth = exports.resetPasswordVerifyOtp = exports.resetPasswordSendOtp = exports.loginVerifyOtp = exports.loginSendOtp = exports.completeOrangeRegistration = exports.registrationVerify = exports.registrationResend = exports.registrationStart = exports.startGuestCheckoutSession = exports.claimGuestOrderSession = exports.findGuestOrders = exports.getDeliveryCodeAdmin = exports.getDeliveryCode = exports.confirmDeliveryWithCode = exports.claimOrder = exports.submitReview = exports.updateOrderStatus = void 0;
// ============================================================
//   index.ts — FUSION du système de notifications avancé
//   (idempotence, tokens FCM en sous-collection, digest hebdo,
//   suivi GPS par phases) avec le système de code de livraison
//   (deliveryCode.ts).
//
//   Schémas vérifiés contre le vrai code frontend (useFCMToken.ts,
//   NotificationProvider.tsx) :
//   ✅ Tokens FCM : sous-collection users/{uid}/tokens/{token}
//   ✅ Notifications in-app : collection racine 'notifications',
//      filtrée par where('userId', '==', uid) — pas de sous-collection
//
//   Reste à vérifier avant de déployer :
//   1. normalizeKeyword.ts (extractKeywords) n'existait pas dans
//      functions/src/ — confirmé en inspectant le vrai dossier. Fourni
//      à part avec ce fichier ; à copier dans functions/src/.
//   2. Ce fichier n'a, à ma connaissance, jamais été déployé (le
//      functions/src/index.ts actuel fait 325 lignes, sans aucune de
//      ces fonctions) — à tester en émulateur avant `firebase deploy`.
// ============================================================
const functions = __importStar(require("firebase-functions/v2"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const resend_1 = require("resend");
const normalizeKeyword_1 = require("./normalizeKeyword");
const rateLimit_1 = require("./rateLimit");
const registration_1 = require("./registration");
const phoneUniqueness_1 = require("./phoneUniqueness");
const fraud_1 = require("./fraud");
const loginOtp_1 = require("./loginOtp");
const passwordReset_1 = require("./passwordReset");
// Échappement HTML minimal — le corps d'un email de la queue peut contenir
// du texte dérivé d'une saisie utilisateur (nom de produit, message...).
// Sans échappement, ce texte est injecté tel quel dans le HTML de l'email
// envoyé (voir processEmailQueue), ce qui permettrait d'y glisser balises
// ou liens arbitraires.
function escapeHtml(input) {
    return String(input !== null && input !== void 0 ? input : '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
admin.initializeApp();
// Filet de sécurité : les payloads envoyés à Firestore dans ce fichier sont
// construits avec des `...(cond ? {...} : {})` pour éviter les valeurs
// `undefined` (rejetées par défaut par le SDK Admin), mais un seul oubli
// dans une future modification ferait planter silencieusement un trigger
// entier. Ce réglage rend ces valeurs simplement ignorées plutôt que fatales.
admin.firestore().settings({ ignoreUndefinedProperties: true });
// ============================================================
//   COMMANDES & AVIS — Cloud Functions callable (Admin SDK)
// ============================================================
// updateOrderStatus : confirmation de réception / annulation par le
// client. submitReview : création d'un avis lié à une commande. Les
// deux valident ownership + transition côté serveur en transaction —
// voir orderStatusTransitions.ts / reviewSubmission.ts pour le détail.
//
// ⚠️ Ces fonctions écrivent orders.status ('livre'/'annule') et des
// docs dans 'reviews'. Ça déclenche AUTOMATIQUEMENT les triggers
// notifyOrderStatusStep / notifyOrderCancelled / notifyNewReview
// définis plus bas dans ce fichier — aucun appel de notification à
// ajouter dans orderStatusTransitions.ts/reviewSubmission.ts, ce
// serait un doublon.
var orderStatusTransitions_1 = require("./orderStatusTransitions");
Object.defineProperty(exports, "updateOrderStatus", { enumerable: true, get: function () { return orderStatusTransitions_1.updateOrderStatus; } });
var reviewSubmission_1 = require("./reviewSubmission");
Object.defineProperty(exports, "submitReview", { enumerable: true, get: function () { return reviewSubmission_1.submitReview; } });
// ⚠️ Le code appartient au client, jamais au livreur (règle fondamentale
// du parcours de livraison) : claimOrder génère le code côté serveur et
// le range hors de portée du livreur ; confirmDeliveryWithCode est la
// SEULE porte par laquelle une commande peut désormais passer à 'livre'
// depuis le tableau de bord livreur. getDeliveryCode est la seule façon
// de lire le code, réservée au propriétaire de la commande. findGuestOrders
// / claimGuestOrderSession / startGuestCheckoutSession portent l'accès
// sans compte, sans SMS, sans mot de passe — voir deliveryCode.ts.
//
// Intégration avec le système de notifications ci-dessous : claimOrder
// pose delivererId (+ status → 'en_livraison' si le vendeur avait déjà
// confirmé) exactement dans les mêmes conditions que celles attendues par
// notifyDelivererClaimed plus bas — aucune modification nécessaire de ce
// trigger. confirmDeliveryWithCode écrit status → 'livre' et laisse
// intentionnellement notifyOrderStatusStep envoyer la notification
// (voir commentaire dans deliveryCode.ts) : ne pas ajouter d'envoi
// manuel dans deliveryCode.ts, ce serait un doublon.
var deliveryCode_1 = require("./deliveryCode");
Object.defineProperty(exports, "claimOrder", { enumerable: true, get: function () { return deliveryCode_1.claimOrder; } });
Object.defineProperty(exports, "confirmDeliveryWithCode", { enumerable: true, get: function () { return deliveryCode_1.confirmDeliveryWithCode; } });
Object.defineProperty(exports, "getDeliveryCode", { enumerable: true, get: function () { return deliveryCode_1.getDeliveryCode; } });
Object.defineProperty(exports, "getDeliveryCodeAdmin", { enumerable: true, get: function () { return deliveryCode_1.getDeliveryCodeAdmin; } });
Object.defineProperty(exports, "findGuestOrders", { enumerable: true, get: function () { return deliveryCode_1.findGuestOrders; } });
Object.defineProperty(exports, "claimGuestOrderSession", { enumerable: true, get: function () { return deliveryCode_1.claimGuestOrderSession; } });
Object.defineProperty(exports, "startGuestCheckoutSession", { enumerable: true, get: function () { return deliveryCode_1.startGuestCheckoutSession; } });
// ============================================================
//   INSCRIPTION — Expresso/Tigo (push-first, fallback InfoBip
//   uniquement en l'absence de token push) + Orange (Firebase
//   Phone Auth). Unicité du numéro garantie côté backend dans les
//   deux cas via phoneUniqueness.ts (collection partagée
//   `phoneIndex`). Voir registration.ts et orangeRegistration.ts
//   pour le détail du parcours.
// ============================================================
var registration_2 = require("./registration");
Object.defineProperty(exports, "registrationStart", { enumerable: true, get: function () { return registration_2.registrationStart; } });
Object.defineProperty(exports, "registrationResend", { enumerable: true, get: function () { return registration_2.registrationResend; } });
Object.defineProperty(exports, "registrationVerify", { enumerable: true, get: function () { return registration_2.registrationVerify; } });
var orangeRegistration_1 = require("./orangeRegistration");
Object.defineProperty(exports, "completeOrangeRegistration", { enumerable: true, get: function () { return orangeRegistration_1.completeOrangeRegistration; } });
var loginOtp_2 = require("./loginOtp");
Object.defineProperty(exports, "loginSendOtp", { enumerable: true, get: function () { return loginOtp_2.loginSendOtp; } });
Object.defineProperty(exports, "loginVerifyOtp", { enumerable: true, get: function () { return loginOtp_2.loginVerifyOtp; } });
var passwordReset_2 = require("./passwordReset");
Object.defineProperty(exports, "resetPasswordSendOtp", { enumerable: true, get: function () { return passwordReset_2.resetPasswordSendOtp; } });
Object.defineProperty(exports, "resetPasswordVerifyOtp", { enumerable: true, get: function () { return passwordReset_2.resetPasswordVerifyOtp; } });
// Alerting automatique (taux d'échec anormal) + endpoint dashboard admin.
var monitoring_1 = require("./monitoring");
Object.defineProperty(exports, "checkRegistrationHealth", { enumerable: true, get: function () { return monitoring_1.checkRegistrationHealth; } });
Object.defineProperty(exports, "getRegistrationMetrics", { enumerable: true, get: function () { return monitoring_1.getRegistrationMetrics; } });
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
        // ⚠️ TODO PROD : 'onboarding@resend.dev' est le domaine sandbox de
        // Resend — en free tier il ne délivre en pratique qu'à l'adresse du
        // compte propriétaire. À remplacer par un domaine vérifié
        // (ex: notifications@agrimarche.sn) avant tout envoi à de vrais
        // clients, sous peine d'emails jamais délivrés en production.
        const { error } = await resend.emails.send({
            from: 'AgriMarché <onboarding@resend.dev>',
            to: data.to,
            subject: data.subject,
            html: `<div><h2>🌿 AgriMarché</h2><p>${escapeHtml(data.body)}</p></div>`,
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
async function writeNotification(userId, payload) {
    var _a, _b, _c, _d, _e, _f;
    try {
        // ⚠️ FIX critique : ce chemin était auparavant
        // notifications/{userId}/items/{itemId} (sous-collection) — que
        // NI NotificationProvider.tsx (cloche in-app de tous les
        // utilisateurs, filtre where('userId','==',uid) sur la collection
        // RACINE) NI admin/page.tsx (flux de supervision, même collection
        // racine) ne lisent. Toute notification envoyée par une Cloud
        // Function — donc TOUTES les notifications de ce fichier, y compris
        // celles qui existaient déjà avant cette conversation (nouvelle
        // commande, stock bas, nouveau produit...) — partait bien en push,
        // mais restait invisible dans l'historique de l'utilisateur et dans
        // le panneau admin. Ce fix aligne le schéma d'écriture sur celui
        // utilisé par /api/notifications/send (route client), déjà lu
        // correctement par les deux écrans.
        await admin.firestore().collection('notifications').add(Object.assign(Object.assign({ userId, title: payload.title, body: payload.body, type: payload.type, icon: (_a = payload.icon) !== null && _a !== void 0 ? _a : '🔔', link: (_b = payload.link) !== null && _b !== void 0 ? _b : '/account/orders', deepLink: (_c = payload.link) !== null && _c !== void 0 ? _c : '/account/orders', priority: (_d = payload.priority) !== null && _d !== void 0 ? _d : 'medium', urgent: (_e = payload.urgent) !== null && _e !== void 0 ? _e : false }, (payload.image ? { image: payload.image } : {})), { data: (_f = payload.data) !== null && _f !== void 0 ? _f : {}, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() }));
    }
    catch (err) {
        console.error(`❌ Erreur écriture notification pour ${userId}:`, err);
    }
}
// ── Idempotence des triggers Firestore (Cloud Functions v2 / Eventarc) ────
// Eventarc garantit "au moins une fois", pas "exactement une fois" : en cas
// de timeout réseau, de redéploiement pendant l'exécution, ou de simple
// aléa d'infrastructure, le MÊME événement peut redéclencher exactement le
// même trigger une deuxième fois — avec le même event.id. Sans garde, un
// utilisateur reçoit alors deux notifications identiques pour un seul
// événement réel (commande créée, statut changé...), ce qui ressemble à un
// bug côté client et entame la confiance dans l'app. On enregistre chaque
// event.id traité dans une collection dédiée via une création atomique :
// la première tentative réussit et continue, toute tentative suivante pour
// le même event.id échoue sur un doc déjà existant et s'arrête là.
// "Fail open" volontaire si Firestore lui-même est indisponible : mieux
// vaut occasionnellement doubler une notification que ne jamais l'envoyer.
async function alreadyProcessed(eventId) {
    var _a;
    try {
        await admin.firestore().collection('_processedNotificationEvents').doc(eventId).create({
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return false;
    }
    catch (err) {
        if ((err === null || err === void 0 ? void 0 : err.code) === 6 || /ALREADY_EXISTS/i.test((_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : ''))
            return true;
        console.warn('⚠️ Vérification idempotence indisponible, envoi quand même:', err);
        return false;
    }
}
function summarizeItems(items) {
    if (!Array.isArray(items) || items.length === 0)
        return null;
    const line = (it) => { var _a, _b; return `${(_a = it.quantity) !== null && _a !== void 0 ? _a : 1}× ${(_b = it.productName) !== null && _b !== void 0 ? _b : 'Produit'}`; };
    const extra = items.length > 3 ? ` +${items.length - 3} autre${items.length - 3 > 1 ? 's' : ''}` : '';
    return items.slice(0, 3).map(line).join(', ') + extra;
}
function firstItemImage(items) {
    var _a;
    return Array.isArray(items) ? (_a = items.find((it) => it.image)) === null || _a === void 0 ? void 0 : _a.image : undefined;
}
// Petits "stickers" motivants ajoutés en fin de notif pour que ça fasse
// plaisir à recevoir plutôt qu'un simple constat froid — un tiré au sort
// à chaque envoi pour ne jamais être répétitif.
const SELLER_STICKERS = [
    '🌟 Tu es extraordinaire !',
    '🔥 Ça vend fort !',
    '🏆 Bravo, continue comme ça !',
    '💪 Excellent travail !',
    '🎉 Une vente de plus !',
    '👏 Bien joué !',
];
const BUYER_STICKERS = [
    '🥳 Merci pour votre confiance !',
    '💚 On prend soin de votre commande !',
    '✨ Ça va être délicieux !',
    '🙏 Merci d\'avoir choisi AgriMarché !',
];
function randomSticker(list) {
    return list[Math.floor(Math.random() * list.length)];
}
// ── Config plateforme FCM, factorisée (Android/iOS) ────────────────────────
// Reprise à l'identique par sendToUsers ET notifyNewProduct (avant : deux
// blocs android/apns dupliqués et déjà en train de diverger l'un de l'autre).
// Un seul endroit à ajuster pour changer le son, le canal Android ou le
// comportement iOS sur toutes les notifications de l'app.
//
// - priority 'high' partout videmment la batterie pour rien (Android réveille
//   le CPU immédiatement) ; seules les notifs urgentes/sensibles au temps le
//   justifient, le reste passe en 'normal' (livré dès que l'appareil est de
//   toute façon réveillé, sans forcer un réveil immédiat).
// - groupId (thread-id iOS / tag Android) : regroupe visuellement toutes les
//   notifs d'une même commande au lieu de les empiler comme des messages
//   sans rapport.
// - timeSensitive : iOS 15+ (aps.interruption-level) — traverse le mode
//   Concentration/Ne pas déranger pour ce qui compte vraiment (livreur
//   arrivé...), nécessite l'entitlement "Time Sensitive Notifications" côté
//   Xcode pour prendre effet, sinon dégradation silencieuse en 'active'.
// - ttlSeconds : une info périmée ("votre livreur est à 500m") livrée 2h
//   plus tard par FCM (appareil resté hors-ligne) induit plus qu'elle
//   n'aide — TTL court pour ce type d'événement plutôt que la valeur par
//   défaut de FCM (4 semaines).
function buildPushConfig(opts) {
    const highPriority = opts.urgent || opts.timeSensitive;
    return {
        android: Object.assign(Object.assign({ priority: highPriority ? 'high' : 'normal' }, (opts.ttlSeconds ? { ttl: opts.ttlSeconds * 1000 } : {})), { notification: Object.assign(Object.assign({ channelId: opts.urgent ? 'agrimarche_urgent' : 'agrimarche_default', sound: 'default' }, (opts.imageUrl ? { imageUrl: opts.imageUrl } : {})), (opts.groupId ? { tag: opts.groupId } : {})) }),
        apns: Object.assign(Object.assign(Object.assign({}, (opts.ttlSeconds ? { headers: { 'apns-expiration': String(Math.floor(Date.now() / 1000) + opts.ttlSeconds) } } : {})), { payload: {
                aps: Object.assign(Object.assign(Object.assign({ sound: 'default' }, (opts.imageUrl ? { 'mutable-content': 1 } : {})), (opts.groupId ? { 'thread-id': opts.groupId } : {})), (opts.timeSensitive ? { 'interruption-level': 'time-sensitive' } : {})),
            } }), (opts.imageUrl ? { fcmOptions: { imageUrl: opts.imageUrl } } : {})),
    };
}
// FCM rejette tout appel multicast au-delà de 500 tokens — découpe en lots.
// Réutilisé aussi pour Firestore ci-dessous : même limite de 500 par batch.
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}
// ⚠️ FIX critique : un WriteBatch Firestore est plafonné à 500 opérations —
// au-delà, `commit()` rejette l'intégralité du batch. dispatchPersonalized
// et flushQueuedPersonalizedNotifications peuvent recevoir des listes de
// userIds bien au-delà de 500 (ex: notifyRestockMatch agrège jusqu'à 500
// utilisateurs PAR mot-clé, sur 5 mots-clés). Sans ce découpage, la mise à
// jour de lastPersonalizedPushAt plantait silencieusement dans ce cas — le
// push, lui, était déjà parti (sendToUsers ne dépend pas de ce batch), donc
// l'échec se traduisait uniquement par un cap de fréquence jamais posé :
// bug invisible en usage normal, qui n'apparaît qu'à grande échelle.
async function setManyMerge(updates) {
    for (const group of chunk(updates, 500)) {
        const batch = admin.firestore().batch();
        group.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
        await batch.commit();
    }
}
// Codes d'erreur FCM qui signifient "ce token ne recevra plus jamais rien" —
// appareil désinstallé, token expiré, révoqué... Les laisser en base fait
// grossir indéfiniment les listes de tokens (chaque envoi devient plus lent
// et plus coûteux) et dégrade le taux de succès rapporté par FCM. Sur les
// autres erreurs (quota, indisponibilité momentanée...), on garde le token :
// ce n'est pas lui le problème.
const DEAD_TOKEN_ERROR_CODES = new Set([
    'messaging/invalid-registration-token',
    'messaging/registration-token-not-registered',
    'messaging/invalid-argument',
]);
// Une seule tentative de retry, avec un court délai, pour les erreurs
// clairement transitoires (indisponibilité momentanée du service FCM) — pas
// pour les erreurs de token, qui échoueraient de la même façon à chaque essai.
const TRANSIENT_ERROR_CODES = new Set([
    'messaging/internal-error',
    'messaging/server-unavailable',
    'messaging/timeout',
]);
async function sendMulticastWithCleanup(tokenOwners, // token → userId, pour savoir où supprimer en cas d'échec
notification, data, pushOpts) {
    const allTokens = [...tokenOwners.keys()];
    if (allTokens.length === 0)
        return { successCount: 0, failureCount: 0 };
    const pushConfig = buildPushConfig(Object.assign({ imageUrl: notification.imageUrl }, pushOpts));
    let successCount = 0;
    let failureCount = 0;
    const deadTokens = [];
    for (const batch of chunk(allTokens, 500)) {
        let res;
        try {
            res = await admin.messaging().sendEachForMulticast(Object.assign({ tokens: batch, notification, data }, pushConfig));
        }
        catch (err) {
            if (TRANSIENT_ERROR_CODES.has(err === null || err === void 0 ? void 0 : err.code)) {
                console.warn(`⏳ Erreur transitoire FCM, nouvelle tentative pour ${batch.length} token(s)...`);
                try {
                    res = await admin.messaging().sendEachForMulticast(Object.assign({ tokens: batch, notification, data }, pushConfig));
                }
                catch (retryErr) {
                    console.error('❌ Échec définitif après retry:', retryErr);
                    failureCount += batch.length;
                    continue;
                }
            }
            else {
                console.error('❌ Erreur envoi push (lot):', err);
                failureCount += batch.length;
                continue;
            }
        }
        successCount += res.successCount;
        failureCount += res.failureCount;
        res.responses.forEach((r, i) => {
            var _a, _b;
            if (!r.success && DEAD_TOKEN_ERROR_CODES.has((_b = (_a = r.error) === null || _a === void 0 ? void 0 : _a.code) !== null && _b !== void 0 ? _b : '')) {
                deadTokens.push(batch[i]);
            }
        });
    }
    if (deadTokens.length > 0) {
        const batchWrite = admin.firestore().batch();
        deadTokens.forEach((token) => {
            const userId = tokenOwners.get(token);
            if (userId)
                batchWrite.delete(admin.firestore().collection('users').doc(userId).collection('tokens').doc(token));
        });
        await batchWrite.commit();
        console.log(`🧹 ${deadTokens.length} token(s) mort(s) supprimé(s).`);
    }
    return { successCount, failureCount };
}
async function sendToUsers(userIds, notification, data = {}, pushOpts = {}) {
    const uniqueIds = [...new Set(userIds)].filter(Boolean);
    if (uniqueIds.length === 0)
        return;
    // ⚠️ FIX critique (alignement avec /api/notifications/send,
    // /api/send-push, /api/orders/notify-seller et AuthContext.tsx) : les
    // tokens FCM sont enregistrés par useFCMToken.ts dans la sous-collection
    // users/{uid}/tokens/{token} — jamais dans un champ userData.fcmToken,
    // qui n'existe plus nulle part côté écriture. Lire ce champ ici faisait
    // que cette fonction trouvait TOUJOURS 0 token et n'envoyait donc aucun
    // push, silencieusement (le doc in-app était quand même écrit plus bas,
    // ce qui masquait le problème). On lit maintenant la même sous-collection
    // que le reste de l'app, sur TOUS les appareils enregistrés par
    // utilisateur (un compte peut être connecté sur plusieurs téléphones).
    const tokensByUser = await Promise.all(uniqueIds.map((id) => admin.firestore().collection('users').doc(id).collection('tokens').get()));
    const tokenOwners = new Map();
    tokensByUser.forEach((snap, idx) => {
        snap.docs.forEach((d) => tokenOwners.set(d.id, uniqueIds[idx]));
    });
    if (tokenOwners.size > 0) {
        // groupId = orderId quand la notif en porte un : regroupe visuellement
        // (thread iOS / tag Android) tout ce qui concerne la même commande au
        // lieu d'empiler des notifs isolées sans lien apparent entre elles.
        const { successCount, failureCount } = await sendMulticastWithCleanup(tokenOwners, notification, data, {
            urgent: data.urgent === 'true',
            groupId: data.orderId,
            timeSensitive: pushOpts.timeSensitive,
            ttlSeconds: pushOpts.ttlSeconds,
        });
        console.log(`📲 Push envoyé : ${successCount}/${successCount + failureCount} succès`);
    }
    await Promise.all(uniqueIds.map((id) => {
        var _a;
        return writeNotification(id, {
            title: notification.title,
            body: notification.body,
            type: (_a = data.type) !== null && _a !== void 0 ? _a : 'info',
            link: data.link,
            data,
        });
    }));
}
// ⚠️ FIX critique : se déclenchait auparavant sur users/{userId} et lisait
// data.fcmToken — un champ jamais écrit par useFCMToken.ts (voir sendToUsers
// ci-dessus). Résultat : AUCUN appareil n'était jamais abonné aux topics
// "buyers"/"sellers", donc les diffusions de masse (notifyNewProduct) ne
// touchaient plus personne, même les nouveaux inscrits. On se déclenche
// maintenant sur la création de chaque token dans la sous-collection —
// c'est le seul endroit où le token existe réellement — et on va chercher
// le rôle sur le document utilisateur parent pour choisir le topic.
exports.onUserTokenSync = functions.firestore.onDocumentCreated({ document: 'users/{userId}/tokens/{tokenId}', region: 'us-central1' }, async (event) => {
    var _a;
    const token = event.params.tokenId; // l'ID du doc EST le token (voir useFCMToken.ts)
    if (!token)
        return;
    try {
        const userSnap = await admin.firestore().collection('users').doc(event.params.userId).get();
        const role = userSnap.exists ? (_a = userSnap.data()) === null || _a === void 0 ? void 0 : _a.role : undefined;
        const topic = role === 'seller' ? 'sellers' : 'buyers';
        await admin.messaging().subscribeToTopic([token], topic);
        console.log(`🔔 Token abonné au topic "${topic}" pour ${event.params.userId}`);
    }
    catch (err) {
        console.error('❌ Erreur abonnement topic:', err);
    }
});
// Duplique volontairement src/lib/categoryLink.ts : ce fichier tourne côté
// Cloud Functions (Node), il ne peut pas importer un module du dossier
// src/ de l'app Next.js. La logique DOIT rester identique à celle du
// frontend (src/app/category/page.tsx filtre avec le même slug), sinon la
// notif mène vers une page catégorie qui affiche "Aucun produit trouvé".
function categorySlug(category) {
    return (category || '').toLowerCase().trim().replace(/\s+/g, '-');
}
function categoryLink(category) {
    const slug = categorySlug(category);
    return slug ? `/category?category=${encodeURIComponent(slug)}` : '/main/products';
}
exports.notifyNewProduct = functions.firestore.onDocumentCreated({ document: 'products/{productId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c;
    const product = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!product)
        return;
    if (await alreadyProcessed(event.id))
        return;
    const priceLabel = typeof product.price === 'number'
        ? `${product.price.toLocaleString('fr-FR')} FCFA/${(_b = product.unit) !== null && _b !== void 0 ? _b : 'unité'}`
        : undefined;
    const image = Array.isArray(product.images) ? product.images[0] : undefined;
    const title = `🌾 Nouveau : ${product.name} !`;
    const sellerLabel = (_c = product.sellerName) !== null && _c !== void 0 ? _c : 'un producteur local';
    const body = priceLabel
        ? `Disponible dès maintenant chez ${sellerLabel}${product.region ? ` (${product.region})` : ''} — ${priceLabel}`
        : `${product.name} est maintenant disponible sur AgriMarché`;
    // ⚠️ FIX : pointait vers `/product?id=...` — la fiche de CE seul
    // produit. Un acheteur qui reçoit "🌾 Nouveau : Bananes !" et tape
    // sur la notif doit atterrir sur le rayon Fruits en entier (mêmes
    // bananes, plus tout le reste de la catégorie), pas être enfermé sur
    // une fiche unique.
    const link = categoryLink(product.category);
    // ── 0. Anti-spam en rafale : un vendeur qui publie tout son catalogue
    //    d'un coup (10-20 produits en quelques secondes) ne doit pas faire
    //    vibrer le téléphone de chaque acheteur 10-20 fois de suite. On
    //    garde une notification PAR produit dans l'historique in-app (rien
    //    n'est perdu — l'acheteur peut tout consulter dans la cloche 🔔),
    //    mais on ne renvoie un push qui interrompt réellement l'utilisateur
    //    que si le dernier produit de ce vendeur date d'il y a plus de 3
    //    minutes. "Fail open" volontaire, même logique qu'alreadyProcessed
    //    ci-dessus : si cette vérification échoue, on préfère un push en
    //    trop plutôt qu'aucun.
    const BURST_WINDOW_MS = 3 * 60 * 1000;
    let skipPush = false;
    if (product.sellerId) {
        try {
            const throttleRef = admin.firestore().collection('_sellerNewProductThrottle').doc(product.sellerId);
            await admin.firestore().runTransaction(async (tx) => {
                var _a, _b, _c, _d;
                const snap = await tx.get(throttleRef);
                const lastAt = snap.exists ? ((_d = (_c = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.lastPushAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0) : 0;
                skipPush = Date.now() - lastAt < BURST_WINDOW_MS;
                if (!skipPush) {
                    tx.set(throttleRef, { lastPushAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                }
            });
        }
        catch (err) {
            console.error('❌ Erreur vérification anti-spam nouveau produit:', err);
        }
    }
    // ── 1. Push instantané, par topic (efficace à grande échelle : un seul
    //    appel FCM touche tous les acheteurs abonnés, sans lire leurs
    //    tokens un par un — voir onUserTokenSync ci-dessus). Sauté en cas
    //    de rafale (voir étape 0), l'écriture in-app ci-dessous a lieu
    //    dans tous les cas. ─────────────────────────────────────────────
    if (!skipPush) {
        try {
            await admin.messaging().send(Object.assign({ topic: 'buyers', notification: Object.assign({ title, body }, (image ? { imageUrl: image } : {})), data: { type: 'new_product', productId: event.params.productId, link } }, buildPushConfig({ imageUrl: image })));
            console.log(`📣 Push "nouveau produit" envoyé pour ${product.name}`);
        }
        catch (err) {
            console.error('❌ Erreur push nouveau produit:', err);
        }
    }
    else {
        console.log(`⏭️ Push "nouveau produit" sauté (rafale du vendeur) pour ${product.name} — conservé dans l'historique in-app`);
    }
    // ── 2. Historique in-app (cloche de notifications), avec la photo.
    //    ⚠️ FIX : avant cette conversation, un nouveau produit déclenchait
    //    DEUX envois séparés — ce trigger (push topic uniquement, pas
    //    d'historique) ET un notifyAllUsers() côté client dans
    //    seller/products/add/page.tsx (historique in-app, mais sans
    //    photo et sans le fix de lien catégorie, en plus d'un aller-retour
    //    réseau évitable). Un acheteur recevait donc deux notifications
    //    "nouveau produit" pour une seule publication. L'appel client a
    //    été supprimé : ce trigger serveur — automatique, fiable même si
    //    le vendeur ferme l'app juste après publication, et déjà protégé
    //    par alreadyProcessed() contre les rejouements Eventarc — est
    //    maintenant l'unique source, pour le push ET l'historique. ──────
    try {
        const usersSnap = await admin.firestore().collection('users').select('role').get();
        // Même audience que le topic "buyers" côté onUserTokenSync : tout le
        // monde sauf les vendeurs (un rôle absent/inconnu est traité comme
        // acheteur, exactement comme `role === 'seller' ? 'sellers' : 'buyers'`).
        const buyerIds = usersSnap.docs
            .filter((d) => { var _a; return ((_a = d.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'seller'; })
            .map((d) => d.id);
        for (const idsChunk of chunk(buyerIds, 450)) {
            const batch = admin.firestore().batch();
            idsChunk.forEach((userId) => {
                const ref = admin.firestore().collection('notifications').doc();
                batch.set(ref, Object.assign(Object.assign({ userId, type: 'new_product', title,
                    body, icon: '🌾', link, deepLink: link, priority: 'medium', urgent: false }, (image ? { image } : {})), { data: { type: 'new_product', productId: event.params.productId }, read: false, createdAt: admin.firestore.FieldValue.serverTimestamp() }));
            });
            await batch.commit();
        }
        console.log(`🗂️ Historique in-app écrit pour ${buyerIds.length} acheteur(s)`);
    }
    catch (err) {
        console.error('❌ Erreur écriture historique nouveau produit:', err);
    }
});
exports.notifyNewOrder = functions.firestore.onDocumentCreated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e;
    const order = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!order)
        return;
    if (await alreadyProcessed(event.id))
        return;
    const total = (_d = (_c = (_b = order.total) === null || _b === void 0 ? void 0 : _b.toLocaleString) === null || _c === void 0 ? void 0 : _c.call(_b, 'fr-FR')) !== null && _d !== void 0 ? _d : order.total;
    const itemsSummary = summarizeItems(order.items);
    const firstImage = firstItemImage(order.items);
    await Promise.all([
        sendToUsers([order.userId], Object.assign({ 
            // Expert notifications push (revue) : le sticker était auparavant
            // sur une nouvelle ligne (\n) — invisible en pratique, la plupart
            // des trays Android/iOS tronquent après 2 lignes ou ~80-90
            // caractères sur écran verrouillé. Ramené sur la même ligne pour
            // qu'il soit réellement vu, et l'info utile (montant, contenu)
            // reste dans les tout premiers mots, avant toute troncature.
            title: '✅ Commande reçue !', body: itemsSummary
                ? `${itemsSummary} · ${total} FCFA. On s'en occupe ${randomSticker(BUYER_STICKERS)}`
                : `Votre commande de ${total} FCFA est bien enregistrée ${randomSticker(BUYER_STICKERS)}` }, (firstImage ? { imageUrl: firstImage } : {})), { type: 'order_created', orderId: event.params.orderId }),
        order.sellerId
            ? sendToUsers([order.sellerId], Object.assign({ title: '🛒 Nouvelle commande !', body: itemsSummary
                    ? `${(_e = order.userName) !== null && _e !== void 0 ? _e : 'Un client'} a commandé ${itemsSummary} — ${total} FCFA ${randomSticker(SELLER_STICKERS)}`
                    : `Vous avez reçu une nouvelle commande de ${total} FCFA ${randomSticker(SELLER_STICKERS)}` }, (firstImage ? { imageUrl: firstImage } : {})), { type: 'order_created', orderId: event.params.orderId })
            : Promise.resolve(),
    ]);
});
exports.notifyOrderCancelled = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.status === 'annule' || after.status !== 'annule')
        return;
    if (await alreadyProcessed(event.id))
        return;
    const orderId = event.params.orderId;
    const itemsSummary = summarizeItems(after.items);
    const total = (_e = (_d = (_c = after.total) === null || _c === void 0 ? void 0 : _c.toLocaleString) === null || _d === void 0 ? void 0 : _d.call(_c, 'fr-FR')) !== null && _e !== void 0 ? _e : after.total;
    await Promise.all([
        after.userId
            ? sendToUsers([after.userId], {
                title: 'Commande annulée ❌',
                body: itemsSummary
                    ? `Votre commande (${itemsSummary} — ${total} FCFA) a été annulée. Désolé pour la gêne 💙`
                    : `Votre commande #${orderId.slice(0, 6)} a été annulée. Désolé pour la gêne 💙`,
            }, { type: 'order_cancelled', orderId })
            : Promise.resolve(),
        after.sellerId
            ? sendToUsers([after.sellerId], {
                title: 'Commande annulée ❌',
                body: itemsSummary
                    ? `La commande de ${(_f = after.userName) !== null && _f !== void 0 ? _f : 'votre client'} (${itemsSummary} — ${total} FCFA) a été annulée.`
                    : `La commande #${orderId.slice(0, 6)} a été annulée.`,
            }, { type: 'order_cancelled', orderId })
            : Promise.resolve(),
    ]);
});
const STEP_NOTIFICATIONS = {
    en_preparation: {
        title: '👨‍🌾 Votre commande est en préparation !',
        body: (order, id) => {
            var _a;
            const items = summarizeItems(order.items);
            return items
                ? `${(_a = order.sellerName) !== null && _a !== void 0 ? _a : 'Le vendeur'} prépare avec soin : ${items} 🌿`
                : `Votre commande #${id.slice(0, 6)} est en cours de préparation.`;
        },
    },
    en_livraison: {
        title: '🚚 Votre commande est en route !',
        // Le SMS n'est plus le canal de diffusion du code de livraison (voir
        // deliveryCode.ts) : c'est ici, dans cette notification, que le client
        // apprend où le retrouver. Pas besoin de l'avoir vue pour l'utiliser —
        // l'app le montrera de toute façon quand le livreur sera là.
        //
        // Ligne "ne le donnez qu'en personne" ajoutée à la relecture sécurité :
        // tout le modèle de confiance de deliveryCode.ts repose sur le fait
        // que le livreur ne voit JAMAIS le code avant d'être physiquement
        // présent — mais rien n'empêche un faux livreur d'appeler le client
        // ("bonjour, c'est votre livreur, donnez-moi le code pour confirmer")
        // avant même d'arriver. C'est un vecteur d'ingénierie sociale classique
        // sur les livraisons à code en Afrique de l'Ouest (vu sur les services
        // de paiement mobile). La notification est le seul moment où l'on est
        // sûr que le client lit un message — c'est là qu'il faut le prévenir,
        // pas seulement dans une FAQ jamais consultée.
        body: (order, id) => {
            const items = summarizeItems(order.items);
            return items
                ? `${items} arrive bientôt. Votre code vous attend dans l'app — ne le donnez qu'au livreur, en face à face 🔐`
                : `Commande #${id.slice(0, 6)} en route. Votre code vous attend dans l'app — ne le donnez qu'au livreur, en face à face 🔐`;
        },
    },
    livre: {
        // ⚠️ CONSOLIDATION : ce message était auparavant réécrit indépendamment
        // dans 3 écrans clients différents (admin, seller/orders, delivery
        // dashboard) — chacun avec son propre texte, et chacun déclenchant EN
        // PLUS de ce trigger serveur une notification manuelle via notifyUser().
        // Résultat avant fix : l'acheteur recevait 2 notifications "livré"
        // (une du trigger, une du client) à chaque fois, avec des textes
        // différents. Ce trigger est désormais la SEULE source pour cet
        // événement, peu importe quel écran a effectué la transition de statut
        // — et les 3 écrans clients ont eu leur appel manuel retiré.
        title: '✅ Votre commande est arrivée !',
        body: (order) => {
            const items = summarizeItems(order.items);
            return items
                ? `${items} livré avec succès ! Un avis prend 10 secondes et aide les producteurs locaux 🌾`
                : 'Votre commande a été livrée. Un avis prend 10 secondes et aide les producteurs locaux 🌾';
        },
        link: '/review',
    },
};
exports.notifyOrderStatusStep = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    if (before.status === after.status)
        return;
    const step = STEP_NOTIFICATIONS[after.status];
    if (!step)
        return;
    if (await alreadyProcessed(event.id))
        return;
    const orderId = event.params.orderId;
    const link = step.link === '/review' ? `/review?id=${orderId}` : undefined;
    await sendToUsers([after.userId], { title: step.title, body: step.body(after, orderId) }, Object.assign({ type: 'order_status', orderId, status: after.status }, (link ? { link } : {})), { timeSensitive: after.status === 'livre' });
    // Nouveau : le vendeur n'était notifié d'une livraison confirmée que
    // si la transition passait par delivery/dashboard::markAsDelivered —
    // jamais si c'était l'admin ou le vendeur lui-même (bouton "Marquer
    // comme livrée") qui faisait la transition. Ici, ça couvre les 3 cas
    // uniformément, une seule fois.
    if (after.status === 'livre' && after.sellerId) {
        const itemsSummary = summarizeItems(after.items);
        const earned = (_e = (_d = (_c = after.total) === null || _c === void 0 ? void 0 : _c.toLocaleString) === null || _d === void 0 ? void 0 : _d.call(_c, 'fr-FR')) !== null && _e !== void 0 ? _e : after.total;
        await sendToUsers([after.sellerId], {
            title: `✅ Commande #${orderId.slice(0, 6)} livrée !`,
            body: itemsSummary
                ? `${itemsSummary} livré avec succès — ${earned} FCFA encaissés. ${randomSticker(SELLER_STICKERS)}`
                : `Livraison confirmée — ${earned} FCFA. Le paiement sera traité selon le cycle habituel. ${randomSticker(SELLER_STICKERS)}`,
        }, { type: 'order_delivered_seller', orderId });
    }
});
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
    if (await alreadyProcessed(event.id))
        return;
    const image = Array.isArray(after.images) ? after.images[0] : undefined;
    if (afterStock <= 0 && beforeStock > 0) {
        await sendToUsers([after.sellerId], Object.assign({ title: '⚠️ Rupture de stock !', body: `"${after.name}" est épuisé — pense à le réapprovisionner pour ne pas perdre de ventes 🌾` }, (image ? { imageUrl: image } : {})), { type: 'stock_out', productId: event.params.productId, link: '/seller/products', urgent: 'true' }, { timeSensitive: true });
        return;
    }
    if (afterStock > 0 && afterStock <= LOW_STOCK_THRESHOLD && beforeStock > LOW_STOCK_THRESHOLD) {
        await sendToUsers([after.sellerId], Object.assign({ title: '📉 Stock bientôt épuisé', body: `Il ne reste que ${afterStock} unité(s) de "${after.name}" — c'est le moment de réapprovisionner !` }, (image ? { imageUrl: image } : {})), { type: 'stock_low', productId: event.params.productId, link: '/seller/products' });
    }
});
exports.notifyDelivererClaimed = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Ne réagit qu'à l'apparition d'un delivererId sur une commande encore
    // en_attente (auto-attribution par un livreur, voir
    // delivery/dashboard/page.tsx::claimOrder) — pas à une réassignation
    // faite par l'admin (celle-ci a déjà sa propre notification, plus
    // riche, dans admin/page.tsx::assignDelivery, avec statut différent).
    if (before.delivererId || !after.delivererId)
        return;
    if (after.status !== 'en_attente')
        return;
    if (!after.sellerId)
        return;
    if (await alreadyProcessed(event.id))
        return;
    const itemsSummary = summarizeItems(after.items);
    await sendToUsers([after.sellerId], {
        title: '🛵 Un livreur attend votre commande',
        body: itemsSummary
            ? `${after.delivererName || 'Un livreur'} est prêt à prendre ${itemsSummary}. Acceptez-la pour lancer la préparation !`
            : `${after.delivererName || 'Un livreur'} s'est positionné sur la commande #${event.params.orderId.slice(0, 6)}. Acceptez-la pour lancer la préparation.`,
    }, { type: 'delivery_claimed', orderId: event.params.orderId, link: '/seller/orders' });
});
exports.notifyNewReview = functions.firestore.onDocumentCreated({ document: 'reviews/{reviewId}', region: 'us-central1' }, async (event) => {
    var _a, _b;
    const review = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
    if (!(review === null || review === void 0 ? void 0 : review.sellerId))
        return;
    if (await alreadyProcessed(event.id))
        return;
    const rating = Math.max(1, Math.min(5, (_b = review.rating) !== null && _b !== void 0 ? _b : 5));
    const stars = '⭐'.repeat(rating);
    const excerpt = review.comment ? String(review.comment).slice(0, 80) : 'Un client a laissé un avis.';
    const cheer = rating >= 4 ? ` ${randomSticker(SELLER_STICKERS)}` : '';
    await sendToUsers([review.sellerId], { title: 'Nouvel avis client 📝', body: `${stars} — ${excerpt}${cheer}` }, { type: 'new_review', reviewId: event.params.reviewId });
});
exports.remindUnconfirmedDelivery = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120 }, async () => {
    var _a, _b, _c;
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
    const snap = await admin.firestore()
        .collection('orders')
        .where('status', '==', 'en_livraison')
        .get();
    const batch = admin.firestore().batch();
    let count = 0;
    for (const docSnap of snap.docs) {
        const order = docSnap.data();
        if (order.reminderSentAt)
            continue;
        const updatedAtMs = (_c = (_b = (_a = order.updatedAt) === null || _a === void 0 ? void 0 : _a.toMillis) === null || _b === void 0 ? void 0 : _b.call(_a)) !== null && _c !== void 0 ? _c : 0;
        if (updatedAtMs === 0 || updatedAtMs > cutoffMs)
            continue;
        const itemsSummary = summarizeItems(order.items);
        await sendToUsers([order.userId], {
            title: '📦 Votre commande est bien arrivée ?',
            body: itemsSummary
                ? `N'oubliez pas de confirmer la réception de ${itemsSummary} — ça aide énormément le vendeur 🙏`
                : `N'oubliez pas de confirmer la réception de votre commande #${docSnap.id.slice(0, 6)}.`,
        }, { type: 'delivery_reminder', orderId: docSnap.id, link: '/account/orders' });
        batch.update(docSnap.ref, { reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
        count++;
    }
    if (count > 0)
        await batch.commit();
    console.log(`⏰ ${count} relance(s) de livraison envoyée(s).`);
});
// ═══════════════════════════════════════════════════════════════════════
//   PERSONNALISATION — notifications basées sur les recherches/vues
// ═══════════════════════════════════════════════════════════════════════
// 3 pièces, dans l'ordre où elles interviennent :
//   1. syncProductSearchKeywords — maintient automatiquement un champ
//      `searchKeywords` sur chaque produit (nom + catégorie normalisés),
//      pour pouvoir le matcher efficacement contre les intérêts des
//      utilisateurs sans recalculer à la volée à chaque requête.
//   2. notifyRestockMatch — temps réel : un produit repasse de 0 en stock
//      → push immédiat aux utilisateurs qui l'avaient recherché/consulté.
//   3. weeklyInterestDigest — résumé hebdomadaire (lundi 9h, heure de
//      Dakar) pour les intérêts qui n'ont pas eu de match en temps réel.
//
// Les intérêts eux-mêmes sont écrits côté client par
// src/lib/interests/trackInterest.ts, sur users/{uid}.interestKeywords
// (array-contains queryable) et .interestDetails (fréquence, pour le
// classement du digest).
exports.syncProductSearchKeywords = functions.firestore.onDocumentWritten({ document: 'products/{productId}', region: 'us-central1' }, async (event) => {
    var _a;
    const after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
    if (!(after === null || after === void 0 ? void 0 : after.exists))
        return;
    const data = after.data();
    const computed = [...new Set([
            ...(0, normalizeKeyword_1.extractKeywords)(data.name || ''),
            ...(0, normalizeKeyword_1.extractKeywords)(data.category || ''),
        ])];
    // Garde-fou anti-boucle : onDocumentWritten se redéclenche sur SA
    // PROPRE écriture. Sans cette comparaison, chaque mise à jour de stock
    // (très fréquente) réécrirait inutilement searchKeywords et
    // redéclencherait le trigger indéfiniment.
    const existing = data.searchKeywords || [];
    const same = existing.length === computed.length && existing.every((k) => computed.includes(k));
    if (same)
        return;
    await after.ref.update({ searchKeywords: computed });
});
// ── Garde-fous personnalisation (consentement / fréquence / heures de silence) ──
// Communs à notifyRestockMatch (temps réel) et weeklyInterestDigest.
const QUIET_HOURS_START_UTC = 22; // valeur PAR DÉFAUT — 22h à Dakar == 22h UTC
const QUIET_HOURS_END_UTC = 7; // (pas de DST, UTC+0 fixe). Voir resolveQuietHours
// ci-dessous pour la version personnalisée par user.
const FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000; // 1 push perso max / jour / utilisateur
const DEFAULT_QUIET_HOURS = { startHour: QUIET_HOURS_START_UTC, endHour: QUIET_HOURS_END_UTC };
// FIX (affinage demandé) : la fenêtre de silence était auparavant une
// plage UNIQUE appliquée à tout le monde, alors que deux utilisateurs
// n'ont pas forcément le même rythme (travailleur de nuit, marché matinal
// très tôt...). Elle est désormais résolue PAR UTILISATEUR, avec deux
// niveaux :
//  1. Préférence explicite (userData.quietHours = {startHour, endHour},
//     écran de réglages côté client) — la source la plus fiable, aucune
//     inférence nécessaire, prioritaire.
//  2. Repli sur un historique d'activité observé
//     (userData.activityHistogram : tableau de 24 compteurs, un par heure
//     UTC, à incrémenter côté client à chaque ouverture d'app ou
//     interaction) — s'il existe, on en déduit la plage de 8h la moins
//     active. Ce champ n'est pas encore alimenté par le client actuel :
//     tant qu'il est absent, aucune régression, on retombe sur la valeur
//     par défaut ci-dessous. C'est un point d'extension prêt à l'emploi
//     dès qu'un événement d'activité sera tracké côté app.
//  3. Sinon, la plage par défaut (22h-7h UTC), identique à l'ancien
//     comportement global.
function inferQuietHoursFromHistogram(histogram) {
    var _a;
    const WINDOW = 8; // durée d'une nuit type
    let bestStart = QUIET_HOURS_START_UTC;
    let bestSum = Infinity;
    for (let start = 0; start < 24; start++) {
        let sum = 0;
        for (let i = 0; i < WINDOW; i++)
            sum += (_a = histogram[(start + i) % 24]) !== null && _a !== void 0 ? _a : 0;
        if (sum < bestSum) {
            bestSum = sum;
            bestStart = start;
        }
    }
    return { startHour: bestStart, endHour: (bestStart + WINDOW) % 24 };
}
function resolveQuietHours(userData) {
    const explicit = userData === null || userData === void 0 ? void 0 : userData.quietHours;
    if (typeof (explicit === null || explicit === void 0 ? void 0 : explicit.startHour) === 'number' && typeof (explicit === null || explicit === void 0 ? void 0 : explicit.endHour) === 'number') {
        return { startHour: explicit.startHour, endHour: explicit.endHour };
    }
    const histogram = userData === null || userData === void 0 ? void 0 : userData.activityHistogram;
    if (Array.isArray(histogram) && histogram.length === 24 && histogram.some((v) => v > 0)) {
        return inferQuietHoursFromHistogram(histogram);
    }
    return DEFAULT_QUIET_HOURS;
}
function isQuietHoursNow(config) {
    if (config.startHour === config.endHour)
        return false; // plage nulle = jamais de silence
    const h = new Date().getUTCHours();
    return config.startHour < config.endHour
        ? h >= config.startHour && h < config.endHour
        : h >= config.startHour || h < config.endHour; // plage qui traverse minuit (cas par défaut)
}
function passesPersonalizationGate(userData, category, productRegion) {
    var _a, _b, _c, _d;
    if (userData.personalizedNotificationsEnabled === false)
        return false;
    if (((_a = userData.notificationPreferences) === null || _a === void 0 ? void 0 : _a[category]) === false)
        return false;
    if (productRegion && userData.region && userData.region !== productRegion)
        return false;
    const lastMs = (_d = (_c = (_b = userData.lastPersonalizedPushAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0;
    if (Date.now() - lastMs < FREQUENCY_CAP_MS)
        return false;
    return true;
}
async function dispatchPersonalized(users, notification, data) {
    if (users.length === 0)
        return;
    // Répartit le groupe selon la fenêtre de silence PROPRE à chacun — deux
    // utilisateurs du même envoi peuvent donc atterrir dans des branches
    // différentes (l'un reçoit tout de suite, l'autre est mis en attente),
    // là où l'ancienne version décidait pour tout le groupe d'un coup.
    const toSendNow = [];
    const toQueue = [];
    for (const u of users) {
        if (isQuietHoursNow(resolveQuietHours(u.data)))
            toQueue.push(u.id);
        else
            toSendNow.push(u.id);
    }
    if (toQueue.length > 0) {
        // On ne perd pas la notification : elle est mise en attente et sera
        // envoyée par flushQueuedPersonalizedNotifications dès que la fenêtre
        // de silence de CHAQUE utilisateur concerné sera passée, plutôt que
        // d'être abandonnée ou envoyée en pleine nuit.
        await admin.firestore().collection('pendingPersonalizedNotifications').add({
            userIds: toQueue, notification, data, createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`🌙 Heures de silence — ${toQueue.length} notification(s) mise(s) en attente.`);
    }
    if (toSendNow.length === 0)
        return;
    await sendToUsers(toSendNow, notification, data);
    const now = admin.firestore.FieldValue.serverTimestamp();
    await setManyMerge(toSendNow.map((id) => ({ ref: admin.firestore().collection('users').doc(id), data: { lastPersonalizedPushAt: now } })));
}
// FIX (cohérence avec les fenêtres de silence personnalisées) : cette
// purge tournait auparavant une fois par jour à 07h05 heure de Dakar — ce
// qui avait du sens tant que TOUT LE MONDE partageait la même fenêtre
// 22h-7h. Depuis que resolveQuietHours peut donner une fenêtre différente
// par utilisateur (préférence explicite ou, plus tard, activité observée),
// un seul horaire de purge quotidien ne convient plus : un utilisateur
// dont la fenêtre se termine à 10h attendrait inutilement jusqu'au
// lendemain 7h05. On repasse donc à une cadence plus fine (30 min) et on
// revérifie, par utilisateur, si SA fenêtre est bien terminée avant
// d'envoyer — ceux encore concernés sont réécrits dans la file pour le
// prochain passage plutôt que forcés dehors ou perdus.
exports.flushQueuedPersonalizedNotifications = (0, scheduler_1.onSchedule)({ schedule: 'every 30 minutes', region: 'us-central1', timeoutSeconds: 300 }, async () => {
    const snap = await admin.firestore().collection('pendingPersonalizedNotifications').limit(200).get();
    if (snap.empty)
        return;
    let sentGroups = 0;
    for (const docSnap of snap.docs) {
        const { userIds, notification, data } = docSnap.data();
        if (!Array.isArray(userIds) || userIds.length === 0) {
            await docSnap.ref.delete();
            continue;
        }
        const userSnaps = await admin.firestore().getAll(...userIds.map((id) => admin.firestore().collection('users').doc(id)));
        const readyIds = [];
        const stillQuietIds = [];
        userSnaps.forEach((s, idx) => {
            const uData = s.exists ? s.data() : {};
            (isQuietHoursNow(resolveQuietHours(uData)) ? stillQuietIds : readyIds).push(userIds[idx]);
        });
        if (readyIds.length > 0) {
            await sendToUsers(readyIds, notification, data);
            const now = admin.firestore.FieldValue.serverTimestamp();
            await setManyMerge(readyIds.map((id) => ({ ref: admin.firestore().collection('users').doc(id), data: { lastPersonalizedPushAt: now } })));
            sentGroups++;
        }
        if (stillQuietIds.length > 0) {
            await docSnap.ref.update({ userIds: stillQuietIds });
        }
        else {
            await docSnap.ref.delete();
        }
    }
    console.log(`🌅 Purge file d'attente : ${sentGroups} groupe(s) envoyé(s) (sur ${snap.size} lot(s) examiné(s)).`);
});
exports.notifyRestockMatch = functions.firestore.onDocumentUpdated({ document: 'products/{productId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const beforeStock = (_c = before.stock) !== null && _c !== void 0 ? _c : 0;
    const afterStock = (_d = after.stock) !== null && _d !== void 0 ? _d : 0;
    if (beforeStock > 0 || afterStock <= 0)
        return; // pas une transition 0 → disponible
    // Anti-spam : si le stock oscille 0→1→0 plusieurs fois dans la même
    // journée (dernier article vendu/rendu en boucle), on ne renvoie pas
    // une notification à chaque fois — cooldown de 6h par produit.
    const lastNotifiedMs = (_g = (_f = (_e = after.lastRestockNotifiedAt) === null || _e === void 0 ? void 0 : _e.toMillis) === null || _f === void 0 ? void 0 : _f.call(_e)) !== null && _g !== void 0 ? _g : 0;
    if (Date.now() - lastNotifiedMs < 6 * 60 * 60 * 1000)
        return;
    if (await alreadyProcessed(event.id))
        return;
    const productKeywords = ((_h = after.searchKeywords) === null || _h === void 0 ? void 0 : _h.length)
        ? after.searchKeywords
        : [...new Set([...(0, normalizeKeyword_1.extractKeywords)(after.name || ''), ...(0, normalizeKeyword_1.extractKeywords)(after.category || '')])];
    if (productKeywords.length === 0)
        return;
    // Firestore array-contains ne teste qu'UNE valeur par requête — le nom
    // + catégorie d'un produit génèrent rarement plus de 4-5 mots-clés, on
    // interroge donc chacun séparément puis on fusionne les utilisateurs
    // matchés (dédoublonnés via Set).
    const matchedUserIds = new Set();
    for (const kw of productKeywords) {
        const snap = await admin.firestore()
            .collection('users')
            .where('interestKeywords', 'array-contains', kw)
            .limit(500)
            .get();
        snap.docs.forEach((d) => matchedUserIds.add(d.id));
    }
    if (matchedUserIds.size === 0)
        return;
    // Filtrage qualité : consentement, région (si connue des deux côtés),
    // et cap de fréquence — évite d'arroser tout le monde sans distinction
    // dès qu'un match mot-clé existe, ce qui était le vrai reproche fait au
    // premier jet de cette fonctionnalité.
    const candidateSnaps = await admin.firestore().getAll(...[...matchedUserIds].map((id) => admin.firestore().collection('users').doc(id)));
    const eligibleUsers = candidateSnaps
        .filter((s) => s.exists && passesPersonalizationGate(s.data(), 'restock', after.region))
        .map((s) => ({ id: s.id, data: s.data() }));
    if (eligibleUsers.length === 0)
        return;
    const image = Array.isArray(after.images) ? after.images[0] : undefined;
    const priceLabel = typeof after.price === 'number'
        ? `${after.price.toLocaleString('fr-FR')} FCFA/${(_j = after.unit) !== null && _j !== void 0 ? _j : 'unité'}`
        : undefined;
    await dispatchPersonalized(eligibleUsers, {
        title: `🌾 ${after.name} est de retour !`,
        body: priceLabel
            ? `Le produit que vous cherchiez est de nouveau disponible — ${priceLabel}.`
            : `Le produit que vous cherchiez est de nouveau disponible.`,
        imageUrl: image,
    }, { type: 'restock_match', productId: event.params.productId, link: '/main/products' });
    await event.data.after.ref.update({
        lastRestockNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`🌾 Restock match : ${eligibleUsers.length}/${matchedUserIds.size} utilisateur(s) éligible(s) pour "${after.name}"`);
});
exports.weeklyInterestDigest = (0, scheduler_1.onSchedule)({ schedule: 'every monday 09:00', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 540 }, async () => {
    // Contrairement à notifyRestockMatch (part d'UN produit vers plusieurs
    // utilisateurs), ce digest part d'UN utilisateur vers SON propre
    // historique — chacun reçoit un message composé de ses intérêts à lui,
    // pas un message générique diffusé à tous.
    const usersSnap = await admin.firestore()
        .collection('users')
        .where('hasInterests', '==', true)
        .get();
    console.log(`📬 Digest hebdo : ${usersSnap.size} profil(s) avec un historique d'intérêt.`);
    let sentCount = 0;
    for (const userDoc of usersSnap.docs) {
        const userData = userDoc.data();
        const keywords = userData.interestKeywords || [];
        if (keywords.length === 0)
            continue;
        // Consentement + cap de fréquence (pas de région ici : filtrée plus
        // bas, produit par produit, avant même de savoir lequel illustrer).
        if (!passesPersonalizationGate(userData, 'digest'))
            continue;
        const details = userData.interestDetails || {};
        // Les 5 intérêts les plus fréquents plutôt que les 5 plus récents —
        // un utilisateur qui cherche "oignon" chaque semaine depuis un mois
        // doit primer sur une recherche isolée d'hier. array-contains-any
        // accepte jusqu'à 10 valeurs ; 5 laisse de la marge et garde le
        // digest ciblé plutôt qu'exhaustif.
        const topKeywords = [...keywords]
            .sort((a, b) => { var _a, _b, _c, _d; return ((_b = (_a = details[b]) === null || _a === void 0 ? void 0 : _a.count) !== null && _b !== void 0 ? _b : 0) - ((_d = (_c = details[a]) === null || _c === void 0 ? void 0 : _c.count) !== null && _d !== void 0 ? _d : 0); })
            .slice(0, 5);
        const prodSnap = await admin.firestore()
            .collection('products')
            .where('searchKeywords', 'array-contains-any', topKeywords)
            .limit(30)
            .get();
        // Filtre stock + région côté fonction plutôt qu'en requête Firestore :
        // combiner array-contains-any avec une inégalité (stock > 0) exige un
        // index composite dédié à créer manuellement en prod, et Firestore ne
        // sait pas non plus combiner array-contains-any avec un 2ᵉ filtre
        // d'égalité variable (région) sans index composite spécifique par
        // région. Ce filtre en mémoire évite ces dépendances pour un v1, au
        // prix d'un `.limit(30)` plus large pour compenser ce qui est écarté.
        const inStock = prodSnap.docs
            .map((d) => (Object.assign({ id: d.id }, d.data())))
            .filter((p) => { var _a; return ((_a = p.stock) !== null && _a !== void 0 ? _a : 0) > 0; })
            .filter((p) => !userData.region || !p.region || p.region === userData.region);
        if (inStock.length === 0)
            continue;
        // FIX variété : auparavant, `best` était systématiquement le premier
        // match — un utilisateur avec un seul intérêt dominant (ex: "oignon"
        // recherché chaque semaine) recevait donc le même produit-phare
        // digest après digest, ce qui use vite l'effet "vous attend". On
        // évite maintenant de remontrer un produit déjà utilisé comme
        // illustration récemment (mémorisé dans userData.lastDigestProductIds,
        // les ~8 derniers = ~2 mois d'historique) — et on ne retombe sur du
        // déjà-vu que si vraiment aucune alternative n'existe (mieux qu'un
        // digest vide).
        const recentIds = userData.lastDigestProductIds || [];
        const fresh = inStock.filter((p) => !recentIds.includes(p.id));
        const pool = fresh.length > 0 ? fresh : inStock;
        // Le produit qui correspond au mot-clé le plus fréquent de
        // l'utilisateur, parmi ceux pas encore montrés récemment, passe en
        // premier — c'est celui qui illustre le push (titre + image), même
        // si d'autres matches existent.
        const best = pool[0];
        const image = Array.isArray(best.images) ? best.images[0] : undefined;
        const extraCount = inStock.length - 1;
        await dispatchPersonalized([{ id: userDoc.id, data: userData }], {
            title: `🛒 ${best.name} vous attend`,
            body: extraCount > 0
                ? `Disponible maintenant, et ${extraCount} autre${extraCount > 1 ? 's' : ''} produit${extraCount > 1 ? 's' : ''} qui pourraient vous plaire.`
                : `Disponible maintenant, d'après vos recherches récentes.`,
            imageUrl: image,
        }, { type: 'weekly_digest', link: '/main/products' });
        // Historique glissant borné à 8 entrées : suffisant pour éviter la
        // répétition à court terme sans empêcher indéfiniment un produit
        // toujours pertinent de revenir après quelques semaines d'absence.
        const updatedHistory = [best.id, ...recentIds.filter((id) => id !== best.id)].slice(0, 8);
        await userDoc.ref.set({ lastDigestProductIds: updatedHistory }, { merge: true });
        sentCount++;
    }
    console.log(`📬 Digest hebdo terminé : ${sentCount} notification(s) envoyée(s).`);
});
// ═══════════════════════════════════════════════════════════════════════
//   PARCOURS DE SUIVI HYBRIDE — attribution manuelle, progression GPS
// ═══════════════════════════════════════════════════════════════════════
// Principe (voir échange produit) : le vendeur ne confirme QUE ce que lui
// seul peut confirmer (préparation). Tout le reste de la progression après
// attribution du livreur est piloté automatiquement par le GPS, sauf
// l'arrivée précise (le livreur confirme manuellement — le GPS seul, avec
// une précision de quelques dizaines de mètres, ne peut pas fiabiliser "je
// suis devant la porte").
//
// tracking.phase progresse ainsi :
//   assigned → en_route → approaching → arrived → (status devient 'livre')
//
// Écrit côté client dans delivery/dashboard/page.tsx (claimOrder,
// startSharingLocation, markAsArrived) et admin/page.tsx (assignDelivery).
// Chaque transition est horodatée ici (tracking.{phase}At) — la donnée
// brute qui permettra un jour de calculer temps de préparation, temps de
// trajet, retards par livreur, fiabilité par vendeur. Aucun tableau de
// bord n'est construit sur ces données pour l'instant — juste la
// collecte, prête à être exploitée.
const SEUIL_PROCHE_METRES = 500;
// Au-delà de cette imprécision GPS, une lecture ne suffit plus à
// conclure une proximité : mieux vaut attendre le point suivant (plus
// précis) que de déclencher "votre livreur arrive !" alors qu'il pourrait
// en réalité être à plusieurs centaines de mètres. Le filtrage de qualité
// GPS déjà en place côté client (delivery/dashboard/page.tsx,
// MIN_ACCEPTABLE_ACCURACY_M = 150) fait qu'une valeur au-delà de ce seuil
// ne devrait plus vraiment atteindre Firestore — cette vérification est
// une seconde ligne de défense, pas une redite : le serveur ne doit
// jamais faire une confiance aveugle à ce que le client a écrit.
const MAX_TRUSTED_ACCURACY_M = 300;
function haversineMeters(a, b) {
    const R = 6371000;
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLng = (b.lng - a.lng) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 +
        Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
// ⚠️ `!point.lat` rejette à tort une coordonnée valide de 0 (le classique
// "falsy zero" bug) — sans conséquence pratique au Sénégal (jamais proche
// de l'équateur/méridien 0), mais c'est le genre de vérification qui doit
// être correcte par construction, pas "correcte parce que la zone
// géographique actuelle l'arrange". Reprend la même logique que
// isValidCoordinate côté client (lib/geo/distance.ts) pour que les deux
// bouts du pipeline appliquent exactement la même définition d'une
// coordonnée valide.
function isValidCoordinate(point) {
    return (!!point &&
        typeof point.lat === 'number' && Number.isFinite(point.lat) &&
        typeof point.lng === 'number' && Number.isFinite(point.lng) &&
        Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180);
}
exports.checkDeliveryProximity = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e, _f;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    // Ne réagit qu'à un déplacement GPS réel, pas à n'importe quelle
    // écriture sur la commande (cette fonction serait sinon invoquée à
    // chaque changement de statut, de prix, etc. sans rapport).
    const beforeLoc = (_c = before.tracking) === null || _c === void 0 ? void 0 : _c.currentLocation;
    const afterLoc = (_d = after.tracking) === null || _d === void 0 ? void 0 : _d.currentLocation;
    if (!afterLoc || ((beforeLoc === null || beforeLoc === void 0 ? void 0 : beforeLoc.lat) === afterLoc.lat && (beforeLoc === null || beforeLoc === void 0 ? void 0 : beforeLoc.lng) === afterLoc.lng))
        return;
    if (!isValidCoordinate(afterLoc))
        return;
    // Ne fait progresser que depuis 'en_route' — si la phase est déjà
    // 'approaching'/'arrived', ou pas encore 'assigned', rien à faire ici.
    if (((_e = after.tracking) === null || _e === void 0 ? void 0 : _e.phase) !== 'en_route')
        return;
    const dest = after.customerLocation;
    if (!isValidCoordinate(dest))
        return;
    // Seconde ligne de défense (voir MAX_TRUSTED_ACCURACY_M ci-dessus) :
    // un point GPS de mauvaise qualité ne doit jamais, à lui seul,
    // déclencher la notification "votre livreur arrive !". On ne bloque
    // pas la progression pour autant — on attend simplement un point plus
    // fiable, qui arrivera dans les secondes suivantes.
    const accuracy = (_f = after.tracking) === null || _f === void 0 ? void 0 : _f.accuracy;
    if (typeof accuracy === 'number' && accuracy > MAX_TRUSTED_ACCURACY_M) {
        console.log(`📍 Point GPS trop imprécis pour conclure une proximité (±${Math.round(accuracy)}m) — commande ${event.params.orderId}, en attente d'un meilleur fixe.`);
        return;
    }
    const distance = haversineMeters(afterLoc, dest);
    if (distance > SEUIL_PROCHE_METRES)
        return;
    await event.data.after.ref.update({ 'tracking.phase': 'approaching' });
    console.log(`📍 Proximité détectée (${Math.round(distance)}m, ±${accuracy !== null && accuracy !== void 0 ? accuracy : '?'}m) — commande ${event.params.orderId} → approaching`);
});
const PHASE_NOTIFICATIONS = {
    en_route: {
        title: '🛵 Votre livreur est en route !',
        body: (order) => {
            const items = summarizeItems(order.items);
            return items ? `${order.delivererName || 'Votre livreur'} a pris le départ avec ${items} 🌾` : 'Il a commencé le trajet vers vous.';
        },
        timestampField: 'enRouteAt',
    },
    approaching: {
        title: '📍 Votre livreur arrive !',
        body: () => `Il est à moins de ${SEUIL_PROCHE_METRES}m de chez vous. Préparez-vous à l'accueillir ! 🙂`,
        timestampField: 'approachingAt',
    },
    arrived: {
        title: '📍 Votre livreur est arrivé !',
        body: (order) => {
            const items = summarizeItems(order.items);
            return items ? `${items} vous attend en bas ! ${randomSticker(BUYER_STICKERS)}` : 'Il vous attend avec votre commande.';
        },
        timestampField: 'arrivedAt',
    },
};
exports.notifyDeliveryPhaseChange = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, async (event) => {
    var _a, _b, _c, _d, _e;
    const before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
    const after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
    if (!before || !after)
        return;
    const beforePhase = (_c = before.tracking) === null || _c === void 0 ? void 0 : _c.phase;
    const afterPhase = (_d = after.tracking) === null || _d === void 0 ? void 0 : _d.phase;
    if (!afterPhase || beforePhase === afterPhase)
        return;
    // Horodatage systématique — indépendant de l'envoi de notification,
    // pour que la donnée d'analytique existe même pour la phase 'assigned'
    // (qui n'a pas de message dédié ici, déjà couverte par
    // notifyDelivererClaimed côté vendeur).
    // FIX : utilise désormais step.timestampField (la source de vérité
    // déclarée dans PHASE_NOTIFICATIONS) plutôt qu'une reconstruction en
    // dur `tracking.${afterPhase}At` — les deux coïncidaient par hasard,
    // mais une clé calculée séparément de sa déclaration peut diverger
    // silencieusement si une phase est un jour renommée. Pour la phase
    // 'assigned' (sans entrée dans PHASE_NOTIFICATIONS), on retombe sur la
    // même convention `tracking.assignedAt`.
    const step = PHASE_NOTIFICATIONS[afterPhase];
    const timestampField = (_e = step === null || step === void 0 ? void 0 : step.timestampField) !== null && _e !== void 0 ? _e : `${afterPhase}At`;
    await event.data.after.ref.update({
        [`tracking.${timestampField}`]: admin.firestore.FieldValue.serverTimestamp(),
    });
    if (!step || !after.userId)
        return;
    if (await alreadyProcessed(event.id))
        return;
    // TTL court : "votre livreur arrive" n'a aucun sens reçu 2h plus tard
    // parce que l'appareil était hors-ligne (TTL par défaut FCM : 4
    // semaines). 15 min de marge suffisent largement pour ce type d'étape.
    await sendToUsers([after.userId], { title: step.title, body: step.body(after) }, { type: 'delivery_phase', orderId: event.params.orderId, phase: afterPhase, link: `/tracking?id=${event.params.orderId}` }, { timeSensitive: afterPhase === 'arrived', ttlSeconds: 15 * 60 });
});
// ── Purge du registre d'idempotence ────────────────────────────────────────
// _processedNotificationEvents ne sert qu'à détecter les redéclenchements
// Eventarc à court terme (quelques minutes/heures maximum en pratique) — au
// bout de 3 jours, un doc n'a plus aucune utilité et ne fait que gonfler la
// collection indéfiniment. Purge quotidienne par lots de 400 (marge sous la
// limite de 500 écritures par batch Firestore).
exports.cleanupProcessedEvents = (0, scheduler_1.onSchedule)({ schedule: 'every day 04:00', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 }, async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const snap = await admin.firestore()
        .collection('_processedNotificationEvents')
        .where('processedAt', '<', cutoff)
        .limit(400)
        .get();
    if (snap.empty)
        return;
    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`🧹 ${snap.size} entrée(s) d'idempotence purgée(s).`);
});
// Purge quotidienne des compteurs anti-abus d'inscription
// (rateLimits/*) — même logique que ci-dessus, collection distincte.
exports.cleanupRegistrationRateLimits = (0, scheduler_1.onSchedule)({ schedule: 'every day 04:15', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 }, async () => {
    const purged = await (0, rateLimit_1.purgeOldRateLimitDocs)(3 * 24 * 60 * 60 * 1000);
    if (purged > 0)
        console.log(`🧹 ${purged} entrée(s) de rate-limiting d'inscription purgée(s).`);
});
// ⚠️ AJOUT (revue de code) : registrationSessions, phoneIndex (réservations
// abandonnées) et les fenêtres anti-fraude (_fraudIpWindow/_fraudTokenWindow)
// n'avaient jusqu'ici AUCUN nettoyage — seuls rateLimits et
// _processedNotificationEvents étaient purgés. Ces trois collections
// grossissaient donc indéfiniment. Un seul job planifié couvre les trois,
// par lots de 400 comme les jobs existants (marge sous la limite de 500
// écritures par batch Firestore) ; rétention de 7 jours pour les sessions
// (l'historique nominatif utile reste dans registrationAuditLog, jamais
// purgé), 3 jours pour les réservations abandonnées et les fenêtres
// anti-fraude (cohérent avec cleanupRegistrationRateLimits ci-dessus).
// Couvre aussi loginOtpSessions et passwordResetSessions (même rétention
// de 3 jours, mêmes raisons que les fenêtres anti-fraude) — absents du
// commentaire d'origine mais bien purgés ci-dessous (⚠️ correctif apporté
// ici au passage : le Promise.all d'origine ne déstructurait que 3
// résultats sur 5, les compteurs purgés de loginOtpSessions/
// passwordResetSessions n'étaient donc jamais journalisés, alors que la
// purge elle-même s'exécutait bien).
exports.cleanupRegistrationLeftovers = (0, scheduler_1.onSchedule)({ schedule: 'every day 04:30', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 }, async () => {
    const [sessions, reservations, fraudWindows, loginOtpSessions, passwordResetSessions] = await Promise.all([
        (0, registration_1.purgeOldRegistrationSessions)(7 * 24 * 60 * 60 * 1000),
        (0, phoneUniqueness_1.purgeExpiredPhoneReservations)(3 * 24 * 60 * 60 * 1000),
        (0, fraud_1.purgeOldFraudWindows)(3 * 24 * 60 * 60 * 1000),
        (0, loginOtp_1.purgeOldLoginOtpSessions)(3 * 24 * 60 * 60 * 1000),
        (0, passwordReset_1.purgeOldPasswordResetSessions)(3 * 24 * 60 * 60 * 1000),
    ]);
    if (sessions > 0)
        console.log(`🧹 ${sessions} session(s) d'inscription terminée(s) purgée(s).`);
    if (reservations > 0)
        console.log(`🧹 ${reservations} réservation(s) de numéro abandonnée(s) purgée(s).`);
    if (fraudWindows.ip + fraudWindows.token > 0) {
        console.log(`🧹 ${fraudWindows.ip} fenêtre(s) IP + ${fraudWindows.token} fenêtre(s) token anti-fraude purgée(s).`);
    }
    if (loginOtpSessions > 0)
        console.log(`🧹 ${loginOtpSessions} session(s) OTP de connexion purgée(s).`);
    if (passwordResetSessions > 0)
        console.log(`🧹 ${passwordResetSessions} session(s) de réinitialisation purgée(s).`);
});
