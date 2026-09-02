// src/app/api/system/periodic-checks/route.ts
//
// 🔔 Relances "commandes en attente" + "clients inactifs" — SANS cron
// ──────────────────────────────────────────────────────────────────
// Ces deux règles sont fondamentalement liées au TEMPS QUI PASSE (une
// commande devient "en retard" même si personne n'écrit rien) : contrairement
// à l'alerte stock bas (voir /api/products/check-stock), impossible de les
// déclencher sur un événement métier précis. Pas de planificateur dédié
// pour autant (pas de Vercel Cron, pas de GitHub Actions) : cette route
// est appelée en fire-and-forget par le trafic organique de l'app —
// checkout/page.tsx à chaque commande, et admin/page.tsx à chaque
// ouverture du tableau de bord. Tant que l'app a de l'activité (achats OU
// visites admin), les vérifications tournent ; sur une période totalement
// silencieuse, rien ne se déclenche jusqu'au prochain événement — c'est
// le compromis assumé pour éviter toute infrastructure de planification.
//
// Auto-throttlée via settings/periodicChecksLock.lastRunAt : n'exécute le
// scan complet que si `minIntervalMinutes` se sont écoulées depuis la
// dernière exécution, donc sans danger à l'appeler à chaque commande/
// chargement admin — la plupart des appels seront des no-op quasi
// gratuits (une seule lecture Firestore).
//
// Variables d'environnement requises :
//   FIREBASE_SERVICE_ACCOUNT_JSON

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json || json.trim() === '') throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

function extractToken(docSnap: FirebaseFirestore.QueryDocumentSnapshot): string | null {
  const fieldToken = docSnap.data()?.token;
  if (typeof fieldToken === 'string' && fieldToken.length > 50) return fieldToken;
  if (docSnap.id && docSnap.id.length > 50) return docSnap.id;
  return null;
}

async function pushToUser(db: FirebaseFirestore.Firestore, app: ReturnType<typeof getAdminApp>, userId: string, title: string, body: string, deepLink: string) {
  const tokensSnap = await db.collection('users').doc(userId).collection('tokens').get();
  const tokens = tokensSnap.docs.map(extractToken).filter((t): t is string => !!t);
  if (tokens.length === 0) return 0;
  try {
    const resp = await getMessaging(app).sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { deepLink, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
      android: { priority: 'high', notification: { sound: 'default', channelId: 'agrimarche_urgent' } },
      apns: { payload: { aps: { sound: 'default', 'interruption-level': 'time-sensitive' } } },
    });
    return resp.successCount;
  } catch (e) {
    console.warn(`[periodic-checks] Échec push ${userId}:`, e);
    return 0;
  }
}

interface PendingOrdersSettings {
  enabled: boolean;
  thresholdHours: number;
  cooldownHours: number;
  escalateAfterHours: number;
  maxPerRun: number;
}
const DEFAULT_PENDING: PendingOrdersSettings = {
  enabled: false, thresholdHours: 6, cooldownHours: 6, escalateAfterHours: 24, maxPerRun: 50,
};

interface InactiveClientsSettings {
  enabled: boolean;
  thresholdDays: number;
  cooldownDays: number;
  maxPerRun: number;
}
const DEFAULT_INACTIVE: InactiveClientsSettings = {
  enabled: false, thresholdDays: 30, cooldownDays: 14, maxPerRun: 100,
};

// ⚠️ Cas particulier : contrairement aux commandes en attente et aux clients
// inactifs (qui relancent un COMPTE existant), ici on relance un simple
// TOKEN FCM anonyme (deviceTokens/{token}, voir useFCMToken.ts +
// AuthContext.migratePendingFcmToken) — capté avant toute inscription.
// Deux différences structurelles qui découlent de cette absence d'identité :
//   1. Pas de "cooldown" périodique : un inconnu qu'on ne réussit pas à
//      convaincre une fois ne doit JAMAIS être re-sollicité indéfiniment
//      (reminderSentAt agit comme un plafond à VIE, pas une fenêtre).
//   2. Une expiration dure (expireAfterDays) : passé ce délai sans
//      inscription, le token est supprimé plutôt que gardé indéfiniment —
//      un visiteur qui n'a pas fini son inscription en 2 semaines a très
//      probablement changé d'appareil ou désinstallé l'app, et chaque
//      token conservé sans borne est un coût (lecture, quota FCM) pour un
//      taux de conversion qui tend vers zéro.
interface PendingSignupSettings {
  enabled: boolean;
  thresholdHours: number;
  expireAfterDays: number;
  maxPerRun: number;
}
const DEFAULT_PENDING_SIGNUP: PendingSignupSettings = {
  enabled: false, thresholdHours: 2, expireAfterDays: 14, maxPerRun: 200,
};

const DEFAULT_MIN_INTERVAL_MINUTES = 120; // ne relance le scan complet qu'au plus toutes les 2h

async function runPendingOrdersCheck(db: FirebaseFirestore.Firestore, app: ReturnType<typeof getAdminApp>) {
  const settingsSnap = await db.doc('settings/pendingOrdersAlerts').get();
  const settings: PendingOrdersSettings = { ...DEFAULT_PENDING, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
  if (!settings.enabled) return { skipped: true };

  const now = Date.now();
  const thresholdMs = settings.thresholdHours * 60 * 60 * 1000;
  const cooldownMs = settings.cooldownHours * 60 * 60 * 1000;
  const escalateMs = settings.escalateAfterHours * 60 * 60 * 1000;
  const cutoff = Timestamp.fromMillis(now - thresholdMs);

  // ⚠️ Égalité + inégalité sur deux champs différents : nécessite un index
  // composite Firestore. Au premier run, l'erreur renvoyée contient un
  // lien direct "Créer l'index" — cliquer dessus, patienter, relancer.
  const ordersSnap = await db.collection('orders')
    .where('status', '==', 'en_attente')
    .where('createdAt', '<=', cutoff)
    .limit(500)
    .get();

  const candidates = ordersSnap.docs.filter(d => {
    const lastReminder = d.data().lastPendingReminderAt?.toMillis?.() ?? 0;
    return now - lastReminder >= cooldownMs;
  }).slice(0, settings.maxPerRun);

  let notified = 0, escalated = 0, pushSuccessCount = 0;
  let adminIds: string[] | null = null;
  const batch = db.batch();

  for (const orderDoc of candidates) {
    const order = orderDoc.data();
    const sellerId = order.sellerId;
    if (!sellerId) continue;

    const ageMs = now - (order.createdAt?.toMillis?.() ?? now);
    const shouldEscalate = ageMs >= escalateMs;
    const orderLabel = order.orderNumber || orderDoc.id.slice(0, 8);
    const title = '⏳ Commande en attente';
    const body = `La commande #${orderLabel} attend d'être traitée depuis plus de ${settings.thresholdHours}h. Merci de la préparer.`;

    batch.set(db.collection('notifications').doc(), {
      userId: sellerId, type: 'order', title, body, icon: '⏳', deepLink: '/seller/orders',
      urgent: shouldEscalate, priority: shouldEscalate ? 'high' : 'medium', read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: { automated: true, source: 'pending-order-alert', orderId: orderDoc.id },
    });
    batch.update(orderDoc.ref, { lastPendingReminderAt: FieldValue.serverTimestamp() });
    notified++;
    pushSuccessCount += await pushToUser(db, app, sellerId, title, body, '/seller/orders');

    if (shouldEscalate) {
      if (adminIds === null) {
        const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();
        adminIds = adminsSnap.docs.map(d => d.id);
      }
      const escTitle = `🚨 Commande bloquée > ${settings.escalateAfterHours}h`;
      const escBody = `Commande #${orderLabel} toujours en attente après ${settings.escalateAfterHours}h. Le vendeur n'a pas réagi aux relances.`;
      for (const adminId of adminIds) {
        batch.set(db.collection('notifications').doc(), {
          userId: adminId, type: 'alert', title: escTitle, body: escBody, icon: '🚨',
          deepLink: '/admin?tab=orders', urgent: true, priority: 'critical', read: false,
          createdAt: FieldValue.serverTimestamp(),
          metadata: { automated: true, source: 'pending-order-escalation', orderId: orderDoc.id },
        });
        pushSuccessCount += await pushToUser(db, app, adminId, escTitle, escBody, '/admin?tab=orders');
      }
      escalated++;
    }
  }

  if (notified > 0) await batch.commit();
  if (notified > 0) {
    await db.collection('pending_order_alerts').add({
      createdAt: FieldValue.serverTimestamp(), ordersNotified: notified, escalated, pushSuccessCount,
    });
  }
  return { notified, escalated, pushSuccessCount };
}

async function runInactiveClientsCheck(db: FirebaseFirestore.Firestore, app: ReturnType<typeof getAdminApp>) {
  const settingsSnap = await db.doc('settings/inactiveClientsAlerts').get();
  const settings: InactiveClientsSettings = { ...DEFAULT_INACTIVE, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
  if (!settings.enabled) return { skipped: true };

  const now = Date.now();
  const thresholdMs = settings.thresholdDays * 24 * 60 * 60 * 1000;
  const cooldownMs = settings.cooldownDays * 24 * 60 * 60 * 1000;

  const clientsSnap = await db.collection('users').where('role', '==', 'client').limit(settings.maxPerRun * 3).get();

  let notified = 0, pushSuccessCount = 0, checked = 0;
  const batch = db.batch();

  for (const userDoc of clientsSnap.docs) {
    if (checked >= settings.maxPerRun) break;
    const user = userDoc.data();
    const lastReminder = user.lastInactivityReminderAt?.toMillis?.() ?? 0;
    if (now - lastReminder < cooldownMs) continue;
    checked++;

    const lastOrderSnap = await db.collection('orders')
      .where('userId', '==', userDoc.id).orderBy('createdAt', 'desc').limit(1).get();
    const referenceDate = lastOrderSnap.empty
      ? (user.createdAt?.toMillis?.() ?? 0)
      : (lastOrderSnap.docs[0].data().createdAt?.toMillis?.() ?? 0);
    const isInactive = referenceDate > 0 && (now - referenceDate) >= thresholdMs;
    if (!isInactive) continue;

    const firstName = (user.displayName || '').split(' ')[0] || 'là-bas';
    const title = '👋 On vous a manqué !';
    const body = `${firstName}, ça fait un moment — découvrez les nouveautés fraîches sur AgriMarché.`;

    batch.set(db.collection('notifications').doc(), {
      userId: userDoc.id, type: 'promotion', title, body, icon: '👋', deepLink: '/products',
      urgent: false, priority: 'low', read: false, createdAt: FieldValue.serverTimestamp(),
      metadata: { automated: true, source: 'inactive-client-alert' },
    });
    batch.update(userDoc.ref, { lastInactivityReminderAt: FieldValue.serverTimestamp() });
    notified++;
    pushSuccessCount += await pushToUser(db, app, userDoc.id, title, body, '/products');
  }

  if (notified > 0) await batch.commit();
  if (checked > 0) {
    await db.collection('inactive_client_alerts').add({
      createdAt: FieldValue.serverTimestamp(), clientsChecked: checked, clientsNotified: notified, pushSuccessCount,
    });
  }
  return { checked, notified, pushSuccessCount };
}

// ═══════════════════════════════════════════════════════════════════════
// Relance "inscription non terminée" — visiteurs ayant autorisé les
// notifs (token FCM capté dans deviceTokens/{token}) mais jamais créé de
// compte. Voir le commentaire sur PendingSignupSettings ci-dessus pour le
// raisonnement (pas de cooldown répété, expiration dure).
// ═══════════════════════════════════════════════════════════════════════
async function runPendingSignupRemindersCheck(db: FirebaseFirestore.Firestore, app: ReturnType<typeof getAdminApp>) {
  const settingsSnap = await db.doc('settings/pendingSignupAlerts').get();
  const settings: PendingSignupSettings = { ...DEFAULT_PENDING_SIGNUP, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
  if (!settings.enabled) return { skipped: true };

  const now = Date.now();
  const thresholdMs = settings.thresholdHours * 60 * 60 * 1000;
  const expireMs = settings.expireAfterDays * 24 * 60 * 60 * 1000;

  // Tri par ancienneté : traite d'abord les tokens les plus vieux, donc à
  // la fois les candidats à l'expiration ET ceux en attente de relance
  // depuis le plus longtemps — jamais les mêmes qui passent systématiquement
  // en tête si la collection dépasse maxPerRun sur un run donné.
  const snap = await db.collection('deviceTokens').orderBy('createdAt').limit(settings.maxPerRun * 3).get();

  let checked = 0, notified = 0, expired = 0, pushSuccessCount = 0;
  const batch = db.batch();
  const candidates: { token: string; ref: FirebaseFirestore.DocumentReference }[] = [];

  for (const docSnap of snap.docs) {
    if (checked >= settings.maxPerRun) break;
    const data = docSnap.data();
    const createdAtMs = data.createdAt?.toMillis?.() ?? 0;
    if (!createdAtMs) continue;
    const ageMs = now - createdAtMs;

    if (ageMs >= expireMs) {
      // Jamais converti après le délai max : on arrête d'essayer et on
      // libère la place plutôt que de garder un token mort indéfiniment.
      batch.delete(docSnap.ref);
      expired++;
      continue;
    }
    if (data.reminderSentAt) continue; // déjà relancé une fois — jamais deux fois un inconnu
    if (ageMs < thresholdMs) continue; // encore dans la fenêtre de grâce, on laisse la chance de finir seul

    checked++;
    candidates.push({ token: docSnap.id, ref: docSnap.ref });
  }

  if (candidates.length > 0) {
    const title = '🌾 Votre compte AgriMarché vous attend';
    const body = "Terminez votre inscription pour commander ou vendre en quelques secondes.";
    try {
      const resp = await getMessaging(app).sendEachForMulticast({
        tokens: candidates.map(c => c.token),
        notification: { title, body },
        data: { deepLink: '/auth/register', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
        android: { priority: 'normal', notification: { sound: 'default', channelId: 'agrimarche_default' } },
        apns: { payload: { aps: { sound: 'default' } } },
        webpush: { fcmOptions: { link: '/auth/register' } },
      });
      pushSuccessCount = resp.successCount;
      resp.responses.forEach((res, idx) => {
        const c = candidates[idx];
        if (res.success) {
          batch.update(c.ref, { reminderSentAt: FieldValue.serverTimestamp() });
          notified++;
        } else if (
          res.error?.code === 'messaging/invalid-registration-token' ||
          res.error?.code === 'messaging/registration-token-not-registered'
        ) {
          // Token mort (désinstallé/permission révoquée) : inutile de le
          // garder jusqu'à expireAfterDays, autant libérer la place tout de suite.
          batch.delete(c.ref);
        }
      });
    } catch (e) {
      console.warn('[periodic-checks] Échec push relance inscription:', e);
    }
  }

  if (notified > 0 || expired > 0) await batch.commit();
  if (checked > 0 || expired > 0) {
    await db.collection('pending_signup_reminders').add({
      createdAt: FieldValue.serverTimestamp(), checked, notified, expired, pushSuccessCount,
    });
  }
  return { checked, notified, expired, pushSuccessCount };
}

export async function POST(req: NextRequest) {
  try {
    const app = getAdminApp();
    const db = getFirestore(app);

    // Bypass du throttle réservé à un admin authentifié (bouton "Forcer
    // maintenant" côté UI, pratique pour tester sans attendre le
    // minIntervalMinutes). Les appels organiques (checkout, chargement
    // admin sans intention explicite de forcer) n'envoient jamais ce
    // header et restent donc toujours soumis au verrou normal.
    let forceBypass = false;
    const authHeader = req.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (bearerToken) {
      try {
        const decoded = await getAuth(app).verifyIdToken(bearerToken);
        const userSnap = await db.collection('users').doc(decoded.uid).get();
        if (userSnap.exists && userSnap.data()?.role === 'admin') forceBypass = true;
      } catch { /* jeton invalide → pas de bypass, comportement normal */ }
    }

    const lockRef = db.doc('settings/periodicChecksLock');
    const lockSnap = await lockRef.get();
    const lastRun = lockSnap.exists ? (lockSnap.data()?.lastRunAt?.toMillis?.() ?? 0) : 0;
    const minIntervalMinutes = lockSnap.exists ? (lockSnap.data()?.minIntervalMinutes ?? DEFAULT_MIN_INTERVAL_MINUTES) : DEFAULT_MIN_INTERVAL_MINUTES;

    if (!forceBypass && Date.now() - lastRun < minIntervalMinutes * 60 * 1000) {
      // Appel normal et attendu : la plupart des appels depuis checkout/
      // admin tombent ici, quasi gratuit (une lecture).
      return NextResponse.json({ skipped: true, reason: 'Dernier scan trop récent' });
    }

    // Pose le verrou AVANT de lancer les scans pour éviter que deux
    // requêtes concurrentes (deux checkouts simultanés) ne relancent le
    // scan en double pendant qu'il tourne.
    await lockRef.set({ lastRunAt: FieldValue.serverTimestamp(), minIntervalMinutes }, { merge: true });

    const [pendingResult, inactiveResult, signupResult] = await Promise.all([
      runPendingOrdersCheck(db, app),
      runInactiveClientsCheck(db, app),
      runPendingSignupRemindersCheck(db, app),
    ]);

    return NextResponse.json({ ran: true, pendingOrders: pendingResult, inactiveClients: inactiveResult, pendingSignups: signupResult });
  } catch (error: any) {
    console.error('[periodic-checks] Erreur:', error?.message ?? error);
    return NextResponse.json({ error: error?.message ?? 'Erreur serveur' }, { status: 500 });
  }
}
