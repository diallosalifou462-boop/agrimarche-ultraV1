"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappWebhook = exports.FALLBACK_TEXT = void 0;
exports.normalizePhone = normalizePhone;
exports.verifyMetaSignature = verifyMetaSignature;
exports.extractMessages = extractMessages;
exports.sendWhatsAppText = sendWhatsAppText;
exports.withinCustomerWindow = withinCustomerWindow;
exports.storeMedia = storeMedia;
exports.processWebhook = processWebhook;
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
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const crypto = __importStar(require("crypto"));
if (admin.apps.length === 0)
    admin.initializeApp();
const GRAPH_VERSION = 'v21.0'; // identique à whatsapp.ts
const AGENTCORP_TIMEOUT_MS = 25000;
const FALLBACK_EVERY_MS = 6 * 3600000;
const WINDOW_MS = 24 * 3600000; // fenêtre de service client WhatsApp
exports.FALLBACK_TEXT = 'Merci pour votre message 🙏 Un conseiller Sunu Mëñëf vous répond très vite.';
const fdb = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
const defaultDeps = () => ({ fetch: globalThis.fetch, env: process.env });
const MEDIA_TYPES = ['audio', 'voice', 'image', 'video', 'document', 'sticker'];
const MAX_MEDIA_BYTES = 16 * 1024 * 1024;
const EXT = { 'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/amr': 'amr',
    'audio/aac': 'aac', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'video/mp4': 'mp4',
    'application/pdf': 'pdf' };
function normalizePhone(raw) {
    let d = String(raw !== null && raw !== void 0 ? raw : '').replace(/\D/g, '');
    if (d.length === 9 && /^[37]/.test(d))
        d = '221' + d;
    return d.length >= 8 && d.length <= 15 ? d : null;
}
function verifyMetaSignature(raw, header, appSecret) {
    if (!appSecret || !header || !header.startsWith('sha256='))
        return false;
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(raw, 'utf8').digest('hex');
    const a = Buffer.from(expected), b = Buffer.from(header);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}
// Extrait les messages entrants (on ignore les accusés de lecture / statuts).
function extractMessages(payload) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    const out = [];
    for (const entry of (_a = payload === null || payload === void 0 ? void 0 : payload.entry) !== null && _a !== void 0 ? _a : []) {
        for (const change of (_b = entry === null || entry === void 0 ? void 0 : entry.changes) !== null && _b !== void 0 ? _b : []) {
            const v = (_c = change === null || change === void 0 ? void 0 : change.value) !== null && _c !== void 0 ? _c : {};
            const names = {};
            for (const c of (_d = v.contacts) !== null && _d !== void 0 ? _d : [])
                names[String(c.wa_id)] = String((_f = (_e = c.profile) === null || _e === void 0 ? void 0 : _e.name) !== null && _f !== void 0 ? _f : '').slice(0, 80);
            for (const m of (_g = v.messages) !== null && _g !== void 0 ? _g : []) {
                const phone = normalizePhone(m.from);
                if (!phone || !m.id)
                    continue;
                const type = String((_h = m.type) !== null && _h !== void 0 ? _h : 'unknown');
                const text = type === 'text' ? String((_k = (_j = m.text) === null || _j === void 0 ? void 0 : _j.body) !== null && _k !== void 0 ? _k : '')
                    : type === 'button' ? String((_m = (_l = m.button) === null || _l === void 0 ? void 0 : _l.text) !== null && _m !== void 0 ? _m : '')
                        : type === 'interactive' ? String((_t = (_q = (_p = (_o = m.interactive) === null || _o === void 0 ? void 0 : _o.button_reply) === null || _p === void 0 ? void 0 : _p.title) !== null && _q !== void 0 ? _q : (_s = (_r = m.interactive) === null || _r === void 0 ? void 0 : _r.list_reply) === null || _s === void 0 ? void 0 : _s.title) !== null && _t !== void 0 ? _t : '')
                            : MEDIA_TYPES.includes(type) ? String((_v = (_u = m[type]) === null || _u === void 0 ? void 0 : _u.caption) !== null && _v !== void 0 ? _v : '')
                                : '';
                const media = MEDIA_TYPES.includes(type) ? m[type] : null;
                out.push(Object.assign({ phone, name: (_w = names[String(m.from)]) !== null && _w !== void 0 ? _w : '', text: text.slice(0, 1500), wamid: String(m.id), type }, ((media === null || media === void 0 ? void 0 : media.id) ? { mediaId: String(media.id), mime: String((_x = media.mime_type) !== null && _x !== void 0 ? _x : '').split(';')[0] } : {})));
            }
        }
    }
    return out;
}
// Envoi d'un message texte (réponse dans la fenêtre de 24 h ouverte par le client).
async function sendWhatsAppText(to, text, deps = defaultDeps()) {
    var _a, _b, _c, _d;
    const id = deps.env.WHATSAPP_PHONE_NUMBER_ID, token = deps.env.WHATSAPP_ACCESS_TOKEN;
    if (!id || !token)
        throw new Error('WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant');
    const res = await deps.fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text',
            text: { preview_url: false, body: text.slice(0, 4000) } }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok)
        throw new Error(`Envoi WhatsApp refusé (${res.status}) : ${JSON.stringify((_a = body === null || body === void 0 ? void 0 : body.error) !== null && _a !== void 0 ? _a : body).slice(0, 300)}`);
    return { wamid: (_d = (_c = (_b = body === null || body === void 0 ? void 0 : body.messages) === null || _b === void 0 ? void 0 : _b[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null };
}
async function withinCustomerWindow(phone) {
    var _a, _b, _c;
    const snap = await fdb().collection('support_conversations').doc(phone).get();
    const last = (_a = snap.data()) === null || _a === void 0 ? void 0 : _a.lastInboundAt;
    const ms = (_c = (_b = last === null || last === void 0 ? void 0 : last.toMillis) === null || _b === void 0 ? void 0 : _b.call(last)) !== null && _c !== void 0 ? _c : 0;
    return ms > 0 && Date.now() - ms < WINDOW_MS;
}
// Vocaux / photos : téléchargés depuis Meta (le lien Meta expire vite) et rangés dans Firebase Storage,
// chemin whatsapp_media/<numéro>/<id du message>.<ext>. Lisibles seulement par le serveur (Admin SDK).
async function storeMedia(m, deps) {
    var _a, _b, _c, _d;
    const token = deps.env.WHATSAPP_ACCESS_TOKEN;
    if (!m.mediaId || !token)
        return null;
    const meta = await deps.fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(m.mediaId)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!meta.ok)
        throw new Error(`Média introuvable chez Meta (${meta.status})`);
    const info = await meta.json();
    if (Number(info.file_size) > MAX_MEDIA_BYTES)
        throw new Error('Média trop volumineux');
    const url = String((_a = info.url) !== null && _a !== void 0 ? _a : '');
    if (!/^https:\/\/[a-z0-9.-]+\.(fbsbx\.com|facebook\.com|whatsapp\.net)\//i.test(url))
        throw new Error('URL de média inattendue');
    const file = await deps.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!file.ok)
        throw new Error(`Téléchargement du média refusé (${file.status})`);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.length > MAX_MEDIA_BYTES)
        throw new Error('Média trop volumineux');
    const mime = String((_c = (_b = info.mime_type) !== null && _b !== void 0 ? _b : m.mime) !== null && _c !== void 0 ? _c : 'application/octet-stream').split(';')[0];
    const path = `whatsapp_media/${m.phone}/${m.wamid.replace(/[^A-Za-z0-9._-]/g, '_')}.${(_d = EXT[mime]) !== null && _d !== void 0 ? _d : 'bin'}`;
    await admin.storage().bucket().file(path).save(buf, { contentType: mime, resumable: false });
    return path;
}
async function logMessage(phone, data) {
    await fdb().collection('support_conversations').doc(phone).collection('messages').add(Object.assign(Object.assign({}, data), { at: now() }));
}
async function askAgentCorp(m, deps) {
    var _a, _b, _c, _d, _e;
    const base = deps.env.AGENTCORP_URL, token = deps.env.AGENTCORP_SUPPORT_TOKEN;
    if (!base || !token)
        return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AGENTCORP_TIMEOUT_MS);
    try {
        const res = await deps.fetch(`${base.replace(/\/$/, '')}/api/support/whatsapp`, {
            method: 'POST', signal: ctrl.signal,
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: m.phone, name: m.name, text: m.text, message_id: m.wamid, type: m.type,
                media_path: (_a = m.mediaPath) !== null && _a !== void 0 ? _a : '', mime: (_b = m.mime) !== null && _b !== void 0 ? _b : '' }),
        });
        if (!res.ok) {
            console.error('[whatsappSupport] AgentCorp HTTP', res.status);
            return null;
        }
        const out = await res.json();
        return { action: String((_c = out === null || out === void 0 ? void 0 : out.action) !== null && _c !== void 0 ? _c : 'none'), reply: String((_d = out === null || out === void 0 ? void 0 : out.reply) !== null && _d !== void 0 ? _d : '') };
    }
    catch (e) {
        console.error('[whatsappSupport] AgentCorp injoignable :', (_e = e === null || e === void 0 ? void 0 : e.message) !== null && _e !== void 0 ? _e : e);
        return null;
    }
    finally {
        clearTimeout(timer);
    }
}
async function handleOne(m, deps) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    // 1. Dédoublonnage
    const seen = fdb().collection('whatsapp_inbound').doc(m.wamid);
    if ((await seen.get()).exists)
        return 'duplicate';
    await seen.set({ phone: m.phone, at: now() });
    // 2. Conversation (lisible dans la console Firebase / l'admin)
    const conv = fdb().collection('support_conversations').doc(m.phone);
    const before = (_a = (await conv.get()).data()) !== null && _a !== void 0 ? _a : {};
    await conv.set({ phone: m.phone, name: m.name || before.name || '', lastText: m.text.slice(0, 300),
        lastInboundAt: admin.firestore.Timestamp.now(), updatedAt: now() }, { merge: true });
    if (m.mediaId) {
        try {
            m.mediaPath = (_b = (await storeMedia(m, deps))) !== null && _b !== void 0 ? _b : undefined;
        }
        catch (e) {
            console.error('[whatsappSupport] média non récupéré :', (_c = e === null || e === void 0 ? void 0 : e.message) !== null && _c !== void 0 ? _c : e);
        }
    }
    await logMessage(m.phone, Object.assign({ direction: 'in', author: 'client', text: m.text, type: m.type, wamid: m.wamid }, (m.mediaPath ? { mediaPath: m.mediaPath, mime: (_d = m.mime) !== null && _d !== void 0 ? _d : '' } : {})));
    // 3. Agents
    const answer = await askAgentCorp(m, deps);
    if (answer) {
        if (answer.action === 'send' && answer.reply.trim()) {
            try {
                const r = await sendWhatsAppText(m.phone, answer.reply, deps);
                await logMessage(m.phone, { direction: 'out', author: 'agent', text: answer.reply, wamid: r.wamid });
                return 'sent';
            }
            catch (e) {
                await logMessage(m.phone, { direction: 'out', author: 'agent', text: answer.reply, error: String((_e = e === null || e === void 0 ? void 0 : e.message) !== null && _e !== void 0 ? _e : e) });
                return 'send_failed';
            }
        }
        return 'no_reply';
    }
    // 4. AgentCorp indisponible : message d'attente seulement si tu l'as activé
    const cfg = (_f = (await fdb().collection('agentcorp_config').doc('whatsapp_support').get()).data()) !== null && _f !== void 0 ? _f : {};
    const lastFallback = (_j = (_h = (_g = before.fallbackAt) === null || _g === void 0 ? void 0 : _g.toMillis) === null || _h === void 0 ? void 0 : _h.call(_g)) !== null && _j !== void 0 ? _j : 0;
    if (cfg.fallbackEnabled === true && Date.now() - lastFallback > FALLBACK_EVERY_MS) {
        try {
            await sendWhatsAppText(m.phone, exports.FALLBACK_TEXT, deps);
            await conv.set({ fallbackAt: admin.firestore.Timestamp.now() }, { merge: true });
            await logMessage(m.phone, { direction: 'out', author: 'fallback', text: exports.FALLBACK_TEXT });
            return 'fallback';
        }
        catch (e) {
            console.error('[whatsappSupport] attente non envoyée :', (_k = e === null || e === void 0 ? void 0 : e.message) !== null && _k !== void 0 ? _k : e);
        }
    }
    return 'agentcorp_unavailable';
}
async function processWebhook(method, query, raw, headers, deps = defaultDeps()) {
    var _a, _b;
    if (method === 'GET') {
        // Vérification de l'URL par Meta (une fois, à la configuration)
        const ok = query['hub.mode'] === 'subscribe' && deps.env.WHATSAPP_VERIFY_TOKEN
            && query['hub.verify_token'] === deps.env.WHATSAPP_VERIFY_TOKEN;
        return ok ? { status: 200, body: String((_a = query['hub.challenge']) !== null && _a !== void 0 ? _a : '') } : { status: 403, body: 'Forbidden' };
    }
    if (method !== 'POST')
        return { status: 405, body: 'Method Not Allowed' };
    if (!verifyMetaSignature(raw, headers['x-hub-signature-256'], deps.env.WHATSAPP_APP_SECRET)) {
        console.warn('[whatsappSupport] signature Meta invalide — requête ignorée');
        return { status: 401, body: 'Invalid signature' };
    }
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch (_c) {
        return { status: 400, body: 'Bad JSON' };
    }
    const results = [];
    for (const m of extractMessages(payload).slice(0, 20)) {
        try {
            results.push(await handleOne(m, deps));
        }
        catch (e) {
            console.error('[whatsappSupport] erreur', (_b = e === null || e === void 0 ? void 0 : e.message) !== null && _b !== void 0 ? _b : e);
            results.push('error');
        }
    }
    return { status: 200, body: 'EVENT_RECEIVED', results };
}
exports.whatsappWebhook = (0, https_1.onRequest)({
    region: 'us-central1', cors: false, timeoutSeconds: 60, maxInstances: 5,
    secrets: ['WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN', 'AGENTCORP_SUPPORT_TOKEN', 'WHATSAPP_ACCESS_TOKEN'],
}, async (req, res) => {
    var _a;
    const raw = req.rawBody ? req.rawBody.toString('utf8') : '';
    const out = await processWebhook(req.method, (_a = req.query) !== null && _a !== void 0 ? _a : {}, raw, { 'x-hub-signature-256': req.get('x-hub-signature-256') });
    res.status(out.status).send(out.body);
});
