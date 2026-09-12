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
exports.loginVerifyOtp = exports.loginSendOtp = void 0;
exports.purgeOldLoginOtpSessions = purgeOldLoginOtpSessions;
// ============================================================
//   loginOtp.ts — 2ᵉ facteur de connexion, UNIQUEMENT pour Free/Yas
//   et Expresso (Orange utilise Firebase Phone Auth nativement, comme
//   à l'inscription — rien à faire ici pour Orange, voir
//   orangeRegistration.ts).
//
//   Contexte : le mot de passe est déjà vérifié côté CLIENT
//   (signInWithEmailAndPassword) AVANT d'appeler loginSendOtp — donc
//   request.auth est déjà renseigné ici. Conséquence de sécurité
//   importante : on ne fait JAMAIS confiance à un numéro envoyé par le
//   client. Le numéro utilisé est toujours celui déjà enregistré sur
//   users/{uid}, jamais une valeur reçue dans la requête — sans quoi
//   un compte authentifié A pourrait demander l'envoi d'un OTP vers le
//   numéro d'un compte B.
// ============================================================
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const otp_1 = require("./otp");
const rateLimit_1 = require("./rateLimit");
const otpChannel_1 = require("./otpChannel");
const audit_1 = require("./audit");
const metrics_1 = require("./metrics");
const errorMessages_1 = require("./errorMessages");
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
function throwLocalized(httpsCode, techCode) {
    throw new https_1.HttpsError(httpsCode, techCode, { message: (0, errorMessages_1.localizeError)(techCode) });
}
function sessionsCol() {
    return admin.firestore().collection('loginOtpSessions');
}
function clientIp(rawRequest) {
    var _a, _b, _c;
    return ((rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.ip) ||
        ((_c = (_b = (_a = rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.headers) === null || _a === void 0 ? void 0 : _a['x-forwarded-for']) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim()) ||
        'unknown');
}
exports.loginSendOtp = (0, https_1.onCall)({ region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true }, async (request) => {
    var _a;
    if (!request.auth)
        throwLocalized('unauthenticated', 'AUTH_REQUIRED');
    const uid = request.auth.uid;
    const ip = clientIp(request.rawRequest);
    try {
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`login:uid:${uid}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`login:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    }
    catch (err) {
        if (err instanceof rateLimit_1.RateLimitedError)
            throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
        throw err;
    }
    const userDoc = await admin.firestore().collection('users').doc(uid).get();
    const phone = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.phone;
    if (!phone) {
        // Ne devrait jamais arriver pour un compte Free/Expresso (le
        // numéro est requis dès l'inscription) — on refuse proprement
        // plutôt que d'envoyer un SMS à personne.
        throwLocalized('failed-precondition', 'PHONE_NOT_VERIFIED');
    }
    const sessionRef = sessionsCol().doc();
    const code = (0, otp_1.generateOtp)();
    const otpHash = (0, otp_1.hashOtp)(code, sessionRef.id);
    const now = admin.firestore.Timestamp.now();
    await sessionRef.set({
        uid,
        phone,
        otpHash,
        otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
        attempts: 0,
        maxAttempts: MAX_VERIFY_ATTEMPTS,
        status: 'pending',
        createdAt: now,
        ip,
    });
    // Compte déjà existant (on est en 2ᵉ facteur, pas en inscription) :
    // on va chercher nous-mêmes un token push déjà enregistré pour ce
    // uid, plutôt que d'exiger un changement côté client — voir
    // otpChannel.ts.
    const pushToken = await (0, otpChannel_1.getMostRecentPushToken)(uid);
    let channel;
    try {
        channel = await (0, otpChannel_1.decideChannelAndSend)(sessionRef.id, phone, pushToken, code, 'connexion', 'login');
    }
    catch (err) {
        await sessionRef.update({ status: 'send_failed' });
        await (0, audit_1.logAuditEvent)({ type: 'login_otp_rejected', sessionId: sessionRef.id, phone, ip, reason: 'send_failed' });
        throw err; // déjà un HttpsError('unavailable', 'SMS_SEND_FAILED') localisé côté client
    }
    await (0, audit_1.logAuditEvent)({ type: 'login_otp_sent', sessionId: sessionRef.id, phone, ip, channel });
    return { sessionId: sessionRef.id, otpTtlSeconds: OTP_TTL_MS / 1000 };
});
exports.loginVerifyOtp = (0, https_1.onCall)({ region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d;
    if (!request.auth)
        throwLocalized('unauthenticated', 'AUTH_REQUIRED');
    const uid = request.auth.uid;
    const sessionId = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.sessionId) !== null && _b !== void 0 ? _b : '');
    const code = String((_d = (_c = request.data) === null || _c === void 0 ? void 0 : _c.code) !== null && _d !== void 0 ? _d : '');
    if (!sessionId || !code)
        throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');
    try {
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`login_verify:${sessionId}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
    }
    catch (err) {
        if (err instanceof rateLimit_1.RateLimitedError)
            throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
        throw err;
    }
    const ref = sessionsCol().doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists)
        throwLocalized('not-found', 'SESSION_NOT_FOUND');
    const data = snap.data();
    // ⚠️ La session doit appartenir au MÊME utilisateur authentifié qui a
    // demandé le code — sans ce contrôle, un uid A authentifié pourrait
    // essayer de deviner/valider le sessionId d'un uid B.
    if (data.uid !== uid)
        throwLocalized('permission-denied', 'SESSION_NOT_FOUND');
    if (data.status === 'verified') {
        const customToken = await admin.auth().createCustomToken(uid);
        return { verified: true, customToken };
    }
    if (data.status !== 'pending')
        throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    if (data.otpExpiresAt.toMillis() < Date.now()) {
        await ref.update({ status: 'expired' });
        await (0, audit_1.logAuditEvent)({ type: 'login_otp_verify_failed', sessionId, phone: data.phone, reason: 'expired' });
        throwLocalized('deadline-exceeded', 'CODE_EXPIRED');
    }
    if (data.attempts >= data.maxAttempts) {
        await ref.update({ status: 'locked' });
        await (0, audit_1.logAuditEvent)({ type: 'login_otp_verify_failed', sessionId, phone: data.phone, reason: 'locked' });
        throwLocalized('resource-exhausted', 'TOO_MANY_ATTEMPTS');
    }
    const ok = (0, otp_1.verifyOtpHash)(code, sessionId, data.otpHash);
    if (!ok) {
        await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
        await (0, metrics_1.bumpRegistrationMetric)('login_otp_invalid_code');
        throwLocalized('invalid-argument', `INVALID_CODE:${data.maxAttempts - data.attempts - 1}`);
    }
    await ref.update({ status: 'verified', otpHash: admin.firestore.FieldValue.delete() });
    await (0, metrics_1.bumpRegistrationMetric)('login_otp_verify_success');
    await (0, audit_1.logAuditEvent)({ type: 'login_otp_verify_success', sessionId, phone: data.phone, accountId: uid });
    // Un customToken n'est pas strictement indispensable ici (le client
    // est déjà authentifié par mot de passe), mais on le renvoie quand
    // même pour rester symétrique avec le flow d'inscription, et pour
    // rafraîchir la session avec un token qui reflète bien le 2ᵉ facteur
    // validé.
    const customToken = await admin.auth().createCustomToken(uid);
    return { verified: true, customToken };
});
// Purge quotidienne, même logique que purgeOldRegistrationSessions
// (registration.ts) — évite que la collection grossisse indéfiniment.
async function purgeOldLoginOtpSessions(olderThanMs) {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
    const snap = await sessionsCol().where('createdAt', '<', cutoff).limit(400).get();
    if (snap.empty)
        return 0;
    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}
