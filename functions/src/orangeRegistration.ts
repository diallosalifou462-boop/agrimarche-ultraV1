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
import { onCall, HttpsError, FunctionsErrorCode } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { normalizePhoneSN, detectCarrier, phoneToSyntheticEmail } from './carrier';
import { claimPhoneForAccount, PhoneAlreadyUsedError, findAuthAccountForPhone } from './phoneUniqueness';
import { logAuditEvent } from './audit';
import { bumpRegistrationMetric } from './metrics';
import { localizeError } from './errorMessages';

function throwLocalized(httpsCode: FunctionsErrorCode, techCode: string): never {
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

// enforceAppCheck désactivé — voir commentaire dans registration.ts.
export const completeOrangeRegistration = onCall({ region: 'us-central1', enforceAppCheck: false }, async (request) => {
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

  // ⚠️ FIX (26/09) — CAUSE RACINE de « Erreur lors de la vérification »
  // alors que le compte est bien créé :
  // admin.auth().updateUser({ email, password }) plus bas est un
  // « changement majeur » du compte pour Firebase : il RÉVOQUE la session
  // que l'app vient d'ouvrir par SMS. L'appel suivant du client
  // (auth.currentUser.reload()) échouait donc avec auth/user-token-expired,
  // le SDK déconnectait l'utilisateur, et l'écran affichait une erreur —
  // alors que tout avait réussi (d'où « déjà inscrit » ensuite, et la
  // connexion par mot de passe qui marche). On renvoie désormais un
  // customToken frais, émis APRÈS la modification, pour que le client se
  // reconnecte proprement avec signInWithCustomToken.
  const mintToken = async (): Promise<string | undefined> => {
    try {
      return await admin.auth().createCustomToken(uid);
    } catch (e) {
      // Droit IAM signBlob manquant, etc. : le client se rabat sur
      // numéro + mot de passe. Jamais bloquant.
      console.error(`⚠️ createCustomToken a échoué (uid ${uid}):`, e);
      return undefined;
    }
  };

  const existingProfile = await admin.firestore().collection('users').doc(uid).get();
  // ⚠️ FIX (26/09) : avant, l'existence du doc users/{uid} suffisait à dire
  // « déjà inscrit ». Or /api/auth/phone-session peut écrire un doc minimal
  // ({ phone, phoneVerified }) pour un compte « téléphone seul » — qui n'a
  // alors JAMAIS de mot de passe et ne pouvait plus jamais en recevoir par
  // ce chemin. On ne considère le compte terminé que s'il a réellement un
  // mot de passe côté Authentication.
  const authUser = await admin.auth().getUser(uid);
  const alreadyHasPassword = authUser.providerData.some((p) => p.providerId === 'password');
  if (existingProfile.exists && alreadyHasPassword) {
    return { uid, alreadyRegistered: true, customToken: await mintToken() };
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
  // Ce numéro a déjà un VRAI compte (souvent : email seul, sans numéro
  // attaché) → Firebase Phone Auth vient de créer un doublon vide (uid
  // courant). On le supprime et on refuse l'inscription au lieu de laisser
  // deux comptes pour le même numéro.
  const existingAccount = await findAuthAccountForPhone(phone);
  if (existingAccount && existingAccount !== uid) {
    // ⚠️ Ne supprimer le compte courant QUE s'il est vraiment vide (pas de
    // profil). Un compte « téléphone seul » qui a déjà un profil peut porter
    // des commandes/produits : on refuse l'inscription sans rien détruire.
    if (!existingProfile.exists) {
      await admin.auth().deleteUser(uid).catch(() => {});
    }
    await bumpRegistrationMetric('rejected_phone_used');
    await logAuditEvent({ type: 'account_creation_failed', phone, carrier, accountId: uid, reason: 'phone_has_existing_account' });
    throwLocalized('already-exists', 'PHONE_ALREADY_USED');
  }

  const syntheticEmail = phoneToSyntheticEmail(phone);

  try {
    await claimPhoneForAccount(phone, `orange:${uid}`, uid);
    // Garde un email réel déjà présent ; sinon l'email synthétique officiel.
    await admin.auth().updateUser(uid, authUser.email ? { password } : { email: syntheticEmail, password });

    // merge : le doc peut déjà exister sous forme minimale (voir le
    // commentaire plus haut sur phone-session) — on le complète sans
    // écraser un createdAt existant.
    const incoming: Record<string, unknown> = {
      phone,
      phoneVerified: true,
      role: sanitizeSelfRegisteredRole(profile.role),
      name: profile.name ?? null,
      region: typeof profile.region === 'string' ? profile.region : '',
      departement: typeof profile.departement === 'string' ? profile.departement : '',
      commune: typeof profile.commune === 'string' ? profile.commune : '',
      quartier: typeof profile.quartier === 'string' ? profile.quartier : '',
      registrationChannel: 'orange_firebase_auth',
    };
    let toWrite: Record<string, unknown> = incoming;
    if (existingProfile.exists) {
      // Profil déjà présent : on COMPLÈTE seulement ce qui manque — jamais
      // d'écrasement d'un rôle (ex : vendeur rétrogradé en client), d'un nom
      // ou d'une adresse déjà renseignés.
      const current = existingProfile.data() ?? {};
      toWrite = { phone, phoneVerified: true };
      for (const [key, value] of Object.entries(incoming)) {
        const cur = current[key];
        if (cur === undefined || cur === null || cur === '') toWrite[key] = value;
      }
    } else {
      toWrite.createdAt = admin.firestore.FieldValue.serverTimestamp();
    }
    await admin.firestore().collection('users').doc(uid).set(toWrite, { merge: true });

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

  // ⚠️ FIX (26/09) : métriques et audit HORS du chemin critique. Avant, une
  // simple erreur d'écriture de statistique APRÈS la création réussie du
  // compte faisait répondre « échec » au client.
  try {
    await bumpRegistrationMetric('started_orange');
    await bumpRegistrationMetric('verify_success');
    await bumpRegistrationMetric('accounts_created_orange');
    await logAuditEvent({ type: 'account_created', phone, carrier: 'orange', accountId: uid });
  } catch (e) {
    console.warn(`⚠️ Métriques/audit inscription Orange non écrits (uid ${uid}):`, e);
  }

  return { uid, alreadyRegistered: false, customToken: await mintToken() };
});
