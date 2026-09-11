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
import * as admin from 'firebase-admin';

export class PhoneAlreadyUsedError extends Error {
  constructor() {
    super('PHONE_ALREADY_USED');
    this.name = 'PhoneAlreadyUsedError';
  }
}
export class PhoneReservationConflictError extends Error {
  constructor() {
    super('PHONE_REGISTRATION_IN_PROGRESS');
    this.name = 'PhoneReservationConflictError';
  }
}

function phoneIndexRef(phone: string) {
  return admin.firestore().collection('phoneIndex').doc(phone);
}

// Appelé au tout début d'une inscription (registration/start ET
// équivalent Orange). Réserve le numéro pour cette session le temps
// de la vérification. N'importe quelle réservation expirée est
// considérée comme libre — évite qu'un numéro reste bloqué
// indéfiniment si une session a été abandonnée en cours de route.
export async function reservePhoneForSession(
  phone: string,
  sessionId: string,
  ttlMs: number
): Promise<void> {
  await admin.firestore().runTransaction(async (tx) => {
    const ref = phoneIndexRef(phone);
    const snap = await tx.get(ref);
    const data = snap.data();
    const now = admin.firestore.Timestamp.now();

    if (data?.accountId) throw new PhoneAlreadyUsedError();

    const pendingStillValid =
      data?.pendingSessionId &&
      data.pendingSessionId !== sessionId &&
      data.pendingExpiresAt &&
      (data.pendingExpiresAt as FirebaseFirestore.Timestamp).toMillis() > now.toMillis();

    if (pendingStillValid) throw new PhoneReservationConflictError();

    tx.set(
      ref,
      {
        pendingSessionId: sessionId,
        pendingExpiresAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + ttlMs),
      },
      { merge: true }
    );
  });
}

// Appelé uniquement au moment de la création DÉFINITIVE du compte
// (après OTP validé, ou après succès Firebase Phone Auth côté
// Orange). Transaction atomique : lit et tranche en une seule fois,
// aucune fenêtre de course possible entre la vérification et
// l'écriture, même sous forte concurrence (double-clic, deux
// appareils, cf. section 8).
export async function claimPhoneForAccount(
  phone: string,
  sessionId: string,
  accountId: string
): Promise<void> {
  await admin.firestore().runTransaction(async (tx) => {
    const ref = phoneIndexRef(phone);
    const snap = await tx.get(ref);
    const data = snap.data();

    if (data?.accountId) {
      // Un autre appareil/une autre requête a fini avant nous.
      throw new PhoneAlreadyUsedError();
    }

    tx.set(
      ref,
      {
        accountId,
        pendingSessionId: admin.firestore.FieldValue.delete(),
        pendingExpiresAt: admin.firestore.FieldValue.delete(),
        claimedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}

// Vérification rapide (hors transaction) pour un rejet précoce et un
// message utilisateur immédiat — l'unicité réelle reste garantie par
// claimPhoneForAccount au moment de la création, cette fonction n'est
// qu'un raccourci UX pour éviter de faire tourner tout un parcours
// d'OTP pour un numéro déjà pris.
export async function isPhoneAlreadyUsed(phone: string): Promise<boolean> {
  const snap = await phoneIndexRef(phone).get();
  return !!snap.data()?.accountId;
}

// Utilisé par la réinitialisation de mot de passe (passwordReset.ts) :
// contrairement à isPhoneAlreadyUsed (booléen), on a ici besoin de l'uid
// du compte pour savoir À QUI envoyer le code et le customToken final.
export async function getAccountIdForPhone(phone: string): Promise<string | null> {
  const snap = await phoneIndexRef(phone).get();
  return (snap.data()?.accountId as string | undefined) ?? null;
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
export async function purgeExpiredPhoneReservations(olderThanMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
  const snap = await admin
    .firestore()
    .collection('phoneIndex')
    .where('pendingExpiresAt', '<', cutoff)
    .limit(400)
    .get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function releasePhoneReservation(phone: string, sessionId: string): Promise<void> {
  await admin.firestore().runTransaction(async (tx) => {
    const ref = phoneIndexRef(phone);
    const snap = await tx.get(ref);
    const data = snap.data();
    if (data?.pendingSessionId !== sessionId) return; // déjà repris par une autre session, ne touche à rien
    tx.set(
      ref,
      {
        pendingSessionId: admin.firestore.FieldValue.delete(),
        pendingExpiresAt: admin.firestore.FieldValue.delete(),
      },
      { merge: true }
    );
  });
}
