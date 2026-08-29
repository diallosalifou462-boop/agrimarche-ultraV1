"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.remindUnconfirmedDelivery = exports.notifyNewReview = exports.notifyLowStock = exports.notifyOrderStatusStep = exports.notifyOrderCancelled = exports.notifyNewOrder = exports.notifyNewProduct = exports.onUserTokenSync = exports.processEmailQueue = exports.submitReview = exports.updateOrderStatus = void 0;
var functions = require("firebase-functions/v2");
var scheduler_1 = require("firebase-functions/v2/scheduler");
var admin = require("firebase-admin");
var resend_1 = require("resend");
admin.initializeApp();
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
exports.processEmailQueue = functions.firestore.onDocumentCreated({
    document: 'email_queue/{docId}',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 60,
    region: 'us-central1'
}, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var snapshot, data, resend, error, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                snapshot = event.data;
                if (!snapshot)
                    return [2 /*return*/];
                data = snapshot.data();
                resend = new resend_1.Resend(process.env.RESEND_API_KEY);
                _a.label = 1;
            case 1:
                _a.trys.push([1, 4, , 6]);
                console.log("\uD83D\uDCE7 Envoi r\u00E9el \u00E0: ".concat(data.to));
                return [4 /*yield*/, resend.emails.send({
                        from: 'AgriMarché <onboarding@resend.dev>',
                        to: data.to,
                        subject: data.subject,
                        html: "<div><h2>\uD83C\uDF3F AgriMarch\u00E9</h2><p>".concat(data.body, "</p></div>"),
                    })];
            case 2:
                error = (_a.sent()).error;
                if (error)
                    throw new Error(error.message);
                return [4 /*yield*/, snapshot.ref.update({
                        status: 'sent',
                        sentAt: admin.firestore.FieldValue.serverTimestamp()
                    })];
            case 3:
                _a.sent();
                console.log("\u2705 Email envoy\u00E9 \u00E0 ".concat(data.to));
                return [3 /*break*/, 6];
            case 4:
                error_1 = _a.sent();
                console.error("\u274C Erreur: ".concat(error_1.message));
                return [4 /*yield*/, snapshot.ref.update({
                        status: 'failed',
                        error: error_1.message
                    })];
            case 5:
                _a.sent();
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); });
// ============================================================
//   NOTIFICATIONS PUSH (FCM) + EN-APP
// ============================================================
function writeNotification(userId, payload) {
    return __awaiter(this, void 0, void 0, function () {
        var err_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, admin.firestore().collection('notifications').doc(userId).collection('items').add({
                            title: payload.title,
                            body: payload.body,
                            type: payload.type,
                            data: (_a = payload.data) !== null && _a !== void 0 ? _a : {},
                            read: false,
                            createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        })];
                case 1:
                    _b.sent();
                    return [3 /*break*/, 3];
                case 2:
                    err_1 = _b.sent();
                    console.error("\u274C Erreur \u00E9criture notification pour ".concat(userId, ":"), err_1);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function sendToUsers(userIds_1, notification_1) {
    return __awaiter(this, arguments, void 0, function (userIds, notification, data) {
        var uniqueIds, userSnaps, tokens, _i, userSnaps_1, snap, token, res, err_2;
        var _a;
        var _b;
        if (data === void 0) { data = {}; }
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    uniqueIds = __spreadArray([], new Set(userIds), true).filter(Boolean);
                    if (uniqueIds.length === 0)
                        return [2 /*return*/];
                    return [4 /*yield*/, (_a = admin.firestore()).getAll.apply(_a, uniqueIds.map(function (id) { return admin.firestore().collection('users').doc(id); }))];
                case 1:
                    userSnaps = _c.sent();
                    tokens = [];
                    for (_i = 0, userSnaps_1 = userSnaps; _i < userSnaps_1.length; _i++) {
                        snap = userSnaps_1[_i];
                        token = snap.exists ? (_b = snap.data()) === null || _b === void 0 ? void 0 : _b.fcmToken : null;
                        if (token)
                            tokens.push(token);
                    }
                    if (!(tokens.length > 0)) return [3 /*break*/, 5];
                    _c.label = 2;
                case 2:
                    _c.trys.push([2, 4, , 5]);
                    return [4 /*yield*/, admin.messaging().sendEachForMulticast({ tokens: tokens, notification: notification, data: data })];
                case 3:
                    res = _c.sent();
                    console.log("\uD83D\uDCF2 Push envoy\u00E9 : ".concat(res.successCount, "/").concat(tokens.length, " succ\u00E8s"));
                    return [3 /*break*/, 5];
                case 4:
                    err_2 = _c.sent();
                    console.error('❌ Erreur envoi push:', err_2);
                    return [3 /*break*/, 5];
                case 5: return [4 /*yield*/, Promise.all(uniqueIds.map(function (id) { var _a; return writeNotification(id, { title: notification.title, body: notification.body, type: (_a = data.type) !== null && _a !== void 0 ? _a : 'info', data: data }); }))];
                case 6:
                    _c.sent();
                    return [2 /*return*/];
            }
        });
    });
}
exports.onUserTokenSync = functions.firestore.onDocumentWritten({ document: 'users/{userId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var after, data, token, topic, err_3;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                after = (_a = event.data) === null || _a === void 0 ? void 0 : _a.after;
                if (!(after === null || after === void 0 ? void 0 : after.exists))
                    return [2 /*return*/];
                data = after.data();
                token = data === null || data === void 0 ? void 0 : data.fcmToken;
                if (!token)
                    return [2 /*return*/];
                topic = data.role === 'seller' ? 'sellers' : 'buyers';
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, admin.messaging().subscribeToTopic([token], topic)];
            case 2:
                _b.sent();
                console.log("\uD83D\uDD14 Token abonn\u00E9 au topic \"".concat(topic, "\" pour ").concat(event.params.userId));
                return [3 /*break*/, 4];
            case 3:
                err_3 = _b.sent();
                console.error('❌ Erreur abonnement topic:', err_3);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
exports.notifyNewProduct = functions.firestore.onDocumentCreated({ document: 'products/{productId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var product, err_4;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                product = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
                if (!product)
                    return [2 /*return*/];
                _b.label = 1;
            case 1:
                _b.trys.push([1, 3, , 4]);
                return [4 /*yield*/, admin.messaging().send({
                        topic: 'buyers',
                        notification: {
                            title: 'Nouveau produit 🌾',
                            body: "".concat(product.name, " est maintenant disponible sur AgriMarch\u00E9"),
                        },
                        data: { type: 'new_product', productId: event.params.productId },
                    })];
            case 2:
                _b.sent();
                console.log("\uD83D\uDCE3 Diffusion \"nouveau produit\" envoy\u00E9e pour ".concat(product.name));
                return [3 /*break*/, 4];
            case 3:
                err_4 = _b.sent();
                console.error('❌ Erreur diffusion nouveau produit:', err_4);
                return [3 /*break*/, 4];
            case 4: return [2 /*return*/];
        }
    });
}); });
exports.notifyNewOrder = functions.firestore.onDocumentCreated({ document: 'orders/{orderId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var order, total;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                order = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
                if (!order)
                    return [2 /*return*/];
                total = (_d = (_c = (_b = order.total) === null || _b === void 0 ? void 0 : _b.toLocaleString) === null || _c === void 0 ? void 0 : _c.call(_b, 'fr-FR')) !== null && _d !== void 0 ? _d : order.total;
                return [4 /*yield*/, Promise.all([
                        sendToUsers([order.userId], { title: 'Commande reçue ✅', body: "Votre commande de ".concat(total, " FCFA a bien \u00E9t\u00E9 enregistr\u00E9e.") }, { type: 'order_created', orderId: event.params.orderId }),
                        order.sellerId
                            ? sendToUsers([order.sellerId], { title: 'Nouvelle commande 🛒', body: "Vous avez re\u00E7u une nouvelle commande de ".concat(total, " FCFA.") }, { type: 'order_created', orderId: event.params.orderId })
                            : Promise.resolve(),
                    ])];
            case 1:
                _e.sent();
                return [2 /*return*/];
        }
    });
}); });
exports.notifyOrderCancelled = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var before, after, recipients;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
                after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
                if (!before || !after)
                    return [2 /*return*/];
                if (before.status === 'annule' || after.status !== 'annule')
                    return [2 /*return*/];
                recipients = [after.userId, after.sellerId].filter(Boolean);
                return [4 /*yield*/, sendToUsers(recipients, { title: 'Commande annulée ❌', body: "La commande #".concat(event.params.orderId.slice(0, 6), " a \u00E9t\u00E9 annul\u00E9e.") }, { type: 'order_cancelled', orderId: event.params.orderId })];
            case 1:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
var STEP_NOTIFICATIONS = {
    en_preparation: {
        title: 'Commande en préparation 👨‍🌾',
        body: function (id) { return "Votre commande #".concat(id.slice(0, 6), " est en cours de pr\u00E9paration."); },
    },
    en_livraison: {
        title: 'Commande en livraison 🚚',
        body: function (id) { return "Votre commande #".concat(id.slice(0, 6), " est en route vers vous."); },
    },
    livre: {
        title: 'Commande livrée ✅',
        body: function (id) { return "Votre commande #".concat(id.slice(0, 6), " a \u00E9t\u00E9 livr\u00E9e. Merci pour votre confiance !"); },
    },
};
exports.notifyOrderStatusStep = functions.firestore.onDocumentUpdated({ document: 'orders/{orderId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var before, after, step;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
                after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
                if (!before || !after)
                    return [2 /*return*/];
                if (before.status === after.status)
                    return [2 /*return*/];
                step = STEP_NOTIFICATIONS[after.status];
                if (!step)
                    return [2 /*return*/];
                return [4 /*yield*/, sendToUsers([after.userId], { title: step.title, body: step.body(event.params.orderId) }, { type: 'order_status', orderId: event.params.orderId, status: after.status })];
            case 1:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
var LOW_STOCK_THRESHOLD = 5;
exports.notifyLowStock = functions.firestore.onDocumentUpdated({ document: 'products/{productId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var before, after, beforeStock, afterStock;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                before = (_a = event.data) === null || _a === void 0 ? void 0 : _a.before.data();
                after = (_b = event.data) === null || _b === void 0 ? void 0 : _b.after.data();
                if (!before || !after || !after.sellerId)
                    return [2 /*return*/];
                beforeStock = (_c = before.stock) !== null && _c !== void 0 ? _c : 0;
                afterStock = (_d = after.stock) !== null && _d !== void 0 ? _d : 0;
                if (beforeStock === afterStock)
                    return [2 /*return*/];
                if (!(afterStock <= 0 && beforeStock > 0)) return [3 /*break*/, 2];
                return [4 /*yield*/, sendToUsers([after.sellerId], { title: 'Rupture de stock ⚠️', body: "\"".concat(after.name, "\" est en rupture de stock.") }, { type: 'stock_out', productId: event.params.productId })];
            case 1:
                _e.sent();
                return [2 /*return*/];
            case 2:
                if (!(afterStock > 0 && afterStock <= LOW_STOCK_THRESHOLD && beforeStock > LOW_STOCK_THRESHOLD)) return [3 /*break*/, 4];
                return [4 /*yield*/, sendToUsers([after.sellerId], { title: 'Stock faible 📉', body: "Il ne reste que ".concat(afterStock, " unit\u00E9(s) de \"").concat(after.name, "\".") }, { type: 'stock_low', productId: event.params.productId })];
            case 3:
                _e.sent();
                _e.label = 4;
            case 4: return [2 /*return*/];
        }
    });
}); });
exports.notifyNewReview = functions.firestore.onDocumentCreated({ document: 'reviews/{reviewId}', region: 'us-central1' }, function (event) { return __awaiter(void 0, void 0, void 0, function () {
    var review, rating, stars, excerpt;
    var _a, _b;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                review = (_a = event.data) === null || _a === void 0 ? void 0 : _a.data();
                if (!(review === null || review === void 0 ? void 0 : review.sellerId))
                    return [2 /*return*/];
                rating = Math.max(1, Math.min(5, (_b = review.rating) !== null && _b !== void 0 ? _b : 5));
                stars = '⭐'.repeat(rating);
                excerpt = review.comment ? String(review.comment).slice(0, 80) : 'Un client a laissé un avis.';
                return [4 /*yield*/, sendToUsers([review.sellerId], { title: 'Nouvel avis client 📝', body: "".concat(stars, " \u2014 ").concat(excerpt) }, { type: 'new_review', reviewId: event.params.reviewId })];
            case 1:
                _c.sent();
                return [2 /*return*/];
        }
    });
}); });
exports.remindUnconfirmedDelivery = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120 }, function () { return __awaiter(void 0, void 0, void 0, function () {
    var cutoffMs, snap, batch, count, _i, _a, docSnap, order, updatedAtMs;
    var _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                cutoffMs = Date.now() - 24 * 60 * 60 * 1000;
                return [4 /*yield*/, admin.firestore()
                        .collection('orders')
                        .where('status', '==', 'en_livraison')
                        .get()];
            case 1:
                snap = _e.sent();
                batch = admin.firestore().batch();
                count = 0;
                _i = 0, _a = snap.docs;
                _e.label = 2;
            case 2:
                if (!(_i < _a.length)) return [3 /*break*/, 5];
                docSnap = _a[_i];
                order = docSnap.data();
                if (order.reminderSentAt)
                    return [3 /*break*/, 4];
                updatedAtMs = (_d = (_c = (_b = order.updatedAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0;
                if (updatedAtMs === 0 || updatedAtMs > cutoffMs)
                    return [3 /*break*/, 4];
                return [4 /*yield*/, sendToUsers([order.userId], {
                        title: 'Votre commande est arrivée ? 📦',
                        body: "N'oubliez pas de confirmer la r\u00E9ception de votre commande #".concat(docSnap.id.slice(0, 6), "."),
                    }, { type: 'delivery_reminder', orderId: docSnap.id })];
            case 3:
                _e.sent();
                batch.update(docSnap.ref, { reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
                count++;
                _e.label = 4;
            case 4:
                _i++;
                return [3 /*break*/, 2];
            case 5:
                if (!(count > 0)) return [3 /*break*/, 7];
                return [4 /*yield*/, batch.commit()];
            case 6:
                _e.sent();
                _e.label = 7;
            case 7:
                console.log("\u23F0 ".concat(count, " relance(s) de livraison envoy\u00E9e(s)."));
                return [2 /*return*/];
        }
    });
}); });
