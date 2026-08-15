import * as functions from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { extractKeywords } from './normalizeKeyword';

admin.initializeApp();

// ============================================================
//   COMMANDES & AVIS — Cloud Functions callable (Admin SDK)
// ============================================================
// updateOrderStatus : confirmation de réception / annulation par le
// client. submitReview : création d'un avis lié à une commande. Les
// deux valident ownership + transition côté serveur en transaction —
// voir orderStatusTransitions.ts / reviewSubmission.ts pour le détail.
//
// ⚠️ Ces fonctions écrivent orders.status ('livre'/'annule') et des
// docs dans 'reviews'. Ça déclenche AUTOMATIQUEMENT les triggers
// notifyOrderStatusStep / notifyOrderCancelled / notifyNewReview
// définis plus bas dans ce fichier — aucun appel de notification à
// ajouter dans orderStatusTransitions.ts/reviewSubmission.ts, ce
// serait un doublon.
export { updateOrderStatus } from './orderStatusTransitions';
export { submitReview } from './reviewSubmission';

export const processEmailQueue = functions.firestore.onDocumentCreated(
  {
    document: 'email_queue/{docId}',
    secrets: ['RESEND_API_KEY'],
    timeoutSeconds: 60,
    region: 'us-central1'
  },
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;
    
    const data = snapshot.data();
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    try {
      console.log(`📧 Envoi réel à: ${data.to}`);
      
      const { error } = await resend.emails.send({
        from: 'AgriMarché <onboarding@resend.dev>',
        to: data.to,
        subject: data.subject,
        html: `<div><h2>🌿 AgriMarché</h2><p>${data.body}</p></div>`,
      });
      
      if (error) throw new Error(error.message);
      
      await snapshot.ref.update({
        status: 'sent',
        sentAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`✅ Email envoyé à ${data.to}`);
      
    } catch (error: any) {
      console.error(`❌ Erreur: ${error.message}`);
      await snapshot.ref.update({
        status: 'failed',
        error: error.message
      });
    }
  }
);

// ============================================================
//   NOTIFICATIONS PUSH (FCM) + EN-APP
// ============================================================
async function writeNotification(
  userId: string,
  payload: { title: string; body: string; type: string; icon?: string; link?: string; priority?: string; urgent?: boolean; data?: Record<string, string> }
) {
  try {
    // ⚠️ FIX critique : ce chemin était auparavant
    // notifications/{userId}/items/{itemId} (sous-collection) — que
    // NI NotificationProvider.tsx (cloche in-app de tous les
    // utilisateurs, filtre where('userId','==',uid) sur la collection
    // RACINE) NI admin/page.tsx (flux de supervision, même collection
    // racine) ne lisent. Toute notification envoyée par une Cloud
    // Function — donc TOUTES les notifications de ce fichier, y compris
    // celles qui existaient déjà avant cette conversation (nouvelle
    // commande, stock bas, nouveau produit...) — partait bien en push,
    // mais restait invisible dans l'historique de l'utilisateur et dans
    // le panneau admin. Ce fix aligne le schéma d'écriture sur celui
    // utilisé par /api/notifications/send (route client), déjà lu
    // correctement par les deux écrans.
    await admin.firestore().collection('notifications').add({
      userId,
      title: payload.title,
      body: payload.body,
      type: payload.type,
      icon: payload.icon ?? '🔔',
      link: payload.link ?? '/account/orders',
      deepLink: payload.link ?? '/account/orders', // conservé pour compat avec le champ lu par la route client
      priority: payload.priority ?? 'medium',
      urgent: payload.urgent ?? false,
      data: payload.data ?? {},
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`❌ Erreur écriture notification pour ${userId}:`, err);
  }
}

// Résumé lisible d'une liste d'articles de commande, ex : "2× Mangues, 1×
// Jus de bissap" — tronqué au-delà de 3 pour garder une notif courte.
// Réutilisé par toutes les notifications liées aux commandes.
type OrderItem = { productName?: string; quantity?: number; productPrice?: number; image?: string };
function summarizeItems(items: OrderItem[] | undefined): string | null {
  if (!Array.isArray(items) || items.length === 0) return null;
  const line = (it: OrderItem) => `${it.quantity ?? 1}× ${it.productName ?? 'Produit'}`;
  const extra = items.length > 3 ? ` +${items.length - 3} autre${items.length - 3 > 1 ? 's' : ''}` : '';
  return items.slice(0, 3).map(line).join(', ') + extra;
}
function firstItemImage(items: OrderItem[] | undefined): string | undefined {
  return Array.isArray(items) ? items.find((it) => it.image)?.image : undefined;
}

// Petits "stickers" motivants ajoutés en fin de notif pour que ça fasse
// plaisir à recevoir plutôt qu'un simple constat froid — un tiré au sort
// à chaque envoi pour ne jamais être répétitif.
const SELLER_STICKERS = [
  '🌟 Tu es extraordinaire !',
  '🔥 Ça vend fort !',
  '🏆 Bravo, continue comme ça !',
  '💪 Excellent travail !',
  '🎉 Une vente de plus !',
  '👏 Bien joué !',
];
const BUYER_STICKERS = [
  '🥳 Merci pour votre confiance !',
  '💚 On prend soin de votre commande !',
  '✨ Ça va être délicieux !',
  '🙏 Merci d\'avoir choisi AgriMarché !',
];
function randomSticker(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

async function sendToUsers(
  userIds: string[],
  notification: { title: string; body: string; imageUrl?: string },
  data: Record<string, string> = {}
) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) return;

  const userSnaps = await admin.firestore().getAll(
    ...uniqueIds.map((id) => admin.firestore().collection('users').doc(id))
  );

  const tokens: string[] = [];
  for (const snap of userSnaps) {
    const token = snap.exists ? (snap.data() as any)?.fcmToken : null;
    if (token) tokens.push(token);
  }

  if (tokens.length > 0) {
    try {
      // imageUrl : supporté nativement par Android et le web push FCM.
      // iOS nécessite en plus `mutable-content: 1` côté APNs pour que le
      // Notification Service Extension côté app télécharge l'image — sans
      // extension native installée, iOS affichera la notif sans image
      // (dégradation silencieuse, pas un échec). Non bloquant pour ce v1.
      const res = await admin.messaging().sendEachForMulticast({
        tokens,
        notification,
        data,
        apns: notification.imageUrl ? { payload: { aps: { 'mutable-content': 1 } } } : undefined,
      });
      console.log(`📲 Push envoyé : ${res.successCount}/${tokens.length} succès`);
    } catch (err) {
      console.error('❌ Erreur envoi push:', err);
    }
  }

  await Promise.all(
    uniqueIds.map((id) =>
      writeNotification(id, {
        title: notification.title,
        body: notification.body,
        type: data.type ?? 'info',
        link: data.link,
        data,
      })
    )
  );
}

export const onUserTokenSync = functions.firestore.onDocumentWritten(
  { document: 'users/{userId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;

    const data = after.data() as any;
    const token: string | undefined = data?.fcmToken;
    if (!token) return;

    const topic = data.role === 'seller' ? 'sellers' : 'buyers';
    try {
      await admin.messaging().subscribeToTopic([token], topic);
      console.log(`🔔 Token abonné au topic "${topic}" pour ${event.params.userId}`);
    } catch (err) {
      console.error('❌ Erreur abonnement topic:', err);
    }
  }
);

export const notifyNewProduct = functions.firestore.onDocumentCreated(
  { document: 'products/{productId}', region: 'us-central1' },
  async (event) => {
    const product = event.data?.data() as any;
    if (!product) return;

    const priceLabel = typeof product.price === 'number'
      ? `${product.price.toLocaleString('fr-FR')} FCFA/${product.unit ?? 'unité'}`
      : undefined;
    const image = Array.isArray(product.images) ? product.images[0] : undefined;

    try {
      await admin.messaging().send({
        topic: 'buyers',
        notification: {
          title: `🌾 Nouveau : ${product.name} !`,
          body: priceLabel
            ? `Disponible dès maintenant chez ${product.sellerName ?? 'un producteur local'} — ${priceLabel}`
            : `${product.name} est maintenant disponible sur AgriMarché`,
          ...(image ? { imageUrl: image } : {}),
        },
        data: { type: 'new_product', productId: event.params.productId },
      });
      console.log(`📣 Diffusion "nouveau produit" envoyée pour ${product.name}`);
    } catch (err) {
      console.error('❌ Erreur diffusion nouveau produit:', err);
    }
  }
);

export const notifyNewOrder = functions.firestore.onDocumentCreated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const order = event.data?.data() as any;
    if (!order) return;

    const total = order.total?.toLocaleString?.('fr-FR') ?? order.total;
    const itemsSummary = summarizeItems(order.items);
    const firstImage = firstItemImage(order.items);

    await Promise.all([
      sendToUsers(
        [order.userId],
        {
          title: '✅ Commande reçue !',
          body: itemsSummary
            ? `${itemsSummary} · ${total} FCFA. On s'en occupe !\n${randomSticker(BUYER_STICKERS)}`
            : `Votre commande de ${total} FCFA a bien été enregistrée.\n${randomSticker(BUYER_STICKERS)}`,
          ...(firstImage ? { imageUrl: firstImage } : {}),
        },
        { type: 'order_created', orderId: event.params.orderId }
      ),
      order.sellerId
        ? sendToUsers(
            [order.sellerId],
            {
              title: '🛒 Nouvelle commande !',
              body: itemsSummary
                ? `${order.userName ?? 'Un client'} a commandé ${itemsSummary} — ${total} FCFA\n${randomSticker(SELLER_STICKERS)}`
                : `Vous avez reçu une nouvelle commande de ${total} FCFA.\n${randomSticker(SELLER_STICKERS)}`,
              ...(firstImage ? { imageUrl: firstImage } : {}),
            },
            { type: 'order_created', orderId: event.params.orderId }
          )
        : Promise.resolve(),
    ]);
  }
);

export const notifyOrderCancelled = functions.firestore.onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;
    if (before.status === 'annule' || after.status !== 'annule') return;

    const orderId = event.params.orderId;
    const itemsSummary = summarizeItems(after.items);
    const total = after.total?.toLocaleString?.('fr-FR') ?? after.total;

    await Promise.all([
      after.userId
        ? sendToUsers(
            [after.userId],
            {
              title: 'Commande annulée ❌',
              body: itemsSummary
                ? `Votre commande (${itemsSummary} — ${total} FCFA) a été annulée. Désolé pour la gêne 💙`
                : `Votre commande #${orderId.slice(0, 6)} a été annulée. Désolé pour la gêne 💙`,
            },
            { type: 'order_cancelled', orderId }
          )
        : Promise.resolve(),
      after.sellerId
        ? sendToUsers(
            [after.sellerId],
            {
              title: 'Commande annulée ❌',
              body: itemsSummary
                ? `La commande de ${after.userName ?? 'votre client'} (${itemsSummary} — ${total} FCFA) a été annulée.`
                : `La commande #${orderId.slice(0, 6)} a été annulée.`,
            },
            { type: 'order_cancelled', orderId }
          )
        : Promise.resolve(),
    ]);
  }
);

const STEP_NOTIFICATIONS: Record<string, { title: string; body: (order: any, id: string) => string; link?: string }> = {
  en_preparation: {
    title: '👨‍🌾 Votre commande est en préparation !',
    body: (order, id) => {
      const items = summarizeItems(order.items);
      return items
        ? `${order.sellerName ?? 'Le vendeur'} prépare avec soin : ${items} 🌿`
        : `Votre commande #${id.slice(0, 6)} est en cours de préparation.`;
    },
  },
  en_livraison: {
    title: '🚚 Votre commande est en route !',
    body: (order, id) => {
      const items = summarizeItems(order.items);
      return items
        ? `${items} arrive bientôt chez vous. Presque là ! 🎉`
        : `Votre commande #${id.slice(0, 6)} est en route vers vous.`;
    },
  },
  livre: {
    // ⚠️ CONSOLIDATION : ce message était auparavant réécrit indépendamment
    // dans 3 écrans clients différents (admin, seller/orders, delivery
    // dashboard) — chacun avec son propre texte, et chacun déclenchant EN
    // PLUS de ce trigger serveur une notification manuelle via notifyUser().
    // Résultat avant fix : l'acheteur recevait 2 notifications "livré"
    // (une du trigger, une du client) à chaque fois, avec des textes
    // différents. Ce trigger est désormais la SEULE source pour cet
    // événement, peu importe quel écran a effectué la transition de statut
    // — et les 3 écrans clients ont eu leur appel manuel retiré.
    title: '✅ Votre commande est arrivée !',
    body: (order) => {
      const items = summarizeItems(order.items);
      return items
        ? `${items} livré avec succès ! Un avis prend 10 secondes et aide les producteurs locaux 🌾`
        : 'Votre commande a été livrée. Un avis prend 10 secondes et aide les producteurs locaux 🌾';
    },
    link: '/review',
  },
};

export const notifyOrderStatusStep = functions.firestore.onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;
    if (before.status === after.status) return;

    const step = STEP_NOTIFICATIONS[after.status];
    if (!step) return;

    const orderId = event.params.orderId;
    const link = step.link === '/review' ? `/review?id=${orderId}` : undefined;

    await sendToUsers(
      [after.userId],
      { title: step.title, body: step.body(after, orderId) },
      { type: 'order_status', orderId, status: after.status, ...(link ? { link } : {}) }
    );

    // Nouveau : le vendeur n'était notifié d'une livraison confirmée que
    // si la transition passait par delivery/dashboard::markAsDelivered —
    // jamais si c'était l'admin ou le vendeur lui-même (bouton "Marquer
    // comme livrée") qui faisait la transition. Ici, ça couvre les 3 cas
    // uniformément, une seule fois.
    if (after.status === 'livre' && after.sellerId) {
      const itemsSummary = summarizeItems(after.items);
      const earned = after.total?.toLocaleString?.('fr-FR') ?? after.total;
      await sendToUsers(
        [after.sellerId],
        {
          title: `✅ Commande #${orderId.slice(0, 6)} livrée !`,
          body: itemsSummary
            ? `${itemsSummary} livré avec succès — ${earned} FCFA encaissés. ${randomSticker(SELLER_STICKERS)}`
            : `Livraison confirmée — ${earned} FCFA. Le paiement sera traité selon le cycle habituel. ${randomSticker(SELLER_STICKERS)}`,
        },
        { type: 'order_delivered_seller', orderId }
      );
    }
  }
);

const LOW_STOCK_THRESHOLD = 5;

export const notifyLowStock = functions.firestore.onDocumentUpdated(
  { document: 'products/{productId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after || !after.sellerId) return;

    const beforeStock = before.stock ?? 0;
    const afterStock = after.stock ?? 0;
    if (beforeStock === afterStock) return;

    const image = Array.isArray(after.images) ? after.images[0] : undefined;

    if (afterStock <= 0 && beforeStock > 0) {
      await sendToUsers(
        [after.sellerId],
        {
          title: '⚠️ Rupture de stock !',
          body: `"${after.name}" est épuisé — pense à le réapprovisionner pour ne pas perdre de ventes 🌾`,
          ...(image ? { imageUrl: image } : {}),
        },
        { type: 'stock_out', productId: event.params.productId, link: '/seller/products' }
      );
      return;
    }

    if (afterStock > 0 && afterStock <= LOW_STOCK_THRESHOLD && beforeStock > LOW_STOCK_THRESHOLD) {
      await sendToUsers(
        [after.sellerId],
        {
          title: '📉 Stock bientôt épuisé',
          body: `Il ne reste que ${afterStock} unité(s) de "${after.name}" — c'est le moment de réapprovisionner !`,
          ...(image ? { imageUrl: image } : {}),
        },
        { type: 'stock_low', productId: event.params.productId, link: '/seller/products' }
      );
    }
  }
);

export const notifyDelivererClaimed = functions.firestore.onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;
    // Ne réagit qu'à l'apparition d'un delivererId sur une commande encore
    // en_attente (auto-attribution par un livreur, voir
    // delivery/dashboard/page.tsx::claimOrder) — pas à une réassignation
    // faite par l'admin (celle-ci a déjà sa propre notification, plus
    // riche, dans admin/page.tsx::assignDelivery, avec statut différent).
    if (before.delivererId || !after.delivererId) return;
    if (after.status !== 'en_attente') return;
    if (!after.sellerId) return;

    const itemsSummary = summarizeItems(after.items);
    await sendToUsers(
      [after.sellerId],
      {
        title: '🛵 Un livreur attend votre commande',
        body: itemsSummary
          ? `${after.delivererName || 'Un livreur'} est prêt à prendre ${itemsSummary}. Acceptez-la pour lancer la préparation !`
          : `${after.delivererName || 'Un livreur'} s'est positionné sur la commande #${event.params.orderId.slice(0, 6)}. Acceptez-la pour lancer la préparation.`,
      },
      { type: 'delivery_claimed', orderId: event.params.orderId, link: '/seller/orders' }
    );
  }
);

export const notifyNewReview = functions.firestore.onDocumentCreated(
  { document: 'reviews/{reviewId}', region: 'us-central1' },
  async (event) => {
    const review = event.data?.data() as any;
    if (!review?.sellerId) return;

    const rating = Math.max(1, Math.min(5, review.rating ?? 5));
    const stars = '⭐'.repeat(rating);
    const excerpt = review.comment ? String(review.comment).slice(0, 80) : 'Un client a laissé un avis.';
    const cheer = rating >= 4 ? ` ${randomSticker(SELLER_STICKERS)}` : '';

    await sendToUsers(
      [review.sellerId],
      { title: 'Nouvel avis client 📝', body: `${stars} — ${excerpt}${cheer}` },
      { type: 'new_review', reviewId: event.params.reviewId }
    );
  }
);

export const remindUnconfirmedDelivery = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', timeoutSeconds: 120 },
  async () => {
    const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

    const snap = await admin.firestore()
      .collection('orders')
      .where('status', '==', 'en_livraison')
      .get();

    const batch = admin.firestore().batch();
    let count = 0;

    for (const docSnap of snap.docs) {
      const order = docSnap.data() as any;
      if (order.reminderSentAt) continue;

      const updatedAtMs = order.updatedAt?.toMillis?.() ?? 0;
      if (updatedAtMs === 0 || updatedAtMs > cutoffMs) continue;

      const itemsSummary = summarizeItems(order.items);
      await sendToUsers(
        [order.userId],
        {
          title: '📦 Votre commande est bien arrivée ?',
          body: itemsSummary
            ? `N'oubliez pas de confirmer la réception de ${itemsSummary} — ça aide énormément le vendeur 🙏`
            : `N'oubliez pas de confirmer la réception de votre commande #${docSnap.id.slice(0, 6)}.`,
        },
        { type: 'delivery_reminder', orderId: docSnap.id, link: '/account/orders' }
      );
      batch.update(docSnap.ref, { reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
      count++;
    }

    if (count > 0) await batch.commit();
    console.log(`⏰ ${count} relance(s) de livraison envoyée(s).`);
  }
);

// ═══════════════════════════════════════════════════════════════════════
//   PERSONNALISATION — notifications basées sur les recherches/vues
// ═══════════════════════════════════════════════════════════════════════
// 3 pièces, dans l'ordre où elles interviennent :
//   1. syncProductSearchKeywords — maintient automatiquement un champ
//      `searchKeywords` sur chaque produit (nom + catégorie normalisés),
//      pour pouvoir le matcher efficacement contre les intérêts des
//      utilisateurs sans recalculer à la volée à chaque requête.
//   2. notifyRestockMatch — temps réel : un produit repasse de 0 en stock
//      → push immédiat aux utilisateurs qui l'avaient recherché/consulté.
//   3. weeklyInterestDigest — résumé hebdomadaire (lundi 9h, heure de
//      Dakar) pour les intérêts qui n'ont pas eu de match en temps réel.
//
// Les intérêts eux-mêmes sont écrits côté client par
// src/lib/interests/trackInterest.ts, sur users/{uid}.interestKeywords
// (array-contains queryable) et .interestDetails (fréquence, pour le
// classement du digest).

export const syncProductSearchKeywords = functions.firestore.onDocumentWritten(
  { document: 'products/{productId}', region: 'us-central1' },
  async (event) => {
    const after = event.data?.after;
    if (!after?.exists) return;
    const data = after.data() as any;

    const computed = [...new Set([
      ...extractKeywords(data.name || ''),
      ...extractKeywords(data.category || ''),
    ])];

    // Garde-fou anti-boucle : onDocumentWritten se redéclenche sur SA
    // PROPRE écriture. Sans cette comparaison, chaque mise à jour de stock
    // (très fréquente) réécrirait inutilement searchKeywords et
    // redéclencherait le trigger indéfiniment.
    const existing: string[] = data.searchKeywords || [];
    const same = existing.length === computed.length && existing.every((k) => computed.includes(k));
    if (same) return;

    await after.ref.update({ searchKeywords: computed });
  }
);

// ── Garde-fous personnalisation (consentement / fréquence / heures de silence) ──
// Communs à notifyRestockMatch (temps réel) et weeklyInterestDigest.

const QUIET_HOURS_START_UTC = 22; // 22h à Dakar == 22h UTC (pas de DST, UTC+0 fixe)
const QUIET_HOURS_END_UTC = 7;
const FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000; // 1 push perso max / jour / utilisateur

function isQuietHoursNow(): boolean {
  const h = new Date().getUTCHours();
  return h >= QUIET_HOURS_START_UTC || h < QUIET_HOURS_END_UTC;
}

// true si CE user peut recevoir CETTE notification maintenant, compte tenu
// de son consentement, de sa région (si le produit en a une et lui aussi —
// on ne filtre PAS un utilisateur qui n'a simplement pas encore de région
// connue, dégradation gracieuse plutôt que silence total), et du cap de
// fréquence quotidien.
function passesPersonalizationGate(
  userData: any,
  productRegion?: string
): boolean {
  if (userData.personalizedNotificationsEnabled === false) return false;
  if (productRegion && userData.region && userData.region !== productRegion) return false;
  const lastMs: number = userData.lastPersonalizedPushAt?.toMillis?.() ?? 0;
  if (Date.now() - lastMs < FREQUENCY_CAP_MS) return false;
  return true;
}

async function dispatchPersonalized(
  userIds: string[],
  notification: { title: string; body: string; imageUrl?: string },
  data: Record<string, string>
) {
  if (userIds.length === 0) return;

  if (isQuietHoursNow()) {
    // On ne perd pas la notification : elle est mise en attente et sera
    // envoyée par flushQueuedPersonalizedNotifications dès la sortie des
    // heures de silence (7h, heure de Dakar), plutôt que d'être abandonnée
    // ou — pire — envoyée à 3h du matin.
    await admin.firestore().collection('pendingPersonalizedNotifications').add({
      userIds, notification, data, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`🌙 Heures de silence — ${userIds.length} notification(s) mise(s) en attente.`);
    return;
  }

  await sendToUsers(userIds, notification, data);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const batch = admin.firestore().batch();
  userIds.forEach((id) => batch.set(admin.firestore().collection('users').doc(id), { lastPersonalizedPushAt: now }, { merge: true }));
  await batch.commit();
}

export const flushQueuedPersonalizedNotifications = onSchedule(
  { schedule: 'every day 07:05', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 },
  async () => {
    const snap = await admin.firestore().collection('pendingPersonalizedNotifications').limit(200).get();
    if (snap.empty) return;

    for (const docSnap of snap.docs) {
      const { userIds, notification, data } = docSnap.data() as any;
      await sendToUsers(userIds, notification, data);
      const now = admin.firestore.FieldValue.serverTimestamp();
      const batch = admin.firestore().batch();
      (userIds as string[]).forEach((id) => batch.set(admin.firestore().collection('users').doc(id), { lastPersonalizedPushAt: now }, { merge: true }));
      await batch.commit();
      await docSnap.ref.delete();
    }
    console.log(`🌅 File d'attente vidée : ${snap.size} groupe(s) de notifications envoyé(s).`);
  }
);

export const notifyRestockMatch = functions.firestore.onDocumentUpdated(
  { document: 'products/{productId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;

    const beforeStock = before.stock ?? 0;
    const afterStock = after.stock ?? 0;
    if (beforeStock > 0 || afterStock <= 0) return; // pas une transition 0 → disponible

    // Anti-spam : si le stock oscille 0→1→0 plusieurs fois dans la même
    // journée (dernier article vendu/rendu en boucle), on ne renvoie pas
    // une notification à chaque fois — cooldown de 6h par produit.
    const lastNotifiedMs: number = after.lastRestockNotifiedAt?.toMillis?.() ?? 0;
    if (Date.now() - lastNotifiedMs < 6 * 60 * 60 * 1000) return;

    const productKeywords: string[] = after.searchKeywords?.length
      ? after.searchKeywords
      : [...new Set([...extractKeywords(after.name || ''), ...extractKeywords(after.category || '')])];
    if (productKeywords.length === 0) return;

    // Firestore array-contains ne teste qu'UNE valeur par requête — le nom
    // + catégorie d'un produit génèrent rarement plus de 4-5 mots-clés, on
    // interroge donc chacun séparément puis on fusionne les utilisateurs
    // matchés (dédoublonnés via Set).
    const matchedUserIds = new Set<string>();
    for (const kw of productKeywords) {
      const snap = await admin.firestore()
        .collection('users')
        .where('interestKeywords', 'array-contains', kw)
        .limit(500)
        .get();
      snap.docs.forEach((d) => matchedUserIds.add(d.id));
    }
    if (matchedUserIds.size === 0) return;

    // Filtrage qualité : consentement, région (si connue des deux côtés),
    // et cap de fréquence — évite d'arroser tout le monde sans distinction
    // dès qu'un match mot-clé existe, ce qui était le vrai reproche fait au
    // premier jet de cette fonctionnalité.
    const candidateSnaps = await admin.firestore().getAll(
      ...[...matchedUserIds].map((id) => admin.firestore().collection('users').doc(id))
    );
    const eligibleUserIds = candidateSnaps
      .filter((s) => s.exists && passesPersonalizationGate(s.data(), after.region))
      .map((s) => s.id);
    if (eligibleUserIds.length === 0) return;

    const image = Array.isArray(after.images) ? after.images[0] : undefined;
    const priceLabel = typeof after.price === 'number'
      ? `${after.price.toLocaleString('fr-FR')} FCFA/${after.unit ?? 'unité'}`
      : undefined;

    await dispatchPersonalized(
      eligibleUserIds,
      {
        title: `🌾 ${after.name} est de retour !`,
        body: priceLabel
          ? `Le produit que vous cherchiez est de nouveau disponible — ${priceLabel}.`
          : `Le produit que vous cherchiez est de nouveau disponible.`,
        imageUrl: image,
      },
      { type: 'restock_match', productId: event.params.productId, link: '/main/products' }
    );

    await event.data!.after.ref.update({
      lastRestockNotifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`🌾 Restock match : ${eligibleUserIds.length}/${matchedUserIds.size} utilisateur(s) éligible(s) pour "${after.name}"`);
  }
);

export const weeklyInterestDigest = onSchedule(
  { schedule: 'every monday 09:00', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 540 },
  async () => {
    // Contrairement à notifyRestockMatch (part d'UN produit vers plusieurs
    // utilisateurs), ce digest part d'UN utilisateur vers SON propre
    // historique — chacun reçoit un message composé de ses intérêts à lui,
    // pas un message générique diffusé à tous.
    const usersSnap = await admin.firestore()
      .collection('users')
      .where('hasInterests', '==', true)
      .get();

    console.log(`📬 Digest hebdo : ${usersSnap.size} profil(s) avec un historique d'intérêt.`);

    let sentCount = 0;
    for (const userDoc of usersSnap.docs) {
      const userData = userDoc.data() as any;
      const keywords: string[] = userData.interestKeywords || [];
      if (keywords.length === 0) continue;
      // Consentement + cap de fréquence (pas de région ici : filtrée plus
      // bas, produit par produit, avant même de savoir lequel illustrer).
      if (!passesPersonalizationGate(userData)) continue;

      const details: Record<string, { count?: number }> = userData.interestDetails || {};
      // Les 5 intérêts les plus fréquents plutôt que les 5 plus récents —
      // un utilisateur qui cherche "oignon" chaque semaine depuis un mois
      // doit primer sur une recherche isolée d'hier. array-contains-any
      // accepte jusqu'à 10 valeurs ; 5 laisse de la marge et garde le
      // digest ciblé plutôt qu'exhaustif.
      const topKeywords = [...keywords]
        .sort((a, b) => (details[b]?.count ?? 0) - (details[a]?.count ?? 0))
        .slice(0, 5);

      const prodSnap = await admin.firestore()
        .collection('products')
        .where('searchKeywords', 'array-contains-any', topKeywords)
        .limit(30)
        .get();

      // Filtre stock + région côté fonction plutôt qu'en requête Firestore :
      // combiner array-contains-any avec une inégalité (stock > 0) exige un
      // index composite dédié à créer manuellement en prod, et Firestore ne
      // sait pas non plus combiner array-contains-any avec un 2ᵉ filtre
      // d'égalité variable (région) sans index composite spécifique par
      // région. Ce filtre en mémoire évite ces dépendances pour un v1, au
      // prix d'un `.limit(30)` plus large pour compenser ce qui est écarté.
      const inStock = prodSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((p) => (p.stock ?? 0) > 0)
        .filter((p) => !userData.region || !p.region || p.region === userData.region);
      if (inStock.length === 0) continue;

      // Le produit qui correspond au mot-clé le plus fréquent de
      // l'utilisateur passe en premier — c'est celui qui illustre le push
      // (titre + image), même si d'autres matches existent.
      const best = inStock[0];
      const image = Array.isArray(best.images) ? best.images[0] : undefined;
      const extraCount = inStock.length - 1;

      await dispatchPersonalized(
        [userDoc.id],
        {
          title: `🛒 ${best.name} vous attend`,
          body: extraCount > 0
            ? `Disponible maintenant, et ${extraCount} autre${extraCount > 1 ? 's' : ''} produit${extraCount > 1 ? 's' : ''} qui pourraient vous plaire.`
            : `Disponible maintenant, d'après vos recherches récentes.`,
          imageUrl: image,
        },
        { type: 'weekly_digest', link: '/main/products' }
      );
      sentCount++;
    }

    console.log(`📬 Digest hebdo terminé : ${sentCount} notification(s) envoyée(s).`);
  }
);

// ═══════════════════════════════════════════════════════════════════════
//   PARCOURS DE SUIVI HYBRIDE — attribution manuelle, progression GPS
// ═══════════════════════════════════════════════════════════════════════
// Principe (voir échange produit) : le vendeur ne confirme QUE ce que lui
// seul peut confirmer (préparation). Tout le reste de la progression après
// attribution du livreur est piloté automatiquement par le GPS, sauf
// l'arrivée précise (le livreur confirme manuellement — le GPS seul, avec
// une précision de quelques dizaines de mètres, ne peut pas fiabiliser "je
// suis devant la porte").
//
// tracking.phase progresse ainsi :
//   assigned → en_route → approaching → arrived → (status devient 'livre')
//
// Écrit côté client dans delivery/dashboard/page.tsx (claimOrder,
// startSharingLocation, markAsArrived) et admin/page.tsx (assignDelivery).
// Chaque transition est horodatée ici (tracking.{phase}At) — la donnée
// brute qui permettra un jour de calculer temps de préparation, temps de
// trajet, retards par livreur, fiabilité par vendeur. Aucun tableau de
// bord n'est construit sur ces données pour l'instant — juste la
// collecte, prête à être exploitée.

const SEUIL_PROCHE_METRES = 500;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export const checkDeliveryProximity = functions.firestore.onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;

    // Ne réagit qu'à un déplacement GPS réel, pas à n'importe quelle
    // écriture sur la commande (cette fonction serait sinon invoquée à
    // chaque changement de statut, de prix, etc. sans rapport).
    const beforeLoc = before.tracking?.currentLocation;
    const afterLoc = after.tracking?.currentLocation;
    if (!afterLoc || (beforeLoc?.lat === afterLoc.lat && beforeLoc?.lng === afterLoc.lng)) return;

    // Ne fait progresser que depuis 'en_route' — si la phase est déjà
    // 'approaching'/'arrived', ou pas encore 'assigned', rien à faire ici.
    if (after.tracking?.phase !== 'en_route') return;

    const dest = after.customerLocation;
    if (!dest?.lat || !dest?.lng) return;

    const distance = haversineMeters(afterLoc, dest);
    if (distance > SEUIL_PROCHE_METRES) return;

    await event.data!.after.ref.update({ 'tracking.phase': 'approaching' });
    console.log(`📍 Proximité détectée (${Math.round(distance)}m) — commande ${event.params.orderId} → approaching`);
  }
);

const PHASE_NOTIFICATIONS: Record<string, { title: string; body: (order: any) => string; timestampField: string }> = {
  en_route: {
    title: '🛵 Votre livreur est en route !',
    body: (order) => {
      const items = summarizeItems(order.items);
      return items ? `${order.delivererName || 'Votre livreur'} a pris le départ avec ${items} 🌾` : 'Il a commencé le trajet vers vous.';
    },
    timestampField: 'enRouteAt',
  },
  approaching: {
    title: '📍 Votre livreur arrive !',
    body: () => `Il est à moins de ${SEUIL_PROCHE_METRES}m de chez vous. Préparez-vous à l'accueillir ! 🙂`,
    timestampField: 'approachingAt',
  },
  arrived: {
    title: '📍 Votre livreur est arrivé !',
    body: (order) => {
      const items = summarizeItems(order.items);
      return items ? `${items} vous attend en bas ! ${randomSticker(BUYER_STICKERS)}` : 'Il vous attend avec votre commande.';
    },
    timestampField: 'arrivedAt',
  },
};

export const notifyDeliveryPhaseChange = functions.firestore.onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;

    const beforePhase = before.tracking?.phase;
    const afterPhase = after.tracking?.phase;
    if (!afterPhase || beforePhase === afterPhase) return;

    // Horodatage systématique — indépendant de l'envoi de notification,
    // pour que la donnée d'analytique existe même pour la phase 'assigned'
    // (qui n'a pas de message dédié ici, déjà couverte par
    // notifyDelivererClaimed côté vendeur).
    await event.data!.after.ref.update({
      [`tracking.${afterPhase}At`]: admin.firestore.FieldValue.serverTimestamp(),
    });

    const step = PHASE_NOTIFICATIONS[afterPhase];
    if (!step || !after.userId) return;

    await sendToUsers(
      [after.userId],
      { title: step.title, body: step.body(after) },
      { type: 'delivery_phase', orderId: event.params.orderId, phase: afterPhase, link: `/tracking?id=${event.params.orderId}` }
    );
  }
);