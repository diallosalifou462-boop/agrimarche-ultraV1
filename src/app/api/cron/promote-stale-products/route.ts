// src/app/api/cron/promote-stale-products/route.ts
//
// 🤖 Promotion automatique par IA des produits "stagnants"
// ────────────────────────────────────────────────────────
// Déclenché périodiquement (Vercel Cron, voir vercel.json) — jamais par
// un utilisateur. Logique :
//
//   1. Lire settings/aiPromotion (toggle admin + seuils réglables).
//   2. Scanner les produits actifs créés il y a plus de `thresholdHours`
//      heures, sans aucune commande (orderCount manquant ou 0), et pas
//      déjà promus dans les `cooldownDays` derniers jours.
//   3. Pour chacun (plafonné à `maxPerRun` par exécution, pour limiter le
//      coût DeepSeek et éviter de spammer les utilisateurs), demander à
//      DeepSeek un titre + message accrocheur.
//   4. Envoyer un push FCM (même mécanique que /api/send-push) + une
//      notification in-app, cibler idéalement les acheteurs de la même
//      région que le produit plutôt que tout le monde.
//   5. Marquer le produit (lastPromotedAt, promotionCount) et logger
//      l'action dans `ai_promotions` pour l'historique admin.
//
// Sécurité : protégé par CRON_SECRET — Vercel Cron envoie automatiquement
// l'en-tête Authorization: Bearer ${CRON_SECRET} si défini dans les
// variables d'environnement du projet (voir vercel.json "crons").
//
// Variables d'environnement requises :
//   CRON_SECRET                  ← secret partagé avec Vercel Cron
//   DEEPSEEK_API_KEY              ← déjà utilisé par /api/chat
//   FIREBASE_SERVICE_ACCOUNT_JSON ← déjà utilisé par /api/send-push

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

// ⚠️ Le projet stocke les tokens FCM tantôt comme ID de document
// (users/{uid}/tokens/{token}, cf. /api/send-push), tantôt comme champ
// `token` sur le document (cf. sendPushToAllTokens côté admin). On gère
// les deux pour ne rater aucun appareil.
function extractToken(docSnap: FirebaseFirestore.QueryDocumentSnapshot): string | null {
  const fieldToken = docSnap.data()?.token;
  if (typeof fieldToken === 'string' && fieldToken.length > 50) return fieldToken;
  if (docSnap.id && docSnap.id.length > 50) return docSnap.id;
  return null;
}

interface AiPromotionSettings {
  enabled: boolean;
  thresholdHours: number;   // délai avant de considérer un produit "stagnant"
  cooldownDays: number;     // ne pas repromouvoir avant N jours
  maxPerRun: number;        // plafond de produits traités par exécution
  scope: 'all' | 'region';  // cible : tous les tokens, ou uniquement la région du produit
}

const DEFAULT_SETTINGS: AiPromotionSettings = {
  enabled: false,           // 🔒 désactivé par défaut — l'admin doit l'activer explicitement
  thresholdHours: 48,
  cooldownDays: 7,
  maxPerRun: 8,
  scope: 'region',
};

async function generatePromoCopy(product: {
  name: string; category: string; price: number; unit: string; location: string; isOrganic?: boolean;
}): Promise<{ title: string; body: string; icon: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const fallback = {
    title: `🔥 ${product.name} vous attend`,
    body: `Ce produit frais de ${product.location} n'a pas encore trouvé preneur. Foncez avant qu'il ne soit plus disponible !`,
    icon: '🔥',
  };
  if (!apiKey) return fallback;

  try {
    const systemPrompt =
      "Tu es le rédacteur marketing d'AgriMarché, une marketplace agricole sénégalaise. " +
      "On te donne un produit qui a été ajouté mais n'a encore reçu aucune commande. " +
      "Génère un titre court (max 45 caractères, avec un seul emoji pertinent en tête) et un message " +
      "(max 110 caractères) pour une notification push qui donne envie de l'acheter, sans être mensonger " +
      "ni créer de fausse urgence artificielle (pas de \"plus que 2 en stock\" si c'est faux). Ton chaleureux, " +
      "local, direct. Réponds UNIQUEMENT en JSON strict, sans texte autour, format exact : " +
      '{"title":"...","body":"...","icon":"<un seul emoji>"}';

    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Produit : ${product.name}\nCatégorie : ${product.category}\nPrix : ${product.price} FCFA / ${product.unit}\nRégion : ${product.location}\nBio : ${product.isOrganic ? 'oui' : 'non'}`,
          },
        ],
        max_tokens: 150,
        temperature: 0.8,
        stream: false,
      }),
    });

    if (!res.ok) return fallback;
    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content?.trim();
    if (!raw) return fallback;

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!parsed.title || !parsed.body) return fallback;

    return {
      title: String(parsed.title).slice(0, 60),
      body: String(parsed.body).slice(0, 140),
      icon: typeof parsed.icon === 'string' && parsed.icon.trim() ? parsed.icon.trim() : '🔥',
    };
  } catch (e) {
    console.error('[promote-stale-products] Erreur génération DeepSeek:', e);
    return fallback;
  }
}

export async function GET(req: NextRequest) {
  const app = getAdminApp();
  const db = getFirestore(app);

  // ── Auth : soit Vercel Cron (CRON_SECRET), soit un admin authentifié qui ─
  // déclenche manuellement depuis le panneau "Promotion IA" de l'admin.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  const isCron = !!cronSecret && bearerToken === cronSecret;
  let isAdmin = false;
  if (!isCron && bearerToken) {
    try {
      const decoded = await getAuth(app).verifyIdToken(bearerToken);
      const userSnap = await db.collection('users').doc(decoded.uid).get();
      isAdmin = userSnap.exists && userSnap.data()?.role === 'admin';
    } catch {
      isAdmin = false;
    }
  }
  // Si CRON_SECRET n'est pas configuré (dev), on laisse passer sans blocage.
  if (cronSecret && !isCron && !isAdmin) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const messaging = getMessaging(app);

    // ── 1. Paramètres admin ───────────────────────────────
    const settingsSnap = await db.collection('settings').doc('aiPromotion').get();
    const settings: AiPromotionSettings = { ...DEFAULT_SETTINGS, ...(settingsSnap.exists ? settingsSnap.data() : {}) };

    if (!settings.enabled) {
      return NextResponse.json({ skipped: true, reason: 'Promotion IA désactivée dans les réglages admin' });
    }

    const now = Date.now();
    const thresholdMs = settings.thresholdHours * 60 * 60 * 1000;
    const cooldownMs = settings.cooldownDays * 24 * 60 * 60 * 1000;
    const cutoff = Timestamp.fromMillis(now - thresholdMs);

    // ── 2. Scan des produits candidats ────────────────────
    // Note : Firestore ne permet pas de combiner un filtre d'inégalité sur
    // createdAt avec orderCount == 0 sans index composite dédié. On filtre
    // donc orderCount côté serveur après lecture — le volume de produits
    // "actifs et anciens" reste gérable pour une marketplace de cette taille.
    const candidatesSnap = await db
      .collection('products')
      .where('status', '==', 'active')
      .where('createdAt', '<=', cutoff)
      .limit(200)
      .get();

    const candidates = candidatesSnap.docs.filter((d) => {
      const data = d.data();
      const orderCount = data.orderCount || 0;
      if (orderCount > 0) return false;
      const lastPromotedAt = data.lastPromotedAt?.toMillis?.() ?? 0;
      if (lastPromotedAt && now - lastPromotedAt < cooldownMs) return false;
      return true;
    }).slice(0, settings.maxPerRun);

    if (candidates.length === 0) {
      return NextResponse.json({ skipped: true, reason: 'Aucun produit stagnant à promouvoir pour le moment' });
    }

    const results: any[] = [];

    for (const docSnap of candidates) {
      const product = docSnap.data();
      const productId = docSnap.id;

      // ── 3. Génération du message par DeepSeek ───────────
      const copy = await generatePromoCopy({
        name: product.name,
        category: product.category,
        price: product.price,
        unit: product.unit,
        location: product.location,
        isOrganic: product.isOrganic,
      });

      // ── 4. Ciblage des tokens ────────────────────────────
      // scope 'region' : uniquement les utilisateurs de la même région que
      // le produit (évite de spammer tout le monde pour un produit local).
      // scope 'all' : tout le monde, comme le "Push à tous les tokens" admin.
      let tokens: string[] = [];
      if (settings.scope === 'region' && product.location) {
        const usersInRegion = await db.collection('users').where('region', '==', product.location).select().get();
        const uids = usersInRegion.docs.map((u) => u.id);
        const tokenSnaps = await Promise.all(
          uids.map((uid) => db.collection('users').doc(uid).collection('tokens').get())
        );
        tokens = tokenSnaps.flatMap((s) => s.docs.map(extractToken).filter((t): t is string => !!t));
      }
      // Repli sur "tous les tokens" si aucun token régional trouvé, pour ne
      // pas laisser le produit sans aucune visibilité.
      if (tokens.length === 0) {
        const allTokensSnap = await db.collectionGroup('tokens').get();
        tokens = Array.from(new Set(allTokensSnap.docs.map(extractToken).filter((t): t is string => !!t)));
      }

      let pushSuccessCount = 0;
      let pushFailureCount = 0;
      const deepLink = `/product/${productId}`;

      for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        if (chunk.length === 0) continue;
        try {
          const multicast = await messaging.sendEachForMulticast({
            tokens: chunk,
            notification: { title: `${copy.icon} ${copy.title}`, body: copy.body },
            data: { deepLink, source: 'ai_promotion', productId, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
            android: { priority: 'normal', notification: { sound: 'default', channelId: 'agrimarche_default' } },
            webpush: {
              notification: { icon: '/icons/icon-192x192.png', badge: '/icons/badge-72x72.png' },
              fcmOptions: { link: deepLink },
            },
          });
          pushSuccessCount += multicast.successCount;
          pushFailureCount += multicast.failureCount;
        } catch (e) {
          console.error(`[promote-stale-products] Erreur push produit ${productId}:`, e);
        }
      }

      // ── 5. Marquage produit + log historique ─────────────
      await docSnap.ref.update({
        lastPromotedAt: FieldValue.serverTimestamp(),
        promotionCount: FieldValue.increment(1),
      });

      await db.collection('ai_promotions').add({
        productId,
        productName: product.name,
        sellerId: product.sellerId ?? null,
        title: copy.title,
        body: copy.body,
        icon: copy.icon,
        scope: settings.scope,
        recipientCount: tokens.length,
        pushSuccessCount,
        pushFailureCount,
        createdAt: FieldValue.serverTimestamp(),
      });

      results.push({ productId, productName: product.name, title: copy.title, recipientCount: tokens.length, pushSuccessCount, pushFailureCount });
    }

    return NextResponse.json({ processed: results.length, results });
  } catch (error: any) {
    console.error('[promote-stale-products] Erreur:', error);
    return NextResponse.json({ error: error?.message ?? 'Erreur interne' }, { status: 500 });
  }
}
