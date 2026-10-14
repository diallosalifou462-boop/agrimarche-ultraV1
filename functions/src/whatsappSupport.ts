// ============================================================
//   whatsappSupport.ts — Webhook WhatsApp Cloud API → agents AgentCorp
//   (à copier dans functions/src/ puis exporter depuis index.ts)
//
//   Circuit : client WhatsApp → Meta → whatsappWebhook (ICI)
//             → AgentCorp POST /api/support/whatsapp (jeton de service « whatsapp »)
//             → réponse envoyée au client SI AgentCorp renvoie action = "send"
//               (mode « auto » armé par le propriétaire, avec un vrai modèle d'IA).
//
//   Sécurité :
//   • chaque POST de Meta est vérifié (X-Hub-Signature-256 = HMAC-SHA256(app secret, corps brut)) ;
//   • le numéro du client vient de Meta (signé), jamais de ce que le client écrit ;
//   • messages dédoublonnés (Meta renvoie parfois le même message) ;
//   • aucune donnée sensible n'est envoyée à AgentCorp : numéro, nom WhatsApp, texte ;
//   • si AgentCorp ne répond pas : rien n'est envoyé, SAUF si tu actives le message
//     d'attente (agentcorp_config/whatsapp_support.fallbackEnabled = true), une fois par 6 h max ;
//   • on répond toujours 200 à Meta après vérification, pour éviter les renvois en boucle.
//
//   Variables (Firebase) :
//   secrets  : WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN, AGENTCORP_SUPPORT_TOKEN, WHATSAPP_ACCESS_TOKEN
//              (firebase functions:secrets:set NOM — jamais dans le code ni dans un fichier .env)
//   functions/.env : AGENTCORP_URL=https://agents.ton-domaine.sn
//                    WHATSAPP_PHONE_NUMBER_ID=<ID du numéro, WhatsApp Manager> (pas un secret)
// ============================================================
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';

if (admin.apps.length === 0) admin.initializeApp();

const GRAPH_VERSION = 'v21.0'; // identique à whatsapp.ts
const AGENTCORP_TIMEOUT_MS = 25_000;
const FALLBACK_EVERY_MS = 6 * 3_600_000;
const WINDOW_MS = 24 * 3_600_000; // fenêtre de service client WhatsApp
export const FALLBACK_TEXT = 'Merci pour votre message 🙏 Un conseiller Sunu Mëñëf vous répond très vite.';

const fdb = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();

export type Deps = { fetch: typeof fetch; env: Record<string, string | undefined> };
const defaultDeps = (): Deps => ({ fetch: (globalThis as any).fetch, env: process.env });

export type Inbound = { phone: string; name: string; text: string; wamid: string; type: string };

export function normalizePhone(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.length === 9 && /^[37]/.test(d)) d = '221' + d;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export function verifyMetaSignature(raw: string, header: string | undefined, appSecret: string | undefined): boolean {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex');
  const a = Buffer.from(expected), b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Extrait les messages entrants (on ignore les accusés de lecture / statuts).
export function extractMessages(payload: any): Inbound[] {
  const out: Inbound[] = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const v = change?.value ?? {};
      const names: Record<string, string> = {};
      for (const c of v.contacts ?? []) names[String(c.wa_id)] = String(c.profile?.name ?? '').slice(0, 80);
      for (const m of v.messages ?? []) {
        const phone = normalizePhone(m.from);
        if (!phone || !m.id) continue;
        const type = String(m.type ?? 'unknown');
        const text = type === 'text' ? String(m.text?.body ?? '')
          : type === 'button' ? String(m.button?.text ?? '')
          : type === 'interactive' ? String(m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '')
          : '';
        out.push({ phone, name: names[String(m.from)] ?? '', text: text.slice(0, 1500), wamid: String(m.id), type });
      }
    }
  }
  return out;
}

// Envoi d'un message texte (réponse dans la fenêtre de 24 h ouverte par le client).
export async function sendWhatsAppText(to: string, text: string, deps: Deps = defaultDeps()) {
  const id = deps.env.WHATSAPP_PHONE_NUMBER_ID, token = deps.env.WHATSAPP_ACCESS_TOKEN;
  if (!id || !token) throw new Error('WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant');
  const res = await deps.fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text',
                           text: { preview_url: false, body: text.slice(0, 4000) } }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Envoi WhatsApp refusé (${res.status}) : ${JSON.stringify(body?.error ?? body).slice(0, 300)}`);
  return { wamid: body?.messages?.[0]?.id ?? null };
}

export async function withinCustomerWindow(phone: string): Promise<boolean> {
  const snap = await fdb().collection('support_conversations').doc(phone).get();
  const last = (snap.data() as any)?.lastInboundAt;
  const ms = last?.toMillis?.() ?? 0;
  return ms > 0 && Date.now() - ms < WINDOW_MS;
}

async function logMessage(phone: string, data: Record<string, unknown>) {
  await fdb().collection('support_conversations').doc(phone).collection('messages').add({ ...data, at: now() });
}

async function askAgentCorp(m: Inbound, deps: Deps): Promise<{ action: string; reply: string } | null> {
  const base = deps.env.AGENTCORP_URL, token = deps.env.AGENTCORP_SUPPORT_TOKEN;
  if (!base || !token) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AGENTCORP_TIMEOUT_MS);
  try {
    const res = await deps.fetch(`${base.replace(/\/$/, '')}/api/support/whatsapp`, {
      method: 'POST', signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: m.phone, name: m.name, text: m.text, message_id: m.wamid, type: m.type }),
    });
    if (!res.ok) { console.error('[whatsappSupport] AgentCorp HTTP', res.status); return null; }
    const out: any = await res.json();
    return { action: String(out?.action ?? 'none'), reply: String(out?.reply ?? '') };
  } catch (e: any) {
    console.error('[whatsappSupport] AgentCorp injoignable :', e?.message ?? e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handleOne(m: Inbound, deps: Deps) {
  // 1. Dédoublonnage
  const seen = fdb().collection('whatsapp_inbound').doc(m.wamid);
  if ((await seen.get()).exists) return 'duplicate';
  await seen.set({ phone: m.phone, at: now() });
  // 2. Conversation (lisible dans la console Firebase / l'admin)
  const conv = fdb().collection('support_conversations').doc(m.phone);
  const before: any = (await conv.get()).data() ?? {};
  await conv.set({ phone: m.phone, name: m.name || before.name || '', lastText: m.text.slice(0, 300),
                   lastInboundAt: admin.firestore.Timestamp.now(), updatedAt: now() }, { merge: true });
  await logMessage(m.phone, { direction: 'in', author: 'client', text: m.text, type: m.type, wamid: m.wamid });
  // 3. Agents
  const answer = await askAgentCorp(m, deps);
  if (answer) {
    if (answer.action === 'send' && answer.reply.trim()) {
      try {
        const r = await sendWhatsAppText(m.phone, answer.reply, deps);
        await logMessage(m.phone, { direction: 'out', author: 'agent', text: answer.reply, wamid: r.wamid });
        return 'sent';
      } catch (e: any) {
        await logMessage(m.phone, { direction: 'out', author: 'agent', text: answer.reply, error: String(e?.message ?? e) });
        return 'send_failed';
      }
    }
    return 'no_reply';
  }
  // 4. AgentCorp indisponible : message d'attente seulement si tu l'as activé
  const cfg: any = (await fdb().collection('agentcorp_config').doc('whatsapp_support').get()).data() ?? {};
  const lastFallback = before.fallbackAt?.toMillis?.() ?? 0;
  if (cfg.fallbackEnabled === true && Date.now() - lastFallback > FALLBACK_EVERY_MS) {
    try {
      await sendWhatsAppText(m.phone, FALLBACK_TEXT, deps);
      await conv.set({ fallbackAt: admin.firestore.Timestamp.now() }, { merge: true });
      await logMessage(m.phone, { direction: 'out', author: 'fallback', text: FALLBACK_TEXT });
      return 'fallback';
    } catch (e: any) {
      console.error('[whatsappSupport] attente non envoyée :', e?.message ?? e);
    }
  }
  return 'agentcorp_unavailable';
}

export async function processWebhook(method: string, query: Record<string, any>, raw: string,
                                     headers: Record<string, string | undefined>, deps: Deps = defaultDeps()) {
  if (method === 'GET') {
    // Vérification de l'URL par Meta (une fois, à la configuration)
    const ok = query['hub.mode'] === 'subscribe' && deps.env.WHATSAPP_VERIFY_TOKEN
      && query['hub.verify_token'] === deps.env.WHATSAPP_VERIFY_TOKEN;
    return ok ? { status: 200, body: String(query['hub.challenge'] ?? '') } : { status: 403, body: 'Forbidden' };
  }
  if (method !== 'POST') return { status: 405, body: 'Method Not Allowed' };
  if (!verifyMetaSignature(raw, headers['x-hub-signature-256'], deps.env.WHATSAPP_APP_SECRET)) {
    console.warn('[whatsappSupport] signature Meta invalide — requête ignorée');
    return { status: 401, body: 'Invalid signature' };
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return { status: 400, body: 'Bad JSON' }; }
  const results: string[] = [];
  for (const m of extractMessages(payload).slice(0, 20)) {
    try { results.push(await handleOne(m, deps)); } catch (e: any) {
      console.error('[whatsappSupport] erreur', e?.message ?? e); results.push('error');
    }
  }
  return { status: 200, body: 'EVENT_RECEIVED', results };
}

export const whatsappWebhook = onRequest({
  region: 'us-central1', cors: false, timeoutSeconds: 60, maxInstances: 5,
  secrets: ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'AGENTCORP_SUPPORT_TOKEN', 'WHATSAPP_ACCESS_TOKEN'],
}, async (req: any, res: any) => {
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  const out = await processWebhook(req.method, req.query ?? {}, raw,
                                   { 'x-hub-signature-256': req.get('x-hub-signature-256') });
  res.status(out.status).send(out.body);
});
