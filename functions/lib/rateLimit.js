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
exports.RateLimitedError = void 0;
exports.checkAndConsumeRateLimit = checkAndConsumeRateLimit;
exports.enforceMinDelay = enforceMinDelay;
exports.purgeOldRateLimitDocs = purgeOldRateLimitDocs;
// ============================================================
//   rateLimit.ts — Anti-abus pour /registration/start, /resend,
//   /verify (section 4 et 7 du cahier des charges).
//
//   Compteur à fenêtre fixe par clé (numéro, session ou IP). Simple
//   et suffisant ici : pas besoin d'une fenêtre glissante précise
//   pour bloquer du spam, seulement d'un plafond fiable qui ne
//   nécessite pas d'infra supplémentaire (Redis...).
// ============================================================
const admin = __importStar(require("firebase-admin"));
class RateLimitedError extends Error {
    constructor(retryAfterMs) {
        super('RATE_LIMITED');
        this.retryAfterMs = retryAfterMs;
        this.name = 'RateLimitedError';
    }
}
exports.RateLimitedError = RateLimitedError;
async function checkAndConsumeRateLimit(key, opts) {
    const ref = admin.firestore().collection('rateLimits').doc(key);
    await admin.firestore().runTransaction(async (tx) => {
        var _a, _b;
        const snap = await tx.get(ref);
        const now = Date.now();
        const data = snap.data();
        const windowStart = (_a = data === null || data === void 0 ? void 0 : data.windowStart) !== null && _a !== void 0 ? _a : 0;
        const withinWindow = now - windowStart < opts.windowMs;
        const count = withinWindow ? ((_b = data === null || data === void 0 ? void 0 : data.count) !== null && _b !== void 0 ? _b : 0) : 0;
        if (withinWindow && count >= opts.maxAttempts) {
            throw new RateLimitedError(windowStart + opts.windowMs - now);
        }
        tx.set(ref, {
            windowStart: withinWindow ? windowStart : now,
            count: count + 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
// Délai minimum entre deux "Renvoyer le code" (section 7) — distinct
// du compteur ci-dessus qui plafonne le NOMBRE total de demandes.
async function enforceMinDelay(key, minDelayMs) {
    const ref = admin.firestore().collection('rateLimits').doc(`${key}:lastAt`);
    await admin.firestore().runTransaction(async (tx) => {
        var _a, _b;
        const snap = await tx.get(ref);
        const now = Date.now();
        const lastAt = (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.at) !== null && _b !== void 0 ? _b : 0;
        if (now - lastAt < minDelayMs) {
            throw new RateLimitedError(minDelayMs - (now - lastAt));
        }
        tx.set(ref, { at: now }, { merge: true });
    });
}
// Purge quotidienne, symétrique à cleanupProcessedEvents dans
// index.ts — évite que rateLimits grossisse indéfiniment.
async function purgeOldRateLimitDocs(olderThanMs) {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
    const snap = await admin
        .firestore()
        .collection('rateLimits')
        .where('updatedAt', '<', cutoff)
        .limit(400)
        .get();
    if (snap.empty)
        return 0;
    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}
