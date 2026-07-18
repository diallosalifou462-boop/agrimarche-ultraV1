"use strict";
'use client';
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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AdminDashboard;
const react_1 = require("react");
const navigation_1 = require("next/navigation");
const AuthContext_1 = require("@/contexts/AuthContext");
const AdminGuard_1 = require("@/components/AdminGuard");
const sonner_1 = require("sonner");
const XLSX = __importStar(require("xlsx"));
const lucide_react_1 = require("lucide-react");
const firebase_1 = require("@/lib/firebase");
const firestore_1 = require("firebase/firestore");
const auth_1 = require("firebase/auth");
const messaging_1 = require("firebase/messaging");
const recharts_1 = require("recharts");
// ============================================================
// CONSTANTES MÉTIER
// ============================================================
const COMMISSION_RATE = 0.02;
const SENEGAL_REGIONS = [
    "Dakar", "Thiès", "Saint-Louis", "Diourbel", "Louga", "Fatick",
    "Kaolack", "Kaffrine", "Tambacounda", "Kédougou", "Ziguinchor",
    "Sédhiou", "Kolda", "Matam"
];
const REGION_INFO = {
    "Dakar": { emoji: "🏙️", description: "Capitale, pôle économique principal", color: "#10b981" },
    "Thiès": { emoji: "🌾", description: "Centre agricole et industriel", color: "#06b6d4" },
    "Saint-Louis": { emoji: "🎨", description: "Ville historique du Nord", color: "#8b5cf6" },
    "Diourbel": { emoji: "🕌", description: "Coeur du bassin arachidier", color: "#f59e0b" },
    "Louga": { emoji: "🌵", description: "Zone sahélienne", color: "#ec4899" },
    "Fatick": { emoji: "🦩", description: "Delta du Saloum, biodiversité", color: "#14b8a6" },
    "Kaolack": { emoji: "🏭", description: "Hub commercial du centre", color: "#f97316" },
    "Kaffrine": { emoji: "🌱", description: "Région agricole émergente", color: "#84cc16" },
    "Tambacounda": { emoji: "🦁", description: "Grand Est, porte du Sahel", color: "#ef4444" },
    "Kédougou": { emoji: "⛏️", description: "Zone minière et forestière", color: "#a78bfa" },
    "Ziguinchor": { emoji: "🌿", description: "Casamance, forêt et cultures", color: "#34d399" },
    "Sédhiou": { emoji: "🌊", description: "Casamance intérieure", color: "#60a5fa" },
    "Kolda": { emoji: "🐄", description: "Élevage et agriculture", color: "#fb923c" },
    "Matam": { emoji: "🏜️", description: "Vallée du fleuve Sénégal", color: "#e879f9" },
};
const BANKS = [
    { name: "BOA Sénégal", rate: 8.5, maxAmount: 10000000, minDuration: 6, maxDuration: 60, fees: 50000, logo: "🏦", color: "#00ff87" },
    { name: "Ecobank", rate: 9.0, maxAmount: 8000000, minDuration: 12, maxDuration: 48, fees: 35000, logo: "🌍", color: "#00e5ff" },
    { name: "BICIS", rate: 9.5, maxAmount: 5000000, minDuration: 3, maxDuration: 36, fees: 25000, logo: "🇫🇷", color: "#c77dff" },
    { name: "CBAO", rate: 10.0, maxAmount: 3000000, minDuration: 6, maxDuration: 24, fees: 15000, logo: "🏛️", color: "#f5c842" },
    { name: "La Poste", rate: 8.0, maxAmount: 1000000, minDuration: 3, maxDuration: 12, fees: 10000, logo: "📮", color: "#f97316" }
];
// ============================================================
// CLASSES IA
// ============================================================
class CreditScoringAI {
    constructor() {
        this.weights = [];
        this.bias = [];
        this.initializeWeights();
    }
    initializeWeights() {
        for (let i = 0; i < 12; i++) {
            this.weights.push(new Array(6).fill(0).map(() => (Math.random() * 2 - 1) * 0.1));
        }
        this.bias = new Array(12).fill(0).map(() => (Math.random() * 2 - 1) * 0.1);
    }
    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }
    calculateScore(features) {
        const inputs = [
            Math.min(1, features.monthlyIncome / 1000000),
            Math.min(1, features.existingDebts / Math.max(1, features.monthlyIncome)),
            Math.min(1, features.ordersCount / 50),
            features.onTimePayments / Math.max(1, features.ordersCount),
            Math.min(1, features.accountAgeMonths / 24),
            features.hasCollateral ? 1 : 0
        ];
        const hiddenOutput = [];
        for (let i = 0; i < this.weights.length; i++) {
            let sum = this.bias[i];
            for (let j = 0; j < inputs.length; j++) {
                sum += inputs[j] * this.weights[i][j];
            }
            hiddenOutput.push(this.sigmoid(sum));
        }
        const rawScore = hiddenOutput.reduce((a, b) => a + b, 0) / hiddenOutput.length;
        const score = Math.min(1000, Math.max(0, Math.round(rawScore * 1000)));
        let rating = '';
        let maxLoan = 0;
        let interestRate = 0;
        let recommendations = [];
        if (score >= 850) {
            rating = '⭐⭐⭐⭐⭐ (Excellent)';
            maxLoan = 10000000;
            interestRate = 8;
            recommendations = ['✅ Taux préférentiel 8%', '🏆 Financement jusqu\'à 10M FCFA', '✨ Délai de réponse 24h'];
        }
        else if (score >= 750) {
            rating = '⭐⭐⭐⭐ (Très bon)';
            maxLoan = 5000000;
            interestRate = 9.5;
            recommendations = ['📊 Taux 9.5%', '💼 Financement jusqu\'à 5M FCFA', '📝 Documents simplifiés'];
        }
        else if (score >= 650) {
            rating = '⭐⭐⭐ (Bon)';
            maxLoan = 2500000;
            interestRate = 11;
            recommendations = ['📈 Taux 11%', '💰 Financement jusqu\'à 2.5M FCFA', '🤝 Caution éventuelle'];
        }
        else if (score >= 500) {
            rating = '⭐⭐ (Moyen)';
            maxLoan = 1000000;
            interestRate = 13;
            recommendations = ['📉 Taux 13%', '💵 Financement jusqu\'à 1M FCFA', '🏦 Garantie recommandée'];
        }
        else {
            rating = '⭐ (À améliorer)';
            maxLoan = 300000;
            interestRate = 16;
            recommendations = ['🔨 Améliorez votre historique d\'achats', '📅 Payez vos commandes à temps', '📈 Revenez dans 3 mois'];
        }
        return { score, rating, maxLoan, interestRate, recommendations };
    }
}
class LoanCalculator {
    static calculateMonthlyPayment(amount, annualRate, months) {
        const monthlyRate = annualRate / 100 / 12;
        if (monthlyRate === 0)
            return amount / months;
        const annuity = monthlyRate * Math.pow(1 + monthlyRate, months);
        const denominator = Math.pow(1 + monthlyRate, months) - 1;
        return amount * annuity / denominator;
    }
    static generateAmortizationTable(amount, annualRate, months) {
        const monthlyPayment = this.calculateMonthlyPayment(amount, annualRate, months);
        const monthlyRate = annualRate / 100 / 12;
        const table = [];
        let remainingBalance = amount;
        for (let month = 1; month <= months; month++) {
            const interest = remainingBalance * monthlyRate;
            const principal = monthlyPayment - interest;
            remainingBalance -= principal;
            table.push({
                month,
                payment: Math.round(monthlyPayment),
                principal: Math.round(principal),
                interest: Math.round(interest),
                remainingBalance: Math.max(0, Math.round(remainingBalance))
            });
        }
        return table;
    }
    static compareBanks(amount, duration) {
        var _a;
        const eligibleBanks = BANKS.filter(bank => amount <= bank.maxAmount &&
            duration >= bank.minDuration &&
            duration <= bank.maxDuration);
        const offers = eligibleBanks.map(bank => {
            const monthlyPayment = this.calculateMonthlyPayment(amount, bank.rate, duration);
            const totalPayment = monthlyPayment * duration;
            const totalInterest = totalPayment - amount;
            const totalCost = totalInterest + bank.fees;
            return Object.assign(Object.assign({}, bank), { monthlyPayment: Math.round(monthlyPayment), totalPayment: Math.round(totalPayment), totalInterest: Math.round(totalInterest), totalCost: Math.round(totalCost) });
        }).sort((a, b) => a.monthlyPayment - b.monthlyPayment);
        return { bestBank: (_a = offers[0]) !== null && _a !== void 0 ? _a : null, offers };
    }
}
class PricePredictor {
    static predict(historicalPrices, days = 7) {
        var _a;
        if (historicalPrices.length < 5) {
            const last = (_a = historicalPrices[historicalPrices.length - 1]) !== null && _a !== void 0 ? _a : 0;
            return { predictions: new Array(days).fill(last), trend: 'stable', confidence: 50, seasonality: 0 };
        }
        const ma7 = historicalPrices.slice(-7).reduce((a, b) => a + b, 0) / Math.min(7, historicalPrices.length);
        const ma30 = historicalPrices.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, historicalPrices.length);
        const trend = ma7 > ma30 ? 'up' : ma7 < ma30 ? 'down' : 'stable';
        const confidence = Math.min(95, Math.abs((ma7 - ma30) / ma30) * 100 + 50);
        const seasonality = Math.abs(ma7 - ma30) / ma30;
        const lastPrice = historicalPrices[historicalPrices.length - 1];
        const predictions = Array.from({ length: days }, (_, i) => {
            const factor = trend === 'up' ? 1 + (i + 1) * 0.01 * seasonality :
                trend === 'down' ? 1 - (i + 1) * 0.01 * seasonality : 1;
            return Math.round(lastPrice * factor);
        });
        return { predictions, trend, confidence, seasonality };
    }
    static detectAnomalies(orders) {
        if (orders.length < 10)
            return [];
        const amounts = orders.map(o => { var _a; return (_a = o.amount) !== null && _a !== void 0 ? _a : 0; }).filter(a => a > 0);
        const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
        const stdDev = Math.sqrt(amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length);
        const threshold = mean + 2 * stdDev;
        const highThreshold = mean + 3 * stdDev;
        return orders.filter(o => { var _a; return ((_a = o.amount) !== null && _a !== void 0 ? _a : 0) > threshold; }).map(o => {
            var _a, _b, _c;
            return ({
                orderNumber: o.orderNumber,
                amount: (_a = o.amount) !== null && _a !== void 0 ? _a : 0,
                reason: `Montant anormalement élevé (${Math.round(((_b = o.amount) !== null && _b !== void 0 ? _b : 0) / mean * 100)}% au-dessus de la moyenne)`,
                severity: (((_c = o.amount) !== null && _c !== void 0 ? _c : 0) > highThreshold ? 'high' : 'medium')
            });
        });
    }
}
// ============================================================
// STYLES
// ============================================================
const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,100..900&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  :root {
    --bg-dark:#0a0c10; --bg-card:#111317; --border:rgba(255,255,255,0.08);
    --green:#10b981; --green-dark:#059669; --cyan:#06b6d4; --purple:#8b5cf6;
    --gold:#f59e0b; --red:#ef4444; --gray:#6b7280; --white:#ffffff;
  }
  body { background:var(--bg-dark); font-family:'Inter',sans-serif; color:var(--white); }
  @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulse  { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes spin   { to{transform:rotate(360deg)} }
  .animate-fadeIn { animation:fadeIn .3s ease-out; }
  .animate-pulse  { animation:pulse 2s ease-in-out infinite; }
  .animate-spin   { animation:spin 1s linear infinite; }
  .glass { background:rgba(17,19,23,.9); backdrop-filter:blur(12px); border:1px solid var(--border); border-radius:16px; }
  .glass-card {
    background:linear-gradient(135deg,rgba(17,19,23,.95),rgba(10,12,16,.98));
    border:1px solid var(--border); border-radius:20px; transition:all .3s ease;
  }
  .glass-card:hover { border-color:rgba(16,185,129,.3); transform:translateY(-2px); }
  .btn-primary {
    background:linear-gradient(135deg,var(--green),var(--green-dark));
    border:none; border-radius:12px; padding:10px 20px; color:#fff;
    font-weight:600; cursor:pointer; transition:all .2s ease;
    display:inline-flex; align-items:center; gap:6px;
  }
  .btn-primary:hover { transform:translateY(-1px); box-shadow:0 4px 12px rgba(16,185,129,.3); }
  .btn-secondary {
    background:rgba(255,255,255,.05); border:1px solid var(--border);
    border-radius:12px; padding:10px 20px; color:var(--gray); cursor:pointer;
    transition:all .2s ease; display:inline-flex; align-items:center; gap:6px;
  }
  .btn-secondary:hover { background:rgba(255,255,255,.1); color:#fff; }
  input,select,textarea {
    background:#1f2127; border:1px solid rgba(255,255,255,.08);
    border-radius:10px; padding:12px; color:#fff; width:100%; font-size:13px;
    outline:none; transition:border-color .2s;
  }
  input:focus,select:focus,textarea:focus { border-color:rgba(16,185,129,.5); }
  input::placeholder,textarea::placeholder { color:#4b5563; }
  ::-webkit-scrollbar { width:5px; height:5px; }
  ::-webkit-scrollbar-track { background:var(--bg-card); border-radius:3px; }
  ::-webkit-scrollbar-thumb { background:var(--green); border-radius:3px; }
`;
// ============================================================
// UI COMPOSANTS
// ============================================================
const StatusBadge = ({ status }) => {
    var _a;
    const config = {
        'Livrée': { bg: 'rgba(16,185,129,.1)', color: '#10b981', icon: '✅' },
        'En cours': { bg: 'rgba(6,182,212,.1)', color: '#06b6d4', icon: '🔄' },
        'Annulée': { bg: 'rgba(239,68,68,.1)', color: '#ef4444', icon: '❌' },
        'En attente': { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', icon: '⏳' },
        'pending': { bg: 'rgba(245,158,11,.1)', color: '#f59e0b', icon: '⏳' },
        'approved': { bg: 'rgba(16,185,129,.1)', color: '#10b981', icon: '✅' },
        'rejected': { bg: 'rgba(239,68,68,.1)', color: '#ef4444', icon: '❌' },
        'active': { bg: 'rgba(6,182,212,.1)', color: '#06b6d4', icon: '🔄' },
        'paid': { bg: 'rgba(16,185,129,.1)', color: '#10b981', icon: '💰' },
        'defaulted': { bg: 'rgba(239,68,68,.1)', color: '#ef4444', icon: '⛔' },
    };
    const c = (_a = config[status]) !== null && _a !== void 0 ? _a : { bg: 'rgba(107,114,128,.1)', color: '#6b7280', icon: '📌' };
    return (<span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color }}>
      {c.icon} {status}
    </span>);
};
const StatCard = ({ icon, label, value, change, color }) => {
    var _a, _b;
    return (<div className="glass-card" style={{ padding: 20 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </div>
      {change !== undefined && (<span style={{ fontSize: 11, color: change >= 0 ? '#10b981' : '#ef4444', background: `${change >= 0 ? '#10b981' : '#ef4444'}15`, padding: '2px 8px', borderRadius: 20 }}>
          {change >= 0 ? '+' : ''}{change}%
        </span>)}
    </div>
    <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{(_b = (_a = value === null || value === void 0 ? void 0 : value.toLocaleString) === null || _a === void 0 ? void 0 : _a.call(value)) !== null && _b !== void 0 ? _b : 0}</div>
    <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
  </div>);
};
// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================
function AdminDashboard() {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m;
    const router = (0, navigation_1.useRouter)();
    const { user: authUser } = (0, AuthContext_1.useAuth)();
    // ── UI STATE ──────────────────────────────────────────────
    const [sidebarOpen, setSidebarOpen] = (0, react_1.useState)(true);
    const [activeTab, setActiveTab] = (0, react_1.useState)('dashboard');
    const [searchQuery, setSearchQuery] = (0, react_1.useState)('');
    const [statusFilter, setStatusFilter] = (0, react_1.useState)('all');
    const [currentPage, setCurrentPage] = (0, react_1.useState)(0);
    const pageSize = 10;
    // ── MODALS ────────────────────────────────────────────────
    const [selectedUser, setSelectedUser] = (0, react_1.useState)(null);
    const [selectedLoan, setSelectedLoan] = (0, react_1.useState)(null);
    const [showLoanForm, setShowLoanForm] = (0, react_1.useState)(false);
    const [showAssignModal, setShowAssignModal] = (0, react_1.useState)(false);
    const [assignOrderId, setAssignOrderId] = (0, react_1.useState)(null);
    const [assignOrderNumber, setAssignOrderNumber] = (0, react_1.useState)('');
    // ── LOAN FORM ─────────────────────────────────────────────
    const [loanForm, setLoanForm] = (0, react_1.useState)({
        sellerName: '', sellerPhone: '', region: '', village: '', purpose: '', amount: '', duration: '12', description: ''
    });
    // ── BROADCAST FORM ────────────────────────────────────────
    const defaultBroadcast = {
        title: '', body: '', icon: '🔔',
        type: 'system', priority: 'medium', urgent: false,
        targetRole: 'all', targetRegion: 'all',
        channels: { inApp: true, email: false },
        deepLink: ''
    };
    const [broadcastForm, setBroadcastForm] = (0, react_1.useState)(defaultBroadcast);
    const [broadcastSending, setBroadcastSending] = (0, react_1.useState)(false);
    const [broadcastHistory, setBroadcastHistory] = (0, react_1.useState)([]);
    const [broadcastMode, setBroadcastMode] = (0, react_1.useState)('filter');
    const [selectedUserIds, setSelectedUserIds] = (0, react_1.useState)(new Set());
    const [userPickerSearch, setUserPickerSearch] = (0, react_1.useState)('');
    // ── DATA ──────────────────────────────────────────────────
    const [orders, setOrders] = (0, react_1.useState)([]);
    const [users, setUsers] = (0, react_1.useState)([]);
    const [products, setProducts] = (0, react_1.useState)([]);
    const [loans, setLoans] = (0, react_1.useState)([]);
    const [deliveryPersons, setDeliveryPersons] = (0, react_1.useState)([]);
    const [notifications, setNotifications] = (0, react_1.useState)([]);
    const [allNotifications, setAllNotifications] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [lastSync, setLastSync] = (0, react_1.useState)(new Date());
    const [unreadCount, setUnreadCount] = (0, react_1.useState)(0);
    // ── DIRECT MESSAGE ────────────────────────────────────────
    const [dmSearch, setDmSearch] = (0, react_1.useState)('');
    const [dmTarget, setDmTarget] = (0, react_1.useState)(null);
    const [dmForm, setDmForm] = (0, react_1.useState)({ title: '', body: '', icon: '💬', type: 'message', priority: 'medium', urgent: false });
    const [dmSending, setDmSending] = (0, react_1.useState)(false);
    // ── IA ────────────────────────────────────────────────────
    const [creditScoringAI] = (0, react_1.useState)(new CreditScoringAI());
    const [anomalies, setAnomalies] = (0, react_1.useState)([]);
    const [pricePredictions, setPricePredictions] = (0, react_1.useState)(null);
    const [loanSimulation, setLoanSimulation] = (0, react_1.useState)(null);
    const [loanSimAmount, setLoanSimAmount] = (0, react_1.useState)(500000);
    const [loanSimDuration, setLoanSimDuration] = (0, react_1.useState)(12);
    const [amortizationTable, setAmortizationTable] = (0, react_1.useState)([]);
    const [aiMessages, setAiMessages] = (0, react_1.useState)([]);
    const [aiInput, setAiInput] = (0, react_1.useState)('');
    const [aiLoading, setAiLoading] = (0, react_1.useState)(false);
    const [aiModel, setAiModel] = (0, react_1.useState)('deepseek-chat');
    const aiEndRef = (0, react_1.useRef)(null);
    // ── NOTIFICATION SETTINGS ─────────────────────────────────
    const [soundEnabled, setSoundEnabled] = (0, react_1.useState)(true);
    const [pushEnabled, setPushEnabled] = (0, react_1.useState)(false);
    const [fcmToken, setFcmToken] = (0, react_1.useState)(null);
    // ── COMPUTED ──────────────────────────────────────────────
    const totalRevenue = (0, react_1.useMemo)(() => orders.reduce((s, o) => { var _a; return s + ((_a = o.amount) !== null && _a !== void 0 ? _a : 0); }, 0), [orders]);
    const platformRevenue = (0, react_1.useMemo)(() => Math.round(totalRevenue * COMMISSION_RATE), [totalRevenue]);
    const deliveredOrders = (0, react_1.useMemo)(() => orders.filter(o => o.status === 'Livrée').length, [orders]);
    const pendingLoans = (0, react_1.useMemo)(() => loans.filter(l => l.status === 'pending').length, [loans]);
    const totalLoanVolume = (0, react_1.useMemo)(() => loans.reduce((s, l) => { var _a; return s + ((_a = l.amount) !== null && _a !== void 0 ? _a : 0); }, 0), [loans]);
    // ── REGION STATS ──────────────────────────────────────────
    const regionStats = (0, react_1.useMemo)(() => {
        return SENEGAL_REGIONS.map(region => {
            const regionOrders = orders.filter(o => { var _a; return ((_a = o.region) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === region.toLowerCase(); });
            const regionUsers = users.filter(u => { var _a; return ((_a = u.region) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === region.toLowerCase(); });
            const regionProducts = products.filter(p => { var _a; return ((_a = p.region) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === region.toLowerCase(); });
            const revenue = regionOrders.reduce((s, o) => { var _a; return s + ((_a = o.amount) !== null && _a !== void 0 ? _a : 0); }, 0);
            return Object.assign({ region, orders: regionOrders.length, users: regionUsers.length, products: regionProducts.length, revenue }, REGION_INFO[region]);
        }).sort((a, b) => b.revenue - a.revenue);
    }, [orders, users, products]);
    // ── FIREBASE LISTENERS ────────────────────────────────────
    (0, react_1.useEffect)(() => {
        if (!authUser)
            return;
        const unsubOrders = (0, firestore_1.onSnapshot)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'orders'), (0, firestore_1.orderBy)('createdAt', 'desc')), snap => {
            setOrders(snap.docs.map(d => {
                var _a, _b, _c, _d, _e, _f, _g, _h, _j;
                const data = d.data();
                // Normalise le montant : supporte amount, totalAmount, total, price
                const amount = Number((_d = (_c = (_b = (_a = data.amount) !== null && _a !== void 0 ? _a : data.totalAmount) !== null && _b !== void 0 ? _b : data.total) !== null && _c !== void 0 ? _c : data.price) !== null && _d !== void 0 ? _d : 0);
                // Normalise le statut : supporte les valeurs anglaises et françaises
                const statusMap = {
                    delivered: 'Livrée', livree: 'Livrée', 'en cours': 'En cours',
                    processing: 'En cours', pending: 'En attente', 'en attente': 'En attente',
                    cancelled: 'Annulée', annulee: 'Annulée', annulée: 'Annulée',
                };
                const rawStatus = ((_e = data.status) !== null && _e !== void 0 ? _e : '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                const status = (data.status === 'Livrée' || data.status === 'En cours' ||
                    data.status === 'En attente' || data.status === 'Annulée') ? data.status : ((_j = (_f = statusMap[rawStatus]) !== null && _f !== void 0 ? _f : statusMap[(_h = (_g = data.status) === null || _g === void 0 ? void 0 : _g.toLowerCase) === null || _h === void 0 ? void 0 : _h.call(_g)]) !== null && _j !== void 0 ? _j : 'En attente');
                return Object.assign(Object.assign({ id: d.id }, data), { amount, status });
            }));
            setLastSync(new Date());
            setLoading(false);
        }, err => { console.error('orders:', err); setLoading(false); });
        const unsubUsers = (0, firestore_1.onSnapshot)((0, firestore_1.collection)(firebase_1.db, 'users'), snap => {
            const all = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            setUsers(all);
            setDeliveryPersons(all.filter(u => u.role === 'delivery' && u.isAvailable !== false));
        });
        const unsubProducts = (0, firestore_1.onSnapshot)((0, firestore_1.collection)(firebase_1.db, 'products'), snap => {
            setProducts(snap.docs.map(d => (Object.assign({ id: d.id }, d.data()))));
        });
        const unsubLoans = (0, firestore_1.onSnapshot)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'loans'), (0, firestore_1.orderBy)('createdAt', 'desc')), snap => setLoans(snap.docs.map(d => (Object.assign({ id: d.id }, d.data())))));
        const unsubNotifs = (0, firestore_1.onSnapshot)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'notifications'), (0, firestore_1.orderBy)('createdAt', 'desc'), (0, firestore_1.limit)(100)), snap => {
            const all = snap.docs.map(d => (Object.assign({ id: d.id }, d.data())));
            setAllNotifications(all);
            // unreadCount = notifs personnelles non lues de l'admin
            const personal = all.filter(n => n.userId === authUser.uid);
            setNotifications(personal);
            setUnreadCount(personal.filter(n => !n.read).length);
        });
        // Broadcast history
        const unsubBroadcast = (0, firestore_1.onSnapshot)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'broadcasts'), (0, firestore_1.orderBy)('createdAt', 'desc'), (0, firestore_1.limit)(20)), snap => setBroadcastHistory(snap.docs.map(d => (Object.assign({ id: d.id }, d.data())))));
        return () => { unsubOrders(); unsubUsers(); unsubProducts(); unsubLoans(); unsubNotifs(); unsubBroadcast(); };
    }, [authUser]);
    // ── IA COMPUTATIONS ───────────────────────────────────────
    (0, react_1.useEffect)(() => {
        if (orders.length > 0) {
            setAnomalies(PricePredictor.detectAnomalies(orders));
        }
        if (products.length > 0) {
            const prices = products.map(p => p.price).filter(p => p > 0);
            if (prices.length > 0)
                setPricePredictions(PricePredictor.predict(prices, 7));
        }
        const sim = LoanCalculator.compareBanks(loanSimAmount, loanSimDuration);
        setLoanSimulation(sim);
        if (sim.bestBank) {
            setAmortizationTable(LoanCalculator.generateAmortizationTable(loanSimAmount, sim.bestBank.rate, loanSimDuration));
        }
    }, [orders, products, loanSimAmount, loanSimDuration]);
    // ── FCM ───────────────────────────────────────────────────
    (0, react_1.useEffect)(() => {
        const initFCM = async () => {
            if (!firebase_1.messaging || !authUser)
                return;
            try {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    const token = await (0, messaging_1.getToken)(firebase_1.messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
                    if (token) {
                        setFcmToken(token);
                        setPushEnabled(true);
                        await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'users', authUser.uid), { fcmTokens: (0, firestore_1.arrayUnion)(token) }).catch(() => { });
                    }
                }
            }
            catch (e) {
                console.error('FCM:', e);
            }
        };
        initFCM();
    }, [authUser]);
    // ── ACTIONS ───────────────────────────────────────────────
    const updateOrderStatus = async (orderId, status) => {
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'orders', orderId), { status });
            sonner_1.toast.success(`Statut : ${status}`);
            const order = orders.find(o => o.id === orderId);
            if (order === null || order === void 0 ? void 0 : order.farmerId) {
                await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'notifications'), {
                    userId: order.farmerId,
                    type: 'order',
                    title: `Commande #${order.orderNumber} — ${status}`,
                    body: `Le statut de votre commande a changé.`,
                    icon: status === 'Livrée' ? '✅' : '📦',
                    deepLink: `/orders/${order.orderNumber}`,
                    urgent: false, priority: 'medium', read: false,
                    createdAt: firestore_1.Timestamp.now()
                });
            }
        }
        catch (_a) {
            sonner_1.toast.error('Erreur mise à jour');
        }
    };
    const assignDelivery = async (orderId, deliveryId, deliveryName) => {
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'orders', orderId), {
                deliveryPersonId: deliveryId, deliveryPersonName: deliveryName, status: 'En cours'
            });
            sonner_1.toast.success(`Livreur assigné : ${deliveryName}`);
            setShowAssignModal(false);
            setAssignOrderId(null);
        }
        catch (_a) {
            sonner_1.toast.error('Erreur assignation');
        }
    };
    const updateUserRole = async (userId, role) => {
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'users', userId), { role });
            sonner_1.toast.success(`Rôle : ${role}`);
        }
        catch (_a) {
            sonner_1.toast.error('Erreur rôle');
        }
    };
    const deleteUser = async (userId) => {
        if (!confirm('Supprimer cet utilisateur ?'))
            return;
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, 'users', userId));
            sonner_1.toast.success('Utilisateur supprimé');
        }
        catch (_a) {
            sonner_1.toast.error('Erreur suppression');
        }
    };
    const updateLoanStatus = async (loanId, status) => {
        var _a;
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'loans', loanId), {
                status, approvedBy: authUser === null || authUser === void 0 ? void 0 : authUser.uid,
                approvedAt: status === 'approved' ? firestore_1.Timestamp.now() : null
            });
            sonner_1.toast.success(status === 'approved' ? 'Financement approuvé' : 'Financement refusé');
            const loan = loans.find(l => l.id === loanId);
            if (loan && status === 'approved') {
                await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'notifications'), {
                    userId: loan.sellerId, type: 'loan',
                    title: '✅ Financement approuvé !',
                    body: `Votre demande de ${((_a = loan.amount) !== null && _a !== void 0 ? _a : 0).toLocaleString()} FCFA a été approuvée.`,
                    icon: '💰', deepLink: '/loans',
                    urgent: false, priority: 'high', read: false, createdAt: firestore_1.Timestamp.now()
                });
            }
        }
        catch (_b) {
            sonner_1.toast.error('Erreur');
        }
    };
    const markLoanAsPaid = async (loanId) => {
        try {
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'loans', loanId), { status: 'paid', paidAt: firestore_1.Timestamp.now(), remainingBalance: 0 });
            sonner_1.toast.success('Financement remboursé');
        }
        catch (_a) {
            sonner_1.toast.error('Erreur');
        }
    };
    const createLoan = async () => {
        const { sellerName, sellerPhone, region, village, purpose, amount, duration, description } = loanForm;
        if (!sellerName || !amount || !purpose) {
            sonner_1.toast.error('Champs obligatoires manquants');
            return;
        }
        const amountNum = parseInt(amount);
        const durationNum = parseInt(duration);
        try {
            await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'loans'), {
                sellerId: 'manual', sellerName, sellerPhone: sellerPhone || '',
                amount: amountNum, duration: durationNum,
                monthlyPayment: Math.round(amountNum / durationNum),
                interestRate: 12,
                totalToRepay: Math.round(amountNum * 1.12),
                remainingBalance: amountNum,
                purpose, description: description || '',
                status: 'pending', region: region || '', village: village || '',
                createdAt: firestore_1.Timestamp.now()
            });
            sonner_1.toast.success('Demande créée');
            setShowLoanForm(false);
            setLoanForm({ sellerName: '', sellerPhone: '', region: '', village: '', purpose: '', amount: '', duration: '12', description: '' });
        }
        catch (_a) {
            sonner_1.toast.error('Erreur création');
        }
    };
    const updateProductStock = async (productId, newStock) => {
        try {
            const clampedStock = Math.max(0, newStock);
            await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'products', productId), { stock: clampedStock });
            sonner_1.toast.success('Stock mis à jour');
            const product = products.find(p => p.id === productId);
            if (product && clampedStock < 5 && product.stock >= 5) {
                await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'notifications'), {
                    userId: product.sellerId, type: 'alert',
                    title: '⚠️ Stock critique',
                    body: `Il ne reste que ${clampedStock} unités de "${product.name}".`,
                    icon: '⚠️', deepLink: `/products/${product.id}`,
                    urgent: true, priority: 'high', read: false, createdAt: firestore_1.Timestamp.now()
                });
            }
        }
        catch (_a) {
            sonner_1.toast.error('Erreur stock');
        }
    };
    // ── BROADCAST ─────────────────────────────────────────────
    const sendBroadcast = async () => {
        var _a;
        if (!broadcastForm.title || !broadcastForm.body) {
            sonner_1.toast.error('Titre et message requis');
            return;
        }
        setBroadcastSending(true);
        try {
            // Calcul des destinataires selon le mode
            let targetUsers = [...users];
            if (broadcastMode === 'manual') {
                if (selectedUserIds.size === 0) {
                    sonner_1.toast.error('Sélectionnez au moins un utilisateur');
                    setBroadcastSending(false);
                    return;
                }
                targetUsers = users.filter(u => { var _a, _b; return selectedUserIds.has((_b = (_a = u.uid) !== null && _a !== void 0 ? _a : u.id) !== null && _b !== void 0 ? _b : ''); });
            }
            else {
                if (broadcastForm.targetRole !== 'all')
                    targetUsers = targetUsers.filter(u => u.role === broadcastForm.targetRole);
                if (broadcastForm.targetRegion !== 'all')
                    targetUsers = targetUsers.filter(u => { var _a; return ((_a = u.region) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === broadcastForm.targetRegion.toLowerCase(); });
            }
            const batch = (0, firestore_1.writeBatch)(firebase_1.db);
            let inAppCount = 0;
            // In-App notifications (Firestore)
            if (broadcastForm.channels.inApp) {
                // writeBatch limite à 500 ops — on bascule sur addDoc par lot si > 499
                if (targetUsers.length > 499) {
                    // chunked
                    for (let i = 0; i < targetUsers.length; i += 400) {
                        const chunk = targetUsers.slice(i, i + 400);
                        const b2 = (0, firestore_1.writeBatch)(firebase_1.db);
                        chunk.forEach(u => {
                            var _a;
                            const ref = (0, firestore_1.doc)((0, firestore_1.collection)(firebase_1.db, 'notifications'));
                            b2.set(ref, {
                                userId: (_a = u.uid) !== null && _a !== void 0 ? _a : u.id,
                                type: broadcastForm.type,
                                title: broadcastForm.title,
                                body: broadcastForm.body,
                                icon: broadcastForm.icon,
                                deepLink: broadcastForm.deepLink || '/',
                                urgent: broadcastForm.urgent,
                                priority: broadcastForm.priority,
                                read: false,
                                createdAt: firestore_1.Timestamp.now(),
                                metadata: { broadcast: true }
                            });
                        });
                        await b2.commit();
                    }
                }
                else {
                    targetUsers.forEach(u => {
                        var _a;
                        const ref = (0, firestore_1.doc)((0, firestore_1.collection)(firebase_1.db, 'notifications'));
                        batch.set(ref, {
                            userId: (_a = u.uid) !== null && _a !== void 0 ? _a : u.id,
                            type: broadcastForm.type,
                            title: broadcastForm.title,
                            body: broadcastForm.body,
                            icon: broadcastForm.icon,
                            deepLink: broadcastForm.deepLink || '/',
                            urgent: broadcastForm.urgent,
                            priority: broadcastForm.priority,
                            read: false,
                            createdAt: firestore_1.Timestamp.now(),
                            metadata: { broadcast: true }
                        });
                    });
                    await batch.commit();
                }
                inAppCount = targetUsers.length;
            }
            // Email channel — envoi via Resend
            if (broadcastForm.channels.email) {
                const emailTargets = targetUsers.filter(u => u.email);
                for (const u of emailTargets) {
                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: u.email,
                            subject: broadcastForm.title,
                            message: broadcastForm.body,
                            userId: (_a = u.uid) !== null && _a !== void 0 ? _a : u.id,
                        }),
                    });
                }
            }
            // Save broadcast record
            await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'broadcasts'), Object.assign(Object.assign({}, broadcastForm), { sentBy: authUser === null || authUser === void 0 ? void 0 : authUser.uid, sentAt: firestore_1.Timestamp.now(), recipientCount: targetUsers.length, inAppCount, emailCount: broadcastForm.channels.email ? targetUsers.filter(u => u.email).length : 0 }));
            sonner_1.toast.success(`Envoyé à ${targetUsers.length} utilisateur(s)`);
            setBroadcastForm(defaultBroadcast);
            setSelectedUserIds(new Set());
            setUserPickerSearch('');
        }
        catch (e) {
            console.error(e);
            sonner_1.toast.error('Erreur lors de l\'envoi');
        }
        finally {
            setBroadcastSending(false);
        }
    };
    const sendDirectMessage = async () => {
        var _a;
        if (!dmTarget) {
            sonner_1.toast.error('Sélectionnez un destinataire');
            return;
        }
        if (!dmForm.title || !dmForm.body) {
            sonner_1.toast.error('Titre et message requis');
            return;
        }
        setDmSending(true);
        try {
            await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'notifications'), {
                userId: (_a = dmTarget.uid) !== null && _a !== void 0 ? _a : dmTarget.id,
                type: dmForm.type,
                title: dmForm.title,
                body: dmForm.body,
                icon: dmForm.icon,
                deepLink: '/',
                urgent: dmForm.urgent,
                priority: dmForm.priority,
                read: false,
                createdAt: firestore_1.Timestamp.now(),
                sentByAdmin: authUser === null || authUser === void 0 ? void 0 : authUser.uid,
            });
            sonner_1.toast.success(`Message envoyé à ${dmTarget.displayName}`);
            setDmForm({ title: '', body: '', icon: '💬', type: 'message', priority: 'medium', urgent: false });
            setDmTarget(null);
            setDmSearch('');
        }
        catch (_b) {
            sonner_1.toast.error('Erreur envoi');
        }
        finally {
            setDmSending(false);
        }
    };
    const sendAiMessage = async () => {
        var _a, _b, _c, _d;
        const userMsg = aiInput.trim();
        if (!userMsg || aiLoading)
            return;
        // Contexte métier injecté automatiquement
        const systemPrompt = `Tu es un assistant expert pour AgriMarché, une plateforme agricole sénégalaise.
Contexte actuel:
- Commandes totales: ${orders.length} (dont ${orders.filter(o => o.status === 'En attente').length} en attente)
- Chiffre d'affaires: ${totalRevenue.toLocaleString()} FCFA
- Utilisateurs: ${users.length}
- Produits: ${products.length}
- Financements en attente: ${pendingLoans}
- Anomalies détectées: ${anomalies.length}
Réponds toujours en français, de façon concise et professionnelle. Si on te pose des questions sur les données, utilise ces chiffres.`;
        const newMsg = { role: 'user', content: userMsg, ts: Date.now() };
        const newHistory = [...aiMessages, newMsg];
        setAiMessages(newHistory);
        setAiInput('');
        setAiLoading(true);
        try {
            const res = await fetch('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY}`
                },
                body: JSON.stringify({
                    model: aiModel,
                    max_tokens: 1024,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...newHistory.map(m => ({ role: m.role, content: m.content }))
                    ]
                })
            });
            const data = await res.json();
            const reply = (_d = (_c = (_b = (_a = data === null || data === void 0 ? void 0 : data.choices) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) !== null && _d !== void 0 ? _d : "Erreur: réponse invalide.";
            setAiMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
        }
        catch (e) {
            setAiMessages(prev => [...prev, { role: 'assistant', content: "❌ Erreur de connexion à DeepSeek. Vérifiez votre clé API.", ts: Date.now() }]);
        }
        finally {
            setAiLoading(false);
            setTimeout(() => { var _a; return (_a = aiEndRef.current) === null || _a === void 0 ? void 0 : _a.scrollIntoView({ behavior: 'smooth' }); }, 100);
        }
    };
    const markAllNotificationsRead = async () => {
        const batch = (0, firestore_1.writeBatch)(firebase_1.db);
        notifications.filter(n => !n.read && n.id).forEach(n => {
            batch.update((0, firestore_1.doc)(firebase_1.db, 'notifications', n.id), { read: true });
        });
        await batch.commit();
        sonner_1.toast.success('Tout marqué comme lu');
    };
    // ── FILTERS ───────────────────────────────────────────────
    const filteredOrders = (0, react_1.useMemo)(() => orders.filter(o => {
        var _a, _b;
        if (statusFilter !== 'all' && o.status !== statusFilter)
            return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return ((_a = o.orderNumber) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = o.farmer) === null || _b === void 0 ? void 0 : _b.toLowerCase().includes(q));
        }
        return true;
    }), [orders, statusFilter, searchQuery]);
    const paginatedOrders = (0, react_1.useMemo)(() => {
        const start = currentPage * pageSize;
        return filteredOrders.slice(start, start + pageSize);
    }, [filteredOrders, currentPage, pageSize]);
    const totalPages = Math.ceil(filteredOrders.length / pageSize);
    // ── CHART DATA ────────────────────────────────────────────
    const monthlyRevenue = (0, react_1.useMemo)(() => {
        const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
        const year = new Date().getFullYear();
        return months.map((month, i) => ({
            month,
            revenue: orders.filter(o => {
                var _a, _b;
                const d = (_b = (_a = o.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a);
                return d && d.getMonth() === i && d.getFullYear() === year;
            }).reduce((s, o) => { var _a; return s + ((_a = o.amount) !== null && _a !== void 0 ? _a : 0); }, 0)
        }));
    }, [orders]);
    const categoryData = (0, react_1.useMemo)(() => {
        const cats = {};
        products.forEach(p => { var _a; cats[p.category] = ((_a = cats[p.category]) !== null && _a !== void 0 ? _a : 0) + 1; });
        return Object.entries(cats).map(([name, value]) => ({ name, value }));
    }, [products]);
    // ── KPIs ──────────────────────────────────────────────────
    const kpis = [
        { label: "Chiffre d'affaires", value: totalRevenue, change: 12.4, icon: <lucide_react_1.TrendingUp size={20} color="#06b6d4"/>, color: '#06b6d4' },
        { label: "Revenus plateforme", value: platformRevenue, change: 12.4, icon: <lucide_react_1.Banknote size={20} color="#10b981"/>, color: '#10b981' },
        { label: "Commandes", value: orders.length, change: 8.2, icon: <lucide_react_1.Package size={20} color="#8b5cf6"/>, color: '#8b5cf6' },
        { label: "Financements (FCFA)", value: totalLoanVolume, change: -2.3, icon: <lucide_react_1.Wallet size={20} color="#f59e0b"/>, color: '#f59e0b' },
        { label: "Utilisateurs", value: users.length, change: 15.7, icon: <lucide_react_1.Users size={20} color="#ec4899"/>, color: '#ec4899' },
        { label: "Livreurs actifs", value: deliveryPersons.length, change: 5.3, icon: <lucide_react_1.Truck size={20} color="#06b6d4"/>, color: '#06b6d4' },
    ];
    // ── NAV ───────────────────────────────────────────────────
    const navItems = [
        { id: 'dashboard', label: 'Tableau de bord', icon: <lucide_react_1.LayoutDashboard size={18}/>, badge: 0 },
        { id: 'orders', label: 'Commandes', icon: <lucide_react_1.Package size={18}/>, badge: orders.filter(o => o.status === 'En attente').length },
        { id: 'users', label: 'Utilisateurs', icon: <lucide_react_1.Users size={18}/>, badge: 0 },
        { id: 'products', label: 'Produits', icon: <lucide_react_1.Leaf size={18}/>, badge: 0 },
        { id: 'loans', label: 'Financements', icon: <lucide_react_1.Banknote size={18}/>, badge: pendingLoans },
        { id: 'analytics', label: 'Analyses IA', icon: <lucide_react_1.Brain size={18}/>, badge: 0 },
        { id: 'ai-assistant', label: 'Assistant DeepSeek', icon: <lucide_react_1.Sparkles size={18}/>, badge: 0 },
        { id: 'regions', label: 'Régions', icon: <lucide_react_1.Map size={18}/>, badge: 0 },
        { id: 'broadcast', label: 'Diffusion', icon: <lucide_react_1.Send size={18}/>, badge: 0 },
        { id: 'notifications', label: 'Notifications', icon: <lucide_react_1.BellRing size={18}/>, badge: unreadCount },
        { id: 'delivery', label: 'Livraisons', icon: <lucide_react_1.Truck size={18}/>, badge: 0 },
        { id: 'settings', label: 'Paramètres', icon: <lucide_react_1.Settings size={18}/>, badge: 0 },
    ];
    // ── LOADING ───────────────────────────────────────────────
    if (loading) {
        return (<AdminGuard_1.AdminGuard>
        <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0a0c10' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, border: '3px solid rgba(16,185,129,.2)', borderTopColor: '#10b981', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }}/>
            <p style={{ color: '#6b7280' }}>Chargement du dashboard…</p>
          </div>
        </div>
      </AdminGuard_1.AdminGuard>);
    }
    // ── RENDER ────────────────────────────────────────────────
    return (<AdminGuard_1.AdminGuard>
      <style>{styles}</style>

      <div style={{ display: 'flex', minHeight: '100vh', background: '#0a0c10' }}>

        {/* ══ SIDEBAR ══════════════════════════════════════════ */}
        <aside style={{
            width: sidebarOpen ? 260 : 72, transition: 'width .3s ease',
            background: '#111317', borderRight: '1px solid #1f2127',
            position: 'fixed', height: '100vh', overflow: 'hidden', zIndex: 50,
            display: 'flex', flexDirection: 'column'
        }}>
          {/* Logo */}
          <div style={{ padding: '20px 16px', borderBottom: '1px solid #1f2127', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 'bold', flexShrink: 0 }}>A</div>
            {sidebarOpen && <div><div style={{ fontWeight: 700, fontSize: 16 }}>AgriMarché</div><div style={{ fontSize: 11, color: '#6b7280' }}>Admin Dashboard</div></div>}
          </div>

          {/* Nav */}
          <nav style={{ padding: '12px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {navItems.map(item => (<div key={item.id} onClick={() => { setActiveTab(item.id); setCurrentPage(0); }} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px',
                borderRadius: 12, cursor: 'pointer',
                background: activeTab === item.id ? 'rgba(16,185,129,.1)' : 'transparent',
                color: activeTab === item.id ? '#10b981' : '#9ca3af', transition: 'all .2s'
            }}>
                {item.icon}
                {sidebarOpen && <span style={{ flex: 1, fontSize: 13 }}>{item.label}</span>}
                {sidebarOpen && item.badge > 0 && (<span style={{ background: '#10b981', color: 'white', fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 20, minWidth: 18, textAlign: 'center' }}>{item.badge}</span>)}
              </div>))}
          </nav>

          {/* Déconnexion */}
          <div style={{ padding: '12px', borderTop: '1px solid #1f2127', flexShrink: 0 }}>
            <div onClick={() => (0, auth_1.signOut)(firebase_1.auth).then(() => router.push('/'))} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 12, cursor: 'pointer', color: '#ef4444' }}>
              <lucide_react_1.LogOut size={18}/>
              {sidebarOpen && <span style={{ fontSize: 13 }}>Déconnexion</span>}
            </div>
          </div>

          {/* Toggle */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            position: 'absolute', right: -12, top: '50%', transform: 'translateY(-50%)',
            width: 24, height: 24, borderRadius: '50%', background: '#1f2127',
            border: '1px solid #2d2f36', display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', color: '#9ca3af'
        }}>
            {sidebarOpen ? <lucide_react_1.ChevronLeft size={14}/> : <lucide_react_1.ChevronRight size={14}/>}
          </button>
        </aside>

        {/* ══ MAIN ═════════════════════════════════════════════ */}
        <main style={{ flex: 1, marginLeft: sidebarOpen ? 260 : 72, transition: 'margin-left .3s ease' }}>

          {/* Header */}
          <header style={{
            position: 'sticky', top: 0, zIndex: 40,
            background: 'rgba(10,12,16,.92)', backdropFilter: 'blur(12px)',
            borderBottom: '1px solid #1f2127', padding: '12px 24px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer' }}><lucide_react_1.Menu size={20}/></button>
              <h1 style={{ fontSize: 18, fontWeight: 700 }}>{(_a = navItems.find(n => n.id === activeTab)) === null || _a === void 0 ? void 0 : _a.label}</h1>
              <div style={{ fontSize: 11, color: '#4b5563' }}>sync {lastSync.toLocaleTimeString()}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1f2127', padding: '5px 10px', borderRadius: 20 }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }}/>
                <span style={{ fontSize: 10, color: '#9ca3af' }}>LIVE</span>
              </div>
              <button onClick={() => setActiveTab('notifications')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', position: 'relative' }}>
                <lucide_react_1.Bell size={18}/>
                {unreadCount > 0 && (<span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', fontSize: 9, padding: '1px 4px', borderRadius: 10, minWidth: 15, textAlign: 'center' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>)}
              </button>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg,#10b981,#059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
                {(_c = (_b = authUser === null || authUser === void 0 ? void 0 : authUser.displayName) === null || _b === void 0 ? void 0 : _b.charAt(0)) !== null && _c !== void 0 ? _c : 'A'}
              </div>
            </div>
          </header>

          {/* ── Content ───────────────────────────────────────── */}
          <div style={{ padding: 24 }}>

            {/* ═══ DASHBOARD ══════════════════════════════════ */}
            {activeTab === 'dashboard' && (<div className="animate-fadeIn">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: 16, marginBottom: 24 }}>
                  {kpis.map((kpi, i) => <StatCard key={i} {...kpi}/>)}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 24, marginBottom: 24 }}>
                  <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📈 Revenus mensuels</h3>
                    <div style={{ height: 280 }}>
                      <recharts_1.ResponsiveContainer width="100%" height="100%">
                        <recharts_1.AreaChart data={monthlyRevenue}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <recharts_1.CartesianGrid strokeDasharray="3 3" stroke="#1f2127"/>
                          <recharts_1.XAxis dataKey="month" stroke="#6b7280" fontSize={11}/>
                          <recharts_1.YAxis stroke="#6b7280" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`}/>
                          <recharts_1.Tooltip contentStyle={{ background: '#111317', border: '1px solid #1f2127', borderRadius: 8 }} formatter={(v) => `${Number(v).toLocaleString()} FCFA`}/>
                          <recharts_1.Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2}/>
                        </recharts_1.AreaChart>
                      </recharts_1.ResponsiveContainer>
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>🥧 Catégories</h3>
                    <div style={{ height: 280 }}>
                      <recharts_1.ResponsiveContainer width="100%" height="100%">
                        <recharts_1.PieChart>
                          <recharts_1.Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                            {categoryData.map((_, i) => <recharts_1.Cell key={i} fill={['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444'][i % 5]}/>)}
                          </recharts_1.Pie>
                          <recharts_1.Tooltip />
                        </recharts_1.PieChart>
                      </recharts_1.ResponsiveContainer>
                    </div>
                  </div>
                </div>
                {/* Recent orders */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600 }}>🛒 Dernières commandes</h3>
                    <button onClick={() => setActiveTab('orders')} className="btn-secondary" style={{ padding: '6px 12px', fontSize: 12 }}>Voir tout →</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1f2127' }}>
                          {['N°', 'Client', 'Montant', 'Commission', 'Statut'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6b7280' }}>{h}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0, 5).map(o => {
                var _a, _b;
                return (<tr key={o.id} style={{ borderBottom: '1px solid #1a1c22' }}>
                            <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 12, color: '#10b981' }}>{o.orderNumber}</td>
                            <td style={{ padding: '10px 8px', fontSize: 13 }}>{o.farmer}</td>
                            <td style={{ padding: '10px 8px', fontWeight: 600 }}>{((_a = o.amount) !== null && _a !== void 0 ? _a : 0).toLocaleString()} FCFA</td>
                            <td style={{ padding: '10px 8px', fontSize: 12, color: '#f59e0b' }}>{Math.round(((_b = o.amount) !== null && _b !== void 0 ? _b : 0) * COMMISSION_RATE).toLocaleString()} FCFA</td>
                            <td style={{ padding: '10px 8px' }}><StatusBadge status={o.status}/></td>
                          </tr>);
            })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>)}

            {/* ═══ COMMANDES ══════════════════════════════════ */}
            {activeTab === 'orders' && (<div className="glass-card animate-fadeIn" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700 }}>📦 Commandes</h2>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{orders.length} total · {deliveredOrders} livrées · {platformRevenue.toLocaleString()} FCFA commission</p>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative' }}>
                      <lucide_react_1.Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}/>
                      <input type="text" placeholder="Rechercher…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 32, width: 200 }}/>
                    </div>
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
                      <option value="all">Tous</option>
                      <option value="Livrée">Livrée</option>
                      <option value="En cours">En cours</option>
                      <option value="En attente">En attente</option>
                      <option value="Annulée">Annulée</option>
                    </select>
                    <button onClick={() => { const ws = XLSX.utils.json_to_sheet(orders); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Commandes'); XLSX.writeFile(wb, `commandes_${Date.now()}.xlsx`); sonner_1.toast.success('Export OK'); }} className="btn-secondary">
                      <lucide_react_1.Download size={14}/> Export
                    </button>
                  </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1f2127' }}>
                        {['N°', 'Client', 'Catégorie', 'Région', 'Montant', 'Commission', 'Statut', 'Actions'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6b7280' }}>{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map(order => {
                var _a, _b;
                return (<tr key={order.id} style={{ borderBottom: '1px solid #1a1c22' }}>
                          <td style={{ padding: '10px 8px', fontFamily: 'monospace', fontSize: 12, color: '#10b981' }}>{order.orderNumber}</td>
                          <td style={{ padding: '10px 8px', fontSize: 13 }}>{order.farmer}</td>
                          <td style={{ padding: '10px 8px', fontSize: 12, color: '#9ca3af' }}>{order.category}</td>
                          <td style={{ padding: '10px 8px', fontSize: 12 }}>{order.region}</td>
                          <td style={{ padding: '10px 8px', fontWeight: 600 }}>{((_a = order.amount) !== null && _a !== void 0 ? _a : 0).toLocaleString()} FCFA</td>
                          <td style={{ padding: '10px 8px', color: '#f59e0b', fontSize: 12 }}>{Math.round(((_b = order.amount) !== null && _b !== void 0 ? _b : 0) * COMMISSION_RATE).toLocaleString()} FCFA</td>
                          <td style={{ padding: '10px 8px' }}><StatusBadge status={order.status}/></td>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select value={order.status} onChange={e => updateOrderStatus(order.id, e.target.value)} style={{ width: 'auto', padding: '5px 8px', fontSize: 11 }}>
                                <option value="En attente">En attente</option>
                                <option value="En cours">En cours</option>
                                <option value="Livrée">Livrée</option>
                                <option value="Annulée">Annulée</option>
                              </select>
                              {(order.status === 'En attente' || (order.status === 'En cours' && !order.deliveryPersonId)) && (<button onClick={() => { setAssignOrderId(order.id); setAssignOrderNumber(order.orderNumber); setShowAssignModal(true); }} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}>
                                  Assigner
                                </button>)}
                            </div>
                          </td>
                        </tr>);
            })}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (<div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
                    <button disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)} className="btn-secondary" style={{ padding: '7px 14px' }}>← Préc.</button>
                    <span style={{ padding: '7px 14px', color: '#6b7280', fontSize: 13 }}>Page {currentPage + 1}/{totalPages}</span>
                    <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)} className="btn-secondary" style={{ padding: '7px 14px' }}>Suiv. →</button>
                  </div>)}
              </div>)}

            {/* ═══ UTILISATEURS ═══════════════════════════════ */}
            {activeTab === 'users' && (<div className="glass-card animate-fadeIn" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700 }}>👥 Utilisateurs</h2>
                    <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{users.length} comptes</p>
                  </div>
                  <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ width: 'auto' }}>
                    <option value="all">Tous les rôles</option>
                    <option value="client">Clients</option>
                    <option value="seller">Vendeurs</option>
                    <option value="delivery">Livreurs</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #1f2127' }}>
                        {['Utilisateur', 'Email', 'Téléphone', 'Rôle', 'Inscription', 'Actions'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6b7280' }}>{h}</th>))}
                      </tr>
                    </thead>
                    <tbody>
                      {users.filter(u => statusFilter === 'all' || u.role === statusFilter).map(user => {
                var _a, _b, _c, _d, _e, _f, _g;
                return (<tr key={user.id} style={{ borderBottom: '1px solid #1a1c22' }}>
                          <td style={{ padding: '10px 8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0 }}>
                                {(_b = (_a = user.displayName) === null || _a === void 0 ? void 0 : _a.charAt(0)) !== null && _b !== void 0 ? _b : '?'}
                              </div>
                              <span style={{ fontSize: 13 }}>{user.displayName}</span>
                            </div>
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: 12, color: '#9ca3af' }}>{user.email}</td>
                          <td style={{ padding: '10px 8px', fontSize: 12 }}>{user.phone || '—'}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <select value={user.role} onChange={e => updateUserRole(user.id, e.target.value)} style={{ width: 'auto', padding: '5px 8px', fontSize: 11 }}>
                              <option value="client">Client</option>
                              <option value="seller">Vendeur</option>
                              <option value="delivery">Livreur</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td style={{ padding: '10px 8px', fontSize: 12, color: '#6b7280' }}>{(_g = (_f = (_d = (_c = user.createdAt) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : (_e = _d.call(_c)).toLocaleDateString) === null || _f === void 0 ? void 0 : _f.call(_e)) !== null && _g !== void 0 ? _g : '—'}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <button onClick={() => setSelectedUser(user)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11, marginRight: 6 }}><lucide_react_1.Eye size={11}/> Voir</button>
                            <button onClick={() => deleteUser(user.id)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11, color: '#ef4444', borderColor: '#ef4444' }}><lucide_react_1.X size={11}/> Suppr.</button>
                          </td>
                        </tr>);
            })}
                    </tbody>
                  </table>
                </div>
              </div>)}

            {/* ═══ PRODUITS ═══════════════════════════════════ */}
            {activeTab === 'products' && (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 16 }} className="animate-fadeIn">
                {products.map(product => (<div key={product.id} className="glass-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div><span style={{ fontSize: 11, color: '#6b7280' }}>{product.category}</span><h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 3 }}>{product.name}</h3></div>
                      <span style={{ fontSize: 17, fontWeight: 700, color: '#10b981', whiteSpace: 'nowrap' }}>{product.price.toLocaleString()} FCFA</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontSize: 12, color: '#6b7280' }}>
                      <span>📍 {product.region}</span>
                      <span>👤 {product.sellerName}</span>
                    </div>
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
                        <span>Stock</span>
                        <span style={{ fontWeight: 600, color: product.stock < 5 ? '#ef4444' : '#10b981' }}>{product.stock} unités</span>
                      </div>
                      <div style={{ height: 4, background: '#1f2127', borderRadius: 2 }}>
                        <div style={{ width: `${Math.min(100, (product.stock / 100) * 100)}%`, height: '100%', background: product.stock < 5 ? '#ef4444' : '#10b981', borderRadius: 2, transition: 'width .3s' }}/>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => updateProductStock(product.id, product.stock - 1)} className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }}>−1</button>
                      <button onClick={() => updateProductStock(product.id, product.stock + 10)} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}>+10</button>
                    </div>
                  </div>))}
                {products.length === 0 && (<div className="glass-card" style={{ padding: 40, textAlign: 'center', gridColumn: '1/-1', color: '#6b7280' }}>Aucun produit trouvé</div>)}
              </div>)}

            {/* ═══ FINANCEMENTS ═══════════════════════════════ */}
            {activeTab === 'loans' && (<div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* ── KPI CARDS ─────────────────────────────── */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
                  {[
                { icon: <lucide_react_1.Banknote size={18} color="#10b981"/>, label: 'Volume total', value: totalLoanVolume, color: '#10b981', suffix: ' FCFA' },
                { icon: <lucide_react_1.Clock size={18} color="#f59e0b"/>, label: 'En attente', value: loans.filter(l => l.status === 'pending').length, color: '#f59e0b', suffix: '' },
                { icon: <lucide_react_1.CheckCircle size={18} color="#06b6d4"/>, label: 'Approuvés', value: loans.filter(l => l.status === 'approved' || l.status === 'active').length, color: '#06b6d4', suffix: '' },
                { icon: <lucide_react_1.XCircle size={18} color="#ef4444"/>, label: 'Refusés', value: loans.filter(l => l.status === 'rejected').length, color: '#ef4444', suffix: '' },
                { icon: <lucide_react_1.CheckCircle size={18} color="#10b981"/>, label: 'Remboursés', value: loans.filter(l => l.status === 'paid').length, color: '#10b981', suffix: '' },
                { icon: <lucide_react_1.DollarSign size={18} color="#8b5cf6"/>, label: 'Montant moyen', value: loans.length ? Math.round(totalLoanVolume / loans.length) : 0, color: '#8b5cf6', suffix: ' FCFA' },
            ].map((kpi, i) => (<div key={i} className="glass-card" style={{ padding: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${kpi.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{kpi.icon}</div>
                        <span style={{ fontSize: 11, color: '#6b7280' }}>{kpi.label}</span>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: kpi.color }}>
                        {kpi.value.toLocaleString()}{kpi.suffix}
                      </div>
                    </div>))}
                </div>

                {/* ── SIMULATEUR BANCAIRE ───────────────────── */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <lucide_react_1.Banknote size={17} color="#f59e0b"/> Simulateur de financement — Comparaison bancaire
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 20 }}>
                    {/* Sliders */}
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Montant souhaité</label>
                        <input type="range" min={100000} max={10000000} step={50000} value={loanSimAmount} onChange={e => setLoanSimAmount(parseInt(e.target.value))} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', width: '100%' }}/>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 6 }}>{loanSimAmount.toLocaleString()} FCFA</div>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Durée de remboursement</label>
                        <input type="range" min={3} max={60} step={3} value={loanSimDuration} onChange={e => setLoanSimDuration(parseInt(e.target.value))} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', width: '100%' }}/>
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{loanSimDuration} mois</div>
                      </div>
                    </div>
                    {/* Best bank */}
                    <div>
                      {(loanSimulation === null || loanSimulation === void 0 ? void 0 : loanSimulation.bestBank)
                ? <div style={{ background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 12, padding: 16 }}>
                            <div style={{ fontSize: 11, color: '#10b981', marginBottom: 10, fontWeight: 600 }}>🏆 MEILLEURE OFFRE</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                              <span style={{ fontSize: 28 }}>{loanSimulation.bestBank.logo}</span>
                              <div>
                                <div style={{ fontWeight: 700, fontSize: 15 }}>{loanSimulation.bestBank.name}</div>
                                <div style={{ fontSize: 11, color: '#6b7280' }}>Taux annuel: {loanSimulation.bestBank.rate}%</div>
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              {[
                        ['Mensualité', `${loanSimulation.bestBank.monthlyPayment.toLocaleString()} FCFA`, '#10b981'],
                        ['Total à rembourser', `${loanSimulation.bestBank.totalPayment.toLocaleString()} FCFA`, '#06b6d4'],
                        ['Intérêts totaux', `${loanSimulation.bestBank.totalInterest.toLocaleString()} FCFA`, '#f59e0b'],
                        ['Frais de dossier', `${loanSimulation.bestBank.fees.toLocaleString()} FCFA`, '#8b5cf6'],
                    ].map(([k, v, c]) => (<div key={k} style={{ background: '#1f2127', borderRadius: 8, padding: 10 }}>
                                  <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 3 }}>{k}</div>
                                  <div style={{ fontSize: 13, fontWeight: 700, color: c }}>{v}</div>
                                </div>))}
                            </div>
                          </div>
                : <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', fontSize: 13 }}>
                            Aucune banque disponible pour ces paramètres
                          </div>}
                    </div>
                  </div>

                  {/* Toutes les offres */}
                  {(loanSimulation === null || loanSimulation === void 0 ? void 0 : loanSimulation.offers) && loanSimulation.offers.length > 0 && (<div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12, fontWeight: 600 }}>COMPARAISON DES {loanSimulation.offers.length} BANQUES ÉLIGIBLES</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                        {loanSimulation.offers.map((offer, i) => (<div key={offer.name} style={{
                        padding: 14, borderRadius: 12,
                        background: i === 0 ? 'rgba(16,185,129,.1)' : '#1f2127',
                        border: i === 0 ? '1px solid rgba(16,185,129,.3)' : '1px solid #2a2c34',
                        position: 'relative'
                    }}>
                            {i === 0 && <div style={{ position: 'absolute', top: 8, right: 10, fontSize: 9, background: '#10b981', color: '#000', borderRadius: 8, padding: '2px 7px', fontWeight: 700 }}>BEST</div>}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                              <span style={{ fontSize: 18 }}>{offer.logo}</span>
                              <span style={{ fontWeight: 600, fontSize: 13 }}>{offer.name}</span>
                            </div>
                            <div style={{ fontSize: 20, fontWeight: 700, color: i === 0 ? '#10b981' : '#fff' }}>{offer.monthlyPayment.toLocaleString()}</div>
                            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>FCFA / mois</div>
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>Taux {offer.rate}% · {offer.totalPayment.toLocaleString()} total</div>
                          </div>))}
                      </div>
                    </div>)}
                </div>

                {/* ── TABLEAU D'AMORTISSEMENT ───────────────── */}
                {amortizationTable.length > 0 && (<div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>📊 Tableau d'amortissement</h3>
                    <div style={{ overflowX: 'auto', maxHeight: 320, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#111317' }}>
                          <tr style={{ borderBottom: '1px solid #1f2127' }}>
                            {['Mois', 'Mensualité', 'Capital', 'Intérêts', 'Solde restant'].map(h => (<th key={h} style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280', fontWeight: 600 }}>{h}</th>))}
                          </tr>
                        </thead>
                        <tbody>
                          {amortizationTable.slice(0, 24).map(row => (<tr key={row.month} style={{ borderBottom: '1px solid #1a1c22' }}>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#6b7280' }}>{row.month}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.payment.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#10b981' }}>{row.principal.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f59e0b' }}>{row.interest.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.remainingBalance.toLocaleString()}</td>
                            </tr>))}
                        </tbody>
                      </table>
                    </div>
                  </div>)}

                {/* ── SCORING CRÉDIT PAR UTILISATEUR ───────── */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <lucide_react_1.Brain size={17} color="#8b5cf6"/> Scoring crédit — Vendeurs actifs (Firestore)
                  </h3>
                  <p style={{ fontSize: 11, color: '#6b7280', marginBottom: 16 }}>Calculé en temps réel depuis les données Firestore : commandes, paiements, ancienneté du compte</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
                    {users.filter(u => u.role === 'seller').slice(0, 6).map(seller => {
                var _a;
                const sellerOrders = orders.filter(o => o.farmerId === seller.uid || o.farmerId === seller.id);
                const paidOrders = sellerOrders.filter(o => o.status === 'Livrée');
                const accountAgeMs = ((_a = seller.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) ? Date.now() - seller.createdAt.toDate().getTime() : 0;
                const accountAgeMo = Math.floor(accountAgeMs / (1000 * 60 * 60 * 24 * 30));
                const sellerLoans = loans.filter(l => l.sellerId === seller.uid || l.sellerId === seller.id);
                const totalDebt = sellerLoans.filter(l => l.status === 'active' || l.status === 'approved').reduce((s, l) => { var _a; return s + ((_a = l.remainingBalance) !== null && _a !== void 0 ? _a : 0); }, 0);
                const avgOrderAmt = sellerOrders.length ? sellerOrders.reduce((s, o) => { var _a; return s + ((_a = o.amount) !== null && _a !== void 0 ? _a : 0); }, 0) / sellerOrders.length : 0;
                const scoring = creditScoringAI.calculateScore({
                    monthlyIncome: avgOrderAmt * 4,
                    existingDebts: totalDebt,
                    ordersCount: sellerOrders.length,
                    onTimePayments: paidOrders.length,
                    accountAgeMonths: accountAgeMo,
                    hasCollateral: false,
                });
                const scoreColor = scoring.score >= 850 ? '#10b981' : scoring.score >= 650 ? '#06b6d4' : scoring.score >= 500 ? '#f59e0b' : '#ef4444';
                return (<div key={seller.id} style={{ background: '#1a1c22', borderRadius: 14, padding: 16, border: `1px solid ${scoreColor}30` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: 14 }}>{seller.displayName}</div>
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{seller.region || 'Région inconnue'} · {sellerOrders.length} commandes</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor }}>{scoring.score}</div>
                              <div style={{ fontSize: 9, color: '#6b7280' }}>/1000</div>
                            </div>
                          </div>
                          {/* Score bar */}
                          <div style={{ height: 6, background: '#2a2c34', borderRadius: 3, marginBottom: 10, overflow: 'hidden' }}>
                            <div style={{ width: `${scoring.score / 10}%`, height: '100%', background: scoreColor, borderRadius: 3, transition: 'width .5s' }}/>
                          </div>
                          <div style={{ fontSize: 11, marginBottom: 10 }}>{scoring.rating}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 10 }}>
                            <div style={{ background: '#1f2127', borderRadius: 8, padding: 8 }}>
                              <div style={{ fontSize: 9, color: '#6b7280' }}>Prêt max</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>{scoring.maxLoan.toLocaleString()} F</div>
                            </div>
                            <div style={{ background: '#1f2127', borderRadius: 8, padding: 8 }}>
                              <div style={{ fontSize: 9, color: '#6b7280' }}>Taux éligible</div>
                              <div style={{ fontSize: 12, fontWeight: 600, color: '#f59e0b' }}>{scoring.interestRate}%</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {scoring.recommendations.map((r, i) => (<div key={i} style={{ fontSize: 11, color: '#9ca3af' }}>{r}</div>))}
                          </div>
                        </div>);
            })}
                    {users.filter(u => u.role === 'seller').length === 0 && (<div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 13 }}>
                        Aucun vendeur dans Firestore
                      </div>)}
                  </div>
                </div>

                {/* ── TABLEAU DES DEMANDES ──────────────────── */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700 }}>📋 Demandes de financement</h2>
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{loans.length} demandes · {pendingLoans} en attente · {totalLoanVolume.toLocaleString()} FCFA total</p>
                    </div>
                    <button onClick={() => setShowLoanForm(true)} className="btn-primary"><lucide_react_1.Plus size={14}/> Nouvelle demande</button>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #1f2127' }}>
                          {['Emprunteur', 'Région', 'Montant', 'Durée', 'Mensualité', 'Motif', 'Statut', 'Actions'].map(h => (<th key={h} style={{ textAlign: 'left', padding: '10px 8px', fontSize: 11, color: '#6b7280' }}>{h}</th>))}
                        </tr>
                      </thead>
                      <tbody>
                        {loans.map(loan => {
                var _a, _b;
                return (<tr key={loan.id} style={{ borderBottom: '1px solid #1a1c22' }}>
                            <td style={{ padding: '10px 8px', fontWeight: 500 }}>{loan.sellerName}</td>
                            <td style={{ padding: '10px 8px', fontSize: 12, color: '#6b7280' }}>{loan.region || '—'}</td>
                            <td style={{ padding: '10px 8px', fontWeight: 600, color: '#10b981' }}>{((_a = loan.amount) !== null && _a !== void 0 ? _a : 0).toLocaleString()} FCFA</td>
                            <td style={{ padding: '10px 8px', fontSize: 12 }}>{loan.duration} mois</td>
                            <td style={{ padding: '10px 8px', fontSize: 12 }}>{((_b = loan.monthlyPayment) !== null && _b !== void 0 ? _b : 0).toLocaleString()} FCFA</td>
                            <td style={{ padding: '10px 8px', fontSize: 12, color: '#9ca3af' }}>{loan.purpose || '—'}</td>
                            <td style={{ padding: '10px 8px' }}><StatusBadge status={loan.status}/></td>
                            <td style={{ padding: '10px 8px' }}>
                              <div style={{ display: 'flex', gap: 5 }}>
                                <button onClick={() => setSelectedLoan(loan)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}><lucide_react_1.Eye size={11}/></button>
                                {loan.status === 'pending' && <>
                                  <button onClick={() => updateLoanStatus(loan.id, 'approved')} className="btn-primary" style={{ padding: '5px 10px', fontSize: 11 }}><lucide_react_1.Check size={11}/></button>
                                  <button onClick={() => updateLoanStatus(loan.id, 'rejected')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11, color: '#ef4444', borderColor: '#ef4444' }}><lucide_react_1.X size={11}/></button>
                                </>}
                                {loan.status === 'approved' && (<button onClick={() => markLoanAsPaid(loan.id)} className="btn-primary" style={{ padding: '5px 10px', fontSize: 11, background: '#f59e0b' }}>💰</button>)}
                              </div>
                            </td>
                          </tr>);
            })}
                        {loans.length === 0 && (<tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Aucune demande de financement</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>)}

            {/* ═══ ANALYSES IA ════════════════════════════════ */}
            {activeTab === 'analytics' && (<div className="animate-fadeIn">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 24, marginBottom: 24 }}>
                  {/* Anomalies */}
                  <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><lucide_react_1.AlertTriangle size={17} color="#ef4444"/> Anomalies détectées</h3>
                    {anomalies.length === 0
                ? <div style={{ textAlign: 'center', padding: 40, color: '#10b981' }}>✅ Aucune anomalie</div>
                : anomalies.map(a => (<div key={a.orderNumber} style={{ padding: 12, marginBottom: 8, background: 'rgba(239,68,68,.08)', borderRadius: 10, border: '1px solid rgba(239,68,68,.2)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontWeight: 600 }}>#{a.orderNumber}</span>
                              <span style={{ color: '#ef4444', fontWeight: 600 }}>{a.amount.toLocaleString()} FCFA</span>
                            </div>
                            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>{a.reason}</div>
                            <div style={{ fontSize: 11, marginTop: 6, color: a.severity === 'high' ? '#ef4444' : a.severity === 'medium' ? '#f59e0b' : '#10b981' }}>⚠ Sévérité: {a.severity}</div>
                          </div>))}
                  </div>

                  {/* Prédictions */}
                  <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><lucide_react_1.TrendingUp size={17} color="#06b6d4"/> Prédictions prix</h3>
                    {pricePredictions
                ? <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 6, marginBottom: 14 }}>
                            {pricePredictions.predictions.map((price, i) => (<div key={i} style={{ textAlign: 'center', padding: 8, background: '#1f2127', borderRadius: 8 }}>
                                <div style={{ fontSize: 9, color: '#6b7280' }}>J+{i + 1}</div>
                                <div style={{ fontSize: 12, fontWeight: 600, color: '#10b981' }}>{price.toLocaleString()}</div>
                              </div>))}
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280' }}>
                            <span>Tendance: {pricePredictions.trend === 'up' ? '📈 Hausse' : pricePredictions.trend === 'down' ? '📉 Baisse' : '➡ Stable'}</span>
                            <span>Confiance: {pricePredictions.confidence.toFixed(0)}%</span>
                          </div>
                        </>
                : <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>📊 Données insuffisantes</div>}
                  </div>
                </div>

                {/* Simulateur prêt */}
                <div className="glass-card" style={{ padding: 20, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><lucide_react_1.Banknote size={17} color="#f59e0b"/> Simulateur de financement</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                    <div>
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Montant: {loanSimAmount.toLocaleString()} FCFA</label>
                        <input type="range" min={100000} max={10000000} step={50000} value={loanSimAmount} onChange={e => setLoanSimAmount(parseInt(e.target.value))} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}/>
                        <div style={{ fontSize: 22, fontWeight: 700, color: '#10b981', marginTop: 6 }}>{loanSimAmount.toLocaleString()} FCFA</div>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Durée: {loanSimDuration} mois</label>
                        <input type="range" min={3} max={60} step={3} value={loanSimDuration} onChange={e => setLoanSimDuration(parseInt(e.target.value))} style={{ padding: 0, border: 'none', background: 'transparent', cursor: 'pointer' }}/>
                        <div style={{ fontSize: 18, fontWeight: 600, marginTop: 6 }}>{loanSimDuration} mois</div>
                      </div>
                    </div>
                    <div>
                      {(loanSimulation === null || loanSimulation === void 0 ? void 0 : loanSimulation.bestBank)
                ? <div style={{ background: 'rgba(16,185,129,.08)', borderRadius: 12, padding: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                              <span style={{ fontSize: 28 }}>{loanSimulation.bestBank.logo}</span>
                              <div><div style={{ fontWeight: 700 }}>{loanSimulation.bestBank.name}</div><div style={{ fontSize: 11, color: '#6b7280' }}>Meilleure offre</div></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              {[['Taux', `${loanSimulation.bestBank.rate}%`, '#10b981'], ['Mensualité', `${loanSimulation.bestBank.monthlyPayment.toLocaleString()} FCFA`, '#06b6d4'], ['Total', `${loanSimulation.bestBank.totalPayment.toLocaleString()} FCFA`, '#fff'], ['Frais', `${loanSimulation.bestBank.fees.toLocaleString()} FCFA`, '#f59e0b']].map(([k, v, c]) => (<div key={k}><div style={{ fontSize: 10, color: '#6b7280' }}>{k}</div><div style={{ fontSize: 14, fontWeight: 700, color: c }}>{v}</div></div>))}
                            </div>
                          </div>
                : <div style={{ textAlign: 'center', padding: 32, color: '#6b7280', fontSize: 13 }}>Aucune banque disponible pour ces paramètres</div>}
                    </div>
                  </div>
                </div>

                {/* Amortissement */}
                {amortizationTable.length > 0 && (<div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>📊 Tableau d'amortissement</h3>
                    <div style={{ overflowX: 'auto', maxHeight: 380, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#111317' }}>
                          <tr style={{ borderBottom: '1px solid #1f2127' }}>
                            {['Mois', 'Mensualité', 'Capital', 'Intérêts', 'Solde restant'].map(h => (<th key={h} style={{ padding: '8px 10px', textAlign: 'right', color: '#6b7280' }}>{h}</th>))}
                          </tr>
                        </thead>
                        <tbody>
                          {amortizationTable.slice(0, 24).map(row => (<tr key={row.month} style={{ borderBottom: '1px solid #1a1c22' }}>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.month}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.payment.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#10b981' }}>{row.principal.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#f59e0b' }}>{row.interest.toLocaleString()}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{row.remainingBalance.toLocaleString()}</td>
                            </tr>))}
                        </tbody>
                      </table>
                    </div>
                  </div>)}
              </div>)}


            {/* ═══ ASSISTANT DEEPSEEK ═════════════════════════ */}
            {activeTab === 'ai-assistant' && (<div className="animate-fadeIn" style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, height: 'calc(100vh - 130px)' }}>

                {/* Chat window */}
                <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

                  {/* Chat header */}
                  <div style={{ padding: '16px 20px', borderBottom: '1px solid #1f2127', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>🤖</div>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>Assistant DeepSeek</div>
                        <div style={{ fontSize: 11, color: '#10b981', display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', display: 'inline-block' }}/>
                          {aiLoading ? 'En train de réfléchir…' : 'Prêt · Contexte métier chargé'}
                        </div>
                      </div>
                    </div>
                    <select value={aiModel} onChange={e => setAiModel(e.target.value)} style={{ width: 'auto', padding: '6px 10px', fontSize: 12, background: '#1f2127', border: '1px solid #2d2f36', color: '#fff', borderRadius: 8, cursor: 'pointer' }}>
                      <option value="deepseek-chat">⚡ DeepSeek Chat (rapide)</option>
                      <option value="deepseek-reasoner">🧠 DeepSeek Reasoner (avancé)</option>
                    </select>
                  </div>

                  {/* Messages */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {aiMessages.length === 0 && (<div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, color: '#4b5563', textAlign: 'center', paddingTop: 60 }}>
                        <div style={{ fontSize: 56 }}>🤖</div>
                        <div>
                          <div style={{ fontSize: 18, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>Assistant IA AgriMarché</div>
                          <div style={{ fontSize: 13, color: '#4b5563', maxWidth: 420, lineHeight: 1.7 }}>Posez des questions sur vos données, demandez des analyses ou des conseils métier. Je connais votre contexte en temps réel.</div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, width: '100%', maxWidth: 500 }}>
                          {[
                    '📊 Analyse mes ventes du mois',
                    '⚠️ Explique les anomalies détectées',
                    '💡 Conseils pour améliorer les livraisons',
                    '🏦 Quels financements sont à risque ?',
                    '📈 Prévision pour le prochain trimestre',
                    '🌾 Produits les plus performants ?'
                ].map(prompt => (<button key={prompt} onClick={() => setAiInput(prompt)} style={{ padding: '10px 12px', background: '#1f2127', border: '1px solid #2d2f36', borderRadius: 10, color: '#9ca3af', fontSize: 11, cursor: 'pointer', textAlign: 'left', lineHeight: 1.4, transition: 'all .15s' }}>
                              {prompt}
                            </button>))}
                        </div>
                      </div>)}

                    {aiMessages.map((msg, i) => (<div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: msg.role === 'user' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                          {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div style={{ maxWidth: '75%', padding: '12px 16px', borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px', background: msg.role === 'user' ? 'rgba(16,185,129,.12)' : 'rgba(139,92,246,.1)', border: `1px solid ${msg.role === 'user' ? 'rgba(16,185,129,.2)' : 'rgba(139,92,246,.2)'}`, fontSize: 13, lineHeight: 1.6, color: '#e5e7eb', whiteSpace: 'pre-wrap' }}>
                          {msg.content}
                          <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                            {new Date(msg.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>))}

                    {aiLoading && (<div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>🤖</div>
                        <div style={{ padding: '12px 16px', borderRadius: '4px 18px 18px 18px', background: 'rgba(139,92,246,.1)', border: '1px solid rgba(139,92,246,.2)', display: 'flex', gap: 6, alignItems: 'center' }}>
                          {[0, 1, 2].map(i => <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: '#8b5cf6', animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`, display: 'inline-block' }}/>)}
                        </div>
                      </div>)}
                    <div ref={aiEndRef}/>
                  </div>

                  {/* Input */}
                  <div style={{ padding: '14px 20px', borderTop: '1px solid #1f2127', flexShrink: 0 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                      <textarea value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendAiMessage();
        } }} placeholder="Posez une question… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)" rows={2} disabled={aiLoading} style={{ flex: 1, resize: 'none', fontSize: 13, padding: '10px 14px', borderRadius: 12, lineHeight: 1.5 }}/>
                      <button onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()} className="btn-primary" style={{ padding: '10px 18px', borderRadius: 12, flexShrink: 0, opacity: aiLoading || !aiInput.trim() ? 0.5 : 1, height: 44 }}>
                        <lucide_react_1.Send size={16}/>
                      </button>
                    </div>
                    {aiMessages.length > 0 && (<div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                        <button onClick={() => setAiMessages([])} style={{ background: 'none', border: 'none', color: '#4b5563', fontSize: 11, cursor: 'pointer' }}>🗑 Effacer la conversation</button>
                      </div>)}
                  </div>
                </div>

                {/* Right panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

                  <div className="glass-card" style={{ padding: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#8b5cf6', display: 'flex', alignItems: 'center', gap: 6 }}><lucide_react_1.Zap size={14}/> Contexte injecté</h4>
                    {[
                { label: 'Commandes', val: `${orders.length}`, sub: `${orders.filter(o => o.status === 'En attente').length} en attente`, color: '#06b6d4' },
                { label: 'CA total', val: `${(totalRevenue / 1000000).toFixed(1)}M`, sub: 'FCFA', color: '#10b981' },
                { label: 'Utilisateurs', val: `${users.length}`, sub: `${deliveryPersons.length} livreurs`, color: '#8b5cf6' },
                { label: 'Anomalies', val: `${anomalies.length}`, sub: 'détectées', color: anomalies.length > 0 ? '#ef4444' : '#10b981' },
                { label: 'Financements', val: `${pendingLoans}`, sub: 'en attente', color: '#f59e0b' },
            ].map(item => (<div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #1a1c22' }}>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{item.label}</div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: item.color }}>{item.val}</span>
                          <div style={{ fontSize: 10, color: '#4b5563' }}>{item.sub}</div>
                        </div>
                      </div>))}
                  </div>

                  <div className="glass-card" style={{ padding: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#06b6d4', display: 'flex', alignItems: 'center', gap: 6 }}><lucide_react_1.Sparkles size={14}/> Suggestions</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      {[
                { emoji: '📊', text: "Résume la performance globale" },
                { emoji: '⚠️', text: "Analyse les risques actuels" },
                { emoji: '💡', text: "3 conseils d'optimisation" },
                { emoji: '🌾', text: "Produits à recommander ?" },
                { emoji: '📅', text: "Plan d'action ce mois" },
                { emoji: '🔍', text: "Explique les anomalies" },
            ].map(s => (<button key={s.text} onClick={() => setAiInput(s.text)} style={{ padding: '8px 10px', background: '#1f2127', border: '1px solid #2d2f36', borderRadius: 8, color: '#9ca3af', fontSize: 11, cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, transition: 'all .15s' }}>
                          <span>{s.emoji}</span>{s.text}
                        </button>))}
                    </div>
                  </div>

                  <div className="glass-card" style={{ padding: 16 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: '#f59e0b' }}>⚙️ Modèle actif</h4>
                    <div style={{ fontSize: 13, fontWeight: 700, color: aiModel === 'deepseek-reasoner' ? '#8b5cf6' : '#10b981', marginBottom: 6 }}>
                      {aiModel === 'deepseek-chat' ? '⚡ DeepSeek Chat' : '🧠 DeepSeek Reasoner'}
                    </div>
                    <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6 }}>
                      {aiModel === 'deepseek-chat'
                ? 'Réponses rapides, idéal pour les questions courantes.'
                : 'Raisonnement approfondi, optimal pour les analyses complexes.'}
                    </div>
                    <div style={{ marginTop: 10, padding: '6px 10px', background: '#1f2127', borderRadius: 8, fontSize: 10, color: '#6b7280' }}>
                      🔑 NEXT_PUBLIC_DEEPSEEK_API_KEY
                    </div>
                  </div>
                </div>
              </div>)}

            {/* ═══ RÉGIONS ════════════════════════════════════ */}
            {activeTab === 'regions' && (<div className="animate-fadeIn">
                {/* Header stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 14, marginBottom: 24 }}>
                  {[
                { label: 'Régions actives', value: regionStats.filter(r => r.revenue > 0).length, color: '#10b981' },
                { label: 'Total commandes', value: orders.length, color: '#06b6d4' },
                { label: 'Utilisateurs géocodés', value: users.filter(u => u.region).length, color: '#8b5cf6' },
                { label: 'Produits référencés', value: products.filter(p => p.region).length, color: '#f59e0b' },
            ].map((s, i) => (<div key={i} className="glass-card" style={{ padding: 16 }}>
                      <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{s.label}</div>
                    </div>))}
                </div>

                {/* Region cards */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 16, marginBottom: 24 }}>
                  {regionStats.map(r => (<div key={r.region} className="glass-card" style={{ padding: 20, borderLeft: `3px solid ${r.color}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 28 }}>{r.emoji}</span>
                          <div>
                            <h3 style={{ fontWeight: 700, fontSize: 16 }}>{r.region}</h3>
                            <p style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{r.description}</p>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: r.color }}>{r.revenue.toLocaleString()}</div>
                          <div style={{ fontSize: 10, color: '#6b7280' }}>FCFA</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                        {[
                    { label: 'Commandes', val: r.orders, icon: '📦' },
                    { label: 'Utilisateurs', val: r.users, icon: '👥' },
                    { label: 'Produits', val: r.products, icon: '🌿' },
                ].map(({ label, val, icon }) => (<div key={label} style={{ background: '#1f2127', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
                            <div style={{ fontSize: 16 }}>{icon}</div>
                            <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{val}</div>
                            <div style={{ fontSize: 10, color: '#6b7280' }}>{label}</div>
                          </div>))}
                      </div>
                      {/* Progress bar */}
                      <div style={{ marginTop: 14 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                          <span>Part du revenu total</span>
                          <span>{totalRevenue > 0 ? (r.revenue / totalRevenue * 100).toFixed(1) : 0}%</span>
                        </div>
                        <div style={{ height: 4, background: '#1f2127', borderRadius: 2 }}>
                          <div style={{ width: `${totalRevenue > 0 ? (r.revenue / totalRevenue * 100) : 0}%`, height: '100%', background: r.color, borderRadius: 2, transition: 'width .5s' }}/>
                        </div>
                      </div>
                    </div>))}
                </div>

                {/* Regional bar chart */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📊 Revenus par région</h3>
                  <div style={{ height: 320 }}>
                    <recharts_1.ResponsiveContainer width="100%" height="100%">
                      <recharts_1.BarChart data={regionStats} layout="vertical" margin={{ left: 90, right: 20 }}>
                        <recharts_1.CartesianGrid strokeDasharray="3 3" stroke="#1f2127" horizontal={false}/>
                        <recharts_1.XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`}/>
                        <recharts_1.YAxis type="category" dataKey="region" stroke="#6b7280" fontSize={11} width={80}/>
                        <recharts_1.Tooltip contentStyle={{ background: '#111317', border: '1px solid #1f2127', borderRadius: 8 }} formatter={(v) => `${Number(v).toLocaleString()} FCFA`}/>
                        <recharts_1.Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                          {regionStats.map((r, i) => <recharts_1.Cell key={i} fill={r.color}/>)}
                        </recharts_1.Bar>
                      </recharts_1.BarChart>
                    </recharts_1.ResponsiveContainer>
                  </div>
                </div>
              </div>)}

            {/* ═══ DIFFUSION ══════════════════════════════════ */}
            {activeTab === 'broadcast' && (<div className="animate-fadeIn" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>

                {/* Form */}
                <div className="glass-card" style={{ padding: 24 }}>
                  <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>📢 Envoyer un message</h2>
                  <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>Diffusez aux utilisateurs via notifications in-app et email (Resend).</p>

                  {/* Cible */}
                  <div style={{ marginBottom: 20, padding: 16, background: 'rgba(16,185,129,.05)', borderRadius: 12, border: '1px solid rgba(16,185,129,.15)' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#10b981' }}>🎯 Audience cible</h4>

                    {/* Mode switcher */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                      {[['filter', '🔍 Par critères'], ['manual', '✅ Sélection manuelle']].map(([mode, label]) => (<button key={mode} onClick={() => { setBroadcastMode(mode); setSelectedUserIds(new Set()); setUserPickerSearch(''); }} style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: `1px solid ${broadcastMode === mode ? '#10b981' : 'rgba(255,255,255,.08)'}`, background: broadcastMode === mode ? 'rgba(16,185,129,.1)' : 'transparent', color: broadcastMode === mode ? '#10b981' : '#6b7280', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all .2s' }}>
                          {label}
                        </button>))}
                    </div>

                    {broadcastMode === 'filter' ? (<>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ fontSize: 11, color: '#6b7280', marginBottom: 5, display: 'block' }}>Rôle</label>
                            <select value={broadcastForm.targetRole} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { targetRole: e.target.value }))}>
                              <option value="all">Tous les utilisateurs</option>
                              <option value="client">Clients</option>
                              <option value="seller">Vendeurs</option>
                              <option value="delivery">Livreurs</option>
                              <option value="admin">Admins</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize: 11, color: '#6b7280', marginBottom: 5, display: 'block' }}>Région</label>
                            <select value={broadcastForm.targetRegion} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { targetRegion: e.target.value }))}>
                              <option value="all">Toutes les régions</option>
                              {SENEGAL_REGIONS.map(r => <option key={r} value={r}>{REGION_INFO[r].emoji} {r}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginTop: 10, padding: '8px 12px', background: '#1f2127', borderRadius: 8, fontSize: 12, color: '#9ca3af' }}>
                          {(() => {
                    let count = users.length;
                    if (broadcastForm.targetRole !== 'all')
                        count = users.filter(u => u.role === broadcastForm.targetRole).length;
                    if (broadcastForm.targetRegion !== 'all')
                        count = users.filter(u => { var _a; return (broadcastForm.targetRole === 'all' || u.role === broadcastForm.targetRole) && ((_a = u.region) === null || _a === void 0 ? void 0 : _a.toLowerCase()) === broadcastForm.targetRegion.toLowerCase(); }).length;
                    return `👥 ${count} destinataire(s) sélectionné(s)`;
                })()}
                        </div>
                      </>) : (<>
                        {/* Barre de recherche */}
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                          <lucide_react_1.Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}/>
                          <input type="text" placeholder="Rechercher par nom, téléphone, email, rôle…" value={userPickerSearch} onChange={e => setUserPickerSearch(e.target.value)} style={{ paddingLeft: 32, fontSize: 12 }}/>
                        </div>

                        {/* Sélectionner tout / Désélectionner */}
                        {userPickerSearch.length > 0 && (<div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                            <button onClick={() => {
                        const filtered = users.filter(u => { var _a, _b, _c, _d; const q = userPickerSearch.toLowerCase(); return ((_a = u.displayName) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = u.phone) === null || _b === void 0 ? void 0 : _b.includes(q)) || ((_c = u.email) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes(q)) || ((_d = u.role) === null || _d === void 0 ? void 0 : _d.includes(q)); });
                        setSelectedUserIds(prev => { const n = new Set(prev); filtered.forEach(u => { var _a, _b; return n.add((_b = (_a = u.uid) !== null && _a !== void 0 ? _a : u.id) !== null && _b !== void 0 ? _b : ''); }); return n; });
                    }} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>Tout sélectionner</button>
                            <button onClick={() => setSelectedUserIds(new Set())} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11, color: '#ef4444' }}>Tout effacer</button>
                          </div>)}

                        {/* Liste utilisateurs filtrés */}
                        <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #1f2127', borderRadius: 10, background: '#0a0c10' }}>
                          {users.filter(u => {
                    var _a, _b, _c, _d;
                    if (!userPickerSearch)
                        return true;
                    const q = userPickerSearch.toLowerCase();
                    return ((_a = u.displayName) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = u.phone) === null || _b === void 0 ? void 0 : _b.includes(q)) || ((_c = u.email) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes(q)) || ((_d = u.role) === null || _d === void 0 ? void 0 : _d.includes(q));
                }).map(u => {
                    var _a, _b, _c, _d;
                    const uid = (_b = (_a = u.uid) !== null && _a !== void 0 ? _a : u.id) !== null && _b !== void 0 ? _b : '';
                    const checked = selectedUserIds.has(uid);
                    return (<label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderBottom: '1px solid #1a1c22', cursor: 'pointer', background: checked ? 'rgba(16,185,129,.04)' : 'transparent' }}>
                                <input type="checkbox" checked={checked} onChange={() => { setSelectedUserIds(prev => { const n = new Set(prev); checked ? n.delete(uid) : n.add(uid); return n; }); }} style={{ width: 'auto', flexShrink: 0 }}/>
                                <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{(_d = (_c = u.displayName) === null || _c === void 0 ? void 0 : _c.charAt(0)) !== null && _d !== void 0 ? _d : '?'}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.displayName}</div>
                                  <div style={{ fontSize: 10, color: '#6b7280' }}>{u.role} · {u.phone || u.email || '—'}</div>
                                </div>
                                {u.region && <span style={{ fontSize: 10, color: '#4b5563', flexShrink: 0 }}>{u.region}</span>}
                              </label>);
                })}
                          {users.filter(u => { var _a, _b, _c, _d; if (!userPickerSearch)
                    return true; const q = userPickerSearch.toLowerCase(); return ((_a = u.displayName) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = u.phone) === null || _b === void 0 ? void 0 : _b.includes(q)) || ((_c = u.email) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes(q)) || ((_d = u.role) === null || _d === void 0 ? void 0 : _d.includes(q)); }).length === 0 && (<div style={{ padding: 16, textAlign: 'center', fontSize: 12, color: '#4b5563' }}>Aucun utilisateur trouvé</div>)}
                        </div>

                        {/* Chips sélectionnés */}
                        {selectedUserIds.size > 0 && (<div style={{ marginTop: 10, padding: '8px 12px', background: '#1f2127', borderRadius: 8 }}>
                            <div style={{ fontSize: 11, color: '#10b981', fontWeight: 600, marginBottom: 6 }}>✅ {selectedUserIds.size} destinataire(s) sélectionné(s)</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {Array.from(selectedUserIds).slice(0, 8).map(uid => {
                        var _a;
                        const u = users.find(x => { var _a; return ((_a = x.uid) !== null && _a !== void 0 ? _a : x.id) === uid; });
                        return u ? (<span key={uid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, background: 'rgba(16,185,129,.1)', color: '#10b981', fontSize: 11 }}>
                                    {(_a = u.displayName) === null || _a === void 0 ? void 0 : _a.split(' ')[0]}
                                    <button onClick={() => setSelectedUserIds(prev => { const n = new Set(prev); n.delete(uid); return n; })} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', lineHeight: 1, padding: 0 }}>×</button>
                                  </span>) : null;
                    })}
                              {selectedUserIds.size > 8 && <span style={{ fontSize: 11, color: '#6b7280', padding: '3px 8px' }}>+{selectedUserIds.size - 8} autres</span>}
                            </div>
                          </div>)}
                      </>)}
                  </div>

                  {/* Canaux */}
                  <div style={{ marginBottom: 20, padding: 16, background: 'rgba(6,182,212,.05)', borderRadius: 12, border: '1px solid rgba(6,182,212,.15)' }}>
                    <h4 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#06b6d4' }}>📡 Canaux d'envoi</h4>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {[['inApp', '🔔 In-App', '10b981'], ['email', '✉️ Email', '8b5cf6']].map(([key, label, color]) => (<label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 14px', borderRadius: 10, border: `1px solid ${broadcastForm.channels[key] ? `#${color}` : 'rgba(255,255,255,.08)'}`, background: broadcastForm.channels[key] ? `rgba(${key === 'inApp' ? '16,185,129' : '139,92,246'},.1)` : 'transparent', transition: 'all .2s', width: 'auto' }}>
                          <input type="checkbox" checked={broadcastForm.channels[key]} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { channels: Object.assign(Object.assign({}, broadcastForm.channels), { [key]: e.target.checked }) }))} style={{ width: 'auto', cursor: 'pointer' }}/>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
                        </label>))}
                    </div>
                    <p style={{ fontSize: 11, color: '#4b5563', marginTop: 8 }}>Les emails sont envoyés via Resend.</p>
                  </div>

                  {/* Contenu */}
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Icône</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {['🔔', '📢', '⚡', '🎉', '⚠️', '💰', '🌾', '🚚', '📱', '🔥'].map(e => (<button key={e} onClick={() => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { icon: e }))} style={{ width: 36, height: 36, borderRadius: 8, border: `2px solid ${broadcastForm.icon === e ? '#10b981' : 'transparent'}`, background: broadcastForm.icon === e ? 'rgba(16,185,129,.1)' : '#1f2127', fontSize: 18, cursor: 'pointer' }}>{e}</button>))}
                    </div>
                    <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Titre *</label>
                    <input type="text" placeholder="Titre du message" value={broadcastForm.title} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { title: e.target.value }))} style={{ marginBottom: 10 }}/>
                    <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Message *</label>
                    <textarea placeholder="Contenu du message…" value={broadcastForm.body} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { body: e.target.value }))} rows={4} style={{ resize: 'vertical', marginBottom: 10 }}/>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 5, display: 'block' }}>Type</label>
                        <select value={broadcastForm.type} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { type: e.target.value }))}>
                          <option value="system">Système</option>
                          <option value="promotion">Promotion</option>
                          <option value="alert">Alerte</option>
                          <option value="price">Prix</option>
                          <option value="order">Commande</option>
                          <option value="loan">Financement</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 5, display: 'block' }}>Priorité</label>
                        <select value={broadcastForm.priority} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { priority: e.target.value }))}>
                          <option value="low">Faible</option>
                          <option value="medium">Moyenne</option>
                          <option value="high">Haute</option>
                          <option value="critical">Critique</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 5, display: 'block' }}>Lien (deepLink)</label>
                      <input type="text" placeholder="/page ou https://…" value={broadcastForm.deepLink} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { deepLink: e.target.value }))}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                      <input type="checkbox" id="urgent" checked={broadcastForm.urgent} onChange={e => setBroadcastForm(Object.assign(Object.assign({}, broadcastForm), { urgent: e.target.checked }))} style={{ width: 'auto', cursor: 'pointer' }}/>
                      <label htmlFor="urgent" style={{ fontSize: 13, cursor: 'pointer' }}>⚡ Message urgent</label>
                    </div>
                  </div>

                  {/* Aperçu */}
                  {(broadcastForm.title || broadcastForm.body) && (<div style={{ marginBottom: 16, padding: 14, background: '#1f2127', borderRadius: 12 }}>
                      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>Aperçu</div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>{broadcastForm.icon}</span>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{broadcastForm.title || 'Titre…'}</div>
                          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 3 }}>{broadcastForm.body || 'Message…'}</div>
                        </div>
                      </div>
                    </div>)}

                  <button onClick={sendBroadcast} disabled={broadcastSending} className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '13px 20px', fontSize: 14, opacity: broadcastSending ? .5 : 1 }}>
                    {broadcastSending ? <><span className="animate-spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid rgba(255,255,255,.3)', borderTopColor: 'white', borderRadius: '50%' }}/> Envoi en cours…</> : <><lucide_react_1.Send size={15}/> Envoyer la diffusion</>}
                  </button>
                </div>

                {/* History */}
                <div>
                  <div className="glass-card" style={{ padding: 20 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📋 Historique des envois</h3>
                    <div style={{ maxHeight: 600, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {broadcastHistory.length === 0
                ? <div style={{ textAlign: 'center', padding: 30, color: '#4b5563', fontSize: 13 }}>Aucun envoi pour le moment</div>
                : broadcastHistory.map(b => {
                    var _a, _b, _c, _d, _e, _f, _g;
                    return (<div key={b.id} style={{ padding: 14, background: '#1f2127', borderRadius: 10 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <span style={{ fontSize: 18 }}>{b.icon}</span>
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: 13 }}>{b.title}</div>
                                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{(_a = b.body) === null || _a === void 0 ? void 0 : _a.substring(0, 50)}{((_b = b.body) === null || _b === void 0 ? void 0 : _b.length) > 50 ? '…' : ''}</div>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(16,185,129,.1)', color: '#10b981' }}>👥 {b.recipientCount}</span>
                                {b.inAppCount > 0 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(6,182,212,.1)', color: '#06b6d4' }}>🔔 {b.inAppCount}</span>}
                                {b.emailCount > 0 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(139,92,246,.1)', color: '#8b5cf6' }}>✉️ {b.emailCount}</span>}
                                {b.emailCount > 0 && <span style={{ fontSize: 10, padding: '3px 8px', borderRadius: 20, background: 'rgba(139,92,246,.1)', color: '#8b5cf6' }}>✉ {b.emailCount}</span>}
                              </div>
                              <div style={{ fontSize: 10, color: '#4b5563', marginTop: 6 }}>
                                {(_g = (_f = (_d = (_c = b.sentAt) === null || _c === void 0 ? void 0 : _c.toDate) === null || _d === void 0 ? void 0 : (_e = _d.call(_c)).toLocaleString) === null || _f === void 0 ? void 0 : _f.call(_e)) !== null && _g !== void 0 ? _g : ''}
                              </div>
                            </div>);
                })}
                    </div>
                  </div>
                </div>
              </div>)}

            {/* ═══ NOTIFICATIONS ADMIN ════════════════════════ */}
            {activeTab === 'notifications' && (<div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 16, alignItems: 'start' }} className="animate-fadeIn">

                {/* ── Flux temps réel ── */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ fontSize: 18, fontWeight: 700 }}>🔔 Toutes les notifications</h2>
                      <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>{allNotifications.length} au total · {unreadCount} non lue(s) (admin)</p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button onClick={() => setSoundEnabled(!soundEnabled)} className="btn-secondary">
                        {soundEnabled ? <lucide_react_1.Volume2 size={14}/> : <lucide_react_1.VolumeX size={14}/>} Son
                      </button>
                      {unreadCount > 0 && (<button onClick={markAllNotificationsRead} className="btn-primary"><lucide_react_1.Check size={14}/> Tout lire</button>)}
                    </div>
                  </div>

                  <div style={{ maxHeight: 600, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {allNotifications.map(notif => {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                const sender = users.find(u => { var _a; return ((_a = u.uid) !== null && _a !== void 0 ? _a : u.id) === notif.userId; });
                return (<div key={notif.id} style={{ padding: 14, borderRadius: 12, border: '1px solid #1f2127', background: notif.read ? 'transparent' : 'rgba(16,185,129,.04)' }}>
                          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                            <span style={{ fontSize: 22, flexShrink: 0 }}>{notif.icon}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                                <span style={{ fontWeight: 600, fontSize: 13 }}>{notif.title}</span>
                                <span style={{ fontSize: 10, color: '#4b5563', flexShrink: 0 }}>{(_e = (_d = (_b = (_a = notif.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : (_c = _b.call(_a)).toLocaleString) === null || _d === void 0 ? void 0 : _d.call(_c)) !== null && _e !== void 0 ? _e : ''}</span>
                              </div>
                              <p style={{ fontSize: 12, color: '#9ca3af', marginBottom: 6 }}>{notif.body}</p>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(139,92,246,.1)', color: '#8b5cf6' }}>
                                  👤 {(_h = (_f = sender === null || sender === void 0 ? void 0 : sender.displayName) !== null && _f !== void 0 ? _f : (_g = notif.userId) === null || _g === void 0 ? void 0 : _g.slice(0, 8)) !== null && _h !== void 0 ? _h : '—'}
                                </span>
                                <StatusBadge status={notif.priority}/>
                                {notif.urgent && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,.1)', color: '#ef4444' }}>⚡ Urgent</span>}
                                {!notif.read && (<button onClick={() => (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'notifications', notif.id), { read: true })} className="btn-secondary" style={{ padding: '3px 10px', fontSize: 11 }}>
                                    Marquer lu
                                  </button>)}
                              </div>
                            </div>
                          </div>
                        </div>);
            })}
                    {allNotifications.length === 0 && (<div style={{ textAlign: 'center', padding: 60, color: '#4b5563' }}>🔕 Aucune notification</div>)}
                  </div>
                </div>

                {/* ── Envoyer à un utilisateur ── */}
                <div className="glass-card" style={{ padding: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>✉️ Message direct</h3>

                  {/* Recherche destinataire */}
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Destinataire</label>
                    {dmTarget ? (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.3)' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{dmTarget.displayName}</div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>{dmTarget.role} · {dmTarget.phone || dmTarget.email}</div>
                        </div>
                        <button onClick={() => { setDmTarget(null); setDmSearch(''); }} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><lucide_react_1.X size={16}/></button>
                      </div>) : (<>
                        <div style={{ position: 'relative', marginBottom: 8 }}>
                          <lucide_react_1.Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}/>
                          <input type="text" placeholder="Nom, téléphone ou email…" value={dmSearch} onChange={e => setDmSearch(e.target.value)} style={{ paddingLeft: 32 }}/>
                        </div>
                        {dmSearch.length > 1 && (<div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 10, border: '1px solid #1f2127', background: '#111317' }}>
                            {users.filter(u => {
                        var _a, _b, _c;
                        const q = dmSearch.toLowerCase();
                        return ((_a = u.displayName) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = u.phone) === null || _b === void 0 ? void 0 : _b.includes(q)) || ((_c = u.email) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes(q));
                    }).slice(0, 8).map(u => {
                        var _a, _b;
                        return (<div key={u.id} onClick={() => { setDmTarget(u); setDmSearch(''); }} style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid #1a1c22', display: 'flex', alignItems: 'center', gap: 10 }} onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,.04)')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{(_b = (_a = u.displayName) === null || _a === void 0 ? void 0 : _a.charAt(0)) !== null && _b !== void 0 ? _b : '?'}</div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 500 }}>{u.displayName}</div>
                                  <div style={{ fontSize: 11, color: '#6b7280' }}>{u.role} · {u.phone || u.email}</div>
                                </div>
                              </div>);
                    })}
                            {users.filter(u => { var _a, _b, _c; const q = dmSearch.toLowerCase(); return ((_a = u.displayName) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(q)) || ((_b = u.phone) === null || _b === void 0 ? void 0 : _b.includes(q)) || ((_c = u.email) === null || _c === void 0 ? void 0 : _c.toLowerCase().includes(q)); }).length === 0 && (<div style={{ padding: 14, textAlign: 'center', fontSize: 12, color: '#4b5563' }}>Aucun utilisateur trouvé</div>)}
                          </div>)}
                      </>)}
                  </div>

                  {/* Icône */}
                  <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Icône</label>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {['💬', '📢', '⚡', '🎉', '⚠️', '💰', '🌾', '🚚', '🔔', '✅'].map(e => (<button key={e} onClick={() => setDmForm(Object.assign(Object.assign({}, dmForm), { icon: e }))} style={{ width: 34, height: 34, borderRadius: 8, border: `2px solid ${dmForm.icon === e ? '#10b981' : 'transparent'}`, background: dmForm.icon === e ? 'rgba(16,185,129,.1)' : '#1f2127', fontSize: 16, cursor: 'pointer' }}>{e}</button>))}
                    </div>
                  </div>

                  <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Titre *</label>
                  <input type="text" placeholder="Objet du message" value={dmForm.title} onChange={e => setDmForm(Object.assign(Object.assign({}, dmForm), { title: e.target.value }))} style={{ marginBottom: 10 }}/>

                  <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 6, display: 'block' }}>Message *</label>
                  <textarea placeholder="Votre message…" value={dmForm.body} onChange={e => setDmForm(Object.assign(Object.assign({}, dmForm), { body: e.target.value }))} rows={3} style={{ resize: 'vertical', marginBottom: 10 }}/>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 5, display: 'block' }}>Type</label>
                      <select value={dmForm.type} onChange={e => setDmForm(Object.assign(Object.assign({}, dmForm), { type: e.target.value }))} style={{ fontSize: 12 }}>
                        <option value="message">Message</option>
                        <option value="order">Commande</option>
                        <option value="alert">Alerte</option>
                        <option value="loan">Financement</option>
                        <option value="system">Système</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#6b7280', marginBottom: 5, display: 'block' }}>Priorité</label>
                      <select value={dmForm.priority} onChange={e => setDmForm(Object.assign(Object.assign({}, dmForm), { priority: e.target.value }))} style={{ fontSize: 12 }}>
                        <option value="low">Faible</option>
                        <option value="medium">Normale</option>
                        <option value="high">Haute</option>
                        <option value="critical">Critique</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                    <input type="checkbox" id="dm-urgent" checked={dmForm.urgent} onChange={e => setDmForm(Object.assign(Object.assign({}, dmForm), { urgent: e.target.checked }))} style={{ width: 'auto', cursor: 'pointer' }}/>
                    <label htmlFor="dm-urgent" style={{ fontSize: 13, cursor: 'pointer' }}>⚡ Urgent</label>
                  </div>

                  <button onClick={sendDirectMessage} disabled={dmSending || !dmTarget} className="btn-primary" style={{ width: '100%', justifyContent: 'center', opacity: (!dmTarget || dmSending) ? 0.5 : 1 }}>
                    {dmSending ? 'Envoi…' : <><lucide_react_1.Send size={14}/> Envoyer</>}
                  </button>
                </div>

              </div>)}

            {/* ═══ LIVRAISONS ═════════════════════════════════ */}
            {activeTab === 'delivery' && (<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 16 }} className="animate-fadeIn">
                {deliveryPersons.map(d => (<div key={d.id} className="glass-card" style={{ padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ width: 44, height: 44, borderRadius: 12, background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🚚</div>
                      <div><div style={{ fontWeight: 600 }}>{d.displayName}</div><div style={{ fontSize: 12, color: '#6b7280' }}>{d.phone || '—'}</div></div>
                    </div>
                    {[['Véhicule', d.vehicle || 'Non spécifié'], ['Région', d.region || '—'], ['Statut', '✅ Disponible']].map(([k, v]) => (<div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '6px 0', borderBottom: '1px solid #1a1c22' }}>
                        <span style={{ color: '#6b7280' }}>{k}</span><span>{v}</span>
                      </div>))}
                    <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                      <lucide_react_1.Phone size={13}/> Contacter
                    </button>
                  </div>))}
                {deliveryPersons.length === 0 && (<div className="glass-card" style={{ padding: 40, textAlign: 'center', gridColumn: '1/-1', color: '#6b7280' }}>Aucun livreur disponible</div>)}
              </div>)}

            {/* ═══ PARAMÈTRES ═════════════════════════════════ */}
            {activeTab === 'settings' && (<div className="glass-card animate-fadeIn" style={{ padding: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>⚙️ Paramètres</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(380px,1fr))', gap: 16 }}>
                  {[
                { title: 'Plateforme', items: [['Version', '3.0.0 — IA Ultra'], ['Commission', '2% du CA'], ['Devise', 'FCFA'], ['Région', 'Sénégal']] },
                { title: 'Firebase', items: [['Firestore', 'Connecté ✅'], ['Auth', 'Actif ✅'], ['Storage', 'Actif ✅'], ['FCM', pushEnabled ? 'Activé ✅' : 'Désactivé']] },
                { title: 'Notifications', items: [['Son', soundEnabled ? 'Activé' : 'Désactivé'], ['Push', pushEnabled ? 'Activé' : 'Désactivé'], ['Token FCM', fcmToken ? 'Enregistré ✅' : 'En attente']] },
                { title: 'IA & Analytics', items: [['Scoring crédit', 'Actif ✅'], ['Prédictions prix', 'Actif ✅'], ['Anomalies', 'Actif ✅'], ['Régions', '14 régions']] },
            ].map(section => (<div key={section.title} className="glass-card" style={{ padding: 16 }}>
                      <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#10b981' }}>{section.title}</h3>
                      {section.items.map(([k, v]) => (<div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #1a1c22', fontSize: 12 }}>
                          <span style={{ color: '#6b7280' }}>{k}</span>
                          <span style={{ fontWeight: 500 }}>{v}</span>
                        </div>))}
                    </div>))}
                </div>
              </div>)}

          </div>
        </main>
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════ */}

      {/* Assigner livreur */}
      {showAssignModal && (<div onClick={() => setShowAssignModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: 400, maxWidth: '90%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>Assigner un livreur</h3>
              <button onClick={() => setShowAssignModal(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><lucide_react_1.X size={20}/></button>
            </div>
            <p style={{ marginBottom: 16, fontSize: 12, color: '#6b7280' }}>Commande #{assignOrderNumber}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deliveryPersons.map(d => (<button key={d.id} onClick={() => assignDelivery(assignOrderId, d.id, d.displayName)} className="glass-card" style={{ padding: 12, textAlign: 'left', cursor: 'pointer', border: '1px solid #1f2127' }}>
                  <div style={{ fontWeight: 600 }}>{d.displayName}</div>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{d.phone} · {d.vehicle || '—'}</div>
                </button>))}
              {deliveryPersons.length === 0 && <p style={{ textAlign: 'center', color: '#6b7280', padding: 20 }}>Aucun livreur disponible</p>}
            </div>
          </div>
        </div>)}

      {/* Détails utilisateur */}
      {selectedUser && (<div onClick={() => setSelectedUser(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: 440, maxWidth: '90%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>Détails utilisateur</h3>
              <button onClick={() => setSelectedUser(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><lucide_react_1.X size={20}/></button>
            </div>
            <div style={{ display: 'flex', gap: 14, marginBottom: 20, alignItems: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 28, background: 'rgba(16,185,129,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 700 }}>{(_e = (_d = selectedUser.displayName) === null || _d === void 0 ? void 0 : _d.charAt(0)) !== null && _e !== void 0 ? _e : '?'}</div>
              <div><div style={{ fontWeight: 700, fontSize: 17 }}>{selectedUser.displayName}</div><div style={{ fontSize: 12, color: '#6b7280' }}>{selectedUser.role}</div></div>
            </div>
            {[['Email', selectedUser.email], ['Téléphone', selectedUser.phone || '—'], ['Région', selectedUser.region || '—'], ['Inscription', (_k = (_j = (_g = (_f = selectedUser.createdAt) === null || _f === void 0 ? void 0 : _f.toDate) === null || _g === void 0 ? void 0 : (_h = _g.call(_f)).toLocaleDateString) === null || _j === void 0 ? void 0 : _j.call(_h)) !== null && _k !== void 0 ? _k : '—']].map(([k, v]) => (<div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #1a1c22', fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>{k}</span><span>{v}</span>
              </div>))}
          </div>
        </div>)}

      {/* Détails financement */}
      {selectedLoan && (<div onClick={() => setSelectedLoan(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: 440, maxWidth: '90%', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>Détails financement</h3>
              <button onClick={() => setSelectedLoan(null)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><lucide_react_1.X size={20}/></button>
            </div>
            <div style={{ textAlign: 'center', padding: '14px 0', marginBottom: 16, borderBottom: '1px solid #1f2127' }}>
              <div style={{ fontSize: 30, fontWeight: 700, color: '#10b981' }}>{((_l = selectedLoan.amount) !== null && _l !== void 0 ? _l : 0).toLocaleString()} FCFA</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Demandé par {selectedLoan.sellerName}</div>
              <div style={{ marginTop: 8 }}><StatusBadge status={selectedLoan.status}/></div>
            </div>
            {[['Téléphone', selectedLoan.sellerPhone || '—'], ['Durée', `${selectedLoan.duration} mois`], ['Mensualité', `${((_m = selectedLoan.monthlyPayment) !== null && _m !== void 0 ? _m : 0).toLocaleString()} FCFA`], ['Motif', selectedLoan.purpose || '—'], ['Région', selectedLoan.region || '—']].map(([k, v]) => (<div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #1a1c22', fontSize: 13 }}>
                <span style={{ color: '#6b7280' }}>{k}</span><span>{v}</span>
              </div>))}
            {selectedLoan.status === 'pending' && (<div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
                <button onClick={() => { updateLoanStatus(selectedLoan.id, 'approved'); setSelectedLoan(null); }} className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}><lucide_react_1.Check size={14}/> Approuver</button>
                <button onClick={() => { updateLoanStatus(selectedLoan.id, 'rejected'); setSelectedLoan(null); }} className="btn-secondary" style={{ flex: 1, justifyContent: 'center', color: '#ef4444', borderColor: '#ef4444' }}><lucide_react_1.X size={14}/> Refuser</button>
              </div>)}
            {selectedLoan.status === 'approved' && (<button onClick={() => { markLoanAsPaid(selectedLoan.id); setSelectedLoan(null); }} className="btn-primary" style={{ marginTop: 16, width: '100%', justifyContent: 'center', background: '#f59e0b' }}>💰 Marquer remboursé</button>)}
          </div>
        </div>)}

      {/* Créer financement */}
      {showLoanForm && (<div onClick={() => setShowLoanForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.8)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: 500, maxWidth: '90%', maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 17, fontWeight: 600 }}>📝 Nouvelle demande de financement</h3>
              <button onClick={() => setShowLoanForm(false)} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer' }}><lucide_react_1.X size={20}/></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input type="text" placeholder="Nom complet *" value={loanForm.sellerName} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { sellerName: e.target.value }))}/>
              <input type="tel" placeholder="Téléphone" value={loanForm.sellerPhone} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { sellerPhone: e.target.value }))}/>
              <select value={loanForm.region} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { region: e.target.value }))}>
                <option value="">Sélectionnez une région</option>
                {SENEGAL_REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
              <input type="text" placeholder="Village" value={loanForm.village} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { village: e.target.value }))}/>
              <input type="number" placeholder="Montant (FCFA) *" value={loanForm.amount} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { amount: e.target.value }))} style={{ color: '#10b981', fontWeight: 700 }}/>
              <select value={loanForm.duration} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { duration: e.target.value }))}>
                {[3, 6, 12, 18, 24, 36].map(m => <option key={m} value={m}>{m} mois</option>)}
              </select>
              <select value={loanForm.purpose} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { purpose: e.target.value }))}>
                <option value="">Motif *</option>
                <option>Achat semences</option>
                <option>Matériel agricole</option>
                <option>Irrigation</option>
                <option>Stockage</option>
                <option>Transport</option>
              </select>
              <textarea placeholder="Description" value={loanForm.description} onChange={e => setLoanForm(Object.assign(Object.assign({}, loanForm), { description: e.target.value }))} rows={3} style={{ resize: 'vertical' }}/>
              <button onClick={createLoan} className="btn-primary" style={{ marginTop: 6, justifyContent: 'center', padding: '12px 20px' }}><lucide_react_1.Check size={14}/> Enregistrer</button>
            </div>
          </div>
        </div>)}

    </AdminGuard_1.AdminGuard>);
}
