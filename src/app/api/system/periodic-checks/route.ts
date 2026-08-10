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

    const [pendingResult, inactiveResult] = await Promise.all([
      runPendingOrdersCheck(db, app),
      runInactiveClientsCheck(db, app),
    ]);

    return NextResponse.json({ ran: true, pendingOrders: pendingResult, inactiveClients: inactiveResult });
  } catch (error: any) {
    console.error('[periodic-checks] Erreur:', error?.message ?? error);
    return NextResponse.json({ error: error?.message ?? 'Erreur serveur' }, { status: 500 });
  }
}
