// src/app/api/orders/notify-seller/route.ts
//
// Appelé automatiquement quand un client passe une commande.
// Envoie une notification push au vendeur concerné.
//
// ⚠️ FIX : cette route lisait sellerData?.fcmToken, un champ qui n'a
// jamais existé sur le document users/{uid} — les tokens FCM sont
// enregistrés par useFCMToken.ts dans la sous-collection
// users/{uid}/tokens/{token} (un doc par appareil). Avant ce fix, cette
// route trouvait toujours 0 token et répondait silencieusement
// { success:false, reason:'no_token' }. On envoie maintenant à TOUS les
// appareils enregistrés du vendeur, comme /api/notifications/send.
//
// ⚠️ Cette route n'est actuellement appelée nulle part dans le code
// client (le flux réel de notification vendeur passe par
// notifyUser() → /api/notifications/send). Elle est corrigée par
// cohérence / au cas où elle serait rebranchée plus tard.

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON manquant');
  return initializeApp({ credential: cert(JSON.parse(json)) });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const { sellerId, orderNumber, customerName, amount } = await request.json();

    if (!sellerId) {
      return NextResponse.json({ success: false, error: 'sellerId requis' }, { status: 400, headers: CORS_HEADERS });
    }

    const adminApp = getAdminApp();
    const db = getFirestore(adminApp);

    // Récupérer TOUS les tokens FCM du vendeur (un par appareil connecté)
    const tokensSnap = await db.collection('users').doc(sellerId).collection('tokens').get();
    const deviceTokens = tokensSnap.docs.map((d) => d.id);

    if (deviceTokens.length === 0) {
      return NextResponse.json({ success: false, reason: 'no_token' }, { headers: CORS_HEADERS });
    }

    const title = '🛒 Nouvelle commande !';
    const body = `${customerName} vient de commander · ${Number(amount).toLocaleString('fr-FR')} FCFA`;

    // Envoyer la notification push à tous les appareils du vendeur
    const multicast = await getMessaging(adminApp).sendEachForMulticast({
      tokens: deviceTokens,
      notification: { title, body },
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

    // Nettoyer les tokens invalides / désinstallés
    const invalidTokens: string[] = [];
    multicast.responses.forEach((res, idx) => {
      if (!res.success) {
        const code = res.error?.code;
        if (
          code === 'messaging/invalid-registration-token' ||
          code === 'messaging/registration-token-not-registered'
        ) {
          invalidTokens.push(deviceTokens[idx]);
        }
      }
    });
    if (invalidTokens.length > 0) {
      const batch = db.batch();
      invalidTokens.forEach((t) =>
        batch.delete(db.collection('users').doc(sellerId).collection('tokens').doc(t))
      );
      await batch.commit();
    }

    // Sauvegarder dans l'historique des notifications
    // ⚠️ FIX : createdAt (Timestamp serveur) ajouté — le panneau admin trie
    // avec orderBy('createdAt', 'desc'), un doc sans ce champ n'apparaît
    // jamais dans cette requête (voir le même fix dans notifications/send).
    await db.collection('notifications').add({
      userId: sellerId,
      type: 'order',
      title,
      body: `${customerName} · ${Number(amount).toLocaleString('fr-FR')} FCFA`,
      link: '/seller/orders',
      deepLink: '/seller/orders',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      sentAt: new Date().toISOString(),
      channels: ['push'],
    });

    return NextResponse.json(
      {
        success: true,
        successCount: multicast.successCount,
        failureCount: multicast.failureCount,
        invalidTokensRemoved: invalidTokens.length,
      },
      { headers: CORS_HEADERS }
    );

  } catch (error: any) {
    console.error('[notify-seller] Erreur:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
