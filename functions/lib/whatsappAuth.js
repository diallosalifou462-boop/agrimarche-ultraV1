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
exports.verifyWhatsAppOtp = exports.requestWhatsAppOtp = void 0;
// functions/src/whatsappAuth.ts
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const crypto = __importStar(require("crypto"));
const whatsapp_1 = require("./whatsapp");
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const OTP_TTL_MS = 5 * 60 * 1000; // durée de vie du code : 5 min
const MIN_DELAY_BETWEEN_REQUESTS_MS = 60 * 1000; // 1 envoi / minute / numéro
const MAX_ATTEMPTS = 5; // tentatives de vérification avant blocage du code
const WHATSAPP_TEMPLATE_NAME = 'otp_verification'; // ⚠️ nom exact du template approuvé dans WhatsApp Manager
const WHATSAPP_TEMPLATE_LANG = 'fr';
// ✅ Le client doit envoyer le numéro déjà normalisé en E.164 (+221XXXXXXXXX).
//    On ne fait ici que valider le format, pas la normalisation elle-même.
function toE164Digits(phone) {
    const digits = phone.replace(/\D/g, '');
    if (!digits.startsWith('221') || digits.length !== 12) {
        throw new https_1.HttpsError('invalid-argument', 'Numéro sénégalais invalide, format attendu +221XXXXXXXXX');
    }
    return digits;
}
function hashCode(code, salt) {
    return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
}
function generateCode() {
    return crypto.randomInt(100000, 999999).toString();
}
// ─── 1. Demande d'envoi du code ──────────────────────────────
exports.requestWhatsAppOtp = (0, https_1.onCall)(async (request) => {
    var _a, _b, _c, _d;
    const phoneRaw = (_a = request.data) === null || _a === void 0 ? void 0 : _a.phone;
    if (typeof phoneRaw !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Numéro de téléphone manquant');
    }
    const digits = toE164Digits(phoneRaw);
    const otpRef = db.collection('whatsappOtps').doc(digits);
    const existing = await otpRef.get();
    // ✅ Anti-spam : un seul envoi par minute par numéro
    if (existing.exists) {
        const data = existing.data();
        const lastSentAt = (_d = (_c = (_b = data.lastSentAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0;
        if (Date.now() - lastSentAt < MIN_DELAY_BETWEEN_REQUESTS_MS) {
            throw new https_1.HttpsError('resource-exhausted', 'Veuillez patienter avant de redemander un code');
        }
    }
    const code = generateCode();
    const salt = crypto.randomBytes(8).toString('hex');
    // On envoie AVANT d'écrire en base : si WhatsApp échoue, on ne laisse pas
    // un code "fantôme" que l'utilisateur ne recevra jamais.
    await (0, whatsapp_1.sendWhatsAppOtp)({
        to: digits,
        code,
        templateName: WHATSAPP_TEMPLATE_NAME,
        languageCode: WHATSAPP_TEMPLATE_LANG,
    });
    await otpRef.set({
        codeHash: hashCode(code, salt),
        salt,
        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
        attempts: 0,
    });
    return { success: true };
});
// ─── 2. Vérification du code + émission d'un custom token ───
exports.verifyWhatsAppOtp = (0, https_1.onCall)(async (request) => {
    var _a, _b;
    const phoneRaw = (_a = request.data) === null || _a === void 0 ? void 0 : _a.phone;
    const code = (_b = request.data) === null || _b === void 0 ? void 0 : _b.code;
    if (typeof phoneRaw !== 'string' || typeof code !== 'string') {
        throw new https_1.HttpsError('invalid-argument', 'Numéro ou code manquant');
    }
    const digits = toE164Digits(phoneRaw);
    const otpRef = db.collection('whatsappOtps').doc(digits);
    const snap = await otpRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError('not-found', 'Aucun code demandé pour ce numéro');
    }
    const data = snap.data();
    if (data.expiresAt.toMillis() < Date.now()) {
        await otpRef.delete();
        throw new https_1.HttpsError('deadline-exceeded', 'Code expiré, redemandez-en un');
    }
    if (data.attempts >= MAX_ATTEMPTS) {
        await otpRef.delete();
        throw new https_1.HttpsError('resource-exhausted', 'Trop de tentatives, redemandez un code');
    }
    const isValid = data.codeHash === hashCode(code, data.salt);
    if (!isValid) {
        await otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) });
        throw new https_1.HttpsError('invalid-argument', 'Code incorrect');
    }
    await otpRef.delete();
    // ✅ uid déterministe : un même numéro retombe toujours sur le même compte
    //    Firebase Auth, que ce soit une première connexion ou un retour.
    const uid = `wa_${digits}`;
    try {
        await admin.auth().getUser(uid);
    }
    catch (_c) {
        await admin.auth().createUser({
            uid,
            phoneNumber: `+${digits}`,
        });
    }
    const customToken = await admin.auth().createCustomToken(uid);
    return { customToken };
});
