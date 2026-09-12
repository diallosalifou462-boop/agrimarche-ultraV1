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
exports.generateOtp = generateOtp;
exports.hashOtp = hashOtp;
exports.verifyOtpHash = verifyOtpHash;
// ============================================================
//   otp.ts — Génération et vérification du code d'inscription.
//
//   ⚠️ Aucune fonction ici ne doit jamais logger le code en clair
//   (voir section 4 du cahier des charges). Seul generateOtp()
//   voit le code en clair, le temps de l'envoyer ; tout le reste
//   du système ne manipule que son hash.
// ============================================================
const crypto = __importStar(require("crypto"));
const OTP_LENGTH = 6;
// HMAC-SHA256 plutôt qu'un simple SHA256 : le pepper (secret serveur,
// jamais stocké avec le hash) empêche un attaquant ayant exfiltré la
// base Firestore de reconstituer les codes par force brute hors-ligne
// sur un espace de seulement 10^6 possibilités (largement cassable en
// SHA256 nu vu la taille minuscule de l'espace de recherche).
function getPepper() {
    const pepper = process.env.OTP_HASH_PEPPER;
    if (!pepper) {
        // Ne doit jamais arriver en prod (secret déclaré sur les functions
        // concernées) — on refuse plutôt que de dégrader silencieusement
        // vers un hash non peppré.
        throw new Error('OTP_HASH_PEPPER manquant — vérifie la configuration des secrets.');
    }
    return pepper;
}
function generateOtp() {
    // crypto.randomInt est cryptographiquement sûr (contrairement à
    // Math.random) et sans biais modulo (contrairement à
    // `randomBytes(...) % 10`).
    const max = 10 ** OTP_LENGTH;
    const code = crypto.randomInt(0, max);
    return code.toString().padStart(OTP_LENGTH, '0');
}
function hashOtp(code, sessionId) {
    // sessionId lié au hash (comme un sel) : deux sessions différentes
    // qui tireraient par hasard le même code à 6 chiffres n'ont pas le
    // même hash, ce qui interdit les tables précalculées inter-sessions.
    return crypto.createHmac('sha256', getPepper()).update(`${sessionId}:${code}`).digest('hex');
}
// Comparaison à temps constant : évite qu'un attaquant mesure de
// micro-différences de latence pour deviner le hash correct chiffre
// par chiffre (timing attack), même si la surface d'attaque réelle
// ici est déjà réduite par le rate-limiting sur /verify.
function verifyOtpHash(candidateCode, sessionId, storedHash) {
    const candidateHash = hashOtp(candidateCode, sessionId);
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length)
        return false;
    return crypto.timingSafeEqual(a, b);
}
