// ============================================================
//   CODE DE LIVRAISON — le code appartient au client.
// ============================================================
// Règle fondamentale (voir échange produit) : le livreur ne voit JAMAIS
// le code en clair. Il le demande au client, le saisit, et c'est le
// serveur — jamais le frontend — qui tranche. Symétriquement, le SMS
// n'est plus le mécanisme de diffusion : le code vit dans l'app, lisible
// uniquement par le propriétaire de la commande (compte réel OU session
// invité créée à la volée, sans mot de passe, à partir du seul numéro
// de téléphone saisi au checkout).
//
// Trois familles de fonctions ici :
//   1. claimOrder / confirmDeliveryWithCode — cycle de vie du code
//   2. getDeliveryCode                      — lecture par le propriétaire
//   3. findGuestOrders / claimGuestOrderSession — accès sans compte
//
// Toutes utilisent des transactions Firestore pour éviter les doubles
// validations et les races entre deux appareils.

import * as crypto from 'crypto';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';

const REGION = 'us-central1';

// ── Utilitaires ──────────────────────────────────────────────────────

function generateFourDigitCode(): string {
  // crypto.randomInt est cryptographiquement sûr — Math.random() ne
  // l'est pas et n'a rien à faire dans la génération d'un code de
  // sécurité, même à 4 chiffres.
  return String(crypto.randomInt(0, 10000)).padStart(4, '0');
}

function hashCode(code: string, salt: string): string {
  return crypto.createHash('sha256').update(`${code}:${salt}`).digest('hex');
}

function normalizePhone(raw: string): string {
  return String(raw || '').replace(/[^\d+]/g, '');
}

/** uid déterministe par numéro — un même invité, à la commande comme à la
 * récupération de son code, retrouve toujours le même compte. */
function guestUidFromPhone(normalizedPhone: string): string {
  return `guest_${crypto.createHash('sha256').update(normalizedPhone).digest('hex').slice(0, 24)}`;
}

async function ensureGuestUser(uid: string, normalizedPhone: string, displayName?: string) {
  const userRef = db().collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    await userRef.set({
      uid, phone: normalizedPhone, role: 'buyer', isGuest: true,
      displayName: displayName || 'Client AgriMarché',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  }
}

const db = () => admin.firestore();

// ============================================================
//   1. CYCLE DE VIE DU CODE
// ============================================================

/**
 * Remplace l'ancienne écriture directe côté client dans
 * delivery/dashboard/page.tsx::claimOrder. Comportement fonctionnel
 * IDENTIQUE (cible les commandes 'en_preparation', pose delivererId/
 * Name/Phone, fait passer status → 'en_livraison', tracking.phase →
 * 'assigned', miroir dans seller_orders) — seule différence : exécuté
 * en transaction Admin SDK côté serveur, ce qui permet d'y greffer la
 * génération sécurisée du code sans jamais l'exposer au livreur.
 */
export const claimOrder = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour accepter une commande.');

  const { orderId } = (request.data || {}) as { orderId?: string };
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId manquant.');

  const delivererSnap = await db().collection('users').doc(uid).get();
  const deliverer = delivererSnap.data() as any;
  if (!delivererSnap.exists || deliverer?.role !== 'delivery') {
    throw new HttpsError('permission-denied', 'Seuls les livreurs peuvent accepter une commande.');
  }

  const orderRef = db().collection('orders').doc(orderId);
  const sellerOrderRef = db().collection('seller_orders').doc(orderId);

  const plainCode = await db().runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Commande introuvable.');
    const order = orderSnap.data() as any;

    if (order.delivererId) {
      throw new HttpsError('failed-precondition', "Cette commande vient d'être prise par un autre livreur.");
    }
    if (order.status !== 'en_preparation' && order.status !== 'en_attente') {
      throw new HttpsError('failed-precondition', "Cette commande n'est plus disponible.");
    }

    // Règle #4 du cahier des charges : un seul code, jamais régénéré —
    // utile si cette fonction est rejouée après une coupure réseau.
    const salt = order.deliveryCodeSalt || crypto.randomBytes(8).toString('hex');
    const code = order.deliveryCodeHash ? null : generateFourDigitCode();

    const payload: Record<string, any> = {
      delivererId: uid,
      delivererName: deliverer.displayName || deliverer.name || 'Livreur',
      delivererPhone: deliverer.phone || '',
      delivererAssignedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Si le vendeur a déjà confirmé (en_preparation), la prise en charge
    // du livreur démarre immédiatement la livraison — comportement
    // historique inchangé. Si la commande est encore 'en_attente' (le
    // vendeur ne l'a pas encore confirmée), le livreur se positionne à
    // l'avance : delivererId est posé, mais `status` ne bouge pas tant
    // que le vendeur n'a pas confirmé — c'est cette confirmation,
    // ailleurs, qui fera passer la commande à 'en_preparation' puis
    // 'en_livraison'.
    if (order.status === 'en_preparation') {
      payload.status = 'en_livraison';
      payload['tracking.phase'] = 'assigned';
    }
    if (code) {
      payload.deliveryCodeHash = hashCode(code, salt);
      payload.deliveryCodeSalt = salt;
      payload.deliveryCodeAttempts = 0;
      payload.deliveryCodeUsedAt = null;
    }

    tx.set(orderRef, payload, { merge: true });

    const sellerOrderSnap = await tx.get(sellerOrderRef);
    if (sellerOrderSnap.exists) tx.set(sellerOrderRef, payload, { merge: true });

    // Le code EN CLAIR ne vit que dans une sous-collection à part,
    // jamais renvoyée par une lecture Firestore classique de la
    // commande — seule la fonction getDeliveryCode, après vérification
    // d'ownership, y accède. C'est ce qui garantit la règle #8 (le
    // livreur ne voit jamais 5827) même si les règles Firestore
    // autorisent par ailleurs le livreur à lire le document 'orders'.
    if (code) {
      tx.set(orderRef.collection('secure').doc('delivery'), {
        code,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }

    return code;
  });

  console.log(`🚚 Commande ${orderId} acceptée par ${uid}${plainCode ? ' — code généré' : ' — code déjà existant'}`);
  return { success: true };
});

const MAX_CODE_ATTEMPTS = 5;

/**
 * Remplace markAsDelivered (qui validait la livraison sur un simple
 * `confirm()` navigateur, sans aucune vérification). Le livreur transmet
 * ici le code que le CLIENT vient de lui dicter — jamais l'inverse.
 */
export const confirmDeliveryWithCode = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous.');

  const { orderId, code } = (request.data || {}) as { orderId?: string; code?: string };
  if (!orderId || !code) throw new HttpsError('invalid-argument', 'orderId et code requis.');

  const orderRef = db().collection('orders').doc(orderId);
  const sellerOrderRef = db().collection('seller_orders').doc(orderId);

  const legacy = await db().runTransaction(async (tx) => {
    const orderSnap = await tx.get(orderRef);
    if (!orderSnap.exists) throw new HttpsError('not-found', 'Commande introuvable.');
    const order = orderSnap.data() as any;

    if (order.delivererId !== uid) {
      throw new HttpsError('permission-denied', "Vous n'êtes pas le livreur assigné à cette commande.");
    }
    if (order.status === 'livre') {
      throw new HttpsError('failed-precondition', 'Cette commande a déjà été livrée.');
    }
    if (order.deliveryCodeUsedAt) {
      throw new HttpsError('failed-precondition', 'Ce code a déjà servi — impossible de confirmer deux fois.');
    }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const payload: Record<string, any> = {
      status: 'livre', statusLabel: 'Livrée',
      deliveredAt: now, updatedAt: now, 'tracking.enabled': false,
    };

    if (!order.deliveryCodeHash) {
      // Règle #13 (compatibilité ascendante) : commande créée avant ce
      // système, jamais de deliveryCode — on ne bloque pas une livraison
      // légitime qui n'a simplement jamais eu de code à vérifier.
      tx.set(orderRef, payload, { merge: true });
      const sellerOrderSnap = await tx.get(sellerOrderRef);
      if (sellerOrderSnap.exists) tx.set(sellerOrderRef, payload, { merge: true });
      return true;
    }

    const attempts = order.deliveryCodeAttempts ?? 0;
    if (attempts >= MAX_CODE_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Trop de tentatives sur cette commande — contactez le support AgriMarché.');
    }

    const submitted = hashCode(String(code).trim(), order.deliveryCodeSalt);
    if (submitted !== order.deliveryCodeHash) {
      tx.set(orderRef, { deliveryCodeAttempts: attempts + 1 }, { merge: true });
      throw new HttpsError('invalid-argument', 'Code incorrect.');
    }

    payload.deliveryCodeUsedAt = now;
    tx.set(orderRef, payload, { merge: true });
    const sellerOrderSnap = await tx.get(sellerOrderRef);
    if (sellerOrderSnap.exists) tx.set(sellerOrderRef, payload, { merge: true });
    return false;
  });

  console.log(`✅ Livraison confirmée par code pour ${orderId} (legacy: ${legacy})`);
  // Notifications acheteur/vendeur : voir notifyOrderStatusStep, déclenché
  // automatiquement par l'écriture status → 'livre' ci-dessus. Rien à
  // envoyer manuellement ici.
  return { success: true };
});

// ============================================================
//   2. LECTURE DU CODE PAR LE PROPRIÉTAIRE
// ============================================================

export const getDeliveryCode = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Connectez-vous pour voir votre code.');

  const { orderId } = (request.data || {}) as { orderId?: string };
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId manquant.');

  const orderRef = db().collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError('not-found', 'Commande introuvable.');
  const order = orderSnap.data() as any;

  if (order.userId !== uid) {
    throw new HttpsError('permission-denied', "Ce n'est pas votre commande.");
  }

  const secureSnap = await orderRef.collection('secure').doc('delivery').get();
  if (!secureSnap.exists) {
    return { code: null, reason: 'not_generated' as const };
  }

  return { code: secureSnap.data()!.code as string, reason: 'ok' as const };
});

// ============================================================
//   3. ACCÈS INVITÉ — retrouver sa commande sans SMS ni mot de passe
// ============================================================
// Le livreur est physiquement présent et vérifie déjà l'adresse : c'est
// cette présence qui constitue la vraie barrière de sécurité pour un
// invité, pas un deuxième canal (OTP/SMS). Le numéro de téléphone saisi
// au checkout suffit donc comme identifiant, à condition d'être
// rate-limité sérieusement pour empêcher tout brute-force.

const GUEST_WINDOW_MS = 60 * 60 * 1000;
const GUEST_MAX_ATTEMPTS = 8;

async function checkGuestRateLimit(key: string) {
  const ref = db().collection('guestAccessAttempts').doc(key);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as any;
    const now = Date.now();
    const windowStart = data?.windowStartMs ?? 0;

    if (now - windowStart > GUEST_WINDOW_MS) {
      tx.set(ref, { windowStartMs: now, count: 1 });
      return;
    }
    if ((data?.count ?? 0) >= GUEST_MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Trop de tentatives — réessayez dans une heure.');
    }
    tx.set(ref, { windowStartMs: windowStart, count: (data?.count ?? 0) + 1 }, { merge: true });
  });
}

/**
 * Étape 1 : le client tape son numéro. On ne renvoie JAMAIS le code ici
 * — seulement de quoi reconnaître sa propre commande sans ambiguïté.
 */
export const findGuestOrders = onCall({ region: REGION }, async (request) => {
  const { phone } = (request.data || {}) as { phone?: string };
  if (!phone) throw new HttpsError('invalid-argument', 'Numéro de téléphone requis.');
  const normalized = normalizePhone(phone);
  if (normalized.length < 8) throw new HttpsError('invalid-argument', 'Numéro invalide.');

  await checkGuestRateLimit(normalized);

  const snap = await db()
    .collection('orders')
    .where('guestPhone', '==', normalized)
    .where('status', 'in', ['en_preparation', 'en_livraison'])
    .limit(5)
    .get();

  return {
    orders: snap.docs.map((d) => {
      const o = d.data() as any;
      const items = Array.isArray(o.items) ? o.items : [];
      const summary = items.length
        ? `${items[0]?.quantity ?? 1}× ${items[0]?.productName ?? 'Produit'}${items.length > 1 ? ` +${items.length - 1}` : ''}`
        : `Commande #${d.id.slice(0, 6)}`;
      return {
        orderId: d.id,
        summary,
        total: o.total ?? null,
        sellerName: o.sellerName ?? null,
        status: o.status,
      };
    }),
  };
});

/**
 * Étape 2 : le client confirme laquelle est la sienne. On crée (ou
 * retrouve) un compte invité déterministe lié au numéro, on lie la
 * commande à ce compte (conversion progressive — objectif business
 * §12), et on renvoie un custom token de connexion instantanée, sans
 * mot de passe, sans SMS.
 */
export const claimGuestOrderSession = onCall({ region: REGION }, async (request) => {
  const { orderId, phone } = (request.data || {}) as { orderId?: string; phone?: string };
  if (!orderId || !phone) throw new HttpsError('invalid-argument', 'orderId et téléphone requis.');
  const normalized = normalizePhone(phone);

  await checkGuestRateLimit(`${normalized}:claim`);

  const orderRef = db().collection('orders').doc(orderId);
  const orderSnap = await orderRef.get();
  if (!orderSnap.exists) throw new HttpsError('not-found', 'Commande introuvable.');
  const order = orderSnap.data() as any;

  if (order.guestPhone !== normalized) {
    throw new HttpsError('permission-denied', 'Ce numéro ne correspond pas à cette commande.');
  }

  const uid = guestUidFromPhone(normalized);
  await ensureGuestUser(uid, normalized);

  if (!order.userId) {
    await orderRef.set({ userId: uid }, { merge: true });
  }

  let customToken: string;
  try {
    customToken = await admin.auth().createCustomToken(uid, { guest: true });
  } catch (err) {
    console.error('❌ Erreur création token invité:', err);
    throw new HttpsError('internal', 'Impossible de générer votre accès — réessayez.');
  }

  console.log(`🔓 Session invité créée pour la commande ${orderId} (uid ${uid})`);
  return { customToken };
});

// ============================================================
//   4. DÉMARRER UNE COMMANDE SANS COMPTE — au checkout
// ============================================================
// Avant : checkout/page.tsx bloquait tout achat sans compte (redirect
// /auth/login), ce qui aurait forcé un OTP SMS pour créer un compte
// juste pour commander — exactement le coût qu'on cherche à éviter.
// Ici : même schéma d'uid déterministe que claimGuestOrderSession, mais
// appelé AVANT la création de la commande, pour que le client reparte
// avec une session (signInWithCustomToken) et un userId Firestore valide
// dès le premier clic — sans jamais passer par un SMS.
export const startGuestCheckoutSession = onCall({ region: REGION }, async (request) => {
  const { phone, name } = (request.data || {}) as { phone?: string; name?: string };
  if (!phone) throw new HttpsError('invalid-argument', 'Numéro de téléphone requis.');
  const normalized = normalizePhone(phone);
  if (normalized.length < 8) throw new HttpsError('invalid-argument', 'Numéro invalide.');

  await checkGuestRateLimit(`${normalized}:checkout`);

  const uid = guestUidFromPhone(normalized);
  await ensureGuestUser(uid, normalized, name);

  let customToken: string;
  try {
    customToken = await admin.auth().createCustomToken(uid, { guest: true });
  } catch (err) {
    console.error('❌ Erreur création token invité (checkout):', err);
    throw new HttpsError('internal', 'Impossible de démarrer votre commande — réessayez.');
  }

  console.log(`🛒 Session invité démarrée pour checkout (uid ${uid})`);
  return { customToken, guestPhone: normalized };
});
