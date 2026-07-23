import * as functions from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';

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
  payload: { title: string; body: string; type: string; data?: Record<string, string> }
) {
  try {
    await admin.firestore().collection('notifications').doc(userId).collection('items').add({
      title: payload.title,
      body: payload.body,
      type: payload.type,
      data: payload.data ?? {},
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`❌ Erreur écriture notification pour ${userId}:`, err);
  }
}

async function sendToUsers(
  userIds: string[],
  notification: { title: string; body: string },
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
      const res = await admin.messaging().sendEachForMulticast({ tokens, notification, data });
      console.log(`📲 Push envoyé : ${res.successCount}/${tokens.length} succès`);
    } catch (err) {
      console.error('❌ Erreur envoi push:', err);
    }
  }

  await Promise.all(
    uniqueIds.map((id) =>
      writeNotification(id, { title: notification.title, body: notification.body, type: data.type ?? 'info', data })
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

    try {
      await admin.messaging().send({
        topic: 'buyers',
        notification: {
          title: 'Nouveau produit 🌾',
          body: `${product.name} est maintenant disponible sur AgriMarché`,
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

    await Promise.all([
      sendToUsers(
        [order.userId],
        { title: 'Commande reçue ✅', body: `Votre commande de ${total} FCFA a bien été enregistrée.` },
        { type: 'order_created', orderId: event.params.orderId }
      ),
      order.sellerId
        ? sendToUsers(
            [order.sellerId],
            { title: 'Nouvelle commande 🛒', body: `Vous avez reçu une nouvelle commande de ${total} FCFA.` },
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

    const recipients = [after.userId, after.sellerId].filter(Boolean);
    await sendToUsers(
      recipients,
      { title: 'Commande annulée ❌', body: `La commande #${event.params.orderId.slice(0, 6)} a été annulée.` },
      { type: 'order_cancelled', orderId: event.params.orderId }
    );
  }
);

const STEP_NOTIFICATIONS: Record<string, { title: string; body: (id: string) => string }> = {
  en_preparation: {
    title: 'Commande en préparation 👨‍🌾',
    body: (id) => `Votre commande #${id.slice(0, 6)} est en cours de préparation.`,
  },
  en_livraison: {
    title: 'Commande en livraison 🚚',
    body: (id) => `Votre commande #${id.slice(0, 6)} est en route vers vous.`,
  },
  livre: {
    title: 'Commande livrée ✅',
    body: (id) => `Votre commande #${id.slice(0, 6)} a été livrée. Merci pour votre confiance !`,
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

    await sendToUsers(
      [after.userId],
      { title: step.title, body: step.body(event.params.orderId) },
      { type: 'order_status', orderId: event.params.orderId, status: after.status }
    );
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

    if (afterStock <= 0 && beforeStock > 0) {
      await sendToUsers(
        [after.sellerId],
        { title: 'Rupture de stock ⚠️', body: `"${after.name}" est en rupture de stock.` },
        { type: 'stock_out', productId: event.params.productId }
      );
      return;
    }

    if (afterStock > 0 && afterStock <= LOW_STOCK_THRESHOLD && beforeStock > LOW_STOCK_THRESHOLD) {
      await sendToUsers(
        [after.sellerId],
        { title: 'Stock faible 📉', body: `Il ne reste que ${afterStock} unité(s) de "${after.name}".` },
        { type: 'stock_low', productId: event.params.productId }
      );
    }
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

    await sendToUsers(
      [review.sellerId],
      { title: 'Nouvel avis client 📝', body: `${stars} — ${excerpt}` },
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

      await sendToUsers(
        [order.userId],
        {
          title: 'Votre commande est arrivée ? 📦',
          body: `N'oubliez pas de confirmer la réception de votre commande #${docSnap.id.slice(0, 6)}.`,
        },
        { type: 'delivery_reminder', orderId: docSnap.id }
      );
      batch.update(docSnap.ref, { reminderSentAt: admin.firestore.FieldValue.serverTimestamp() });
      count++;
    }

    if (count > 0) await batch.commit();
    console.log(`⏰ ${count} relance(s) de livraison envoyée(s).`);
  }
);