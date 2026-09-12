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
exports.logAuditEvent = logAuditEvent;
// ============================================================
//   audit.ts — Journal d'audit append-only du parcours
//   d'inscription. Distinct de registrationSessions (qui, lui, est
//   MUTABLE et sert à faire tourner la logique) : ce journal ne
//   sert qu'à reconstituer a posteriori "qui a fait quoi, quand,
//   avec quel résultat" — utile pour une investigation fraude,
//   un support client, ou un audit de sécurité.
//
//   ⚠️ Ne jamais écrire le code OTP ici, même en cas d'échec —
//   mêmes règles que pour les logs serveur (section 4).
// ============================================================
const admin = __importStar(require("firebase-admin"));
async function logAuditEvent(event) {
    try {
        await admin.firestore().collection('registrationAuditLog').add(Object.assign(Object.assign({}, event), { at: admin.firestore.FieldValue.serverTimestamp() }));
    }
    catch (err) {
        // L'audit ne doit jamais faire échouer le parcours utilisateur —
        // un défaut d'écriture ici est une dégradation silencieuse
        // acceptable, pas une raison de bloquer une inscription légitime.
        console.error('⚠️ Échec écriture audit log:', err);
    }
}
