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
exports.bumpRegistrationMetric = bumpRegistrationMetric;
exports.getRecentRegistrationMetrics = getRecentRegistrationMetrics;
// ============================================================
//   metrics.ts — Compteurs agrégés du parcours d'inscription,
//   par jour, pour alimenter un dashboard admin et l'alerting.
//
//   Un seul doc par jour (metrics/registration_YYYY-MM-DD) avec des
//   compteurs incrémentés atomiquement — pas de scan de collection
//   coûteux pour afficher un dashboard, tout est déjà agrégé.
// ============================================================
const admin = __importStar(require("firebase-admin"));
function todayKey() {
    // YYYY-MM-DD en UTC. Coïncide exactement avec Africa/Dakar (UTC+0,
    // pas d'heure d'été) — donc pas de décalage avec les tâches planifiées
    // du fichier index.ts qui, elles, utilisent explicitement ce fuseau.
    return new Date().toISOString().slice(0, 10);
}
async function bumpRegistrationMetric(field, by = 1) {
    try {
        const ref = admin.firestore().collection('metrics').doc(`registration_${todayKey()}`);
        await ref.set({
            [field]: admin.firestore.FieldValue.increment(by),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    catch (err) {
        console.error('⚠️ Échec incrément métrique:', err);
    }
}
// Champs utilisés (créés à la volée par bumpRegistrationMetric, donc
// pas besoin de schéma préalable) :
//   started, started_orange, started_expresso, started_tigo, started_unknown
//   rejected_phone_used, rejected_orange_redirect, rejected_rate_limited
//   sent_push, sent_sms, send_failed_push, send_failed_sms
//   verify_success, verify_invalid_code, verify_expired, verify_locked
//   accounts_created_push_infobip, accounts_created_orange
//   fraud_flagged
async function getRecentRegistrationMetrics(days) {
    var _a;
    const out = [];
    const now = new Date();
    for (let i = 0; i < days; i++) {
        const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        const snap = await admin.firestore().collection('metrics').doc(`registration_${key}`).get();
        out.push(Object.assign({ date: key }, ((_a = snap.data()) !== null && _a !== void 0 ? _a : {})));
    }
    return out;
}
