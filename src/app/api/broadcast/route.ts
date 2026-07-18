// src/app/api/notifications/broadcast/route.ts
//
// Notifie TOUS les utilisateurs de la plateforme (in-app + push).
// Utilise Firebase Admin, qui contourne les règles Firestore — c'est
// le seul moyen légitime pour un vendeur (non-admin) de déclencher une
// notification vers tout le monde après avoir publié un produit, sans
// pour autant lui donner un accès client direct en lecture à la
// collection 'users' au complet ou aux tokens FCM de tout le monde.
//
// Body attendu :
// {
//   title: string,
//   body: string,
//   link?: string,       // défaut '/'
//   type?: string,        // défaut 'info'
//   icon?: string,        // défaut '🔔'
//   priority?: 'low'|'medium'|'high'|'critical',
//   urgent?: boolean,
//   excludeUserId?: string   // ex: le vendeur qui vient de publier
// }

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json || json.trim() === '') {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  }
  const serviceAccount = JSON.parse(json);
  return initializeApp({ credential: cert(serviceAccount) });
}

export async function POST(request: NextRequest) {
  try {
    const {
      title,
      body,
      link = '/',
      type = 'info',
      icon = '🔔',
      priority = 'medium',
      urgent = false,
      excludeUserId,
    } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ success: false, error: 'title et body requis' }, { status: 400 });
    }

    const adminApp = getAdminApp();
    const db = getFirestore(adminApp);

    // ── 1. Tous les utilisateurs ────────────────────────────────────────────
    const usersSnap = await db.collection('users').select().get(); // select() : on ne lit aucun champ, juste les IDs
    const userIds = usersSnap.docs.map((d) => d.id).filter((id) => id !== excludeUserId);

    // ── 2. Un document in-app par utilisateur (limite batch Firestore = 500) ─
    for (let i = 0; i < userIds.length; i += 450) {
      const chunk = userIds.slice(i, i + 450);
      const batch = db.batch();
      chunk.forEach((uid) => {
        const ref = db.collection('notifications').doc();
        batch.set(ref, {
          userId: uid,
          type,
          title,
          body,
          icon,
          link,
          deepLink: link, // compat avec les lecteurs plus anciens
          urgent,
          priority,
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          metadata: { broadcast: true },
        });
      });
      await batch.commit();
    }

    // ── 3. Push à tous les appareils connus ──────────────────────────────────
    let pushSuccessCount = 0;
    let pushFailureCount = 0;
    try {
      const tokensSnap = await db.collectionGroup('tokens').get();
      const tokens = Array.from(new Set(tokensSnap.docs.map((d) => d.id))).filter(Boolean);

      for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        const multicast = await getMessaging(adminApp).sendEachForMulticast({
          tokens: chunk,
          notification: { title, body },
          data: { link, timestamp: Date.now().toString() },
          android: {
            priority: 'high',
            notification: { sound: 'default', channelId: 'agrimarche_orders' },
          },
          webpush: {
            notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png' },
            fcmOptions: { link },
          },
        });
        pushSuccessCount += multicast.successCount;
        pushFailureCount += multicast.failureCount;
      }
    } catch (err: any) {
      console.error('[broadcast] Erreur envoi push:', err.message);
    }

    return NextResponse.json({
      success: true,
      recipientCount: userIds.length,
      pushSuccessCount,
      pushFailureCount,
    });
  } catch (error: any) {
    console.error('[broadcast] Erreur:', error);
    return NextResponse.json({ success: false, error: error.message || 'Erreur interne' }, { status: 500 });
  }
}
