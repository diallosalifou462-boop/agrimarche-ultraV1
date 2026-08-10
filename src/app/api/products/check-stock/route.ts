// src/app/api/products/check-stock/route.ts
//
// 🔔 Alerte stock bas / rupture — ÉVÉNEMENTIELLE, pas de cron
// ─────────────────────────────────────────────────────────
// Appelée directement par checkout/page.tsx juste après la décrémentation
// du stock d'un produit (fire-and-forget, ne bloque jamais le checkout).
// Contrairement à un scan périodique (cron), l'alerte part à l'instant
// exact où le stock passe sous le seuil — plus réactif, et surtout : pas
// besoin d'infrastructure de planification (Vercel Cron, GitHub Actions,
// etc.) puisque le déclencheur est un événement métier réel (une vente),
// pas l'écoulement du temps.
//
//   1. Relire le produit depuis Firestore (Admin SDK — jamais faire
//      confiance à un stock envoyé par le client, un autre acheteur a pu
//      commander entre-temps).
//   2. Si stock <= threshold (settings/lowStockAlerts) ET pas déjà
//      alerté dans les `cooldownHours` dernières heures → notifier le
//      vendeur (in-app + push).
//   3. Marquer lastLowStockAlertAt sur le produit.
//
// Pas de CRON_SECRET ici : cette route est appelée par n'importe quel
// acheteur en train de finaliser un achat, pas par un job planifié. Le
// productId est revalidé côté serveur (le stock n'est jamais pris tel
// quel dans la requête), donc pas de risque à la laisser accessible.
//
// Variables d'environnement requises :
//   FIREBASE_SERVICE_ACCOUNT_JSON

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

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

interface LowStockSettings {
  enabled: boolean;
  threshold: number;
  cooldownHours: number;
}

const DEFAULT_SETTINGS: LowStockSettings = {
  enabled: false, // 🔒 désactivé par défaut — l'admin doit l'activer explicitement
  threshold: 5,
  cooldownHours: 24,
};

export async function POST(req: NextRequest) {
  try {
    const { productId } = await req.json();
    if (!productId || typeof productId !== 'string') {
      return NextResponse.json({ error: 'productId requis' }, { status: 400 });
    }

    const app = getAdminApp();
    const db = getFirestore(app);

    const settingsSnap = await db.doc('settings/lowStockAlerts').get();
    const settings: LowStockSettings = { ...DEFAULT_SETTINGS, ...(settingsSnap.exists ? settingsSnap.data() : {}) };
    if (!settings.enabled) {
      return NextResponse.json({ skipped: true, reason: 'Alertes stock bas désactivées' });
    }

    const productRef = db.collection('products').doc(productId);
    const productSnap = await productRef.get();
    if (!productSnap.exists) {
      return NextResponse.json({ skipped: true, reason: 'Produit introuvable' });
    }
    const product = productSnap.data()!;
    const stock = product.stock ?? 0;

    if (stock > settings.threshold) {
      return NextResponse.json({ skipped: true, reason: 'Stock au-dessus du seuil' });
    }

    const lastAlert = product.lastLowStockAlertAt?.toMillis?.() ?? 0;
    const cooldownMs = settings.cooldownHours * 60 * 60 * 1000;
    if (Date.now() - lastAlert < cooldownMs) {
      return NextResponse.json({ skipped: true, reason: 'En cooldown' });
    }

    const sellerId = product.sellerId;
    if (!sellerId) {
      return NextResponse.json({ skipped: true, reason: 'Produit sans sellerId' });
    }

    const isOutOfStock = stock <= 0;
    const title = isOutOfStock ? '🚫 Rupture de stock' : '⚠️ Stock bas';
    const body = isOutOfStock
      ? `${product.name} est en rupture de stock. Réapprovisionnez pour ne pas perdre de ventes.`
      : `${product.name} — il ne reste que ${stock} en stock. Pensez à réapprovisionner.`;

    await db.collection('notifications').add({
      userId: sellerId,
      type: 'alert',
      title,
      body,
      icon: isOutOfStock ? '🚫' : '⚠️',
      deepLink: '/seller/products',
      urgent: isOutOfStock,
      priority: isOutOfStock ? 'high' : 'medium',
      read: false,
      createdAt: FieldValue.serverTimestamp(),
      metadata: { automated: true, source: 'low-stock-alert', productId },
    });

    await productRef.update({ lastLowStockAlertAt: FieldValue.serverTimestamp() });

    let pushSuccessCount = 0;
    const tokensSnap = await db.collection('users').doc(sellerId).collection('tokens').get();
    const tokens = tokensSnap.docs.map(extractToken).filter((t): t is string => !!t);
    if (tokens.length > 0) {
      try {
        const resp = await getMessaging(app).sendEachForMulticast({
          tokens,
          notification: { title, body },
          data: { deepLink: '/seller/products', click_action: 'FLUTTER_NOTIFICATION_CLICK' },
          android: { priority: isOutOfStock ? 'high' : 'normal', notification: { sound: 'default', channelId: 'agrimarche_default' } },
          apns: { payload: { aps: { sound: 'default', ...(isOutOfStock ? { 'interruption-level': 'time-sensitive' } : {}) } } },
        });
        pushSuccessCount = resp.successCount;
      } catch (e) {
        console.warn('[check-stock] Échec push:', e);
      }
    }

    return NextResponse.json({ notified: true, pushSuccessCount });
  } catch (error: any) {
    console.error('[check-stock] Erreur:', error?.message ?? error);
    // Ne jamais faire échouer bruyamment : cette route est fire-and-forget
    // depuis le checkout, une erreur ici ne doit jamais remonter à l'achat.
    return NextResponse.json({ error: error?.message ?? 'Erreur serveur' }, { status: 500 });
  }
}
