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
exports.PhoneReservationConflictError = exports.PhoneAlreadyUsedError = void 0;
exports.reservePhoneForSession = reservePhoneForSession;
exports.claimPhoneForAccount = claimPhoneForAccount;
exports.isPhoneAlreadyUsed = isPhoneAlreadyUsed;
exports.getAccountIdForPhone = getAccountIdForPhone;
exports.purgeExpiredPhoneReservations = purgeExpiredPhoneReservations;
exports.releasePhoneReservation = releasePhoneReservation;
// ============================================================
//   phoneUniqueness.ts — Garantit "un numéro = un seul compte",
//   au niveau base de données, pour TOUS les parcours d'inscription
//   (Expresso/Tigo via push+InfoBip ET Orange via Firebase Auth).
//
//   Un seul document par numéro normalisé, dans phoneIndex/{phone} :
//     { accountId?: string,               // défini seulement quand le compte existe
//       pendingSessionId?: string,        // session d'inscription en cours
//       pendingExpiresAt?: Timestamp }    // fin de vie de la réservation
//
//   Cette collection est le SEUL endroit qui tranche l'unicité — les
//   deux flux d'inscription y passent obligatoirement avant de créer
//   quoi que ce soit ailleurs. Toute lecture/écriture se fait dans
//   une transaction Firestore, donc deux appareils qui soumettent le
//   même numéro à la même milliseconde ne peuvent jamais tous les
//   deux gagner (section 3 et 8 du cahier des charges).
// ============================================================
const admin = __importStar(require("firebase-admin"));
class PhoneAlreadyUsedError extends Error {
    constructor() {
        super('PHONE_ALREADY_USED');
        this.name = 'PhoneAlreadyUsedError';
    }
}
exports.PhoneAlreadyUsedError = PhoneAlreadyUsedError;
class PhoneReservationConflictError extends Error {
    constructor() {
        super('PHONE_REGISTRATION_IN_PROGRESS');
        this.name = 'PhoneReservationConflictError';
    }
}
exports.PhoneReservationConflictError = PhoneReservationConflictError;
function phoneIndexRef(phone) {
    return admin.firestore().collection('phoneIndex').doc(phone);
}
// Appelé au tout début d'une inscription (registration/start ET
// équivalent Orange). Réserve le numéro pour cette session le temps
// de la vérification. N'importe quelle réservation expirée est
// considérée comme libre — évite qu'un numéro reste bloqué
// indéfiniment si une session a été abandonnée en cours de route.
async function reservePhoneForSession(phone, sessionId, ttlMs) {
    await admin.firestore().runTransaction(async (tx) => {
        const ref = phoneIndexRef(phone);
        const snap = await tx.get(ref);
        const data = snap.data();
        const now = admin.firestore.Timestamp.now();
        if (data === null || data === void 0 ? void 0 : data.accountId)
            throw new PhoneAlreadyUsedError();
        const pendingStillValid = (data === null || data === void 0 ? void 0 : data.pendingSessionId) &&
            data.pendingSessionId !== sessionId &&
            data.pendingExpiresAt &&
            data.pendingExpiresAt.toMillis() > now.toMillis();
        if (pendingStillValid)
            throw new PhoneReservationConflictError();
        tx.set(ref, {
            pendingSessionId: sessionId,
            pendingExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + ttlMs),
        }, { merge: true });
    });
}
// Appelé uniquement au moment de la création DÉFINITIVE du compte
// (après OTP validé, ou après succès Firebase Phone Auth côté
// Orange). Transaction atomique : lit et tranche en une seule fois,
// aucune fenêtre de course possible entre la vérification et
// l'écriture, même sous forte concurrence (double-clic, deux
// appareils, cf. section 8).
async function claimPhoneForAccount(phone, sessionId, accountId) {
    await admin.firestore().runTransaction(async (tx) => {
        const ref = phoneIndexRef(phone);
        const snap = await tx.get(ref);
        const data = snap.data();
        if (data === null || data === void 0 ? void 0 : data.accountId) {
            // Un autre appareil/une autre requête a fini avant nous.
            throw new PhoneAlreadyUsedError();
        }
        tx.set(ref, {
            accountId,
            pendingSessionId: admin.firestore.FieldValue.delete(),
            pendingExpiresAt: admin.firestore.FieldValue.delete(),
            claimedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
}
// Vérification rapide (hors transaction) pour un rejet précoce et un
// message utilisateur immédiat — l'unicité réelle reste garantie par
// claimPhoneForAccount au moment de la création, cette fonction n'est
// qu'un raccourci UX pour éviter de faire tourner tout un parcours
// d'OTP pour un numéro déjà pris.
async function isPhoneAlreadyUsed(phone) {
    var _a;
    const snap = await phoneIndexRef(phone).get();
    return !!((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.accountId);
}
// Utilisé par la réinitialisation de mot de passe (passwordReset.ts) :
// contrairement à isPhoneAlreadyUsed (booléen), on a ici besoin de l'uid
// du compte pour savoir À QUI envoyer le code et le customToken final.
async function getAccountIdForPhone(phone) {
    var _a, _b;
    const snap = await phoneIndexRef(phone).get();
    return (_b = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.accountId) !== null && _b !== void 0 ? _b : null;
}
// Purge des réservations abandonnées : une session commencée puis jamais
// terminée (l'utilisateur ferme l'app avant /verify) laisse un doc
// phoneIndex avec pendingSessionId/pendingExpiresAt mais jamais d'accountId.
// reservePhoneForSession traite déjà une réservation expirée comme libre
// (donc aucune régression fonctionnelle si on ne purge jamais), mais sans
// nettoyage la collection accumule un doc par tentative abandonnée
// indéfiniment. Ne cible QUE les docs encore porteurs de pendingExpiresAt :
// claimPhoneForAccount le supprime toujours au moment de la création du
// compte, donc sa présence garantit qu'aucun accountId n'a pu être posé
// depuis — supprimer le doc entier est donc sûr.
async function purgeExpiredPhoneReservations(olderThanMs) {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
    const snap = await admin
        .firestore()
        .collection('phoneIndex')
        .where('pendingExpiresAt', '<', cutoff)
        .limit(400)
        .get();
    if (snap.empty)
        return 0;
    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}
async function releasePhoneReservation(phone, sessionId) {
    await admin.firestore().runTransaction(async (tx) => {
        const ref = phoneIndexRef(phone);
        const snap = await tx.get(ref);
        const data = snap.data();
        if ((data === null || data === void 0 ? void 0 : data.pendingSessionId) !== sessionId)
            return; // déjà repris par une autre session, ne touche à rien
        tx.set(ref, {
            pendingSessionId: admin.firestore.FieldValue.delete(),
            pendingExpiresAt: admin.firestore.FieldValue.delete(),
        }, { merge: true });
    });
}
