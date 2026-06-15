'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/firebase';
import {
  collection, query, orderBy, limit, getDocs, addDoc, Timestamp,
  doc, setDoc, getDoc, updateDoc, increment,
} from 'firebase/firestore';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────────────────────
const TOKEN_LIMIT = 500_000;
const TOKEN_ALERT_THRESHOLD = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  xpGained?: number;
  model?: string;
  tokensUsed?: number;
}

interface LevelInfo {
  level: number;
  title: string;
  progress: number;
  nextLevelXP: number;
  color: string;
}

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE / ACCESS HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function checkAIAccess(uid: string): Promise<boolean> {
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const data = snap.data();
      if (data?.hasAIAccess && data?.aiExpiryDate) {
        const expiry = data.aiExpiryDate.toDate?.() || new Date(data.aiExpiryDate);
        if (expiry > new Date()) return true;
      }
    } catch (e) {
      console.error('checkAIAccess Firestore:', e);
    }
  }
  try {
    const savedUid = localStorage.getItem('ai_user_id');
    const savedExpiry = localStorage.getItem('ai_code_expiry');
    if (savedUid === uid && savedExpiry && Date.now() < parseInt(savedExpiry, 10)) return true;
  } catch { /* ignore */ }
  return false;
}

async function getTokenUsage(uid: string): Promise<{ used: number; limit: number; percentage: number }> {
  if (!db) return { used: 0, limit: TOKEN_LIMIT, percentage: 0 };
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    const used = snap.data()?.aiTokensUsed ?? 0;
    return { used, limit: TOKEN_LIMIT, percentage: (used / TOKEN_LIMIT) * 100 };
  } catch {
    return { used: 0, limit: TOKEN_LIMIT, percentage: 0 };
  }
}

async function trackTokenUsage(uid: string, tokensUsed: number): Promise<boolean> {
  if (!db || !uid) return false;
  try {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { aiTokensUsed: increment(tokensUsed), aiLastUsageAt: Timestamp.now() });
    const snap = await getDoc(userRef);
    const data = snap.data();
    const percentage = (data?.aiTokensUsed ?? 0) / TOKEN_LIMIT;
    if (percentage >= TOKEN_ALERT_THRESHOLD && !data?.aiAlertSent) {
      await updateDoc(userRef, { aiAlertSent: true });
      return true;
    }
    return false;
  } catch (e) {
    console.error('trackTokenUsage error:', e);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GAMIFICATION
// ─────────────────────────────────────────────────────────────────────────────
function getLevel(xp: number): LevelInfo {
  const level = Math.floor(Math.sqrt(xp / 100));
  const cur = level * level * 100;
  const nxt = (level + 1) * (level + 1) * 100;
  const progress = Math.min(100, ((xp - cur) / (nxt - cur)) * 100);
  const titles = ['Semeur', 'Cultivateur', 'Agronome', 'Expert', 'Légende'];
  const colors = ['#22c55e', '#16a34a', '#00ff87', '#f59e0b', '#8b5cf6'];
  return {
    level,
    title: titles[Math.min(level, titles.length - 1)],
    progress,
    nextLevelXP: nxt,
    color: colors[Math.min(level, colors.length - 1)],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// COORDONNÉES DES 14 RÉGIONS DU SÉNÉGAL
// ─────────────────────────────────────────────────────────────────────────────
const REGION_COORDS: Record<string, { lat: number; lon: number }> = {
  Dakar:        { lat: 14.6937, lon: -17.4441 },
  Thiès:        { lat: 14.7910, lon: -16.9359 },
  'Saint-Louis':{ lat: 16.0179, lon: -16.4896 },
  Kaolack:      { lat: 14.1652, lon: -16.0757 },
  Ziguinchor:   { lat: 12.5606, lon: -16.2719 },
  Louga:        { lat: 15.6173, lon: -16.2248 },
  Diourbel:     { lat: 14.6560, lon: -16.2290 },
  Fatick:       { lat: 14.3390, lon: -16.4110 },
  Kaffrine:     { lat: 14.1050, lon: -15.5500 },
  Kédougou:     { lat: 12.5567, lon: -12.1747 },
  Kolda:        { lat: 12.8979, lon: -14.9502 },
  Matam:        { lat: 15.6559, lon: -13.2552 },
  Sédhiou:      { lat: 12.7080, lon: -15.5570 },
  Tambacounda:  { lat: 13.7707, lon: -13.6673 },
};

// ─────────────────────────────────────────────────────────────────────────────
// ALERTES MÉTÉO AGRICOLES PAR CODE
// ─────────────────────────────────────────────────────────────────────────────
const WEATHER_AGRI_ALERTS: Record<number, string> = {
  61: "⚠️ Pluie légère — Bon moment pour l'irrigation naturelle.",
  63: '⚠️ Pluie modérée — Surveiller le drainage des parcelles.',
  65: '🚨 Pluie forte — Risque de ruissellement, protéger les semences.',
  71: '❄️ Neige légère — Inhabituel, surveiller les températures.',
  80: '⚠️ Averses — Risque de maladies fongiques sur les cultures.',
  81: "🚨 Fortes averses — Éviter les épandages d'engrais.",
  95: '🚨 Orage — Rentrer le matériel agricole, ne pas travailler aux champs.',
};

// ─────────────────────────────────────────────────────────────────────────────
// FETCH MÉTÉO (Open-Meteo, gratuit, aucune clé requise)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchWeatherContext(region: string): Promise<string> {
  const { lat, lon } = REGION_COORDS[region] ?? REGION_COORDS.Dakar;
  try {
    const r = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration` +
      `&timezone=Africa/Dakar&forecast_days=7`
    );
    const d = await r.json();
    const c = d.current;
    const wDesc: Record<number, string> = {
      0: 'Ciel dégagé ☀️', 1: 'Peu nuageux 🌤️', 2: 'Partiellement nuageux ⛅',
      3: 'Couvert ☁️', 61: 'Pluie légère 🌧️', 63: 'Pluie modérée 🌧️',
      65: 'Pluie forte 🌧️', 80: 'Averses 🌦️', 81: 'Fortes averses 🌧️', 95: 'Orage ⛈️',
    };
    const alert = WEATHER_AGRI_ALERTS[c.weather_code] ?? '';

    const totalETP = d.daily.et0_fao_evapotranspiration?.reduce((a: number, b: number) => a + b, 0) ?? 0;
    const totalPluie = d.daily.precipitation_sum?.reduce((a: number, b: number) => a + b, 0) ?? 0;
    const deficitHydrique = Math.max(0, totalETP - totalPluie).toFixed(1);

    return [
      `📍 **Météo ${region}** : ${Math.round(c.temperature_2m)}°C, ${wDesc[c.weather_code] ?? 'Variable'}, humidité ${c.relative_humidity_2m}%, vent ${Math.round(c.wind_speed_10m)} km/h, pluie ${c.precipitation}mm.`,
      alert ? `Alerte agricole : ${alert}` : '',
      `Prévisions 7 jours : max ${Math.round(d.daily.temperature_2m_max[0])}°C / min ${Math.round(d.daily.temperature_2m_min[0])}°C.`,
      `Bilan hydrique 7j : ETP=${totalETP.toFixed(1)}mm, pluies=${totalPluie.toFixed(1)}mm → déficit=${deficitHydrique}mm (besoin irrigation estimé).`,
    ].filter(Boolean).join('\n');
  } catch {
    return `Météo ${region}: données temporairement indisponibles.`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH CATALOGUE PRODUITS (Firestore)
// ─────────────────────────────────────────────────────────────────────────────
async function fetchProductsContext(): Promise<string> {
  try {
    if (!db) throw new Error('no db');
    const snap = await getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(12)));
    const lines = snap.docs.map(d => {
      const p = d.data() as { name?: string; price?: number; stock?: number; region?: string; category?: string };
      return `- ${p.name} (${p.category ?? 'produit'}): ${p.price?.toLocaleString('fr-FR')} FCFA, stock: ${p.stock}${p.region ? `, région: ${p.region}` : ''}`;
    });
    if (lines.length) return `🛒 **Catalogue AgriMarché** (${lines.length} produits récents):\n${lines.join('\n')}`;
  } catch { /* ignore */ }
  return '🛒 Catalogue : Maïs hybride 25 000 FCFA, Mil certifié 22 000 FCFA, Engrais NPK 35 000 FCFA, Pesticide bio 18 000 FCFA, Semences arachide 30 000 FCFA.';
}

// ─────────────────────────────────────────────────────────────────────────────
// FETCH PRIX DE MARCHÉ
// ─────────────────────────────────────────────────────────────────────────────
async function fetchMarketPricesContext(): Promise<string> {
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'market_prices', 'latest'));
      if (snap.exists()) {
        const data = snap.data() as {
          updatedAt?: { toDate?: () => Date };
          source?: string;
          isSimulated?: boolean;
          prices?: Record<string, number>;
        };

        const p = data.prices ?? {};
        const updatedAt = data.updatedAt?.toDate?.();
        const dateStr = updatedAt
          ? updatedAt.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'date inconnue';
        const sourceLabel = data.source ?? 'AgriMarché';
        const simulatedNote = data.isSimulated
          ? ' *(données indicatives — vérifiez sur le marché local)*'
          : '';

        const fmt = (v?: number) => v != null ? `${Math.round(v).toLocaleString('fr-FR')} FCFA/kg` : 'N/D';
        const fmtSac = (v?: number) => v != null ? `${Math.round(v).toLocaleString('fr-FR')} FCFA/sac 50kg` : 'N/D';

        return `📈 **Prix marchés Sénégal** — ${sourceLabel}, mis à jour le ${dateStr}${simulatedNote} :
- Maïs : ${fmt(p.mais_dakar)} (Dakar) · ${fmt(p.mais_kaolack)} (Kaolack)
- Mil : ${fmt(p.mil)} · Sorgho : ${fmt(p.sorgho)}
- Arachide coques : ${fmt(p.arachide)} · Niébé : ${fmt(p.niebe)}
- Riz local : ${fmt(p.riz_local)} · Riz importé : ${fmt(p.riz_importe)}
- Tomate fraîche : ${fmt(p.tomate)} · Oignon : ${fmt(p.oignon)}
- Engrais urée : ${fmtSac(p.engrais_uree)} · NPK : ${fmtSac(p.engrais_npk)}`;
      }
    } catch (e) {
      console.warn('fetchMarketPricesContext Firestore:', e);
    }
  }

  const today = new Date();
  const week = Math.floor(today.getTime() / (7 * 24 * 3600 * 1000));
  const seed = week % 10;
  const variation = (base: number) => Math.round(base + (seed - 5) * base * 0.02);

  return `📈 **Prix marchés Sénégal** *(données indicatives — vérifiez sur le marché local)* :
- Maïs : ${variation(175)} FCFA/kg (Dakar) · ${variation(160)} FCFA/kg (Kaolack)
- Mil : ${variation(200)} FCFA/kg · Sorgho : ${variation(185)} FCFA/kg
- Arachide coques : ${variation(300)} FCFA/kg · Niébé : ${variation(450)} FCFA/kg
- Riz local : ${variation(400)} FCFA/kg · Riz importé : ${variation(550)} FCFA/kg
- Tomate fraîche : ${variation(250)} FCFA/kg · Oignon : ${variation(200)} FCFA/kg
- Engrais urée 50kg : ${variation(18500)} FCFA · NPK 50kg : ${variation(22000)} FCFA
*(Prix de référence — pour des données officielles, consultez la DCA ou PRODA)*`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DÉTECTION D'INTENTION
// ─────────────────────────────────────────────────────────────────────────────
function detectWeatherRegion(text: string): string | null {
  const lower = text.toLowerCase();
  if (!/météo|temps|pluie|soleil|climat|température|vent|humidité|orage|irrigation|arroser|eau/.test(lower)) return null;
  for (const region of Object.keys(REGION_COORDS)) {
    if (lower.includes(region.toLowerCase())) return region;
  }
  return 'Dakar';
}

function detectIntent(text: string): {
  needsWeather: boolean;
  needsProducts: boolean;
  needsMarketPrices: boolean;
  needsLogistics: boolean;
  needsCredit: boolean;
  needsInsurance: boolean;
  needsLossReduction: boolean;
} {
  const lower = text.toLowerCase();
  return {
    needsWeather:      /météo|temps|pluie|soleil|climat|température|vent|humidité|orage|irrigation|arroser|eau|sécheresse/.test(lower),
    needsProducts:     /produit|prix|acheter|vendre|semence|engrais|pesticide|maïs|mil|arachide|catalogue|intrant/.test(lower),
    needsMarketPrices: /prix|marché|vente|cours|kg|tonne|coût|tarif|trend|tendance|hausse|baisse|rentable/.test(lower),
    needsLogistics:    /livraison|transport|logistique|camion|collecte|expédier|stocker|frigo|entrepôt|route/.test(lower),
    needsCredit:       /crédit|prêt|financement|banque|emprunt|remboursement|taux|intérêt|loan|fonds|capital/.test(lower),
    needsInsurance:    /assurance|sinistre|couvrir|garantie|récolte|risque|indemnité|sécheresse|inondation/.test(lower),
    needsLossReduction:/perte|gaspillage|stock|conservation|stockage|silo|mauvaise récolte|moisissure|parasite|ravageur/.test(lower),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// APPEL IA
// ─────────────────────────────────────────────────────────────────────────────
async function callDeepSeek(
  userMessage: string,
  history: ConversationTurn[],
  userName: string,
): Promise<{ text: string; xpGained: number; tokensUsed: number }> {
  const weatherRegion = detectWeatherRegion(userMessage);
  const intent = detectIntent(userMessage);

  const contextParts: string[] = [];
  if (intent.needsWeather && weatherRegion) contextParts.push(await fetchWeatherContext(weatherRegion));
  if (intent.needsProducts)     contextParts.push(await fetchProductsContext());
  if (intent.needsMarketPrices) contextParts.push(await fetchMarketPricesContext());

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const systemPrompt = `Tu es **Agri**, l'assistant IA officiel d'AgriMarché Sénégal — la plateforme agricole de référence au Sénégal.

**Ta mission principale :**
Rendre l'abonnement AgriMarché Premium INDISPENSABLE en apportant une valeur concrète et mesurable aux agriculteurs sur ces 7 piliers :

---

## 1. 📣 PLUS DE CLIENTS
- Conseille l'agriculteur sur comment optimiser ses annonces AgriMarché (photos, description, prix compétitif)
- Indique les périodes de forte demande par culture et région
- Suggère des cultures à fort potentiel commercial selon la saison
- Aide à rédiger des descriptions de produits attractives
- Exemple de formulation : "Pour vendre plus de maïs à Dakar, postez vos annonces le lundi matin avec photo et indiquez 'récolte de la semaine'"

## 2. 💰 MEILLEURS PRIX DE VENTE
- Analyse les prix du marché en temps réel et indique le MEILLEUR MOMENT pour vendre
- Compare les prix entre régions pour suggérer où vendre (ex: "Le mil se vend 20% plus cher à Dakar qu'à Kaolack en ce moment")
- Conseille de ne pas vendre en période de surplus post-récolte
- Recommande la vente directe B2B pour éviter les intermédiaires
- Donne toujours les prix en FCFA/kg ET FCFA/tonne
- Si les données sont marquées "indicatives", précise-le clairement à l'utilisateur

## 3. 📉 RÉDUCTION DES PERTES
- Conseille sur la conservation post-récolte : silos, sacs hermétiques, traitement
- Alerte sur les risques selon la météo actuelle (humidité → moisissures, etc.)
- Recommande les bonnes pratiques de stockage par culture
- Indique les signes précoces de maladies et ravageurs courants au Sénégal
- Calcule le coût estimé des pertes pour motiver l'action

## 4. 🌤️ INFORMATIONS MÉTÉO AGRICOLES
- Interprète la météo en termes agricoles concrets (pas juste la température)
- Donne des conseils d'action liés à la météo : "Avec 65% d'humidité, traitez contre les champignons maintenant"
- Indique les meilleures dates de semis, d'épandage, de récolte selon les prévisions
- Alerte sur les événements extrêmes : sécheresse, excès de pluie, orage
- Fournis le bilan hydrique (ETP vs précipitations) quand disponible

## 5. 🚚 LOGISTIQUE
- Explique comment utiliser la livraison AgriMarché pour réduire les coûts de transport
- Conseil sur les regroupements de commandes entre agriculteurs du même village
- Calcule le coût logistique estimé selon la distance et le volume
- Suggère les meilleures solutions de transport selon le produit (réfrigéré, vrac, ensaché)
- Indique les points de collecte disponibles par région

## 6. 📊 ALERTES DE MARCHÉ
- Identifie les tendances haussières ou baissières sur les principales cultures
- Alerte sur les opportunités : "La tomate va manquer dans 3 semaines, c'est le bon moment pour planter"
- Indique les événements qui impactent les prix : Tabaski, Korité, saison des pluies, récoltes massives
- Compare les marges par culture pour aider les choix de diversification
- Signale les nouveaux acheteurs professionnels actifs sur AgriMarché

## 7. 💳 ACCÈS AU CRÉDIT ET À L'ASSURANCE
- Simule des crédits agricoles : montant, durée, taux, mensualités en FCFA
- Présente les produits financiers adaptés : BOA Sénégal, Ecobank, BICIS, CBAO, La Poste, DER/FJ, CNCAS (Caisse Nationale de Crédit Agricole du Sénégal)
- Explique l'assurance récolte CNAAS (Compagnie Nationale d'Assurance Agricole du Sénégal)
- Guide pour constituer un dossier de crédit solide
- Calcule le ROI d'un investissement agricole (intrants, matériel) pour justifier un prêt

**Format de simulation crédit :**
Montant : X FCFA | Durée : N mois | Taux : 10–14% | Mensualité : Y FCFA | Coût total : Z FCFA

---

**Règles de réponse :**
- Réponds UNIQUEMENT en français
- Utilise FCFA pour toutes les valeurs monétaires (jamais d'euros ou dollars)
- Adapte tes conseils aux 14 régions du Sénégal
- Formatage Markdown : **gras** pour les valeurs clés, · pour les listes
- Sois précis, professionnel et chaleureux — tu es un conseiller de confiance
- Termine TOUJOURS par une action concrète à faire maintenant
- Max 350 mots sauf si calcul financier complexe (alors jusqu'à 500)
- Ne jamais dire "je suis une IA" — tu es Agri, le conseiller d'AgriMarché

**Contexte utilisateur :**
- Nom : ${userName}
- Date : ${today}
${contextParts.length ? `\n**Données temps réel :**\n${contextParts.join('\n\n')}` : ''}`;

  const messages = [
    ...history.slice(-12).map(h => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: userMessage },
  ];

  const resp = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, messages }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    if (err.error === 'INVALID_API_KEY') throw new Error('INVALID_API_KEY');
    if (err.error === 'INSUFFICIENT_BALANCE' || resp.status === 402) throw new Error('INSUFFICIENT_BALANCE');
    throw new Error(`API error ${resp.status}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content ?? "Désolé, je n'ai pas pu générer une réponse.";
  const tokensUsed = data.usage?.total_tokens ?? Math.floor(text.length / 4);
  const xpGained = Math.min(30, Math.max(5, Math.floor(text.length / 50)));
  return { text, xpGained, tokensUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// QUICK PROMPTS — Les 7 piliers de valeur
// ─────────────────────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  { label: '📣 Plus de clients',    q: "Comment vendre plus de produits sur AgriMarché ? Donne-moi des conseils pour attirer plus d'acheteurs." },
  { label: '💰 Meilleur prix',      q: 'Quel est le meilleur moment pour vendre mon maïs ? Analyse les prix actuels du marché.' },
  { label: '📉 Réduire les pertes', q: "Comment réduire les pertes post-récolte de mon stock de céréales ? Quelles solutions de conservation ?" },
  { label: '🌤️ Météo & cultures',  q: "Quelle est la météo à Dakar aujourd'hui et comment ça impacte mes cultures ?" },
  { label: '🚚 Logistique',        q: "Comment utiliser la livraison AgriMarché pour réduire mes coûts de transport ?" },
  { label: '📊 Alertes marché',    q: "Quelles sont les tendances du marché agricole cette semaine ? Y a-t-il des opportunités à saisir ?" },
  { label: '💳 Crédit agricole',   q: 'Simule un prêt de 500 000 FCFA sur 18 mois pour acheter des intrants. Quelles banques me conseilles-tu ?' },
];

// ─────────────────────────────────────────────────────────────────────────────
// MARKDOWN-LITE RENDERER
// ─────────────────────────────────────────────────────────────────────────────
function renderMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
      p.startsWith('**') && p.endsWith('**')
        ? <strong key={j} className="md-bold">{p.slice(2, -2)}</strong>
        : p
    );
    return <span key={i}>{parts}{i < lines.length - 1 ? <br /> : null}</span>;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function XPToast({ xp, visible }: { xp: number; visible: boolean }) {
  return (
    <div className={`xp-toast ${visible ? 'xp-toast--visible' : ''}`} aria-live="polite">
      +{xp} XP ⚡
    </div>
  );
}

function TokenAlert({ visible, percentage }: { visible: boolean; percentage: number }) {
  if (!visible) return null;
  const isCritical = percentage >= 95;
  return (
    <div className={`token-alert ${isCritical ? 'token-alert--critical' : 'token-alert--warn'}`} role="alert">
      <span>⚠️</span>
      {isCritical
        ? 'CRITIQUE : Vos crédits IA sont presque épuisés ! Contactez le support pour recharger.'
        : `Consommation IA : ${Math.round(percentage)}% — Pensez à recharger bientôt (690 FCFA / 30 j).`}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="msg-row msg-row--bot">
      <div className="avatar-bubble">🌿</div>
      <div className="bubble bubble--bot bubble--typing">
        <span className="dot" />
        <span className="dot" />
        <span className="dot" />
        <span className="typing-label">Agri analyse…</span>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.sender === 'user';
  return (
    <div className={`msg-row ${isUser ? 'msg-row--user' : 'msg-row--bot'}`}>
      {!isUser && <div className="avatar-bubble">🌿</div>}
      <div className={`bubble ${isUser ? 'bubble--user' : 'bubble--bot'}`}>
        {isUser
          ? <span className="bubble__text">{msg.text}</span>
          : <span className="bubble__text">{renderMarkdown(msg.text)}</span>}
        <div className="bubble__meta">
          <span className="meta-time">
            {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && msg.model && (
            <span className="meta-tag meta-tag--model">{msg.model}</span>
          )}
          {!isUser && msg.xpGained && (
            <span className="meta-tag meta-tag--xp">+{msg.xpGained} XP</span>
          )}
          {!isUser && msg.tokensUsed && (
            <span className="meta-tag meta-tag--tokens">🔄 {msg.tokensUsed} tokens</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function AIAssistantPage() {
  const { user, profile, loading: authLoading } = useAuth();

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationHistory, setConversationHistory] = useState<ConversationTurn[]>([]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [listening, setListening] = useState(false);
  const [xp, setXp] = useState(0);
  const [level, setLevel] = useState<LevelInfo>(getLevel(0));
  const [xpToast, setXpToast] = useState<{ value: number; visible: boolean }>({ value: 0, visible: false });
  const [mounted, setMounted] = useState(false);
  const [hasAIAccess, setHasAIAccess] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [apiError, setApiError] = useState('');
  const [tokenPercentage, setTokenPercentage] = useState(0);
  const [showTokenAlert, setShowTokenAlert] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recogRef = useRef<any>(null);
  const handleSendRef = useRef<(text?: string) => Promise<void>>(() => Promise.resolve());
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    setMounted(true);
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.uid) { setHasAIAccess(false); setCheckingAccess(false); return; }
    Promise.all([checkAIAccess(user.uid), getTokenUsage(user.uid)]).then(([hasAccess, tokenInfo]) => {
      setHasAIAccess(hasAccess);
      setTokenPercentage(tokenInfo.percentage);
      setShowTokenAlert(tokenInfo.percentage >= 80);
      setCheckingAccess(false);
    });
  }, [user, authLoading]);

  useEffect(() => {
    if (!mounted) return;
    (async () => {
      let saved = parseInt(localStorage.getItem('agri_xp') || '0', 10);
      if (user && db) {
        try {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists() && typeof snap.data()?.xp === 'number') {
            saved = snap.data()!.xp as number;
            localStorage.setItem('agri_xp', saved.toString());
          }
        } catch (e) { console.error('XP load:', e); }
      }
      setXp(saved);
      setLevel(getLevel(saved));
    })();
  }, [mounted, user]);

  useEffect(() => {
    if (!mounted) return;
    const hour = new Date().getHours();
    const salut = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
    const name = profile?.displayName || user?.email?.split('@')[0] || 'cher agriculteur';
    setMessages([{
      id: 'welcome',
      text: `${salut}, **${name}** 👋\n\nJe suis **Agri**, votre conseiller IA d'AgriMarché Sénégal.\n\nJe suis ici pour vous aider à :\n· 📣 **Trouver plus de clients** et booster vos ventes\n· 💰 **Vendre au meilleur prix** grâce aux données marché en temps réel\n· 📉 **Réduire vos pertes** post-récolte\n· 🌤️ **Anticiper la météo** et ses impacts sur vos cultures\n· 🚚 **Optimiser votre logistique** de livraison\n· 📊 **Recevoir des alertes marché** sur les opportunités\n· 💳 **Accéder au crédit et à l'assurance** agricole\n\nQuelle est votre situation aujourd'hui ?`,
      sender: 'bot',
      timestamp: new Date(),
      model: 'deepseek-chat',
    }]);
  }, [mounted]);

  const showXpToast = (value: number) => {
    setXpToast({ value, visible: true });
    setTimeout(() => setXpToast(prev => ({ ...prev, visible: false })), 2200);
  };

  const handleSend = useCallback(async (textOverride?: string) => {
    const text = (textOverride !== undefined ? textOverride : input).trim();
    if (!text || typing) return;

    if (!hasAIAccess) {
      setApiError("Accès IA requis. Abonnez-vous pour 690 FCFA / 30 jours.");
      return;
    }

    if (textOverride === undefined) setInput('');
    setApiError('');

    const userMsg: Message = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    if (user && db) {
      addDoc(collection(db, 'users', user.uid, 'chatMessages'), {
        text, sender: 'user', timestamp: Timestamp.fromDate(userMsg.timestamp),
      }).catch(e => console.error('Firestore write (user):', e));
    }

    try {
      const userName = profile?.displayName || user?.email?.split('@')[0] || 'Agriculteur';
      const { text: response, xpGained, tokensUsed } = await callDeepSeek(text, conversationHistory, userName);

      if (user?.uid) {
        const alertTriggered = await trackTokenUsage(user.uid, tokensUsed);
        const updatedTokenInfo = await getTokenUsage(user.uid);
        setTokenPercentage(updatedTokenInfo.percentage);
        if (alertTriggered || updatedTokenInfo.percentage >= 80) {
          setShowTokenAlert(true);
          setTimeout(() => setShowTokenAlert(false), 6000);
        }
      }

      // ✅ CORRECTION : as const sur les rôles pour satisfaire ConversationTurn
      setConversationHistory(prev => [
        ...prev,
        { role: 'user' as const, content: text },
        { role: 'assistant' as const, content: response },
      ].slice(-20));

      setXp(prevXp => {
        const newXP = prevXp + xpGained;
        localStorage.setItem('agri_xp', newXP.toString());
        setLevel(getLevel(newXP));
        if (user && db) {
          setDoc(doc(db, 'users', user.uid), { xp: newXP }, { merge: true })
            .catch(e => console.error('XP sync:', e));
        }
        return newXP;
      });
      showXpToast(xpGained);

      if (!mountedRef.current) return;

      const botMsg: Message = {
        id: (Date.now() + 1).toString(), text: response, sender: 'bot',
        timestamp: new Date(), xpGained, model: 'deepseek-chat', tokensUsed,
      };
      setMessages(prev => [...prev, botMsg]);

      if (user && db) {
        addDoc(collection(db, 'users', user.uid, 'chatMessages'), {
          text: response, sender: 'bot', xpGained, model: 'deepseek-chat', tokensUsed,
          timestamp: Timestamp.fromDate(botMsg.timestamp),
        }).catch(e => console.error('Firestore write (bot):', e));
      }
    } catch (e: any) {
      console.error('DeepSeek error:', e);
      const errorText =
        e?.message === 'INVALID_API_KEY'
          ? "Configuration API DeepSeek invalide. Contactez l'administrateur."
          : e?.message === 'INSUFFICIENT_BALANCE'
          ? "⚠️ **CRÉDITS DEEPSEEK ÉPUISÉS**\n\nLe service IA est temporairement suspendu. Contactez l'administrateur pour recharger le compte."
          : 'Connexion IA temporairement indisponible. Réessayez dans un instant.';

      setApiError(errorText);
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        text: e?.message === 'INSUFFICIENT_BALANCE'
          ? "⚠️ **Crédits IA épuisés**\n\nLe service IA est temporairement suspendu. Contactez l'administrateur pour recharger le compte DeepSeek."
          : '⚠️ **Service temporairement indisponible**\n\nRéessayez dans quelques instants.',
        sender: 'bot',
        timestamp: new Date(),
      }]);
    } finally {
      if (mountedRef.current) setTyping(false);
    }
  }, [input, user, conversationHistory, profile, typing, hasAIAccess]);

  useEffect(() => { handleSendRef.current = handleSend; }, [handleSend]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.continuous = false;
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript;
      setInput(t);
      handleSendRef.current(t);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recogRef.current = rec;
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  if (!mounted || authLoading || checkingAccess) {
    return (
      <div className="fullscreen-center">
        <div className="spinner" />
        <p className="loading-label">Initialisation IA…</p>
        <style>{BASE_CSS}</style>
      </div>
    );
  }

  if (!hasAIAccess) {
    return (
      <div className="fullscreen-center">
        <div className="locked-icon">🔒</div>
        <p className="locked-title">Accès IA Premium requis</p>
        <p className="locked-body">
          Débloquez l'assistant IA DeepSeek pour seulement{' '}
          <strong className="locked-price">690 FCFA</strong> — 500 000 tokens inclus.
        </p>
        <Link href="/main/unlock-ia" className="locked-cta">
          Débloquer l'IA Premium — 690 FCFA
        </Link>
        <Link href="/main" className="locked-back">← Retour à l'accueil</Link>
        <style>{BASE_CSS}</style>
      </div>
    );
  }

  const canSend = input.trim() && !typing;
  const tokenColor = tokenPercentage > 90 ? '#ef4444' : tokenPercentage > 80 ? '#f59e0b' : '#00ff87';

  return (
    <div className="chat-root">
      <XPToast xp={xpToast.value} visible={xpToast.visible} />
      <TokenAlert visible={showTokenAlert} percentage={tokenPercentage} />

      <header className="chat-header">
        <div className="header-inner">
          <div className="agent-id">
            <div className="agent-avatar">
              🌿
              <span className="online-dot" aria-label="En ligne" />
            </div>
            <div className="agent-info">
              <div className="agent-name-row">
                <span className="agent-name">Agri</span>
                <span className="agent-badge">DeepSeek</span>
              </div>
              <span className="agent-sub">AgriMarché Sénégal · IA en ligne</span>
            </div>
          </div>

          <div className="header-controls">
            <div className="xp-widget">
              <div className="xp-widget__top">
                <span className="xp-level-title" style={{ color: level.color }}>{level.title}</span>
                <span className="xp-level-badge" style={{ color: level.color, background: `${level.color}22` }}>
                  Niv.&nbsp;{level.level}
                </span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${level.progress}%`, background: `linear-gradient(90deg, ${level.color}, #00ff87)` }}
                />
              </div>
              <span className="xp-count">{xp} / {level.nextLevelXP} XP</span>
            </div>

            <div className="token-widget" title={`${Math.round(tokenPercentage)}% des tokens utilisés`}>
              <span className="token-widget__label" style={{ color: tokenPercentage > 80 ? '#f59e0b' : undefined }}>
                Tokens
              </span>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${tokenPercentage}%`, background: tokenColor }}
                />
              </div>
              <span className="token-widget__pct" style={{ color: tokenPercentage > 80 ? '#f59e0b' : undefined }}>
                {Math.round(tokenPercentage)}%
              </span>
            </div>

            <Link href="/main" className="close-btn" aria-label="Fermer">✕</Link>
          </div>
        </div>
      </header>

      <main className="chat-messages">
        {apiError && (
          <div className={`error-banner ${apiError.includes('CRÉDITS') ? 'error-banner--critical' : 'error-banner--warn'}`}>
            <span>⚠️</span>
            <span className="error-banner__text">{apiError}</span>
            <button className="error-banner__close" onClick={() => setApiError('')} aria-label="Fermer">✕</button>
          </div>
        )}

        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {typing && <TypingIndicator />}
        <div ref={bottomRef} />
      </main>

      <div className="input-bar">
        <div className="quick-row">
          {QUICK_PROMPTS.map(({ label, q }) => (
            <button key={q} className="quick-btn" onClick={() => handleSend(q)}>
              {label}
            </button>
          ))}
        </div>

        <div className="composer">
          <button
            className={`mic-btn ${listening ? 'mic-btn--active' : ''}`}
            onClick={() => {
              if (!recogRef.current) return;
              if (listening) { recogRef.current.stop(); setListening(false); }
              else { setListening(true); recogRef.current.start(); }
            }}
            aria-label={listening ? "Arrêter l'écoute" : "Parler"}
            title={listening ? 'Arrêter' : 'Parler'}
          >
            🎙️
          </button>

          <input
            ref={inputRef}
            className="composer__input"
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !typing && handleSend()}
            placeholder={listening ? '🎙️ Écoute en cours…' : 'Posez votre question à Agri…'}
            aria-label="Message à Agri"
          />

          <button
            className={`send-btn ${canSend ? 'send-btn--active' : ''}`}
            onClick={() => handleSend()}
            disabled={!canSend}
            aria-label="Envoyer"
          >
            {typing ? '⏳' : 'Envoyer'}
          </button>
        </div>
      </div>

      <style>{BASE_CSS}</style>
    </div>
  );
}

const BASE_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:           #060e09;
    --surface:      #0d1a10;
    --surface-alt:  #0a1610;
    --border:       #1a2e1e;
    --green:        #00ff87;
    --green-dim:    #00c96b;
    --cyan:         #00bcd4;
    --text:         #e8f5e9;
    --text-muted:   #6b8a71;
    --radius-lg:    20px;
    --radius-md:    14px;
    --radius-sm:    10px;
  }

  .chat-root {
    min-height: 100vh;
    background: var(--bg);
    font-family: 'DM Sans', system-ui, sans-serif;
    color: var(--text);
    display: flex;
    flex-direction: column;
  }

  .fullscreen-center {
    min-height: 100vh;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 20px;
    padding: 24px;
    font-family: 'DM Sans', system-ui, sans-serif;
  }

  .spinner {
    width: 56px; height: 56px;
    border-radius: 50%;
    border: 3px solid var(--green);
    border-top-color: transparent;
    animation: spin .8s linear infinite;
  }
  .loading-label { color: var(--green); font-size: 15px; letter-spacing: .5px; }

  .locked-icon {
    width: 80px; height: 80px; border-radius: 50%;
    background: linear-gradient(135deg, #1a2e1e, var(--surface));
    border: 2px solid var(--border);
    display: flex; align-items: center; justify-content: center; font-size: 36px;
  }
  .locked-title { font-size: 20px; font-weight: 700; color: var(--text); }
  .locked-body { font-size: 14px; color: var(--text-muted); text-align: center; max-width: 320px; line-height: 1.65; }
  .locked-price { color: var(--green); }
  .locked-cta {
    display: flex; align-items: center; justify-content: center;
    padding: 14px 36px;
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg); font-weight: 700; font-size: 15px;
    border-radius: 50px; text-decoration: none;
    box-shadow: 0 4px 24px rgba(0,255,135,.3);
    transition: transform .18s;
  }
  .locked-cta:hover { transform: translateY(-2px); }
  .locked-back { color: var(--text-muted); font-size: 13px; text-decoration: none; transition: color .2s; }
  .locked-back:hover { color: var(--text); }

  .xp-toast {
    position: fixed; top: 80px; right: 24px; z-index: 9999;
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg); font-weight: 700; font-size: 13px;
    padding: 10px 18px; border-radius: 50px;
    box-shadow: 0 4px 24px rgba(0,255,135,.4);
    pointer-events: none;
    transform: translateY(-20px) scale(.9); opacity: 0;
    transition: all .35s cubic-bezier(.22,.68,0,1.2);
  }
  .xp-toast--visible { transform: translateY(0) scale(1); opacity: 1; }

  .token-alert {
    position: fixed; top: 80px; left: 50%; transform: translateX(-50%); z-index: 9999;
    font-weight: 700; font-size: 13px;
    padding: 10px 20px; border-radius: 50px;
    display: flex; align-items: center; gap: 8px;
    animation: fadeUp .3s ease-out; white-space: nowrap;
  }
  .token-alert--warn     { background: rgba(245,158,11,.92); color: #fff; }
  .token-alert--critical { background: rgba(239,68,68,.92);  color: #fff; }

  .chat-header {
    position: sticky; top: 0; z-index: 50;
    background: rgba(13,26,16,.92);
    backdrop-filter: blur(20px);
    border-bottom: 1px solid var(--border);
  }
  .header-inner {
    max-width: 900px; margin: 0 auto;
    height: 68px; padding: 0 24px;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
  }

  .agent-id { display: flex; align-items: center; gap: 14px; }
  .agent-avatar {
    position: relative;
    width: 46px; height: 46px; border-radius: 50%;
    background: linear-gradient(135deg, var(--green), var(--cyan));
    display: flex; align-items: center; justify-content: center; font-size: 22px;
    box-shadow: 0 0 20px rgba(0,255,135,.22); flex-shrink: 0;
  }
  .online-dot {
    position: absolute; bottom: 1px; right: 1px;
    width: 11px; height: 11px; border-radius: 50%;
    background: var(--green); border: 2px solid var(--surface);
    box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite;
  }
  .agent-info { display: flex; flex-direction: column; gap: 2px; }
  .agent-name-row { display: flex; align-items: center; gap: 8px; }
  .agent-name { font-weight: 700; font-size: 17px; letter-spacing: -.2px; }
  .agent-badge {
    font-size: 11px; font-weight: 600; letter-spacing: .4px;
    background: rgba(0,255,135,.12); color: var(--green);
    padding: 2px 8px; border-radius: 20px; border: 1px solid rgba(0,255,135,.25);
  }
  .agent-sub { font-size: 12px; color: var(--text-muted); }

  .header-controls { display: flex; align-items: center; gap: 20px; }

  .xp-widget { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .xp-widget__top { display: flex; align-items: center; gap: 6px; }
  .xp-level-title { font-size: 12px; font-weight: 600; }
  .xp-level-badge { font-size: 11px; font-weight: 700; padding: 1px 7px; border-radius: 10px; }
  .xp-count { font-size: 10px; color: var(--text-muted); }

  .token-widget { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .token-widget__label { font-size: 10px; color: var(--text-muted); }
  .token-widget__pct { font-size: 9px; color: var(--text-muted); }

  .progress-track { height: 4px; border-radius: 4px; background: var(--border); overflow: hidden; }
  .xp-widget .progress-track   { width: 120px; }
  .token-widget .progress-track { width: 80px; }
  .progress-fill { height: 100%; border-radius: 4px; transition: width .6s cubic-bezier(.22,.68,0,1.2); }

  .close-btn {
    width: 34px; height: 34px; border-radius: 50%;
    background: var(--border); display: flex; align-items: center; justify-content: center;
    color: var(--text-muted); font-size: 15px; text-decoration: none;
    transition: background .2s; flex-shrink: 0;
  }
  .close-btn:hover { background: #253028; color: var(--text); }

  .chat-messages {
    flex: 1; max-width: 900px; width: 100%; margin: 0 auto;
    padding: 28px 16px 240px;
    display: flex; flex-direction: column; gap: 22px;
  }

  .error-banner {
    display: flex; align-items: flex-start; gap: 10px;
    border-radius: var(--radius-sm); padding: 12px 16px; margin-bottom: 4px;
    animation: fadeUp .3s ease-out;
  }
  .error-banner--warn     { background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.2); }
  .error-banner--critical { background: rgba(239,68,68,.08);  border: 1px solid rgba(239,68,68,.2); }
  .error-banner--warn     .error-banner__text { color: #f59e0b; }
  .error-banner--critical .error-banner__text { color: #f87171; }
  .error-banner__text { font-size: 13px; line-height: 1.5; flex: 1; }
  .error-banner__close { margin-left: auto; background: none; border: none; color: #f87171; cursor: pointer; font-size: 14px; padding: 0; flex-shrink: 0; }

  .msg-row { display: flex; align-items: flex-end; gap: 12px; animation: fadeUp .28s ease-out; }
  .msg-row--user { flex-direction: row-reverse; }
  .msg-row--bot  { flex-direction: row; }

  .avatar-bubble {
    width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
    background: linear-gradient(135deg, var(--green), var(--cyan));
    display: flex; align-items: center; justify-content: center; font-size: 18px;
    box-shadow: 0 0 16px rgba(0,255,135,.18);
  }

  .bubble { max-width: 72%; padding: 14px 18px; line-height: 1.65; font-size: 14.5px; }
  .bubble--user {
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg);
    border-radius: var(--radius-lg) var(--radius-lg) 4px var(--radius-lg);
    box-shadow: 0 4px 20px rgba(0,255,135,.28);
  }
  .bubble--bot {
    background: var(--surface); color: var(--text);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) 4px;
    box-shadow: 0 2px 12px rgba(0,0,0,.3);
  }
  .bubble--typing { display: flex; align-items: center; gap: 6px; padding: 16px 20px; }

  .bubble__text { display: block; }
  .md-bold { color: var(--green); font-weight: 700; }

  .bubble__meta {
    display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
    margin-top: 10px; padding-top: 8px; border-top: 1px solid rgba(26,46,30,.8);
  }
  .bubble--user .bubble__meta { border-top-color: rgba(0,0,0,.12); }
  .meta-time { font-size: 11px; color: var(--text-muted); }
  .bubble--user .meta-time { color: rgba(0,0,0,.5); }
  .meta-tag { font-size: 11px; padding: 1px 7px; border-radius: 8px; }
  .meta-tag--model  { color: var(--cyan);       background: rgba(0,188,212,.14); }
  .meta-tag--xp     { color: var(--green);      background: rgba(0,255,135,.1); }
  .meta-tag--tokens { color: var(--text-muted); background: var(--border); }

  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); opacity: .7; animation: bounce 1.2s infinite; }
  .dot:nth-child(2) { animation-delay: .2s; }
  .dot:nth-child(3) { animation-delay: .4s; }
  .typing-label { font-size: 12px; color: var(--text-muted); margin-left: 4px; }

  .input-bar {
    position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
    background: rgba(13,26,16,.94);
    backdrop-filter: blur(24px);
    border-top: 1px solid var(--border);
  }

  .quick-row {
    max-width: 900px; margin: 0 auto;
    padding: 12px 16px 0;
    display: flex; gap: 8px;
    overflow-x: auto; scrollbar-width: none;
  }
  .quick-row::-webkit-scrollbar { display: none; }

  .quick-btn {
    flex-shrink: 0; padding: 6px 14px;
    background: rgba(0,255,135,.08); border: 1px solid rgba(0,255,135,.22);
    color: var(--green); border-radius: 20px; font-size: 12px; font-weight: 500;
    cursor: pointer; white-space: nowrap; font-family: inherit;
    transition: background .18s, border-color .18s;
  }
  .quick-btn:hover { background: rgba(0,255,135,.18); border-color: var(--green); }

  .composer {
    max-width: 900px; margin: 0 auto;
    padding: 12px 16px 18px;
    display: flex; align-items: center; gap: 10px;
  }

  .mic-btn {
    width: 46px; height: 46px; border-radius: 50%;
    background: var(--border); border: 1px solid var(--border);
    color: var(--text-muted); font-size: 18px; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center; transition: all .2s;
  }
  .mic-btn--active {
    background: #ef4444; border-color: #ef4444; color: #fff;
    box-shadow: 0 0 20px rgba(239,68,68,.4); animation: pulse 1s infinite;
  }

  .composer__input {
    flex: 1; height: 46px;
    background: var(--surface-alt); border: 1.5px solid var(--border);
    border-radius: var(--radius-md); padding: 0 16px;
    color: var(--text); font-size: 14.5px; font-family: inherit; outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .composer__input:focus { border-color: rgba(0,255,135,.5); box-shadow: 0 0 0 3px rgba(0,255,135,.07); }
  .composer__input::placeholder { color: #2e4733; }

  .send-btn {
    height: 46px; padding: 0 22px; border-radius: var(--radius-md); border: none;
    background: var(--border); color: var(--text-muted);
    font-weight: 700; font-size: 14px; cursor: not-allowed; flex-shrink: 0;
    font-family: inherit; transition: all .18s;
  }
  .send-btn--active {
    background: linear-gradient(135deg, var(--green), var(--green-dim));
    color: var(--bg); cursor: pointer; box-shadow: 0 4px 16px rgba(0,255,135,.38);
  }
  .send-btn--active:hover { transform: translateY(-1px); box-shadow: 0 6px 22px rgba(0,255,135,.45); }
  .send-btn--active:active { transform: translateY(0); }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes bounce { 0%, 80%, 100% { transform: translateY(0); } 40% { transform: translateY(-6px); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .55; } }
  @keyframes spin { to { transform: rotate(360deg); } }

  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }

  @media (max-width: 600px) {
    .header-inner  { padding: 0 16px; gap: 10px; }
    .agent-sub     { display: none; }
    .xp-widget .progress-track { width: 90px; }
    .token-widget  { display: none; }
    .chat-messages { padding: 20px 12px 220px; }
    .composer      { padding: 10px 12px 16px; }
    .quick-row     { padding: 10px 12px 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner, .online-dot, .dot, .mic-btn--active { animation: none; }
    .xp-toast, .send-btn--active, .locked-cta, .progress-fill { transition: none; }
  }
`;
