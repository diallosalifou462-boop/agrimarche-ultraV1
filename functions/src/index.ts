// ============================================================
//   index.ts — FUSION du système de notifications avancé
//   (idempotence, tokens FCM en sous-collection, digest hebdo,
//   suivi GPS par phases) avec le système de code de livraison
//   (deliveryCode.ts).
//
//   Schémas vérifiés contre le vrai code frontend (useFCMToken.ts,
//   NotificationProvider.tsx) :
//   ✅ Tokens FCM : sous-collection users/{uid}/tokens/{token}
//   ✅ Notifications in-app : collection racine 'notifications',
//      filtrée par where('userId', '==', uid) — pas de sous-collection
//
//   Reste à vérifier avant de déployer :
//   1. normalizeKeyword.ts (extractKeywords) n'existait pas dans
//      functions/src/ — confirmé en inspectant le vrai dossier. Fourni
//      à part avec ce fichier ; à copier dans functions/src/.
//   2. Ce fichier n'a, à ma connaissance, jamais été déployé (le
//      functions/src/index.ts actuel fait 325 lignes, sans aucune de
//      ces fonctions) — à tester en émulateur avant `firebase deploy`.
// ============================================================
import * as functions from 'firebase-functions/v2';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import { Resend } from 'resend';
import { extractKeywords } from './normalizeKeyword';
import { purgeOldRateLimitDocs } from './rateLimit';
import { purgeOldRegistrationSessions } from './registration';
import { purgeExpiredPhoneReservations } from './phoneUniqueness';
import { purgeOldFraudWindows } from './fraud';
import { purgeOldLoginOtpSessions } from './loginOtp';
import { purgeOldPasswordResetSessions } from './passwordReset';

// Échappement HTML minimal — le corps d'un email de la queue peut contenir
// du texte dérivé d'une saisie utilisateur (nom de produit, message...).
// Sans échappement, ce texte est injecté tel quel dans le HTML de l'email
// envoyé (voir processEmailQueue), ce qui permettrait d'y glisser balises
// ou liens arbitraires.
function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

admin.initializeApp();
// Filet de sécurité : les payloads envoyés à Firestore dans ce fichier sont
// construits avec des `...(cond ? {...} : {})` pour éviter les valeurs
// `undefined` (rejetées par défaut par le SDK Admin), mais un seul oubli
// dans une future modification ferait planter silencieusement un trigger
// entier. Ce réglage rend ces valeurs simplement ignorées plutôt que fatales.
admin.firestore().settings({ ignoreUndefinedProperties: true });

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

// ⚠️ Le code appartient au client, jamais au livreur (règle fondamentale
// du parcours de livraison) : claimOrder génère le code côté serveur et
// le range hors de portée du livreur ; confirmDeliveryWithCode est la
// SEULE porte par laquelle une commande peut désormais passer à 'livre'
// depuis le tableau de bord livreur. getDeliveryCode est la seule façon
// de lire le code, réservée au propriétaire de la commande. findGuestOrders
// / claimGuestOrderSession / startGuestCheckoutSession portent l'accès
// sans compte, sans SMS, sans mot de passe — voir deliveryCode.ts.
//
// Intégration avec le système de notifications ci-dessous : claimOrder
// pose delivererId (+ status → 'en_livraison' si le vendeur avait déjà
// confirmé) exactement dans les mêmes conditions que celles attendues par
// notifyDelivererClaimed plus bas — aucune modification nécessaire de ce
// trigger. confirmDeliveryWithCode écrit status → 'livre' et laisse
// intentionnellement notifyOrderStatusStep envoyer la notification
// (voir commentaire dans deliveryCode.ts) : ne pas ajouter d'envoi
// manuel dans deliveryCode.ts, ce serait un doublon.
export {
  claimOrder,
  confirmDeliveryWithCode,
  getDeliveryCode,
  getDeliveryCodeAdmin,
  findGuestOrders,
  claimGuestOrderSession,
  startGuestCheckoutSession,
} from './deliveryCode';

// ============================================================
//   INSCRIPTION — Expresso/Tigo (push-first, fallback InfoBip
//   uniquement en l'absence de token push) + Orange (Firebase
//   Phone Auth). Unicité du numéro garantie côté backend dans les
//   deux cas via phoneUniqueness.ts (collection partagée
//   `phoneIndex`). Voir registration.ts et orangeRegistration.ts
//   pour le détail du parcours.
// ============================================================
export { registrationStart, registrationResend, registrationVerify } from './registration';
export { completeOrangeRegistration } from './orangeRegistration';
export { loginSendOtp, loginVerifyOtp } from './loginOtp';
export { resetPasswordSendOtp, resetPasswordVerifyOtp } from './passwordReset';
// Alerting automatique (taux d'échec anormal) + endpoint dashboard admin.
export { checkRegistrationHealth, getRegistrationMetrics } from './monitoring';

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
      
      // ⚠️ TODO PROD : 'onboarding@resend.dev' est le domaine sandbox de
      // Resend — en free tier il ne délivre en pratique qu'à l'adresse du
      // compte propriétaire. À remplacer par un domaine vérifié
      // (ex: notifications@agrimarche.sn) avant tout envoi à de vrais
      // clients, sous peine d'emails jamais délivrés en production.
      const { error } = await resend.emails.send({
        from: 'Sunu Mëñëf <onboarding@resend.dev>',
        to: data.to,
        subject: data.subject,
        html: `<div><h2>🌿 Sunu Mëñëf</h2><p>${escapeHtml(data.body)}</p></div>`,
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
  payload: { title: string; body: string; type: string; icon?: string; link?: string; priority?: string; urgent?: boolean; image?: string; data?: Record<string, string> }
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
      ...(payload.image ? { image: payload.image } : {}),
      data: payload.data ?? {},
      read: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error(`❌ Erreur écriture notification pour ${userId}:`, err);
  }
}

// ── Idempotence des triggers Firestore (Cloud Functions v2 / Eventarc) ────
// Eventarc garantit "au moins une fois", pas "exactement une fois" : en cas
// de timeout réseau, de redéploiement pendant l'exécution, ou de simple
// aléa d'infrastructure, le MÊME événement peut redéclencher exactement le
// même trigger une deuxième fois — avec le même event.id. Sans garde, un
// utilisateur reçoit alors deux notifications identiques pour un seul
// événement réel (commande créée, statut changé...), ce qui ressemble à un
// bug côté client et entame la confiance dans l'app. On enregistre chaque
// event.id traité dans une collection dédiée via une création atomique :
// la première tentative réussit et continue, toute tentative suivante pour
// le même event.id échoue sur un doc déjà existant et s'arrête là.
// "Fail open" volontaire si Firestore lui-même est indisponible : mieux
// vaut occasionnellement doubler une notification que ne jamais l'envoyer.
async function alreadyProcessed(eventId: string): Promise<boolean> {
  try {
    await admin.firestore().collection('_processedNotificationEvents').doc(eventId).create({
      processedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return false;
  } catch (err: any) {
    if (err?.code === 6 || /ALREADY_EXISTS/i.test(err?.message ?? '')) return true;
    console.warn('⚠️ Vérification idempotence indisponible, envoi quand même:', err);
    return false;
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
  '🙏 Merci d\'avoir choisi Sunu Mëñëf !',
];
function randomSticker(list: string[]): string {
  return list[Math.floor(Math.random() * list.length)];
}

// ── Config plateforme FCM, factorisée (Android/iOS) ────────────────────────
// Reprise à l'identique par sendToUsers ET notifyNewProduct (avant : deux
// blocs android/apns dupliqués et déjà en train de diverger l'un de l'autre).
// Un seul endroit à ajuster pour changer le son, le canal Android ou le
// comportement iOS sur toutes les notifications de l'app.
//
// - priority 'high' partout videmment la batterie pour rien (Android réveille
//   le CPU immédiatement) ; seules les notifs urgentes/sensibles au temps le
//   justifient, le reste passe en 'normal' (livré dès que l'appareil est de
//   toute façon réveillé, sans forcer un réveil immédiat).
// - groupId (thread-id iOS / tag Android) : regroupe visuellement toutes les
//   notifs d'une même commande au lieu de les empiler comme des messages
//   sans rapport.
// - timeSensitive : iOS 15+ (aps.interruption-level) — traverse le mode
//   Concentration/Ne pas déranger pour ce qui compte vraiment (livreur
//   arrivé...), nécessite l'entitlement "Time Sensitive Notifications" côté
//   Xcode pour prendre effet, sinon dégradation silencieuse en 'active'.
// - ttlSeconds : une info périmée ("votre livreur est à 500m") livrée 2h
//   plus tard par FCM (appareil resté hors-ligne) induit plus qu'elle
//   n'aide — TTL court pour ce type d'événement plutôt que la valeur par
//   défaut de FCM (4 semaines).
function buildPushConfig(opts: {
  imageUrl?: string;
  urgent?: boolean;
  groupId?: string;
  timeSensitive?: boolean;
  ttlSeconds?: number;
}) {
  const highPriority = opts.urgent || opts.timeSensitive;
  return {
    android: {
      priority: highPriority ? ('high' as const) : ('normal' as const),
      ...(opts.ttlSeconds ? { ttl: opts.ttlSeconds * 1000 } : {}),
      notification: {
        channelId: opts.urgent ? 'agrimarche_urgent' : 'agrimarche_default',
        sound: 'default',
        ...(opts.imageUrl ? { imageUrl: opts.imageUrl } : {}),
        ...(opts.groupId ? { tag: opts.groupId } : {}),
      },
    },
    apns: {
      ...(opts.ttlSeconds ? { headers: { 'apns-expiration': String(Math.floor(Date.now() / 1000) + opts.ttlSeconds) } } : {}),
      payload: {
        aps: {
          sound: 'default',
          ...(opts.imageUrl ? { 'mutable-content': 1 } : {}),
          ...(opts.groupId ? { 'thread-id': opts.groupId } : {}),
          ...(opts.timeSensitive ? { 'interruption-level': 'time-sensitive' as const } : {}),
        },
      },
      ...(opts.imageUrl ? { fcmOptions: { imageUrl: opts.imageUrl } } : {}),
    },
  };
}

// FCM rejette tout appel multicast au-delà de 500 tokens — découpe en lots.
// Réutilisé aussi pour Firestore ci-dessous : même limite de 500 par batch.
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ⚠️ FIX critique : un WriteBatch Firestore est plafonné à 500 opérations —
// au-delà, `commit()` rejette l'intégralité du batch. dispatchPersonalized
// et flushQueuedPersonalizedNotifications peuvent recevoir des listes de
// userIds bien au-delà de 500 (ex: notifyRestockMatch agrège jusqu'à 500
// utilisateurs PAR mot-clé, sur 5 mots-clés). Sans ce découpage, la mise à
// jour de lastPersonalizedPushAt plantait silencieusement dans ce cas — le
// push, lui, était déjà parti (sendToUsers ne dépend pas de ce batch), donc
// l'échec se traduisait uniquement par un cap de fréquence jamais posé :
// bug invisible en usage normal, qui n'apparaît qu'à grande échelle.
async function setManyMerge(
  updates: Array<{ ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }>
): Promise<void> {
  for (const group of chunk(updates, 500)) {
    const batch = admin.firestore().batch();
    group.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
}

// Codes d'erreur FCM qui signifient "ce token ne recevra plus jamais rien" —
// appareil désinstallé, token expiré, révoqué... Les laisser en base fait
// grossir indéfiniment les listes de tokens (chaque envoi devient plus lent
// et plus coûteux) et dégrade le taux de succès rapporté par FCM. Sur les
// autres erreurs (quota, indisponibilité momentanée...), on garde le token :
// ce n'est pas lui le problème.
const DEAD_TOKEN_ERROR_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

// Une seule tentative de retry, avec un court délai, pour les erreurs
// clairement transitoires (indisponibilité momentanée du service FCM) — pas
// pour les erreurs de token, qui échoueraient de la même façon à chaque essai.
const TRANSIENT_ERROR_CODES = new Set([
  'messaging/internal-error',
  'messaging/server-unavailable',
  'messaging/timeout',
]);

async function sendMulticastWithCleanup(
  tokenOwners: Map<string, string>, // token → userId, pour savoir où supprimer en cas d'échec
  notification: { title: string; body: string; imageUrl?: string },
  data: Record<string, string>,
  pushOpts: { urgent?: boolean; groupId?: string; timeSensitive?: boolean; ttlSeconds?: number }
) {
  const allTokens = [...tokenOwners.keys()];
  if (allTokens.length === 0) return { successCount: 0, failureCount: 0 };

  const pushConfig = buildPushConfig({ imageUrl: notification.imageUrl, ...pushOpts });
  let successCount = 0;
  let failureCount = 0;
  const deadTokens: string[] = [];

  for (const batch of chunk(allTokens, 500)) {
    let res;
    try {
      res = await admin.messaging().sendEachForMulticast({ tokens: batch, notification, data, ...pushConfig });
    } catch (err: any) {
      if (TRANSIENT_ERROR_CODES.has(err?.code)) {
        console.warn(`⏳ Erreur transitoire FCM, nouvelle tentative pour ${batch.length} token(s)...`);
        try {
          res = await admin.messaging().sendEachForMulticast({ tokens: batch, notification, data, ...pushConfig });
        } catch (retryErr) {
          console.error('❌ Échec définitif après retry:', retryErr);
          failureCount += batch.length;
          continue;
        }
      } else {
        console.error('❌ Erreur envoi push (lot):', err);
        failureCount += batch.length;
        continue;
      }
    }

    successCount += res.successCount;
    failureCount += res.failureCount;
    res.responses.forEach((r, i) => {
      if (!r.success && DEAD_TOKEN_ERROR_CODES.has(r.error?.code ?? '')) {
        deadTokens.push(batch[i]);
      }
    });
  }

  if (deadTokens.length > 0) {
    const batchWrite = admin.firestore().batch();
    deadTokens.forEach((token) => {
      const userId = tokenOwners.get(token);
      if (userId) batchWrite.delete(admin.firestore().collection('users').doc(userId).collection('tokens').doc(token));
    });
    await batchWrite.commit();
    console.log(`🧹 ${deadTokens.length} token(s) mort(s) supprimé(s).`);
  }

  return { successCount, failureCount };
}

async function sendToUsers(
  userIds: string[],
  notification: { title: string; body: string; imageUrl?: string },
  data: Record<string, string> = {},
  pushOpts: { timeSensitive?: boolean; ttlSeconds?: number } = {}
) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean);
  if (uniqueIds.length === 0) return;

  // ⚠️ FIX critique (alignement avec /api/notifications/send,
  // /api/send-push, /api/orders/notify-seller et AuthContext.tsx) : les
  // tokens FCM sont enregistrés par useFCMToken.ts dans la sous-collection
  // users/{uid}/tokens/{token} — jamais dans un champ userData.fcmToken,
  // qui n'existe plus nulle part côté écriture. Lire ce champ ici faisait
  // que cette fonction trouvait TOUJOURS 0 token et n'envoyait donc aucun
  // push, silencieusement (le doc in-app était quand même écrit plus bas,
  // ce qui masquait le problème). On lit maintenant la même sous-collection
  // que le reste de l'app, sur TOUS les appareils enregistrés par
  // utilisateur (un compte peut être connecté sur plusieurs téléphones).
  const tokensByUser = await Promise.all(
    uniqueIds.map((id) =>
      admin.firestore().collection('users').doc(id).collection('tokens').get()
    )
  );
  const tokenOwners = new Map<string, string>();
  tokensByUser.forEach((snap, idx) => {
    snap.docs.forEach((d) => tokenOwners.set(d.id, uniqueIds[idx]));
  });

  if (tokenOwners.size > 0) {
    // groupId = orderId quand la notif en porte un : regroupe visuellement
    // (thread iOS / tag Android) tout ce qui concerne la même commande au
    // lieu d'empiler des notifs isolées sans lien apparent entre elles.
    const { successCount, failureCount } = await sendMulticastWithCleanup(
      tokenOwners,
      notification,
      data,
      {
        urgent: data.urgent === 'true',
        groupId: data.orderId,
        timeSensitive: pushOpts.timeSensitive,
        ttlSeconds: pushOpts.ttlSeconds,
      }
    );
    console.log(`📲 Push envoyé : ${successCount}/${successCount + failureCount} succès`);
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

// ⚠️ FIX critique : se déclenchait auparavant sur users/{userId} et lisait
// data.fcmToken — un champ jamais écrit par useFCMToken.ts (voir sendToUsers
// ci-dessus). Résultat : AUCUN appareil n'était jamais abonné aux topics
// "buyers"/"sellers", donc les diffusions de masse (notifyNewProduct) ne
// touchaient plus personne, même les nouveaux inscrits. On se déclenche
// maintenant sur la création de chaque token dans la sous-collection —
// c'est le seul endroit où le token existe réellement — et on va chercher
// le rôle sur le document utilisateur parent pour choisir le topic.
export const onUserTokenSync = functions.firestore.onDocumentCreated(
  { document: 'users/{userId}/tokens/{tokenId}', region: 'us-central1' },
  async (event) => {
    const token = event.params.tokenId; // l'ID du doc EST le token (voir useFCMToken.ts)
    if (!token) return;

    try {
      const userSnap = await admin.firestore().collection('users').doc(event.params.userId).get();
      const role = userSnap.exists ? (userSnap.data() as any)?.role : undefined;
      const topic = role === 'seller' ? 'sellers' : 'buyers';

      await admin.messaging().subscribeToTopic([token], topic);
      console.log(`🔔 Token abonné au topic "${topic}" pour ${event.params.userId}`);
    } catch (err) {
      console.error('❌ Erreur abonnement topic:', err);
    }
  }
);

// Duplique volontairement src/lib/categoryLink.ts : ce fichier tourne côté
// Cloud Functions (Node), il ne peut pas importer un module du dossier
// src/ de l'app Next.js. La logique DOIT rester identique à celle du
// frontend (src/app/category/page.tsx filtre avec le même slug), sinon la
// notif mène vers une page catégorie qui affiche "Aucun produit trouvé".
function categorySlug(category?: string | null): string {
  return (category || '').toLowerCase().trim().replace(/\s+/g, '-');
}
function categoryLink(category?: string | null): string {
  const slug = categorySlug(category);
  return slug ? `/category?category=${encodeURIComponent(slug)}` : '/main/products';
}

export const notifyNewProduct = functions.firestore.onDocumentCreated(
  { document: 'products/{productId}', region: 'us-central1' },
  async (event) => {
    const product = event.data?.data() as any;
    if (!product) return;
    if (await alreadyProcessed(event.id)) return;

    const priceLabel = typeof product.price === 'number'
      ? `${product.price.toLocaleString('fr-FR')} FCFA/${product.unit ?? 'unité'}`
      : undefined;
    const image = Array.isArray(product.images) ? product.images[0] : undefined;
    const title = `🌾 Nouveau : ${product.name} !`;
    const sellerLabel = product.sellerName || product.farmer || 'un producteur local';
    const body = priceLabel
      ? `Disponible dès maintenant chez ${sellerLabel}${product.region ? ` (${product.region})` : ''} — ${priceLabel}`
      : `${product.name} est maintenant disponible sur Sunu Mëñëf`;
    // ⚠️ FIX : pointait vers `/product?id=...` — la fiche de CE seul
    // produit. Un acheteur qui reçoit "🌾 Nouveau : Bananes !" et tape
    // sur la notif doit atterrir sur le rayon Fruits en entier (mêmes
    // bananes, plus tout le reste de la catégorie), pas être enfermé sur
    // une fiche unique.
    const link = categoryLink(product.category);

    // ── 0. Anti-spam en rafale : un vendeur qui publie tout son catalogue
    //    d'un coup (10-20 produits en quelques secondes) ne doit pas faire
    //    vibrer le téléphone de chaque acheteur 10-20 fois de suite. On
    //    garde une notification PAR produit dans l'historique in-app (rien
    //    n'est perdu — l'acheteur peut tout consulter dans la cloche 🔔),
    //    mais on ne renvoie un push qui interrompt réellement l'utilisateur
    //    que si le dernier produit de ce vendeur date d'il y a plus de 3
    //    minutes. "Fail open" volontaire, même logique qu'alreadyProcessed
    //    ci-dessus : si cette vérification échoue, on préfère un push en
    //    trop plutôt qu'aucun.
    const BURST_WINDOW_MS = 3 * 60 * 1000;
    let skipPush = false;
    if (product.sellerId) {
      try {
        const throttleRef = admin.firestore().collection('_sellerNewProductThrottle').doc(product.sellerId);
        await admin.firestore().runTransaction(async (tx) => {
          const snap = await tx.get(throttleRef);
          const lastAt = snap.exists ? ((snap.data() as any)?.lastPushAt?.toMillis?.() ?? 0) : 0;
          skipPush = Date.now() - lastAt < BURST_WINDOW_MS;
          if (!skipPush) {
            tx.set(throttleRef, { lastPushAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          }
        });
      } catch (err) {
        console.error('❌ Erreur vérification anti-spam nouveau produit:', err);
      }
    }

    // ── 1. Push instantané, par topic (efficace à grande échelle : un seul
    //    appel FCM touche tous les acheteurs abonnés, sans lire leurs
    //    tokens un par un — voir onUserTokenSync ci-dessus). Sauté en cas
    //    de rafale (voir étape 0), l'écriture in-app ci-dessous a lieu
    //    dans tous les cas. ─────────────────────────────────────────────
    if (!skipPush) {
      try {
        await admin.messaging().send({
          topic: 'buyers',
          notification: { title, body, ...(image ? { imageUrl: image } : {}) },
          data: { type: 'new_product', productId: event.params.productId, link },
          ...buildPushConfig({ imageUrl: image }),
        });
        console.log(`📣 Push "nouveau produit" envoyé pour ${product.name}`);
      } catch (err) {
        console.error('❌ Erreur push nouveau produit:', err);
      }
    } else {
      console.log(`⏭️ Push "nouveau produit" sauté (rafale du vendeur) pour ${product.name} — conservé dans l'historique in-app`);
    }

    // ── 2. Historique in-app (cloche de notifications), avec la photo.
    //    ⚠️ FIX : avant cette conversation, un nouveau produit déclenchait
    //    DEUX envois séparés — ce trigger (push topic uniquement, pas
    //    d'historique) ET un notifyAllUsers() côté client dans
    //    seller/products/add/page.tsx (historique in-app, mais sans
    //    photo et sans le fix de lien catégorie, en plus d'un aller-retour
    //    réseau évitable). Un acheteur recevait donc deux notifications
    //    "nouveau produit" pour une seule publication. L'appel client a
    //    été supprimé : ce trigger serveur — automatique, fiable même si
    //    le vendeur ferme l'app juste après publication, et déjà protégé
    //    par alreadyProcessed() contre les rejouements Eventarc — est
    //    maintenant l'unique source, pour le push ET l'historique. ──────
    try {
      const usersSnap = await admin.firestore().collection('users').select('role').get();
      // Même audience que le topic "buyers" côté onUserTokenSync : tout le
      // monde sauf les vendeurs (un rôle absent/inconnu est traité comme
      // acheteur, exactement comme `role === 'seller' ? 'sellers' : 'buyers'`).
      const buyerIds = usersSnap.docs
        .filter((d) => (d.data() as any)?.role !== 'seller')
        .map((d) => d.id);

      for (const idsChunk of chunk(buyerIds, 450)) {
        const batch = admin.firestore().batch();
        idsChunk.forEach((userId) => {
          const ref = admin.firestore().collection('notifications').doc();
          batch.set(ref, {
            userId,
            type: 'new_product',
            title,
            body,
            icon: '🌾',
            link,
            deepLink: link,
            priority: 'medium',
            urgent: false,
            ...(image ? { image } : {}),
            data: { type: 'new_product', productId: event.params.productId },
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        });
        await batch.commit();
      }
      console.log(`🗂️ Historique in-app écrit pour ${buyerIds.length} acheteur(s)`);
    } catch (err) {
      console.error('❌ Erreur écriture historique nouveau produit:', err);
    }
  }
);

export const notifyNewOrder = functions.firestore.onDocumentCreated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const order = event.data?.data() as any;
    if (!order) return;
    if (await alreadyProcessed(event.id)) return;

    const total = order.total?.toLocaleString?.('fr-FR') ?? order.total;
    const itemsSummary = summarizeItems(order.items);
    const firstImage = firstItemImage(order.items);

    await Promise.all([
      sendToUsers(
        [order.userId],
        {
          // Expert notifications push (revue) : le sticker était auparavant
          // sur une nouvelle ligne (\n) — invisible en pratique, la plupart
          // des trays Android/iOS tronquent après 2 lignes ou ~80-90
          // caractères sur écran verrouillé. Ramené sur la même ligne pour
          // qu'il soit réellement vu, et l'info utile (montant, contenu)
          // reste dans les tout premiers mots, avant toute troncature.
          title: '✅ Commande reçue !',
          body: itemsSummary
            ? `${itemsSummary} · ${total} FCFA. On s'en occupe ${randomSticker(BUYER_STICKERS)}`
            : `Votre commande de ${total} FCFA est bien enregistrée ${randomSticker(BUYER_STICKERS)}`,
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
                ? `${order.userName ?? 'Un client'} a commandé ${itemsSummary} — ${total} FCFA ${randomSticker(SELLER_STICKERS)}`
                : `Vous avez reçu une nouvelle commande de ${total} FCFA ${randomSticker(SELLER_STICKERS)}`,
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
    if (await alreadyProcessed(event.id)) return;

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
    // Le SMS n'est plus le canal de diffusion du code de livraison (voir
    // deliveryCode.ts) : c'est ici, dans cette notification, que le client
    // apprend où le retrouver. Pas besoin de l'avoir vue pour l'utiliser —
    // l'app le montrera de toute façon quand le livreur sera là.
    //
    // Ligne "ne le donnez qu'en personne" ajoutée à la relecture sécurité :
    // tout le modèle de confiance de deliveryCode.ts repose sur le fait
    // que le livreur ne voit JAMAIS le code avant d'être physiquement
    // présent — mais rien n'empêche un faux livreur d'appeler le client
    // ("bonjour, c'est votre livreur, donnez-moi le code pour confirmer")
    // avant même d'arriver. C'est un vecteur d'ingénierie sociale classique
    // sur les livraisons à code en Afrique de l'Ouest (vu sur les services
    // de paiement mobile). La notification est le seul moment où l'on est
    // sûr que le client lit un message — c'est là qu'il faut le prévenir,
    // pas seulement dans une FAQ jamais consultée.
    body: (order, id) => {
      const items = summarizeItems(order.items);
      return items
        ? `${items} arrive bientôt. Votre code vous attend dans l'app — ne le donnez qu'au livreur, en face à face 🔐`
        : `Commande #${id.slice(0, 6)} en route. Votre code vous attend dans l'app — ne le donnez qu'au livreur, en face à face 🔐`;
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

// Paliers célébrés dans les notifications de livraison.
const BUYER_MILESTONES = [5, 10, 25, 50, 100];
const SELLER_MILESTONES = [1, 5, 10, 25, 50, 100, 250, 500, 1000];

// Nombre de commandes livrées d'un client ou d'un vendeur (agrégation
// count(), aucun document lu). Deux filtres d'égalité : pas d'index
// composite nécessaire. null si indisponible → notification normale.
async function countDeliveredOrders(field: 'userId' | 'sellerId', id: string): Promise<number | null> {
  try {
    const query: any = admin.firestore().collection('orders').where(field, '==', id).where('status', '==', 'livre');
    if (typeof query.count !== 'function') return null;
    const agg = await query.count().get();
    return agg.data().count as number;
  } catch (err) {
    console.warn(`⚠️ Comptage des commandes livrées impossible (${field}=${id}):`, err);
    return null;
  }
}

export const notifyOrderStatusStep = functions.firestore.onDocumentUpdated(
  { document: 'orders/{orderId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;
    if (before.status === after.status) return;

    const step = STEP_NOTIFICATIONS[after.status];
    if (!step) return;
    if (await alreadyProcessed(event.id)) return;

    const orderId = event.params.orderId;
    const link = step.link === '/review' ? `/review?id=${orderId}` : undefined;

    // 🎉 Étapes franchies : la 5e, 10e, 25e… commande livrée d'un client
    // change le titre de la notification (pas de push supplémentaire).
    let buyerTitle = step.title;
    if (after.status === 'livre' && after.userId) {
      const n = await countDeliveredOrders('userId', after.userId);
      if (n !== null && BUYER_MILESTONES.includes(n)) {
        buyerTitle = `🎉 Votre ${n}e commande est arrivée — merci !`;
      }
    }

    await sendToUsers(
      [after.userId],
      { title: buyerTitle, body: step.body(after, orderId) },
      { type: 'order_status', orderId, status: after.status, ...(link ? { link } : {}) },
      { timeSensitive: after.status === 'livre' }
    );

    // Nouveau : le vendeur n'était notifié d'une livraison confirmée que
    // si la transition passait par delivery/dashboard::markAsDelivered —
    // jamais si c'était l'admin ou le vendeur lui-même (bouton "Marquer
    // comme livrée") qui faisait la transition. Ici, ça couvre les 3 cas
    // uniformément, une seule fois.
    if (after.status === 'livre' && after.sellerId) {
      const itemsSummary = summarizeItems(after.items);
      const earned = after.total?.toLocaleString?.('fr-FR') ?? after.total;
      // 🏆 Étapes vendeur : 1re vente, 5e, 10e, 25e, 50e, 100e…
      let sellerTitle = `✅ Commande #${orderId.slice(0, 6)} livrée !`;
      const sellerCount = await countDeliveredOrders('sellerId', after.sellerId);
      if (sellerCount !== null && SELLER_MILESTONES.includes(sellerCount)) {
        sellerTitle = sellerCount === 1
          ? '🎉 Votre toute première vente est livrée !'
          : `🏆 ${sellerCount}e commande livrée — bravo !`;
      }
      await sendToUsers(
        [after.sellerId],
        {
          title: sellerTitle,
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
    if (await alreadyProcessed(event.id)) return;

    const image = Array.isArray(after.images) ? after.images[0] : undefined;

    if (afterStock <= 0 && beforeStock > 0) {
      await sendToUsers(
        [after.sellerId],
        {
          title: '⚠️ Rupture de stock !',
          body: `"${after.name}" est épuisé — pense à le réapprovisionner pour ne pas perdre de ventes 🌾`,
          ...(image ? { imageUrl: image } : {}),
        },
        { type: 'stock_out', productId: event.params.productId, link: '/seller/products', urgent: 'true' },
        { timeSensitive: true }
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
    if (await alreadyProcessed(event.id)) return;

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
    if (await alreadyProcessed(event.id)) return;

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

const QUIET_HOURS_START_UTC = 22; // valeur PAR DÉFAUT — 22h à Dakar == 22h UTC
const QUIET_HOURS_END_UTC = 7;    // (pas de DST, UTC+0 fixe). Voir resolveQuietHours
                                   // ci-dessous pour la version personnalisée par user.
const FREQUENCY_CAP_MS = 24 * 60 * 60 * 1000; // 1 push perso max / jour / utilisateur

type QuietHoursConfig = { startHour: number; endHour: number }; // heures UTC, 0-23
const DEFAULT_QUIET_HOURS: QuietHoursConfig = { startHour: QUIET_HOURS_START_UTC, endHour: QUIET_HOURS_END_UTC };

// FIX (affinage demandé) : la fenêtre de silence était auparavant une
// plage UNIQUE appliquée à tout le monde, alors que deux utilisateurs
// n'ont pas forcément le même rythme (travailleur de nuit, marché matinal
// très tôt...). Elle est désormais résolue PAR UTILISATEUR, avec deux
// niveaux :
//  1. Préférence explicite (userData.quietHours = {startHour, endHour},
//     écran de réglages côté client) — la source la plus fiable, aucune
//     inférence nécessaire, prioritaire.
//  2. Repli sur un historique d'activité observé
//     (userData.activityHistogram : tableau de 24 compteurs, un par heure
//     UTC, à incrémenter côté client à chaque ouverture d'app ou
//     interaction) — s'il existe, on en déduit la plage de 8h la moins
//     active. Ce champ n'est pas encore alimenté par le client actuel :
//     tant qu'il est absent, aucune régression, on retombe sur la valeur
//     par défaut ci-dessous. C'est un point d'extension prêt à l'emploi
//     dès qu'un événement d'activité sera tracké côté app.
//  3. Sinon, la plage par défaut (22h-7h UTC), identique à l'ancien
//     comportement global.
function inferQuietHoursFromHistogram(histogram: number[]): QuietHoursConfig {
  const WINDOW = 8; // durée d'une nuit type
  let bestStart = QUIET_HOURS_START_UTC;
  let bestSum = Infinity;
  for (let start = 0; start < 24; start++) {
    let sum = 0;
    for (let i = 0; i < WINDOW; i++) sum += histogram[(start + i) % 24] ?? 0;
    if (sum < bestSum) {
      bestSum = sum;
      bestStart = start;
    }
  }
  return { startHour: bestStart, endHour: (bestStart + WINDOW) % 24 };
}

function resolveQuietHours(userData: any): QuietHoursConfig {
  const explicit = userData?.quietHours;
  if (typeof explicit?.startHour === 'number' && typeof explicit?.endHour === 'number') {
    return { startHour: explicit.startHour, endHour: explicit.endHour };
  }
  const histogram: number[] | undefined = userData?.activityHistogram;
  if (Array.isArray(histogram) && histogram.length === 24 && histogram.some((v) => v > 0)) {
    return inferQuietHoursFromHistogram(histogram);
  }
  return DEFAULT_QUIET_HOURS;
}

function isQuietHoursNow(config: QuietHoursConfig): boolean {
  if (config.startHour === config.endHour) return false; // plage nulle = jamais de silence
  const h = new Date().getUTCHours();
  return config.startHour < config.endHour
    ? h >= config.startHour && h < config.endHour
    : h >= config.startHour || h < config.endHour; // plage qui traverse minuit (cas par défaut)
}

// true si CE user peut recevoir CETTE notification maintenant, compte tenu
// de son consentement (global + par catégorie), de sa région (si le
// produit en a une et lui aussi — on ne filtre PAS un utilisateur qui n'a
// simplement pas encore de région connue, dégradation gracieuse plutôt que
// silence total), et du cap de fréquence quotidien.
//
// Préférences par catégorie : lues dans
// userData.notificationPreferences.{category} — un utilisateur peut par
// exemple garder les alertes de restock mais couper le digest hebdo, sans
// tout désactiver via personalizedNotificationsEnabled. Écrit côté client
// (écran de préférences) ; absence de champ = opt-in par défaut (true),
// pour ne pas silencier une notification qu'aucun utilisateur n'a
// explicitement désactivée.
//
// Note : la fenêtre de silence n'est PAS vérifiée ici — elle dépend du
// moment de l'envoi, pas seulement du profil, donc elle est résolue par
// dispatchPersonalized (voir resolveQuietHours) plutôt que dans ce gate.
type PersonalizationCategory = 'restock' | 'digest' | 'price_drop' | 'reorder' | 'cart';
function passesPersonalizationGate(
  userData: any,
  category: PersonalizationCategory,
  productRegion?: string
): boolean {
  if (userData.personalizedNotificationsEnabled === false) return false;
  if (userData.notificationPreferences?.[category] === false) return false;
  if (productRegion && userData.region && userData.region !== productRegion) return false;
  const lastMs: number = userData.lastPersonalizedPushAt?.toMillis?.() ?? 0;
  if (Date.now() - lastMs < FREQUENCY_CAP_MS) return false;
  return true;
}

async function dispatchPersonalized(
  users: Array<{ id: string; data: any }>,
  notification: { title: string; body: string; imageUrl?: string },
  data: Record<string, string>
) {
  if (users.length === 0) return;

  // Répartit le groupe selon la fenêtre de silence PROPRE à chacun — deux
  // utilisateurs du même envoi peuvent donc atterrir dans des branches
  // différentes (l'un reçoit tout de suite, l'autre est mis en attente),
  // là où l'ancienne version décidait pour tout le groupe d'un coup.
  const toSendNow: string[] = [];
  const toQueue: string[] = [];
  for (const u of users) {
    if (isQuietHoursNow(resolveQuietHours(u.data))) toQueue.push(u.id);
    else toSendNow.push(u.id);
  }

  if (toQueue.length > 0) {
    // On ne perd pas la notification : elle est mise en attente et sera
    // envoyée par flushQueuedPersonalizedNotifications dès que la fenêtre
    // de silence de CHAQUE utilisateur concerné sera passée, plutôt que
    // d'être abandonnée ou envoyée en pleine nuit.
    await admin.firestore().collection('pendingPersonalizedNotifications').add({
      userIds: toQueue, notification, data, createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`🌙 Heures de silence — ${toQueue.length} notification(s) mise(s) en attente.`);
  }

  if (toSendNow.length === 0) return;

  await sendToUsers(toSendNow, notification, data);

  const now = admin.firestore.FieldValue.serverTimestamp();
  await setManyMerge(
    toSendNow.map((id) => ({ ref: admin.firestore().collection('users').doc(id), data: { lastPersonalizedPushAt: now } }))
  );
}

// FIX (cohérence avec les fenêtres de silence personnalisées) : cette
// purge tournait auparavant une fois par jour à 07h05 heure de Dakar — ce
// qui avait du sens tant que TOUT LE MONDE partageait la même fenêtre
// 22h-7h. Depuis que resolveQuietHours peut donner une fenêtre différente
// par utilisateur (préférence explicite ou, plus tard, activité observée),
// un seul horaire de purge quotidien ne convient plus : un utilisateur
// dont la fenêtre se termine à 10h attendrait inutilement jusqu'au
// lendemain 7h05. On repasse donc à une cadence plus fine (30 min) et on
// revérifie, par utilisateur, si SA fenêtre est bien terminée avant
// d'envoyer — ceux encore concernés sont réécrits dans la file pour le
// prochain passage plutôt que forcés dehors ou perdus.
export const flushQueuedPersonalizedNotifications = onSchedule(
  { schedule: 'every 30 minutes', region: 'us-central1', timeoutSeconds: 300 },
  async () => {
    const snap = await admin.firestore().collection('pendingPersonalizedNotifications').limit(200).get();
    if (snap.empty) return;

    let sentGroups = 0;
    for (const docSnap of snap.docs) {
      const { userIds, notification, data } = docSnap.data() as { userIds: string[]; notification: any; data: any };
      if (!Array.isArray(userIds) || userIds.length === 0) {
        await docSnap.ref.delete();
        continue;
      }

      const userSnaps = await admin.firestore().getAll(
        ...userIds.map((id) => admin.firestore().collection('users').doc(id))
      );

      const readyIds: string[] = [];
      const stillQuietIds: string[] = [];
      userSnaps.forEach((s, idx) => {
        const uData = s.exists ? s.data() : {};
        (isQuietHoursNow(resolveQuietHours(uData)) ? stillQuietIds : readyIds).push(userIds[idx]);
      });

      if (readyIds.length > 0) {
        await sendToUsers(readyIds, notification, data);
        const now = admin.firestore.FieldValue.serverTimestamp();
        await setManyMerge(
          readyIds.map((id) => ({ ref: admin.firestore().collection('users').doc(id), data: { lastPersonalizedPushAt: now } }))
        );
        sentGroups++;
      }

      if (stillQuietIds.length > 0) {
        await docSnap.ref.update({ userIds: stillQuietIds });
      } else {
        await docSnap.ref.delete();
      }
    }
    console.log(`🌅 Purge file d'attente : ${sentGroups} groupe(s) envoyé(s) (sur ${snap.size} lot(s) examiné(s)).`);
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
    if (await alreadyProcessed(event.id)) return;

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
    const eligibleUsers = candidateSnaps
      .filter((s) => s.exists && passesPersonalizationGate(s.data(), 'restock', after.region))
      .map((s) => ({ id: s.id, data: s.data() }));
    if (eligibleUsers.length === 0) return;

    const image = Array.isArray(after.images) ? after.images[0] : undefined;
    const priceLabel = typeof after.price === 'number'
      ? `${after.price.toLocaleString('fr-FR')} FCFA/${after.unit ?? 'unité'}`
      : undefined;

    await dispatchPersonalized(
      eligibleUsers,
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

    console.log(`🌾 Restock match : ${eligibleUsers.length}/${matchedUserIds.size} utilisateur(s) éligible(s) pour "${after.name}"`);
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
      if (!passesPersonalizationGate(userData, 'digest')) continue;

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

      // FIX variété : auparavant, `best` était systématiquement le premier
      // match — un utilisateur avec un seul intérêt dominant (ex: "oignon"
      // recherché chaque semaine) recevait donc le même produit-phare
      // digest après digest, ce qui use vite l'effet "vous attend". On
      // évite maintenant de remontrer un produit déjà utilisé comme
      // illustration récemment (mémorisé dans userData.lastDigestProductIds,
      // les ~8 derniers = ~2 mois d'historique) — et on ne retombe sur du
      // déjà-vu que si vraiment aucune alternative n'existe (mieux qu'un
      // digest vide).
      const recentIds: string[] = userData.lastDigestProductIds || [];
      const fresh = inStock.filter((p) => !recentIds.includes(p.id));
      const pool = fresh.length > 0 ? fresh : inStock;

      // Le produit qui correspond au mot-clé le plus fréquent de
      // l'utilisateur, parmi ceux pas encore montrés récemment, passe en
      // premier — c'est celui qui illustre le push (titre + image), même
      // si d'autres matches existent.
      const best = pool[0];
      const image = Array.isArray(best.images) ? best.images[0] : undefined;
      const extraCount = inStock.length - 1;

      await dispatchPersonalized(
        [{ id: userDoc.id, data: userData }],
        {
          title: `🛒 ${best.name} vous attend`,
          body: extraCount > 0
            ? `Disponible maintenant, et ${extraCount} autre${extraCount > 1 ? 's' : ''} produit${extraCount > 1 ? 's' : ''} qui pourraient vous plaire.`
            : `Disponible maintenant, d'après vos recherches récentes.`,
          imageUrl: image,
        },
        { type: 'weekly_digest', link: '/main/products' }
      );

      // Historique glissant borné à 8 entrées : suffisant pour éviter la
      // répétition à court terme sans empêcher indéfiniment un produit
      // toujours pertinent de revenir après quelques semaines d'absence.
      const updatedHistory = [best.id, ...recentIds.filter((id) => id !== best.id)].slice(0, 8);
      await userDoc.ref.set({ lastDigestProductIds: updatedHistory }, { merge: true });
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

// ============================================================
//   ENGAGEMENT — des notifications qui donnent envie de revenir
// ============================================================
// Règle d'or : chaque notification apporte une VRAIE info utile (prix qui
// baisse réellement, rappel basé sur les habitudes d'achat, bilan chiffré
// du vendeur). Aucune fausse urgence. Tout ce qui est « marketing » passe
// par passesPersonalizationGate + dispatchPersonalized : consentement,
// préférence par catégorie, 1 push perso max par jour, heures de silence.
// C'est ce qui fait revenir sans faire désinstaller l'app.

const DAY_MS = 24 * 60 * 60 * 1000;

function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}

function productKeywordsOf(product: any): string[] {
  return product?.searchKeywords?.length
    ? product.searchKeywords
    : [...new Set([...extractKeywords(product?.name || ''), ...extractKeywords(product?.category || '')])];
}

function productSellerLabel(product: any): string {
  return product?.sellerName || product?.farmer || '';
}

// Utilisateurs dont les intérêts (recherches, produits consultés)
// correspondent à ces mots-clés — même source que notifyRestockMatch.
async function findInterestedUsers(keywords: string[], excludeIds: string[] = []): Promise<Array<{ id: string; data: any }>> {
  const ids = new Set<string>();
  for (const kw of keywords.slice(0, 10)) {
    const snap = await admin.firestore()
      .collection('users')
      .where('interestKeywords', 'array-contains', kw)
      .limit(500)
      .get();
    snap.docs.forEach((d) => ids.add(d.id));
  }
  excludeIds.forEach((id) => ids.delete(id));
  if (ids.size === 0) return [];

  const users: Array<{ id: string; data: any }> = [];
  for (const part of chunk([...ids], 300)) {
    const snaps = await admin.firestore().getAll(...part.map((id) => admin.firestore().collection('users').doc(id)));
    snaps.forEach((s) => { if (s.exists) users.push({ id: s.id, data: s.data() }); });
  }
  return users;
}

// ── 📉 Baisse de prix ────────────────────────────────────────────────
// Un vendeur baisse son prix d'au moins 10 % → les clients intéressés
// par ce produit sont prévenus. Si le stock est réellement bas, on le
// dit (vraie rareté, jamais inventée).
const PRICE_DROP_MIN_PCT = 10;

export const notifyPriceDrop = functions.firestore.onDocumentUpdated(
  { document: 'products/{productId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;

    const oldPrice = Number(before.price);
    const newPrice = Number(after.price);
    if (!(oldPrice > 0) || !(newPrice > 0) || newPrice >= oldPrice) return;
    const pct = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
    if (pct < PRICE_DROP_MIN_PCT) return;
    if (typeof after.stock === 'number' && after.stock <= 0) return; // rupture : notifyRestockMatch prendra le relais

    const lastMs: number = after.lastPriceDropNotifiedAt?.toMillis?.() ?? 0;
    if (Date.now() - lastMs < DAY_MS) return; // 1 alerte max / jour / produit
    if (await alreadyProcessed(event.id)) return;

    // Posé AVANT l'envoi : même si l'envoi échoue, pas de rafale si le
    // vendeur ajuste son prix plusieurs fois de suite.
    await event.data!.after.ref.update({ lastPriceDropNotifiedAt: admin.firestore.FieldValue.serverTimestamp() });

    const productId = event.params.productId;
    const candidates = await findInterestedUsers(productKeywordsOf(after), [after.sellerId].filter(Boolean));
    const eligible = candidates.filter((u) => passesPersonalizationGate(u.data, 'price_drop', after.region));
    if (eligible.length === 0) return;

    const unit = after.unit ?? 'unité';
    const seller = productSellerLabel(after);
    const scarcity = typeof after.stock === 'number' && after.stock <= 10
      ? ` Plus que ${after.stock} ${unit} en stock.`
      : '';

    await dispatchPersonalized(
      eligible,
      {
        title: `📉 ${after.name} : -${pct}% !`,
        body: `${formatFcfa(oldPrice)} → ${formatFcfa(newPrice)}/${unit}${seller ? ` chez ${seller}` : ''}.${scarcity}`,
        imageUrl: Array.isArray(after.images) ? after.images[0] : undefined,
      },
      { type: 'price_drop', productId, link: `/product?id=${productId}` }
    );

    console.log(`📉 Baisse de prix -${pct}% sur "${after.name}" : ${eligible.length}/${candidates.length} client(s) prévenu(s).`);
  }
);

// ── 🛒 Réachat intelligent ───────────────────────────────────────────
// Chaque matin, on regarde ce que chaque client achète régulièrement.
// Quelqu'un qui prend du riz tous les 12 jours reçoit, vers le 11e jour,
// un rappel pour le recommander en 2 clics. Un seul produit par client,
// jamais deux fois pour le même achat.
const REORDER_LOOKBACK_DAYS = 120;
const REORDER_DEFAULT_CYCLE_DAYS = 10; // un seul achat connu

type PurchaseHistory = { times: number[] };

export const smartReorderReminder = onSchedule(
  { schedule: 'every day 10:00', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 540 },
  async () => {
    const now = Date.now();
    const cutoff = admin.firestore.Timestamp.fromMillis(now - REORDER_LOOKBACK_DAYS * DAY_MS);
    // Filtre sur un seul champ (createdAt) : aucun index composite requis.
    const ordersSnap = await admin.firestore().collection('orders').where('createdAt', '>=', cutoff).get();

    // userId → productId → dates d'achat
    const history = new Map<string, Map<string, PurchaseHistory>>();
    ordersSnap.docs.forEach((d) => {
      const o = d.data() as any;
      if (o.status !== 'livre' || !o.userId || !Array.isArray(o.items)) return;
      const t = o.createdAt?.toMillis?.();
      if (typeof t !== 'number') return;
      const perUser = history.get(o.userId) ?? new Map<string, PurchaseHistory>();
      for (const it of o.items) {
        if (!it?.productId || it.productId === 'unknown') continue;
        const h = perUser.get(it.productId) ?? { times: [] };
        h.times.push(t);
        perUser.set(it.productId, h);
      }
      history.set(o.userId, perUser);
    });

    // Pour chaque client : le produit le plus « dû » aujourd'hui.
    const picks = new Map<string, { productId: string; cycleDays: number; purchases: number; lastAt: number }>();
    history.forEach((perUser, userId) => {
      let best: { productId: string; cycleDays: number; purchases: number; lastAt: number; ratio: number } | null = null;
      perUser.forEach((h, productId) => {
        const times = [...new Set(h.times)].sort((a, b) => a - b);
        const lastAt = times[times.length - 1];
        const cycleDays = times.length >= 2
          ? Math.min(60, Math.max(3, (lastAt - times[0]) / (times.length - 1) / DAY_MS))
          : REORDER_DEFAULT_CYCLE_DAYS;
        const ratio = (now - lastAt) / DAY_MS / cycleDays;
        if (ratio < 0.9 || ratio > 3) return; // pas encore l'heure, ou habitude perdue
        if (!best || ratio > best.ratio) best = { productId, cycleDays, purchases: times.length, lastAt, ratio };
      });
      if (best) picks.set(userId, best);
    });
    if (picks.size === 0) {
      console.log('🛒 Réachat : aucun client à relancer aujourd\'hui.');
      return;
    }

    const userIds = [...picks.keys()];
    const productIds = [...new Set([...picks.values()].map((p) => p.productId))];
    const userDocs = new Map<string, any>();
    for (const part of chunk(userIds, 300)) {
      const snaps = await admin.firestore().getAll(...part.map((id) => admin.firestore().collection('users').doc(id)));
      snaps.forEach((s) => { if (s.exists) userDocs.set(s.id, s.data()); });
    }
    const products = new Map<string, any>();
    for (const part of chunk(productIds, 300)) {
      const snaps = await admin.firestore().getAll(...part.map((id) => admin.firestore().collection('products').doc(id)));
      snaps.forEach((s) => { if (s.exists) products.set(s.id, s.data()); });
    }

    let sent = 0;
    for (const [userId, pick] of picks) {
      const userData = userDocs.get(userId);
      const product = products.get(pick.productId);
      if (!userData || !product) continue;
      if (typeof product.stock === 'number' && product.stock <= 0) continue;
      const remindedAt: number = userData.reorderRemindedAt?.[pick.productId]?.toMillis?.() ?? 0;
      if (remindedAt > pick.lastAt) continue; // déjà relancé pour cet achat
      if (!passesPersonalizationGate(userData, 'reorder', product.region)) continue;

      const seller = productSellerLabel(product);
      const unit = product.unit ?? 'unité';
      const notification = pick.purchases >= 2
        ? {
            title: `🛒 Bientôt à court de ${product.name} ?`,
            body: `Vous en reprenez environ tous les ${Math.round(pick.cycleDays)} jours. Recommandez en 2 clics${seller ? ` chez ${seller}` : ''}.`,
          }
        : {
            title: `😋 Envie de reprendre du ${product.name} ?`,
            body: typeof product.price === 'number'
              ? `Toujours disponible${seller ? ` chez ${seller}` : ''} — ${formatFcfa(product.price)}/${unit}.`
              : `Toujours disponible${seller ? ` chez ${seller}` : ''}.`,
          };

      await dispatchPersonalized(
        [{ id: userId, data: userData }],
        { ...notification, imageUrl: Array.isArray(product.images) ? product.images[0] : undefined },
        { type: 'smart_reorder', productId: pick.productId, link: `/product?id=${pick.productId}` }
      );
      await admin.firestore().collection('users').doc(userId).set(
        { reorderRemindedAt: { [pick.productId]: admin.firestore.FieldValue.serverTimestamp() } },
        { merge: true }
      );
      sent++;
    }
    console.log(`🛒 Réachat : ${sent} rappel(s) envoyé(s) sur ${picks.size} client(s) candidat(s).`);
  }
);


// ── 🧺 Panier en attente ─────────────────────────────────────────────
// Le panier est enregistré dans carts/{uid} (hooks/useCart.tsx), avec
// `updatedAt` à chaque modification. Deux relances maximum par panier :
//  1. après 3 h sans modification : rappel simple du panier ;
//  2. après 24 h : SEULEMENT s'il y a une vraie raison (un prix a baissé
//     depuis l'ajout, ou un produit est presque épuisé). Sinon, silence.
// Toute modification du panier remet le compteur à zéro. Rien n'est envoyé
// si le client a commandé entre-temps, ou si tout est en rupture.
const CART_FIRST_REMINDER_MS = 3 * 60 * 60 * 1000;
const CART_SECOND_REMINDER_MS = 24 * 60 * 60 * 1000;
const CART_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const CART_LOW_STOCK = 5;

export const abandonedCartReminder = onSchedule(
  { schedule: 'every 60 minutes', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 },
  async () => {
    const now = Date.now();
    const cartsSnap = await admin.firestore()
      .collection('carts')
      .where('updatedAt', '<=', admin.firestore.Timestamp.fromMillis(now - CART_FIRST_REMINDER_MS))
      .where('updatedAt', '>=', admin.firestore.Timestamp.fromMillis(now - CART_MAX_AGE_MS))
      .get();

    let sent = 0;
    for (const cartDoc of cartsSnap.docs) {
      const cart = cartDoc.data() as any;
      const userId = cartDoc.id;
      const items: any[] = Array.isArray(cart.items)
        ? cart.items.filter((it: any) => it?.product?.id && Number(it?.quantity) > 0)
        : [];
      if (items.length === 0) continue;

      const updatedAtMs: number = cart.updatedAt?.toMillis?.() ?? 0;
      const age = now - updatedAtMs;
      const sameCart = cart.reminderForUpdatedAt === updatedAtMs;
      const stageDone: number = sameCart ? Number(cart.reminderStage) || 0 : 0;
      const stage = stageDone === 0 ? 1 : stageDone === 1 && age >= CART_SECOND_REMINDER_MS ? 2 : 0;
      if (stage === 0) continue;

      // Commande passée depuis la dernière modification du panier → rien.
      const ordersSnap = await admin.firestore().collection('orders').where('userId', '==', userId).select('createdAt').get();
      const orderedSince = ordersSnap.docs.some((o) => ((o.data() as any).createdAt?.toMillis?.() ?? 0) >= updatedAtMs);
      if (orderedSince) continue;

      const userSnap = await admin.firestore().collection('users').doc(userId).get();
      if (!userSnap.exists) continue;
      const userData = userSnap.data() as any;
      if (!passesPersonalizationGate(userData, 'cart')) continue;

      // Prix et stocks ACTUELS (ceux du panier datent de l'ajout).
      const productSnaps = await admin.firestore().getAll(
        ...items.slice(0, 30).map((it) => admin.firestore().collection('products').doc(String(it.product.id)))
      );
      const current = new Map<string, any>();
      productSnaps.forEach((ps) => { if (ps.exists) current.set(ps.id, ps.data()); });

      const available = items.filter((it) => {
        const p = current.get(String(it.product.id));
        return p && !(typeof p.stock === 'number' && p.stock <= 0);
      });
      if (available.length === 0) continue;

      const total = available.reduce((sum, it) => {
        const price = Number(current.get(String(it.product.id))?.price ?? it.product.price) || 0;
        return sum + price * Number(it.quantity);
      }, 0);
      const count = available.reduce((sum, it) => sum + Number(it.quantity), 0);
      const first = current.get(String(available[0].product.id));
      const firstName = first?.name || available[0].product.name || 'vos produits';
      const image = Array.isArray(first?.images) ? first.images[0] : available[0].product.images?.[0];

      let notification: { title: string; body: string; imageUrl?: string } | null = null;
      if (stage === 1) {
        notification = {
          title: available.length === 1 ? `🧺 Votre ${firstName} vous attend` : '🧺 Votre panier vous attend',
          body: `${count} article${count > 1 ? 's' : ''} pour ${formatFcfa(total)}. Finalisez votre commande en 1 minute.`,
          imageUrl: image,
        };
      } else {
        const dropped = available.find((it) => {
          const nowPrice = Number(current.get(String(it.product.id))?.price);
          return nowPrice > 0 && nowPrice < Number(it.product.price);
        });
        const scarce = available.find((it) => {
          const st = current.get(String(it.product.id))?.stock;
          return typeof st === 'number' && st <= CART_LOW_STOCK;
        });
        if (dropped) {
          const p = current.get(String(dropped.product.id));
          notification = {
            title: `📉 Bonne nouvelle pour votre panier`,
            body: `${p.name} est passé de ${formatFcfa(Number(dropped.product.price))} à ${formatFcfa(Number(p.price))}. Votre panier est toujours prêt.`,
            imageUrl: Array.isArray(p.images) ? p.images[0] : image,
          };
        } else if (scarce) {
          const p = current.get(String(scarce.product.id));
          notification = {
            title: `⏳ ${p.name} bientôt épuisé`,
            body: `Plus que ${p.stock} ${p.unit ?? 'unité'} en stock. Il est encore dans votre panier.`,
            imageUrl: Array.isArray(p.images) ? p.images[0] : image,
          };
        }
      }

      // Étape marquée même sans envoi (étape 2 sans raison valable) :
      // le panier ne sera plus examiné tant qu'il n'est pas modifié.
      await cartDoc.ref.set({ reminderStage: stage, reminderForUpdatedAt: updatedAtMs }, { merge: true });
      if (!notification) continue;

      await dispatchPersonalized(
        [{ id: userId, data: userData }],
        notification,
        { type: 'abandoned_cart', stage: String(stage), link: '/cart' }
      );
      sent++;
    }
    console.log(`🧺 Paniers en attente : ${sent} relance(s) sur ${cartsSnap.size} panier(s) examiné(s).`);
  }
);

// ── 📊 Bilan du soir pour les vendeurs ───────────────────────────────
// Tous les soirs à 20h : « 5 commandes aujourd'hui pour 42 000 FCFA 📈 ».
// Uniquement les vendeurs qui ont vendu dans la journée (pas de « 0
// commande » décourageant). Désactivable : notificationPreferences.seller_recap = false.
export const sellerDailyRecap = onSchedule(
  { schedule: 'every day 20:00', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 },
  async () => {
    const nowDate = new Date();
    // Dakar = UTC+0 toute l'année : minuit UTC == minuit à Dakar.
    const startToday = Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate());
    const startYesterday = startToday - DAY_MS;

    const snap = await admin.firestore()
      .collection('orders')
      .where('createdAt', '>=', admin.firestore.Timestamp.fromMillis(startYesterday))
      .get();

    const stats = new Map<string, { today: number; revenue: number; yesterday: number }>();
    snap.docs.forEach((d) => {
      const o = d.data() as any;
      if (!o.sellerId || o.status === 'annule') return;
      const t = o.createdAt?.toMillis?.();
      if (typeof t !== 'number') return;
      const s = stats.get(o.sellerId) ?? { today: 0, revenue: 0, yesterday: 0 };
      if (t >= startToday) {
        s.today++;
        s.revenue += Number(o.total) || 0;
      } else {
        s.yesterday++;
      }
      stats.set(o.sellerId, s);
    });

    const sellerIds = [...stats.entries()].filter(([, s]) => s.today > 0).map(([id]) => id);
    if (sellerIds.length === 0) return;

    const sellerDocs = new Map<string, any>();
    for (const part of chunk(sellerIds, 300)) {
      const snaps = await admin.firestore().getAll(...part.map((id) => admin.firestore().collection('users').doc(id)));
      snaps.forEach((s) => { if (s.exists) sellerDocs.set(s.id, s.data()); });
    }

    let sent = 0;
    for (const sellerId of sellerIds) {
      const data = sellerDocs.get(sellerId);
      if (!data || data.notificationPreferences?.seller_recap === false) continue;
      const s = stats.get(sellerId)!;
      const diff = s.today - s.yesterday;
      const trend = diff > 0 && s.yesterday > 0 ? ` 📈 +${diff} par rapport à hier.` : '';
      const plural = s.today > 1 ? 's' : '';
      await sendToUsers(
        [sellerId],
        {
          title: s.today >= 5 ? `🔥 Grosse journée : ${s.today} commandes !` : '📊 Votre journée sur Sunu Mëñëf',
          body: `${s.today} commande${plural} aujourd'hui pour ${formatFcfa(s.revenue)}.${trend} ${randomSticker(SELLER_STICKERS)}`,
        },
        { type: 'seller_daily_recap', link: '/seller/dashboard' }
      );
      sent++;
    }
    console.log(`📊 Bilan du soir envoyé à ${sent} vendeur(s).`);
  }
);

// ── Synchronisation du point de retrait vendeur ─────────────────────────
// Quand un vendeur enregistre un nouveau point de retrait (users/{uid}.lat/
// lng), on le recopie :
//  - sur TOUS ses produits (distance « près de chez vous », frais et délai
//    au checkout, qui lisent le document produit) — avant, un produit gardait
//    à vie la position du jour de sa création ;
//  - sur ses commandes pas encore récupérées par un livreur (en attente /
//    en préparation, ou attribuées mais pas encore « en route »), pour que le
//    livreur n'aille pas à l'ancienne adresse. Les commandes déjà en route ou
//    livrées gardent leur historique.
const GEOHASH_BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
function encodeGeohash(lat: number, lng: number, precision = 10): string {
  let idx = 0, bit = 0, evenBit = true, hash = '';
  let latMin = -90, latMax = 90, lngMin = -180, lngMax = 180;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) { idx = idx * 2 + 1; lngMin = mid; } else { idx = idx * 2; lngMax = mid; }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) { idx = idx * 2 + 1; latMin = mid; } else { idx = idx * 2; latMax = mid; }
    }
    evenBit = !evenBit;
    if (++bit === 5) { hash += GEOHASH_BASE32.charAt(idx); bit = 0; idx = 0; }
  }
  return hash;
}

export const syncSellerLocation = functions.firestore.onDocumentUpdated(
  { document: 'users/{userId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before.data() as any;
    const after = event.data?.after.data() as any;
    if (!before || !after) return;
    if (after.role !== 'seller') return;
    if (!isValidCoordinate({ lat: after.lat, lng: after.lng })) return;
    if (before.lat === after.lat && before.lng === after.lng && before.locationAddress === after.locationAddress) return;
    if (after.locationSource === 'GPS_LIVE') return; // position en direct (livreur), pas un point de retrait
    if (await alreadyProcessed(event.id)) return;

    const sellerId = event.params.userId;
    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const address = typeof after.locationAddress === 'string' && after.locationAddress
      ? after.locationAddress
      : `${after.lat.toFixed(5)}, ${after.lng.toFixed(5)}`;
    const source = after.locationSource || 'GPS';
    const accuracy = typeof after.locationAccuracy === 'number' ? after.locationAccuracy : null;

    const productsSnap = await db.collection('products').where('sellerId', '==', sellerId).get();
    const productWrites = productsSnap.docs.map((d) => ({
      ref: d.ref,
      data: {
        lat: after.lat,
        lng: after.lng,
        geohash: encodeGeohash(after.lat, after.lng),
        locationAddress: address,
        locationSource: source,
        locationAccuracy: accuracy,
        locationUpdatedAt: now,
      },
    }));

    const ordersSnap = await db.collection('orders').where('sellerId', '==', sellerId).get();
    const openOrders = ordersSnap.docs.filter((d) => {
      const o = d.data() as any;
      const phase = o.tracking?.phase;
      return ['en_attente', 'en_preparation', 'en_livraison'].includes(o.status)
        && (!phase || phase === 'assigned');
    });
    const sellerLocation = { lat: after.lat, lng: after.lng, address, isDefault: false, locationSource: source, ...(accuracy !== null ? { accuracy } : {}), locationUpdatedAt: now };
    const orderWrites: Array<{ ref: FirebaseFirestore.DocumentReference; data: any }> = [];
    for (const d of openOrders) {
      orderWrites.push({ ref: d.ref, data: { sellerLocation } });
      const mirror = db.collection('seller_orders').doc(d.id);
      const mirrorSnap = await mirror.get();
      if (mirrorSnap.exists) orderWrites.push({ ref: mirror, data: { sellerLocation } });
    }

    await setManyMerge([...productWrites, ...orderWrites]);
    console.log(`📍 Point de retrait de ${sellerId} recopié sur ${productWrites.length} produit(s) et ${openOrders.length} commande(s) en cours.`);
  }
);

const SEUIL_PROCHE_METRES = 500;
// Au-delà de cette imprécision GPS, une lecture ne suffit plus à
// conclure une proximité : mieux vaut attendre le point suivant (plus
// précis) que de déclencher "votre livreur arrive !" alors qu'il pourrait
// en réalité être à plusieurs centaines de mètres. Le filtrage de qualité
// GPS déjà en place côté client (delivery/dashboard/page.tsx,
// MIN_ACCEPTABLE_ACCURACY_M = 150) fait qu'une valeur au-delà de ce seuil
// ne devrait plus vraiment atteindre Firestore — cette vérification est
// une seconde ligne de défense, pas une redite : le serveur ne doit
// jamais faire une confiance aveugle à ce que le client a écrit.
const MAX_TRUSTED_ACCURACY_M = 300;

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// ⚠️ `!point.lat` rejette à tort une coordonnée valide de 0 (le classique
// "falsy zero" bug) — sans conséquence pratique au Sénégal (jamais proche
// de l'équateur/méridien 0), mais c'est le genre de vérification qui doit
// être correcte par construction, pas "correcte parce que la zone
// géographique actuelle l'arrange". Reprend la même logique que
// isValidCoordinate côté client (lib/geo/distance.ts) pour que les deux
// bouts du pipeline appliquent exactement la même définition d'une
// coordonnée valide.
function isValidCoordinate(point: any): point is { lat: number; lng: number } {
  return (
    !!point &&
    typeof point.lat === 'number' && Number.isFinite(point.lat) &&
    typeof point.lng === 'number' && Number.isFinite(point.lng) &&
    Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
  );
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
    if (!isValidCoordinate(afterLoc)) return;

    // Ne fait progresser que depuis 'en_route' — si la phase est déjà
    // 'approaching'/'arrived', ou pas encore 'assigned', rien à faire ici.
    if (after.tracking?.phase !== 'en_route') return;

    const dest = after.customerLocation;
    if (!isValidCoordinate(dest)) return;
    // Adresse client non confirmée (ancien repli Dakar/IP) ou imprécise : ne
    // jamais annoncer « votre livreur arrive » sur la base d'un point faux.
    const destInfo = after.customerLocation as { isDefault?: boolean; accuracy?: number };
    if (destInfo.isDefault === true) return;
    if (typeof destInfo.accuracy === 'number' && destInfo.accuracy > MAX_TRUSTED_ACCURACY_M) return;

    // Seconde ligne de défense (voir MAX_TRUSTED_ACCURACY_M ci-dessus) :
    // un point GPS de mauvaise qualité ne doit jamais, à lui seul,
    // déclencher la notification "votre livreur arrive !". On ne bloque
    // pas la progression pour autant — on attend simplement un point plus
    // fiable, qui arrivera dans les secondes suivantes.
    const accuracy = after.tracking?.accuracy;
    if (typeof accuracy === 'number' && accuracy > MAX_TRUSTED_ACCURACY_M) {
      console.log(`📍 Point GPS trop imprécis pour conclure une proximité (±${Math.round(accuracy)}m) — commande ${event.params.orderId}, en attente d'un meilleur fixe.`);
      return;
    }

    const distance = haversineMeters(afterLoc, dest);
    if (distance > SEUIL_PROCHE_METRES) return;

    await event.data!.after.ref.update({ 'tracking.phase': 'approaching' });
    console.log(`📍 Proximité détectée (${Math.round(distance)}m, ±${accuracy ?? '?'}m) — commande ${event.params.orderId} → approaching`);
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
    // FIX : utilise désormais step.timestampField (la source de vérité
    // déclarée dans PHASE_NOTIFICATIONS) plutôt qu'une reconstruction en
    // dur `tracking.${afterPhase}At` — les deux coïncidaient par hasard,
    // mais une clé calculée séparément de sa déclaration peut diverger
    // silencieusement si une phase est un jour renommée. Pour la phase
    // 'assigned' (sans entrée dans PHASE_NOTIFICATIONS), on retombe sur la
    // même convention `tracking.assignedAt`.
    const step = PHASE_NOTIFICATIONS[afterPhase];
    const timestampField = step?.timestampField ?? `${afterPhase}At`;
    await event.data!.after.ref.update({
      [`tracking.${timestampField}`]: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!step || !after.userId) return;
    if (await alreadyProcessed(event.id)) return;

    // TTL court : "votre livreur arrive" n'a aucun sens reçu 2h plus tard
    // parce que l'appareil était hors-ligne (TTL par défaut FCM : 4
    // semaines). 15 min de marge suffisent largement pour ce type d'étape.
    await sendToUsers(
      [after.userId],
      { title: step.title, body: step.body(after) },
      { type: 'delivery_phase', orderId: event.params.orderId, phase: afterPhase, link: `/tracking?id=${event.params.orderId}` },
      { timeSensitive: afterPhase === 'arrived', ttlSeconds: 15 * 60 }
    );
  }
);

// ── Purge du registre d'idempotence ────────────────────────────────────────
// _processedNotificationEvents ne sert qu'à détecter les redéclenchements
// Eventarc à court terme (quelques minutes/heures maximum en pratique) — au
// bout de 3 jours, un doc n'a plus aucune utilité et ne fait que gonfler la
// collection indéfiniment. Purge quotidienne par lots de 400 (marge sous la
// limite de 500 écritures par batch Firestore).
export const cleanupProcessedEvents = onSchedule(
  { schedule: 'every day 04:00', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 },
  async () => {
    const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const snap = await admin.firestore()
      .collection('_processedNotificationEvents')
      .where('processedAt', '<', cutoff)
      .limit(400)
      .get();

    if (snap.empty) return;

    const batch = admin.firestore().batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    console.log(`🧹 ${snap.size} entrée(s) d'idempotence purgée(s).`);
  }
);

// Purge quotidienne des compteurs anti-abus d'inscription
// (rateLimits/*) — même logique que ci-dessus, collection distincte.
export const cleanupRegistrationRateLimits = onSchedule(
  { schedule: 'every day 04:15', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 },
  async () => {
    const purged = await purgeOldRateLimitDocs(3 * 24 * 60 * 60 * 1000);
    if (purged > 0) console.log(`🧹 ${purged} entrée(s) de rate-limiting d'inscription purgée(s).`);
  }
);

// ⚠️ AJOUT (revue de code) : registrationSessions, phoneIndex (réservations
// abandonnées) et les fenêtres anti-fraude (_fraudIpWindow/_fraudTokenWindow)
// n'avaient jusqu'ici AUCUN nettoyage — seuls rateLimits et
// _processedNotificationEvents étaient purgés. Ces trois collections
// grossissaient donc indéfiniment. Un seul job planifié couvre les trois,
// par lots de 400 comme les jobs existants (marge sous la limite de 500
// écritures par batch Firestore) ; rétention de 7 jours pour les sessions
// (l'historique nominatif utile reste dans registrationAuditLog, jamais
// purgé), 3 jours pour les réservations abandonnées et les fenêtres
// anti-fraude (cohérent avec cleanupRegistrationRateLimits ci-dessus).
// Couvre aussi loginOtpSessions et passwordResetSessions (même rétention
// de 3 jours, mêmes raisons que les fenêtres anti-fraude) — absents du
// commentaire d'origine mais bien purgés ci-dessous (⚠️ correctif apporté
// ici au passage : le Promise.all d'origine ne déstructurait que 3
// résultats sur 5, les compteurs purgés de loginOtpSessions/
// passwordResetSessions n'étaient donc jamais journalisés, alors que la
// purge elle-même s'exécutait bien).
export const cleanupRegistrationLeftovers = onSchedule(
  { schedule: 'every day 04:30', region: 'us-central1', timeZone: 'Africa/Dakar', timeoutSeconds: 300 },
  async () => {
    const [sessions, reservations, fraudWindows, loginOtpSessions, passwordResetSessions] = await Promise.all([
      purgeOldRegistrationSessions(7 * 24 * 60 * 60 * 1000),
      purgeExpiredPhoneReservations(3 * 24 * 60 * 60 * 1000),
      purgeOldFraudWindows(3 * 24 * 60 * 60 * 1000),
      purgeOldLoginOtpSessions(3 * 24 * 60 * 60 * 1000),
      purgeOldPasswordResetSessions(3 * 24 * 60 * 60 * 1000),
    ]);
    if (sessions > 0) console.log(`🧹 ${sessions} session(s) d'inscription terminée(s) purgée(s).`);
    if (reservations > 0) console.log(`🧹 ${reservations} réservation(s) de numéro abandonnée(s) purgée(s).`);
    if (fraudWindows.ip + fraudWindows.token > 0) {
      console.log(`🧹 ${fraudWindows.ip} fenêtre(s) IP + ${fraudWindows.token} fenêtre(s) token anti-fraude purgée(s).`);
    }
    if (loginOtpSessions > 0) console.log(`🧹 ${loginOtpSessions} session(s) OTP de connexion purgée(s).`);
    if (passwordResetSessions > 0) console.log(`🧹 ${passwordResetSessions} session(s) de réinitialisation purgée(s).`);
  }
);