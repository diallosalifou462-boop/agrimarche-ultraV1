// src/app/api/orders/notify-seller/route.ts
//
// Appelé automatiquement quand un client passe une commande.
// Envoie une notification push au vendeur concerné.

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

export async function POST(request: NextRequest) {
  try {
    const { sellerId, orderNumber, customerName, amount } = await request.json();

    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'sellerId requis' }, { status: 400 });
    }

    const adminApp = getAdminApp();
    const db = getFirestore(adminApp);

    // Récupérer le token FCM du vendeur
    const sellerSnap = await db.collection('users').doc(sellerId).get();
    const sellerData = sellerSnap.data();
    const fcmToken = sellerData?.fcmToken;

    if (!fcmToken) {
      return NextResponse.json({ success: false, reason: 'no_token' });
    }

    // Envoyer la notification push au vendeur
    const messageId = await getMessaging(adminApp).send({
      token: fcmToken,
      notification: {
        title: '🛒 Nouvelle commande !',
        body: `${customerName} vient de commander · ${amount.toLocaleString('fr-FR')} FCFA`,
      },
      data: {
        link: '/seller/orders',
        orderNumber: orderNumber || '',
      },
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'agrimarche_orders' },
      },
      webpush: {
        notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png' },
        fcmOptions: { link: '/seller/orders' },
      },
    });

    // Sauvegarder dans l'historique des notifications
    await db.collection('notifications').add({
      userId: sellerId,
      title: '🛒 Nouvelle commande !',
      body: `${customerName} · ${amount.toLocaleString('fr-FR')} FCFA`,
      link: '/seller/orders',
      read: false,
      sentAt: new Date().toISOString(),
      channels: ['push'],
    });

    return NextResponse.json({ success: true, messageId });

  } catch (error: any) {
    console.error('[notify-seller] Erreur:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
