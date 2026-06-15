"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AIAssistantPage;
const react_1 = require("react");
const link_1 = __importDefault(require("next/link"));
const AuthContext_1 = require("@/contexts/AuthContext");
const firebase_1 = require("@/lib/firebase/firebase");
const firestore_1 = require("firebase/firestore");
// ─────────────────────────────────────────────
// VÉRIFICATION D'ACCÈS IA
// Alignée exactement avec grantAIAccess() de unlock-ia/page.tsx :
//   Firestore users/{uid} → hasAIAccess + aiExpiryDate
//   localStorage          → ai_user_id + ai_code_expiry
// ─────────────────────────────────────────────
async function checkAIAccess(uid) {
    var _a, _b;
    // 1. Vérification Firestore (source de vérité)
    if (firebase_1.db) {
        try {
            const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'users', uid));
            const data = snap.data();
            if ((data === null || data === void 0 ? void 0 : data.hasAIAccess) && (data === null || data === void 0 ? void 0 : data.aiExpiryDate)) {
                const expiry = ((_b = (_a = data.aiExpiryDate).toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(data.aiExpiryDate);
                if (expiry > new Date())
                    return true;
            }
        }
        catch (e) {
            console.error('checkAIAccess Firestore:', e);
        }
    }
    // 2. Fallback localStorage (offline / délai réseau)
    try {
        const savedUid = localStorage.getItem('ai_user_id');
        const savedExpiry = localStorage.getItem('ai_code_expiry');
        if (savedUid === uid && savedExpiry) {
            if (Date.now() < parseInt(savedExpiry, 10))
                return true;
        }
    }
    catch ( /* ignore */_c) { /* ignore */ }
    return false;
}
// ─────────────────────────────────────────────
// GAMIFICATION
// ─────────────────────────────────────────────
function getLevel(xp) {
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
// ─────────────────────────────────────────────
// DEEPSEEK API
// ─────────────────────────────────────────────
const DEEPSEEK_API_KEY = (_a = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY) !== null && _a !== void 0 ? _a : '';
async function fetchWeatherContext(region) {
    var _a;
    const coords = {
        Dakar: { lat: 14.6937, lon: -17.4441 },
        Thiès: { lat: 14.7910, lon: -16.9359 },
        'Saint-Louis': { lat: 16.0179, lon: -16.4896 },
        Kaolack: { lat: 14.1652, lon: -16.0757 },
        Ziguinchor: { lat: 12.5606, lon: -16.2719 },
        Louga: { lat: 15.6173, lon: -16.2248 },
    };
    const { lat, lon } = coords[region] || coords.Dakar;
    try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Africa/Dakar`);
        const d = await r.json();
        const c = d.current;
        const wDesc = {
            0: 'Ciel dégagé', 1: 'Peu nuageux', 2: 'Partiellement nuageux',
            3: 'Couvert', 61: 'Pluie légère', 80: 'Averses',
        };
        return `Météo actuelle à ${region}: ${Math.round(c.temperature_2m)}°C, ${(_a = wDesc[c.weather_code]) !== null && _a !== void 0 ? _a : 'Variable'}, humidité ${c.relative_humidity_2m}%, vent ${Math.round(c.wind_speed_10m)} km/h. Demain: max ${Math.round(d.daily.temperature_2m_max[1])}°C / min ${Math.round(d.daily.temperature_2m_min[1])}°C.`;
    }
    catch (_b) {
        return `Météo ${region}: données temporairement indisponibles.`;
    }
}
async function fetchProductsContext() {
    try {
        if (!firebase_1.db)
            throw new Error('no db');
        const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'products'), (0, firestore_1.orderBy)('createdAt', 'desc'), (0, firestore_1.limit)(8)));
        const lines = snap.docs.map(d => {
            var _a;
            const p = d.data();
            return `- ${p.name}: ${(_a = p.price) === null || _a === void 0 ? void 0 : _a.toLocaleString('fr-FR')} FCFA (stock: ${p.stock})`;
        });
        if (lines.length)
            return `Produits disponibles sur AgriMarché:\n${lines.join('\n')}`;
    }
    catch ( /* ignore */_a) { /* ignore */ }
    return 'Catalogue: Maïs hybride 25 000 FCFA, Mil certifié 22 000 FCFA, Engrais NPK 35 000 FCFA, Pesticide bio 18 000 FCFA, Semences arachide 30 000 FCFA.';
}
function detectWeatherRegion(text) {
    const lower = text.toLowerCase();
    if (!/météo|temps|pluie|soleil|climat|température|vent|humidité|orage/.test(lower))
        return null;
    const regions = {
        dakar: 'Dakar', thiès: 'Thiès', thies: 'Thiès',
        'saint-louis': 'Saint-Louis', kaolack: 'Kaolack',
        ziguinchor: 'Ziguinchor', louga: 'Louga',
    };
    for (const [k, v] of Object.entries(regions)) {
        if (lower.includes(k))
            return v;
    }
    return 'Dakar';
}
async function callDeepSeek(userMessage, history, userName) {
    var _a, _b, _c, _d;
    const weatherRegion = detectWeatherRegion(userMessage);
    const needsProducts = /produit|prix|acheter|semence|engrais|pesticide|maïs|mil|arachide|catalogue/.test(userMessage.toLowerCase());
    const contextParts = [];
    if (weatherRegion)
        contextParts.push(await fetchWeatherContext(weatherRegion));
    if (needsProducts)
        contextParts.push(await fetchProductsContext());
    const today = new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const systemPrompt = `Tu es **Agri**, l'assistant IA officiel d'AgriMarché Sénégal — plateforme B2B/B2C agricole de référence au Sénégal.

**Ton rôle :**
- Conseiller agricole expert : cultures, irrigation, sols, semences, récoltes
- Conseiller financier agricole : crédits, prêts, financement (BOA, Ecobank, BICIS, CBAO)
- Analyste de marchés : prix FCFA, tendances, prévisions
- Météorologue agricole : impact météo sur les cultures
- Expert en commerce B2B/B2C agricole au Sénégal

**Règles absolues :**
- Réponds UNIQUEMENT en français
- Utilise FCFA pour toutes les valeurs monétaires
- Adapte tes conseils aux 14 régions du Sénégal
- Formatage Markdown : **gras** pour les valeurs importantes, listes avec ·
- Sois précis, professionnel et chaleureux
- Réponds concisément (max 300 mots sauf si complexe)
- Propose toujours une action concrète à la fin

**Contexte utilisateur :**
- Nom : ${userName}
- Date : ${today}
${contextParts.length ? `\n**Données temps réel :**\n${contextParts.join('\n')}` : ''}

**Simulation financement :** taux 10–12% selon montant, durée flexible 3–36 mois, banques partenaires : BOA, Ecobank, BICIS, CBAO, La Poste Sénégal.`;
    const recentHistory = history.slice(-10);
    const messages = [
        ...recentHistory.map(h => ({ role: h.role, content: h.content })),
        { role: 'user', content: userMessage },
    ];
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
            model: 'deepseek-chat',
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            max_tokens: 600,
            temperature: 0.7,
            stream: false,
        }),
    });
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`DeepSeek API error ${resp.status}: ${err}`);
    }
    const data = await resp.json();
    const text = (_d = (_c = (_b = (_a = data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) !== null && _d !== void 0 ? _d : 'Désolé, je n\'ai pas pu générer une réponse. Réessayez.';
    const xpGained = Math.min(30, Math.max(5, Math.floor(text.length / 50)));
    return { text, xpGained };
}
// ─────────────────────────────────────────────
// QUICK PROMPTS
// ─────────────────────────────────────────────
const QUICK = [
    { label: '🌤️ Météo Dakar', q: 'Quelle est la météo à Dakar aujourd\'hui ?' },
    { label: '💰 Prêt 500K', q: 'Simule un prêt de 500 000 FCFA sur 12 mois' },
    { label: '🌽 Prix maïs', q: 'Quel est le prix actuel du maïs ?' },
    { label: '🌱 Irrigation', q: 'Conseils pour optimiser l\'irrigation au Sénégal' },
    { label: '📊 Mon score', q: 'Analyse mon profil et donne mon score crédit' },
    { label: '📈 Tendances', q: 'Quelles sont les tendances du marché agricole ?' },
];
// ─────────────────────────────────────────────
// MARKDOWN-LITE RENDERER
// ─────────────────────────────────────────────
function renderText(text) {
    const lines = text.split('\n');
    const lastIdx = lines.length - 1;
    return lines.map((line, i) => {
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
            if (p.startsWith('**') && p.endsWith('**')) {
                return <strong key={j} style={{ color: '#00ff87', fontWeight: 700 }}>{p.slice(2, -2)}</strong>;
            }
            return p;
        });
        return <span key={i}>{parts}{i < lastIdx ? <br /> : null}</span>;
    });
}
// ─────────────────────────────────────────────
// XP TOAST
// ─────────────────────────────────────────────
function XPToast({ xp, visible }) {
    return (<div style={{
            position: 'fixed', top: 80, right: 24, zIndex: 9999,
            background: 'linear-gradient(135deg, #00ff87, #00c96b)',
            color: '#060e09', fontWeight: 700, fontSize: 13,
            padding: '10px 18px', borderRadius: 50,
            boxShadow: '0 4px 24px rgba(0,255,135,0.4)',
            transform: visible ? 'translateY(0) scale(1)' : 'translateY(-20px) scale(0.9)',
            opacity: visible ? 1 : 0,
            transition: 'all 0.35s cubic-bezier(.22,.68,0,1.2)',
            pointerEvents: 'none',
        }}>
      +{xp} XP ⚡
    </div>);
}
// ─────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────
function AIAssistantPage() {
    const { user, profile, loading: authLoading } = (0, AuthContext_1.useAuth)();
    const [messages, setMessages] = (0, react_1.useState)([]);
    const [conversationHistory, setConversationHistory] = (0, react_1.useState)([]);
    const [input, setInput] = (0, react_1.useState)('');
    const [typing, setTyping] = (0, react_1.useState)(false);
    const [listening, setListening] = (0, react_1.useState)(false);
    const [xp, setXp] = (0, react_1.useState)(0);
    const [level, setLevel] = (0, react_1.useState)(getLevel(0));
    const [xpToast, setXpToast] = (0, react_1.useState)({ value: 0, visible: false });
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [hasAIAccess, setHasAIAccess] = (0, react_1.useState)(false);
    const [checkingAccess, setCheckingAccess] = (0, react_1.useState)(true);
    const [apiError, setApiError] = (0, react_1.useState)('');
    const bottomRef = (0, react_1.useRef)(null);
    const inputRef = (0, react_1.useRef)(null);
    const recogRef = (0, react_1.useRef)(null);
    const handleSendRef = (0, react_1.useRef)(() => Promise.resolve());
    const mountedRef = (0, react_1.useRef)(false);
    // Mount guard
    (0, react_1.useEffect)(() => {
        mountedRef.current = true;
        setMounted(true);
        return () => { mountedRef.current = false; };
    }, []);
    // ── VÉRIFICATION D'ACCÈS ─────────────────────────────────────────────────
    (0, react_1.useEffect)(() => {
        if (authLoading)
            return;
        if (!(user === null || user === void 0 ? void 0 : user.uid)) {
            setHasAIAccess(false);
            setCheckingAccess(false);
            return;
        }
        checkAIAccess(user.uid).then(ok => {
            setHasAIAccess(ok);
            setCheckingAccess(false);
        });
    }, [user, authLoading]);
    // ── XP ───────────────────────────────────────────────────────────────────
    (0, react_1.useEffect)(() => {
        if (!mounted)
            return;
        (async () => {
            var _a;
            let saved = parseInt(localStorage.getItem('agri_xp') || '0', 10);
            if (user && firebase_1.db) {
                try {
                    const snap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'users', user.uid));
                    if (snap.exists() && typeof ((_a = snap.data()) === null || _a === void 0 ? void 0 : _a.xp) === 'number') {
                        saved = snap.data().xp;
                        localStorage.setItem('agri_xp', saved.toString());
                    }
                }
                catch (e) {
                    console.error('XP load:', e);
                }
            }
            setXp(saved);
            setLevel(getLevel(saved));
        })();
    }, [mounted, user]);
    // ── MESSAGE DE BIENVENUE ─────────────────────────────────────────────────
    (0, react_1.useEffect)(() => {
        var _a;
        if (!mounted)
            return;
        const hour = new Date().getHours();
        const salut = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
        const name = (profile === null || profile === void 0 ? void 0 : profile.displayName) || ((_a = user === null || user === void 0 ? void 0 : user.email) === null || _a === void 0 ? void 0 : _a.split('@')[0]) || 'cher agriculteur';
        setMessages([{
                id: 'welcome',
                text: `${salut}, **${name}** 👋\n\nJe suis **Agri**, l'assistant IA d'AgriMarché Sénégal — propulsé par **DeepSeek**.\n\nJe suis connecté en temps réel et je peux vous aider sur :\n· 🌤️ **Météo** en direct via Open-Meteo\n· 💰 **Financement** : simulation BOA, Ecobank, BICIS, CBAO\n· 🛒 **Catalogue** connecté à votre base produits\n· 🌱 **Conseils agronomiques** adaptés aux 14 régions\n· 📊 **Score crédit** et analyse de profil\n· 📈 **Tendances et prévisions** de marché\n\nQuelle est votre question ?`,
                sender: 'bot', timestamp: new Date(), model: 'deepseek-chat',
            }]);
    }, [mounted]);
    const showXpToast = (value) => {
        setXpToast({ value, visible: true });
        setTimeout(() => setXpToast(prev => (Object.assign(Object.assign({}, prev), { visible: false }))), 2200);
    };
    // ── SEND ─────────────────────────────────────────────────────────────────
    const handleSend = (0, react_1.useCallback)(async (textOverride) => {
        var _a, _b, _c;
        const text = (textOverride !== undefined ? textOverride : input).trim();
        if (!text || typing)
            return;
        if (textOverride === undefined)
            setInput('');
        setApiError('');
        const userMsg = { id: Date.now().toString(), text, sender: 'user', timestamp: new Date() };
        setMessages(prev => [...prev, userMsg]);
        setTyping(true);
        if (user && firebase_1.db) {
            try {
                await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'users', user.uid, 'chatMessages'), {
                    text, sender: 'user', timestamp: firestore_1.Timestamp.fromDate(userMsg.timestamp),
                });
            }
            catch (e) {
                console.error('Firestore write (user):', e);
            }
        }
        try {
            const userName = (profile === null || profile === void 0 ? void 0 : profile.displayName) || ((_a = user === null || user === void 0 ? void 0 : user.email) === null || _a === void 0 ? void 0 : _a.split('@')[0]) || 'Agriculteur';
            const { text: response, xpGained } = await callDeepSeek(text, conversationHistory, userName);
            setConversationHistory(prev => [
                ...prev,
                { role: 'user', content: text },
                { role: 'assistant', content: response },
            ].slice(-20));
            setXp(prevXp => {
                const newXP = prevXp + xpGained;
                localStorage.setItem('agri_xp', newXP.toString());
                setLevel(getLevel(newXP));
                if (user && firebase_1.db) {
                    (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, 'users', user.uid), { xp: newXP }, { merge: true })
                        .catch(e => console.error('XP sync:', e));
                }
                return newXP;
            });
            showXpToast(xpGained);
            if (!mountedRef.current)
                return;
            const botMsg = {
                id: (Date.now() + 1).toString(), text: response, sender: 'bot',
                timestamp: new Date(), xpGained, model: 'deepseek-chat',
            };
            setMessages(prev => [...prev, botMsg]);
            if (user && firebase_1.db) {
                try {
                    await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'users', user.uid, 'chatMessages'), {
                        text: response, sender: 'bot', xpGained, model: 'deepseek-chat',
                        timestamp: firestore_1.Timestamp.fromDate(botMsg.timestamp),
                    });
                }
                catch (e) {
                    console.error('Firestore write (bot):', e);
                }
            }
        }
        catch (e) {
            console.error('DeepSeek error:', e);
            const isKeyError = ((_b = e === null || e === void 0 ? void 0 : e.message) === null || _b === void 0 ? void 0 : _b.includes('401')) || ((_c = e === null || e === void 0 ? void 0 : e.message) === null || _c === void 0 ? void 0 : _c.includes('403'));
            setApiError(isKeyError
                ? 'Clé API DeepSeek invalide ou expirée. Vérifiez NEXT_PUBLIC_DEEPSEEK_API_KEY.'
                : 'Connexion IA temporairement indisponible. Réessayez dans un instant.');
            setMessages(prev => [...prev, {
                    id: (Date.now() + 2).toString(),
                    text: '⚠️ **Service temporairement indisponible**\n\nL\'assistant IA rencontre un problème de connexion. Réessayez dans quelques instants.\n\nSi le problème persiste, vérifiez votre connexion internet.',
                    sender: 'bot', timestamp: new Date(),
                }]);
        }
        finally {
            if (mountedRef.current)
                setTyping(false);
        }
    }, [input, user, conversationHistory, profile, typing]);
    (0, react_1.useEffect)(() => { handleSendRef.current = handleSend; }, [handleSend]);
    // ── SPEECH RECOGNITION ───────────────────────────────────────────────────
    (0, react_1.useEffect)(() => {
        if (typeof window === 'undefined')
            return;
        const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SR)
            return;
        recogRef.current = new SR();
        recogRef.current.lang = 'fr-FR';
        recogRef.current.continuous = false;
        recogRef.current.onresult = (e) => {
            const t = e.results[0][0].transcript;
            setInput(t);
            handleSendRef.current(t);
            setListening(false);
        };
        recogRef.current.onerror = () => setListening(false);
        recogRef.current.onend = () => setListening(false);
    }, []);
    // Auto-scroll
    (0, react_1.useEffect)(() => { var _a; (_a = bottomRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);
    // ── LOADING ──────────────────────────────────────────────────────────────
    if (!mounted || authLoading || checkingAccess) {
        return (<div style={{
                minHeight: '100vh', background: '#060e09', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20,
            }}>
        <div style={{
                width: 56, height: 56, borderRadius: '50%',
                border: '3px solid #00ff87', borderTopColor: 'transparent',
                animation: 'spin 0.8s linear infinite',
            }}/>
        <p style={{ color: '#00ff87', fontFamily: 'sans-serif', fontSize: 15, letterSpacing: 1 }}>
          Initialisation IA…
        </p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>);
    }
    // ── ACCÈS REFUSÉ ─────────────────────────────────────────────────────────
    if (!hasAIAccess) {
        return (<div style={{
                minHeight: '100vh', background: '#060e09', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24,
                fontFamily: 'system-ui, sans-serif', padding: '24px',
            }}>
        <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'linear-gradient(135deg, #1a2e1e, #0d1a10)',
                border: '2px solid #1a2e1e',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
            }}>🔒</div>
        <p style={{ color: '#e8f5e9', fontSize: 20, fontWeight: 700, margin: 0 }}>Accès IA Premium requis</p>
        <p style={{ color: '#6b8a71', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.6, margin: 0 }}>
          Débloquez l'assistant IA DeepSeek pour seulement{' '}
          <strong style={{ color: '#00ff87' }}>690 FCFA</strong> et profitez de toutes ses fonctionnalités pendant 30 jours.
        </p>

        {/* Ce que l'utilisateur rate */}
        <div style={{
                background: '#0d1a10', border: '1px solid #1a2e1e', borderRadius: 16,
                padding: '20px 24px', width: '100%', maxWidth: 340,
            }}>
          {[
                ['🌤️', 'Météo temps réel par région'],
                ['💰', 'Simulation financement & crédit'],
                ['🌱', 'Conseils agronomiques IA'],
                ['📈', 'Prévisions de marché'],
            ].map(([icon, label]) => (<div key={label} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '8px 0', borderBottom: '1px solid #1a2e1e',
                    fontSize: 13.5, color: '#b2cfb8',
                }}>
              <span style={{ fontSize: 16, opacity: 0.4 }}>{icon}</span>
              <span style={{ opacity: 0.4 }}>{label}</span>
              <span style={{ marginLeft: 'auto', color: '#ef4444', fontSize: 13 }}>🔒</span>
            </div>))}
        </div>

        <link_1.default href="/main/unlock-ia" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                padding: '14px 36px',
                background: 'linear-gradient(135deg, #00ff87, #00c96b)',
                color: '#060e09', fontWeight: 700, fontSize: 15,
                borderRadius: 50, textDecoration: 'none',
                boxShadow: '0 4px 24px rgba(0,255,135,0.3)',
            }}>
          Débloquer l'IA Premium — 690 FCFA
        </link_1.default>
        <link_1.default href="/main" style={{ color: '#6b8a71', fontSize: 13, textDecoration: 'none' }}>
          ← Retour à l'accueil
        </link_1.default>
      </div>);
    }
    // ── TOKENS DE DESIGN ─────────────────────────────────────────────────────
    const bg = '#060e09';
    const surface = '#0d1a10';
    const border = '#1a2e1e';
    const green = '#00ff87';
    const greenDim = '#00c96b';
    const textPrimary = '#e8f5e9';
    const textMuted = '#6b8a71';
    // ── CHAT UI ───────────────────────────────────────────────────────────────
    return (<div style={{ minHeight: '100vh', background: bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: textPrimary }}>
      <XPToast xp={xpToast.value} visible={xpToast.visible}/>

      {/* ── HEADER ── */}
      <header style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: `${surface}e8`, backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${border}`, padding: '0 24px',
        }}>
        <div style={{
            maxWidth: 900, margin: '0 auto', height: 68,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Left */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ position: 'relative' }}>
              <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: `linear-gradient(135deg, ${green}, #00bcd4)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: `0 0 20px ${green}33`,
        }}>🌿</div>
              <div style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 10, height: 10, borderRadius: '50%',
            background: green, border: `2px solid ${surface}`,
            boxShadow: `0 0 8px ${green}`, animation: 'pulse 2s infinite',
        }}/>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.2px' }}>Agri</span>
                <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            background: `${green}18`, color: green,
            padding: '2px 8px', borderRadius: 20, border: `1px solid ${green}33`,
        }}>DeepSeek</span>
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 1 }}>AgriMarché Sénégal · IA en ligne</div>
            </div>
          </div>

          {/* Right: XP + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: level.color, fontWeight: 600 }}>{level.title}</span>
                <span style={{
            fontSize: 11, background: `${level.color}22`, color: level.color,
            padding: '1px 6px', borderRadius: 10, fontWeight: 700,
        }}>Niv. {level.level}</span>
              </div>
              <div style={{
            width: 120, height: 4, background: border,
            borderRadius: 4, marginTop: 5, overflow: 'hidden',
        }}>
                <div style={{
            width: `${level.progress}%`, height: '100%',
            background: `linear-gradient(90deg, ${level.color}, ${green})`,
            borderRadius: 4, transition: 'width 0.6s cubic-bezier(.22,.68,0,1.2)',
        }}/>
              </div>
              <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>
                {xp} / {level.nextLevelXP} XP
              </div>
            </div>
            <link_1.default href="/main" style={{
            width: 34, height: 34, borderRadius: '50%',
            background: border, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: textMuted, fontSize: 16, textDecoration: 'none', transition: 'background 0.2s',
        }} onMouseEnter={e => (e.currentTarget.style.background = '#253028')} onMouseLeave={e => (e.currentTarget.style.background = border)}>✕</link_1.default>
          </div>
        </div>
      </header>

      {/* ── CHAT AREA ── */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 200px' }}>
        {apiError && (<div style={{
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 12, padding: '12px 16px', marginBottom: 20,
                display: 'flex', alignItems: 'center', gap: 10,
            }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 13, color: '#f87171' }}>{apiError}</span>
            <button onClick={() => setApiError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>)}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((msg) => (<div key={msg.id} style={{
                display: 'flex',
                flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 12,
                animation: 'fadeUp 0.3s ease-out',
            }}>
              {msg.sender === 'bot' && (<div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${green}, #00bcd4)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, boxShadow: `0 0 16px ${green}22`,
                }}>🌿</div>)}
              <div style={{
                maxWidth: '72%',
                background: msg.sender === 'user'
                    ? `linear-gradient(135deg, ${green}, ${greenDim})`
                    : surface,
                color: msg.sender === 'user' ? '#060e09' : textPrimary,
                padding: '14px 18px',
                borderRadius: msg.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                border: msg.sender === 'bot' ? `1px solid ${border}` : 'none',
                lineHeight: 1.65, fontSize: 14.5,
                boxShadow: msg.sender === 'user' ? `0 4px 20px ${green}33` : '0 2px 12px rgba(0,0,0,0.3)',
            }}>
                {msg.sender === 'user'
                ? <span style={{ fontWeight: 500 }}>{msg.text}</span>
                : <span>{renderText(msg.text)}</span>}
                <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginTop: 10, paddingTop: 8,
                borderTop: `1px solid ${msg.sender === 'user' ? 'rgba(0,0,0,0.12)' : border}`,
            }}>
                  <span style={{ fontSize: 11, color: msg.sender === 'user' ? 'rgba(0,0,0,0.5)' : textMuted }}>
                    {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.sender === 'bot' && msg.model && (<span style={{ fontSize: 11, color: '#00bcd4', background: '#00bcd422', padding: '1px 6px', borderRadius: 8 }}>
                      {msg.model}
                    </span>)}
                  {msg.xpGained && msg.sender === 'bot' && (<span style={{ fontSize: 11, color: green, background: `${green}12`, padding: '1px 6px', borderRadius: 8 }}>
                      +{msg.xpGained} XP
                    </span>)}
                </div>
              </div>
            </div>))}

          {/* Typing indicator */}
          {typing && (<div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, animation: 'fadeUp 0.3s ease-out' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${green}, #00bcd4)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18,
            }}>🌿</div>
              <div style={{
                background: surface, border: `1px solid ${border}`,
                padding: '16px 20px', borderRadius: '20px 20px 20px 4px',
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                {[0, 1, 2].map(i => (<div key={i} style={{
                    width: 8, height: 8, borderRadius: '50%', background: green, opacity: 0.7,
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                }}/>))}
                <span style={{ fontSize: 12, color: textMuted, marginLeft: 6 }}>Agri analyse…</span>
              </div>
            </div>)}

          <div ref={bottomRef}/>
        </div>
      </main>

      {/* ── BOTTOM BAR ── */}
      <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 40,
            background: `${surface}f0`, backdropFilter: 'blur(24px)',
            borderTop: `1px solid ${border}`,
        }}>
        {/* Quick prompts */}
        <div style={{
            maxWidth: 900, margin: '0 auto', padding: '12px 16px 0',
            display: 'flex', gap: 8, overflowX: 'auto', scrollbarWidth: 'none',
        }}>
          {QUICK.map(({ label, q }) => (<button key={q} onClick={() => handleSend(q)} style={{
                flexShrink: 0, padding: '6px 14px',
                background: `${green}10`, border: `1px solid ${green}30`,
                color: green, borderRadius: 20, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
            }} onMouseEnter={e => { e.currentTarget.style.background = `${green}22`; e.currentTarget.style.borderColor = green; }} onMouseLeave={e => { e.currentTarget.style.background = `${green}10`; e.currentTarget.style.borderColor = `${green}30`; }}>{label}</button>))}
        </div>

        {/* Input row */}
        <div style={{
            maxWidth: 900, margin: '0 auto', padding: '12px 16px 16px',
            display: 'flex', gap: 10, alignItems: 'center',
        }}>
          {/* Mic */}
          <button onClick={() => {
            if (!recogRef.current)
                return;
            if (listening) {
                recogRef.current.stop();
                setListening(false);
            }
            else {
                setListening(true);
                recogRef.current.start();
            }
        }} style={{
            width: 46, height: 46, borderRadius: '50%', flexShrink: 0,
            background: listening ? '#ef4444' : border,
            border: `1px solid ${listening ? '#ef4444' : border}`,
            color: listening ? '#fff' : textMuted, fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: listening ? '0 0 20px rgba(239,68,68,0.4)' : 'none',
            animation: listening ? 'pulse 1s infinite' : 'none', transition: 'all 0.2s',
        }} title={listening ? 'Arrêter' : 'Parler'}>🎙️</button>

          {/* Input */}
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !typing && handleSend()} placeholder={listening ? '🎙️ Écoute en cours…' : 'Posez votre question à Agri…'} style={{
            flex: 1, height: 46,
            background: '#0a1610', border: `1px solid ${border}`,
            borderRadius: 14, padding: '0 16px',
            color: textPrimary, fontSize: 14.5, outline: 'none',
            transition: 'border-color 0.2s',
        }} onFocus={e => (e.target.style.borderColor = `${green}66`)} onBlur={e => (e.target.style.borderColor = border)}/>

          {/* Send */}
          <button onClick={() => handleSend()} disabled={!input.trim() || typing} style={{
            height: 46, padding: '0 22px', borderRadius: 14, flexShrink: 0,
            background: input.trim() && !typing
                ? `linear-gradient(135deg, ${green}, ${greenDim})`
                : border,
            color: input.trim() && !typing ? '#060e09' : textMuted,
            fontWeight: 700, fontSize: 14,
            cursor: input.trim() && !typing ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: input.trim() && !typing ? `0 4px 16px ${green}44` : 'none',
            transition: 'all 0.2s',
        }}>{typing ? '⏳' : 'Envoyer'}</button>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes bounce { 0%,80%,100%{transform:translateY(0)} 40%{transform:translateY(-6px)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#1a2e1e;border-radius:4px}
        *{box-sizing:border-box}
      `}</style>
    </div>);
}
