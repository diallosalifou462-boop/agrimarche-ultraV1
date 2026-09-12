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
exports.resetPasswordVerifyOtp = exports.resetPasswordSendOtp = void 0;
exports.purgeOldPasswordResetSessions = purgeOldPasswordResetSessions;
// ============================================================
//   passwordReset.ts — Réinitialisation de mot de passe, UNIQUEMENT
//   pour Free/Yas et Expresso (Orange repasse par Firebase Phone Auth
//   nativement, comme à l'inscription et au login — voir
//   orangeRegistration.ts et loginOtp.ts).
//
//   Différence structurante avec l'inscription (registration.ts) :
//   ici le numéro DOIT déjà appartenir à un compte existant
//   (phoneIndex/{phone}.accountId) — exactement l'inverse de
//   registrationStart, qui refuse au contraire un numéro déjà pris.
//
//   Le client n'est PAS authentifié à cet instant (c'est justement le
//   mot de passe oublié) : /verify renvoie un customToken, à utiliser
//   côté client avec signInWithCustomToken() PUIS updatePassword()
//   (SDK client, pas ici) — voir app/auth/forgot-password/page.tsx.
//   Aucun nouveau mot de passe ne transite donc par cette fonction.
// ============================================================
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const carrier_1 = require("./carrier");
const phoneUniqueness_1 = require("./phoneUniqueness");
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
    return admin.firestore().collection('passwordResetSessions');
}
function clientIp(rawRequest) {
    var _a, _b, _c;
    return ((rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.ip) ||
        ((_c = (_b = (_a = rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.headers) === null || _a === void 0 ? void 0 : _a['x-forwarded-for']) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim()) ||
        'unknown');
}
exports.resetPasswordSendOtp = (0, https_1.onCall)({ region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true }, async (request) => {
    var _a, _b;
    const phoneRaw = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.phone) !== null && _b !== void 0 ? _b : '');
    const phone = (0, carrier_1.normalizePhoneSN)(phoneRaw);
    if (!phone)
        throwLocalized('invalid-argument', 'INVALID_PHONE');
    const ip = clientIp(request.rawRequest);
    try {
        // Plafonds volontairement identiques à registrationStart : même
        // profil d'abus possible (spam SMS sur un numéro tiers), même
        // défense.
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`reset:phone:${phone}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`reset:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    }
    catch (err) {
        if (err instanceof rateLimit_1.RateLimitedError)
            throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
        throw err;
    }
    const carrier = await (0, carrier_1.detectCarrier)(phone);
    if (carrier === 'orange') {
        // Cohérent avec registrationStart : Orange ne passe jamais par ce
        // backend — le frontend doit rediriger vers Firebase Phone Auth
        // (déjà le cas dans forgot-password/page.tsx via detectCarrier()).
        throwLocalized('failed-precondition', 'ORANGE_USE_FIREBASE_AUTH');
    }
    const uid = await (0, phoneUniqueness_1.getAccountIdForPhone)(phone);
    if (!uid) {
        await (0, audit_1.logAuditEvent)({ type: 'reset_otp_rejected', phone, ip, reason: 'account_not_found' });
        throwLocalized('not-found', 'ACCOUNT_NOT_FOUND');
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
    // Le compte existe déjà (vérifié juste au-dessus via uid) : on va
    // chercher un token push déjà enregistré pour lui, même si
    // l'utilisateur n'est plus authentifié sur CETTE session (mot de
    // passe oublié) — voir otpChannel.ts.
    const pushToken = await (0, otpChannel_1.getMostRecentPushToken)(uid);
    let channel;
    try {
        channel = await (0, otpChannel_1.decideChannelAndSend)(sessionRef.id, phone, pushToken, code, 'réinitialisation', 'reset');
    }
    catch (err) {
        await sessionRef.update({ status: 'send_failed' });
        throw err; // déjà un HttpsError('unavailable', 'SMS_SEND_FAILED') localisé côté client
    }
    await (0, audit_1.logAuditEvent)({ type: 'reset_otp_sent', sessionId: sessionRef.id, phone, ip, channel });
    return { sessionId: sessionRef.id, otpTtlSeconds: OTP_TTL_MS / 1000 };
});
exports.resetPasswordVerifyOtp = (0, https_1.onCall)({ region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d;
    const sessionId = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.sessionId) !== null && _b !== void 0 ? _b : '');
    const code = String((_d = (_c = request.data) === null || _c === void 0 ? void 0 : _c.code) !== null && _d !== void 0 ? _d : '');
    if (!sessionId || !code)
        throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');
    try {
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`reset_verify:${sessionId}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
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
    if (data.status === 'verified') {
        // Rejouable : le client peut avoir perdu la réponse réseau après un
        // premier succès (retry). On renvoie un nouveau customToken plutôt
        // que d'échouer, tant que la session existe encore.
        const customToken = await admin.auth().createCustomToken(data.uid);
        return { uid: data.uid, customToken };
    }
    if (data.status !== 'pending')
        throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    if (data.otpExpiresAt.toMillis() < Date.now()) {
        await ref.update({ status: 'expired' });
        await (0, audit_1.logAuditEvent)({ type: 'reset_otp_verify_failed', sessionId, phone: data.phone, reason: 'expired' });
        throwLocalized('deadline-exceeded', 'CODE_EXPIRED');
    }
    if (data.attempts >= data.maxAttempts) {
        await ref.update({ status: 'locked' });
        await (0, audit_1.logAuditEvent)({ type: 'reset_otp_verify_failed', sessionId, phone: data.phone, reason: 'locked' });
        throwLocalized('resource-exhausted', 'TOO_MANY_ATTEMPTS');
    }
    const ok = (0, otp_1.verifyOtpHash)(code, sessionId, data.otpHash);
    if (!ok) {
        await ref.update({ attempts: admin.firestore.FieldValue.increment(1) });
        await (0, metrics_1.bumpRegistrationMetric)('reset_otp_invalid_code');
        throwLocalized('invalid-argument', `INVALID_CODE:${data.maxAttempts - data.attempts - 1}`);
    }
    await ref.update({ status: 'verified', otpHash: admin.firestore.FieldValue.delete() });
    await (0, metrics_1.bumpRegistrationMetric)('reset_otp_verify_success');
    await (0, audit_1.logAuditEvent)({ type: 'reset_otp_verify_success', sessionId, phone: data.phone, accountId: data.uid });
    const customToken = await admin.auth().createCustomToken(data.uid);
    return { uid: data.uid, customToken };
});
// Purge quotidienne, même logique que purgeOldRegistrationSessions
// (registration.ts) — évite que la collection grossisse indéfiniment.
async function purgeOldPasswordResetSessions(olderThanMs) {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
    const snap = await sessionsCol().where('createdAt', '<', cutoff).limit(400).get();
    if (snap.empty)
        return 0;
    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}
