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
exports.getRegistrationMetrics = exports.checkRegistrationHealth = void 0;
// ============================================================
//   monitoring.ts — Alerting + endpoint pour dashboard admin.
//
//   checkRegistrationHealth (planifiée, toutes les heures) calcule
//   un taux d'échec sur la fenêtre récente et notifie les comptes
//   admin (role === 'admin') si le taux dépasse un seuil — ex :
//   InfoBip en panne, un bug de déploiement qui casse /verify, etc.
//   getRegistrationMetrics (callable, réservé admin) alimente un
//   futur écran de dashboard côté app admin.
// ============================================================
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const admin = __importStar(require("firebase-admin"));
const metrics_1 = require("./metrics");
const FAILURE_RATE_ALERT_THRESHOLD = 0.3; // 30% d'échec sur la fenêtre → alerte
const MIN_VOLUME_FOR_ALERT = 10; // évite une fausse alerte sur un volume trop faible pour être significatif (ex: 2 échecs sur 3 essais la nuit)
// Anti-spam : sans ça, une panne InfoBip qui dure toute la journée
// déclencherait une notification identique à CHAQUE exécution horaire
// (le taux d'échec est cumulé depuis minuit, donc reste au-dessus du
// seuil pendant des heures) — inutile et fatiguant pour les admins.
const ALERT_COOLDOWN_MS = 4 * 60 * 60 * 1000; // 1 alerte max toutes les 4h pour un même incident en cours
const FCM_MULTICAST_CHUNK_SIZE = 500; // limite dure de sendEachForMulticast
function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size)
        out.push(arr.slice(i, i + size));
    return out;
}
// Transaction : ne renvoie true (= "on peut alerter") que si aucune alerte
// n'a été envoyée dans la fenêtre de cooldown. Évite une race entre deux
// exécutions qui se chevaucheraient (peu probable avec `every 60 minutes`
// mais sans coût de le rendre atomique).
async function tryAcquireAlertCooldown() {
    const ref = admin.firestore().collection('metrics').doc('_registrationHealthAlertState');
    return admin.firestore().runTransaction(async (tx) => {
        var _a, _b, _c;
        const snap = await tx.get(ref);
        const lastAlertAt = (_c = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.lastAlertAt) === null || _b === void 0 ? void 0 : _b.toMillis()) !== null && _c !== void 0 ? _c : 0;
        if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS)
            return false;
        tx.set(ref, { lastAlertAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        return true;
    });
}
async function notifyAdmins(title, body) {
    const adminsSnap = await admin.firestore().collection('users').where('role', '==', 'admin').get();
    const adminIds = adminsSnap.docs.map((d) => d.id);
    if (adminIds.length === 0) {
        console.warn('⚠️ Aucun compte admin trouvé pour notifier une alerte inscription.');
        return;
    }
    const tokensSnaps = await Promise.all(adminIds.map((id) => admin.firestore().collection('users').doc(id).collection('tokens').get()));
    const tokens = tokensSnaps.flatMap((s) => s.docs.map((d) => d.id));
    if (tokens.length === 0)
        return;
    // sendEachForMulticast refuse plus de 500 tokens par appel — avec
    // suffisamment d'admins/appareils, l'appel plantait silencieusement
    // (promesse rejetée, avalée par le .catch ci-dessous) sans jamais
    // notifier personne. On découpe donc en lots.
    await Promise.all(chunk(tokens, FCM_MULTICAST_CHUNK_SIZE).map((tokenChunk) => admin.messaging().sendEachForMulticast({
        tokens: tokenChunk,
        notification: { title, body },
        data: { type: 'admin_alert' },
        android: { priority: 'high' },
        apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
    }).catch((err) => console.error('❌ Échec notification admin (alerte inscription):', err))));
    await Promise.all(adminIds.map((id) => admin.firestore().collection('notifications').add({
        userId: id,
        title,
        body,
        type: 'admin_alert',
        icon: '🚨',
        link: '/admin/registration-health',
        priority: 'high',
        urgent: true,
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })));
}
exports.checkRegistrationHealth = (0, scheduler_1.onSchedule)({ schedule: 'every 60 minutes', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 60 }, async () => {
    var _a, _b, _c, _d, _e, _f, _g;
    const [today] = await (0, metrics_1.getRecentRegistrationMetrics)(1);
    const started = ((_a = today === null || today === void 0 ? void 0 : today.started) !== null && _a !== void 0 ? _a : 0);
    const verifySuccess = ((_b = today === null || today === void 0 ? void 0 : today.verify_success) !== null && _b !== void 0 ? _b : 0);
    const verifyFailed = (((_c = today === null || today === void 0 ? void 0 : today.verify_invalid_code) !== null && _c !== void 0 ? _c : 0) + ((_d = today === null || today === void 0 ? void 0 : today.verify_expired) !== null && _d !== void 0 ? _d : 0) + ((_e = today === null || today === void 0 ? void 0 : today.verify_locked) !== null && _e !== void 0 ? _e : 0));
    const sendFailed = (((_f = today === null || today === void 0 ? void 0 : today.send_failed_push) !== null && _f !== void 0 ? _f : 0) + ((_g = today === null || today === void 0 ? void 0 : today.send_failed_sms) !== null && _g !== void 0 ? _g : 0));
    const totalAttempts = verifySuccess + verifyFailed;
    if (totalAttempts < MIN_VOLUME_FOR_ALERT)
        return;
    const failureRate = verifyFailed / totalAttempts;
    if (failureRate >= FAILURE_RATE_ALERT_THRESHOLD || sendFailed >= MIN_VOLUME_FOR_ALERT) {
        if (!(await tryAcquireAlertCooldown()))
            return; // incident déjà signalé récemment, ne repage pas les admins
        await notifyAdmins('🚨 Inscription AgriMarché : taux d\'échec anormal', `${Math.round(failureRate * 100)}% d'échecs de vérification (${verifyFailed}/${totalAttempts}), ${sendFailed} échec(s) d'envoi, ${started} inscription(s) démarrée(s) aujourd'hui.`);
    }
});
exports.getRegistrationMetrics = (0, https_1.onCall)({ region: 'us-central1' }, async (request) => {
    var _a, _b;
    if (!request.auth)
        throw new https_1.HttpsError('unauthenticated', 'AUTH_REQUIRED');
    const callerSnap = await admin.firestore().collection('users').doc(request.auth.uid).get();
    if (((_a = callerSnap.data()) === null || _a === void 0 ? void 0 : _a.role) !== 'admin')
        throw new https_1.HttpsError('permission-denied', 'ADMIN_ONLY');
    const days = Math.min(Math.max(Number((_b = request.data) === null || _b === void 0 ? void 0 : _b.days) || 7, 1), 30);
    return { metrics: await (0, metrics_1.getRecentRegistrationMetrics)(days) };
});
