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
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizePhoneSN, detectCarrier, phoneToSyntheticEmail } from './carrier';
import { claimPhoneForAccount, PhoneAlreadyUsedError } from './phoneUniqueness';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

function throwLocalized(httpsCode: Parameters<typeof HttpsError>[0], techCode: string): never {
  throw new HttpsError(httpsCode, techCode, { message: localizeError(techCode) });
}

// ⚠️ SÉCURITÉ : même correctif que registration.ts — `profile.role` vient
// du client, et cette fonction écrit via Admin SDK (contourne
// firestore.rules). Sans validation, un appelant pourrait s'auto-attribuer
// role: 'admin'. Seuls 'client'/'seller' sont auto-attribuables. Aussi un
// FIX de cohérence : 'buyer' (l'ancien défaut) n'existe dans aucune
// vérification de rôle du reste de l'app, qui utilise 'client'.
const SELF_ASSIGNABLE_ROLES = new Set(['client', 'seller']);
function sanitizeSelfRegisteredRole(candidate: unknown): 'client' | 'seller' {
  return typeof candidate === 'string' && SELF_ASSIGNABLE_ROLES.has(candidate)
    ? (candidate as 'client' | 'seller')
    : 'client';
}

export const completeOrangeRegistration = onCall({ region: 'us-central1', enforceAppCheck: true }, async (request) => {
  if (!request.auth) throwLocalized('unauthenticated', 'AUTH_REQUIRED');
  const uid = request.auth.uid;
  const phoneRaw = request.auth.token.phone_number as string | undefined;
  if (!phoneRaw) throwLocalized('failed-precondition', 'PHONE_NOT_VERIFIED');

  const phone = normalizePhoneSN(phoneRaw) ?? phoneRaw;
  const carrier = await detectCarrier(phone);
  if (carrier !== 'orange') {
    console.warn(`⚠️ completeOrangeRegistration appelé pour un numéro non-Orange détecté: ${phone}`);
    await logAuditEvent({ type: 'fraud_flagged', phone, carrier, reason: 'orange_endpoint_non_orange_number' });
  }

  const existingProfile = await admin.firestore().collection('users').doc(uid).get();
  if (existingProfile.exists) {
    return { uid, alreadyRegistered: true };
  }

  const profile = request.data?.profile ?? {};
  const pushToken: string | undefined = request.data?.pushToken || undefined;

  // ⚠️ COHÉRENCE LOGIN : même correctif que registration.ts. Le compte
  // Firebase Auth existe déjà (créé par Firebase Phone Auth côté client)
  // mais n'a encore NI email NI mot de passe — seulement le provider
  // téléphone. Sans ça, impossible de se reconnecter ensuite via l'écran
  // de login (email synthétique + mot de passe), qui est le seul chemin
  // de connexion de l'app.
  const password = typeof profile.password === 'string' ? profile.password : '';
  if (password.length < 6) throwLocalized('invalid-argument', 'PASSWORD_REQUIRED');
  const syntheticEmail = phoneToSyntheticEmail(phone);

  try {
    await claimPhoneForAccount(phone, `orange:${uid}`, uid);
    await admin.auth().updateUser(uid, { email: syntheticEmail, password });

    await admin.firestore().collection('users').doc(uid).set({
      phone,
      phoneVerified: true,
      role: sanitizeSelfRegisteredRole(profile.role),
      name: profile.name ?? null,
      region: typeof profile.region === 'string' ? profile.region : '',
      departement: typeof profile.departement === 'string' ? profile.departement : '',
      commune: typeof profile.commune === 'string' ? profile.commune : '',
      quartier: typeof profile.quartier === 'string' ? profile.quartier : '',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      registrationChannel: 'orange_firebase_auth',
    });

    if (pushToken) {
      await admin.firestore().collection('users').doc(uid).collection('tokens').doc(pushToken).set({
        platform: profile.platform ?? 'unknown',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        source: 'registration',
      });
    }
  } catch (err) {
    if (err instanceof PhoneAlreadyUsedError) {
      await bumpRegistrationMetric('rejected_phone_used');
      await logAuditEvent({ type: 'account_creation_failed', phone, carrier, accountId: uid, reason: 'phone_claimed_concurrently' });
      throwLocalized('already-exists', 'PHONE_ALREADY_USED');
    }
    console.error(`❌ Échec finalisation inscription Orange (uid ${uid}):`, err);
    await bumpRegistrationMetric('account_creation_failed');
    await logAuditEvent({ type: 'account_creation_failed', phone, carrier, accountId: uid, reason: String(err) });
    throwLocalized('internal', 'ACCOUNT_CREATION_FAILED');
  }

  await bumpRegistrationMetric('started_orange');
  await bumpRegistrationMetric('verify_success');
  await bumpRegistrationMetric('accounts_created_orange');
  await logAuditEvent({ type: 'account_created', phone, carrier: 'orange', accountId: uid });

  return { uid, alreadyRegistered: false };
});
