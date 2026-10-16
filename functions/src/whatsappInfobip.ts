// ============================================================
//   whatsappInfobip.ts — Webhook Infobip (WhatsApp) → agents AgentCorp
//   (à copier dans functions/src/ puis exporter depuis index.ts)
//
//   Circuit : client WhatsApp → Infobip → infobipWebhook (ICI)
//             → AgentCorp POST /api/support/whatsapp (jeton de service « whatsapp »)
//             → réponse envoyée par Infobip SI AgentCorp renvoie action = "send"
//               (les modes brouillon / relais / auto sont décidés côté AgentCorp).
//
//   Sécurité :
//   • Infobip ne signe pas ses webhooks : chaque appel doit porter le secret INFOBIP_WEBHOOK_SECRET,
//     soit en authentification « Basic » (mot de passe = le secret), soit dans l'URL (?key=le-secret) ;
//     comparaison en temps constant ; sans secret valide → 401, rien n'est enregistré ni transmis ;
//   • le numéro du client vient d'Infobip (champ « from »), jamais de ce que le client écrit ;
//   • messages dédoublonnés, médias téléchargés seulement depuis *.api.infobip.com, 16 Mo max ;
//   • message envoyé par TOI depuis l'app WhatsApp Business (coexistence) : s'il est transmis par Infobip,
//     il est signalé à AgentCorp comme « réponse du propriétaire » → le relais de Saliou est annulé.
//
//   Variables (Firebase) :
//   secrets  : INFOBIP_API_KEY, INFOBIP_WEBHOOK_SECRET, AGENTCORP_SUPPORT_TOKEN
//   functions/.env : WHATSAPP_PROVIDER=infobip
//                    INFOBIP_BASE_URL=xxxxx.api.infobip.com   (ton adresse d'API, page d'accueil Infobip)
//                    INFOBIP_WHATSAPP_SENDER=221701104338     (ton numéro WhatsApp Business)
//                    AGENTCORP_URL=https://…
// ============================================================
import { onRequest } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { Deps, Inbound, normalizePhone, handleOne } from './whatsappSupport';

const defaultDeps = (): Deps => ({ fetch: (globalThis as any).fetch, env: process.env });

const TYPE_MAP: Record<string, string> = {
  TEXT: 'text', IMAGE: 'image', AUDIO: 'audio', VOICE: 'voice', VIDEO: 'video', DOCUMENT: 'document',
  STICKER: 'sticker', LOCATION: 'location', CONTACT: 'contacts', BUTTON: 'button',
  INTERACTIVE_BUTTON_REPLY: 'interactive', INTERACTIVE_LIST_REPLY: 'interactive',
};
const MEDIA = ['image', 'audio', 'voice', 'video', 'document', 'sticker'];

function safeEqual(a: string, b: string): boolean {
  const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y) && a.length === b.length;
}

export function checkWebhookSecret(headers: Record<string, string | undefined>, query: Record<string, any>,
                                   secret: string | undefined): boolean {
  if (!secret || secret.length < 24) return false; // secret absent ou trop court : on refuse tout
  const auth = String(headers['authorization'] ?? '');
  if (/^basic /i.test(auth)) {
    const decoded = Buffer.from(auth.slice(6).trim(), 'base64').toString('utf8');
    const pass = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : decoded;
    if (safeEqual(pass, secret)) return true;
  }
  if (/^bearer /i.test(auth) && safeEqual(auth.slice(7).trim(), secret)) return true;
  const key = typeof query?.key === 'string' ? query.key : '';
  return !!key && safeEqual(key, secret);
}

export type InfobipEvent = Inbound & { fromOwner?: boolean };

// Transforme le JSON d'Infobip ({ results: [...] }) en messages entrants.
export function extractInfobip(payload: any, sender: string | null): InfobipEvent[] {
  const out: InfobipEvent[] = [];
  for (const r of Array.isArray(payload?.results) ? payload.results.slice(0, 20) : []) {
    const from = normalizePhone(r?.from), to = normalizePhone(r?.to);
    const id = String(r?.messageId ?? '');
    if (!from || !id) continue;
    const msg = r?.message ?? {};
    const rawType = String(msg.type ?? 'UNKNOWN').toUpperCase();
    const type = TYPE_MAP[rawType] ?? rawType.toLowerCase();
    const text = type === 'text' ? String(msg.text ?? '')
      : type === 'button' ? String(msg.text ?? msg.payload ?? '')
      : type === 'interactive' ? String(msg.title ?? msg.text ?? '')
      : type === 'location' ? `[position] ${String(msg.address ?? msg.name ?? '')}`.trim()
      : MEDIA.includes(type) ? String(msg.caption ?? '')
      : '';
    const fromOwner = !!sender && from === sender && !!to; // écho d'un message envoyé depuis l'app (coexistence)
    out.push({
      phone: fromOwner ? (to as string) : from,
      name: String(r?.contact?.name ?? '').slice(0, 80),
      text: text.slice(0, 1500), wamid: id, type,
      ...(MEDIA.includes(type) && msg.url ? { mediaUrl: String(msg.url) } : {}),
      ...(fromOwner ? { fromOwner: true } : {}),
    });
  }
  return out;
}

async function tellOwnerEcho(m: InfobipEvent, deps: Deps): Promise<string> {
  const base = deps.env.AGENTCORP_URL, token = deps.env.AGENTCORP_SUPPORT_TOKEN;
  if (!base || !token) return 'agentcorp_unavailable';
  try {
    const res = await deps.fetch(`${base.replace(/\/$/, '')}/api/support/whatsapp`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from_owner: true, phone: m.phone, text: m.text, message_id: m.wamid }),
    });
    return res.ok ? 'owner_echo' : 'agentcorp_unavailable';
  } catch {
    return 'agentcorp_unavailable';
  }
}

export async function processInfobip(method: string, query: Record<string, any>, raw: string,
                                     headers: Record<string, string | undefined>, deps: Deps = defaultDeps()) {
  if (method !== 'POST') return { status: 405, body: 'Method Not Allowed' };
  if (!checkWebhookSecret(headers, query, deps.env.INFOBIP_WEBHOOK_SECRET)) {
    console.warn('[infobipWebhook] secret absent ou invalide — requête ignorée');
    return { status: 401, body: 'Unauthorized' };
  }
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return { status: 400, body: 'Bad JSON' }; }
  const sender = normalizePhone(deps.env.INFOBIP_WHATSAPP_SENDER);
  const results: string[] = [];
  for (const m of extractInfobip(payload, sender)) {
    try { results.push(m.fromOwner ? await tellOwnerEcho(m, deps) : await handleOne(m, deps)); } catch (e: any) {
      console.error('[infobipWebhook] erreur', e?.message ?? e); results.push('error');
    }
  }
  return { status: 200, body: 'OK', results };
}

export const infobipWebhook = onRequest({
  region: 'us-central1', cors: false, timeoutSeconds: 60, maxInstances: 5,
  secrets: ['INFOBIP_API_KEY', 'INFOBIP_WEBHOOK_SECRET', 'AGENTCORP_SUPPORT_TOKEN'],
}, async (req: any, res: any) => {
  const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
  const out = await processInfobip(req.method, req.query ?? {}, raw, { authorization: req.get('authorization') });
  res.status(out.status).send(out.body);
});
