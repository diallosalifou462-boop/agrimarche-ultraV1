/**
 * app/api/chat/route.ts — Assistant « Agri » (SÉCURISÉ)
 *
 * Avant : aucune vérification d'identité, consignes système fournies par le navigateur
 * → n'importe qui pouvait utiliser la clé DeepSeek gratuitement, pour n'importe quoi,
 * et le verrou payant (/main/unlock-ia) ne protégeait que l'affichage.
 *
 * Maintenant, côté serveur :
 *  1. session Firebase obligatoire (Authorization: Bearer <idToken>) ;
 *  2. accès IA vérifié dans users/{uid} : hasAIAccess, aiExpiryDate > maintenant,
 *     aiTokensUsed < aiTokensLimit ;
 *  3. consignes d'Agri construites ici (lib/ai/agriPrompt.ts) — le client n'envoie que des données ;
 *  4. limite de débit : 20 messages / minute / utilisateur (collection ai_rate) ;
 *  5. messages bornés (12 derniers, 2 000 caractères chacun) ;
 *  6. consommation de jetons comptée ICI (le client ne peut plus la sous-déclarer) ;
 *  7. fournisseur au choix : DeepSeek (défaut) ou Claude (AI_PROVIDER=anthropic).
 *
 * Variables d'environnement Vercel : FIREBASE_SERVICE_ACCOUNT_JSON, DEEPSEEK_API_KEY
 * (ou AI_PROVIDER=anthropic + ANTHROPIC_API_KEY [+ ANTHROPIC_MODEL]).
 *
 * TRANSITION (applis mobiles déjà installées) : les pages sont embarquées dans l'appli Capacitor ;
 * les anciennes versions appellent /api/chat SANS jeton, avec leurs propres consignes.
 * CHAT_LEGACY_UNTIL=2026-11-30 (facultatif) les tolère jusqu'à cette date, en mode réduit :
 * consignes du serveur (celles du client sont IGNORÉES, seules ses données temps réel sont reprises),
 * 10 messages / minute / adresse IP, plafond global CHAT_LEGACY_DAILY_MAX (défaut 1 000 / jour).
 * Sans cette variable, ou après la date : 401 APP_UPDATE_REQUIRED.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, Timestamp, type Transaction } from 'firebase-admin/firestore';
import { getAdminApp, CORS_HEADERS } from '@/lib/server/adminApp';
import { buildAgriSystemPrompt } from '@/lib/ai/agriPrompt';

const MAX_TURNS = 12;
const MAX_CHARS = 2000;
const RATE_PER_MINUTE = 20;
const DEFAULT_TOKEN_LIMIT = 500_000;
const ALERT_THRESHOLD = 0.8;

type Turn = { role: 'user' | 'assistant'; content: string };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function cleanMessages(raw: unknown): Turn[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const turns = raw.slice(-MAX_TURNS).map((m: any) => ({
    role: m?.role === 'assistant' ? 'assistant' : 'user',
    content: String(m?.content ?? '').slice(0, MAX_CHARS),
  })) as Turn[];
  if (turns[turns.length - 1].role !== 'user' || !turns[turns.length - 1].content.trim()) return null;
  return turns;
}

async function callModel(system: string, messages: Turn[]): Promise<{ text: string; tokens: number; model: string }> {
  if (process.env.AI_PROVIDER === 'anthropic') {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw Object.assign(new Error('INVALID_API_KEY'), { status: 502 });
    const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, system, messages, max_tokens: 900, temperature: 0.65 }),
    });
    if (!r.ok) throw Object.assign(new Error(r.status === 401 ? 'INVALID_API_KEY' : `Anthropic error ${r.status}`), { status: 502 });
    const d = await r.json();
    const text = (d.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
    return { text, tokens: (d.usage?.input_tokens ?? 0) + (d.usage?.output_tokens ?? 0), model };
  }
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw Object.assign(new Error('Server misconfiguration'), { status: 500 });
  const r = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: system }, ...messages],
                           max_tokens: 700, temperature: 0.65, stream: false }),
  });
  if (!r.ok) {
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('INVALID_API_KEY'), { status: 502 });
    if (r.status === 402) throw Object.assign(new Error('INSUFFICIENT_BALANCE'), { status: 402 });
    throw Object.assign(new Error(`DeepSeek error ${r.status}`), { status: 502 });
  }
  const d = await r.json();
  return { text: d.choices?.[0]?.message?.content ?? '', tokens: d.usage?.total_tokens ?? 0, model: 'deepseek-chat' };
}

function legacyAllowed(): boolean {
  const until = process.env.CHAT_LEGACY_UNTIL ? Date.parse(process.env.CHAT_LEGACY_UNTIL) : NaN;
  return Number.isFinite(until) && Date.now() < until;
}

async function windowCount(db: any, id: string, windowMs: number, max: number): Promise<boolean> {
  const ref = db.collection('ai_rate').doc(id);
  return db.runTransaction(async (tx: Transaction) => {
    const snap = await tx.get(ref);
    const nowMs = Date.now();
    const win = snap.exists ? snap.data() : { start: nowMs, count: 0 };
    const fresh = nowMs - Number(win.start) > windowMs;
    const count = fresh ? 1 : Number(win.count) + 1;
    tx.set(ref, { start: fresh ? nowMs : win.start, count });
    return count <= max;
  });
}

// Anciennes versions de l'appli : consignes du serveur, quotas stricts, pas de compte.
async function legacyPost(req: NextRequest, app: any) {
  const body = await req.json().catch(() => null);
  const messages = cleanMessages(body?.messages);
  if (!messages) return json({ error: 'Invalid request body' }, 400);
  const db = getFirestore(app);
  const ip = (req.headers.get('x-forwarded-for') ?? 'inconnue').split(',')[0].trim();
  const ipId = 'legacy_ip_' + createHash('sha256').update(ip).digest('hex').slice(0, 32);
  if (!(await windowCount(db, ipId, 60_000, 10))) return json({ error: 'RATE_LIMITED' }, 429);
  const dailyMax = Number(process.env.CHAT_LEGACY_DAILY_MAX) || 1000;
  if (!(await windowCount(db, 'legacy_global', 86_400_000, dailyMax))) return json({ error: 'RATE_LIMITED' }, 429);
  const legacyPrompt = typeof body?.systemPrompt === 'string' ? body.systemPrompt : '';
  const marker = legacyPrompt.indexOf('**Données temps réel :**');
  const context = marker >= 0 ? legacyPrompt.slice(marker + '**Données temps réel :**'.length) : '';
  const system = buildAgriSystemPrompt({ userName: 'Agriculteur', context });
  try {
    const r = await callModel(system, messages);
    return json({ choices: [{ message: { role: 'assistant', content: r.text || "Désolé, je n'ai pas pu générer une réponse." } }],
                  usage: { total_tokens: r.tokens }, model: r.model, legacy: true });
  } catch (e: any) {
    return json({ error: e?.message ?? 'Network error' }, e?.status ?? 503);
  }
}

export async function POST(req: NextRequest) {
  // 1. Identité
  const idToken = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  let app;
  try { app = getAdminApp(); } catch (e) { console.error('[chat] admin', e); return json({ error: 'Server misconfiguration' }, 500); }
  if (!idToken) return legacyAllowed() ? legacyPost(req, app) : json({ error: 'APP_UPDATE_REQUIRED' }, 401);
  const decoded = await getAuth(app).verifyIdToken(idToken).catch(() => null);
  if (!decoded) return json({ error: 'AUTH_REQUIRED' }, 401);
  const uid = decoded.uid;

  // 2. Corps de requête
  const body = await req.json().catch(() => null);
  const messages = cleanMessages(body?.messages);
  if (!messages) return json({ error: 'Invalid request body' }, 400);

  const db = getFirestore(app);
  const userRef = db.collection('users').doc(uid);

  // 3. Accès payant + quota de jetons (vérifiés par le serveur)
  const user = (await userRef.get()).data() ?? {};
  const expiry: Date | null = user.aiExpiryDate?.toDate?.() ?? null;
  if (!user.hasAIAccess || !expiry || expiry <= new Date()) return json({ error: 'AI_ACCESS_REQUIRED' }, 403);
  const limit = Number(user.aiTokensLimit) || DEFAULT_TOKEN_LIMIT;
  if ((Number(user.aiTokensUsed) || 0) >= limit) return json({ error: 'TOKEN_LIMIT_REACHED' }, 429);

  // 4. Limite de débit (fenêtre d'une minute, transaction)
  if (!(await windowCount(db, uid, 60_000, RATE_PER_MINUTE))) return json({ error: 'RATE_LIMITED' }, 429);

  // 5. Consignes construites côté serveur + appel au modèle
  const system = buildAgriSystemPrompt({ userName: body?.userName ?? user.displayName ?? user.name, context: body?.context });
  let result;
  try {
    result = await callModel(system, messages);
  } catch (e: any) {
    console.error('[chat] modèle', e?.message);
    return json({ error: e?.message ?? 'Network error' }, e?.status ?? 503);
  }

  // 6. Comptage serveur des jetons
  const tokens = result.tokens || Math.ceil((system.length + JSON.stringify(messages).length + result.text.length) / 4);
  const used = (Number(user.aiTokensUsed) || 0) + tokens;
  const alert = used / limit >= ALERT_THRESHOLD && !user.aiAlertSent;
  await userRef.set({ aiTokensUsed: FieldValue.increment(tokens), aiLastUsageAt: Timestamp.now(),
                      ...(alert ? { aiAlertSent: true } : {}) }, { merge: true });

  // Réponse au format attendu par la page (compatible avec l'ancien format DeepSeek)
  return json({
    choices: [{ message: { role: 'assistant', content: result.text || "Désolé, je n'ai pas pu générer une réponse." } }],
    usage: { total_tokens: tokens },
    model: result.model,
    quota: { used, limit, percentage: Math.min(100, (used / limit) * 100), alert },
  });
}
