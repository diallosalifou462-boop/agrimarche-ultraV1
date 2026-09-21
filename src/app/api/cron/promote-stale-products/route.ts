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
//   FIREBASE_SERVICE_ACCOUNT_JSON, ou à défaut FIREBASE_PROJECT_ID +
//   FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (voir /api/send-push)

import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth } from 'firebase-admin/auth';
import { categoryLink, absoluteAppLink } from '@/lib/categoryLink';

// ============================================================
// FIREBASE ADMIN — accepte les deux formats de config utilisés dans ce
// projet (voir /api/send-push/route.ts, qui documentait déjà cet écart) :
// soit FIREBASE_SERVICE_ACCOUNT_JSON (un seul bloc JSON), soit les 3
// variables séparées FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL /
// FIREBASE_PRIVATE_KEY. Cette route n'acceptait QUE le premier format —
// sur un .env.local qui n'a que les 3 variables séparées, ça plantait
// systématiquement en "FIREBASE_SERVICE_ACCOUNT_JSON manquant" alors que
// send-push, lui, fonctionnait (même symptôme constaté sur periodic-checks).
// ============================================================
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0];

  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json && json.trim() !== '') {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(json);
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON malformé).');
    }
    return initializeApp({ credential: cert(serviceAccount) });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin n'est pas configuré : définis soit FIREBASE_SERVICE_ACCOUNT_JSON, " +
      'soit FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY dans .env.local.'
    );
  }

  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
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

// ⚠️ Même filtre que /api/send-push : un vrai token FCM contient toujours
// ':' et fait largement plus de 100 caractères. Un token APNs brut résiduel
// (hex 64 caractères sans ':') passait le seuil `length > 50` d'extractToken
// ci-dessus et se glissait dans le lot envoyé à sendEachForMulticast — qui
// rejette alors TOUT le chunk (erreur globale, pas de responses[] partiel)
// dès qu'un seul token du batch est mal formé. Résultat : pushSuccessCount
// retombe à 0 pour tout le chunk sans qu'aucune erreur ne remonte à l'admin,
// et aucun téléphone ne reçoit la notif. On filtre donc en amont ici aussi.
function isLikelyValidFcmToken(t: string): boolean {
  return typeof t === 'string' && t.includes(':') && t.length > 100;
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

// ⚠️ FIX (21/09) : le message par défaut lisait `product.location`, un champ
// qui n'existe sur AUCUN document `products` (le vrai champ s'appelle
// `region`, voir notifyRestockMatch/index.ts) — le texte envoyé affichait
// donc littéralement "Ce produit frais de undefined...". On utilise
// désormais le prix (toujours présent, et bien plus vendeur qu'une région)
// et on nomme la marketplace plutôt qu'un champ absent du document produit.
function formatFcfa(price: number, unit: string): string {
  return `${price.toLocaleString('fr-FR')} FCFA/${unit || 'unité'}`;
}

// Plusieurs variantes de repli, pour éviter d'envoyer littéralement la même
// phrase à chaque produit stagnant (répétitif = ignoré/désactivé par
// l'utilisateur). Reste honnête : pas de fausse urgence ("plus que 2 en
// stock"), juste un ton plus curieux et gourmand.
function buildFallbackVariants(name: string, priceLabel: string | null): { title: string; body: string }[] {
  const withPrice = (suffix: string) => (priceLabel ? `${suffix} à ${priceLabel}.` : `${suffix}.`);
  return [
    {
      title: `👀 ${name}, toujours dispo`,
      body: withPrice(`On garde ${name} bien au frais pour vous`) + ' Un coup d\'œil avant qu\'il ne parte ?',
    },
    {
      title: `🔥 ${name} vous attend`,
      body: withPrice(`Ce produit frais n'a pas encore trouvé preneur sur Sunu Mëñëf`) + ' Foncez le découvrir.',
    },
    {
      title: `🌿 Un secret bien gardé : ${name}`,
      body: withPrice(`Peu de gens l'ont encore repéré`) + ' À vous de jouer sur Sunu Mëñëf.',
    },
  ];
}

async function generatePromoCopy(product: {
  name: string; category: string; price: number; unit: string; region: string; isOrganic?: boolean;
}): Promise<{ title: string; body: string; icon: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const priceLabel = typeof product.price === 'number' && product.price > 0 ? formatFcfa(product.price, product.unit) : null;
  const variants = buildFallbackVariants(product.name, priceLabel);
  const picked = variants[Math.floor(Math.random() * variants.length)];
  const fallback = { title: picked.title, body: picked.body, icon: '🔥' };
  if (!apiKey) return fallback;

  try {
    const systemPrompt =
      "Tu es le rédacteur marketing de Sunu Mëñëf, une marketplace agricole sénégalaise. " +
      "On te donne un produit qui a été ajouté mais n'a encore reçu aucune commande. " +
      "Génère un titre court (max 45 caractères, avec un seul emoji pertinent en tête) et un message " +
      "(max 110 caractères) pour une notification push. Objectif : donner envie de rouvrir l'app tout de " +
      "suite — joue sur la curiosité (une trouvaille, un produit qu'on n'a pas encore vu, une question " +
      "qui donne envie de savoir), la fraîcheur et l'appétit, avec un ton chaleureux, local et direct, " +
      "comme un vendeur de marché qui vous interpelle avec le sourire. Varie les formulations d'un produit " +
      "à l'autre pour ne jamais sonner générique. Reste TOUJOURS honnête : jamais de mensonge ni de fausse " +
      "urgence artificielle (pas de \"plus que 2 en stock\" si c'est faux, pas de compte à rebours inventé). " +
      "Réponds UNIQUEMENT en JSON strict, sans texte autour, format exact : " +
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
            content: `Produit : ${product.name}\nCatégorie : ${product.category}\nPrix : ${product.price} FCFA / ${product.unit}\nRégion : ${product.region}\nBio : ${product.isOrganic ? 'oui' : 'non'}`,
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
  // ⚠️ FIX : getAdminApp()/getFirestore() étaient appelés HORS du try/catch
  // ci-dessous — une variable d'env manquante ou mal formée (typiquement
  // FIREBASE_SERVICE_ACCOUNT_JSON absente en dev local, injectée seulement
  // par Vercel en prod) faisait planter la route AVANT même l'authentification,
  // avec un 500 brut sans aucun message côté client ("Internal Server Error"
  // nu dans la console réseau, rien d'exploitable pour diagnostiquer). On
  // déplace tout dans le try/catch pour toujours renvoyer un message JSON clair.
  try {
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
        region: product.region,
        isOrganic: product.isOrganic,
      });

      // ── 4. Ciblage des tokens ────────────────────────────
      // scope 'region' : uniquement les utilisateurs de la même région que
      // le produit (évite de spammer tout le monde pour un produit local).
      // scope 'all' : tout le monde, comme le "Push à tous les tokens" admin.
      // ⚠️ FIX (21/09) : lisait `product.location` (champ inexistant) — le
      // ciblage régional ne matchait donc JAMAIS aucun utilisateur et
      // tombait systématiquement sur le repli "tous les tokens" ci-dessous,
      // même quand scope === 'region'. Le vrai champ est `region`.
      let tokens: string[] = [];
      if (settings.scope === 'region' && product.region) {
        const usersInRegion = await db.collection('users').where('region', '==', product.region).select().get();
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

      // Filtre les tokens mal formés AVANT l'envoi (cf. commentaire sur
      // isLikelyValidFcmToken) — sinon un seul token invalide dans le chunk
      // fait échouer tout le lot silencieusement.
      const validTokenCount = tokens.length;
      tokens = tokens.filter(isLikelyValidFcmToken);
      if (validTokenCount !== tokens.length) {
        console.warn(`[promote-stale-products] ${validTokenCount - tokens.length} token(s) mal formé(s) écarté(s) pour ${productId}.`);
      }

      let pushSuccessCount = 0;
      let pushFailureCount = 0;
      const invalidTokens: string[] = [];
      // ⚠️ FIX : `/product/${productId}` est un lien mort — aucune route
      // dynamique `/product/[id]` n'existe dans l'app (seulement
      // `/product?id=`, non lu non plus). On conduit vers la catégorie
      // complète du produit, comme Jumia/Alibaba le font pour leurs push
      // de relance produit.
      const deepLink = categoryLink(product.category, docSnap.id);

      for (let i = 0; i < tokens.length; i += 500) {
        const chunk = tokens.slice(i, i + 500);
        if (chunk.length === 0) continue;
        try {
          const multicast = await messaging.sendEachForMulticast({
            tokens: chunk,
            notification: { title: `${copy.icon} ${copy.title}`, body: copy.body },
            data: { deepLink, source: 'ai_promotion', productId, click_action: 'FLUTTER_NOTIFICATION_CLICK' },
            android: { priority: 'high', notification: { sound: 'default', channelId: 'agrimarche_default' } },
            apns: { payload: { aps: { sound: 'default' } } },
            webpush: {
              notification: { icon: '/icons/icon-192x192.png', badge: '/icons/badge-72x72.png' },
              fcmOptions: { link: absoluteAppLink(deepLink) },
            },
          });
          pushSuccessCount += multicast.successCount;
          pushFailureCount += multicast.failureCount;
          multicast.responses.forEach((r, idx) => {
            const code = r.error?.code;
            if (!r.success && (code === 'messaging/invalid-registration-token' || code === 'messaging/registration-token-not-registered')) {
              invalidTokens.push(chunk[idx]);
            }
          });
        } catch (e) {
          console.error(`[promote-stale-products] Erreur push produit ${productId}:`, e);
        }
      }

      // Nettoyage des tokens morts détectés pendant cet envoi, pour ne pas
      // les repayer en frais/latence à chaque prochaine exécution.
      if (invalidTokens.length > 0) {
        const invalidSet = new Set(invalidTokens);
        const tokenDocsSnap = await db.collectionGroup('tokens').get();
        const batch = db.batch();
        let removed = 0;
        tokenDocsSnap.docs.forEach((d) => {
          if (invalidSet.has(d.id) || invalidSet.has(d.data()?.token)) {
            batch.delete(d.ref);
            removed++;
          }
        });
        if (removed > 0) await batch.commit().catch((e) => console.warn('[promote-stale-products] Erreur nettoyage tokens invalides:', e));
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
