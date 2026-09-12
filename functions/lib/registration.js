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
exports.registrationVerify = exports.registrationResend = exports.registrationStart = void 0;
exports.purgeOldRegistrationSessions = purgeOldRegistrationSessions;
// ============================================================
//   registration.ts — Parcours d'inscription EXPRESSO / TIGO.
//
//   Stratégie de canal, par session, réévaluée à CHAQUE envoi
//   (start ET resend) :
//     - un push token est associé à la session → OTP envoyé par
//       PUSH UNIQUEMENT, jamais de SMS, quel que soit l'opérateur.
//     - aucun push token n'est associé à la session → fallback
//       SMS InfoBip (uniquement pour Expresso/Tigo — jamais pour
//       Orange, qui suit un tout autre parcours, voir
//       orangeRegistration.ts).
//
//   Ajouts "extraordinaire" (v2) :
//     - anti-fraude comportemental (fraud.ts), au-delà du simple
//       plafond de volume du rate-limiting ;
//     - journal d'audit append-only (audit.ts) pour chaque étape ;
//     - métriques agrégées quotidiennes (metrics.ts) pour le
//       dashboard admin et l'alerting (monitoring.ts) ;
//     - messages d'erreur localisés FR/EN/Wolof (errorMessages.ts),
//       renvoyés dans HttpsError.details.message en plus du code
//       technique dans HttpsError.code/message.
//
//   ⚠️ Ce module ne gère PAS les numéros Orange. Le frontend doit
//   détecter l'opérateur (ou laisser /registration/start le faire
//   et suivre l'erreur ORANGE_USE_FIREBASE_AUTH) et rediriger vers
//   le parcours Firebase Phone Auth pour Orange.
// ============================================================
const https_1 = require("firebase-functions/v2/https");
const admin = __importStar(require("firebase-admin"));
const carrier_1 = require("./carrier");
const otp_1 = require("./otp");
const phoneUniqueness_1 = require("./phoneUniqueness");
const rateLimit_1 = require("./rateLimit");
const smsInfobip_1 = require("./smsInfobip");
const audit_1 = require("./audit");
const metrics_1 = require("./metrics");
const fraud_1 = require("./fraud");
const errorMessages_1 = require("./errorMessages");
// ⚠️ SÉCURITÉ : le champ `role` envoyé dans `profile` vient du CLIENT.
// Ces fonctions utilisent le Admin SDK, qui contourne entièrement
// firestore.rules (la restriction `role in ['client','seller']` sur
// users/{userId}.create ne protège donc QUE les écritures directes SDK
// client, pas cette Cloud Function). Sans validation ici, un appelant
// peut s'auto-attribuer role: 'admin' ou 'delivery' lors de l'inscription.
// Seuls 'client' et 'seller' sont auto-attribuables ; tout le reste
// retombe sur 'client'. ⚠️ Aussi un FIX de cohérence : la valeur par
// défaut était 'buyer', qui n'existe dans AUCUNE vérification de rôle du
// reste de l'app (firestore.rules et les dashboards utilisent 'client').
const SELF_ASSIGNABLE_ROLES = new Set(['client', 'seller']);
function sanitizeSelfRegisteredRole(candidate) {
    return typeof candidate === 'string' && SELF_ASSIGNABLE_ROLES.has(candidate)
        ? candidate
        : 'client';
}
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutes — section 4
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_RESENDS = 5;
const RESEND_MIN_DELAY_MS = 45 * 1000;
const PHONE_RESERVATION_TTL_MS = OTP_TTL_MS + 10 * 60 * 1000;
function sessionsCol() {
    return admin.firestore().collection('registrationSessions');
}
// ⚠️ SÉCURITÉ : `rawRequest.ip` (l'IP de connexion TCP vue par le
// runtime Cloud Functions/Cloud Run) est la SEULE valeur fiable ici.
// L'en-tête X-Forwarded-For est en partie contrôlable par l'appelant :
// un client peut envoyer son propre X-Forwarded-For, et selon la
// façon dont l'infrastructure devant la fonction le complète (append
// vs remplacement), le premier maillon de la liste peut être une
// valeur forgée plutôt que la vraie IP du client. Faire confiance à ce
// premier maillon pour du rate-limiting/anti-fraude par IP le rend
// contournable en changeant simplement cet en-tête à chaque requête —
// exactement le contournement que ces défenses doivent empêcher.
// `rawRequest.ip` reste donc la source primaire ; X-Forwarded-For n'est
// qu'un dernier recours si elle est absente (jamais en pratique sur
// Cloud Functions v2), et seulement pour éviter un vide total plutôt
// que pour être considéré fiable.
function clientIp(rawRequest) {
    var _a, _b, _c;
    return ((rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.ip) ||
        ((_c = (_b = (_a = rawRequest === null || rawRequest === void 0 ? void 0 : rawRequest.headers) === null || _a === void 0 ? void 0 : _a['x-forwarded-for']) === null || _b === void 0 ? void 0 : _b.split(',')[0]) === null || _c === void 0 ? void 0 : _c.trim()) ||
        'unknown');
}
// Centralise la levée d'erreur : code technique (pour la logique
// frontend) + message déjà traduit (pour l'affichage direct, sans
// que le client ait besoin de dupliquer la table de traduction).
function throwLocalized(httpsCode, techCode) {
    throw new https_1.HttpsError(httpsCode, techCode, { message: (0, errorMessages_1.localizeError)(techCode) });
}
async function decideChannelAndSend(sessionId, phone, pushToken, code) {
    const channel = pushToken ? 'push' : 'sms_infobip';
    if (channel === 'push') {
        await admin.messaging().send({
            token: pushToken,
            notification: {
                title: 'AgriMarché',
                body: `Votre code de confirmation AgriMarché est : ${code}. Ce code expire dans 5 minutes.`,
            },
            data: { type: 'registration_otp', sessionId },
            android: { priority: 'high' },
            apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
        }).catch(async (err) => {
            console.error(`❌ Échec envoi push OTP (session ${sessionId}):`, (err === null || err === void 0 ? void 0 : err.code) || err);
            await (0, metrics_1.bumpRegistrationMetric)('send_failed_push');
            throw new https_1.HttpsError('unavailable', 'PUSH_SEND_FAILED');
        });
        await (0, metrics_1.bumpRegistrationMetric)('sent_push');
    }
    else {
        await (0, smsInfobip_1.sendOtpSmsInfobip)(phone, code).catch(async (err) => {
            console.error(`❌ Échec envoi SMS OTP (session ${sessionId}):`, (err === null || err === void 0 ? void 0 : err.message) || err);
            await (0, metrics_1.bumpRegistrationMetric)('send_failed_sms');
            throw new https_1.HttpsError('unavailable', 'SMS_SEND_FAILED');
        });
        await (0, metrics_1.bumpRegistrationMetric)('sent_sms');
    }
    return channel;
}
// ── POST /registration/start ────────────────────────────────────────────
exports.registrationStart = (0, https_1.onCall)(
// enforceAppCheck: active en code la protection décrite dans fraud.ts —
// sans ce flag, App Check n'était que "recommandé côté client" mais
// jamais réellement vérifié côté serveur ; un appelant sans jeton valide
// était accepté quand même. À activer seulement après avoir déployé
// App Check (Play Integrity / DeviceCheck) sur l'app mobile, sous peine
// de bloquer les inscriptions légitimes.
{ region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true }, async (request) => {
    var _a, _b, _c;
    const phoneRaw = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.phone) !== null && _b !== void 0 ? _b : '');
    const pushToken = ((_c = request.data) === null || _c === void 0 ? void 0 : _c.pushToken) || undefined;
    const phone = (0, carrier_1.normalizePhoneSN)(phoneRaw);
    if (!phone)
        throwLocalized('invalid-argument', 'INVALID_PHONE');
    const ip = clientIp(request.rawRequest);
    try {
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`start:phone:${phone}`, { maxAttempts: 5, windowMs: 15 * 60 * 1000 });
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`start:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    }
    catch (err) {
        if (err instanceof rateLimit_1.RateLimitedError) {
            await (0, metrics_1.bumpRegistrationMetric)('rejected_rate_limited');
            await (0, audit_1.logAuditEvent)({ type: 'start_rejected', phone, ip, reason: 'rate_limited' });
            throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
        }
        throw err;
    }
    // Anti-fraude comportemental — ne bloque que sur signal 'high'
    // (cf. fraud.ts). Les signaux 'medium' sont journalisés mais ne
    // pénalisent pas un utilisateur probablement légitime.
    const fraud = await (0, fraud_1.evaluateFraudSignals)(ip, phone, pushToken);
    if (fraud.signals.length > 0) {
        await (0, audit_1.logAuditEvent)({ type: 'fraud_flagged', phone, ip, reason: fraud.signals.map((s) => `${s.severity}:${s.reason}`).join('; ') });
        await (0, metrics_1.bumpRegistrationMetric)('fraud_flagged');
    }
    if (fraud.blocked) {
        await (0, metrics_1.bumpRegistrationMetric)('rejected_rate_limited'); // regroupé avec le même compteur dashboard "rejeté avant OTP"
        throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
    }
    if (await (0, phoneUniqueness_1.isPhoneAlreadyUsed)(phone)) {
        await (0, metrics_1.bumpRegistrationMetric)('rejected_phone_used');
        await (0, audit_1.logAuditEvent)({ type: 'start_rejected', phone, ip, reason: 'phone_already_used' });
        throwLocalized('already-exists', 'PHONE_ALREADY_USED');
    }
    const carrier = await (0, carrier_1.detectCarrier)(phone);
    if (carrier === 'orange') {
        await (0, audit_1.logAuditEvent)({ type: 'start_rejected', phone, ip, carrier, reason: 'orange_redirect' });
        throwLocalized('failed-precondition', 'ORANGE_USE_FIREBASE_AUTH');
    }
    const sessionRef = sessionsCol().doc();
    try {
        await (0, phoneUniqueness_1.reservePhoneForSession)(phone, sessionRef.id, PHONE_RESERVATION_TTL_MS);
    }
    catch (err) {
        if (err instanceof phoneUniqueness_1.PhoneAlreadyUsedError) {
            await (0, metrics_1.bumpRegistrationMetric)('rejected_phone_used');
            throwLocalized('already-exists', 'PHONE_ALREADY_USED');
        }
        await (0, audit_1.logAuditEvent)({ type: 'start_rejected', phone, ip, carrier, reason: 'reservation_conflict' });
        throwLocalized('aborted', 'REGISTRATION_IN_PROGRESS');
    }
    const code = (0, otp_1.generateOtp)();
    const otpHash = (0, otp_1.hashOtp)(code, sessionRef.id);
    const now = admin.firestore.Timestamp.now();
    await sessionRef.set({
        phone,
        carrier,
        pushToken: pushToken !== null && pushToken !== void 0 ? pushToken : null,
        otpHash,
        otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
        attempts: 0,
        maxAttempts: MAX_VERIFY_ATTEMPTS,
        resendCount: 0,
        status: 'pending',
        createdAt: now,
        lastSentAt: now,
        ip,
    });
    let channel;
    try {
        channel = await decideChannelAndSend(sessionRef.id, phone, pushToken, code);
    }
    catch (err) {
        await sessionRef.update({ status: 'send_failed' });
        await (0, phoneUniqueness_1.releasePhoneReservation)(phone, sessionRef.id);
        const techCode = err instanceof https_1.HttpsError ? err.message : 'PUSH_SEND_FAILED';
        throwLocalized('unavailable', techCode);
    }
    await sessionRef.update({ channel });
    await (0, metrics_1.bumpRegistrationMetric)('started');
    await (0, metrics_1.bumpRegistrationMetric)(`started_${carrier}`);
    await (0, audit_1.logAuditEvent)({ type: 'start', sessionId: sessionRef.id, phone, carrier, channel, ip });
    return { sessionId: sessionRef.id, channel, maxAttempts: MAX_VERIFY_ATTEMPTS, otpTtlSeconds: OTP_TTL_MS / 1000 };
});
// ── POST /registration/resend ───────────────────────────────────────────
exports.registrationResend = (0, https_1.onCall)({ region: 'us-central1', secrets: ['OTP_HASH_PEPPER', 'INFOBIP_API_KEY'], enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d, _e;
    const sessionId = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.sessionId) !== null && _b !== void 0 ? _b : '');
    const newPushToken = ((_c = request.data) === null || _c === void 0 ? void 0 : _c.pushToken) || undefined;
    if (!sessionId)
        throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');
    const ip = clientIp(request.rawRequest);
    try {
        await (0, rateLimit_1.enforceMinDelay)(`resend:${sessionId}`, RESEND_MIN_DELAY_MS);
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`resend:count:${sessionId}`, { maxAttempts: MAX_RESENDS, windowMs: 30 * 60 * 1000 });
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`resend:ip:${ip}`, { maxAttempts: 20, windowMs: 15 * 60 * 1000 });
    }
    catch (err) {
        if (err instanceof rateLimit_1.RateLimitedError) {
            await (0, audit_1.logAuditEvent)({ type: 'resend_rejected', sessionId, ip, reason: 'rate_limited' });
            throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
        }
        throw err;
    }
    const ref = sessionsCol().doc(sessionId);
    const snap = await ref.get();
    if (!snap.exists)
        throwLocalized('not-found', 'SESSION_NOT_FOUND');
    const data = snap.data();
    if (data.status !== 'pending' && data.status !== 'send_failed' && data.status !== 'account_creation_failed') {
        throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
    }
    const pushToken = (_d = newPushToken !== null && newPushToken !== void 0 ? newPushToken : data.pushToken) !== null && _d !== void 0 ? _d : undefined;
    const code = (0, otp_1.generateOtp)();
    const otpHash = (0, otp_1.hashOtp)(code, sessionId);
    const now = admin.firestore.Timestamp.now();
    await ref.update({
        pushToken: pushToken !== null && pushToken !== void 0 ? pushToken : null,
        otpHash,
        otpExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + OTP_TTL_MS),
        attempts: 0,
        resendCount: admin.firestore.FieldValue.increment(1),
        status: 'pending',
        lastSentAt: now,
    });
    let channel;
    try {
        channel = await decideChannelAndSend(sessionId, data.phone, pushToken, code);
    }
    catch (err) {
        await ref.update({ status: 'send_failed' });
        const techCode = err instanceof https_1.HttpsError ? err.message : 'PUSH_SEND_FAILED';
        throwLocalized('unavailable', techCode);
    }
    await ref.update({ channel });
    await (0, audit_1.logAuditEvent)({ type: 'resend', sessionId, phone: data.phone, carrier: data.carrier, channel, ip });
    return { sessionId, channel, resendsLeft: MAX_RESENDS - (((_e = data.resendCount) !== null && _e !== void 0 ? _e : 0) + 1) };
});
// Purge des sessions d'inscription terminales (verified / expired / locked /
// send_failed / account_creation_failed) — sans ce nettoyage,
// registrationSessions grossit indéfiniment (une session par tentative
// d'inscription, jamais supprimée). L'historique utile pour l'investigation
// reste dans registrationAuditLog, qui lui n'est jamais purgé : on peut donc
// supprimer une session en confiance dès qu'elle est ancienne, rien n'est
// perdu côté audit.
// ⚠️ Nécessite un index composite Firestore (createdAt + status) — au
// premier déploiement, la Cloud Console affichera un lien direct pour le
// créer en un clic si la requête échoue faute d'index. Le prévoir avant
// mise en prod plutôt que de découvrir l'erreur à la première exécution
// planifiée.
async function purgeOldRegistrationSessions(olderThanMs) {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
    const snap = await sessionsCol()
        .where('createdAt', '<', cutoff)
        .where('status', 'in', ['verified', 'expired', 'locked', 'send_failed', 'account_creation_failed'])
        .limit(400)
        .get();
    if (snap.empty)
        return 0;
    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    return snap.size;
}
// ── POST /registration/verify ───────────────────────────────────────────
exports.registrationVerify = (0, https_1.onCall)({ region: 'us-central1', secrets: ['OTP_HASH_PEPPER'], enforceAppCheck: true }, async (request) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const sessionId = String((_b = (_a = request.data) === null || _a === void 0 ? void 0 : _a.sessionId) !== null && _b !== void 0 ? _b : '');
    const code = String((_d = (_c = request.data) === null || _c === void 0 ? void 0 : _c.code) !== null && _d !== void 0 ? _d : '');
    const profile = (_f = (_e = request.data) === null || _e === void 0 ? void 0 : _e.profile) !== null && _f !== void 0 ? _f : {};
    if (!sessionId || !code)
        throwLocalized('invalid-argument', 'SESSION_NOT_FOUND');
    // Vérifié ICI, avant de consommer la tentative OTP dans la
    // transaction plus bas : un mot de passe manquant/trop court ne doit
    // jamais coûter une tentative au client ni faire avancer la session
    // vers 'verifying' pour rien.
    const password = typeof profile.password === 'string' ? profile.password : '';
    if (password.length < 6)
        throwLocalized('invalid-argument', 'PASSWORD_REQUIRED');
    try {
        await (0, rateLimit_1.checkAndConsumeRateLimit)(`verify:${sessionId}`, { maxAttempts: 10, windowMs: 15 * 60 * 1000 });
    }
    catch (err) {
        if (err instanceof rateLimit_1.RateLimitedError)
            throwLocalized('resource-exhausted', 'TOO_MANY_REQUESTS');
        throw err;
    }
    const ref = sessionsCol().doc(sessionId);
    // Code technique → (statut https, type audit, compteur métrique).
    // Table explicite plutôt que de relire une propriété interne de
    // HttpsError (non garantie stable entre versions du SDK).
    const VERIFY_ERROR_MAP = {
        SESSION_NOT_FOUND: { https: 'not-found', audit: 'verify_failed', metric: 'verify_invalid_code' },
        SESSION_NOT_ACTIVE: { https: 'failed-precondition', audit: 'verify_failed', metric: 'verify_invalid_code' },
        CODE_EXPIRED: { https: 'deadline-exceeded', audit: 'verify_expired', metric: 'verify_expired' },
        TOO_MANY_ATTEMPTS: { https: 'resource-exhausted', audit: 'verify_locked', metric: 'verify_locked' },
    };
    let claim;
    try {
        claim = await admin.firestore().runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists)
                throw new https_1.HttpsError('not-found', 'SESSION_NOT_FOUND');
            const data = snap.data();
            if (data.status === 'verified') {
                return { alreadyDone: true, uid: data.accountId };
            }
            // ⚠️ FIX course critique : 'verifying' est un état transitoire posé
            // juste avant la création du compte (hors transaction, voir plus
            // bas), le temps d'appeler admin.auth().createUser(). Un
            // double-clic ou un retry réseau du client qui soumet deux fois le
            // même code peut donc atterrir ici PENDANT que la première requête
            // finit de créer le compte. Avant ce fix, ce cas tombait dans le
            // même bucket que 'SESSION_NOT_ACTIVE' (erreur dure, session à
            // recommencer) — alors qu'il s'agit d'un simple "patiente, c'est
            // en cours", pas d'une session invalide. On le distingue donc avec
            // son propre code technique, mappé côté client à un message
            // invitant à réessayer dans un instant plutôt qu'à tout
            // recommencer.
            if (data.status === 'verifying') {
                throw new https_1.HttpsError('aborted', 'VERIFICATION_IN_PROGRESS');
            }
            if (data.status !== 'pending') {
                throw new https_1.HttpsError('failed-precondition', 'SESSION_NOT_ACTIVE');
            }
            if (data.otpExpiresAt.toMillis() < Date.now()) {
                tx.update(ref, { status: 'expired' });
                throw new https_1.HttpsError('deadline-exceeded', 'CODE_EXPIRED');
            }
            if (data.attempts >= data.maxAttempts) {
                tx.update(ref, { status: 'locked' });
                throw new https_1.HttpsError('resource-exhausted', 'TOO_MANY_ATTEMPTS');
            }
            const ok = (0, otp_1.verifyOtpHash)(code, sessionId, data.otpHash);
            if (!ok) {
                tx.update(ref, { attempts: admin.firestore.FieldValue.increment(1) });
                throw new https_1.HttpsError('invalid-argument', `INVALID_CODE:${data.maxAttempts - data.attempts - 1}`);
            }
            tx.update(ref, { status: 'verifying', otpHash: admin.firestore.FieldValue.delete() });
            return { alreadyDone: false, phone: data.phone, pushToken: data.pushToken, carrier: data.carrier };
        });
    }
    catch (err) {
        if (err instanceof https_1.HttpsError) {
            const techCode = err.message; // le code technique a été passé comme 2ᵉ argument de HttpsError
            // Ni un échec ni une session invalide : une requête concurrente
            // pour la même session est déjà en train de finaliser la
            // vérification. Ne pollue donc ni l'audit ni les métriques
            // d'échec — le client est invité à réessayer dans un instant.
            if (techCode === 'VERIFICATION_IN_PROGRESS') {
                throwLocalized('aborted', techCode);
            }
            const isInvalidCode = techCode.startsWith('INVALID_CODE:');
            const mapping = VERIFY_ERROR_MAP[techCode];
            await (0, audit_1.logAuditEvent)({ type: (isInvalidCode ? 'verify_failed' : (_g = mapping === null || mapping === void 0 ? void 0 : mapping.audit) !== null && _g !== void 0 ? _g : 'verify_failed'), sessionId, reason: techCode });
            await (0, metrics_1.bumpRegistrationMetric)(isInvalidCode ? 'verify_invalid_code' : (_h = mapping === null || mapping === void 0 ? void 0 : mapping.metric) !== null && _h !== void 0 ? _h : 'verify_invalid_code');
            const httpsCode = isInvalidCode ? 'invalid-argument' : (_j = mapping === null || mapping === void 0 ? void 0 : mapping.https) !== null && _j !== void 0 ? _j : 'internal';
            throwLocalized(httpsCode, techCode);
        }
        throw err;
    }
    if (claim.alreadyDone) {
        if (!claim.uid)
            throwLocalized('failed-precondition', 'SESSION_NOT_ACTIVE');
        return { uid: claim.uid };
    }
    const { phone, pushToken, carrier } = claim;
    // ⚠️ COHÉRENCE LOGIN : le reste de l'app authentifie par email
    // synthétique + mot de passe (voir phoneToEmail() côté client,
    // src/contexts/AuthContext.tsx). Sans ce mot de passe, le compte créé
    // ici ne serait accessible qu'une seule fois — via le customToken
    // renvoyé en fin d'inscription — avec ensuite aucun moyen de se
    // reconnecter depuis l'écran de login. On réplique donc le même
    // format d'email synthétique et on fixe le mot de passe (déjà validé
    // plus haut) dès la création du compte.
    const syntheticEmail = (0, carrier_1.phoneToSyntheticEmail)(phone);
    let uid;
    try {
        const userRecord = await admin.auth().createUser({ phoneNumber: phone, email: syntheticEmail, password });
        uid = userRecord.uid;
        await (0, phoneUniqueness_1.claimPhoneForAccount)(phone, sessionId, uid);
        await admin.firestore().collection('users').doc(uid).set({
            phone,
            phoneVerified: true,
            role: sanitizeSelfRegisteredRole(profile.role),
            name: (_k = profile.name) !== null && _k !== void 0 ? _k : null,
            // Champs non sensibles, passés tels quels comme le faisait déjà
            // signUp() côté client (contexts/AuthContext.tsx) — pas de
            // validation stricte nécessaire, ce ne sont pas des droits.
            region: typeof profile.region === 'string' ? profile.region : '',
            departement: typeof profile.departement === 'string' ? profile.departement : '',
            commune: typeof profile.commune === 'string' ? profile.commune : '',
            quartier: typeof profile.quartier === 'string' ? profile.quartier : '',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            registrationChannel: 'push_or_infobip',
        });
        if (pushToken) {
            await admin.firestore().collection('users').doc(uid).collection('tokens').doc(pushToken).set({
                platform: (_l = profile.platform) !== null && _l !== void 0 ? _l : 'unknown',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                source: 'registration',
            });
        }
        await ref.update({ status: 'verified', accountId: uid });
    }
    catch (err) {
        if (uid)
            await admin.auth().deleteUser(uid).catch(() => { });
        // ⚠️ FIX bug crash : NE PAS remettre 'pending' ici. otpHash a déjà
        // été supprimé par la transaction ci-dessus (passage par 'verifying'),
        // donc un retry de /verify sur ce statut ferait planter
        // verifyOtpHash() (Buffer.from(undefined, 'hex')) avec une erreur
        // non-HttpsError, renvoyée telle quelle au client (500 générique,
        // sans message localisé, sans audit). 'account_creation_failed' est
        // un statut dédié, ajouté à la liste des statuts autorisant un
        // /resend (voir registrationResend) : le client peut donc relancer
        // proprement l'envoi d'un nouveau code sur la même session/réservation
        // de numéro, sans jamais retenter /verify sur l'ancien hash.
        await ref.update({ status: 'account_creation_failed' }).catch(() => { });
        if (err instanceof phoneUniqueness_1.PhoneAlreadyUsedError) {
            await (0, metrics_1.bumpRegistrationMetric)('rejected_phone_used');
            await (0, audit_1.logAuditEvent)({ type: 'account_creation_failed', sessionId, phone, reason: 'phone_claimed_concurrently' });
            throwLocalized('already-exists', 'PHONE_ALREADY_USED');
        }
        console.error(`❌ Échec création de compte (session ${sessionId}):`, err);
        await (0, metrics_1.bumpRegistrationMetric)('account_creation_failed');
        await (0, audit_1.logAuditEvent)({ type: 'account_creation_failed', sessionId, phone, reason: String(err) });
        throwLocalized('internal', 'ACCOUNT_CREATION_FAILED');
    }
    await (0, metrics_1.bumpRegistrationMetric)('verify_success');
    await (0, metrics_1.bumpRegistrationMetric)(`accounts_created_${carrier === 'orange' ? 'orange' : 'push_infobip'}`);
    await (0, audit_1.logAuditEvent)({ type: 'verify_success', sessionId, phone, carrier, accountId: uid });
    await (0, audit_1.logAuditEvent)({ type: 'account_created', sessionId, phone, carrier, accountId: uid });
    const customToken = await admin.auth().createCustomToken(uid);
    return { uid, customToken };
});
