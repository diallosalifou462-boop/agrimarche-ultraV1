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
// Toutes les formes d'email synthétique ayant existé pour un numéro. Définie
// ICI (et non importée de carrier.ts) : certaines versions déployées de
// carrier.ts ne l'exportent pas — la compilation échouait.
function syntheticEmailCandidates(phoneE164: string): string[] {
  const local = phoneE164.replace(/\D/g, '').replace(/^221/, '');
  return [
    `221${local}@sunumenef.sn`,
    `${local}@sunumenef.sn`,
    `221${local}@sunnumenef.sn`,
    `${local}@sunnumenef.sn`,
    `221${local}@agrimarche.sn`,
    `${local}@agrimarche.sn`,
    `${local}@gmail.com`,
    `221${local}@gmail.com`,
  ];
}

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

    // Une nouvelle demande de code pour le même numéro REMPLACE la précédente
    // (au lieu de bloquer 15 minutes avec REGISTRATION_IN_PROGRESS). C'est ce
    // qui empêchait « Renvoyer le code » et toute nouvelle tentative. Sans
    // risque : le compte n'est créé qu'avec le code SMS reçu sur ce numéro,
    // et claimPhoneForAccount refuse tout second compte.
    if (pendingStillValid) {
      console.log(`[phoneIndex] session ${data?.pendingSessionId} remplacée par ${sessionId} pour ${phone}`);
    }

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

    if (data?.accountId && data.accountId !== accountId) {
      // Un autre appareil/une autre requête a fini avant nous.
      throw new PhoneAlreadyUsedError();
    }
    // ⚠️ FIX (26/09) : si le numéro est DÉJÀ attribué à ce même compte
    // (2ᵉ appel après un premier appel partiellement réussi, retry réseau
    // automatique de callWithRetry…), ce n'est pas un conflit : on continue
    // au lieu de lever PHONE_ALREADY_USED — qui laissait un compte avec mot
    // de passe mais SANS profil, et un utilisateur bloqué.

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
// 🔑 RÈGLE : Firebase Authentication est la SOURCE DE VÉRITÉ. phoneIndex n'est
// qu'un index de rapidité. Quand les deux se contredisent (compte supprimé à la
// main, création de compte interrompue), on croit Authentication et on RÉPARE
// l'index. Sans ça, un numéro pouvait rester bloqué pour toujours : « déjà
// inscrit » à l'inscription, « aucun compte » au mot de passe oublié.
export async function isPhoneAlreadyUsed(phone: string): Promise<boolean> {
  return !!(await getAccountIdForPhone(phone));
}

/** Efface une réservation ou un accountId qui ne correspond à aucun compte. */
async function clearStaleIndex(phone: string, reason: string): Promise<void> {
  console.warn(`🧹 phoneIndex ${phone} nettoyé (${reason})`);
  await phoneIndexRef(phone)
    .set(
      {
        accountId: admin.firestore.FieldValue.delete(),
        pendingSessionId: admin.firestore.FieldValue.delete(),
        pendingExpiresAt: admin.firestore.FieldValue.delete(),
        clearedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    .catch(() => {});
}

// Comptes créés AVANT l'index phoneIndex (ou hors des functions) : ils n'y
// figurent pas. Sans cette recherche, un numéro déjà inscrit avec un email
// seul pouvait être réinscrit (doublon), et le mot de passe oublié répondait
// « compte introuvable ». Priorité au compte qui a un mot de passe.
// ⚠️ FIX (26/09) SÉCURITÉ — squat de compte : n'importe qui peut créer,
// depuis le SDK client, un compte email/mot de passe
// « 221<numéro de la victime>@sunumenef.sn ». Avant, le PREMIER candidat
// email synthétique avec mot de passe gagnait : l'attaquant devenait « le
// compte » de ce numéro (inscription de la victime refusée, mot de passe
// oublié envoyant un customToken… pour le compte de l'attaquant). Un compte
// trouvé par email synthétique n'est donc plus accepté que si :
//   - son phoneNumber est vide OU égal au numéro, ET
//   - phoneIndex/{phone}.accountId désigne déjà ce compte, OU il a été créé
//     avant le 27/09/2026 (comptes historiques, créés avant ce correctif et
//     qu'on ne peut pas distinguer autrement).
// Le chemin getUserByPhoneNumber reste de confiance : un numéro attaché au
// compte Auth ne peut être posé que par vérification SMS ou par le serveur.
const SYNTHETIC_EMAIL_TRUST_CUTOFF_MS = Date.parse('2026-09-27T00:00:00Z');

export async function findAuthAccountForPhone(phone: string): Promise<string | null> {
  const hasPassword = (u?: admin.auth.UserRecord | null) => !!u?.providerData?.some((p) => p.providerId === 'password');
  const phoneUser = await admin.auth().getUserByPhoneNumber(phone).catch(() => null);
  if (phoneUser && hasPassword(phoneUser)) return phoneUser.uid;
  const candidates = syntheticEmailCandidates(phone);
  const { users } = await admin.auth().getUsers(candidates.map((email) => ({ email })));
  // Lecture de l'index hors transaction : simple preuve de rattachement,
  // l'unicité réelle reste tranchée par claimPhoneForAccount.
  const indexedAccountId =
    ((await phoneIndexRef(phone).get().then((s) => s.data()?.accountId).catch(() => undefined)) as string | undefined) ?? null;
  const isTrustedEmailAccount = (u: admin.auth.UserRecord): boolean => {
    if (u.phoneNumber && u.phoneNumber !== phone) return false;
    if (indexedAccountId && indexedAccountId === u.uid) return true;
    const createdMs = Date.parse(u.metadata?.creationTime ?? '');
    return Number.isFinite(createdMs) && createdMs < SYNTHETIC_EMAIL_TRUST_CUTOFF_MS;
  };
  const emailUser = candidates
    .map((email) => users.find((u) => u.email?.toLowerCase() === email))
    .find((u) => !!u && hasPassword(u) && isTrustedEmailAccount(u));
  if (!emailUser) {
    const rejected = users.filter((u) => hasPassword(u) && !isTrustedEmailAccount(u));
    if (rejected.length > 0) {
      console.warn(`🛡️ ${rejected.length} compte(s) email synthétique ignoré(s) pour ${phone} (non rattaché(s) au numéro) : ${rejected.map((u) => u.uid).join(', ')}`);
    }
  }
  return emailUser?.uid ?? phoneUser?.uid ?? null;
}

// Utilisé par la réinitialisation de mot de passe (passwordReset.ts) :
// contrairement à isPhoneAlreadyUsed (booléen), on a ici besoin de l'uid
// du compte pour savoir À QUI envoyer le code et le customToken final.
export async function getAccountIdForPhone(phone: string): Promise<string | null> {
  const snap = await phoneIndexRef(phone).get();
  const indexed = (snap.data()?.accountId as string | undefined) ?? null;
  if (indexed) {
    const exists = await admin.auth().getUser(indexed).then(() => true).catch(() => false);
    if (exists) return indexed;
    // L'index désigne un compte qui n'existe plus → on le nettoie.
    await clearStaleIndex(phone, `compte ${indexed} introuvable`);
  }

  const found = await findAuthAccountForPhone(phone);
  if (found) {
    // Compte réel non indexé (créé hors functions, ou index perdu) → on répare.
    await phoneIndexRef(phone).set({ accountId: found }, { merge: true }).catch(() => {});
    return found;
  }
  return null;
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
