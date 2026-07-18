// src/app/api/notifications/notify-admins/route.ts
//
// Notifie TOUS les comptes admin (users où role == 'admin') d'un événement
// (ex : nouvel avis client). Jusqu'ici, aucun code ne notifiait l'admin —
// seul le vendeur concerné recevait une notification. Ce endpoint comble
// ce trou en réutilisant /api/notifications/send (Firebase Admin, donc pas
// bloqué par les règles Firestore) pour chaque admin trouvé.
//
// Body attendu :
// {
//   title   : string
//   body    : string
//   link?   : string                              (défaut: /admin)
//   icon?   : string                               (défaut: 🔔)
//   type?   : string                                (défaut: info)
//   priority?: 'low'|'medium'|'high'|'critical'
//   urgent? : boolean
//   channels?: ('push'|'email'|'sms')[]            (défaut: ['push'] — l'entrée
//              in-app dans Firestore, elle, est TOUJOURS créée par
//              /api/notifications/send, quel que soit ce paramètre)
// }

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json || json.trim() === '') throw new Error('Firebase Admin non configuré');
  const serviceAccount = JSON.parse(json);
  if (!serviceAccount.project_id) throw new Error('project_id manquant');
  return initializeApp({ credential: cert(serviceAccount) });
}

export async function POST(request: NextRequest) {
  try {
    const {
      title,
      body,
      link = '/admin',
      icon = '🔔',
      type = 'info',
      priority = 'medium',
      urgent = false,
      channels = ['push'],
    } = await request.json();

    if (!title || !body) {
      return NextResponse.json({ success: false, error: 'title et body sont requis' }, { status: 400 });
    }

    const adminApp = getAdminApp();
    const db = getFirestore(adminApp);

    const adminsSnap = await db.collection('users').where('role', '==', 'admin').get();

    if (adminsSnap.empty) {
      console.warn('[notify-admins] Aucun compte avec role=="admin" trouvé.');
      return NextResponse.json({ success: true, notified: 0, reason: 'no_admin_found' });
    }

    // On délègue à /api/notifications/send pour chaque admin : c'est la
    // même route déjà utilisée pour le vendeur, avec la même Firebase Admin
    // SDK (donc les règles Firestore sur `notifications` — allow create:
    // if isAdmin() — sont contournées côté serveur).
    const origin = request.nextUrl.origin;

    const results = await Promise.all(
      adminsSnap.docs.map(async (adminDoc) => {
        try {
          const res = await fetch(`${origin}/api/notifications/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: adminDoc.id,
              title,
              body,
              link,
              icon,
              type,
              priority,
              urgent,
              channels,
            }),
          });
          return { userId: adminDoc.id, ok: res.ok };
        } catch (err: any) {
          return { userId: adminDoc.id, ok: false, error: err.message };
        }
      })
    );

    const notified = results.filter((r) => r.ok).length;
    console.log(`[notify-admins] ${notified}/${results.length} admin(s) notifié(s)`, results);

    return NextResponse.json({ success: true, notified, results });
  } catch (error: any) {
    console.error('[notify-admins] Erreur globale:', error);
    return NextResponse.json({ success: false, error: error.message || 'Erreur interne' }, { status: 500 });
  }
}
