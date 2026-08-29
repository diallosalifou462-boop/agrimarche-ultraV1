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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyWhatsAppOtp = exports.requestWhatsAppOtp = void 0;
// functions/src/whatsappAuth.ts
var https_1 = require("firebase-functions/v2/https");
var admin = require("firebase-admin");
var crypto = require("crypto");
var whatsapp_1 = require("./whatsapp");
if (!admin.apps.length) {
    admin.initializeApp();
}
var db = admin.firestore();
var OTP_TTL_MS = 5 * 60 * 1000; // durée de vie du code : 5 min
var MIN_DELAY_BETWEEN_REQUESTS_MS = 60 * 1000; // 1 envoi / minute / numéro
var MAX_ATTEMPTS = 5; // tentatives de vérification avant blocage du code
var WHATSAPP_TEMPLATE_NAME = 'otp_verification'; // ⚠️ nom exact du template approuvé dans WhatsApp Manager
var WHATSAPP_TEMPLATE_LANG = 'fr';
// ✅ Le client doit envoyer le numéro déjà normalisé en E.164 (+221XXXXXXXXX).
//    On ne fait ici que valider le format, pas la normalisation elle-même.
function toE164Digits(phone) {
    var digits = phone.replace(/\D/g, '');
    if (!digits.startsWith('221') || digits.length !== 12) {
        throw new https_1.HttpsError('invalid-argument', 'Numéro sénégalais invalide, format attendu +221XXXXXXXXX');
    }
    return digits;
}
function hashCode(code, salt) {
    return crypto.createHash('sha256').update("".concat(code, ":").concat(salt)).digest('hex');
}
function generateCode() {
    return crypto.randomInt(100000, 999999).toString();
}
// ─── 1. Demande d'envoi du code ──────────────────────────────
exports.requestWhatsAppOtp = (0, https_1.onCall)(function (request) { return __awaiter(void 0, void 0, void 0, function () {
    var phoneRaw, digits, otpRef, existing, data, lastSentAt, code, salt;
    var _a, _b, _c, _d;
    return __generator(this, function (_e) {
        switch (_e.label) {
            case 0:
                phoneRaw = (_a = request.data) === null || _a === void 0 ? void 0 : _a.phone;
                if (typeof phoneRaw !== 'string') {
                    throw new https_1.HttpsError('invalid-argument', 'Numéro de téléphone manquant');
                }
                digits = toE164Digits(phoneRaw);
                otpRef = db.collection('whatsappOtps').doc(digits);
                return [4 /*yield*/, otpRef.get()];
            case 1:
                existing = _e.sent();
                // ✅ Anti-spam : un seul envoi par minute par numéro
                if (existing.exists) {
                    data = existing.data();
                    lastSentAt = (_d = (_c = (_b = data.lastSentAt) === null || _b === void 0 ? void 0 : _b.toMillis) === null || _c === void 0 ? void 0 : _c.call(_b)) !== null && _d !== void 0 ? _d : 0;
                    if (Date.now() - lastSentAt < MIN_DELAY_BETWEEN_REQUESTS_MS) {
                        throw new https_1.HttpsError('resource-exhausted', 'Veuillez patienter avant de redemander un code');
                    }
                }
                code = generateCode();
                salt = crypto.randomBytes(8).toString('hex');
                // On envoie AVANT d'écrire en base : si WhatsApp échoue, on ne laisse pas
                // un code "fantôme" que l'utilisateur ne recevra jamais.
                return [4 /*yield*/, (0, whatsapp_1.sendWhatsAppOtp)({
                        to: digits,
                        code: code,
                        templateName: WHATSAPP_TEMPLATE_NAME,
                        languageCode: WHATSAPP_TEMPLATE_LANG,
                    })];
            case 2:
                // On envoie AVANT d'écrire en base : si WhatsApp échoue, on ne laisse pas
                // un code "fantôme" que l'utilisateur ne recevra jamais.
                _e.sent();
                return [4 /*yield*/, otpRef.set({
                        codeHash: hashCode(code, salt),
                        salt: salt,
                        expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + OTP_TTL_MS),
                        lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
                        attempts: 0,
                    })];
            case 3:
                _e.sent();
                return [2 /*return*/, { success: true }];
        }
    });
}); });
// ─── 2. Vérification du code + émission d'un custom token ───
exports.verifyWhatsAppOtp = (0, https_1.onCall)(function (request) { return __awaiter(void 0, void 0, void 0, function () {
    var phoneRaw, code, digits, otpRef, snap, data, isValid, uid, _a, customToken;
    var _b, _c;
    return __generator(this, function (_d) {
        switch (_d.label) {
            case 0:
                phoneRaw = (_b = request.data) === null || _b === void 0 ? void 0 : _b.phone;
                code = (_c = request.data) === null || _c === void 0 ? void 0 : _c.code;
                if (typeof phoneRaw !== 'string' || typeof code !== 'string') {
                    throw new https_1.HttpsError('invalid-argument', 'Numéro ou code manquant');
                }
                digits = toE164Digits(phoneRaw);
                otpRef = db.collection('whatsappOtps').doc(digits);
                return [4 /*yield*/, otpRef.get()];
            case 1:
                snap = _d.sent();
                if (!snap.exists) {
                    throw new https_1.HttpsError('not-found', 'Aucun code demandé pour ce numéro');
                }
                data = snap.data();
                if (!(data.expiresAt.toMillis() < Date.now())) return [3 /*break*/, 3];
                return [4 /*yield*/, otpRef.delete()];
            case 2:
                _d.sent();
                throw new https_1.HttpsError('deadline-exceeded', 'Code expiré, redemandez-en un');
            case 3:
                if (!(data.attempts >= MAX_ATTEMPTS)) return [3 /*break*/, 5];
                return [4 /*yield*/, otpRef.delete()];
            case 4:
                _d.sent();
                throw new https_1.HttpsError('resource-exhausted', 'Trop de tentatives, redemandez un code');
            case 5:
                isValid = data.codeHash === hashCode(code, data.salt);
                if (!!isValid) return [3 /*break*/, 7];
                return [4 /*yield*/, otpRef.update({ attempts: admin.firestore.FieldValue.increment(1) })];
            case 6:
                _d.sent();
                throw new https_1.HttpsError('invalid-argument', 'Code incorrect');
            case 7: return [4 /*yield*/, otpRef.delete()];
            case 8:
                _d.sent();
                uid = "wa_".concat(digits);
                _d.label = 9;
            case 9:
                _d.trys.push([9, 11, , 13]);
                return [4 /*yield*/, admin.auth().getUser(uid)];
            case 10:
                _d.sent();
                return [3 /*break*/, 13];
            case 11:
                _a = _d.sent();
                return [4 /*yield*/, admin.auth().createUser({
                        uid: uid,
                        phoneNumber: "+".concat(digits),
                    })];
            case 12:
                _d.sent();
                return [3 /*break*/, 13];
            case 13: return [4 /*yield*/, admin.auth().createCustomToken(uid)];
            case 14:
                customToken = _d.sent();
                return [2 /*return*/, { customToken: customToken }];
        }
    });
}); });
