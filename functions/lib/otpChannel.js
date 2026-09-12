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
exports.getMostRecentPushToken = getMostRecentPushToken;
exports.decideChannelAndSend = decideChannelAndSend;
// ============================================================
//   otpChannel.ts — Choix du canal d'envoi OTP (push d'abord, SMS
//   Infobip en secours), factorisé pour être partagé entre
//   registration.ts, loginOtp.ts et passwordReset.ts.
//
//   Avant ce fichier, seul registration.ts avait cette logique
//   (voir son decideChannelAndSend interne) : loginOtp.ts et
//   passwordReset.ts envoyaient TOUJOURS par SMS Infobip, sans
//   jamais essayer le push, même quand un token existait déjà pour
//   ce compte. Une panne/mauvaise config Infobip cassait donc ces
//   deux parcours sans jamais toucher l'inscription.
//
//   Différence avec le decideChannelAndSend original de
//   registration.ts : celui-ci demandait un pushToken FOURNI PAR LE
//   CLIENT (capté avant même la création du compte, via
//   deviceTokens/{token} — voir useFCMToken.ts / migratePendingFcmToken
//   côté frontend). Ici, pour login et reset, le compte existe déjà :
//   on va donc chercher nous-mêmes le token le plus récent déjà
//   enregistré sur users/{uid}/tokens (écrit par
//   registerNotificationToken dans AuthContext.tsx), sans exiger un
//   changement du frontend.
// ============================================================
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const smsInfobip_1 = require("./smsInfobip");
const metrics_1 = require("./metrics");
const errorMessages_1 = require("./errorMessages");
// Le token le plus récent d'un compte déjà existant (login, reset).
// Best-effort : une erreur de lecture Firestore ne doit jamais bloquer
// l'envoi du code, seulement le faire retomber sur SMS.
async function getMostRecentPushToken(uid) {
    var _a;
    try {
        const snap = await admin
            .firestore()
            .collection('users')
            .doc(uid)
            .collection('tokens')
            .orderBy('createdAt', 'desc')
            .limit(1)
            .get();
        return (_a = snap.docs[0]) === null || _a === void 0 ? void 0 : _a.id;
    }
    catch (err) {
        console.warn(`⚠️ Lecture token push impossible pour ${uid}, fallback SMS:`, err);
        return undefined;
    }
}
// Envoie le code par push si un token est fourni, sinon par SMS
// Infobip. `metricPrefix` distingue les métriques par parcours
// (ex: 'login', 'reset', 'registration') tout en gardant les mêmes
// noms de suffixe ('_sent_push', '_send_failed_sms', etc.) que
// registration.ts pour rester lisible dans le dashboard admin.
async function decideChannelAndSend(sessionId, phone, pushToken, code, purpose, metricPrefix) {
    const channel = pushToken ? 'push' : 'sms_infobip';
    if (channel === 'push') {
        try {
            await admin.messaging().send({
                token: pushToken,
                notification: {
                    title: 'AgriMarché',
                    body: `Votre code de ${purpose} AgriMarché est : ${code}. Ce code expire dans 5 minutes.`,
                },
                data: { type: `${metricPrefix}_otp`, sessionId },
                android: { priority: 'high' },
                apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
            });
            await (0, metrics_1.bumpRegistrationMetric)(`${metricPrefix}_sent_push`);
            return 'push';
        }
        catch (err) {
            // ⚠️ Ne PAS abandonner ici : un token existe mais peut être
            // périmé (désinstallation, changement d'appareil...). On retombe
            // sur SMS plutôt que d'échouer l'envoi du code entièrement —
            // exactement le même filet que si aucun token n'avait existé.
            console.error(`❌ Échec envoi push OTP (${metricPrefix}, session ${sessionId}):`, (err === null || err === void 0 ? void 0 : err.code) || err);
            await (0, metrics_1.bumpRegistrationMetric)(`${metricPrefix}_send_failed_push`);
            // tombe dans le bloc SMS ci-dessous
        }
    }
    try {
        await (0, smsInfobip_1.sendOtpSmsInfobip)(phone, code, purpose);
    }
    catch (err) {
        await (0, metrics_1.bumpRegistrationMetric)(`${metricPrefix}_send_failed_sms`);
        // ⚠️ Toujours passer `details.message` : c'est ce champ que lit
        // registrationActions.ts côté front (toActionError). Sans lui, le
        // client retombe sur son texte générique "Une erreur est survenue.
        // Réessaie." — exactement le symptôme observé sur le numéro 70.
        throw new https_1.HttpsError('unavailable', 'SMS_SEND_FAILED', { message: (0, errorMessages_1.localizeError)('SMS_SEND_FAILED') });
    }
    await (0, metrics_1.bumpRegistrationMetric)(`${metricPrefix}_sent_sms`);
    return 'sms_infobip';
}
