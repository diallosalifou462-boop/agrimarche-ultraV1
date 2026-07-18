"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AIAssistantPage;
const react_1 = require("react");
const link_1 = __importDefault(require("next/link"));
const AuthContext_1 = require("@/contexts/AuthContext");
const firebase_1 = require("@/lib/firebase/firebase");
const firestore_1 = require("firebase/firestore");
// ─────────────────────────────────────────────
// NLP ENGINE
// ─────────────────────────────────────────────
class NLP {
    static detect(text) {
        const lower = text.toLowerCase();
        const entities = {};
        // Entities
        const amtMatch = text.match(/\b(\d{4,7})\b/);
        if (amtMatch)
            entities.amount = parseInt(amtMatch[1]);
        const durMatch = text.match(/(\d+)\s*mois/);
        if (durMatch)
            entities.duration = parseInt(durMatch[1]);
        const regionMap = {
            dakar: 'Dakar', thiès: 'Thiès', 'saint-louis': 'Saint-Louis',
            kaolack: 'Kaolack', ziguinchor: 'Ziguinchor', louga: 'Louga',
        };
        for (const [k, v] of Object.entries(regionMap)) {
            if (lower.includes(k)) {
                entities.region = v;
                break;
            }
        }
        const products = ['maïs', 'mil', 'arachide', 'engrais', 'pesticide', 'semence'];
        for (const p of products) {
            if (lower.includes(p)) {
                entities.product = p;
                break;
            }
        }
        for (const [intent, re] of this.patterns) {
            if (re.test(lower)) {
                let conf = 0.72;
                if (entities.amount)
                    conf += 0.08;
                if (entities.region)
                    conf += 0.08;
                if (entities.product)
                    conf += 0.07;
                return { intent, confidence: Math.min(0.97, conf), entities };
            }
        }
        return { intent: 'GENERAL', confidence: 0.5, entities };
    }
}
NLP.patterns = new Map([
    ['WEATHER', /météo|temps|pluie|soleil|climat|température|vent|humidité|orage/i],
    ['LOAN', /prêt|crédit|financement|emprunt|argent|finance|loan/i],
    ['PRODUCT', /produit|prix|acheter|semence|engrais|pesticide|matériel|maïs|mil|arachide/i],
    ['ADVICE', /conseil|astuce|aide|comment|plantation|récolte|culture|technique|irrigation/i],
    ['MARKET', /marché|tendance|cours|vente|opportunité/i],
    ['ANALYSIS', /analyse|score|statistique|rapport|performance|crédit/i],
    ['PREDICTION', /prédiction|prévision|futur|prévoir/i],
    ['GREETING', /bonjour|salut|hello|hey|bonsoir/i],
    ['THANKS', /merci|super|génial|parfait|bravo/i],
    ['GOODBYE', /au revoir|bye|à bientôt|adieu/i],
]);
// ─────────────────────────────────────────────
// GAMIFICATION
// ─────────────────────────────────────────────
const XP_MAP = {
    WEATHER: 15, LOAN: 25, PRODUCT: 10, ADVICE: 20,
    MARKET: 12, ANALYSIS: 20, PREDICTION: 20,
    GREETING: 5, THANKS: 5, GOODBYE: 3, GENERAL: 5,
};
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
// RESPONSE ENGINE
// ─────────────────────────────────────────────
async function buildResponse(intent, entities) {
    var _a, _b;
    switch (intent) {
        case 'WEATHER': {
            const region = entities.region || 'Dakar';
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
                    0: 'Ciel dégagé ☀️', 1: 'Peu nuageux 🌤️', 2: 'Partiellement nuageux ⛅',
                    3: 'Couvert ☁️', 45: 'Brouillard 🌫️', 61: 'Pluie légère 🌦️', 80: 'Averses 🌧️',
                };
                const desc = (_a = wDesc[c.weather_code]) !== null && _a !== void 0 ? _a : 'Variable 🌡️';
                const tip = c.temperature_2m > 33
                    ? '⚠️ Chaleur intense — arrosez avant 8h, paillez pour conserver l\'humidité.'
                    : c.relative_humidity_2m > 70
                        ? '💧 Forte humidité — surveillez les maladies fongiques sur vos cultures.'
                        : '✅ Conditions favorables pour les travaux agricoles.';
                return `**Météo en temps réel — ${region}**\n\n**${Math.round(c.temperature_2m)}°C** · ${desc}\nHumidité : ${c.relative_humidity_2m}% · Vent : ${Math.round(c.wind_speed_10m)} km/h\n\nPrévision demain : ${Math.round(d.daily.temperature_2m_max[1])}°C / ${Math.round(d.daily.temperature_2m_min[1])}°C\n\n${tip}`;
            }
            catch (_c) {
                return `**Météo — ${region}** (cache)\n\n**32°C** · Ensoleillé ☀️\nHumidité : 48% · Vent : 14 km/h\n\n✅ Conditions favorables pour les travaux agricoles.`;
            }
        }
        case 'LOAN': {
            const amount = entities.amount || 500000;
            const duration = entities.duration || 12;
            const rate = amount > 2000000 ? 0.12 : amount > 1000000 ? 0.11 : 0.10;
            const mr = rate / 12;
            const monthly = amount * (mr * Math.pow(1 + mr, duration)) / (Math.pow(1 + mr, duration) - 1);
            const total = monthly * duration;
            const interest = total - amount;
            const badge = amount > 2000000 ? '🔴 Étude approfondie' : amount > 1000000 ? '🟡 Éligible — taux 11%' : '🟢 Éligible — taux préférentiel 10%';
            return `**Simulation de financement**\n\nMontant : **${amount.toLocaleString('fr-FR')} FCFA**\nDurée : **${duration} mois** · Taux : ${(rate * 100).toFixed(0)}%\n\nMensualité : **${Math.round(monthly).toLocaleString('fr-FR')} FCFA**\nTotal à rembourser : **${Math.round(total).toLocaleString('fr-FR')} FCFA**\nIntérêts : ${Math.round(interest).toLocaleString('fr-FR')} FCFA\n\n${badge}\n\nCliquez **Faire une demande** pour constituer votre dossier en 3 minutes.`;
        }
        case 'PRODUCT': {
            try {
                if (!firebase_1.db)
                    throw new Error('Firebase non initialisé');
                const snap = await (0, firestore_1.getDocs)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'products'), (0, firestore_1.orderBy)('createdAt', 'desc'), (0, firestore_1.limit)(5)));
                const products = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
                if (products.length > 0) {
                    const pName = entities.product;
                    const found = pName ? products.find((p) => { var _a; return (_a = p.name) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(pName); }) : null;
                    if (found) {
                        return `**${found.name}**\n\nPrix : **${(_b = found.price) === null || _b === void 0 ? void 0 : _b.toLocaleString('fr-FR')} FCFA**\nStock : ${found.stock} unités disponibles\nVendeur : ${found.sellerName || 'Partenaire AgriMarché'}\n\n🚚 Livraison gratuite > 100 000 FCFA\n💳 Financement disponible jusqu'à 12 mois`;
                    }
                    const list = products.slice(0, 5).map((p) => { var _a; return `· **${p.name}** — ${(_a = p.price) === null || _a === void 0 ? void 0 : _a.toLocaleString('fr-FR')} FCFA`; }).join('\n');
                    return `**Produits disponibles**\n\n${list}\n\nPrécisez un produit pour plus de détails. Ex : *"prix du maïs"*`;
                }
            }
            catch (e) {
                console.error('Firestore products error:', e);
            }
            return `**Catalogue AgriMarché**\n\n· Maïs hybride — 25 000 FCFA/sac\n· Mil certifié — 22 000 FCFA/sac\n· Engrais NPK 15-15-15 — 35 000 FCFA\n· Pesticide bio — 18 000 FCFA\n· Semences arachide — 30 000 FCFA/sac\n\n🔍 Précisez un produit pour les détails complets.`;
        }
        case 'ADVICE': {
            const topic = entities.product || 'general';
            const guides = {
                irrigation: `**Guide irrigation intelligente**\n\nMeilleur créneau : **5h – 8h** (évaporation minimale)\nÉvitez 11h–15h : pertes jusqu'à +50%\n\nTechniques recommandées :\n· Goutte-à-goutte → économie 40% d'eau\n· Aspersion → couverture homogène\n· Mulching → réduction évaporation sol\n\nQuantités par culture :\n· Maïs : 500–600 mm/cycle\n· Mil : 400–500 mm/cycle\n· Arachide : 350–450 mm/cycle`,
                general: `**Guide de l'agriculteur moderne**\n\n**Préparation du sol**\nAnalyse bi-annuelle — un sol équilibré = +25% de rendement\n\n**Semences**\nVariétés certifiées adaptées à votre région\nRotation des cultures obligatoire\n\n**Eau**\nIrrigation goutte-à-goutte : –40% de consommation\nArrosez entre 5h et 8h du matin\n\n**Protection**\nLutte biologique en priorité\nTraitements préventifs plutôt que curatifs\n\n**Résultat attendu :** +30% rendement, –40% d'intrants`,
            };
            return guides[topic] || guides.general;
        }
        case 'MARKET':
            return `**Marchés agricoles — ${new Date().toLocaleDateString('fr-FR')}**\n\n**Céréales**\n· Maïs : 25 000 FCFA ↑ +5%\n· Mil : 22 000 FCFA ↓ –2%\n· Riz : 28 000 FCFA ↑ +3%\n\n**Légumineuses**\n· Arachide : 30 000 FCFA ↑ +8%\n· Niébé : 35 000 FCFA ↑ +10%\n\n**Intrants**\n· Engrais NPK : 35 000 FCFA ↓ –5%\n· Urée : 32 000 FCFA → stable\n\n📈 **Prévision IA :** Hausse attendue en septembre — achat anticipé conseillé.`;
        case 'ANALYSIS':
            return `**Analyse de votre profil**\n\nScore AgriFinance : **680 / 1000** ⭐⭐⭐\nFinancement max estimé : **1 500 000 FCFA**\n\nPoints forts :\n✅ Historique de paiements régulier\n✅ Compte actif depuis 6+ mois\n\nAxes d'amélioration :\n→ Augmentez vos achats mensuels\n→ Complétez votre profil vendeur\n\n💡 Atteignez 800 pts pour débloquer **5 000 000 FCFA** de financement.`;
        case 'PREDICTION': {
            const data = [100000, 120000, 95000, 150000, 130000, 110000, 140000];
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const trend = data[data.length - 1] > data[0] ? '↑ Croissant' : '↓ Décroissant';
            return `**Prédictions de marché — IA**\n\nTendance actuelle : **${trend}**\nVolume moyen : ${Math.round(avg).toLocaleString('fr-FR')} FCFA\n\nProjections 5 jours :\n· J+1 : ${(avg * 1.03).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA\n· J+2 : ${(avg * 1.05).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA\n· J+3 : ${(avg * 1.04).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA\n· J+4 : ${(avg * 1.07).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA\n· J+5 : ${(avg * 1.06).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} FCFA\n\n💡 Meilleur moment pour acheter : **maintenant**, avant la hausse prévue.`;
        }
        case 'GREETING': {
            const hour = new Date().getHours();
            const salut = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
            return `${salut} 👋\n\nJe suis **Agri**, l'assistant IA d'AgriMarché Sénégal.\n\nJe peux vous aider sur :\n· 🌤️ Météo en temps réel par région\n· 💰 Simulation et demande de financement\n· 🛒 Prix et disponibilité des produits\n· 🌱 Conseils agronomiques personnalisés\n· 📊 Analyse de votre profil et score crédit\n· 📈 Prévisions de marché\n\nQuelle est votre question ?`;
        }
        case 'THANKS':
            return `Avec plaisir ! Je reste disponible pour toutes vos questions, 24h/24.\n\nBonne récolte 🌾`;
        case 'GOODBYE':
            return `À bientôt sur AgriMarché ! 👋\n\nN'hésitez pas à revenir pour consulter les prix, la météo ou simuler un financement.`;
        default:
            return `Je n'ai pas saisi votre demande précisément.\n\nVoici ce que je peux faire :\n\n· **Météo** → *"Météo à Dakar"*\n· **Financement** → *"Prêt 500000 12 mois"*\n· **Produits** → *"Prix du maïs"*\n· **Conseils** → *"Conseils irrigation"*\n· **Score crédit** → *"Mon score"*\n· **Marchés** → *"Tendances prix"*\n\nPosez votre question, je vous réponds précisément.`;
    }
}
// ─────────────────────────────────────────────
// QUICK PROMPTS
// ─────────────────────────────────────────────
const QUICK = [
    { label: 'Météo Dakar', q: 'Météo à Dakar' },
    { label: 'Prêt 500K', q: 'Prêt 500000 12 mois' },
    { label: 'Prix maïs', q: 'Prix du maïs' },
    { label: 'Conseils irrigation', q: 'Conseils irrigation' },
    { label: 'Mon score', q: 'Mon score crédit' },
    { label: 'Tendances', q: 'Tendances prix marché' },
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
// TOAST (minimal)
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
    const [input, setInput] = (0, react_1.useState)('');
    const [typing, setTyping] = (0, react_1.useState)(false);
    const [listening, setListening] = (0, react_1.useState)(false);
    const [xp, setXp] = (0, react_1.useState)(0);
    const [level, setLevel] = (0, react_1.useState)(getLevel(0));
    const [xpToast, setXpToast] = (0, react_1.useState)({ value: 0, visible: false });
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [hasAIAccess, setHasAIAccess] = (0, react_1.useState)(false);
    const [checkingAccess, setCheckingAccess] = (0, react_1.useState)(true);
    const bottomRef = (0, react_1.useRef)(null);
    const inputRef = (0, react_1.useRef)(null);
    const recogRef = (0, react_1.useRef)(null);
    const handleSendRef = (0, react_1.useRef)(() => Promise.resolve());
    const mountedRef = (0, react_1.useRef)(false);
    // Mount guard (hydration)
    (0, react_1.useEffect)(() => {
        mountedRef.current = true;
        setMounted(true);
        return () => { mountedRef.current = false; };
    }, []);
    // Vérifier l'accès IA — logique identique à main/page.tsx
    (0, react_1.useEffect)(() => {
        if (authLoading)
            return;
        const checkAccess = async () => {
            var _a, _b;
            setCheckingAccess(true);
            if (!(user === null || user === void 0 ? void 0 : user.uid)) {
                setHasAIAccess(false);
                setCheckingAccess(false);
                return;
            }
            // 1. Vérification Firestore (source de vérité)
            if (firebase_1.db) {
                try {
                    const userDocSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'users', user.uid));
                    const userData = userDocSnap.data();
                    if ((userData === null || userData === void 0 ? void 0 : userData.hasAIAccess) && (userData === null || userData === void 0 ? void 0 : userData.aiExpiryDate)) {
                        const expiryDate = ((_b = (_a = userData.aiExpiryDate).toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || new Date(userData.aiExpiryDate);
                        if (expiryDate > new Date()) {
                            setHasAIAccess(true);
                            setCheckingAccess(false);
                            return;
                        }
                    }
                }
                catch (e) {
                    console.error('Firestore access check error:', e);
                }
            }
            // 2. Fallback localStorage (même clés que main/page.tsx)
            const savedCode = localStorage.getItem('ai_access_code');
            const savedUserId = localStorage.getItem('ai_user_id');
            if (savedCode && savedUserId === user.uid) {
                const expiry = localStorage.getItem('ai_code_expiry');
                if (expiry && new Date().getTime() < parseInt(expiry)) {
                    setHasAIAccess(true);
                    setCheckingAccess(false);
                    return;
                }
            }
            setHasAIAccess(false);
            setCheckingAccess(false);
        };
        checkAccess();
    }, [user, authLoading]);
    // Init XP — Firestore en priorité, localStorage en fallback
    (0, react_1.useEffect)(() => {
        if (!mounted)
            return;
        const loadXP = async () => {
            var _a;
            let saved = parseInt(localStorage.getItem('agri_xp') || '0', 10);
            if (user && firebase_1.db) {
                try {
                    const userDocSnap = await (0, firestore_1.getDoc)((0, firestore_1.doc)(firebase_1.db, 'users', user.uid));
                    if (userDocSnap.exists() && typeof ((_a = userDocSnap.data()) === null || _a === void 0 ? void 0 : _a.xp) === 'number') {
                        saved = userDocSnap.data().xp;
                        localStorage.setItem('agri_xp', saved.toString());
                    }
                }
                catch (e) {
                    console.error('Firestore XP load error:', e);
                }
            }
            setXp(saved);
            setLevel(getLevel(saved));
        };
        loadXP();
    }, [mounted, user]);
    // Welcome message
    (0, react_1.useEffect)(() => {
        var _a;
        if (!mounted)
            return;
        const hour = new Date().getHours();
        const salut = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
        const name = (profile === null || profile === void 0 ? void 0 : profile.displayName) || ((_a = user === null || user === void 0 ? void 0 : user.email) === null || _a === void 0 ? void 0 : _a.split('@')[0]) || 'cher agriculteur';
        setMessages([{
                id: 'welcome',
                text: `${salut}, **${name}** 👋\n\nJe suis **Agri**, l'assistant IA d'AgriMarché Sénégal — conçu pour vous accompagner à chaque étape de votre activité agricole.\n\nJe maîtrise :\n· 🌤️ **Météo** en temps réel (API Open-Meteo)\n· 💰 **Financement** avec simulation personnalisée\n· 🛒 **Catalogue** connecté à votre Firestore\n· 🌱 **Conseil agronomique** adapté à votre région\n· 📊 **Analyse de profil** et score crédit\n· 📈 **Prédictions de marché** par algorithme\n\nQuelle est votre question aujourd'hui ?`,
                sender: 'bot',
                timestamp: new Date(),
            }]);
    }, [mounted]);
    const showXpToast = (value) => {
        setXpToast({ value, visible: true });
        setTimeout(() => setXpToast(prev => (Object.assign(Object.assign({}, prev), { visible: false }))), 2200);
    };
    const handleSend = (0, react_1.useCallback)(async (textOverride) => {
        var _a;
        const text = (textOverride !== undefined ? textOverride : input).trim();
        if (!text)
            return;
        if (textOverride === undefined)
            setInput('');
        const userMsg = {
            id: Date.now().toString(),
            text,
            sender: 'user',
            timestamp: new Date(),
        };
        setMessages(prev => [...prev, userMsg]);
        setTyping(true);
        // Persist user message to Firestore
        if (user && firebase_1.db) {
            try {
                await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'users', user.uid, 'chatMessages'), {
                    text,
                    sender: 'user',
                    timestamp: firestore_1.Timestamp.fromDate(userMsg.timestamp),
                });
            }
            catch (e) {
                console.error('Firestore write error (user msg):', e);
            }
        }
        const { intent, confidence, entities } = NLP.detect(text);
        const xpGained = (_a = XP_MAP[intent]) !== null && _a !== void 0 ? _a : 5;
        const response = await buildResponse(intent, entities);
        // Use functional updater to avoid stale xp closure
        setXp(prevXp => {
            const newXP = prevXp + xpGained;
            localStorage.setItem('agri_xp', newXP.toString());
            setLevel(getLevel(newXP));
            // Persist XP to Firestore
            if (user && firebase_1.db) {
                (0, firestore_1.setDoc)((0, firestore_1.doc)(firebase_1.db, 'users', user.uid), { xp: newXP }, { merge: true })
                    .catch(e => console.error('Firestore XP sync error:', e));
            }
            return newXP;
        });
        showXpToast(xpGained);
        setTimeout(async () => {
            if (!mountedRef.current)
                return;
            const botMsg = {
                id: (Date.now() + 1).toString(),
                text: response,
                sender: 'bot',
                timestamp: new Date(),
                intent,
                confidence,
                xpGained,
            };
            setMessages(prev => [...prev, botMsg]);
            setTyping(false);
            // Persist bot message to Firestore
            if (user && firebase_1.db) {
                try {
                    await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'users', user.uid, 'chatMessages'), {
                        text: response,
                        sender: 'bot',
                        intent,
                        confidence,
                        xpGained,
                        timestamp: firestore_1.Timestamp.fromDate(botMsg.timestamp),
                    });
                }
                catch (e) {
                    console.error('Firestore write error (bot msg):', e);
                }
            }
        }, 420 + Math.random() * 300);
    }, [input, user]);
    // Speech Recognition
    (0, react_1.useEffect)(() => { handleSendRef.current = handleSend; }, [handleSend]);
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
    (0, react_1.useEffect)(() => {
        var _a;
        (_a = bottomRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: 'smooth' });
    }, [messages, typing]);
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
    // Accès refusé — redirection vers main
    if (!hasAIAccess) {
        return (<div style={{
                minHeight: '100vh', background: '#060e09', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 24,
                fontFamily: 'system-ui, sans-serif',
            }}>
        <div style={{ fontSize: 56 }}>🔒</div>
        <p style={{ color: '#e8f5e9', fontSize: 20, fontWeight: 700 }}>
          Accès IA Premium requis
        </p>
        <p style={{ color: '#6b8a71', fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
          Débloquez l'assistant IA pour seulement 500 FCFA et profitez de toutes ses fonctionnalités.
        </p>
        <link_1.default href="/main/unlock-ia" style={{
                marginTop: 8,
                padding: '12px 32px',
                background: 'linear-gradient(135deg, #00ff87, #00c96b)',
                color: '#060e09', fontWeight: 700, fontSize: 15,
                borderRadius: 50, textDecoration: 'none',
                boxShadow: '0 4px 20px rgba(0,255,135,0.3)',
            }}>
          Débloquer l'IA Premium
        </link_1.default>
        <link_1.default href="/main" style={{ color: '#6b8a71', fontSize: 13, textDecoration: 'none', marginTop: 4 }}>
          ← Retour à l'accueil
        </link_1.default>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>);
    }
    const bg = '#060e09';
    const surface = '#0d1a10';
    const border = '#1a2e1e';
    const green = '#00ff87';
    const greenDim = '#00c96b';
    const textPrimary = '#e8f5e9';
    const textMuted = '#6b8a71';
    return (<div style={{ minHeight: '100vh', background: bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: textPrimary }}>
      <XPToast xp={xpToast.value} visible={xpToast.visible}/>

      {/* ── HEADER ── */}
      <header style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: `${surface}e8`,
            backdropFilter: 'blur(20px)',
            borderBottom: `1px solid ${border}`,
            padding: '0 24px',
        }}>
        <div style={{
            maxWidth: 900, margin: '0 auto', height: 68,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          {/* Left: identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Avatar */}
            <div style={{ position: 'relative' }}>
              <div style={{
            width: 46, height: 46, borderRadius: '50%',
            background: `linear-gradient(135deg, ${green}, #00bcd4)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: `0 0 20px ${green}33`,
        }}>
                🌿
              </div>
              <div style={{
            position: 'absolute', bottom: 1, right: 1,
            width: 10, height: 10, borderRadius: '50%',
            background: green, border: `2px solid ${surface}`,
            boxShadow: `0 0 8px ${green}`,
            animation: 'pulse 2s infinite',
        }}/>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.2px' }}>
                  Agri
                </span>
                <span style={{
            fontSize: 11, fontWeight: 600, letterSpacing: 0.5,
            background: `${green}18`, color: green,
            padding: '2px 8px', borderRadius: 20,
            border: `1px solid ${green}33`,
        }}>IA</span>
              </div>
              <div style={{ fontSize: 12, color: textMuted, marginTop: 1 }}>
                AgriMarché Sénégal · En ligne
              </div>
            </div>
          </div>

          {/* Right: XP bar + close */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
                <span style={{ fontSize: 12, color: level.color, fontWeight: 600 }}>
                  {level.title}
                </span>
                <span style={{
            fontSize: 11, background: `${level.color}22`,
            color: level.color, padding: '1px 6px', borderRadius: 10,
            fontWeight: 700,
        }}>
                  Niv. {level.level}
                </span>
              </div>
              <div style={{
            width: 120, height: 4, background: border,
            borderRadius: 4, marginTop: 5, overflow: 'hidden',
        }}>
                <div style={{
            width: `${level.progress}%`, height: '100%',
            background: `linear-gradient(90deg, ${level.color}, ${green})`,
            borderRadius: 4,
            transition: 'width 0.6s cubic-bezier(.22,.68,0,1.2)',
        }}/>
              </div>
              <div style={{ fontSize: 10, color: textMuted, marginTop: 3 }}>
                {xp} / {level.nextLevelXP} XP
              </div>
            </div>
            <link_1.default href="/main" style={{
            width: 34, height: 34, borderRadius: '50%',
            background: border, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: textMuted, fontSize: 16, textDecoration: 'none',
            transition: 'background 0.2s',
        }} onMouseEnter={e => (e.currentTarget.style.background = '#253028')} onMouseLeave={e => (e.currentTarget.style.background = border)}>
              ✕
            </link_1.default>
          </div>
        </div>
      </header>

      {/* ── CHAT AREA ── */}
      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px 200px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {messages.map((msg) => (<div key={msg.id} style={{
                display: 'flex',
                flexDirection: msg.sender === 'user' ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 12,
                animation: 'fadeUp 0.3s ease-out',
            }}>
              {/* Bot avatar */}
              {msg.sender === 'bot' && (<div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${green}, #00bcd4)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, boxShadow: `0 0 16px ${green}22`,
                }}>
                  🌿
                </div>)}

              {/* Bubble */}
              <div style={{
                maxWidth: '72%',
                background: msg.sender === 'user'
                    ? `linear-gradient(135deg, ${green}, ${greenDim})`
                    : surface,
                color: msg.sender === 'user' ? '#060e09' : textPrimary,
                padding: '14px 18px',
                borderRadius: msg.sender === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                border: msg.sender === 'bot' ? `1px solid ${border}` : 'none',
                lineHeight: 1.65,
                fontSize: 14.5,
                boxShadow: msg.sender === 'user'
                    ? `0 4px 20px ${green}33`
                    : '0 2px 12px rgba(0,0,0,0.3)',
            }}>
                {msg.sender === 'user'
                ? <span style={{ fontWeight: 500 }}>{msg.text}</span>
                : <span>{renderText(msg.text)}</span>}

                {/* Meta row */}
                <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                marginTop: 10, paddingTop: 8,
                borderTop: `1px solid ${msg.sender === 'user' ? 'rgba(0,0,0,0.12)' : border}`,
            }}>
                  <span style={{
                fontSize: 11,
                color: msg.sender === 'user' ? 'rgba(0,0,0,0.5)' : textMuted,
            }}>
                    {msg.timestamp.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.sender === 'bot' && msg.confidence && (<span style={{
                    fontSize: 11, color: green,
                    background: `${green}12`, padding: '1px 6px', borderRadius: 8,
                }}>
                      {(msg.confidence * 100).toFixed(0)}% conf.
                    </span>)}
                  {msg.sender === 'bot' && msg.intent && msg.intent !== 'GENERAL' && (<span style={{
                    fontSize: 11, color: '#00bcd4',
                    background: '#00bcd422', padding: '1px 6px', borderRadius: 8,
                }}>
                      {msg.intent}
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
            }}>
                🌿
              </div>
              <div style={{
                background: surface, border: `1px solid ${border}`,
                padding: '16px 20px', borderRadius: '20px 20px 20px 4px',
                display: 'flex', alignItems: 'center', gap: 6,
            }}>
                {[0, 1, 2].map(i => (<div key={i} style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: green, opacity: 0.7,
                    animation: `bounce 1.2s ${i * 0.2}s infinite`,
                }}/>))}
                <span style={{ fontSize: 12, color: textMuted, marginLeft: 6 }}>Agri rédige…</span>
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
            maxWidth: 900, margin: '0 auto',
            padding: '12px 16px 0',
            display: 'flex', gap: 8, overflowX: 'auto',
            scrollbarWidth: 'none',
        }}>
          {QUICK.map(({ label, q }) => (<button key={q} onClick={() => handleSend(q)} style={{
                flexShrink: 0, padding: '6px 14px',
                background: `${green}10`, border: `1px solid ${green}30`,
                color: green, borderRadius: 20, fontSize: 12, fontWeight: 500,
                cursor: 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap',
            }} onMouseEnter={e => {
                e.currentTarget.style.background = `${green}22`;
                e.currentTarget.style.borderColor = green;
            }} onMouseLeave={e => {
                e.currentTarget.style.background = `${green}10`;
                e.currentTarget.style.borderColor = `${green}30`;
            }}>
              {label}
            </button>))}
        </div>

        {/* Input row */}
        <div style={{
            maxWidth: 900, margin: '0 auto',
            padding: '12px 16px 16px',
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
            color: listening ? '#fff' : textMuted,
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: listening ? '0 0 20px rgba(239,68,68,0.4)' : 'none',
            animation: listening ? 'pulse 1s infinite' : 'none',
            transition: 'all 0.2s',
        }} title={listening ? 'Arrêter' : 'Parler'}>
            🎙️
          </button>

          {/* Text input */}
          <input ref={inputRef} type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} placeholder={listening ? '🎙️ Écoute en cours…' : 'Posez votre question…'} style={{
            flex: 1, height: 46,
            background: '#0a1610', border: `1px solid ${border}`,
            borderRadius: 14, padding: '0 16px',
            color: textPrimary, fontSize: 14.5,
            outline: 'none', transition: 'border-color 0.2s',
        }} onFocus={e => (e.target.style.borderColor = `${green}66`)} onBlur={e => (e.target.style.borderColor = border)}/>

          {/* Send */}
          <button onClick={() => handleSend()} disabled={!input.trim()} style={{
            height: 46, padding: '0 22px', borderRadius: 14, flexShrink: 0,
            background: input.trim()
                ? `linear-gradient(135deg, ${green}, ${greenDim})`
                : border,
            color: input.trim() ? '#060e09' : textMuted,
            fontWeight: 700, fontSize: 14, cursor: input.trim() ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: input.trim() ? `0 4px 16px ${green}44` : 'none',
            transition: 'all 0.2s',
        }}>
            Envoyer
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); }
          40%           { transform: translateY(-6px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.55; }
        }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a2e1e; border-radius: 4px; }
        * { box-sizing: border-box; }
      `}</style>
    </div>);
}
