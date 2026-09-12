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
exports.completeOrangeRegistration = void 0;
// ============================================================
//   orangeRegistration.ts — Parcours ORANGE UNIQUEMENT.
//
//   Le client a déjà effectué la vérification du numéro via
//   Firebase Phone Auth (SDK client, reCAPTCHA, SMS envoyé par
//   Firebase — donc RIEN de tout ça côté Cloud Functions). Cette
//   fonction callable est appelée juste après, avec l'utilisateur
//   déjà authentifié : son seul rôle est de :
//     1. vérifier l'unicité du numéro dans phoneIndex partagé ;
//     2. créer le profil Firestore ;
//     3. associer le push token déjà récupéré côté client ;
//     4. journaliser (audit + métriques), comme le parcours
//        Expresso/Tigo, pour un dashboard cohérent tous opérateurs
//        confondus.
//
//   ⚠️ Ne PAS appeler admin.auth().createUser ici : le compte
//   Firebase Auth existe déjà (créé par Firebase Phone Auth
//   lui-même lors du premier signInWithPhoneNumber réussi).
// ============================================================
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const carrier_1 = require("./carrier");
const phoneUniqueness_1 = require("./phoneUniqueness");
const audit_1 = require("./audit");
const metrics_1 = require("./metrics");
const errorMessages_1 = require("./errorMessages");
function throwLocalized(httpsCode, techCode) {
    throw new https_1.HttpsError(httpsCode, techCode, { message: (0, errorMessages_1.localizeError)(techCode) });
}
// ⚠️ SÉCURITÉ : même correctif que registration.ts — `profile.role` vient
// du client, et cette fonction écrit via Admin SDK (contourne
// firestore.rules). Sans validation, un appelant pourrait s'auto-attribuer
// role: 'admin'. Seuls 'client'/'seller' sont auto-attribuables. Aussi un
// FIX de cohérence : 'buyer' (l'ancien défaut) n'existe dans aucune
// vérification de rôle du reste de l'app, qui utilise 'client'.
const SELF_ASSIGNABLE_ROLES = new Set(['client', 'seller']);
function sanitizeSelfRegisteredRole(candidate) {
    return typeof candidate === 'string' && SELF_ASSIGNABLE_ROLES.has(candidate)
        ? candidate
        : 'client';
}
exports.completeOrangeRegistration = (0, https_1.onCall)({ region: 'us-central1', enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f;
    if (!request.auth)
        throwLocalized('unauthenticated', 'AUTH_REQUIRED');
    const uid = request.auth.uid;
    const phoneRaw = request.auth.token.phone_number;
    if (!phoneRaw)
        throwLocalized('failed-precondition', 'PHONE_NOT_VERIFIED');
    const phone = (_a = (0, carrier_1.normalizePhoneSN)(phoneRaw)) !== null && _a !== void 0 ? _a : phoneRaw;
    const carrier = await (0, carrier_1.detectCarrier)(phone);
    if (carrier !== 'orange') {
        console.warn(`⚠️ completeOrangeRegistration appelé pour un numéro non-Orange détecté: ${phone}`);
        await (0, audit_1.logAuditEvent)({ type: 'fraud_flagged', phone, carrier, reason: 'orange_endpoint_non_orange_number' });
    }
    const existingProfile = await admin.firestore().collection('users').doc(uid).get();
    if (existingProfile.exists) {
        return { uid, alreadyRegistered: true };
    }
    const profile = (_c = (_b = request.data) === null || _b === void 0 ? void 0 : _b.profile) !== null && _c !== void 0 ? _c : {};
    const pushToken = ((_d = request.data) === null || _d === void 0 ? void 0 : _d.pushToken) || undefined;
    // ⚠️ COHÉRENCE LOGIN : même correctif que registration.ts. Le compte
    // Firebase Auth existe déjà (créé par Firebase Phone Auth côté client)
    // mais n'a encore NI email NI mot de passe — seulement le provider
    // téléphone. Sans ça, impossible de se reconnecter ensuite via l'écran
    // de login (email synthétique + mot de passe), qui est le seul chemin
    // de connexion de l'app.
    const password = typeof profile.password === 'string' ? profile.password : '';
    if (password.length < 6)
        throwLocalized('invalid-argument', 'PASSWORD_REQUIRED');
    const syntheticEmail = (0, carrier_1.phoneToSyntheticEmail)(phone);
    try {
        await (0, phoneUniqueness_1.claimPhoneForAccount)(phone, `orange:${uid}`, uid);
        await admin.auth().updateUser(uid, { email: syntheticEmail, password });
        await admin.firestore().collection('users').doc(uid).set({
            phone,
            phoneVerified: true,
            role: sanitizeSelfRegisteredRole(profile.role),
            name: (_e = profile.name) !== null && _e !== void 0 ? _e : null,
            region: typeof profile.region === 'string' ? profile.region : '',
            departement: typeof profile.departement === 'string' ? profile.departement : '',
            commune: typeof profile.commune === 'string' ? profile.commune : '',
            quartier: typeof profile.quartier === 'string' ? profile.quartier : '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            registrationChannel: 'orange_firebase_auth',
        });
        if (pushToken) {
            await admin.firestore().collection('users').doc(uid).collection('tokens').doc(pushToken).set({
                platform: (_f = profile.platform) !== null && _f !== void 0 ? _f : 'unknown',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'registration',
            });
        }
    }
    catch (err) {
        if (err instanceof phoneUniqueness_1.PhoneAlreadyUsedError) {
            await (0, metrics_1.bumpRegistrationMetric)('rejected_phone_used');
            await (0, audit_1.logAuditEvent)({ type: 'account_creation_failed', phone, carrier, accountId: uid, reason: 'phone_claimed_concurrently' });
            throwLocalized('already-exists', 'PHONE_ALREADY_USED');
        }
        console.error(`❌ Échec finalisation inscription Orange (uid ${uid}):`, err);
        await (0, metrics_1.bumpRegistrationMetric)('account_creation_failed');
        await (0, audit_1.logAuditEvent)({ type: 'account_creation_failed', phone, carrier, accountId: uid, reason: String(err) });
        throwLocalized('internal', 'ACCOUNT_CREATION_FAILED');
    }
    await (0, metrics_1.bumpRegistrationMetric)('started_orange');
    await (0, metrics_1.bumpRegistrationMetric)('verify_success');
    await (0, metrics_1.bumpRegistrationMetric)('accounts_created_orange');
    await (0, audit_1.logAuditEvent)({ type: 'account_created', phone, carrier: 'orange', accountId: uid });
    return { uid, alreadyRegistered: false };
});
