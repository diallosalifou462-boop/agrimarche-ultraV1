'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { AdminGuard } from "@/components/AdminGuard";
import { apiUrl } from "@/lib/api-config";
import { computeDisplayPrice, computeAdminMargin, inferBasePrice, ADMIN_MARGIN_RATE } from "@/lib/pricing";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  UserCheck, X, Truck, TrendingUp, TrendingDown, RefreshCw,
  Download, Bell, Search, ChevronLeft, ChevronRight,
  LayoutDashboard, Package, Users, Leaf, Banknote, Map as MapIcon,
  MessageSquare, Settings, LogOut, Plus, Eye, Check, Ban, Zap,
  BellRing, Volume2, VolumeX, Brain, Sparkles, Shield, Award, Star,
  Clock, DollarSign, Percent, Calendar, Phone, Mail, MapPin,
  CreditCard, Wallet, Target, AlertTriangle, CheckCircle, XCircle,
  HelpCircle, Menu, Moon, Sun, Monitor, Database, Cloud, Server, Megaphone,
  ShieldCheck, Fingerprint, Key, Lock, Unlock, Gift, Heart, ThumbsUp,
  Send, Globe, Pencil, Trash2, Loader2, ImagePlus, RadioTower,
  Filter, ArrowUpDown, PackageX, Layers, Smartphone, History
} from "lucide-react";
import { db, auth } from "@/lib/firebase/firebase";
import {
  collection, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, Timestamp, addDoc, serverTimestamp,
  writeBatch, where, getDocs, getDoc, setDoc, limit,
  startAfter, increment, collectionGroup
} from "firebase/firestore";
import {
  signOut
} from "firebase/auth";
import { useFCMToken } from "@/hooks/useFCMToken"; // ⚠️ ajuste ce chemin vers l'emplacement réel de ton hook useFCMToken
import { notifyUser } from "@/lib/notifications/notifyUser";
import { categoryLink } from "@/lib/categoryLink";
import { OrderStatus, ORDER_STATUS_CONFIG, normalizeStatus, statusTint } from "@/lib/orderStatus";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, ComposedChart, Scatter
} from "recharts";

// ============================================================
// INTERFACE CODES D'ACCÈS IA
// ============================================================

interface AccessCode {
  id: string;
  days: number;
  used: boolean;
  usedBy: string;
  usedAt: Timestamp | null;
  expiresAt: Timestamp;
  createdAt: Timestamp;
}

// ============================================================
// CONSTANTES MÉTIER
// ============================================================

const COMMISSION_RATE = 0.02;
const SENEGAL_REGIONS = [
  "Dakar", "Thiès", "Saint-Louis", "Diourbel", "Louga", "Fatick",
  "Kaolack", "Kaffrine", "Tambacounda", "Kédougou", "Ziguinchor",
  "Sédhiou", "Kolda", "Matam"
] as const;

type SenegalRegion = typeof SENEGAL_REGIONS[number];

const REGION_INFO: Record<SenegalRegion, { emoji: string; description: string; color: string }> = {
  "Dakar":       { emoji: "🏙️", description: "Capitale, pôle économique principal", color: "#10b981" },
  "Thiès":       { emoji: "🌾", description: "Centre agricole et industriel", color: "#06b6d4" },
  "Saint-Louis": { emoji: "🎨", description: "Ville historique du Nord", color: "#8b5cf6" },
  "Diourbel":    { emoji: "🕌", description: "Coeur du bassin arachidier", color: "#f59e0b" },
  "Louga":       { emoji: "🌵", description: "Zone sahélienne", color: "#ec4899" },
  "Fatick":      { emoji: "🦩", description: "Delta du Saloum, biodiversité", color: "#14b8a6" },
  "Kaolack":     { emoji: "🏭", description: "Hub commercial du centre", color: "#f97316" },
  "Kaffrine":    { emoji: "🌱", description: "Région agricole émergente", color: "#84cc16" },
  "Tambacounda": { emoji: "🦁", description: "Grand Est, porte du Sahel", color: "#ef4444" },
  "Kédougou":    { emoji: "⛏️", description: "Zone minière et forestière", color: "#a78bfa" },
  "Ziguinchor":  { emoji: "🌿", description: "Casamance, forêt et cultures", color: "#34d399" },
  "Sédhiou":     { emoji: "🌊", description: "Casamance intérieure", color: "#60a5fa" },
  "Kolda":       { emoji: "🐄", description: "Élevage et agriculture", color: "#fb923c" },
  "Matam":       { emoji: "🏜️", description: "Vallée du fleuve Sénégal", color: "#e879f9" },
};

const BANKS = [
  { name: "BOA Sénégal",  rate: 8.5,  maxAmount: 10000000, minDuration: 6,  maxDuration: 60, fees: 50000, logo: "🏦", color: "#00ff87" },
  { name: "Ecobank",      rate: 9.0,  maxAmount: 8000000,  minDuration: 12, maxDuration: 48, fees: 35000, logo: "🌍", color: "#00e5ff" },
  { name: "BICIS",        rate: 9.5,  maxAmount: 5000000,  minDuration: 3,  maxDuration: 36, fees: 25000, logo: "🇫🇷", color: "#c77dff" },
  { name: "CBAO",         rate: 10.0, maxAmount: 3000000,  minDuration: 6,  maxDuration: 24, fees: 15000, logo: "🏛️", color: "#f5c842" },
  { name: "La Poste",     rate: 8.0,  maxAmount: 1000000,  minDuration: 3,  maxDuration: 12, fees: 10000, logo: "📮", color: "#f97316" }
];

// ============================================================
// INTERFACES
// ============================================================

interface Order {
  id?: string;
  orderNumber: string;
  // ⚠️ Champs legacy : plus jamais renseignés par checkout/page.tsx (qui écrit
  // userName/sellerId/sellerRegion/items[] à la place). Gardés ici uniquement
  // pour ne rien casser si un ancien document Firestore les possède encore ;
  // ne JAMAIS les lire pour afficher une vraie commande — voir les champs
  // "réels" juste en dessous.
  farmer: string;
  farmerId: string;
  farmerPhone: string;
  category: string;
  region: string;
  qty: number;
  time: string;
  // ── Champs réellement écrits par checkout/page.tsx (createOrder) ──────────
  sellerId?: string;
  sellerName?: string;
  sellerPhone?: string;
  sellerRegion?: string;
  userId?: string;
  userName?: string;
  items?: { productId: string; productName: string; productPrice: number; quantity: number; unit: string; total: number; category?: string }[];
  amount: number;
  status: 'en_attente' | 'en_preparation' | 'en_livraison' | 'livre' | 'annule';
  createdAt: Timestamp;
  delivererId?: string;
  delivererName?: string;
  delivererPhone?: string;
  delivererAssignedAt?: Timestamp;
  // ⚠️ Ajoutés pour l'onglet "Livreurs" : ces champs existaient déjà dans
  // les documents Firestore (deliveryFee écrit par checkout/page.tsx,
  // deliveredAt écrit par delivery/dashboard/page.tsx::markAsDelivered)
  // mais n'étaient pas déclarés ici, donc invisibles/non typés côté admin.
  deliveryFee?: number;
  deliveredAt?: Timestamp;
  paymentMethod?: 'wave' | 'orange' | 'free' | 'card';
  paymentStatus?: 'pending' | 'paid' | 'failed';
  commission?: number;
  // Parcours de suivi hybride (voir functions/src/index.ts et
  // delivery/dashboard/page.tsx) — écrit par assignDelivery ci-dessous et
  // par le livreur lui-même, jusqu'ici jamais déclaré ni affiché côté admin.
  tracking?: { phase?: 'assigned' | 'en_route' | 'approaching' | 'arrived' };
}

interface UserProfile {
  id?: string;
  uid: string;
  displayName: string;
  email: string;
  phone: string;
  role: 'client' | 'seller' | 'admin' | 'delivery';
  region: string;
  createdAt: Timestamp;
  vehicle?: string;
  isAvailable?: boolean;
  xp?: number;
  level?: number;
  fcmTokens?: string[];
  avatar?: string;
}

interface Product {
  id?: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  region: string;
  sellerId: string;
  sellerName: string;
  createdAt: Timestamp;
  images?: string[];
  description?: string;
  unit?: string;
  minOrder?: number;
}

interface Loan {
  id?: string;
  sellerId: string;
  sellerName: string;
  sellerPhone: string;
  amount: number;
  duration: number;
  monthlyPayment: number;
  interestRate: number;
  totalToRepay: number;
  remainingBalance: number;
  purpose: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'active' | 'paid' | 'defaulted';
  createdAt: Timestamp;
  approvedBy?: string;
  approvedAt?: Timestamp;
  paidAt?: Timestamp;
  region?: string;
  village?: string;
}

interface AppNotification {
  id?: string;
  userId: string;
  type: 'order' | 'price' | 'message' | 'delivery' | 'alert' | 'loan' | 'promotion' | 'system';
  title: string;
  body: string;
  icon: string;
  deepLink: string;
  urgent: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  read: boolean;
  createdAt: Timestamp;
  metadata?: Record<string, any>;
}

// Avis client sur un vendeur (écrit par src/app/review/page.tsx après une
// commande livrée). Vue admin ajoutée pour repérer les vendeurs mal notés.
interface Review {
  id: string;
  orderId?: string;
  sellerId: string;
  sellerName?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  rating: number;
  comment?: string;
  productNames?: string[];
  createdAt?: Timestamp;
}


// Broadcast notification form state
interface BroadcastForm {
  title: string;
  body: string;
  icon: string;
  type: AppNotification['type'];
  priority: AppNotification['priority'];
  urgent: boolean;
  targetRole: 'all' | 'client' | 'seller' | 'admin' | 'delivery';
  targetRegion: string;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
  };
  deepLink: string;
}

// ============================================================
// CLASSES IA
// ============================================================

class CreditScoringAI {
  private weights: number[][];
  private bias: number[];

  constructor() {
    this.weights = [];
    this.bias = [];
    this.initializeWeights();
  }

  private initializeWeights() {
    for (let i = 0; i < 12; i++) {
      this.weights.push(new Array(6).fill(0).map(() => (Math.random() * 2 - 1) * 0.1));
    }
    this.bias = new Array(12).fill(0).map(() => (Math.random() * 2 - 1) * 0.1);
  }

  private sigmoid(x: number): number {
    return 1 / (1 + Math.exp(-x));
  }

  calculateScore(features: {
    monthlyIncome: number;
    existingDebts: number;
    ordersCount: number;
    onTimePayments: number;
    accountAgeMonths: number;
    hasCollateral: boolean;
  }): { score: number; rating: string; maxLoan: number; interestRate: number; recommendations: string[] } {
    const inputs = [
      Math.min(1, features.monthlyIncome / 1000000),
      Math.min(1, features.existingDebts / Math.max(1, features.monthlyIncome)),
      Math.min(1, features.ordersCount / 50),
      features.onTimePayments / Math.max(1, features.ordersCount),
      Math.min(1, features.accountAgeMonths / 24),
      features.hasCollateral ? 1 : 0
    ];

    const hiddenOutput: number[] = [];
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
    let recommendations: string[] = [];

    if (score >= 850) {
      rating = '⭐⭐⭐⭐⭐ (Excellent)';
      maxLoan = 10000000;
      interestRate = 8;
      recommendations = ['✅ Taux préférentiel 8%', '🏆 Financement jusqu\'à 10M FCFA', '✨ Délai de réponse 24h'];
    } else if (score >= 750) {
      rating = '⭐⭐⭐⭐ (Très bon)';
      maxLoan = 5000000;
      interestRate = 9.5;
      recommendations = ['📊 Taux 9.5%', '💼 Financement jusqu\'à 5M FCFA', '📝 Documents simplifiés'];
    } else if (score >= 650) {
      rating = '⭐⭐⭐ (Bon)';
      maxLoan = 2500000;
      interestRate = 11;
      recommendations = ['📈 Taux 11%', '💰 Financement jusqu\'à 2.5M FCFA', '🤝 Caution éventuelle'];
    } else if (score >= 500) {
      rating = '⭐⭐ (Moyen)';
      maxLoan = 1000000;
      interestRate = 13;
      recommendations = ['📉 Taux 13%', '💵 Financement jusqu\'à 1M FCFA', '🏦 Garantie recommandée'];
    } else {
      rating = '⭐ (À améliorer)';
      maxLoan = 300000;
      interestRate = 16;
      recommendations = ['🔨 Améliorez votre historique d\'achats', '📅 Payez vos commandes à temps', '📈 Revenez dans 3 mois'];
    }

    return { score, rating, maxLoan, interestRate, recommendations };
  }
}

class LoanCalculator {
  static calculateMonthlyPayment(amount: number, annualRate: number, months: number): number {
    const monthlyRate = annualRate / 100 / 12;
    if (monthlyRate === 0) return amount / months;
    const annuity = monthlyRate * Math.pow(1 + monthlyRate, months);
    const denominator = Math.pow(1 + monthlyRate, months) - 1;
    return amount * annuity / denominator;
  }

  static generateAmortizationTable(amount: number, annualRate: number, months: number): any[] {
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

  static compareBanks(amount: number, duration: number): { bestBank: any; offers: any[] } {
    const eligibleBanks = BANKS.filter(bank =>
      amount <= bank.maxAmount &&
      duration >= bank.minDuration &&
      duration <= bank.maxDuration
    );

    const offers = eligibleBanks.map(bank => {
      const monthlyPayment = this.calculateMonthlyPayment(amount, bank.rate, duration);
      const totalPayment = monthlyPayment * duration;
      const totalInterest = totalPayment - amount;
      const totalCost = totalInterest + bank.fees;
      return {
        ...bank,
        monthlyPayment: Math.round(monthlyPayment),
        totalPayment: Math.round(totalPayment),
        totalInterest: Math.round(totalInterest),
        totalCost: Math.round(totalCost)
      };
    }).sort((a, b) => a.monthlyPayment - b.monthlyPayment);

    return { bestBank: offers[0] ?? null, offers };
  }
}

class PricePredictor {
  static predict(historicalPrices: number[], days = 7): {
    predictions: number[];
    trend: 'up' | 'down' | 'stable';
    confidence: number;
    seasonality: number;
  } {
    if (historicalPrices.length < 5) {
      const last = historicalPrices[historicalPrices.length - 1] ?? 0;
      return { predictions: new Array(days).fill(last), trend: 'stable', confidence: 50, seasonality: 0 };
    }

    const ma7  = historicalPrices.slice(-7).reduce((a, b) => a + b, 0)  / Math.min(7,  historicalPrices.length);
    const ma30 = historicalPrices.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, historicalPrices.length);
    const trend: 'up' | 'down' | 'stable' = ma7 > ma30 ? 'up' : ma7 < ma30 ? 'down' : 'stable';
    const confidence   = Math.min(95, Math.abs((ma7 - ma30) / ma30) * 100 + 50);
    const seasonality  = Math.abs(ma7 - ma30) / ma30;
    const lastPrice    = historicalPrices[historicalPrices.length - 1];

    const predictions = Array.from({ length: days }, (_, i) => {
      const factor =
        trend === 'up'   ? 1 + (i + 1) * 0.01 * seasonality :
        trend === 'down' ? 1 - (i + 1) * 0.01 * seasonality : 1;
      return Math.round(lastPrice * factor);
    });

    return { predictions, trend, confidence, seasonality };
  }

  static detectAnomalies(orders: Order[]): { orderNumber: string; amount: number; reason: string; severity: 'low' | 'medium' | 'high' }[] {
    if (orders.length < 10) return [];
    const amounts = orders.map(o => o.amount ?? 0).filter(a => a > 0);
    const mean    = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev  = Math.sqrt(amounts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / amounts.length);
    const threshold     = mean + 2 * stdDev;
    const highThreshold = mean + 3 * stdDev;

    return orders.filter(o => (o.amount ?? 0) > threshold).map(o => ({
      orderNumber: o.orderNumber,
      amount: o.amount ?? 0,
      reason: `Montant anormalement élevé (${Math.round((o.amount ?? 0) / mean * 100)}% au-dessus de la moyenne)`,
      severity: ((o.amount ?? 0) > highThreshold ? 'high' : 'medium') as 'low' | 'medium' | 'high'
    }));
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
  @keyframes broadcastRing {
    0%   { transform:scale(1);   opacity:.6; }
    100% { transform:scale(2.4); opacity:0;  }
  }
  @keyframes towerGlow {
    0%,100% { filter:drop-shadow(0 0 4px rgba(245,158,11,.35)); }
    50%     { filter:drop-shadow(0 0 14px rgba(245,158,11,.85)); }
  }
  @keyframes phoneRise {
    from { opacity:0; transform:translateY(16px) scale(.96); }
    to   { opacity:1; transform:translateY(0) scale(1); }
  }
  @keyframes notchBlink { 0%,100%{opacity:1} 50%{opacity:.3} }
  @keyframes haloSpin   { to { transform:rotate(360deg); } }
  @keyframes shimmerSweep {
    0%   { background-position:0% 50%; }
    100% { background-position:200% 50%; }
  }
  @keyframes celestialPulse {
    0%,100% { box-shadow:0 0 0 0 rgba(212,175,55,.0), 0 20px 60px rgba(0,0,0,.35); }
    50%     { box-shadow:0 0 0 6px rgba(212,175,55,.08), 0 20px 70px rgba(212,175,55,.15); }
  }
  @keyframes sparkleFloat {
    0%   { transform:translateY(6px) scale(.6); opacity:0; }
    30%  { opacity:1; }
    100% { transform:translateY(-38px) scale(1); opacity:0; }
  }
  @keyframes ringExpand {
    0%   { transform:scale(.85); opacity:.5; }
    100% { transform:scale(1.5); opacity:0; }
  }
  @keyframes cardSheen {
    0%   { transform:translateX(-120%) skewX(-12deg); }
    100% { transform:translateX(220%) skewX(-12deg); }
  }
  .divine-shimmer-text {
    background-size:200% auto; animation:shimmerSweep 3.5s linear infinite;
  }
  .divine-halo { animation:haloSpin 9s linear infinite; }
  .divine-hero { animation:celestialPulse 4.5s ease-in-out infinite; }
  .divine-sparkle { position:absolute; border-radius:50%; pointer-events:none; animation:sparkleFloat 3.2s ease-in infinite; }
  .divine-card { position:relative; overflow:hidden; transition:transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s ease, border-color .35s ease; }
  .divine-card:hover { transform:translateY(-4px) scale(1.008); }
  .divine-card::after {
    content:''; position:absolute; top:0; left:0; width:38%; height:100%;
    background:linear-gradient(100deg,transparent,rgba(255,255,255,.10),transparent);
    transform:translateX(-120%) skewX(-12deg); pointer-events:none;
  }
  .divine-card:hover::after { animation:cardSheen 1.1s ease; }
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

// Statuts de commande (en_attente / en_preparation / en_livraison / livre / annule) :
// couleurs, icônes et libellés viennent de @/lib/orderStatus, la source unique
// partagée avec seller-orders-page.tsx et delivery-dashboard-page.tsx.
// Les statuts ci-dessous (prêts, notifications) sont spécifiques à l'admin.
const NON_ORDER_STATUS: Record<string, { bg: string; color: string; icon: string }> = {
  'pending':    { bg: 'rgba(245,158,11,.1)',  color: '#f59e0b', icon: '⏳' },
  'approved':   { bg: 'rgba(16,185,129,.1)',  color: '#10b981', icon: '✅' },
  'rejected':   { bg: 'rgba(239,68,68,.1)',   color: '#ef4444', icon: '❌' },
  'active':     { bg: 'rgba(6,182,212,.1)',   color: '#06b6d4', icon: '🔄' },
  'paid':       { bg: 'rgba(16,185,129,.1)',  color: '#10b981', icon: '💰' },
  'defaulted':  { bg: 'rgba(239,68,68,.1)',   color: '#ef4444', icon: '⛔' },
};
const ORDER_STATUS_KEYS = new Set(['en_attente', 'en_preparation', 'en_livraison', 'livre', 'annule']);

const StatusBadge = ({ status }: { status: string }) => {
  if (ORDER_STATUS_KEYS.has(status)) {
    const cfg = ORDER_STATUS_CONFIG[status as OrderStatus];
    return (
      <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:statusTint(status, 0.1), color:cfg.color }}>
        {cfg.icon} {cfg.label}
      </span>
    );
  }
  const c = NON_ORDER_STATUS[status] ?? { bg: 'rgba(107,114,128,.1)', color: '#6b7280', icon: '📌' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:c.bg, color:c.color }}>
      {c.icon} {status}
    </span>
  );
};

// Palette déterministe par catégorie — même catégorie ⇒ même couleur/emoji,
// pour repérer un type de produit d'un coup d'œil dans la grille admin.
const CATEGORY_STYLES: { color: string; emoji: string }[] = [
  { color:'#10b981', emoji:'🌿' }, { color:'#f59e0b', emoji:'🍊' },
  { color:'#06b6d4', emoji:'🐟' }, { color:'#8b5cf6', emoji:'🚜' },
  { color:'#ec4899', emoji:'🌾' }, { color:'#ef4444', emoji:'🥩' },
  { color:'#eab308', emoji:'🌽' }, { color:'#14b8a6', emoji:'🥬' },
];
const categoryStyle = (category?: string) => {
  const key = category || '—';
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CATEGORY_STYLES[hash % CATEGORY_STYLES.length];
};

const StatCard = ({ icon, label, value, change, color }: { icon: React.ReactNode; label: string; value: number; change?: number; color: string }) => (
  <div className="divine-card" style={{
    position:'relative', padding:20, borderRadius:20, overflow:'hidden',
    background:`linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015)), linear-gradient(135deg,rgba(17,19,23,.95),rgba(10,12,16,.98))`,
    border:'1px solid rgba(255,255,255,0.08)', transition:'all .3s ease',
  }}>
    <div style={{ position:'absolute', top:-40, right:-40, width:120, height:120, borderRadius:'50%', background:`radial-gradient(circle,${color}33,transparent 70%)`, pointerEvents:'none' }}/>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, position:'relative', zIndex:1 }}>
      <div style={{ width:42, height:42, borderRadius:13, background:`${color}22`, border:`1px solid ${color}40`, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:`0 4px 16px ${color}30` }}>
        {icon}
      </div>
      {change !== undefined && (
        <span style={{ fontSize:11, fontWeight:600, color:change>=0?'#10b981':'#ef4444', background:`${change>=0?'#10b981':'#ef4444'}15`, padding:'3px 9px', borderRadius:20, border:`1px solid ${change>=0?'#10b981':'#ef4444'}30` }}>
          {change>=0?'▲ +':'▼ '}{change}%
        </span>
      )}
    </div>
    <div style={{ fontSize:28, fontWeight:800, marginBottom:4, position:'relative', zIndex:1, textShadow:`0 0 24px ${color}30` }}>{value?.toLocaleString?.() ?? 0}</div>
    <div style={{ fontSize:12, color:'#8b93a1', position:'relative', zIndex:1, letterSpacing:0.2 }}>{label}</div>
  </div>
);

// ============================================================
// UTILITAIRE : COMPRESSION IMAGE CANVAS (upload rapide)
// Réduit une image à max 1200px et qualité 0.82 avant Firebase Storage.
// Gain typique : 2 Mo → 150-300 Ko, upload 5-10x plus rapide.
// ============================================================

async function uploadToCloudinary(blob: Blob, publicId: string): Promise<{ url: string; publicId: string }> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error('Config Cloudinary manquante (NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME / _UPLOAD_PRESET)');
  }
  const formData = new FormData();
  formData.append('file', blob, 'image.jpg');
  formData.append('upload_preset', uploadPreset);
  formData.append('public_id', publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message || `Upload Cloudinary échoué (${res.status})`);
  }
  const data = await res.json();
  return { url: data.secure_url as string, publicId: data.public_id as string };
}

function compressImage(file: File, maxDim = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) { height = Math.round((height * maxDim) / width); width = maxDim; }
        else                 { width  = Math.round((width  * maxDim) / height); height = maxDim; }
      }
      const canvas = document.createElement('canvas');
      canvas.width  = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('Canvas non disponible')); return; }
      ctx.drawImage(img, 0, 0, width, height);
      // Conserve WebP si supporté, sinon JPEG
      const outType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('Compression échouée')),
        outType,
        quality,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Image illisible')); };
    img.src = objectUrl;
  });
}

// ============================================================
// PUSH FCM — moteur d'envoi robuste
// Concurrence limitée + retry automatique + purge des tokens morts,
// pour garder les envois rapides et la base de tokens propre au fil du temps.
// ============================================================

type PushTarget = { token: string; ref: ReturnType<typeof doc> };

async function sendPushBatched(
  targets: PushTarget[],
  payload: { title: string; body: string; deepLink: string; urgent: boolean; imageUrl?: string },
  apiUrlFn: (path: string) => string,
  opts: { concurrency?: number; maxRetries?: number } = {}
): Promise<{ successCount: number; failureCount: number; deadRefs: ReturnType<typeof doc>[] }> {
  const CHUNK_SIZE = 500; // limite FCM multicast
  const concurrency = opts.concurrency ?? 8;
  const maxRetries = opts.maxRetries ?? 2;

  const chunks: PushTarget[][] = [];
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) chunks.push(targets.slice(i, i + CHUNK_SIZE));

  let successCount = 0;
  let failureCount = 0;
  const deadRefs: ReturnType<typeof doc>[] = [];

  const sendChunk = async (chunk: PushTarget[], attempt = 0): Promise<void> => {
    try {
      const res = await fetch(apiUrlFn('/api/send-push'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokens: chunk.map(c => c.token), ...payload }),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        successCount += data?.successCount ?? chunk.length;
        failureCount += data?.failureCount ?? 0;
        // Tokens explicitement invalides/désinscrits renvoyés par l'API (si le
        // backend les fournit) → on les marque pour suppression Firestore.
        const dead: string[] = data?.invalidTokens ?? data?.deadTokens ?? [];
        if (Array.isArray(dead) && dead.length) {
          const deadSet = new Set(dead);
          chunk.forEach(c => { if (deadSet.has(c.token)) deadRefs.push(c.ref); });
        }
        return;
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt))); // backoff exponentiel
        return sendChunk(chunk, attempt + 1);
      }
      failureCount += chunk.length;
    } catch {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 600 * Math.pow(2, attempt)));
        return sendChunk(chunk, attempt + 1);
      }
      failureCount += chunk.length;
    }
  };

  // Pool à concurrence limitée : N chunks en vol simultanément max,
  // pour paralléliser sans saturer l'API/le réseau.
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, chunks.length) || 1 }, async () => {
    while (idx < chunks.length) {
      const my = idx++;
      await sendChunk(chunks[my]);
    }
  });
  await Promise.all(workers);

  return { successCount, failureCount, deadRefs };
}

// Supprime les tokens FCM morts (désinstallés/invalides) — best effort, non
// bloquant : ne doit jamais faire échouer l'envoi si la purge rate.
function pruneDeadTokens(deadRefs: ReturnType<typeof doc>[]) {
  if (deadRefs.length === 0) return;
  Promise.all(deadRefs.map(ref => deleteDoc(ref).catch(() => {}))).catch(() => {});
}

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function AdminDashboard() {
  const router = useRouter();
  const { user: authUser } = useAuth();

  // ── UI STATE ──────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [activeTab, setActiveTab]           = useState('dashboard');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [currentPage, setCurrentPage]       = useState(0);
  const pageSize = 10;

  // ── ONGLET UTILISATEURS ──────────────────────────────────
  // ⚠️ Volontairement des états DÉDIÉS (pas `searchQuery`/`statusFilter`/
  // `currentPage`, qui pilotent déjà le tableau Commandes) : ces deux
  // tableaux vivant dans le même composant, réutiliser les mêmes states
  // aurait fait sauter le filtre/la page de l'un dès qu'on touche l'autre
  // en changeant d'onglet.
  const [userSearch, setUserSearch]         = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userSort, setUserSort]             = useState<'recent' | 'name' | 'role'>('recent');
  const [userPage, setUserPage]             = useState(0);
  const userPageSize = 15;

  // ── MODALS ────────────────────────────────────────────────
  const [selectedUser, setSelectedUser]     = useState<UserProfile | null>(null);
  const [selectedLoan, setSelectedLoan]     = useState<Loan | null>(null);
  const [showLoanForm, setShowLoanForm]     = useState(false);
  const [showAssignModal, setShowAssignModal]   = useState(false);
  const [assignOrderId, setAssignOrderId]   = useState<string | null>(null);
  const [assignOrderNumber, setAssignOrderNumber] = useState('');

  // ── LOAN FORM ─────────────────────────────────────────────
  const [loanForm, setLoanForm] = useState({
    sellerName:'', sellerPhone:'', region:'', village:'', purpose:'', amount:'', duration:'12', description:''
  });

  // ── BROADCAST FORM ────────────────────────────────────────
  const defaultBroadcast: BroadcastForm = {
    title:'', body:'', icon:'🔔',
    type:'system', priority:'medium', urgent:false,
    targetRole:'all', targetRegion:'all',
    channels:{ inApp:true, email:false, push:false, sms:false },
    deepLink:''
  };
  // ── ADS STATE ──
  const [ads, setAds] = useState<any[]>([]);
  const [adForm, setAdForm] = useState({ title: '', subtitle: '', badge: '', imageUrl: '', linkUrl: '', placement: 'banner', active: true, priority: 0 });
  const [adSaving, setAdSaving] = useState(false);
  const [adsSubTab, setAdsSubTab] = useState<'promotions' | 'publicites'>('promotions');

  // ── PROMOTION FORM (product-based, Jumia-style) ──
  const [promoForm, setPromoForm] = useState({
    productId: '',
    discountPercent: 20,
    badge: '🔥 PROMO',
    placement: 'banner',
    active: true,
    priority: 0,
  });
  const [promoSaving, setPromoSaving] = useState(false);
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);

  // ── PUBLICITE FORM (image upload Firebase Storage) ──
  const [pubForm, setPubForm] = useState({
    title: '',
    partnerName: '',
    imageFile: null as File | null,
    imagePreview: '',
    imageUrl: '',
    linkUrl: '',
    placement: 'banner',
    active: true,
    priority: 0,
  });
  const [pubUploading, setPubUploading] = useState(false);
  const [pubSaving, setPubSaving] = useState(false);
  const [editingPubId, setEditingPubId] = useState<string | null>(null);
  const [editingPubOldPath, setEditingPubOldPath] = useState<string | null>(null);

  const [broadcastForm, setBroadcastForm]   = useState<BroadcastForm>(defaultBroadcast);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastHistory, setBroadcastHistory] = useState<any[]>([]);
  const [broadcastMode, setBroadcastMode]   = useState<'filter' | 'manual'>('filter');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [userPickerSearch, setUserPickerSearch] = useState('');

  // ── DATA ──────────────────────────────────────────────────
  const [orders, setOrders]                 = useState<Order[]>([]);
  const [users, setUsers]                   = useState<UserProfile[]>([]);
  const [products, setProducts]             = useState<Product[]>([]);
  // Prix vendeur (basePrice) par id produit — alimenté par la sous-collection
  // privée `productPricing`, lisible admin uniquement. Jamais mélangé à `Product`.
  const [pricingByProduct, setPricingByProduct] = useState<Record<string, number>>({});
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  // NB: le champ "basePrice" de ce formulaire est le prix VENDEUR (celui qu'il
  // reçoit) — c'est ce que l'admin édite. Le prix affiché partout ailleurs
  // dans l'app (price = basePrice + marge plateforme) est recalculé
  // automatiquement à l'enregistrement, voir saveProductEdit().
  const [productEditForm, setProductEditForm] = useState<{ name: string; category: string; basePrice: number; region: string; stock: number }>({ name: '', category: '', basePrice: 0, region: '', stock: 0 });
  const [productSaving, setProductSaving]   = useState(false);
  const [productSearchQuery, setProductSearchQuery]   = useState('');
  const [productCategoryFilter, setProductCategoryFilter] = useState('all');
  const [productSort, setProductSort] = useState<'name'|'stock-asc'|'stock-desc'|'price-asc'|'price-desc'>('name');
  const [loans, setLoans]                   = useState<Loan[]>([]);
  const [deliveryPersons, setDeliveryPersons] = useState<UserProfile[]>([]);
  const [notifications, setNotifications]   = useState<AppNotification[]>([]);
  const [allNotifications, setAllNotifications] = useState<AppNotification[]>([]);
  // ✅ Nouveau : avis clients, tous vendeurs confondus — pour repérer les
  // vendeurs mal notés (aucune vue admin n'existait avant sur `reviews`).
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewSellerFilter, setReviewSellerFilter] = useState<string>('all');
  const [deletingReviewId, setDeletingReviewId] = useState<string | null>(null);
  const [loading, setLoading]               = useState(true);
  const [lastSync, setLastSync]             = useState(new Date());
  const [unreadCount, setUnreadCount]       = useState(0);

  // ── DIRECT MESSAGE ────────────────────────────────────────
  const [dmSearch, setDmSearch]             = useState('');
  const [dmTarget, setDmTarget]             = useState<UserProfile | null>(null);
  const [dmForm, setDmForm]                 = useState({ title:'', body:'', icon:'💬', type:'message' as AppNotification['type'], priority:'medium' as AppNotification['priority'], urgent:false });
  const [dmSending, setDmSending]           = useState(false);

  // ── PUSH À TOUS LES TOKENS ─────────────────────────────────
  const [pushAllForm, setPushAllForm]       = useState({ title:'', body:'', icon:'📢', deepLink:'', urgent:false, imageUrl:'' });
  const [pushAllSending, setPushAllSending] = useState(false);
  const [pushAllImageUploading, setPushAllImageUploading] = useState(false);
  const [pushTokenCount, setPushTokenCount] = useState<number | null>(null);
  const [pushAllResult, setPushAllResult]   = useState<{ count: number; fail: number } | null>(null);
  const [pushAllDisplayCount, setPushAllDisplayCount] = useState(0);

  // ── 🤖 PROMOTION IA AUTOMATIQUE (produits sans commande) ────
  const [aiPromoSettings, setAiPromoSettings] = useState({
    enabled: false, thresholdHours: 48, cooldownDays: 7, maxPerRun: 8, scope: 'region' as 'all' | 'region',
  });
  const [aiPromoLoading, setAiPromoLoading]   = useState(true);
  const [aiPromoSaving, setAiPromoSaving]     = useState(false);
  const [aiPromoHistory, setAiPromoHistory]   = useState<any[]>([]);
  const [aiPromoRunning, setAiPromoRunning]   = useState(false);

  // ── Notifications automatiques (sans cron — voir /api/products/check-stock
  // et /api/system/periodic-checks) ──────────────────────────────────────
  const [lowStockSettings, setLowStockSettings] = useState({
    enabled: false, threshold: 5, cooldownHours: 24,
  });
  const [lowStockLoading, setLowStockLoading] = useState(true);
  const [lowStockSaving, setLowStockSaving]   = useState(false);
  const [lowStockHistory, setLowStockHistory] = useState<any[]>([]);

  const [pendingOrdersSettings, setPendingOrdersSettings] = useState({
    enabled: false, thresholdHours: 6, cooldownHours: 6, escalateAfterHours: 24, maxPerRun: 50,
  });
  const [pendingOrdersLoading, setPendingOrdersLoading] = useState(true);
  const [pendingOrdersSaving, setPendingOrdersSaving]   = useState(false);
  const [pendingOrdersHistory, setPendingOrdersHistory] = useState<any[]>([]);

  const [inactiveClientsSettings, setInactiveClientsSettings] = useState({
    enabled: false, thresholdDays: 30, cooldownDays: 14, maxPerRun: 100,
  });
  const [inactiveClientsLoading, setInactiveClientsLoading] = useState(true);
  const [inactiveClientsSaving, setInactiveClientsSaving]   = useState(false);
  const [inactiveClientsHistory, setInactiveClientsHistory] = useState<any[]>([]);

  const [periodicChecksRunning, setPeriodicChecksRunning] = useState(false);

  // ── IA ────────────────────────────────────────────────────
  const [creditScoringAI]                   = useState(new CreditScoringAI());
  const [anomalies, setAnomalies]           = useState<any[]>([]);
  const [pricePredictions, setPricePredictions] = useState<ReturnType<typeof PricePredictor.predict> | null>(null);
  const [loanSimulation, setLoanSimulation] = useState<ReturnType<typeof LoanCalculator.compareBanks> | null>(null);
  const [loanSimAmount, setLoanSimAmount]   = useState(500000);
  const [loanSimDuration, setLoanSimDuration] = useState(12);
  const [amortizationTable, setAmortizationTable] = useState<any[]>([]);

  // ── DEEPSEEK AI ASSISTANT ─────────────────────────────────
  interface ChatMessage { role: 'user' | 'assistant'; content: string; ts: number; }
  const [aiMessages, setAiMessages]         = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput]               = useState('');
  const [aiLoading, setAiLoading]           = useState(false);
  const [aiModel, setAiModel]               = useState<'deepseek-chat' | 'deepseek-reasoner'>('deepseek-chat');
  const aiEndRef                            = useRef<HTMLDivElement>(null);

  // ── CODES D'ACCÈS IA ──────────────────────────────────────
  const [accessCodes, setAccessCodes]         = useState<AccessCode[]>([]);
  const [loadingCodes, setLoadingCodes]       = useState(false);
  const [generatingCodes, setGeneratingCodes] = useState(false);
  const [newCodes, setNewCodes]               = useState<string[]>([]);
  const [codeCount, setCodeCount]             = useState(5);
  const [codeDays, setCodeDays]               = useState(30);
  const [codesTab, setCodesTab]               = useState<'unused' | 'used'>('unused');

  // ── MÉTÉO ─────────────────────────────────────────────────
  const [weatherData, setWeatherData]       = useState<Record<string, any>>({});
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError]     = useState<string | null>(null);
  const [weatherRegion, setWeatherRegion]   = useState<SenegalRegion>('Dakar');
  const [weatherAdvice, setWeatherAdvice]   = useState<Record<string, string>>({});
  const [weatherAdviceLoading, setWeatherAdviceLoading] = useState<Record<string, boolean>>({});

  // ── RÉGIONS (onglet admin) ──────────────────────────────────
  const [regionSearch, setRegionSearch] = useState('');
  const [regionSort, setRegionSort]     = useState<'revenue' | 'orders' | 'users' | 'products' | 'name'>('revenue');
  const [showInactiveRegions, setShowInactiveRegions] = useState(false);

  // ── NOTIFICATION SETTINGS ─────────────────────────────────
  const [soundEnabled, setSoundEnabled]     = useState(true);
  const { token: fcmToken, permission: fcmPermission, requestPermission: requestFcmPermission } = useFCMToken();
  const pushEnabled = fcmPermission === 'granted';

  // ── COMPUTED ──────────────────────────────────────────────
  const totalRevenue    = useMemo(() => orders.filter(o => o.status === 'livre').reduce((s,o) => s + (o.amount ?? 0), 0), [orders]);
  const platformRevenue = useMemo(() => Math.round(totalRevenue * COMMISSION_RATE), [totalRevenue]);
  const deliveredOrders = useMemo(() => orders.filter(o => o.status === 'livre').length, [orders]);

  // ✅ NOUVEAU — Onglet "Livreurs" : gains par livreur.
  // Même source de vérité que app/delivery/dashboard/page.tsx::EarningsModal
  // (totalEarnings/todayEarnings) : on somme `deliveryFee` — les frais de
  // livraison réellement encaissés pour la course — jamais `amount`/`total`,
  // qui est le prix payé par le client (produits inclus, ne revient pas au
  // livreur). Recalculé en direct depuis `orders` à chaque rendu : pas de
  // compteur séparé à faire dériver, donc jamais désynchronisé du dashboard
  // livreur lui-même.
  // ⚠️ Ceci affiche ce qui est GAGNÉ, pas ce qui a été VERSÉ : il n'existe
  // aujourd'hui aucun champ "payé/à payer" sur la commande. Si un jour un
  // vrai virement/paiement des livreurs est mis en place, ajouter un champ
  // dédié (ex. `delivererPaidAt`) plutôt que de déduire un statut de
  // paiement à partir d'autres champs.
  // ⚠️ FIX : todayStr/weekAgoTs ne doivent PAS être recalculés à chaque
  // rendu (Date.now() change à la milliseconde près), sinon ça invalide le
  // useMemo ci-dessous à chaque fois puisqu'ils sont dans son tableau de
  // dépendances. On les stabilise via nowTick, recalculé une fois par
  // minute (suffisant pour un total "aujourd'hui/7 jours").
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const todayStr = useMemo(() => new Date(nowTick).toDateString(), [nowTick]);
  const weekAgoTs = useMemo(() => nowTick - 7 * 24 * 60 * 60 * 1000, [nowTick]);
  const delivererEarnings = useMemo(() => {
    const map: Record<string, { total: number; today: number; week: number; count: number }> = {};
    for (const o of orders) {
      if (o.status !== 'livre' || !o.delivererId) continue;
      const fee = o.deliveryFee ?? 0;
      const ts = o.deliveredAt?.toDate?.();
      if (!map[o.delivererId]) map[o.delivererId] = { total: 0, today: 0, week: 0, count: 0 };
      map[o.delivererId].total += fee;
      map[o.delivererId].count += 1;
      if (ts && ts.toDateString() === todayStr) map[o.delivererId].today += fee;
      if (ts && ts.getTime() >= weekAgoTs) map[o.delivererId].week += fee;
    }
    return map;
  }, [orders, todayStr, weekAgoTs]);
  const totalDelivererEarnings = useMemo(
    () => Object.values(delivererEarnings).reduce((s, d) => s + d.total, 0),
    [delivererEarnings]
  );

  const pendingLoans    = useMemo(() => loans.filter(l => l.status === 'pending').length, [loans]);
  const totalLoanVolume = useMemo(() => loans.reduce((s,l) => s + (l.amount ?? 0), 0), [loans]);

  // ── REGION STATS ──────────────────────────────────────────
  const regionStats = useMemo(() => {
    return SENEGAL_REGIONS.map(region => {
      // ⚠️ FIX : `o.region` n'existe jamais sur une vraie commande (checkout
      // écrit `sellerRegion`) — ces stats affichaient 0 commande/0 FCFA pour
      // CHAQUE région, tout le temps.
      const regionOrders  = orders.filter(o => o.sellerRegion?.toLowerCase() === region.toLowerCase());
      const regionUsers   = users.filter(u  => u.region?.toLowerCase() === region.toLowerCase());
      const regionProducts= products.filter(p => p.region?.toLowerCase() === region.toLowerCase());
      const deliveredOrders = regionOrders.filter(o => o.status === 'livre');
      const revenue       = deliveredOrders.reduce((s,o) => s + (o.amount ?? 0), 0);
      const avgOrderValue = deliveredOrders.length > 0 ? revenue / deliveredOrders.length : 0;
      const isActive       = regionOrders.length > 0 || regionUsers.length > 0 || regionProducts.length > 0;
      return {
        region,
        orders:   regionOrders.length,
        users:    regionUsers.length,
        products: regionProducts.length,
        revenue,
        avgOrderValue,
        isActive,
        ...REGION_INFO[region]
      };
    }).sort((a,b) => b.revenue - a.revenue);
  }, [orders, users, products]);

  // ✅ Rang basé sur le revenu (classement de référence, indépendant du tri
  // choisi par l'admin dans l'UI) — permet d'afficher un badge 🥇🥈🥉 stable.
  const regionRankByRevenue = useMemo(() => {
    const map = new Map<string, number>();
    regionStats.forEach((r, i) => map.set(r.region, i + 1));
    return map;
  }, [regionStats]);

  // ✅ Recherche + tri appliqués côté UI, sans recalculer les stats brutes.
  const visibleRegionStats = useMemo(() => {
    const q = regionSearch.trim().toLowerCase();
    let list = regionStats.filter(r => !q || r.region.toLowerCase().includes(q));
    const sorters: Record<typeof regionSort, (a: typeof list[number], b: typeof list[number]) => number> = {
      revenue:  (a,b) => b.revenue - a.revenue,
      orders:   (a,b) => b.orders - a.orders,
      users:    (a,b) => b.users - a.users,
      products: (a,b) => b.products - a.products,
      name:     (a,b) => a.region.localeCompare(b.region),
    };
    return [...list].sort(sorters[regionSort]);
  }, [regionStats, regionSearch, regionSort]);

  const activeRegionStats   = useMemo(() => visibleRegionStats.filter(r => r.isActive), [visibleRegionStats]);
  const inactiveRegionStats = useMemo(() => visibleRegionStats.filter(r => !r.isActive), [visibleRegionStats]);

  // ⚠️ TRAÇABILITÉ : une commande dont `sellerRegion` ne correspond
  // exactement (insensible à la casse) à AUCUNE des 14 régions officielles
  // (texte libre, faute de frappe, ancien format "Ville, Région"…) ne
  // matche jamais aucune carte ci-dessus — mais son montant reste compté
  // dans `totalRevenue`, donc dans le dénominateur des %. Sans ce calcul,
  // ce revenu "orphelin" disparaît silencieusement de l'onglet Régions
  // tout en faussant les pourcentages affichés (ex: Dakar à 51,6% au lieu
  // de ~100% alors qu'aucune autre région n'a de commande visible).
  const unassignedRegionStats = useMemo(() => {
    const known = new Set(SENEGAL_REGIONS.map(r => r.toLowerCase()));
    const delivered = orders.filter(o => o.status === 'livre' && !known.has((o.sellerRegion || '').toLowerCase()));
    const revenue = delivered.reduce((s,o) => s + (o.amount ?? 0), 0);
    return { orders: delivered.length, revenue };
  }, [orders]);

  // ── ONGLET UTILISATEURS : recherche + tri + pagination ─────
  const sellerProductCounts = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach(p => map.set(p.sellerId, (map.get(p.sellerId) || 0) + 1));
    return map;
  }, [products]);

  const userStatsByRole = useMemo(() => ({
    total:    users.length,
    client:   users.filter(u => u.role === 'client').length,
    seller:   users.filter(u => u.role === 'seller').length,
    delivery: users.filter(u => u.role === 'delivery').length,
    admin:    users.filter(u => u.role === 'admin').length,
  }), [users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    let list = users.filter(u => {
      if (userRoleFilter !== 'all' && u.role !== userRoleFilter) return false;
      if (!q) return true;
      return u.displayName?.toLowerCase().includes(q)
        || u.email?.toLowerCase().includes(q)
        || u.phone?.toLowerCase().includes(q);
    });
    const sorters: Record<typeof userSort, (a: UserProfile, b: UserProfile) => number> = {
      recent: (a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0),
      name:   (a, b) => (a.displayName || '').localeCompare(b.displayName || ''),
      role:   (a, b) => (a.role || '').localeCompare(b.role || ''),
    };
    return [...list].sort(sorters[userSort]);
  }, [users, userSearch, userRoleFilter, userSort]);

  const paginatedUsers = useMemo(() => {
    const start = userPage * userPageSize;
    return filteredUsers.slice(start, start + userPageSize);
  }, [filteredUsers, userPage]);

  const userTotalPages = Math.max(1, Math.ceil(filteredUsers.length / userPageSize));

  // Revenir à la page 1 dès que la recherche/le filtre change, pour ne
  // jamais se retrouver sur une page vide qui n'existe plus.
  useEffect(() => { setUserPage(0); }, [userSearch, userRoleFilter]);

  // ── ROLE GUARD ────────────────────────────────────────────
  useEffect(() => {
    if (!authUser) { router.replace('/auth/login'); return; }
    getDoc(doc(db, 'users', authUser.uid)).then(snap => {
      if (!snap.exists() || snap.data()?.role !== 'admin') {
        router.replace('/');
      }
    });
  }, [authUser, router]);

  // ✅ Second déclencheur (sans cron) pour les relances "commandes en
  // attente" / "clients inactifs" : à chaque ouverture de l'admin, en plus
  // du déclenchement à chaque checkout (voir checkout/page.tsx). Couvre
  // les périodes sans achat mais où l'admin est actif. Auto-throttlé
  // côté serveur (settings/periodicChecksLock) : sans risque même
  // rechargé souvent.
  useEffect(() => {
    if (!authUser) return;
    fetch(apiUrl('/api/system/periodic-checks'), { method: 'POST' }).catch(() => {});
  }, [authUser]);

  // ── FIREBASE LISTENERS ────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;

    const unsubOrders = onSnapshot(
      query(collection(db, 'orders'), orderBy('createdAt', 'desc')),
      snap => {
        setOrders(snap.docs.map(d => {
          const data = d.data();
          // Normalise le montant : supporte amount, totalAmount, total, price
          const amount = Number(data.amount ?? data.totalAmount ?? data.total ?? data.price ?? 0);
          // Normalise le statut vers le vocabulaire canonique snake_case via
          // @/lib/orderStatus — la même fonction que seller-orders-page.tsx
          // et delivery-dashboard-page.tsx, pour garantir un seul vocabulaire
          // de statut dans toute l'application.
          const status: Order['status'] = normalizeStatus(data.status);
          return { ...data, id: d.id, amount, status } as Order;
        }));
        setLastSync(new Date());
        setLoading(false);
      },
      err => { console.error('orders:', err); setLoading(false); }
    );

    const unsubUsers = onSnapshot(collection(db, 'users'), snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as UserProfile));
      setUsers(all);
      setDeliveryPersons(all.filter(u => u.role === 'delivery' && u.isAvailable !== false));
    });

    const unsubProducts = onSnapshot(collection(db, 'products'), snap => {
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() } as Product)));
    });

    // ── Prix vendeur (basePrice) ──
    // Stocké à part dans products/{id}/productPricing/base, lisible
    // UNIQUEMENT par l'admin (règles Firestore). Jamais fusionné dans le
    // document public `products/{id}` pour que le vendeur/l'acheteur ne
    // puissent pas le lire, même via les outils développeur.
    const unsubPricing = onSnapshot(
      collectionGroup(db, 'productPricing'),
      snap => {
        const map: Record<string, number> = {};
        snap.forEach(d => {
          const productId = d.ref.parent.parent?.id;
          if (productId) map[productId] = Number(d.data().basePrice) || 0;
        });
        setPricingByProduct(map);
      },
      err => console.error('productPricing (accès admin requis):', err)
    );

    const unsubLoans = onSnapshot(
      query(collection(db, 'loans'), orderBy('createdAt', 'desc')),
      snap => setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan)))
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as AppNotification));
        setAllNotifications(all);
        // unreadCount = notifs personnelles non lues de l'admin
        const personal = all.filter(n => n.userId === authUser.uid);
        setNotifications(personal);
        setUnreadCount(personal.filter(n => !n.read).length);
      }
    );

    // Broadcast history
    const unsubBroadcast = onSnapshot(
      query(collection(db, 'broadcasts'), orderBy('createdAt', 'desc'), limit(20)),
      snap => setBroadcastHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // ── Publicités ──
    const unsubAds = onSnapshot(
      query(collection(db, 'ads'), orderBy('createdAt', 'desc')),
      snap => setAds(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    // ── Avis clients (pour repérer les vendeurs mal notés) ──
    const unsubReviews = onSnapshot(
      query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(200)),
      snap => setReviews(snap.docs.map(d => ({ id: d.id, ...d.data() } as Review))),
      err => console.error('reviews:', err)
    );

    return () => { unsubOrders(); unsubUsers(); unsubProducts(); unsubPricing(); unsubLoans(); unsubNotifs(); unsubBroadcast(); unsubAds(); unsubReviews(); };
  }, [authUser]);

  // ── IA COMPUTATIONS ───────────────────────────────────────
  useEffect(() => {
    if (orders.length > 0) {
      setAnomalies(PricePredictor.detectAnomalies(orders));
    }
    if (products.length > 0) {
      const prices = products.map(p => p.price).filter(p => p > 0);
      if (prices.length > 0) setPricePredictions(PricePredictor.predict(prices, 7));
    }
    const sim = LoanCalculator.compareBanks(loanSimAmount, loanSimDuration);
    setLoanSimulation(sim);
    if (sim.bestBank) {
      setAmortizationTable(LoanCalculator.generateAmortizationTable(loanSimAmount, sim.bestBank.rate, loanSimDuration));
    }
  }, [orders, products, loanSimAmount, loanSimDuration]);

  // ── FCM ───────────────────────────────────────────────────
  // Utilise le même hook que les autres rôles (client/seller/delivery) :
  // un seul endroit qui écrit le token, dans users/{uid}/tokens/{token},
  // avec une seule clé VAPID (NEXT_PUBLIC_VAPID_KEY).
  useEffect(() => {
    if (!authUser) return;
    requestFcmPermission();
  }, [authUser, requestFcmPermission]);

  // ── ACTIONS ───────────────────────────────────────────────

  // ── Notification vendeur — changement de statut ──────────────────────
  // ⚠️ CONSOLIDATION (suite à l'ajout du dossier functions/) : ce handler
  // envoyait auparavant une notification acheteur ET vendeur pour chaque
  // statut. Il s'avère que des triggers Firestore serveur
  // (functions/src/index.ts) couvrent déjà, de façon garantie et
  // indépendante du réseau de l'admin :
  //   - l'acheteur, pour TOUS les statuts (notifyOrderStatusStep pour
  //     en_preparation/en_livraison/livre, notifyOrderCancelled pour annule)
  //   - le vendeur, pour 'livre' (notifyOrderStatusStep, nouveau bloc) et
  //     'annule' (notifyOrderCancelled, envoie déjà aux deux parties)
  // Avant cette prise en compte, CHAQUE changement de statut ici déclenchait
  // 2 notifications pour le même événement (une du client, une du serveur),
  // avec des textes différents. On ne garde donc plus ici QUE la notif
  // vendeur pour les statuts que le serveur ne couvre pas.
  // ⚠️ FIX : order.farmerId n'existe jamais (checkout écrit sellerId) —
  // cette notification n'était donc historiquement jamais envoyée à personne.
  const SELLER_STATUS_MESSAGES: Partial<Record<Order['status'], { title: string; body: string; icon: string; priority: 'low'|'medium'|'high'|'critical' }>> = {
    en_attente:     { title: 'Commande #{n} — en attente',      body: 'Une commande attend votre confirmation.',     icon: '⏳', priority: 'medium' },
    en_preparation: { title: 'Commande #{n} — en préparation',  body: 'La commande est passée en préparation.',     icon: '🔄', priority: 'medium' },
    en_livraison:   { title: 'Commande #{n} — en livraison',    body: 'La commande est en cours de livraison.',     icon: '🚚', priority: 'medium' },
    // livre / annule : intentionnellement absents, couverts côté serveur.
  };

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      // ⚠️ FIX cohérence inter-collections : seller-orders-page.tsx et les pages
      // client (account) tiennent une copie miroir orders/{id} → seller_orders/{id}
      // à jour via un writeBatch sur les deux collections. Cette fonction n'écrivait
      // QUE dans 'orders' — un changement de statut fait depuis l'admin ne se
      // répercutait jamais dans seller_orders, que account-page.tsx lit aussi pour
      // l'historique client (voir sa query sur seller_orders where userId==uid).
      // Résultat concret sans ce fix : l'admin change un statut, le client voit
      // encore l'ancien statut dans "Mon compte" tant que le vendeur ne retouche
      // pas la commande.
      // ⚠️ FIX cohérence : account-page.tsx départage orders vs seller_orders en
      // comparant `updatedAt` (repli sur `createdAt`) pour garder la copie la plus
      // récente. Sans `updatedAt` ici, les deux copies retombent sur le même
      // `createdAt` et le "gagnant" dépend de l'ordre d'arrivée des 2 listeners
      // Firestore — une course non déterministe côté client.
      // Timestamp Firestore (pas string ISO) : account-page.tsx lit `.seconds`.
      const now = Timestamp.now();
      const payload: Record<string, any> = { status, updatedAt: now };
      // Analytique — voir seller/orders/page.tsx::updateStatus pour le
      // même ajout ; ici pour couvrir le cas où c'est l'admin qui fait
      // passer la commande en préparation, pas seulement le vendeur.
      if (status === 'en_preparation') payload.enPreparationAt = now;
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', orderId));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', orderId), payload, { merge: true });
      }
      await batch.commit();
      toast.success(`Statut : ${ORDER_STATUS_CONFIG[status].label}`);
      const order = orders.find(o => o.id === orderId);
      const m = order ? SELLER_STATUS_MESSAGES[status] : undefined;
      if (order?.sellerId && m) {
        notifyUser({
          userId: order.sellerId,
          type: 'order',
          title: m.title.replace('{n}', order.orderNumber),
          body: m.body,
          icon: m.icon,
          link: `/seller/orders`,
          priority: m.priority,
        });
      }
    } catch { toast.error('Erreur mise à jour'); }
  };

  const assignDelivery = async (orderId: string, deliveryId: string, deliveryName: string, deliveryPhone: string) => {
    try {
      // Même correctif que updateOrderStatus : synchroniser seller_orders et
      // renseigner updatedAt en Timestamp Firestore (pas string ISO), pour les
      // mêmes raisons (voir commentaire ci-dessus).
      const now = Timestamp.now();
      const payload = {
        delivererId: deliveryId, delivererName: deliveryName, delivererPhone: deliveryPhone,
        delivererAssignedAt: Timestamp.now(), status: 'en_preparation' as const, updatedAt: now,
        // Parcours de suivi hybride (voir delivery/dashboard::claimOrder pour
        // le contexte complet) — cohérence entre les deux voies d'attribution.
        'tracking.phase': 'assigned',
      };
      const batch = writeBatch(db);
      batch.set(doc(db, 'orders', orderId), payload, { merge: true });
      const sellerOrderSnap = await getDoc(doc(db, 'seller_orders', orderId));
      if (sellerOrderSnap.exists()) {
        batch.set(doc(db, 'seller_orders', orderId), payload, { merge: true });
      }
      await batch.commit();
      toast.success(`Livreur assigné : ${deliveryName}`);
      setShowAssignModal(false);
      setAssignOrderId(null);

      const assignedOrder = orders.find(o => o.id === orderId);

      // ⚠️ DOUBLON RETIRÉ + INCOHÉRENCE SIGNALÉE (pas corrigée automatiquement,
      // décision métier à confirmer) : cette fonction assigne un livreur en
      // fixant status='en_preparation' (voir payload ci-dessus). Le trigger
      // serveur notifyOrderStatusStep envoie donc déjà à l'acheteur
      // "Commande en préparation 👨‍🌾" pour CETTE même écriture. Le code
      // envoyait EN PLUS, manuellement ici, "🚚 Votre commande est en
      // route !" — deux notifications contradictoires quasi simultanées
      // (l'une dit "en préparation", l'autre "en route"). J'ai retiré le
      // doublon, mais la question reste ouverte : si l'intention réelle est
      // "le livreur est en route", le statut assigné ici devrait
      // probablement être 'en_livraison', pas 'en_preparation' — à trancher
      // côté métier avant de changer la valeur du statut.

      // ⚠️ FIX : seul l'acheteur était notifié ici — le livreur lui-même ne
      // l'était jamais. Il ne découvrait la commande qu'en rouvrant son
      // dashboard par hasard. `deliveryId` est bien l'uid du compte livreur
      // (voir `deliveryPersons`, filtré sur `role === 'delivery'`, juste
      // au-dessus dans ce fichier), donc directement utilisable ici.
      notifyUser({
        userId: deliveryId,
        type: 'delivery',
        title: '📦 Nouvelle livraison assignée',
        body: `Commande #${assignedOrder?.orderNumber ?? orderId} à récupérer chez ${assignedOrder?.sellerName ?? 'le vendeur'}.`,
        icon: '📦',
        link: '/delivery/dashboard',
        priority: 'high',
      });
    } catch { toast.error('Erreur assignation'); }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
      toast.success(`Rôle : ${role}`);
    } catch { toast.error('Erreur rôle'); }
  };

  const deleteUser = async (userId: string) => {
    // ⚠️ Message générique remplacé : sans nom affiché, un admin qui
    // supprime plusieurs comptes à la suite ne peut pas vérifier qu'il
    // clique bien sur le bon avant de confirmer.
    const target = users.find(u => u.id === userId);
    const label = target?.displayName || target?.email || 'cet utilisateur';
    if (!confirm(`Supprimer définitivement le compte de "${label}" ? Cette action est irréversible.`)) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      toast.success('Utilisateur supprimé');
    } catch { toast.error('Erreur suppression'); }
  };

  const updateLoanStatus = async (loanId: string, status: Loan['status']) => {
    try {
      await updateDoc(doc(db, 'loans', loanId), {
        status, approvedBy: authUser?.uid,
        approvedAt: status === 'approved' ? Timestamp.now() : null
      });
      toast.success(status === 'approved' ? 'Financement approuvé' : 'Financement refusé');
      const loan = loans.find(l => l.id === loanId);
      if (loan && status === 'approved') {
        await notifyUser({
          userId: loan.sellerId,
          type: 'loan',
          title: '✅ Financement approuvé !',
          body: `Votre demande de ${(loan.amount ?? 0).toLocaleString()} FCFA a été approuvée.`,
          icon: '💰',
          link: '/loans',
          priority: 'high',
        });
      }
    } catch { toast.error('Erreur'); }
  };

  const markLoanAsPaid = async (loanId: string) => {
    try {
      await updateDoc(doc(db, 'loans', loanId), { status: 'paid', paidAt: Timestamp.now(), remainingBalance: 0 });
      toast.success('Financement remboursé');
    } catch { toast.error('Erreur'); }
  };

  const createLoan = async () => {
    const { sellerName, sellerPhone, region, village, purpose, amount, duration, description } = loanForm;
    if (!sellerName || !amount || !purpose) { toast.error('Champs obligatoires manquants'); return; }
    const amountNum   = parseInt(amount);
    const durationNum = parseInt(duration);
    try {
      await addDoc(collection(db, 'loans'), {
        sellerId: 'manual', sellerName, sellerPhone: sellerPhone || '',
        amount: amountNum, duration: durationNum,
        monthlyPayment: Math.round(amountNum / durationNum),
        interestRate: 12,
        totalToRepay: Math.round(amountNum * 1.12),
        remainingBalance: amountNum,
        purpose, description: description || '',
        status: 'pending', region: region || '', village: village || '',
        createdAt: Timestamp.now()
      });
      toast.success('Demande créée');
      setShowLoanForm(false);
      setLoanForm({ sellerName:'', sellerPhone:'', region:'', village:'', purpose:'', amount:'', duration:'12', description:'' });
    } catch { toast.error('Erreur création'); }
  };

  const updateProductStock = async (productId: string, newStock: number) => {
    try {
      const clampedStock = Math.max(0, newStock);
      await updateDoc(doc(db, 'products', productId), { stock: clampedStock });
      toast.success('Stock mis à jour');
      // ⚠️ CONSOLIDATION : cette notification "stock critique" partait
      // auparavant d'ici, côté client, avec le même seuil (<5) que le
      // trigger serveur notifyLowStock (functions/src/index.ts), qui
      // réagit déjà automatiquement à l'écriture sur products/{id}.stock
      // ci-dessus (avec en plus la distinction rupture totale/stock
      // faible). L'admin recevait donc un doublon exact à chaque
      // modification manuelle de stock passant sous le seuil.
    } catch { toast.error('Erreur stock'); }
  };

  const startEditProduct = (product: Product) => {
    setEditingProductId(product.id!);
    setProductEditForm({
      name: product.name || '',
      category: product.category || '',
      // Produits dont la sous-collection productPricing n'est pas encore
      // chargée/existante (ex. créés avant cette automatisation) : on
      // reconstitue une valeur à partir du prix affiché pour ne rien
      // changer côté acheteur/vendeur tant que l'admin ne modifie rien.
      basePrice: pricingByProduct[product.id!] ?? inferBasePrice(product.price || 0),
      region: product.region || '',
      stock: product.stock || 0,
    });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
  };

  const saveProductEdit = async () => {
    if (!editingProductId) return;
    if (!productEditForm.name.trim()) { toast.error('Le nom du produit est requis'); return; }
    setProductSaving(true);
    try {
      const basePrice = Number(productEditForm.basePrice) || 0;
      await updateDoc(doc(db, 'products', editingProductId), {
        name: productEditForm.name.trim(),
        category: productEditForm.category.trim(),
        // Prix réellement vu par le vendeur et l'acheteur = basePrice + 5% —
        // recalculé automatiquement, jamais saisi directement.
        price: computeDisplayPrice(basePrice),
        region: productEditForm.region.trim(),
        stock: Math.max(0, Number(productEditForm.stock) || 0),
      });
      // basePrice va dans la sous-collection privée, jamais dans le document public.
      await setDoc(doc(db, 'products', editingProductId, 'productPricing', 'base'), {
        basePrice,
        updatedAt: serverTimestamp(),
      }, { merge: true });
      toast.success('Produit mis à jour');
      setEditingProductId(null);
    } catch {
      toast.error('Erreur lors de la mise à jour du produit');
    } finally {
      setProductSaving(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    if (!confirm('Supprimer ce produit ? Cette action est irréversible.')) return;
    try {
      await deleteDoc(doc(db, 'products', productId));
      toast.success('Produit supprimé');
    } catch {
      toast.error('Erreur lors de la suppression du produit');
    }
  };

  // ── AVIS CLIENTS (modération) ──────────────────────────────
  const deleteReview = async (reviewId: string) => {
    if (!confirm('Supprimer définitivement cet avis ? Cette action est irréversible.')) return;
    setDeletingReviewId(reviewId);
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      toast.success('Avis supprimé');
    } catch {
      toast.error("Erreur lors de la suppression de l'avis");
    } finally {
      setDeletingReviewId(null);
    }
  };

  // ── MÉTÉO ─────────────────────────────────────────────────

  const REGION_COORDS: Record<SenegalRegion, { lat: number; lon: number }> = {
    "Dakar":       { lat: 14.6928,  lon: -17.4467 },
    "Thiès":       { lat: 14.7886,  lon: -16.9260 },
    "Saint-Louis": { lat: 16.0179,  lon: -16.4896 },
    "Diourbel":    { lat: 14.6565,  lon: -16.2327 },
    "Louga":       { lat: 15.6180,  lon: -16.2271 },
    "Fatick":      { lat: 14.3390,  lon: -16.4110 },
    "Kaolack":     { lat: 14.1523,  lon: -16.0726 },
    "Kaffrine":    { lat: 14.1061,  lon: -15.5509 },
    "Tambacounda": { lat: 13.7707,  lon: -13.6673 },
    "Kédougou":    { lat: 12.5547,  lon: -12.1747 },
    "Ziguinchor":  { lat: 12.5658,  lon: -16.2733 },
    "Sédhiou":     { lat: 12.7080,  lon: -15.5570 },
    "Kolda":       { lat: 12.8939,  lon: -14.9413 },
    "Matam":       { lat: 15.6553,  lon: -13.2550 },
  };

  const fetchWeather = useCallback(async () => {
    setWeatherLoading(true);
    setWeatherError(null);
    const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY;
    if (!apiKey) { setWeatherError("Clé API OpenWeatherMap manquante (NEXT_PUBLIC_OPENWEATHER_API_KEY)"); setWeatherLoading(false); return; }
    try {
      const results: Record<string, any> = {};
      await Promise.all(
        SENEGAL_REGIONS.map(async (region) => {
          const { lat, lon } = REGION_COORDS[region];
          const res = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=fr&cnt=8`
          );
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          results[region] = data;
        })
      );
      setWeatherData(results);
    } catch (e: any) {
      setWeatherError("Erreur chargement météo : " + (e?.message ?? 'inconnue'));
    } finally {
      setWeatherLoading(false);
    }
  }, []);

  const fetchWeatherAdvice = useCallback(async (region: SenegalRegion, data: any) => {
    if (weatherAdvice[region] || weatherAdviceLoading[region]) return;
    setWeatherAdviceLoading(prev => ({ ...prev, [region]: true }));
    try {
      const cur = data?.list?.[0];
      if (!cur) return;
      const temp   = cur.main.temp;
      const hum    = cur.main.humidity;
      const rain   = cur.pop ?? 0;
      const wind   = cur.wind?.speed ?? 0;
      const desc   = cur.weather?.[0]?.description ?? 'inconnu';
      const regionInfo = REGION_INFO[region];

      const prompt = `Tu es un agronome expert en agriculture sénégalaise. Voici les conditions météo actuelles pour la région de ${region} (${regionInfo.description}) :
- Température : ${temp.toFixed(1)}°C
- Humidité : ${hum}%
- Probabilité de pluie : ${Math.round(rain * 100)}%
- Vent : ${wind.toFixed(1)} m/s
- Ciel : ${desc}

Donne 3 à 5 conseils agricoles pratiques, concis et adaptés à cette région du Sénégal (cultures locales : arachide, mil, sorgho, maïs, légumes, etc.). Commence chaque conseil par un emoji pertinent. Réponds en français, sois direct et opérationnel.`;

      const apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
      const response = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}),
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const json = await response.json();
      const text = json?.choices?.[0]?.message?.content ?? "";
      if (text) setWeatherAdvice(prev => ({ ...prev, [region]: text }));
    } catch {
      // silently fail — static tips remain as fallback
    } finally {
      setWeatherAdviceLoading(prev => ({ ...prev, [region]: false }));
    }
  }, [weatherAdvice, weatherAdviceLoading]);

  useEffect(() => {
    if (activeTab === 'weather' && Object.keys(weatherData).length === 0) {
      fetchWeather();
    }
  }, [activeTab, fetchWeather, weatherData]);

  useEffect(() => {
    if (weatherRegion && weatherData[weatherRegion]) {
      fetchWeatherAdvice(weatherRegion, weatherData[weatherRegion]);
    }
  }, [weatherRegion, weatherData, fetchWeatherAdvice]);

  // ── BROADCAST ─────────────────────────────────────────────

  const sendBroadcast = async () => {
    if (!broadcastForm.title || !broadcastForm.body) {
      toast.error('Titre et message requis');
      return;
    }
    setBroadcastSending(true);
    try {
      // Calcul des destinataires selon le mode
      let targetUsers = [...users];
      if (broadcastMode === 'manual') {
        if (selectedUserIds.size === 0) { toast.error('Sélectionnez au moins un utilisateur'); setBroadcastSending(false); return; }
        targetUsers = users.filter(u => selectedUserIds.has(u.uid ?? u.id ?? ''));
      } else {
        if (broadcastForm.targetRole !== 'all') targetUsers = targetUsers.filter(u => u.role === broadcastForm.targetRole);
        if (broadcastForm.targetRegion !== 'all') targetUsers = targetUsers.filter(u => u.region?.toLowerCase() === broadcastForm.targetRegion.toLowerCase());
      }

      const batch = writeBatch(db);
      let inAppCount = 0;

      // In-App notifications (Firestore)
      if (broadcastForm.channels.inApp) {
        // writeBatch limite à 500 ops — on bascule sur addDoc par lot si > 499
        if (targetUsers.length > 499) {
          // chunked
          for (let i = 0; i < targetUsers.length; i += 400) {
            const chunk = targetUsers.slice(i, i + 400);
            const b2 = writeBatch(db);
            chunk.forEach(u => {
              const ref = doc(collection(db, 'notifications'));
              b2.set(ref, {
                userId: u.uid ?? u.id,
                type: broadcastForm.type,
                title: broadcastForm.title,
                body: broadcastForm.body,
                icon: broadcastForm.icon,
                deepLink: broadcastForm.deepLink || '/',
                urgent: broadcastForm.urgent,
                priority: broadcastForm.priority,
                read: false,
                createdAt: Timestamp.now(),
                metadata: { broadcast: true }
              });
            });
            await b2.commit();
          }
        } else {
          targetUsers.forEach(u => {
            const ref = doc(collection(db, 'notifications'));
            batch.set(ref, {
              userId: u.uid ?? u.id,
              type: broadcastForm.type,
              title: broadcastForm.title,
              body: broadcastForm.body,
              icon: broadcastForm.icon,
              deepLink: broadcastForm.deepLink || '/',
              urgent: broadcastForm.urgent,
              priority: broadcastForm.priority,
              read: false,
              createdAt: Timestamp.now(),
              metadata: { broadcast: true }
            });
          });
          await batch.commit();
        }
        inAppCount = targetUsers.length;
      }

      // SMS channel — envoi via Infobip
      let smsCount = 0;
      if (broadcastForm.channels.sms) {
        const smsTargets = targetUsers.filter(u => {
          if (!u.phone) return false;
          const cleaned = String(u.phone).replace(/[^\d+]/g, '');
          // Rejette les numéros trop courts, "N/A", espaces seuls, etc.
          return cleaned.replace(/^\+/, '').length >= 9;
        });
        const smsErrors: string[] = [];
        for (const u of smsTargets) {
          try {
            const res = await fetch(apiUrl('/api/send-sms'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: u.phone,
                message: `${broadcastForm.icon} ${broadcastForm.title}\n${broadcastForm.body}`,
              }),
            });
            if (res.ok) smsCount++;
            else {
              const err = await res.json().catch(() => ({}));
              const errMsg = err?.error ?? `HTTP ${res.status}`;
              console.warn(`[SMS] Échec pour ${u.phone} (uid: ${u.uid ?? u.id}): ${errMsg}`);
              smsErrors.push(`${u.phone}: ${errMsg}`);
            }
          } catch (fetchErr: any) {
            console.warn(`[SMS] Erreur réseau pour ${u.phone}:`, fetchErr?.message);
            smsErrors.push(fetchErr?.message ?? 'Erreur réseau');
          }
        }
        if (smsErrors.length > 0) {
          toast.warning(`${smsCount} SMS envoyé(s), ${smsErrors.length} erreur(s)`);
        }
      }

      // Email channel — envoi via Resend
      let emailCount = 0;
      if (broadcastForm.channels.email) {
        const emailTargets = targetUsers.filter(u => u.email);
        const emailErrors: string[] = [];
        for (const u of emailTargets) {
          try {
            const res = await fetch(apiUrl('/api/send-email'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: u.email,
                subject: `${broadcastForm.icon} ${broadcastForm.title}`,
                message: broadcastForm.body,
                title: broadcastForm.title,
                icon: broadcastForm.icon,
                userId: u.uid ?? u.id,
                deepLink: broadcastForm.deepLink || '',
                urgent: broadcastForm.urgent,
              }),
            });
            if (res.ok) emailCount++;
            else { const err = await res.json().catch(()=>({})); emailErrors.push(err?.error ?? `HTTP ${res.status}`); }
          } catch (fetchErr: any) {
            emailErrors.push(fetchErr?.message ?? 'Erreur réseau');
          }
        }
        if (emailErrors.length > 0) {
          toast.warning(`${emailCount} email(s) envoyé(s), ${emailErrors.length} erreur(s)`);
        }
      }

      // Push notifications — envoi via FCM (Firebase Cloud Messaging)
      // Les tokens sont stockés dans users/{uid}/tokens/{token} (cf. useFCMToken).
      let pushCount = 0;
      let pushFailCount = 0;
      let pushPrunedCount = 0;
      if (broadcastForm.channels.push) {
        const targetUids = Array.from(new Set(targetUsers.map(u => u.uid ?? u.id ?? '').filter(Boolean)));
        const targets: PushTarget[] = [];
        const isFullBroadcast = broadcastMode === 'filter' && broadcastForm.targetRole === 'all' && broadcastForm.targetRegion === 'all';
        try {
          if (isFullBroadcast) {
            // Cible = tous les utilisateurs → un seul scan groupé reste le plus efficace.
            const tokensSnap = await getDocs(collectionGroup(db, 'tokens'));
            tokensSnap.forEach(d => { const t = d.data()?.token; if (t) targets.push({ token: t, ref: d.ref }); });
          } else {
            // Cible = sous-ensemble → on lit UNIQUEMENT les tokens des utilisateurs
            // ciblés (users/{uid}/tokens), par lots parallèles, au lieu de scanner
            // toute la collection 'tokens' de la base puis filtrer côté client.
            const BATCH_SIZE = 200;
            for (let i = 0; i < targetUids.length; i += BATCH_SIZE) {
              const batch = targetUids.slice(i, i + BATCH_SIZE);
              const snaps = await Promise.all(
                batch.map(uid => getDocs(collection(db, 'users', uid, 'tokens')))
              );
              snaps.forEach(snap => snap.forEach(d => { const t = d.data()?.token; if (t) targets.push({ token: t, ref: d.ref }); }));
            }
          }
        } catch (tokensErr) {
          console.error('Erreur lecture tokens FCM:', tokensErr);
          toast.warning('Push : impossible de lire les tokens (vérifie les règles Firestore pour la sous-collection "tokens")');
        }
        // Dédoublonnage par token
        const seen = new Set<string>();
        const uniqueTargets = targets.filter(t => (seen.has(t.token) ? false : (seen.add(t.token), true)));

        if (uniqueTargets.length > 0) {
          // Moteur d'envoi : concurrence limitée (8 lots FCM en vol simultanément),
          // retry automatique avec backoff sur échec, purge des tokens morts.
          const { successCount, failureCount, deadRefs } = await sendPushBatched(
            uniqueTargets,
            {
              title: `${broadcastForm.icon} ${broadcastForm.title}`,
              body: broadcastForm.body,
              deepLink: broadcastForm.deepLink || '/',
              urgent: broadcastForm.urgent,
            },
            apiUrl,
          );
          pushCount = successCount;
          pushFailCount = failureCount;
          pushPrunedCount = deadRefs.length;
          pruneDeadTokens(deadRefs); // best effort, en arrière-plan
        }
      }


      await addDoc(collection(db, 'broadcasts'), {
        ...broadcastForm,
        sentBy: authUser?.uid,
        sentAt: Timestamp.now(),
        recipientCount: targetUsers.length,
        inAppCount,
        emailCount: broadcastForm.channels.email ? emailCount : 0,
        smsCount: broadcastForm.channels.sms ? smsCount : 0,
        pushCount,
        pushFailCount,
        pushPrunedCount,
      });

      toast.success(
        pushFailCount > 0
          ? `Envoyé à ${targetUsers.length} utilisateur(s) — ${pushFailCount} push en échec`
          : `Envoyé à ${targetUsers.length} utilisateur(s)`
      );
      setBroadcastForm(defaultBroadcast);
      setSelectedUserIds(new Set());
      setUserPickerSearch('');
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'envoi');
    } finally {
      setBroadcastSending(false);
    }
  };

  const sendDirectMessage = async () => {
    if (!dmTarget) { toast.error('Sélectionnez un destinataire'); return; }
    if (!dmForm.title || !dmForm.body) { toast.error('Titre et message requis'); return; }
    setDmSending(true);
    try {
      await notifyUser({
        userId: dmTarget.uid ?? dmTarget.id,
        type: dmForm.type,
        title: dmForm.title,
        body: dmForm.body,
        icon: dmForm.icon,
        link: '/',
        urgent: dmForm.urgent,
        priority: dmForm.priority,
      });
      toast.success(`Message envoyé à ${dmTarget.displayName}`);
      setDmForm({ title:'', body:'', icon:'💬', type:'message', priority:'medium', urgent:false });
      setDmTarget(null);
      setDmSearch('');
    } catch { toast.error('Erreur envoi'); }
    finally { setDmSending(false); }
  };

  // Envoie un push FCM à TOUT utilisateur possédant un token enregistré,
  // sans passer par le ciblage (rôle/région/manuel) du broadcast — juste "tous les tokens".
  const sendPushToAllTokens = async () => {
    if (!pushAllForm.title || !pushAllForm.body) { toast.error('Titre et message requis'); return; }
    setPushAllSending(true);
    setPushAllResult(null);
    try {
      const tokensSnap = await getDocs(collectionGroup(db, 'tokens'));
      const targets: PushTarget[] = [];
      tokensSnap.forEach(d => {
        const t = d.data()?.token;
        if (t) targets.push({ token: t, ref: d.ref });
      });
      const seen = new Set<string>();
      const uniqueTargets = targets.filter(t => (seen.has(t.token) ? false : (seen.add(t.token), true)));
      if (uniqueTargets.length === 0) {
        toast.error('Aucun token FCM enregistré (vérifie les règles Firestore pour la collection group "tokens")');
        return;
      }
      // Moteur d'envoi : concurrence limitée, retry automatique avec backoff,
      // purge des tokens morts après envoi.
      const { successCount, failureCount, deadRefs } = await sendPushBatched(
        uniqueTargets,
        {
          title: `${pushAllForm.icon} ${pushAllForm.title}`,
          body: pushAllForm.body,
          deepLink: pushAllForm.deepLink || '/',
          urgent: pushAllForm.urgent,
          ...(pushAllForm.imageUrl ? { imageUrl: pushAllForm.imageUrl } : {}),
        },
        apiUrl,
      );
      const pushCount = successCount;
      const failCount = failureCount;
      pruneDeadTokens(deadRefs); // best effort, en arrière-plan
      await addDoc(collection(db, 'broadcasts'), {
        title: pushAllForm.title,
        body: pushAllForm.body,
        icon: pushAllForm.icon,
        deepLink: pushAllForm.deepLink || '/',
        urgent: pushAllForm.urgent,
        ...(pushAllForm.imageUrl ? { imageUrl: pushAllForm.imageUrl } : {}),
        channels: { push: true, inApp: false, email: false, sms: false },
        targetRole: 'all_tokens',
        sentBy: authUser?.uid,
        sentAt: Timestamp.now(),
        recipientCount: uniqueTargets.length,
        pushCount,
        pushFailCount: failCount,
        pushPrunedCount: deadRefs.length,
      });
      if (failCount > 0) {
        toast.warning(`Push envoyé à ${pushCount} appareil(s), ${failCount} échec(s)`);
      } else {
        toast.success(`Push envoyé à ${pushCount} appareil(s)`);
      }
      setPushAllResult({ count: pushCount, fail: failCount });
      setPushAllForm({ title:'', body:'', icon:'📢', deepLink:'', urgent:false, imageUrl:'' });
    } catch (e) {
      console.error(e);
      toast.error('Erreur lors de l\'envoi du push');
    } finally {
      setPushAllSending(false);
    }
  };

  // Upload de la photo jointe au push (Cloudinary, réutilise le helper des
  // publicités — compression avant envoi pour un upload rapide).
  const handlePushAllImageSelect = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error("Le fichier n'est pas une image"); return; }
    setPushAllImageUploading(true);
    try {
      const blob = await compressImage(file, 1200, 0.82);
      const { url } = await uploadToCloudinary(blob, `push_${Date.now()}`);
      setPushAllForm(f => ({ ...f, imageUrl: url }));
      toast.success('Photo ajoutée');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erreur lors de l'upload de la photo");
    } finally {
      setPushAllImageUploading(false);
    }
  };

  // Nombre d'appareils actuellement joignables — lecture légère, une seule
  // fois au montage, juste pour donner une idée de portée avant l'envoi.
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDocs(collectionGroup(db, 'tokens'));
        const unique = new Set(snap.docs.map(d => d.data()?.token).filter(Boolean));
        setPushTokenCount(unique.size);
      } catch {
        setPushTokenCount(null);
      }
    })();
  }, []);

  // Décompte animé (ease-out cubique) du nombre d'appareils atteints,
  // affiché juste après l'envoi.
  useEffect(() => {
    if (!pushAllResult) { setPushAllDisplayCount(0); return; }
    let raf = 0;
    const start = performance.now();
    const duration = 900;
    const target = pushAllResult.count;
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setPushAllDisplayCount(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pushAllResult]);

  // ── 🤖 PROMOTION IA AUTOMATIQUE : chargement des réglages + historique ──
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'aiPromotion'));
        if (snap.exists()) {
          setAiPromoSettings(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (e) { console.error('aiPromotion settings load', e); }
      finally { setAiPromoLoading(false); }
    })();

    const q = query(collection(db, 'ai_promotions'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setAiPromoHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error('ai_promotions listen', e));
    return () => unsub();
  }, []);

  const saveAiPromoSettings = async (next: typeof aiPromoSettings) => {
    setAiPromoSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'aiPromotion'), next, { merge: true });
      setAiPromoSettings(next);
      toast.success(next.enabled ? 'Promotion IA activée' : 'Promotion IA désactivée');
    } catch (e) {
      console.error(e);
      toast.error('Erreur sauvegarde des réglages');
    } finally {
      setAiPromoSaving(false);
    }
  };

  // Déclenchement manuel immédiat (hors planning cron), pratique pour tester.
  const runAiPromoNow = async () => {
    setAiPromoRunning(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(apiUrl('/api/cron/promote-stale-products'), {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || 'Erreur lors du déclenchement'); return; }
      if (data?.skipped) { toast.info(data.reason || 'Rien à promouvoir pour le moment'); return; }
      toast.success(`${data?.processed ?? 0} produit(s) promu(s)`);
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setAiPromoRunning(false);
    }
  };

  // ── 🔔 NOTIFICATIONS AUTOMATIQUES (sans cron) ────────────────────────
  // Stock bas / rupture : réglages + historique. Pas de "run now" ici —
  // cette alerte est événementielle (voir /api/products/check-stock,
  // déclenchée à chaque checkout), pas de scan global à forcer.
  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'settings', 'lowStockAlerts'));
        if (snap.exists()) setLowStockSettings(prev => ({ ...prev, ...snap.data() }));
      } catch (e) { console.error('lowStockAlerts settings load', e); }
      finally { setLowStockLoading(false); }
    })();
    const q = query(collection(db, 'low_stock_alerts'), orderBy('createdAt', 'desc'), limit(10));
    const unsub = onSnapshot(q, (snap) => {
      setLowStockHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error('low_stock_alerts listen', e));
    return () => unsub();
  }, []);

  const saveLowStockSettings = async (next: typeof lowStockSettings) => {
    setLowStockSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'lowStockAlerts'), next, { merge: true });
      setLowStockSettings(next);
      toast.success(next.enabled ? 'Alertes stock bas activées' : 'Alertes stock bas désactivées');
    } catch (e) {
      console.error(e);
      toast.error('Erreur sauvegarde des réglages');
    } finally {
      setLowStockSaving(false);
    }
  };

  // Commandes en attente + Clients inactifs partagent la même route
  // (/api/system/periodic-checks), déclenchée par le trafic réel
  // (checkout + ouverture admin) plutôt que par un cron.
  useEffect(() => {
    (async () => {
      try {
        const [poSnap, icSnap] = await Promise.all([
          getDoc(doc(db, 'settings', 'pendingOrdersAlerts')),
          getDoc(doc(db, 'settings', 'inactiveClientsAlerts')),
        ]);
        if (poSnap.exists()) setPendingOrdersSettings(prev => ({ ...prev, ...poSnap.data() }));
        if (icSnap.exists()) setInactiveClientsSettings(prev => ({ ...prev, ...icSnap.data() }));
      } catch (e) { console.error('periodic-checks settings load', e); }
      finally { setPendingOrdersLoading(false); setInactiveClientsLoading(false); }
    })();

    const qPending = query(collection(db, 'pending_order_alerts'), orderBy('createdAt', 'desc'), limit(10));
    const unsubPending = onSnapshot(qPending, (snap) => {
      setPendingOrdersHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error('pending_order_alerts listen', e));

    const qInactive = query(collection(db, 'inactive_client_alerts'), orderBy('createdAt', 'desc'), limit(10));
    const unsubInactive = onSnapshot(qInactive, (snap) => {
      setInactiveClientsHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (e) => console.error('inactive_client_alerts listen', e));

    return () => { unsubPending(); unsubInactive(); };
  }, []);

  const savePendingOrdersSettings = async (next: typeof pendingOrdersSettings) => {
    setPendingOrdersSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'pendingOrdersAlerts'), next, { merge: true });
      setPendingOrdersSettings(next);
      toast.success(next.enabled ? 'Relances commandes en attente activées' : 'Relances commandes en attente désactivées');
    } catch (e) {
      console.error(e);
      toast.error('Erreur sauvegarde des réglages');
    } finally {
      setPendingOrdersSaving(false);
    }
  };

  const saveInactiveClientsSettings = async (next: typeof inactiveClientsSettings) => {
    setInactiveClientsSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'inactiveClientsAlerts'), next, { merge: true });
      setInactiveClientsSettings(next);
      toast.success(next.enabled ? 'Relances clients inactifs activées' : 'Relances clients inactifs désactivées');
    } catch (e) {
      console.error(e);
      toast.error('Erreur sauvegarde des réglages');
    } finally {
      setInactiveClientsSaving(false);
    }
  };

  // Déclenchement manuel immédiat, bypass le verrou de fréquence
  // puisqu'appelé avec le jeton admin (voir dual-auth dans la route).
  const runPeriodicChecksNow = async () => {
    setPeriodicChecksRunning(true);
    try {
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch(apiUrl('/api/system/periodic-checks'), {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast.error(data?.error || 'Erreur lors du déclenchement'); return; }
      if (data?.skipped) { toast.info(data.reason || 'Rien à relancer pour le moment'); return; }
      const poCount = data?.pendingOrders?.notified ?? 0;
      const icCount = data?.inactiveClients?.notified ?? 0;
      toast.success(`${poCount} commande(s) relancée(s), ${icCount} client(s) relancé(s)`);
    } catch (e) {
      console.error(e);
      toast.error('Erreur réseau');
    } finally {
      setPeriodicChecksRunning(false);
    }
  };

  const sendAiMessage = async () => {
    const userMsg = aiInput.trim();
    if (!userMsg || aiLoading) return;

    // Contexte métier injecté automatiquement
    const systemPrompt = `Tu es un assistant expert pour AgriMarché, une plateforme agricole sénégalaise.
Contexte actuel:
- Commandes totales: ${orders.length} (dont ${orders.filter(o=>o.status==='en_attente').length} en attente)
- Chiffre d'affaires: ${totalRevenue.toLocaleString()} FCFA
- Utilisateurs: ${users.length}
- Produits: ${products.length}
- Financements en attente: ${pendingLoans}
- Anomalies détectées: ${anomalies.length}
Réponds toujours en français, de façon concise et professionnelle. Si on te pose des questions sur les données, utilise ces chiffres.`;

    const newMsg: ChatMessage = { role: 'user', content: userMsg, ts: Date.now() };
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
      const reply = data?.choices?.[0]?.message?.content ?? "Erreur: réponse invalide.";
      setAiMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch (e) {
      setAiMessages(prev => [...prev, { role: 'assistant', content: "❌ Erreur de connexion à DeepSeek. Vérifiez votre clé API.", ts: Date.now() }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => aiEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  // ── CODES D'ACCÈS IA ──────────────────────────────────────

  const fetchAccessCodes = useCallback(async () => {
    setLoadingCodes(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'accessCodes'), orderBy('createdAt', 'desc'))
      );
      setAccessCodes(snap.docs.map(d => ({ id: d.id, ...d.data() } as AccessCode)));
    } catch (err) {
      toast.error('Erreur chargement des codes');
    } finally {
      setLoadingCodes(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'ai-codes') fetchAccessCodes();
  }, [activeTab, fetchAccessCodes]);

  const generateAccessCodes = async () => {
    setGeneratingCodes(true);
    const created: string[] = [];
    try {
      for (let i = 0; i < codeCount; i++) {
        const random = Math.random().toString(36).substring(2, 10).toUpperCase();
        const code = `AGRI-${random}`;
        const expiresAt = new Date();
        expiresAt.setMonth(expiresAt.getMonth() + 3);
        await setDoc(doc(db, 'accessCodes', code), {
          days: codeDays,
          used: false,
          usedBy: '',
          usedAt: null,
          expiresAt: Timestamp.fromDate(expiresAt),
          createdAt: Timestamp.now(),
        });
        created.push(code);
      }
      setNewCodes(created);
      toast.success(`${created.length} code(s) créé(s) !`);
      await fetchAccessCodes();
    } catch (err) {
      toast.error('Erreur lors de la génération');
    } finally {
      setGeneratingCodes(false);
    }
  };

  const markAllNotificationsRead = async () => {
    const batch = writeBatch(db);
    notifications.filter(n => !n.read && n.id).forEach(n => {
      batch.update(doc(db, 'notifications', n.id!), { read: true });
    });
    await batch.commit();
    toast.success('Tout marqué comme lu');
  };

  // ── FILTERS ───────────────────────────────────────────────

  // ⚠️ FIX AFFICHAGE COLONNE "Vendeur" : la table `orders` affichait
  // `order.sellerName ?? order.farmer ?? '—'` — mais un bug côté
  // checkout/page.tsx (produits créés sans `sellerName`, désormais corrigé
  // dans seller/products/add/page.tsx) faisait retomber `sellerName` sur
  // le défaut littéral `'AgriMarché'`. Comme ce champ était déjà rempli
  // (avec la mauvaise valeur), le `?? order.farmer` ne se déclenchait
  // JAMAIS — `??` ne retombe que sur `null`/`undefined`, pas sur une
  // chaîne non vide mais fausse. Résultat : TOUTES les commandes
  // affichaient "AgriMarché" au lieu du vrai vendeur, y compris celles où
  // `order.farmer` contenait déjà le bon nom.
  //
  // Fix définitif et rétroactif : on résout le nom du vendeur depuis la
  // collection `users` (déjà chargée ci-dessus, source de vérité pour un
  // compte vendeur réel) via `sellerId`/`farmerId`. Ça corrige l'affichage
  // pour TOUTES les commandes existantes en base, même celles créées avant
  // ce correctif — pas seulement les nouvelles. On ne retombe sur les
  // champs stockés sur la commande (`sellerName` puis `farmer`) que si
  // aucun compte utilisateur correspondant n'est trouvé, et on ignore
  // explicitement la valeur placeholder `'AgriMarché'` à chaque étage pour
  // ne jamais l'afficher tant qu'une vraie info existe quelque part.
  const usersById = useMemo(() => {
    const map = new Map<string, UserProfile>();
    users.forEach(u => { if (u.uid) map.set(u.uid, u); });
    return map;
  }, [users]);

  const PLACEHOLDER_SELLER_NAME = 'AgriMarché';
  const getOrderSellerName = useCallback((order: Order): string => {
    const sellerAccount = usersById.get(order.sellerId || order.farmerId || '');
    if (sellerAccount?.displayName) return sellerAccount.displayName;
    if (order.sellerName && order.sellerName !== PLACEHOLDER_SELLER_NAME) return order.sellerName;
    if (order.farmer && order.farmer !== PLACEHOLDER_SELLER_NAME) return order.farmer;
    return order.sellerName || order.farmer || '—';
  }, [usersById]);

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return o.orderNumber?.toLowerCase().includes(q)
        || o.farmer?.toLowerCase().includes(q)
        || getOrderSellerName(o).toLowerCase().includes(q);
    }
    return true;
  }), [orders, statusFilter, searchQuery, getOrderSellerName]);

  const paginatedOrders = useMemo(() => {
    const start = currentPage * pageSize;
    return filteredOrders.slice(start, start + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredOrders.length / pageSize);

  // ── CHART DATA ────────────────────────────────────────────

  const monthlyRevenue = useMemo(() => {
    const months = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
    const year = new Date().getFullYear();
    return months.map((month, i) => ({
      month,
      revenue: orders.filter(o => {
        const d = o.createdAt?.toDate?.();
        return d && d.getMonth() === i && d.getFullYear() === year && o.status === 'livre';
      }).reduce((s,o) => s + (o.amount ?? 0), 0)
    }));
  }, [orders]);

  const categoryData = useMemo(() => {
    const cats: Record<string,number> = {};
    products.forEach(p => { cats[p.category] = (cats[p.category] ?? 0) + 1; });
    return Object.entries(cats).map(([name,value]) => ({ name, value }));
  }, [products]);

  // ── PRODUITS : recherche, filtre catégorie, tri, statistiques ──────
  const productCategories = useMemo(
    () => Array.from(new Set(products.map(p => p.category).filter(Boolean))).sort(),
    [products]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearchQuery.trim().toLowerCase();
    const list = products.filter(p => {
      if (productCategoryFilter !== 'all' && p.category !== productCategoryFilter) return false;
      if (!q) return true;
      return p.name?.toLowerCase().includes(q) || p.sellerName?.toLowerCase().includes(q) || p.region?.toLowerCase().includes(q);
    });
    return [...list].sort((a, b) => {
      switch (productSort) {
        case 'stock-asc':  return (a.stock ?? 0) - (b.stock ?? 0);
        case 'stock-desc': return (b.stock ?? 0) - (a.stock ?? 0);
        case 'price-asc':  return (a.price ?? 0) - (b.price ?? 0);
        case 'price-desc': return (b.price ?? 0) - (a.price ?? 0);
        default:            return (a.name || '').localeCompare(b.name || '');
      }
    });
  }, [products, productCategoryFilter, productSearchQuery, productSort]);

  const productStats = useMemo(() => ({
    total:      products.length,
    totalValue: products.reduce((s,p) => s + (p.price || 0) * (p.stock || 0), 0),
    lowStock:   products.filter(p => p.stock > 0 && p.stock < 5).length,
    outOfStock: products.filter(p => p.stock === 0).length,
    // Marge plateforme potentielle sur tout le catalogue en stock — admin uniquement.
    marginValue: products.reduce((s,p) => s + computeAdminMargin(pricingByProduct[p.id!] ?? inferBasePrice(p.price || 0)) * (p.stock || 0), 0),
  }), [products, pricingByProduct]);

  // ── VARIATIONS RÉELLES DES KPIs ──────────────────────────────
  // ⚠️ FIX : les 6 pourcentages affichés sur les cartes KPI (+12.4%,
  // +8.2%, -2.3%...) étaient des constantes codées en dur — toujours les
  // mêmes, quelle que soit l'activité réelle. Un admin voyait "+12.4%" sur
  // le chiffre d'affaires même un mois catastrophique. Remplacé par un
  // vrai calcul glissant 30 jours vs 30 jours précédents (plutôt qu'un
  // simple "mois civil en cours", qui biaiserait fortement en début de
  // mois). Retourne `undefined` (pas de badge, plutôt qu'un pourcentage
  // inventé) quand la période précédente est vide : une division par zéro
  // ne raconte rien d'utile.
  function periodChangePercent<T extends { createdAt?: Timestamp }>(
    items: T[],
    valueOf: (item: T) => number,
    days = 30
  ): number | undefined {
    const now = Date.now();
    const msDay = 24 * 60 * 60 * 1000;
    const curStart = now - days * msDay;
    const prevStart = now - 2 * days * msDay;
    let cur = 0, prev = 0;
    for (const item of items) {
      const t = item.createdAt?.toMillis?.();
      if (!t) continue;
      if (t >= curStart) cur += valueOf(item);
      else if (t >= prevStart) prev += valueOf(item);
    }
    if (prev === 0) return cur > 0 ? undefined : 0;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  }

  const revenueChange = useMemo(
    () => periodChangePercent<Order>(orders.filter(o => o.status === 'livre'), o => o.amount ?? 0),
    [orders]
  );
  const ordersChange = useMemo(() => periodChangePercent<Order>(orders, () => 1), [orders]);
  const loansChange = useMemo(() => periodChangePercent<Loan>(loans, l => l.amount ?? 0), [loans]);
  const usersChange = useMemo(() => periodChangePercent<UserProfile>(users, () => 1), [users]);
  const deliverersChange = useMemo(() => periodChangePercent<UserProfile>(deliveryPersons, () => 1), [deliveryPersons]);

  // ── KPIs ──────────────────────────────────────────────────
  const kpis = [
    { label:"Chiffre d'affaires",  value:totalRevenue,    change:revenueChange,    icon:<TrendingUp size={20} color="#06b6d4"/>,  color:'#06b6d4' },
    { label:"Revenus plateforme",  value:platformRevenue, change:revenueChange,    icon:<Banknote size={20} color="#10b981"/>,    color:'#10b981' },
    { label:"Commandes",           value:orders.length,   change:ordersChange,     icon:<Package size={20} color="#8b5cf6"/>,    color:'#8b5cf6' },
    { label:"Financements (FCFA)", value:totalLoanVolume, change:loansChange,      icon:<Wallet size={20} color="#f59e0b"/>,     color:'#f59e0b' },
    { label:"Utilisateurs",        value:users.length,    change:usersChange,      icon:<Users size={20} color="#ec4899"/>,      color:'#ec4899' },
    { label:"Livreurs actifs",     value:deliveryPersons.length, change:deliverersChange, icon:<Truck size={20} color="#06b6d4"/>,color:'#06b6d4' },
  ];

  // ── NAV ───────────────────────────────────────────────────
  const navItems = [
    { id:'dashboard',      label:'Tableau de bord',  icon:<LayoutDashboard size={18}/>, badge:0 },
    { id:'orders',         label:'Commandes',         icon:<Package size={18}/>,         badge:orders.filter(o=>o.status==='en_attente').length },
    { id:'users',          label:'Utilisateurs',      icon:<Users size={18}/>,            badge:0 },
    { id:'products',       label:'Produits',           icon:<Leaf size={18}/>,            badge:productStats.lowStock + productStats.outOfStock },
    { id:'loans',          label:'Financements',       icon:<Banknote size={18}/>,        badge:pendingLoans },
    { id:'analytics',      label:'Analyses IA',        icon:<Brain size={18}/>,           badge:0 },
    { id:'ai-assistant',   label:'Assistant DeepSeek',  icon:<Sparkles size={18}/>,        badge:0 },
    { id:'ai-codes',       label:'Codes IA',             icon:<Key size={18}/>,              badge:0 },
    { id:'regions',        label:'Régions',             icon:<MapIcon size={18}/>,             badge:0 },
    { id:'weather',        label:'Météo Sénégal',        icon:<Cloud size={18}/>,            badge:0 },
    { id:'broadcast',      label:'Diffusion',           icon:<Send size={18}/>,            badge:0 },
    { id:'ads',            label:'Promos & Pubs',        icon:<Megaphone size={18}/>,       badge:0 },
    { id:'reviews',        label:'Avis clients',         icon:<Star size={18}/>,            badge:reviews.filter(r=>r.rating<=2).length },
    { id:'notifications',  label:'Notifications',       icon:<BellRing size={18}/>,        badge:unreadCount },
    { id:'delivery',       label:'Livraisons',          icon:<Truck size={18}/>,           badge:0 },
    { id:'logistics',      label:'Performance logistique', icon:<TrendingUp size={18}/>,   badge:0 },
    { id:'settings',       label:'Paramètres',          icon:<Settings size={18}/>,        badge:0 },
  ];

  // ── LOADING ───────────────────────────────────────────────
  if (loading) {
    return (
      <AdminGuard>
        <div style={{ display:'flex', height:'100vh', alignItems:'center', justifyContent:'center', background:'#0a0c10' }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:48, height:48, border:'3px solid rgba(16,185,129,.2)', borderTopColor:'#10b981', borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto 16px' }} />
            <p style={{ color:'#6b7280' }}>Chargement du dashboard…</p>
          </div>
        </div>
      </AdminGuard>
    );
  }

  // ── RENDER ────────────────────────────────────────────────
  return (
    <AdminGuard>
      <style>{styles}</style>

      <div style={{ display:'flex', minHeight:'100vh', background:'#0a0c10' }}>

        {/* ══ SIDEBAR ══════════════════════════════════════════ */}
        <aside style={{
          width: sidebarOpen ? 260 : 72, transition:'width .3s ease',
          background:'#111317', borderRight:'1px solid #1f2127',
          position:'fixed', height:'100vh', overflow:'hidden', zIndex:50,
          display:'flex', flexDirection:'column'
        }}>
          {/* Logo */}
          <div style={{ padding:'20px 16px', borderBottom:'1px solid #1f2127', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
            <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#10b981,#059669)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:'bold', flexShrink:0 }}>A</div>
            {sidebarOpen && <div><div style={{ fontWeight:700, fontSize:16 }}>AgriMarché</div><div style={{ fontSize:11, color:'#6b7280' }}>Admin Dashboard</div></div>}
          </div>

          {/* Nav */}
          <nav style={{ padding:'12px', flex:1, overflowY:'auto', display:'flex', flexDirection:'column', gap:2 }}>
            {navItems.map(item => (
              <div key={item.id} onClick={() => { if (item.id === 'logistics') { router.push('/admin/logistics'); return; } setActiveTab(item.id); setCurrentPage(0); }} style={{
                display:'flex', alignItems:'center', gap:12, padding:'9px 12px',
                borderRadius:12, cursor:'pointer',
                background:activeTab===item.id?'rgba(16,185,129,.1)':'transparent',
                color:activeTab===item.id?'#10b981':'#9ca3af', transition:'all .2s'
              }}>
                {item.icon}
                {sidebarOpen && <span style={{ flex:1, fontSize:13 }}>{item.label}</span>}
                {sidebarOpen && item.badge > 0 && (
                  <span style={{ background:'#10b981', color:'white', fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:20, minWidth:18, textAlign:'center' }}>{item.badge}</span>
                )}
              </div>
            ))}
          </nav>

          {/* Déconnexion */}
          <div style={{ padding:'12px', borderTop:'1px solid #1f2127', flexShrink:0 }}>
            <div onClick={() => signOut(auth).then(() => router.push('/'))} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 12px', borderRadius:12, cursor:'pointer', color:'#ef4444' }}>
              <LogOut size={18} />
              {sidebarOpen && <span style={{ fontSize:13 }}>Déconnexion</span>}
            </div>
          </div>

          {/* Toggle */}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            position:'absolute', right:-12, top:'50%', transform:'translateY(-50%)',
            width:24, height:24, borderRadius:'50%', background:'#1f2127',
            border:'1px solid #2d2f36', display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', color:'#9ca3af'
          }}>
            {sidebarOpen ? <ChevronLeft size={14}/> : <ChevronRight size={14}/>}
          </button>
        </aside>

        {/* ══ MAIN ═════════════════════════════════════════════ */}
        <main style={{ flex:1, marginLeft:sidebarOpen?260:72, transition:'margin-left .3s ease' }}>

          {/* Header */}
          <header style={{
            position:'sticky', top:0, zIndex:40,
            background:'rgba(10,12,16,.92)', backdropFilter:'blur(12px)',
            borderBottom:'1px solid #1f2127', padding:'12px 24px',
            display:'flex', justifyContent:'space-between', alignItems:'center'
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:16 }}>
              <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer' }}><Menu size={20}/></button>
              <h1 style={{ fontSize:18, fontWeight:700 }}>{navItems.find(n=>n.id===activeTab)?.label}</h1>
              <div style={{ fontSize:11, color:'#4b5563' }}>sync {lastSync.toLocaleTimeString()}</div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, background:'#1f2127', padding:'5px 10px', borderRadius:20 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:'#10b981', animation:'pulse 2s infinite' }}/>
                <span style={{ fontSize:10, color:'#9ca3af' }}>LIVE</span>
              </div>
              <button onClick={() => setActiveTab('notifications')} style={{ background:'none', border:'none', color:'#9ca3af', cursor:'pointer', position:'relative' }}>
                <Bell size={18}/>
                {unreadCount > 0 && (
                  <span style={{ position:'absolute', top:-4, right:-4, background:'#ef4444', fontSize:9, padding:'1px 4px', borderRadius:10, minWidth:15, textAlign:'center' }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              <div style={{ width:34, height:34, borderRadius:'50%', background:'linear-gradient(135deg,#10b981,#059669)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600 }}>
                {authUser?.displayName?.charAt(0) ?? 'A'}
              </div>
            </div>
          </header>

          {/* ── Content ───────────────────────────────────────── */}
          <div style={{ padding:24 }}>

            {/* ═══ DASHBOARD — DIVIN ══════════════════════════ */}
            {activeTab === 'dashboard' && (
              <div className="animate-fadeIn">

                {/* ── Hero cosmique ── */}
                <div className="divine-hero" style={{
                  position:'relative', overflow:'hidden', borderRadius:24, padding:'30px 26px', marginBottom:24,
                  background:'radial-gradient(ellipse 130% 90% at 15% -15%,rgba(16,185,129,0.16),transparent 55%), radial-gradient(ellipse 100% 80% at 100% 100%,rgba(139,92,246,0.14),transparent 55%), linear-gradient(135deg,#070b09 0%,#0f1720 50%,#0a0f0d 100%)',
                  border:'1px solid rgba(16,185,129,0.35)', boxShadow:'0 20px 60px rgba(0,0,0,0.35)',
                }}>
                  <div style={{ position:'absolute', top:-100, right:-70, width:280, height:280, pointerEvents:'none' }}>
                    <div className="divine-halo" style={{ width:'100%', height:'100%', borderRadius:'50%', background:'conic-gradient(from 0deg,rgba(16,185,129,0.3),transparent 30%,transparent 60%,rgba(139,92,246,0.28),transparent 90%)' }}/>
                  </div>
                  {[
                    { top:'18%', left:'70%', size:3, delay:'0s' },
                    { top:'60%', left:'82%', size:2, delay:'.9s' },
                    { top:'35%', left:'92%', size:4, delay:'1.6s' },
                    { top:'75%', left:'62%', size:2, delay:'2.3s' },
                  ].map((p,i)=>(
                    <span key={i} className="divine-sparkle" style={{ top:p.top, left:p.left, width:p.size, height:p.size, background:'#6ee7b7', boxShadow:'0 0 8px 2px rgba(110,231,183,0.8)', animationDelay:p.delay }}/>
                  ))}
                  <div style={{ display:'flex', alignItems:'center', gap:16, position:'relative', zIndex:1 }}>
                    <div style={{ position:'relative', width:56, height:56, flexShrink:0 }}>
                      <div style={{ position:'absolute', inset:0, borderRadius:16, animation:'ringExpand 2.4s ease-out infinite', border:'1px solid rgba(16,185,129,0.5)' }}/>
                      <div style={{ width:56, height:56, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#10b981,#34d399,#059669)', boxShadow:'0 8px 28px rgba(16,185,129,0.5), inset 0 1px 2px rgba(255,255,255,0.5)' }}>
                        <LayoutDashboard size={26} color="#052e18"/>
                      </div>
                    </div>
                    <div>
                      <h2 className="divine-shimmer-text" style={{
                        fontSize:26, fontWeight:800, letterSpacing:0.3, margin:0,
                        backgroundImage:'linear-gradient(110deg,#059669 10%,#6ee7b7 35%,#fff 50%,#6ee7b7 65%,#059669 90%)',
                        WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent',
                      }}>
                        Tableau de bord
                      </h2>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:4, letterSpacing:1.6, textTransform:'uppercase', display:'flex', alignItems:'center', gap:6 }}>
                        <Star size={10} color="#10b981" fill="#10b981"/> Vue d'ensemble · AgriMarché · Temps réel
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, marginBottom:24 }}>
                  {kpis.map((kpi,i) => <StatCard key={i} {...kpi}/>)}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:24, marginBottom:24 }}>
                  <div className="divine-card" style={{ padding:20, borderRadius:20, background:'linear-gradient(160deg,rgba(16,185,129,0.05),rgba(10,12,16,.98))', border:'1px solid rgba(16,185,129,0.2)' }}>
                    <h3 style={{ fontSize:15, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                      <TrendingUp size={16} color="#10b981"/> Revenus mensuels
                    </h3>
                    <div style={{ height:280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyRevenue}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.45}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2127"/>
                          <XAxis dataKey="month" stroke="#6b7280" fontSize={11}/>
                          <YAxis stroke="#6b7280" fontSize={11} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                          <Tooltip contentStyle={{ background:'#111317', border:'1px solid rgba(16,185,129,0.3)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,0.5)' }} formatter={(v:any)=>`${Number(v).toLocaleString()} FCFA`}/>
                          <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2.5}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="divine-card" style={{ padding:20, borderRadius:20, background:'linear-gradient(160deg,rgba(139,92,246,0.05),rgba(10,12,16,.98))', border:'1px solid rgba(139,92,246,0.2)' }}>
                    <h3 style={{ fontSize:15, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                      <Sparkles size={16} color="#8b5cf6"/> Catégories
                    </h3>
                    <div style={{ height:280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} label={({name,percent})=>`${name} ${((percent ?? 0)*100).toFixed(0)}%`}>
                            {categoryData.map((_,i) => <Cell key={i} fill={['#10b981','#06b6d4','#8b5cf6','#f59e0b','#ef4444'][i%5]}/>)}
                          </Pie>
                          <Tooltip contentStyle={{ background:'#111317', border:'1px solid rgba(139,92,246,0.3)', borderRadius:10, boxShadow:'0 10px 30px rgba(0,0,0,0.5)' }}/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                {/* Recent orders */}
                <div className="divine-card" style={{ padding:20, borderRadius:20, background:'linear-gradient(160deg,rgba(6,182,212,0.05),rgba(10,12,16,.98))', border:'1px solid rgba(6,182,212,0.2)' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                    <h3 style={{ fontSize:15, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                      <Package size={16} color="#06b6d4"/> Dernières commandes
                    </h3>
                    <button onClick={()=>setActiveTab('orders')} className="btn-secondary" style={{ padding:'6px 12px', fontSize:12 }}>Voir tout →</button>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #1f2127' }}>
                          {['N°','Client','Montant','Commission','Statut'].map(h => (
                            <th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11, color:'#6b7280', letterSpacing:0.8, textTransform:'uppercase' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0,5).map(o => (
                          <tr key={o.id} style={{ borderBottom:'1px solid #1a1c22', transition:'background .2s' }}>
                            <td style={{ padding:'10px 8px', fontFamily:'monospace', fontSize:12, color:'#10b981' }}>{o.orderNumber}</td>
                            {/* ⚠️ FIX : {o.farmer} est un champ legacy jamais
                                renseigné par checkout/page.tsx (voir le
                                commentaire sur l'interface Order) — cette
                                colonne "Client" était vide pour toute
                                commande réelle. Même repli que l'onglet
                                Commandes plus bas (ligne userName ?? farmer). */}
                            <td style={{ padding:'10px 8px', fontSize:13 }}>{o.userName ?? o.farmer ?? '—'}</td>
                            <td style={{ padding:'10px 8px', fontWeight:700 }}>{(o.amount ?? 0).toLocaleString()} FCFA</td>
                            <td style={{ padding:'10px 8px', fontSize:12, color:'#f59e0b' }}>{Math.round((o.amount ?? 0)*COMMISSION_RATE).toLocaleString()} FCFA</td>
                            <td style={{ padding:'10px 8px' }}><StatusBadge status={o.status}/></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ COMMANDES ══════════════════════════════════ */}
            {activeTab === 'orders' && (
              <div className="glass-card animate-fadeIn" style={{ padding:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16, marginBottom:20 }}>
                  <div>
                    <h2 style={{ fontSize:18, fontWeight:700 }}>📦 Commandes</h2>
                    <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{orders.length} total · {deliveredOrders} livrées · {platformRevenue.toLocaleString()} FCFA commission</p>
                  </div>
                  <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                    <div style={{ position:'relative' }}>
                      <Search size={15} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#6b7280' }}/>
                      <input type="text" placeholder="Rechercher…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} style={{ paddingLeft:32, width:200 }}/>
                    </div>
                    <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ width:'auto' }}>
                      <option value="all">Tous</option>
                      <option value="en_attente">En attente</option>
                      <option value="en_preparation">En préparation</option>
                      <option value="en_livraison">En livraison</option>
                      <option value="livre">Livrée</option>
                      <option value="annule">Annulée</option>
                    </select>
                    <button onClick={()=>{ const ws=XLSX.utils.json_to_sheet(orders); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'Commandes'); XLSX.writeFile(wb,`commandes_${Date.now()}.xlsx`); toast.success('Export OK'); }} className="btn-secondary">
                      <Download size={14}/> Export
                    </button>
                  </div>
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid #1f2127' }}>
                        {['N°','Client','Produit','Vendeur','Région','Montant','Commission','Statut','Actions'].map(h=>(
                          <th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11, color:'#6b7280' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map(order => (
                        <tr key={order.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                          <td style={{ padding:'10px 8px', fontFamily:'monospace', fontSize:12, color:'#10b981' }}>{order.orderNumber}</td>
                          <td style={{ padding:'10px 8px', fontSize:13 }}>{order.userName ?? order.farmer ?? '—'}</td>
                          <td style={{ padding:'10px 8px', fontSize:13, maxWidth:220 }}>
                            {order.items && order.items.length > 0 ? (
                              <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                                {order.items.slice(0,2).map((it,idx)=>(
                                  <div key={idx} style={{ display:'flex', alignItems:'baseline', gap:5, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                                    <span style={{ fontWeight:600 }}>{it.productName ?? 'Produit inconnu'}</span>
                                    <span style={{ color:'#6b7280', fontSize:11 }}>×{it.quantity ?? 1}</span>
                                  </div>
                                ))}
                                {order.items.length > 2 && (
                                  <span style={{ fontSize:11, color:'#6b7280' }}>+{order.items.length - 2} autre{order.items.length - 2 > 1 ? 's' : ''}</span>
                                )}
                              </div>
                            ) : (order.category ?? '—')}
                          </td>
                          <td style={{ padding:'10px 8px', fontSize:12 }}>{getOrderSellerName(order)}</td>
                          <td style={{ padding:'10px 8px', fontSize:12 }}>{order.sellerRegion ?? order.region ?? '—'}</td>
                          <td style={{ padding:'10px 8px', fontWeight:600 }}>{(order.amount ?? 0).toLocaleString()} FCFA</td>
                          <td style={{ padding:'10px 8px', color:'#f59e0b', fontSize:12 }}>{Math.round((order.amount ?? 0)*COMMISSION_RATE).toLocaleString()} FCFA</td>
                          <td style={{ padding:'10px 8px' }}>
                            <StatusBadge status={order.status}/>
                            {order.delivererId && (
                              <div style={{ fontSize:11, color:'#6b7280', marginTop:4 }}>
                                🚴 {order.delivererName} · {order.delivererPhone}
                                {order.tracking?.phase && (
                                  <span style={{
                                    marginLeft:6, padding:'1px 6px', borderRadius:6, fontSize:10, fontWeight:600,
                                    background: order.tracking.phase === 'arrived' ? 'rgba(16,185,129,.15)' : 'rgba(6,182,212,.15)',
                                    color: order.tracking.phase === 'arrived' ? '#10b981' : '#06b6d4',
                                  }}>
                                    {{ assigned: 'Attribué', en_route: 'En route', approaching: 'Proche', arrived: 'Arrivé' }[order.tracking.phase]}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding:'10px 8px' }}>
                            <div style={{ display:'flex', gap:6 }}>
                              <select value={order.status} onChange={e=>updateOrderStatus(order.id!,e.target.value as Order['status'])} style={{ width:'auto', padding:'5px 8px', fontSize:11 }}>
                                <option value="en_attente">En attente</option>
                                <option value="en_preparation">En préparation</option>
                                <option value="en_livraison">En livraison</option>
                                <option value="livre">Livrée</option>
                                <option value="annule">Annulée</option>
                              </select>
                              {(order.status === 'en_attente' || (order.status === 'en_preparation' && !order.delivererId)) && (
                                <button onClick={()=>{ setAssignOrderId(order.id!); setAssignOrderNumber(order.orderNumber); setShowAssignModal(true); }} className="btn-secondary" style={{ padding:'5px 10px', fontSize:11 }}>
                                  Assigner
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:20 }}>
                    <button disabled={currentPage===0} onClick={()=>setCurrentPage(p=>p-1)} className="btn-secondary" style={{ padding:'7px 14px' }}>← Préc.</button>
                    <span style={{ padding:'7px 14px', color:'#6b7280', fontSize:13 }}>Page {currentPage+1}/{totalPages}</span>
                    <button disabled={currentPage>=totalPages-1} onClick={()=>setCurrentPage(p=>p+1)} className="btn-secondary" style={{ padding:'7px 14px' }}>Suiv. →</button>
                  </div>
                )}
              </div>
            )}

            {/* ═══ UTILISATEURS ═══════════════════════════════ */}
            {activeTab === 'users' && (
              <div className="animate-fadeIn">
                {/* Stats par rôle */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:14, marginBottom:20 }}>
                  {[
                    { label:'Total',    value:userStatsByRole.total,    color:'#e5e7eb', role:'all' },
                    { label:'Clients',  value:userStatsByRole.client,   color:'#10b981', role:'client' },
                    { label:'Vendeurs', value:userStatsByRole.seller,   color:'#06b6d4', role:'seller' },
                    { label:'Livreurs', value:userStatsByRole.delivery, color:'#f59e0b', role:'delivery' },
                    { label:'Admins',   value:userStatsByRole.admin,    color:'#8b5cf6', role:'admin' },
                  ].map(s => (
                    <button
                      key={s.label}
                      onClick={()=>setUserRoleFilter(s.role)}
                      className="glass-card"
                      style={{ padding:14, textAlign:'left', cursor:'pointer', border: userRoleFilter===s.role ? `1px solid ${s.color}` : '1px solid transparent' }}
                    >
                      <div style={{ fontSize:22, fontWeight:700, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{s.label}</div>
                    </button>
                  ))}
                </div>

                <div className="glass-card animate-fadeIn" style={{ padding:20 }}>
                  <div style={{ display:'flex', flexWrap:'wrap', justifyContent:'space-between', alignItems:'center', gap:12, marginBottom:20 }}>
                    <div>
                      <h2 style={{ fontSize:18, fontWeight:700 }}>👥 Utilisateurs</h2>
                      <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>
                        {filteredUsers.length} compte{filteredUsers.length>1?'s':''}
                        {filteredUsers.length !== users.length && ` (sur ${users.length})`}
                      </p>
                    </div>
                    <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                      <div style={{ position:'relative' }}>
                        <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#6b7280' }}/>
                        <input
                          value={userSearch}
                          onChange={e=>setUserSearch(e.target.value)}
                          placeholder="Nom, email, téléphone…"
                          style={{ paddingLeft:30, width:220 }}
                        />
                      </div>
                      <select value={userRoleFilter} onChange={e=>setUserRoleFilter(e.target.value)} style={{ width:'auto' }}>
                        <option value="all">Tous les rôles</option>
                        <option value="client">Clients</option>
                        <option value="seller">Vendeurs</option>
                        <option value="delivery">Livreurs</option>
                        <option value="admin">Admins</option>
                      </select>
                      <select value={userSort} onChange={e=>setUserSort(e.target.value as any)} style={{ width:'auto' }}>
                        <option value="recent">Plus récents</option>
                        <option value="name">Nom (A-Z)</option>
                        <option value="role">Rôle</option>
                      </select>
                    </div>
                  </div>

                  {filteredUsers.length === 0 ? (
                    <div style={{ padding:'40px 0', textAlign:'center', color:'#6b7280', fontSize:13 }}>
                      Aucun utilisateur ne correspond à cette recherche.
                    </div>
                  ) : (
                    <>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid #1f2127' }}>
                              {['Utilisateur','Email','Téléphone','Rôle','Inscription','Actions'].map(h=>(
                                <th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11, color:'#6b7280' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paginatedUsers.map(user => {
                              const productCount = user.role === 'seller' ? (sellerProductCounts.get(user.id!) || 0) : null;
                              const roleColors: Record<string,string> = { client:'#10b981', seller:'#06b6d4', delivery:'#f59e0b', admin:'#8b5cf6' };
                              return (
                                <tr key={user.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                                  <td style={{ padding:'10px 8px' }}>
                                    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                      {user.avatar ? (
                                        <img src={user.avatar} alt="" style={{ width:32, height:32, borderRadius:'50%', objectFit:'cover', flexShrink:0 }}/>
                                      ) : (
                                        <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, flexShrink:0 }}>
                                          {user.displayName?.charAt(0) ?? '?'}
                                        </div>
                                      )}
                                      <div>
                                        <div style={{ fontSize:13 }}>{user.displayName || '—'}</div>
                                        {productCount !== null && (
                                          <div style={{ fontSize:10, color:'#6b7280' }}>{productCount} produit{productCount>1?'s':''}</div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td style={{ padding:'10px 8px', fontSize:12, color:'#9ca3af' }}>{user.email}</td>
                                  <td style={{ padding:'10px 8px', fontSize:12 }}>{user.phone || '—'}</td>
                                  <td style={{ padding:'10px 8px' }}>
                                    <select
                                      value={user.role}
                                      onChange={e=>{
                                        const nextRole = e.target.value;
                                        if (nextRole === 'admin' && !confirm(`Donner les droits ADMIN à ${user.displayName || user.email} ? Cette personne aura un accès complet au panneau d'administration.`)) return;
                                        updateUserRole(user.id!, nextRole);
                                      }}
                                      style={{ width:'auto', padding:'5px 8px', fontSize:11, color:roleColors[user.role], borderColor:roleColors[user.role] }}
                                    >
                                      <option value="client">Client</option>
                                      <option value="seller">Vendeur</option>
                                      <option value="delivery">Livreur</option>
                                      <option value="admin">Admin</option>
                                    </select>
                                  </td>
                                  <td style={{ padding:'10px 8px', fontSize:12, color:'#6b7280' }}>{user.createdAt?.toDate?.().toLocaleDateString?.() ?? '—'}</td>
                                  <td style={{ padding:'10px 8px', whiteSpace:'nowrap' }}>
                                    <button onClick={()=>setSelectedUser(user)} className="btn-secondary" style={{ padding:'5px 10px', fontSize:11, marginRight:6 }}><Eye size={11}/> Voir</button>
                                    <button
                                      onClick={()=>deleteUser(user.id!)}
                                      className="btn-secondary"
                                      style={{ padding:'5px 10px', fontSize:11, color:'#ef4444', borderColor:'#ef4444' }}
                                    >
                                      <X size={11}/> Suppr.
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {userTotalPages > 1 && (
                        <div style={{ display:'flex', justifyContent:'center', alignItems:'center', gap:10, marginTop:20 }}>
                          <button disabled={userPage===0} onClick={()=>setUserPage(p=>p-1)} className="btn-secondary" style={{ padding:'7px 14px' }}>← Préc.</button>
                          <span style={{ padding:'7px 14px', color:'#6b7280', fontSize:13 }}>Page {userPage+1}/{userTotalPages}</span>
                          <button disabled={userPage>=userTotalPages-1} onClick={()=>setUserPage(p=>p+1)} className="btn-secondary" style={{ padding:'7px 14px' }}>Suiv. →</button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}


            {/* ═══ PRODUITS ═══════════════════════════════════ */}
            {activeTab === 'products' && (
              <div className="animate-fadeIn" style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* ── EN-TÊTE + STATS ─────────────────────────── */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
                  <div>
                    <h2 style={{ fontSize:22, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                      <Leaf size={20} color="#10b981"/> Catalogue produits
                    </h2>
                    <p style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>
                      {filteredProducts.length} {filteredProducts.length>1?'produits affichés':'produit affiché'} sur {products.length} au total
                    </p>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))', gap:14 }}>
                  <div className="glass-card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'rgba(16,185,129,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Layers size={18} color="#10b981"/>
                    </div>
                    <div><div style={{ fontSize:20, fontWeight:700 }}>{productStats.total}</div><div style={{ fontSize:11, color:'#6b7280' }}>Produits référencés</div></div>
                  </div>
                  <div className="glass-card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'rgba(6,182,212,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <DollarSign size={18} color="#06b6d4"/>
                    </div>
                    <div><div style={{ fontSize:20, fontWeight:700 }}>{productStats.totalValue.toLocaleString()}</div><div style={{ fontSize:11, color:'#6b7280' }}>Valeur du stock (FCFA)</div></div>
                  </div>
                  <div className="glass-card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'rgba(245,158,11,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <Banknote size={18} color="#f59e0b"/>
                    </div>
                    <div><div style={{ fontSize:20, fontWeight:700 }}>{productStats.marginValue.toLocaleString()}</div><div style={{ fontSize:11, color:'#6b7280' }}>Marge plateforme potentielle (FCFA)</div></div>
                  </div>
                  <div className="glass-card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:12, borderColor:productStats.lowStock>0?'rgba(245,158,11,.35)':undefined }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'rgba(245,158,11,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <AlertTriangle size={18} color="#f59e0b"/>
                    </div>
                    <div><div style={{ fontSize:20, fontWeight:700, color:productStats.lowStock>0?'#f59e0b':undefined }}>{productStats.lowStock}</div><div style={{ fontSize:11, color:'#6b7280' }}>Stock faible (&lt;5)</div></div>
                  </div>
                  <div className="glass-card" style={{ padding:'16px 18px', display:'flex', alignItems:'center', gap:12, borderColor:productStats.outOfStock>0?'rgba(239,68,68,.35)':undefined }}>
                    <div style={{ width:40, height:40, borderRadius:12, background:'rgba(239,68,68,.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <PackageX size={18} color="#ef4444"/>
                    </div>
                    <div><div style={{ fontSize:20, fontWeight:700, color:productStats.outOfStock>0?'#ef4444':undefined }}>{productStats.outOfStock}</div><div style={{ fontSize:11, color:'#6b7280' }}>En rupture</div></div>
                  </div>
                </div>

                {/* ── BARRE DE RECHERCHE / FILTRES / TRI ──────── */}
                <div className="glass-card" style={{ padding:14, display:'flex', flexWrap:'wrap', gap:10, alignItems:'center' }}>
                  <div style={{ position:'relative', flex:'1 1 220px' }}>
                    <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#6b7280' }}/>
                    <input
                      value={productSearchQuery}
                      onChange={e=>setProductSearchQuery(e.target.value)}
                      placeholder="Rechercher un produit, un vendeur, une région…"
                      style={{ paddingLeft:36 }}
                    />
                  </div>
                  <div style={{ position:'relative', flex:'0 1 190px' }}>
                    <Filter size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#6b7280', pointerEvents:'none' }}/>
                    <select value={productCategoryFilter} onChange={e=>setProductCategoryFilter(e.target.value)} style={{ paddingLeft:32, appearance:'none' }}>
                      <option value="all">Toutes les catégories</option>
                      {productCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{ position:'relative', flex:'0 1 190px' }}>
                    <ArrowUpDown size={14} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#6b7280', pointerEvents:'none' }}/>
                    <select value={productSort} onChange={e=>setProductSort(e.target.value as typeof productSort)} style={{ paddingLeft:32, appearance:'none' }}>
                      <option value="name">Trier : Nom (A-Z)</option>
                      <option value="stock-asc">Trier : Stock croissant</option>
                      <option value="stock-desc">Trier : Stock décroissant</option>
                      <option value="price-asc">Trier : Prix croissant</option>
                      <option value="price-desc">Trier : Prix décroissant</option>
                    </select>
                  </div>
                </div>

                {/* ── GRILLE DE PRODUITS ───────────────────────── */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }}>
                {filteredProducts.map(product => {
                  const isEditing = editingProductId === product.id;
                  const cat = categoryStyle(product.category);
                  const isOut = product.stock === 0;
                  const isLow = !isOut && product.stock < 5;
                  const stockColor = isOut ? '#ef4444' : isLow ? '#f59e0b' : '#10b981';
                  return (
                  <div key={product.id} className="glass-card" style={{ padding:0, overflow:'hidden', position:'relative' }}>
                    {/* Liseré de couleur par catégorie */}
                    <div style={{ height:4, width:'100%', background:`linear-gradient(90deg, ${cat.color}, ${cat.color}00)` }}/>
                    <div style={{ padding:16 }}>
                    {isEditing ? (
                      <>
                        <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:12 }}>
                          <input value={productEditForm.name} onChange={e=>setProductEditForm(f=>({...f,name:e.target.value}))} placeholder="Nom du produit"
                            style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:14, fontWeight:600 }} />
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                            <input value={productEditForm.category} onChange={e=>setProductEditForm(f=>({...f,category:e.target.value}))} placeholder="Catégorie"
                              style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:12 }} />
                            <input value={productEditForm.region} onChange={e=>setProductEditForm(f=>({...f,region:e.target.value}))} placeholder="Région"
                              style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:12 }} />
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                            <div>
                              <input type="number" value={productEditForm.basePrice} onChange={e=>setProductEditForm(f=>({...f,basePrice:Number(e.target.value)}))} placeholder="Prix vendeur (FCFA)"
                                style={{ width:'100%', padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:12 }} />
                              <div style={{ fontSize:10, color:'#6b7280', marginTop:3 }}>Ce que le vendeur reçoit</div>
                            </div>
                            <input type="number" value={productEditForm.stock} onChange={e=>setProductEditForm(f=>({...f,stock:Number(e.target.value)}))} placeholder="Stock"
                              style={{ padding:'8px 10px', borderRadius:8, border:'1px solid rgba(255,255,255,0.12)', background:'rgba(255,255,255,0.05)', color:'#fff', fontSize:12 }} />
                          </div>
                          {/* Aperçu admin-only : prix affiché + marge — jamais visible du vendeur/acheteur */}
                          <div style={{ padding:'8px 10px', borderRadius:8, background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.2)', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:11 }}>
                            <span style={{ color:'#6b7280' }}>Prix affiché (acheteur + vendeur)</span>
                            <span style={{ fontWeight:700, color:'#10b981' }}>{computeDisplayPrice(productEditForm.basePrice).toLocaleString()} FCFA</span>
                          </div>
                          <div style={{ padding:'2px 10px', fontSize:10, color:'#6b7280' }}>
                            Marge admin : {computeAdminMargin(productEditForm.basePrice).toLocaleString()} FCFA ({Math.round(ADMIN_MARGIN_RATE*100)}%)
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={cancelEditProduct} disabled={productSaving} className="btn-secondary" style={{ flex:1, justifyContent:'center' }}>Annuler</button>
                          <button onClick={saveProductEdit} disabled={productSaving} className="btn-primary" style={{ flex:1, justifyContent:'center' }}>{productSaving?'Enregistrement...':'Enregistrer'}</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10, gap:10 }}>
                          <div style={{ display:'flex', gap:10, alignItems:'flex-start', minWidth:0 }}>
                            <div style={{ width:38, height:38, borderRadius:11, background:`${cat.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                              {cat.emoji}
                            </div>
                            <div style={{ minWidth:0 }}>
                              <span style={{ fontSize:11, color:'#6b7280' }}>{product.category || 'Sans catégorie'}</span>
                              <h3 style={{ fontSize:15, fontWeight:600, marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{product.name}</h3>
                            </div>
                          </div>
                          <div style={{ textAlign:'right', flexShrink:0 }}>
                            <span style={{ fontSize:17, fontWeight:700, color:'#10b981', whiteSpace:'nowrap' }}>{product.price.toLocaleString()} FCFA</span>
                            {product.unit && <div style={{ fontSize:10, color:'#6b7280' }}>/ {product.unit}</div>}
                          </div>
                        </div>

                        {/* Détail réservé à l'admin : jamais montré au vendeur ni à l'acheteur */}
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, padding:'6px 10px', borderRadius:8, background:'rgba(255,255,255,0.03)', fontSize:11 }}>
                          <span style={{ color:'#6b7280' }}>Prix vendeur : {(pricingByProduct[product.id!] ?? inferBasePrice(product.price)).toLocaleString()} FCFA</span>
                          <span style={{ color:'#f59e0b', fontWeight:600 }}>+{computeAdminMargin(pricingByProduct[product.id!] ?? inferBasePrice(product.price)).toLocaleString()} FCFA marge</span>
                        </div>

                        {(isOut || isLow) && (
                          <div style={{ marginBottom:10 }}>
                            <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 9px', borderRadius:20, fontSize:10, fontWeight:600, background:`${stockColor}18`, color:stockColor }}>
                              <AlertTriangle size={11}/> {isOut ? 'Rupture de stock' : 'Stock faible'}
                            </span>
                          </div>
                        )}

                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, fontSize:12, color:'#6b7280' }}>
                          <span>📍 {product.region}</span>
                          <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:140 }}>👤 {product.sellerName}</span>
                        </div>
                        <div style={{ marginBottom:14 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                            <span>Stock</span>
                            <span style={{ fontWeight:600, color:stockColor }}>{product.stock} unités</span>
                          </div>
                          <div style={{ height:5, background:'#1f2127', borderRadius:3, overflow:'hidden' }}>
                            <div style={{ width:`${Math.min(100,(product.stock/100)*100)}%`, height:'100%', background:`linear-gradient(90deg, ${stockColor}, ${stockColor}bb)`, borderRadius:3, transition:'width .3s' }}/>
                          </div>
                        </div>
                        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                          <button onClick={()=>updateProductStock(product.id!,product.stock-1)} className="btn-secondary" style={{ flex:1, justifyContent:'center' }}>−1</button>
                          <button onClick={()=>updateProductStock(product.id!,product.stock+10)} className="btn-primary" style={{ flex:1, justifyContent:'center' }}>+10</button>
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button onClick={()=>startEditProduct(product)} className="btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:12 }}><Pencil size={12}/> Modifier</button>
                          <button onClick={()=>deleteProduct(product.id!)} className="btn-secondary" style={{ flex:1, justifyContent:'center', fontSize:12, color:'#ef4444', borderColor:'#ef4444' }}><Trash2 size={12}/> Supprimer</button>
                        </div>
                      </>
                    )}
                    </div>
                  </div>
                  );
                })}
                {filteredProducts.length === 0 && products.length > 0 && (
                  <div className="glass-card" style={{ padding:40, textAlign:'center', gridColumn:'1/-1', color:'#6b7280' }}>
                    <Search size={28} style={{ opacity:.4, marginBottom:10 }}/>
                    <div style={{ fontWeight:600, color:'#9ca3af', marginBottom:4 }}>Aucun résultat</div>
                    <div style={{ fontSize:12 }}>Aucun produit ne correspond à votre recherche ou filtre.</div>
                  </div>
                )}
                {products.length === 0 && (
                  <div className="glass-card" style={{ padding:40, textAlign:'center', gridColumn:'1/-1', color:'#6b7280' }}>
                    <Leaf size={28} style={{ opacity:.4, marginBottom:10 }}/>
                    <div style={{ fontWeight:600, color:'#9ca3af', marginBottom:4 }}>Aucun produit trouvé</div>
                    <div style={{ fontSize:12 }}>Les produits publiés par les vendeurs apparaîtront ici.</div>
                  </div>
                )}
                </div>
              </div>
            )}

            {/* ═══ FINANCEMENTS ═══════════════════════════════ */}
            {activeTab === 'loans' && (
              <div className="animate-fadeIn" style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* ── KPI CARDS ─────────────────────────────── */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
                  {[
                    { icon:<Banknote size={18} color="#10b981"/>, label:'Volume total',       value:totalLoanVolume,                                                    color:'#10b981', suffix:' FCFA' },
                    { icon:<Clock size={18} color="#f59e0b"/>,    label:'En attente',          value:loans.filter(l=>l.status==='pending').length,                       color:'#f59e0b', suffix:'' },
                    { icon:<CheckCircle size={18} color="#06b6d4"/>, label:'Approuvés',        value:loans.filter(l=>l.status==='approved'||l.status==='active').length, color:'#06b6d4', suffix:'' },
                    { icon:<XCircle size={18} color="#ef4444"/>,  label:'Refusés',             value:loans.filter(l=>l.status==='rejected').length,                      color:'#ef4444', suffix:'' },
                    { icon:<CheckCircle size={18} color="#10b981"/>, label:'Remboursés',       value:loans.filter(l=>l.status==='paid').length,                          color:'#10b981', suffix:'' },
                    { icon:<DollarSign size={18} color="#8b5cf6"/>, label:'Montant moyen',     value:loans.length ? Math.round(totalLoanVolume/loans.length) : 0,         color:'#8b5cf6', suffix:' FCFA' },
                  ].map((kpi,i) => (
                    <div key={i} className="glass-card" style={{ padding:16 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                        <div style={{ width:36, height:36, borderRadius:10, background:`${kpi.color}18`, display:'flex', alignItems:'center', justifyContent:'center' }}>{kpi.icon}</div>
                        <span style={{ fontSize:11, color:'#6b7280' }}>{kpi.label}</span>
                      </div>
                      <div style={{ fontSize:20, fontWeight:700, color:kpi.color }}>
                        {kpi.value.toLocaleString()}{kpi.suffix}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── SIMULATEUR BANCAIRE ───────────────────── */}
                <div className="glass-card" style={{ padding:20 }}>
                  <h3 style={{ fontSize:15, fontWeight:600, marginBottom:18, display:'flex', alignItems:'center', gap:8 }}>
                    <Banknote size={17} color="#f59e0b"/> Simulateur de financement — Comparaison bancaire
                  </h3>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24, marginBottom:20 }}>
                    {/* Sliders */}
                    <div>
                      <div style={{ marginBottom:16 }}>
                        <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Montant souhaité</label>
                        <input type="range" min={100000} max={10000000} step={50000} value={loanSimAmount}
                          onChange={e=>setLoanSimAmount(parseInt(e.target.value))}
                          style={{ padding:0, border:'none', background:'transparent', cursor:'pointer', width:'100%' }}/>
                        <div style={{ fontSize:22, fontWeight:700, color:'#10b981', marginTop:6 }}>{loanSimAmount.toLocaleString()} FCFA</div>
                      </div>
                      <div>
                        <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Durée de remboursement</label>
                        <input type="range" min={3} max={60} step={3} value={loanSimDuration}
                          onChange={e=>setLoanSimDuration(parseInt(e.target.value))}
                          style={{ padding:0, border:'none', background:'transparent', cursor:'pointer', width:'100%' }}/>
                        <div style={{ fontSize:18, fontWeight:600, marginTop:6 }}>{loanSimDuration} mois</div>
                      </div>
                    </div>
                    {/* Best bank */}
                    <div>
                      {loanSimulation?.bestBank
                        ? <div style={{ background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.2)', borderRadius:12, padding:16 }}>
                            <div style={{ fontSize:11, color:'#10b981', marginBottom:10, fontWeight:600 }}>🏆 MEILLEURE OFFRE</div>
                            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                              <span style={{ fontSize:28 }}>{loanSimulation.bestBank.logo}</span>
                              <div>
                                <div style={{ fontWeight:700, fontSize:15 }}>{loanSimulation.bestBank.name}</div>
                                <div style={{ fontSize:11, color:'#6b7280' }}>Taux annuel: {loanSimulation.bestBank.rate}%</div>
                              </div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                              {[
                                ['Mensualité', `${loanSimulation.bestBank.monthlyPayment.toLocaleString()} FCFA`, '#10b981'],
                                ['Total à rembourser', `${loanSimulation.bestBank.totalPayment.toLocaleString()} FCFA`, '#06b6d4'],
                                ['Intérêts totaux', `${loanSimulation.bestBank.totalInterest.toLocaleString()} FCFA`, '#f59e0b'],
                                ['Frais de dossier', `${loanSimulation.bestBank.fees.toLocaleString()} FCFA`, '#8b5cf6'],
                              ].map(([k,v,c])=>(
                                <div key={k} style={{ background:'#1f2127', borderRadius:8, padding:10 }}>
                                  <div style={{ fontSize:10, color:'#6b7280', marginBottom:3 }}>{k}</div>
                                  <div style={{ fontSize:13, fontWeight:700, color:c as string }}>{v}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        : <div style={{ textAlign:'center', padding:40, color:'#6b7280', fontSize:13 }}>
                            Aucune banque disponible pour ces paramètres
                          </div>
                      }
                    </div>
                  </div>

                  {/* Toutes les offres */}
                  {loanSimulation?.offers && loanSimulation.offers.length > 0 && (
                    <div>
                      <div style={{ fontSize:12, color:'#6b7280', marginBottom:12, fontWeight:600 }}>COMPARAISON DES {loanSimulation.offers.length} BANQUES ÉLIGIBLES</div>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:10 }}>
                        {loanSimulation.offers.map((offer,i) => (
                          <div key={offer.name} style={{
                            padding:14, borderRadius:12,
                            background: i===0 ? 'rgba(16,185,129,.1)' : '#1f2127',
                            border: i===0 ? '1px solid rgba(16,185,129,.3)' : '1px solid #2a2c34',
                            position:'relative'
                          }}>
                            {i===0 && <div style={{ position:'absolute', top:8, right:10, fontSize:9, background:'#10b981', color:'#000', borderRadius:8, padding:'2px 7px', fontWeight:700 }}>BEST</div>}
                            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
                              <span style={{ fontSize:18 }}>{offer.logo}</span>
                              <span style={{ fontWeight:600, fontSize:13 }}>{offer.name}</span>
                            </div>
                            <div style={{ fontSize:20, fontWeight:700, color: i===0?'#10b981':'#fff' }}>{offer.monthlyPayment.toLocaleString()}</div>
                            <div style={{ fontSize:10, color:'#6b7280', marginBottom:8 }}>FCFA / mois</div>
                            <div style={{ fontSize:11, color:'#9ca3af' }}>Taux {offer.rate}% · {offer.totalPayment.toLocaleString()} total</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── TABLEAU D'AMORTISSEMENT ───────────────── */}
                {amortizationTable.length > 0 && (
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>📊 Tableau d'amortissement</h3>
                    <div style={{ overflowX:'auto', maxHeight:320, overflowY:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead style={{ position:'sticky', top:0, background:'#111317' }}>
                          <tr style={{ borderBottom:'1px solid #1f2127' }}>
                            {['Mois','Mensualité','Capital','Intérêts','Solde restant'].map(h=>(
                              <th key={h} style={{ padding:'8px 10px', textAlign:'right', color:'#6b7280', fontWeight:600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {amortizationTable.slice(0,24).map(row=>(
                            <tr key={row.month} style={{ borderBottom:'1px solid #1a1c22' }}>
                              <td style={{ padding:'7px 10px', textAlign:'right', color:'#6b7280' }}>{row.month}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right' }}>{row.payment.toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right', color:'#10b981' }}>{row.principal.toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right', color:'#f59e0b' }}>{row.interest.toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right' }}>{row.remainingBalance.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ── SCORING CRÉDIT PAR UTILISATEUR ───────── */}
                <div className="glass-card" style={{ padding:20 }}>
                  <h3 style={{ fontSize:15, fontWeight:600, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
                    <Brain size={17} color="#8b5cf6"/> Scoring crédit — Vendeurs actifs (Firestore)
                  </h3>
                  <p style={{ fontSize:11, color:'#6b7280', marginBottom:16 }}>Calculé en temps réel depuis les données Firestore : commandes, paiements, ancienneté du compte</p>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:12 }}>
                    {users.filter(u=>u.role==='seller').slice(0,6).map(seller => {
                      // ⚠️ FIX : o.farmerId n'existe jamais (checkout écrit sellerId) —
                      // cette liste était donc toujours vide pour chaque vendeur.
                      const sellerOrders = orders.filter(o=>o.sellerId===seller.uid||o.sellerId===seller.id);
                      const paidOrders   = sellerOrders.filter(o=>o.status==='livre');
                      const accountAgeMs = seller.createdAt?.toDate ? Date.now()-seller.createdAt.toDate().getTime() : 0;
                      const accountAgeMo = Math.floor(accountAgeMs/(1000*60*60*24*30));
                      const sellerLoans  = loans.filter(l=>l.sellerId===seller.uid||l.sellerId===seller.id);
                      const totalDebt    = sellerLoans.filter(l=>l.status==='active'||l.status==='approved').reduce((s,l)=>s+(l.remainingBalance??0),0);
                      const avgOrderAmt  = sellerOrders.length ? sellerOrders.reduce((s,o)=>s+(o.amount??0),0)/sellerOrders.length : 0;
                      const scoring = creditScoringAI.calculateScore({
                        monthlyIncome:   avgOrderAmt * 4,
                        existingDebts:   totalDebt,
                        ordersCount:     sellerOrders.length,
                        onTimePayments:  paidOrders.length,
                        accountAgeMonths: accountAgeMo,
                        hasCollateral:   false,
                      });
                      const scoreColor = scoring.score>=850?'#10b981':scoring.score>=650?'#06b6d4':scoring.score>=500?'#f59e0b':'#ef4444';
                      return (
                        <div key={seller.id} style={{ background:'#1a1c22', borderRadius:14, padding:16, border:`1px solid ${scoreColor}30` }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
                            <div>
                              <div style={{ fontWeight:600, fontSize:14 }}>{seller.displayName}</div>
                              <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{seller.region||'Région inconnue'} · {sellerOrders.length} commandes</div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontSize:22, fontWeight:700, color:scoreColor }}>{scoring.score}</div>
                              <div style={{ fontSize:9, color:'#6b7280' }}>/1000</div>
                            </div>
                          </div>
                          {/* Score bar */}
                          <div style={{ height:6, background:'#2a2c34', borderRadius:3, marginBottom:10, overflow:'hidden' }}>
                            <div style={{ width:`${scoring.score/10}%`, height:'100%', background:scoreColor, borderRadius:3, transition:'width .5s' }}/>
                          </div>
                          <div style={{ fontSize:11, marginBottom:10 }}>{scoring.rating}</div>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                            <div style={{ background:'#1f2127', borderRadius:8, padding:8 }}>
                              <div style={{ fontSize:9, color:'#6b7280' }}>Prêt max</div>
                              <div style={{ fontSize:12, fontWeight:600, color:'#10b981' }}>{scoring.maxLoan.toLocaleString()} F</div>
                            </div>
                            <div style={{ background:'#1f2127', borderRadius:8, padding:8 }}>
                              <div style={{ fontSize:9, color:'#6b7280' }}>Taux éligible</div>
                              <div style={{ fontSize:12, fontWeight:600, color:'#f59e0b' }}>{scoring.interestRate}%</div>
                            </div>
                          </div>
                          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                            {scoring.recommendations.map((r,i)=>(
                              <div key={i} style={{ fontSize:11, color:'#9ca3af' }}>{r}</div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {users.filter(u=>u.role==='seller').length===0 && (
                      <div style={{ gridColumn:'1/-1', textAlign:'center', padding:32, color:'#6b7280', fontSize:13 }}>
                        Aucun vendeur dans Firestore
                      </div>
                    )}
                  </div>
                </div>

                {/* ── TABLEAU DES DEMANDES ──────────────────── */}
                <div className="glass-card" style={{ padding:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                    <div>
                      <h2 style={{ fontSize:18, fontWeight:700 }}>📋 Demandes de financement</h2>
                      <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{loans.length} demandes · {pendingLoans} en attente · {totalLoanVolume.toLocaleString()} FCFA total</p>
                    </div>
                    <button onClick={()=>setShowLoanForm(true)} className="btn-primary"><Plus size={14}/> Nouvelle demande</button>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #1f2127' }}>
                          {['Emprunteur','Région','Montant','Durée','Mensualité','Motif','Statut','Actions'].map(h=>(
                            <th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11, color:'#6b7280' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {loans.map(loan => (
                          <tr key={loan.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                            <td style={{ padding:'10px 8px', fontWeight:500 }}>{loan.sellerName}</td>
                            <td style={{ padding:'10px 8px', fontSize:12, color:'#6b7280' }}>{loan.region||'—'}</td>
                            <td style={{ padding:'10px 8px', fontWeight:600, color:'#10b981' }}>{(loan.amount??0).toLocaleString()} FCFA</td>
                            <td style={{ padding:'10px 8px', fontSize:12 }}>{loan.duration} mois</td>
                            <td style={{ padding:'10px 8px', fontSize:12 }}>{(loan.monthlyPayment??0).toLocaleString()} FCFA</td>
                            <td style={{ padding:'10px 8px', fontSize:12, color:'#9ca3af' }}>{loan.purpose||'—'}</td>
                            <td style={{ padding:'10px 8px' }}><StatusBadge status={loan.status}/></td>
                            <td style={{ padding:'10px 8px' }}>
                              <div style={{ display:'flex', gap:5 }}>
                                <button onClick={()=>setSelectedLoan(loan)} className="btn-secondary" style={{ padding:'5px 10px', fontSize:11 }}><Eye size={11}/></button>
                                {loan.status==='pending' && <>
                                  <button onClick={()=>updateLoanStatus(loan.id!,'approved')} className="btn-primary" style={{ padding:'5px 10px', fontSize:11 }}><Check size={11}/></button>
                                  <button onClick={()=>updateLoanStatus(loan.id!,'rejected')} className="btn-secondary" style={{ padding:'5px 10px', fontSize:11, color:'#ef4444', borderColor:'#ef4444' }}><X size={11}/></button>
                                </>}
                                {loan.status==='approved' && (
                                  <button onClick={()=>markLoanAsPaid(loan.id!)} className="btn-primary" style={{ padding:'5px 10px', fontSize:11, background:'#f59e0b' }}>💰</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                        {loans.length===0 && (
                          <tr><td colSpan={8} style={{ textAlign:'center', padding:40, color:'#6b7280' }}>Aucune demande de financement</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>
            )}

            {/* ═══ ANALYSES IA ════════════════════════════════ */}
            {activeTab === 'analytics' && (
              <div className="animate-fadeIn">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:24, marginBottom:24 }}>
                  {/* Anomalies */}
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><AlertTriangle size={17} color="#ef4444"/> Anomalies détectées</h3>
                    {anomalies.length === 0
                      ? <div style={{ textAlign:'center', padding:40, color:'#10b981' }}>✅ Aucune anomalie</div>
                      : anomalies.map(a => (
                          <div key={a.orderNumber} style={{ padding:12, marginBottom:8, background:'rgba(239,68,68,.08)', borderRadius:10, border:'1px solid rgba(239,68,68,.2)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between' }}>
                              <span style={{ fontWeight:600 }}>#{a.orderNumber}</span>
                              <span style={{ color:'#ef4444', fontWeight:600 }}>{a.amount.toLocaleString()} FCFA</span>
                            </div>
                            <div style={{ fontSize:12, color:'#9ca3af', marginTop:4 }}>{a.reason}</div>
                            <div style={{ fontSize:11, marginTop:6, color:a.severity==='high'?'#ef4444':a.severity==='medium'?'#f59e0b':'#10b981' }}>⚠ Sévérité: {a.severity}</div>
                          </div>
                        ))
                    }
                  </div>

                  {/* Prédictions */}
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><TrendingUp size={17} color="#06b6d4"/> Prédictions prix</h3>
                    {pricePredictions
                      ? <>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6, marginBottom:14 }}>
                            {pricePredictions.predictions.map((price,i) => (
                              <div key={i} style={{ textAlign:'center', padding:8, background:'#1f2127', borderRadius:8 }}>
                                <div style={{ fontSize:9, color:'#6b7280' }}>J+{i+1}</div>
                                <div style={{ fontSize:12, fontWeight:600, color:'#10b981' }}>{price.toLocaleString()}</div>
                              </div>
                            ))}
                          </div>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6b7280' }}>
                            <span>Tendance: {pricePredictions.trend==='up'?'📈 Hausse':pricePredictions.trend==='down'?'📉 Baisse':'➡ Stable'}</span>
                            <span>Confiance: {pricePredictions.confidence.toFixed(0)}%</span>
                          </div>
                        </>
                      : <div style={{ textAlign:'center', padding:40, color:'#6b7280' }}>📊 Données insuffisantes</div>
                    }
                  </div>
                </div>

                {/* Simulateur prêt */}
                <div className="glass-card" style={{ padding:20, marginBottom:24 }}>
                  <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}><Banknote size={17} color="#f59e0b"/> Simulateur de financement</h3>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
                    <div>
                      <div style={{ marginBottom:16 }}>
                        <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Montant: {loanSimAmount.toLocaleString()} FCFA</label>
                        <input type="range" min={100000} max={10000000} step={50000} value={loanSimAmount} onChange={e=>setLoanSimAmount(parseInt(e.target.value))} style={{ padding:0, border:'none', background:'transparent', cursor:'pointer' }}/>
                        <div style={{ fontSize:22, fontWeight:700, color:'#10b981', marginTop:6 }}>{loanSimAmount.toLocaleString()} FCFA</div>
                      </div>
                      <div>
                        <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Durée: {loanSimDuration} mois</label>
                        <input type="range" min={3} max={60} step={3} value={loanSimDuration} onChange={e=>setLoanSimDuration(parseInt(e.target.value))} style={{ padding:0, border:'none', background:'transparent', cursor:'pointer' }}/>
                        <div style={{ fontSize:18, fontWeight:600, marginTop:6 }}>{loanSimDuration} mois</div>
                      </div>
                    </div>
                    <div>
                      {loanSimulation?.bestBank
                        ? <div style={{ background:'rgba(16,185,129,.08)', borderRadius:12, padding:16 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12 }}>
                              <span style={{ fontSize:28 }}>{loanSimulation.bestBank.logo}</span>
                              <div><div style={{ fontWeight:700 }}>{loanSimulation.bestBank.name}</div><div style={{ fontSize:11, color:'#6b7280' }}>Meilleure offre</div></div>
                            </div>
                            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                              {[['Taux',`${loanSimulation.bestBank.rate}%`,'#10b981'],['Mensualité',`${loanSimulation.bestBank.monthlyPayment.toLocaleString()} FCFA`,'#06b6d4'],['Total',`${loanSimulation.bestBank.totalPayment.toLocaleString()} FCFA`,'#fff'],['Frais',`${loanSimulation.bestBank.fees.toLocaleString()} FCFA`,'#f59e0b']].map(([k,v,c])=>(
                                <div key={k}><div style={{ fontSize:10, color:'#6b7280' }}>{k}</div><div style={{ fontSize:14, fontWeight:700, color:c }}>{v}</div></div>
                              ))}
                            </div>
                          </div>
                        : <div style={{ textAlign:'center', padding:32, color:'#6b7280', fontSize:13 }}>Aucune banque disponible pour ces paramètres</div>
                      }
                    </div>
                  </div>
                </div>

                {/* Amortissement */}
                {amortizationTable.length > 0 && (
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:14 }}>📊 Tableau d'amortissement</h3>
                    <div style={{ overflowX:'auto', maxHeight:380, overflowY:'auto' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead style={{ position:'sticky', top:0, background:'#111317' }}>
                          <tr style={{ borderBottom:'1px solid #1f2127' }}>
                            {['Mois','Mensualité','Capital','Intérêts','Solde restant'].map(h=>(
                              <th key={h} style={{ padding:'8px 10px', textAlign:'right', color:'#6b7280' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {amortizationTable.slice(0,24).map(row=>(
                            <tr key={row.month} style={{ borderBottom:'1px solid #1a1c22' }}>
                              <td style={{ padding:'7px 10px', textAlign:'right' }}>{row.month}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right' }}>{row.payment.toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right', color:'#10b981' }}>{row.principal.toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right', color:'#f59e0b' }}>{row.interest.toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right' }}>{row.remainingBalance.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}


            {/* ═══ ASSISTANT DEEPSEEK ═════════════════════════ */}
            {activeTab === 'ai-assistant' && (
              <div className="animate-fadeIn" style={{ display:'grid', gridTemplateColumns:'1fr 300px', gap:20, height:'calc(100vh - 130px)' }}>

                {/* Chat window */}
                <div className="glass-card" style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>

                  {/* Chat header */}
                  <div style={{ padding:'16px 20px', borderBottom:'1px solid #1f2127', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:12, background:'linear-gradient(135deg,#8b5cf6,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>🤖</div>
                      <div>
                        <div style={{ fontWeight:700, fontSize:15 }}>Assistant DeepSeek</div>
                        <div style={{ fontSize:11, color:'#10b981', display:'flex', alignItems:'center', gap:5 }}>
                          <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', display:'inline-block' }}/>
                          {aiLoading ? 'En train de réfléchir…' : 'Prêt · Contexte métier chargé'}
                        </div>
                      </div>
                    </div>
                    <select value={aiModel} onChange={e => setAiModel(e.target.value as any)} style={{ width:'auto', padding:'6px 10px', fontSize:12, background:'#1f2127', border:'1px solid #2d2f36', color:'#fff', borderRadius:8, cursor:'pointer' }}>
                      <option value="deepseek-chat">⚡ DeepSeek Chat (rapide)</option>
                      <option value="deepseek-reasoner">🧠 DeepSeek Reasoner (avancé)</option>
                    </select>
                  </div>

                  {/* Messages */}
                  <div style={{ flex:1, overflowY:'auto', padding:'20px', display:'flex', flexDirection:'column', gap:14 }}>
                    {aiMessages.length === 0 && (
                      <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:24, color:'#4b5563', textAlign:'center', paddingTop:60 }}>
                        <div style={{ fontSize:56 }}>🤖</div>
                        <div>
                          <div style={{ fontSize:18, fontWeight:600, color:'#9ca3af', marginBottom:8 }}>Assistant IA AgriMarché</div>
                          <div style={{ fontSize:13, color:'#4b5563', maxWidth:420, lineHeight:1.7 }}>Posez des questions sur vos données, demandez des analyses ou des conseils métier. Je connais votre contexte en temps réel.</div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, width:'100%', maxWidth:500 }}>
                          {[
                            '📊 Analyse mes ventes du mois',
                            '⚠️ Explique les anomalies détectées',
                            '💡 Conseils pour améliorer les livraisons',
                            '🏦 Quels financements sont à risque ?',
                            '📈 Prévision pour le prochain trimestre',
                            '🌾 Produits les plus performants ?'
                          ].map(prompt => (
                            <button key={prompt} onClick={() => setAiInput(prompt)}
                              style={{ padding:'10px 12px', background:'#1f2127', border:'1px solid #2d2f36', borderRadius:10, color:'#9ca3af', fontSize:11, cursor:'pointer', textAlign:'left', lineHeight:1.4, transition:'all .15s' }}>
                              {prompt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiMessages.map((msg, i) => (
                      <div key={i} style={{ display:'flex', gap:10, alignItems:'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background: msg.role === 'user' ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#8b5cf6,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>
                          {msg.role === 'user' ? '👤' : '🤖'}
                        </div>
                        <div style={{ maxWidth:'75%', padding:'12px 16px', borderRadius: msg.role === 'user' ? '18px 4px 18px 18px' : '4px 18px 18px 18px', background: msg.role === 'user' ? 'rgba(16,185,129,.12)' : 'rgba(139,92,246,.1)', border: `1px solid ${msg.role === 'user' ? 'rgba(16,185,129,.2)' : 'rgba(139,92,246,.2)'}`, fontSize:13, lineHeight:1.6, color:'#e5e7eb', whiteSpace:'pre-wrap' }}>
                          {msg.content}
                          <div style={{ fontSize:10, color:'#4b5563', marginTop:6, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                            {new Date(msg.ts).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}

                    {aiLoading && (
                      <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                        <div style={{ width:32, height:32, borderRadius:'50%', background:'linear-gradient(135deg,#8b5cf6,#06b6d4)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>🤖</div>
                        <div style={{ padding:'12px 16px', borderRadius:'4px 18px 18px 18px', background:'rgba(139,92,246,.1)', border:'1px solid rgba(139,92,246,.2)', display:'flex', gap:6, alignItems:'center' }}>
                          {[0,1,2].map(i => <span key={i} style={{ width:8, height:8, borderRadius:'50%', background:'#8b5cf6', animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite`, display:'inline-block' }}/>)}
                        </div>
                      </div>
                    )}
                    <div ref={aiEndRef}/>
                  </div>

                  {/* Input */}
                  <div style={{ padding:'14px 20px', borderTop:'1px solid #1f2127', flexShrink:0 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                      <textarea
                        value={aiInput}
                        onChange={e => setAiInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAiMessage(); } }}
                        placeholder="Posez une question… (Entrée pour envoyer, Maj+Entrée pour saut de ligne)"
                        rows={2}
                        disabled={aiLoading}
                        style={{ flex:1, resize:'none', fontSize:13, padding:'10px 14px', borderRadius:12, lineHeight:1.5 }}
                      />
                      <button onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()} className="btn-primary"
                        style={{ padding:'10px 18px', borderRadius:12, flexShrink:0, opacity: aiLoading || !aiInput.trim() ? 0.5 : 1, height:44 }}>
                        <Send size={16}/>
                      </button>
                    </div>
                    {aiMessages.length > 0 && (
                      <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8 }}>
                        <button onClick={() => setAiMessages([])} style={{ background:'none', border:'none', color:'#4b5563', fontSize:11, cursor:'pointer' }}>🗑 Effacer la conversation</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right panel */}
                <div style={{ display:'flex', flexDirection:'column', gap:14 }}>

                  <div className="glass-card" style={{ padding:16 }}>
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#8b5cf6', display:'flex', alignItems:'center', gap:6 }}><Zap size={14}/> Contexte injecté</h4>
                    {[
                      { label:'Commandes', val:`${orders.length}`, sub:`${orders.filter(o=>o.status==='en_attente').length} en attente`, color:'#06b6d4' },
                      { label:'CA total',  val:`${(totalRevenue/1000000).toFixed(1)}M`, sub:'FCFA', color:'#10b981' },
                      { label:'Utilisateurs', val:`${users.length}`, sub:`${deliveryPersons.length} livreurs`, color:'#8b5cf6' },
                      { label:'Anomalies', val:`${anomalies.length}`, sub:'détectées', color:anomalies.length>0?'#ef4444':'#10b981' },
                      { label:'Financements', val:`${pendingLoans}`, sub:'en attente', color:'#f59e0b' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #1a1c22' }}>
                        <div style={{ fontSize:11, color:'#6b7280' }}>{item.label}</div>
                        <div style={{ textAlign:'right' }}>
                          <span style={{ fontSize:14, fontWeight:700, color:item.color }}>{item.val}</span>
                          <div style={{ fontSize:10, color:'#4b5563' }}>{item.sub}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="glass-card" style={{ padding:16 }}>
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#06b6d4', display:'flex', alignItems:'center', gap:6 }}><Sparkles size={14}/> Suggestions</h4>
                    <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                      {[
                        { emoji:'📊', text:"Résume la performance globale" },
                        { emoji:'⚠️', text:"Analyse les risques actuels" },
                        { emoji:'💡', text:"3 conseils d'optimisation" },
                        { emoji:'🌾', text:"Produits à recommander ?" },
                        { emoji:'📅', text:"Plan d'action ce mois" },
                        { emoji:'🔍', text:"Explique les anomalies" },
                      ].map(s => (
                        <button key={s.text} onClick={() => setAiInput(s.text)}
                          style={{ padding:'8px 10px', background:'#1f2127', border:'1px solid #2d2f36', borderRadius:8, color:'#9ca3af', fontSize:11, cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:8, transition:'all .15s' }}>
                          <span>{s.emoji}</span>{s.text}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="glass-card" style={{ padding:16 }}>
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:10, color:'#f59e0b' }}>⚙️ Modèle actif</h4>
                    <div style={{ fontSize:13, fontWeight:700, color:aiModel==='deepseek-reasoner'?'#8b5cf6':'#10b981', marginBottom:6 }}>
                      {aiModel==='deepseek-chat'?'⚡ DeepSeek Chat':'🧠 DeepSeek Reasoner'}
                    </div>
                    <div style={{ fontSize:11, color:'#4b5563', lineHeight:1.6 }}>
                      {aiModel==='deepseek-chat'
                        ?'Réponses rapides, idéal pour les questions courantes.'
                        :'Raisonnement approfondi, optimal pour les analyses complexes.'}
                    </div>
                    <div style={{ marginTop:10, padding:'6px 10px', background:'#1f2127', borderRadius:8, fontSize:10, color:'#6b7280' }}>
                      🔑 NEXT_PUBLIC_DEEPSEEK_API_KEY
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ CODES D'ACCÈS IA ══════════════════════════ */}
            {activeTab === 'ai-codes' && (() => {
              const unusedCodes = accessCodes.filter(c => !c.used);
              const usedCodes   = accessCodes.filter(c => c.used);
              const displayed   = codesTab === 'unused' ? unusedCodes : usedCodes;
              return (
                <div className="animate-fadeIn" style={{ display:'flex', flexDirection:'column', gap:20 }}>

                  {/* Stats */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14 }}>
                    {[
                      { label:'Total codes',    value:accessCodes.length,  color:'#e5e7eb' },
                      { label:'Non utilisés',   value:unusedCodes.length,  color:'#10b981' },
                      { label:'Utilisés',       value:usedCodes.length,    color:'#6b7280' },
                      { label:'Utilisateurs IA',value:users.filter(u=>(u as any).hasAIAccess).length, color:'#8b5cf6' },
                    ].map(s => (
                      <div key={s.label} className="glass-card" style={{ padding:'18px 20px' }}>
                        <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                        <div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {/* Génération */}
                  <div className="glass-card" style={{ padding:'24px 28px' }}>
                    <h2 style={{ fontSize:16, fontWeight:700, marginBottom:20, display:'flex', alignItems:'center', gap:8 }}>
                      <Key size={16} color="#10b981"/> Générer des codes
                    </h2>
                    <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:20 }}>
                      <div>
                        <label style={{ fontSize:12, color:'#6b7280', display:'block', marginBottom:6 }}>Nombre</label>
                        <input type="number" value={codeCount} min={1} max={50}
                          onChange={e => setCodeCount(Math.max(1, parseInt(e.target.value)||1))}
                          style={{ width:90, padding:'8px 12px', fontSize:13 }}/>
                      </div>
                      <div>
                        <label style={{ fontSize:12, color:'#6b7280', display:'block', marginBottom:6 }}>Durée d'accès</label>
                        <select value={codeDays} onChange={e => setCodeDays(parseInt(e.target.value))}
                          style={{ padding:'8px 12px', fontSize:13, width:170 }}>
                          <option value={30}>30 jours — 690 FCFA</option>
                          <option value={60}>60 jours — 1 200 FCFA</option>
                          <option value={90}>90 jours — 1 800 FCFA</option>
                        </select>
                      </div>
                    </div>
                    <button onClick={generateAccessCodes} disabled={generatingCodes} className="btn-primary"
                      style={{ opacity:generatingCodes?0.6:1 }}>
                      <Key size={14}/> {generatingCodes ? 'Génération…' : 'Générer les codes'}
                    </button>

                    {/* Codes fraîchement générés */}
                    {newCodes.length > 0 && (
                      <div style={{ marginTop:24 }}>
                        <h3 style={{ fontSize:13, fontWeight:600, color:'#10b981', marginBottom:12 }}>
                          ✅ {newCodes.length} code(s) créé(s) :
                        </h3>
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {newCodes.map(code => (
                            <div key={code} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                              padding:'10px 14px', background:'rgba(16,185,129,.06)', border:'1px solid rgba(16,185,129,.2)',
                              borderRadius:10, flexWrap:'wrap', gap:8 }}>
                              <code style={{ fontSize:15, fontWeight:700, color:'#10b981', fontFamily:'monospace' }}>{code}</code>
                              <div style={{ display:'flex', gap:8 }}>
                                <button className="btn-secondary" style={{ fontSize:11, padding:'4px 10px' }}
                                  onClick={() => { navigator.clipboard.writeText(code); toast.success('Copié !'); }}>
                                  📋 Copier
                                </button>
                                <button className="btn-secondary" style={{ fontSize:11, padding:'4px 10px' }}
                                  onClick={() => { navigator.clipboard.writeText(`✅ Votre code AgriMarché IA Premium : ${code} (valable ${codeDays} jours)`); toast.success('Message copié !'); }}>
                                  💬 Message
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tous les codes Firestore */}
                  <div className="glass-card" style={{ padding:'24px 28px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18, flexWrap:'wrap', gap:10 }}>
                      <h2 style={{ fontSize:16, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                        <Database size={16} color="#10b981"/> Tous les codes Firestore
                      </h2>
                      <div style={{ display:'flex', gap:8 }}>
                        {(['unused','used'] as const).map(tab => (
                          <button key={tab} onClick={() => setCodesTab(tab)}
                            className={codesTab===tab ? 'btn-primary' : 'btn-secondary'}
                            style={{ fontSize:11, padding:'5px 12px' }}>
                            {tab==='unused' ? `Disponibles (${unusedCodes.length})` : `Utilisés (${usedCodes.length})`}
                          </button>
                        ))}
                        <button className="btn-secondary" style={{ fontSize:11, padding:'5px 10px' }}
                          onClick={fetchAccessCodes} title="Rafraîchir">
                          <RefreshCw size={12}/>
                        </button>
                      </div>
                    </div>

                    {loadingCodes ? (
                      <p style={{ color:'#6b7280', fontSize:13 }}>Chargement…</p>
                    ) : displayed.length === 0 ? (
                      <p style={{ color:'#6b7280', fontSize:13, textAlign:'center', padding:24 }}>
                        Aucun code {codesTab==='unused'?'disponible':'utilisé'}.
                      </p>
                    ) : (
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                          <thead>
                            <tr style={{ borderBottom:'1px solid #1f2127' }}>
                              {['Code','Durée','Créé le','Expire le', codesTab==='used'?'Utilisé par':'Statut',''].map(h => (
                                <th key={h} style={{ textAlign:'left', padding:'8px 10px', color:'#6b7280', fontWeight:500 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {displayed.map(c => (
                              <tr key={c.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                                <td style={{ padding:'10px', fontFamily:'monospace', color:'#10b981', fontWeight:600 }}>{c.id}</td>
                                <td style={{ padding:'10px', color:'#9ca3af' }}>{c.days}j</td>
                                <td style={{ padding:'10px', color:'#6b7280' }}>{c.createdAt?.toDate?.().toLocaleDateString('fr-FR')??'—'}</td>
                                <td style={{ padding:'10px', color:'#6b7280' }}>{c.expiresAt?.toDate?.().toLocaleDateString('fr-FR')??'—'}</td>
                                <td style={{ padding:'10px' }}>
                                  {codesTab==='used'
                                    ? <span style={{ color:'#6b7280' }}>{c.usedBy?.slice(0,14)}…</span>
                                    : <span style={{ background:'rgba(16,185,129,.1)', color:'#10b981', padding:'2px 8px', borderRadius:20, fontSize:11 }}>✅ Disponible</span>
                                  }
                                </td>
                                <td style={{ padding:'10px' }}>
                                  {!c.used && (
                                    <button className="btn-secondary" style={{ fontSize:10, padding:'3px 8px' }}
                                      onClick={() => { navigator.clipboard.writeText(c.id); toast.success('Copié !'); }}>
                                      📋
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Rappel solde */}
                  <div style={{ background:'rgba(139,92,246,.06)', border:'1px solid rgba(139,92,246,.25)',
                    borderRadius:12, padding:'14px 20px', fontSize:13, color:'#8b5cf6', textAlign:'center' }}>
                    💡 <strong>Rappel</strong> : Surveille ton solde DeepSeek sur <strong>platform.deepseek.com</strong> — recharge quand il reste moins de <strong>$0.50</strong>.
                  </div>

                </div>
              );
            })()}

            {/* ═══ RÉGIONS ════════════════════════════════════ */}
            {activeTab === 'regions' && (
              <div className="animate-fadeIn">
                {/* ⚠️ Revenu orphelin : commandes livrées dont sellerRegion ne
                    matche aucune des 14 régions officielles. Sans cette alerte,
                    ce montant restait invisible tout en faussant les % ci-dessous. */}
                {unassignedRegionStats.orders > 0 && (
                  <div className="glass-card" style={{ padding:16, marginBottom:16, borderLeft:'3px solid #f59e0b', display:'flex', alignItems:'center', gap:12 }}>
                    <AlertTriangle size={20} color="#f59e0b" style={{ flexShrink:0 }}/>
                    <div style={{ fontSize:12.5, color:'#e5e7eb' }}>
                      <strong>{unassignedRegionStats.orders} commande{unassignedRegionStats.orders>1?'s':''} livrée{unassignedRegionStats.orders>1?'s':''}</strong>
                      {' '}({unassignedRegionStats.revenue.toLocaleString()} FCFA) {unassignedRegionStats.orders>1?'ont':'a'} une région vendeur qui ne correspond à aucune des 14 régions officielles
                      (texte libre, faute de frappe, ancienne donnée…). Ce montant compte dans le total ci-dessous mais n'apparaît sur aucune carte région.
                    </div>
                  </div>
                )}

                {/* Header stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:24 }}>
                  {[
                    { label:'Régions actives',     value:regionStats.filter(r=>r.isActive).length, total: SENEGAL_REGIONS.length, color:'#10b981' },
                    { label:'Total commandes',      value:orders.length,                              color:'#06b6d4' },
                    { label:'Utilisateurs géocodés',value:users.filter(u=>u.region).length,          color:'#8b5cf6' },
                    { label:'Produits référencés',  value:products.filter(p=>p.region).length,       color:'#f59e0b' },
                  ].map((s,i)=>(
                    <div key={i} className="glass-card" style={{ padding:16 }}>
                      <div style={{ fontSize:24, fontWeight:700, color:s.color }}>
                        {s.value}{s.total !== undefined && <span style={{ fontSize:13, color:'#6b7280', fontWeight:600 }}> / {s.total}</span>}
                      </div>
                      <div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Toolbar : recherche, tri, export */}
                <div style={{ display:'flex', flexWrap:'wrap', gap:10, alignItems:'center', marginBottom:20 }}>
                  <div style={{ position:'relative', flex:'1 1 220px', minWidth:200 }}>
                    <Search size={15} style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'#6b7280' }}/>
                    <input
                      value={regionSearch}
                      onChange={e=>setRegionSearch(e.target.value)}
                      placeholder="Rechercher une région…"
                      style={{ width:'100%', paddingLeft:34 }}
                    />
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <ArrowUpDown size={14} style={{ color:'#6b7280' }}/>
                    <select value={regionSort} onChange={e=>setRegionSort(e.target.value as any)} style={{ minWidth:170 }}>
                      <option value="revenue">Trier par revenu</option>
                      <option value="orders">Trier par commandes</option>
                      <option value="users">Trier par utilisateurs</option>
                      <option value="products">Trier par produits</option>
                      <option value="name">Trier par nom (A-Z)</option>
                    </select>
                  </div>
                  <button
                    onClick={()=>{
                      const ws = XLSX.utils.json_to_sheet(regionStats.map(r => ({
                        Région: r.region, Commandes: r.orders, Utilisateurs: r.users,
                        Produits: r.products, 'Revenu (FCFA)': r.revenue,
                        'Panier moyen (FCFA)': Math.round(r.avgOrderValue),
                      })));
                      const wb = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(wb, ws, 'Régions');
                      XLSX.writeFile(wb, `regions_${Date.now()}.xlsx`);
                      toast.success('Export OK');
                    }}
                    className="btn-secondary"
                    style={{ display:'inline-flex', alignItems:'center', gap:6 }}
                  >
                    <Download size={14}/> Exporter
                  </button>
                </div>

                {/* Region cards (régions actives) */}
                {activeRegionStats.length === 0 ? (
                  <div className="glass-card" style={{ padding:32, textAlign:'center', color:'#6b7280', marginBottom:24 }}>
                    Aucune région active ne correspond à « {regionSearch} ».
                  </div>
                ) : (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:16, marginBottom:24 }}>
                    {activeRegionStats.map(r => {
                      const rank = regionRankByRevenue.get(r.region) ?? 0;
                      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
                      return (
                        <div key={r.region} className="glass-card" style={{ padding:20, borderLeft:`3px solid ${r.color}`, position:'relative' }}>
                          {medal && (
                            <div style={{ position:'absolute', top:14, right:16, fontSize:18 }} title={`#${rank} au classement revenu`}>{medal}</div>
                          )}
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:28 }}>{r.emoji}</span>
                              <div>
                                <h3 style={{ fontWeight:700, fontSize:16 }}>{r.region}</h3>
                                <p style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{r.description}</p>
                              </div>
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontSize:18, fontWeight:700, color:r.color }}>{r.revenue.toLocaleString()}</div>
                              <div style={{ fontSize:10, color:'#6b7280' }}>FCFA</div>
                            </div>
                          </div>
                          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                            {[
                              { label:'Commandes', val:r.orders,   icon:'📦' },
                              { label:'Utilisateurs', val:r.users, icon:'👥' },
                              { label:'Produits', val:r.products,  icon:'🌿' },
                            ].map(({ label,val,icon })=>(
                              <div key={label} style={{ background:'#1f2127', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                                <div style={{ fontSize:16 }}>{icon}</div>
                                <div style={{ fontSize:18, fontWeight:700, marginTop:4 }}>{val}</div>
                                <div style={{ fontSize:10, color:'#6b7280' }}>{label}</div>
                              </div>
                            ))}
                          </div>
                          {r.orders > 0 && (
                            <div style={{ marginTop:10, fontSize:11, color:'#6b7280' }}>
                              Panier moyen : <span style={{ color:'#e5e7eb', fontWeight:600 }}>{Math.round(r.avgOrderValue).toLocaleString()} FCFA</span>
                            </div>
                          )}
                          {/* Progress bar */}
                          <div style={{ marginTop:14 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6b7280', marginBottom:4 }}>
                              <span>Part du revenu total</span>
                              <span>{totalRevenue>0?(r.revenue/totalRevenue*100).toFixed(1):0}%</span>
                            </div>
                            <div style={{ height:4, background:'#1f2127', borderRadius:2 }}>
                              <div style={{ width:`${totalRevenue>0?(r.revenue/totalRevenue*100):0}%`, height:'100%', background:r.color, borderRadius:2, transition:'width .5s' }}/>
                            </div>
                          </div>
                          {/* Action rapide */}
                          <button
                            onClick={()=>{
                              setBroadcastMode('filter');
                              setBroadcastForm(f => ({ ...f, targetRegion: r.region, targetRole: 'all' }));
                              setActiveTab('broadcast');
                            }}
                            style={{ marginTop:14, width:'100%', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 0', borderRadius:10, border:'1px solid rgba(255,255,255,.08)', background:'transparent', color:'#9ca3af', fontSize:12, fontWeight:600, cursor:'pointer' }}
                          >
                            <Send size={13}/> Notifier cette région
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Régions sans activité — à développer */}
                {inactiveRegionStats.length > 0 && (
                  <div className="glass-card" style={{ padding:0, marginBottom:24, overflow:'hidden' }}>
                    <button
                      onClick={()=>setShowInactiveRegions(v=>!v)}
                      style={{ width:'100%', display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 20px', background:'transparent', border:'none', cursor:'pointer', color:'#e5e7eb' }}
                    >
                      <span style={{ fontSize:14, fontWeight:600 }}>
                        🌱 Régions à développer <span style={{ color:'#6b7280', fontWeight:400 }}>({inactiveRegionStats.length} sans activité)</span>
                      </span>
                      <ChevronRight size={16} style={{ transform: showInactiveRegions ? 'rotate(90deg)' : 'none', transition:'transform .2s', color:'#6b7280' }}/>
                    </button>
                    {showInactiveRegions && (
                      <div style={{ borderTop:'1px solid rgba(255,255,255,.06)' }}>
                        {inactiveRegionStats.map(r => (
                          <div key={r.region} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid rgba(255,255,255,.04)' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <span style={{ fontSize:18, opacity:.6 }}>{r.emoji}</span>
                              <div>
                                <div style={{ fontSize:13, fontWeight:600 }}>{r.region}</div>
                                <div style={{ fontSize:11, color:'#6b7280' }}>{r.description} · aucune commande, utilisateur ou produit</div>
                              </div>
                            </div>
                            <button
                              onClick={()=>{
                                setBroadcastMode('filter');
                                setBroadcastForm(f => ({ ...f, targetRegion: r.region, targetRole: 'all' }));
                                setActiveTab('broadcast');
                              }}
                              style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,.08)', background:'transparent', color:'#9ca3af', fontSize:11, fontWeight:600, cursor:'pointer', whiteSpace:'nowrap' }}
                            >
                              <Send size={12}/> Cibler
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Regional bar chart */}
                <div className="glass-card" style={{ padding:20 }}>
                  <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>📊 Revenus par région</h3>
                  <div style={{ height:320 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={regionStats} layout="vertical" margin={{ left:90, right:20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2127" horizontal={false}/>
                        <XAxis type="number" stroke="#6b7280" fontSize={11} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <YAxis type="category" dataKey="region" stroke="#6b7280" fontSize={11} width={80}/>
                        <Tooltip contentStyle={{ background:'#111317', border:'1px solid #1f2127', borderRadius:8 }} formatter={(v:any)=>`${Number(v).toLocaleString()} FCFA`}/>
                        <Bar dataKey="revenue" radius={[0,6,6,0]}>
                          {regionStats.map((r,i) => <Cell key={i} fill={r.color}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ MÉTÉO SÉNÉGAL ══════════════════════════════ */}
            {activeTab === 'weather' && (
              <div className="animate-fadeIn" style={{ display:'flex', flexDirection:'column', gap:20 }}>

                {/* Header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
                  <div>
                    <h2 style={{ fontSize:20, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                      🌤️ Météo — 14 Régions du Sénégal
                    </h2>
                    <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>Données temps réel · OpenWeatherMap</p>
                  </div>
                  <button onClick={fetchWeather} disabled={weatherLoading} className="btn-secondary" style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <RefreshCw size={14} style={{ animation: weatherLoading ? 'spin 1s linear infinite' : 'none' }}/>
                    {weatherLoading ? 'Chargement…' : 'Actualiser'}
                  </button>
                </div>

                {weatherError && (
                  <div style={{ padding:'14px 18px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:12, color:'#ef4444', fontSize:13 }}>
                    ⚠️ {weatherError}
                  </div>
                )}

                {weatherLoading && Object.keys(weatherData).length === 0 && (
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
                    {SENEGAL_REGIONS.map(r => (
                      <div key={r} className="glass-card" style={{ padding:20, minHeight:140 }}>
                        <div style={{ width:60, height:12, background:'#1f2127', borderRadius:6, marginBottom:10 }}/>
                        <div style={{ width:100, height:32, background:'#1f2127', borderRadius:8, marginBottom:8 }}/>
                        <div style={{ width:80, height:10, background:'#1f2127', borderRadius:6 }}/>
                      </div>
                    ))}
                  </div>
                )}

                {/* Region selector tabs */}
                {!weatherLoading && Object.keys(weatherData).length > 0 && (
                  <>
                    {/* Overview grid — current weather for all regions */}
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
                      {SENEGAL_REGIONS.map(region => {
                        const d = weatherData[region];
                        const cur = d?.list?.[0];
                        const info = REGION_INFO[region];
                        const temp = cur ? Math.round(cur.main.temp) : null;
                        const feelsLike = cur ? Math.round(cur.main.feels_like) : null;
                        const desc = cur?.weather?.[0]?.description ?? '—';
                        const humidity = cur?.main?.humidity ?? '—';
                        const wind = cur ? Math.round(cur.wind.speed * 3.6) : '—';
                        const icon = cur?.weather?.[0]?.icon;
                        const isSelected = weatherRegion === region;

                        return (
                          <div key={region} onClick={() => setWeatherRegion(region)} className="glass-card" style={{
                            padding:18, cursor:'pointer',
                            border: isSelected ? `2px solid ${info.color}` : '1px solid #1f2127',
                            background: isSelected ? `${info.color}0d` : undefined,
                            transition:'all .2s'
                          }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontSize:22 }}>{info.emoji}</span>
                                <div>
                                  <div style={{ fontWeight:700, fontSize:14 }}>{region}</div>
                                  <div style={{ fontSize:10, color:'#6b7280' }}>{info.description}</div>
                                </div>
                              </div>
                              {icon && <img src={`https://openweathermap.org/img/wn/${icon}.png`} alt={desc} width={40} height={40} loading="lazy" />}
                            </div>

                            {temp !== null ? (
                              <>
                                <div style={{ fontSize:32, fontWeight:800, color:info.color, marginBottom:2 }}>{temp}°C</div>
                                <div style={{ fontSize:11, color:'#9ca3af', marginBottom:10, textTransform:'capitalize' }}>{desc}</div>
                                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                                  {[
                                    ['💧 Humidité', `${humidity}%`],
                                    ['💨 Vent', `${wind} km/h`],
                                    ['🌡️ Ressenti', `${feelsLike}°C`],
                                    ['🔮 Prochain', d?.list?.[1] ? `${Math.round(d.list[1].main.temp)}°C` : '—'],
                                  ].map(([k,v]) => (
                                    <div key={k} style={{ background:'#1f2127', borderRadius:8, padding:'6px 8px' }}>
                                      <div style={{ fontSize:10, color:'#6b7280' }}>{k}</div>
                                      <div style={{ fontSize:12, fontWeight:600, marginTop:2 }}>{v}</div>
                                    </div>
                                  ))}
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize:12, color:'#4b5563' }}>Données indisponibles</div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Detail panel for selected region — 24h forecast */}
                    {weatherData[weatherRegion]?.list && (
                      <div className="glass-card" style={{ padding:24 }}>
                        <h3 style={{ fontSize:16, fontWeight:700, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                          {REGION_INFO[weatherRegion].emoji} Prévisions 24h — {weatherRegion}
                        </h3>
                        <div style={{ display:'flex', gap:12, overflowX:'auto', paddingBottom:8 }}>
                          {weatherData[weatherRegion].list.slice(0, 8).map((slot: any, i: number) => {
                            const time = new Date(slot.dt * 1000);
                            const icon = slot.weather?.[0]?.icon;
                            return (
                              <div key={i} style={{ minWidth:90, padding:'12px 10px', background:'#1f2127', borderRadius:12, textAlign:'center', flexShrink:0 }}>
                                <div style={{ fontSize:11, color:'#6b7280', marginBottom:6 }}>
                                  {i === 0 ? 'Maintenant' : time.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}
                                </div>
                                {icon && <img src={`https://openweathermap.org/img/wn/${icon}.png`} alt="" width={36} height={36} loading="lazy" />}
                                <div style={{ fontSize:18, fontWeight:700, color:REGION_INFO[weatherRegion].color, marginBottom:4 }}>
                                  {Math.round(slot.main.temp)}°
                                </div>
                                <div style={{ fontSize:9, color:'#6b7280' }}>💧{slot.main.humidity}%</div>
                                {slot.pop > 0 && (
                                  <div style={{ fontSize:9, color:'#06b6d4', marginTop:2 }}>🌧 {Math.round(slot.pop * 100)}%</div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Agronomic advice — powered by Claude AI */}
                        <div style={{ marginTop:16, padding:'14px 18px', background:'rgba(16,185,129,.06)', border:'1px solid rgba(16,185,129,.15)', borderRadius:12 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                            <div style={{ fontSize:13, fontWeight:600, color:'#10b981' }}>🌾 Conseils agricoles IA</div>
                            {weatherAdviceLoading[weatherRegion] && (
                              <div style={{ fontSize:11, color:'#6b7280', display:'flex', alignItems:'center', gap:4 }}>
                                <RefreshCw size={11} style={{ animation:'spin 1s linear infinite' }}/> Analyse en cours…
                              </div>
                            )}
                          </div>
                          {weatherAdvice[weatherRegion] ? (
                            <div style={{ fontSize:12, color:'#d1fae5', lineHeight:1.8, whiteSpace:'pre-line' }}>
                              {weatherAdvice[weatherRegion]}
                            </div>
                          ) : weatherAdviceLoading[weatherRegion] ? (
                            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                              {[80,65,90].map((w,i) => (
                                <div key={i} style={{ height:12, borderRadius:6, background:'rgba(255,255,255,.06)', width:`${w}%`, animation:'pulse 1.5s ease-in-out infinite' }}/>
                              ))}
                            </div>
                          ) : (
                            (() => {
                              const cur = weatherData[weatherRegion]?.list?.[0];
                              if (!cur) return null;
                              const temp = cur.main.temp;
                              const hum  = cur.main.humidity;
                              const rain = cur.pop ?? 0;
                              const tips: string[] = [];
                              if (temp > 38) tips.push("⚠️ Canicule : arrosez tôt le matin ou après 18h.");
                              if (temp < 18) tips.push("🌡️ Fraîcheur : protégez les cultures sensibles au froid.");
                              if (hum > 80)  tips.push("💧 Humidité élevée : risque de maladies fongiques — vérifiez vos cultures.");
                              if (hum < 30)  tips.push("🏜️ Air très sec : augmentez la fréquence d'irrigation.");
                              if (rain > 0.6) tips.push("🌧️ Pluie probable : reportez les traitements phytosanitaires.");
                              if (tips.length === 0) tips.push("✅ Conditions favorables pour les activités agricoles.");
                              return tips.map((t,i) => <div key={i} style={{ fontSize:12, color:'#9ca3af', marginBottom:4 }}>{t}</div>);
                            })()
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ═══ DIFFUSION ══════════════════════════════════ */}
            {activeTab === 'broadcast' && (
              <div className="animate-fadeIn" style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:24 }}>

                {/* Form */}
                <div className="glass-card" style={{ padding:24 }}>
                  <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4, display:'flex', alignItems:'center', gap:8 }}>
                    <Send size={18} color="#10b981"/> Envoyer un message
                  </h2>
                  <p style={{ fontSize:12, color:'#6b7280', marginBottom:20 }}>Diffusez aux utilisateurs via notifications in-app et email (Resend).</p>

                  {/* Cible */}
                  <div style={{ marginBottom:20, padding:16, background:'rgba(16,185,129,.05)', borderRadius:12, border:'1px solid rgba(16,185,129,.15)' }}>
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#10b981', display:'flex', alignItems:'center', gap:6 }}>
                      <Target size={14}/> Audience cible
                    </h4>

                    {/* Mode switcher */}
                    <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                      {([['filter',<Search key="i" size={13}/>,'Par critères'],['manual',<CheckCircle key="i" size={13}/>,'Sélection manuelle']] as const).map(([mode,icon,label])=>(
                        <button key={mode} onClick={()=>{ setBroadcastMode(mode); setSelectedUserIds(new Set()); setUserPickerSearch(''); }}
                          style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6, padding:'8px 0', borderRadius:10, border:`1px solid ${broadcastMode===mode?'#10b981':'rgba(255,255,255,.08)'}`, background:broadcastMode===mode?'rgba(16,185,129,.1)':'transparent', color:broadcastMode===mode?'#10b981':'#6b7280', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .2s' }}>
                          {icon}{label}
                        </button>
                      ))}
                    </div>

                    {broadcastMode === 'filter' ? (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                          <div>
                            <label style={{ fontSize:11, color:'#6b7280', marginBottom:5, display:'block' }}>Rôle</label>
                            <select value={broadcastForm.targetRole} onChange={e=>setBroadcastForm({...broadcastForm,targetRole:e.target.value as any})}>
                              <option value="all">Tous les utilisateurs</option>
                              <option value="client">Clients</option>
                              <option value="seller">Vendeurs</option>
                              <option value="delivery">Livreurs</option>
                              <option value="admin">Admins</option>
                            </select>
                          </div>
                          <div>
                            <label style={{ fontSize:11, color:'#6b7280', marginBottom:5, display:'block' }}>Région</label>
                            <select value={broadcastForm.targetRegion} onChange={e=>setBroadcastForm({...broadcastForm,targetRegion:e.target.value})}>
                              <option value="all">Toutes les régions</option>
                              {SENEGAL_REGIONS.map(r => <option key={r} value={r}>{REGION_INFO[r].emoji} {r}</option>)}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginTop:10, padding:'8px 12px', background:'#1f2127', borderRadius:8, fontSize:12, color:'#9ca3af', display:'flex', alignItems:'center', gap:6 }}>
                          <Users size={13}/>
                          {(() => {
                            let count = users.length;
                            if (broadcastForm.targetRole !== 'all') count = users.filter(u=>u.role===broadcastForm.targetRole).length;
                            if (broadcastForm.targetRegion !== 'all') count = users.filter(u=>(broadcastForm.targetRole==='all'||u.role===broadcastForm.targetRole)&&u.region?.toLowerCase()===broadcastForm.targetRegion.toLowerCase()).length;
                            return `${count} destinataire(s) sélectionné(s)`;
                          })()}
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Barre de recherche */}
                        <div style={{ position:'relative', marginBottom:8 }}>
                          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#6b7280' }}/>
                          <input type="text" placeholder="Rechercher par nom, téléphone, email, rôle…" value={userPickerSearch} onChange={e=>setUserPickerSearch(e.target.value)} style={{ paddingLeft:32, fontSize:12 }}/>
                        </div>

                        {/* Sélectionner tout / Désélectionner */}
                        {userPickerSearch.length > 0 && (
                          <div style={{ display:'flex', gap:8, marginBottom:8 }}>
                            <button onClick={()=>{
                              const filtered = users.filter(u=>{ const q=userPickerSearch.toLowerCase(); return u.displayName?.toLowerCase().includes(q)||u.phone?.includes(q)||u.email?.toLowerCase().includes(q)||u.role?.includes(q); });
                              setSelectedUserIds(prev=>{ const n=new Set(prev); filtered.forEach(u=>n.add(u.uid??u.id??'')); return n; });
                            }} className="btn-secondary" style={{ padding:'4px 10px', fontSize:11 }}>Tout sélectionner</button>
                            <button onClick={()=>setSelectedUserIds(new Set())} className="btn-secondary" style={{ padding:'4px 10px', fontSize:11, color:'#ef4444' }}>Tout effacer</button>
                          </div>
                        )}

                        {/* Liste utilisateurs filtrés */}
                        <div style={{ maxHeight:200, overflowY:'auto', border:'1px solid #1f2127', borderRadius:10, background:'#0a0c10' }}>
                          {users.filter(u=>{
                            if (!userPickerSearch) return true;
                            const q=userPickerSearch.toLowerCase();
                            return u.displayName?.toLowerCase().includes(q)||u.phone?.includes(q)||u.email?.toLowerCase().includes(q)||u.role?.includes(q);
                          }).map(u=>{
                            const uid = u.uid ?? u.id ?? '';
                            const checked = selectedUserIds.has(uid);
                            return (
                              <label key={u.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:'1px solid #1a1c22', cursor:'pointer', background:checked?'rgba(16,185,129,.04)':'transparent' }}>
                                <input type="checkbox" checked={checked} onChange={()=>{ setSelectedUserIds(prev=>{ const n=new Set(prev); checked?n.delete(uid):n.add(uid); return n; }); }} style={{ width:'auto', flexShrink:0 }}/>
                                <div style={{ width:28, height:28, borderRadius:'50%', background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, flexShrink:0 }}>{u.displayName?.charAt(0)??'?'}</div>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.displayName}</div>
                                  <div style={{ fontSize:10, color:'#6b7280' }}>{u.role} · {u.phone||u.email||'—'}</div>
                                </div>
                                {u.region && <span style={{ fontSize:10, color:'#4b5563', flexShrink:0 }}>{u.region}</span>}
                              </label>
                            );
                          })}
                          {users.filter(u=>{if(!userPickerSearch)return true;const q=userPickerSearch.toLowerCase();return u.displayName?.toLowerCase().includes(q)||u.phone?.includes(q)||u.email?.toLowerCase().includes(q)||u.role?.includes(q);}).length===0 && (
                            <div style={{ padding:16, textAlign:'center', fontSize:12, color:'#4b5563' }}>Aucun utilisateur trouvé</div>
                          )}
                        </div>

                        {/* Chips sélectionnés */}
                        {selectedUserIds.size > 0 && (
                          <div style={{ marginTop:10, padding:'8px 12px', background:'#1f2127', borderRadius:8 }}>
                            <div style={{ fontSize:11, color:'#10b981', fontWeight:600, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
                              <CheckCircle size={13}/> {selectedUserIds.size} destinataire(s) sélectionné(s)
                            </div>
                            <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                              {Array.from(selectedUserIds).slice(0,8).map(uid=>{
                                const u = users.find(x=>(x.uid??x.id)===uid);
                                return u ? (
                                  <span key={uid} style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:20, background:'rgba(16,185,129,.1)', color:'#10b981', fontSize:11 }}>
                                    {u.displayName?.split(' ')[0]}
                                    <button onClick={()=>setSelectedUserIds(prev=>{ const n=new Set(prev); n.delete(uid); return n; })} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer', lineHeight:1, padding:0 }}>×</button>
                                  </span>
                                ) : null;
                              })}
                              {selectedUserIds.size > 8 && <span style={{ fontSize:11, color:'#6b7280', padding:'3px 8px' }}>+{selectedUserIds.size-8} autres</span>}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Canaux */}
                  <div style={{ marginBottom:20, padding:16, background:'rgba(6,182,212,.05)', borderRadius:12, border:'1px solid rgba(6,182,212,.15)' }}>
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#06b6d4', display:'flex', alignItems:'center', gap:6 }}>
                      <RadioTower size={14}/> Canaux d'envoi
                    </h4>
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                      {([['inApp',<Bell key="i" size={14}/>,'In-App','10b981'],['email',<Mail key="i" size={14}/>,'Email','8b5cf6'],['push',<Smartphone key="i" size={14}/>,'Push','f59e0b'],['sms',<MessageSquare key="i" size={14}/>,'SMS','06b6d4']] as const).map(([key,icon,label,color])=>(
                        <label key={key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'8px 14px', borderRadius:10, border:`1px solid ${broadcastForm.channels[key]?`#${color}`:'rgba(255,255,255,.08)'}`, background:broadcastForm.channels[key]?`rgba(${key==='inApp'?'16,185,129':key==='email'?'139,92,246':key==='push'?'245,158,11':'6,182,212'},.1)`:'transparent', transition:'all .2s', width:'auto' }}>
                          <input type="checkbox" checked={broadcastForm.channels[key]} onChange={e=>setBroadcastForm({...broadcastForm,channels:{...broadcastForm.channels,[key]:e.target.checked}})} style={{ width:'auto', cursor:'pointer' }}/>
                          <span style={{ color:`#${color}`, display:'inline-flex' }}>{icon}</span>
                          <span style={{ fontSize:13, fontWeight:500 }}>{label}</span>
                        </label>
                      ))}
                    </div>
                    <p style={{ fontSize:11, color:'#4b5563', marginTop:8 }}>Les emails sont envoyés via Resend, le push via Firebase Cloud Messaging (FCM), les SMS via Infobip.</p>
                  </div>

                  {/* Contenu */}
                  <div style={{ marginBottom:16 }}>
                    <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Icône</label>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
                      {['🔔','📢','⚡','🎉','⚠️','💰','🌾','🚚','📱','🔥'].map(e=>(
                        <button key={e} onClick={()=>setBroadcastForm({...broadcastForm,icon:e})} style={{ width:36, height:36, borderRadius:8, border:`2px solid ${broadcastForm.icon===e?'#10b981':'transparent'}`, background:broadcastForm.icon===e?'rgba(16,185,129,.1)':'#1f2127', fontSize:18, cursor:'pointer' }}>{e}</button>
                      ))}
                    </div>
                    <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Titre *</label>
                    <input type="text" placeholder="Titre du message" value={broadcastForm.title} onChange={e=>setBroadcastForm({...broadcastForm,title:e.target.value})} style={{ marginBottom:10 }}/>
                    <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Message *</label>
                    <textarea placeholder="Contenu du message…" value={broadcastForm.body} onChange={e=>setBroadcastForm({...broadcastForm,body:e.target.value})} rows={4} style={{ resize:'vertical', marginBottom:10 }}/>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div>
                        <label style={{ fontSize:12, color:'#6b7280', marginBottom:5, display:'block' }}>Type</label>
                        <select value={broadcastForm.type} onChange={e=>setBroadcastForm({...broadcastForm,type:e.target.value as any})}>
                          <option value="system">Système</option>
                          <option value="promotion">Promotion</option>
                          <option value="alert">Alerte</option>
                          <option value="price">Prix</option>
                          <option value="order">Commande</option>
                          <option value="loan">Financement</option>
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:12, color:'#6b7280', marginBottom:5, display:'block' }}>Priorité</label>
                        <select value={broadcastForm.priority} onChange={e=>setBroadcastForm({...broadcastForm,priority:e.target.value as any})}>
                          <option value="low">Faible</option>
                          <option value="medium">Moyenne</option>
                          <option value="high">Haute</option>
                          <option value="critical">Critique</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop:10 }}>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:5, display:'block' }}>Lien (deepLink)</label>
                      <input type="text" placeholder="/page ou https://…" value={broadcastForm.deepLink} onChange={e=>setBroadcastForm({...broadcastForm,deepLink:e.target.value})}/>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12 }}>
                      <input type="checkbox" id="urgent" checked={broadcastForm.urgent} onChange={e=>setBroadcastForm({...broadcastForm,urgent:e.target.checked})} style={{ width:'auto', cursor:'pointer' }}/>
                      <label htmlFor="urgent" style={{ fontSize:13, cursor:'pointer', display:'inline-flex', alignItems:'center', gap:6 }}><Zap size={13} color="#f59e0b"/> Message urgent</label>
                    </div>
                  </div>

                  {/* Aperçu */}
                  {(broadcastForm.title || broadcastForm.body) && (
                    <div style={{ marginBottom:16, padding:14, background:'#1f2127', borderRadius:12 }}>
                      <div style={{ fontSize:11, color:'#6b7280', marginBottom:8 }}>Aperçu</div>
                      <div style={{ display:'flex', gap:10 }}>
                        <span style={{ fontSize:22 }}>{broadcastForm.icon}</span>
                        <div>
                          <div style={{ fontWeight:600, fontSize:14 }}>{broadcastForm.title || 'Titre…'}</div>
                          <div style={{ fontSize:12, color:'#9ca3af', marginTop:3 }}>{broadcastForm.body || 'Message…'}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button onClick={sendBroadcast} disabled={broadcastSending} className="btn-primary" style={{ width:'100%', justifyContent:'center', padding:'13px 20px', fontSize:14, opacity:broadcastSending?.5:1 }}>
                    {broadcastSending ? <><span className="animate-spin" style={{ display:'inline-block', width:16, height:16, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'white', borderRadius:'50%' }}/> Envoi en cours…</> : <><Send size={15}/> Envoyer la diffusion</>}
                  </button>
                </div>

                {/* History */}
                <div>
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16, display:'flex', alignItems:'center', gap:8 }}>
                      <History size={16} color="#8b5cf6"/> Historique des envois
                    </h3>
                    <div style={{ maxHeight:600, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                      {broadcastHistory.length === 0
                        ? <div style={{ textAlign:'center', padding:30, color:'#4b5563', fontSize:13 }}>Aucun envoi pour le moment</div>
                        : broadcastHistory.map(b => (
                            <div key={b.id} style={{ padding:14, background:'#1f2127', borderRadius:10 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:8 }}>
                                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                                  <span style={{ fontSize:18 }}>{b.icon}</span>
                                  <div>
                                    <div style={{ fontWeight:600, fontSize:13 }}>{b.title}</div>
                                    <div style={{ fontSize:11, color:'#6b7280', marginTop:2 }}>{b.body?.substring(0,50)}{b.body?.length>50?'…':''}</div>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                                <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(16,185,129,.1)', color:'#10b981' }}><Users size={10}/> {b.recipientCount}</span>
                                {b.inAppCount>0 && <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(6,182,212,.1)',  color:'#06b6d4' }}><Bell size={10}/> {b.inAppCount}</span>}
                                {b.emailCount>0 && <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(139,92,246,.1)', color:'#8b5cf6' }}><Mail size={10}/> {b.emailCount}</span>}
                                {b.pushCount>0  && <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(245,158,11,.1)', color:'#f59e0b' }}><Smartphone size={10}/> {b.pushCount}</span>}
                                {b.smsCount>0   && <span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(6,182,212,.1)',   color:'#06b6d4' }}><MessageSquare size={10}/> {b.smsCount}</span>}
                              </div>
                              <div style={{ fontSize:10, color:'#4b5563', marginTop:6 }}>
                                {b.sentAt?.toDate?.().toLocaleString?.() ?? ''}
                              </div>
                            </div>
                          ))
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ═══ NOTIFICATIONS ADMIN ════════════════════════ */}
            {activeTab === 'notifications' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:16, alignItems:'start' }} className="animate-fadeIn">

                {/* ── Flux temps réel ── */}
                <div className="glass-card" style={{ padding:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                    <div>
                      <h2 style={{ fontSize:18, fontWeight:700 }}>🔔 Toutes les notifications</h2>
                      <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{allNotifications.length} au total · {unreadCount} non lue(s) (admin)</p>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={()=>setSoundEnabled(!soundEnabled)} className="btn-secondary">
                        {soundEnabled ? <Volume2 size={14}/> : <VolumeX size={14}/>} Son
                      </button>
                      {unreadCount>0 && (
                        <button onClick={markAllNotificationsRead} className="btn-primary"><Check size={14}/> Tout lire</button>
                      )}
                    </div>
                  </div>

                  <div style={{ maxHeight:600, overflowY:'auto', display:'flex', flexDirection:'column', gap:6 }}>
                    {allNotifications.map(notif => {
                      const sender = users.find(u => (u.uid ?? u.id) === notif.userId);
                      return (
                        <div key={notif.id} style={{ padding:14, borderRadius:12, border:'1px solid #1f2127', background:notif.read?'transparent':'rgba(16,185,129,.04)' }}>
                          <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                            <span style={{ fontSize:22, flexShrink:0 }}>{notif.icon}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4, gap:8 }}>
                                <span style={{ fontWeight:600, fontSize:13 }}>{notif.title}</span>
                                <span style={{ fontSize:10, color:'#4b5563', flexShrink:0 }}>{notif.createdAt?.toDate?.().toLocaleString?.() ?? ''}</span>
                              </div>
                              <p style={{ fontSize:12, color:'#9ca3af', marginBottom:6 }}>{notif.body}</p>
                              <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(139,92,246,.1)', color:'#8b5cf6' }}>
                                  👤 {sender?.displayName ?? notif.userId?.slice(0,8) ?? '—'}
                                </span>
                                <StatusBadge status={notif.priority}/>
                                {notif.urgent && <span style={{ fontSize:10, padding:'2px 8px', borderRadius:20, background:'rgba(239,68,68,.1)', color:'#ef4444' }}>⚡ Urgent</span>}
                                {!notif.read && (
                                  <button onClick={()=>updateDoc(doc(db,'notifications',notif.id!),{read:true})} className="btn-secondary" style={{ padding:'3px 10px', fontSize:11 }}>
                                    Marquer lu
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {allNotifications.length === 0 && (
                      <div style={{ textAlign:'center', padding:60, color:'#4b5563' }}>🔕 Aucune notification</div>
                    )}
                  </div>
                </div>

                {/* ── Colonne droite : DM + Push à tous ── */}
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

                {/* ── Envoyer à un utilisateur ── */}
                <div className="glass-card" style={{ padding:20 }}>
                  <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>✉️ Message direct</h3>

                  {/* Recherche destinataire */}
                  <div style={{ marginBottom:14 }}>
                    <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Destinataire</label>
                    {dmTarget ? (
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderRadius:10, background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.3)' }}>
                        <div>
                          <div style={{ fontWeight:600, fontSize:13 }}>{dmTarget.displayName}</div>
                          <div style={{ fontSize:11, color:'#6b7280' }}>{dmTarget.role} · {dmTarget.phone || dmTarget.email}</div>
                        </div>
                        <button onClick={()=>{setDmTarget(null);setDmSearch('');}} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><X size={16}/></button>
                      </div>
                    ) : (
                      <>
                        <div style={{ position:'relative', marginBottom:8 }}>
                          <Search size={14} style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)', color:'#6b7280' }}/>
                          <input type="text" placeholder="Nom, téléphone ou email…" value={dmSearch} onChange={e=>setDmSearch(e.target.value)} style={{ paddingLeft:32 }}/>
                        </div>
                        {dmSearch.length > 1 && (
                          <div style={{ maxHeight:180, overflowY:'auto', borderRadius:10, border:'1px solid #1f2127', background:'#111317' }}>
                            {users.filter(u => {
                              const q = dmSearch.toLowerCase();
                              return u.displayName?.toLowerCase().includes(q) || u.phone?.includes(q) || u.email?.toLowerCase().includes(q);
                            }).slice(0,8).map(u => (
                              <div key={u.id} onClick={()=>{setDmTarget(u);setDmSearch('');}} style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid #1a1c22', display:'flex', alignItems:'center', gap:10 }}
                                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,.04)')}
                                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                                <div style={{ width:30, height:30, borderRadius:'50%', background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:13, flexShrink:0 }}>{u.displayName?.charAt(0)??'?'}</div>
                                <div>
                                  <div style={{ fontSize:13, fontWeight:500 }}>{u.displayName}</div>
                                  <div style={{ fontSize:11, color:'#6b7280' }}>{u.role} · {u.phone || u.email}</div>
                                </div>
                              </div>
                            ))}
                            {users.filter(u=>{const q=dmSearch.toLowerCase();return u.displayName?.toLowerCase().includes(q)||u.phone?.includes(q)||u.email?.toLowerCase().includes(q);}).length===0 && (
                              <div style={{ padding:14, textAlign:'center', fontSize:12, color:'#4b5563' }}>Aucun utilisateur trouvé</div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Icône */}
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Icône</label>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {['💬','📢','⚡','🎉','⚠️','💰','🌾','🚚','🔔','✅'].map(e=>(
                        <button key={e} onClick={()=>setDmForm({...dmForm,icon:e})} style={{ width:34, height:34, borderRadius:8, border:`2px solid ${dmForm.icon===e?'#10b981':'transparent'}`, background:dmForm.icon===e?'rgba(16,185,129,.1)':'#1f2127', fontSize:16, cursor:'pointer' }}>{e}</button>
                      ))}
                    </div>
                  </div>

                  <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Titre *</label>
                  <input type="text" placeholder="Objet du message" value={dmForm.title} onChange={e=>setDmForm({...dmForm,title:e.target.value})} style={{ marginBottom:10 }}/>

                  <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Message *</label>
                  <textarea placeholder="Votre message…" value={dmForm.body} onChange={e=>setDmForm({...dmForm,body:e.target.value})} rows={3} style={{ resize:'vertical', marginBottom:10 }}/>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:5, display:'block' }}>Type</label>
                      <select value={dmForm.type} onChange={e=>setDmForm({...dmForm,type:e.target.value as any})} style={{ fontSize:12 }}>
                        <option value="message">Message</option>
                        <option value="order">Commande</option>
                        <option value="alert">Alerte</option>
                        <option value="loan">Financement</option>
                        <option value="system">Système</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:5, display:'block' }}>Priorité</label>
                      <select value={dmForm.priority} onChange={e=>setDmForm({...dmForm,priority:e.target.value as any})} style={{ fontSize:12 }}>
                        <option value="low">Faible</option>
                        <option value="medium">Normale</option>
                        <option value="high">Haute</option>
                        <option value="critical">Critique</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
                    <input type="checkbox" id="dm-urgent" checked={dmForm.urgent} onChange={e=>setDmForm({...dmForm,urgent:e.target.checked})} style={{ width:'auto', cursor:'pointer' }}/>
                    <label htmlFor="dm-urgent" style={{ fontSize:13, cursor:'pointer' }}>⚡ Urgent</label>
                  </div>

                  <button onClick={sendDirectMessage} disabled={dmSending||!dmTarget} className="btn-primary" style={{ width:'100%', justifyContent:'center', opacity:(!dmTarget||dmSending)?0.5:1 }}>
                    {dmSending ? 'Envoi…' : <><Send size={14}/> Envoyer</>}
                  </button>
                </div>

                {/* ── Push à tous les tokens — "Radio Village" ──────────────
                    Signature : la tour de diffusion pulse au rythme de l'état
                    du formulaire (allumée dès que titre+message sont prêts),
                    et l'aperçu téléphone montre exactement ce que chaque
                    appareil affichera, mis à jour à chaque frappe. */}
                <div className="glass-card" style={{ padding:20, position:'relative', overflow:'hidden' }}>

                  {/* Halo ambiant discret derrière la tour */}
                  <div style={{
                    position:'absolute', top:-60, right:-60, width:180, height:180, borderRadius:'50%',
                    background:'radial-gradient(circle, rgba(245,158,11,.10), transparent 70%)',
                    pointerEvents:'none',
                  }} />

                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:4, position:'relative' }}>
                    {/* Tour de diffusion + anneaux de portée */}
                    <div style={{ position:'relative', width:38, height:38, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      {(pushAllForm.title && pushAllForm.body) && [0,1,2].map(i => (
                        <span key={i} style={{
                          position:'absolute', inset:0, borderRadius:'50%',
                          border:'1.5px solid rgba(245,158,11,.55)',
                          animation:`broadcastRing ${pushAllSending ? 1.1 : 2.4}s ease-out ${i * (pushAllSending ? 0.35 : 0.75)}s infinite`,
                        }} />
                      ))}
                      <RadioTower
                        size={20}
                        color={(pushAllForm.title && pushAllForm.body) ? '#f59e0b' : '#4b5563'}
                        style={{
                          position:'relative', zIndex:1,
                          animation: (pushAllForm.title && pushAllForm.body) ? 'towerGlow 1.8s ease-in-out infinite' : 'none',
                          transition:'color .3s',
                        }}
                      />
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <h3 style={{ fontSize:15, fontWeight:600, marginBottom:1 }}>Push à tous les tokens</h3>
                      <p style={{ fontSize:11, color:'#6b7280' }}>
                        Atteint chaque appareil enregistré, quel que soit le rôle ou la région
                      </p>
                    </div>
                  </div>

                  <div style={{ fontSize:11, color:'#6b7280', marginBottom:16, paddingBottom:14, borderBottom:'1px solid rgba(255,255,255,.06)' }}>
                    {pushTokenCount === null ? 'Portée en cours de calcul…' : (
                      <>Portée actuelle : <b style={{ color:'#e5e7eb' }}>{pushTokenCount.toLocaleString('fr-FR')}</b> appareil{pushTokenCount > 1 ? 's' : ''} joignable{pushTokenCount > 1 ? 's' : ''}</>
                    )}
                  </div>

                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Icône</label>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                      {['🔥','⭐','🎯','💥','🚀','💎','🏆','⚡','🎁','📣','✨','🚨'].map(e=>(
                        <button
                          key={e}
                          onClick={()=>setPushAllForm({...pushAllForm,icon:e})}
                          style={{
                            width:34, height:34, borderRadius:8,
                            border:`2px solid ${pushAllForm.icon===e?'#10b981':'transparent'}`,
                            background:pushAllForm.icon===e?'rgba(16,185,129,.12)':'#1f2127',
                            fontSize:16, cursor:'pointer',
                            transform: pushAllForm.icon===e ? 'scale(1.12)' : 'scale(1)',
                            boxShadow: pushAllForm.icon===e ? '0 0 0 1px rgba(16,185,129,.25)' : 'none',
                            transition:'transform .15s ease, border-color .15s ease, background .15s ease',
                          }}
                        >{e}</button>
                      ))}
                    </div>
                  </div>

                  <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Titre *</label>
                  <input type="text" placeholder="Ce que les gens verront en premier" value={pushAllForm.title} onChange={e=>setPushAllForm({...pushAllForm,title:e.target.value})} maxLength={65} style={{ marginBottom:10 }}/>

                  <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Message *</label>
                  <textarea placeholder="Votre message…" value={pushAllForm.body} onChange={e=>setPushAllForm({...pushAllForm,body:e.target.value})} rows={3} maxLength={180} style={{ resize:'vertical', marginBottom:10 }}/>

                  <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Lien (optionnel)</label>
                  <input type="text" placeholder="/main/products" value={pushAllForm.deepLink} onChange={e=>setPushAllForm({...pushAllForm,deepLink:e.target.value})} style={{ marginBottom:12 }}/>

                  <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Photo (optionnelle)</label>
                  {pushAllForm.imageUrl ? (
                    <div style={{ position:'relative', width:'100%', marginBottom:12, animation:'phoneRise .3s ease-out' }}>
                      <img src={pushAllForm.imageUrl} alt="Aperçu push" style={{ width:'100%', maxHeight:150, objectFit:'cover', borderRadius:10, display:'block' }} />
                      <button
                        type="button"
                        onClick={()=>setPushAllForm({...pushAllForm, imageUrl:''})}
                        style={{ position:'absolute', top:6, right:6, width:26, height:26, borderRadius:'50%', background:'rgba(0,0,0,.65)', color:'#fff', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}
                      >
                        <X size={14}/>
                      </button>
                    </div>
                  ) : (
                    <label style={{
                      display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                      border:'2px dashed rgba(245,158,11,.25)', borderRadius:10, padding:'14px', marginBottom:12,
                      cursor: pushAllImageUploading ? 'wait' : 'pointer', fontSize:12, color:'#6b7280',
                      transition:'border-color .15s ease, background .15s ease',
                    }}
                      onMouseEnter={e=>{ (e.currentTarget as HTMLLabelElement).style.borderColor='rgba(245,158,11,.6)'; (e.currentTarget as HTMLLabelElement).style.background='rgba(245,158,11,.04)'; }}
                      onMouseLeave={e=>{ (e.currentTarget as HTMLLabelElement).style.borderColor='rgba(245,158,11,.25)'; (e.currentTarget as HTMLLabelElement).style.background='transparent'; }}
                    >
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        disabled={pushAllImageUploading}
                        onChange={e=>{ handlePushAllImageSelect(e.target.files?.[0] || null); e.target.value=''; }}
                        style={{ display:'none' }}
                      />
                      {pushAllImageUploading ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} color="#f59e0b" />}
                      {pushAllImageUploading ? 'Upload…' : 'Ajouter une photo (facultatif)'}
                    </label>
                  )}

                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:18 }}>
                    <input type="checkbox" id="pushall-urgent" checked={pushAllForm.urgent} onChange={e=>setPushAllForm({...pushAllForm,urgent:e.target.checked})} style={{ width:'auto', cursor:'pointer' }}/>
                    <label htmlFor="pushall-urgent" style={{ fontSize:13, cursor:'pointer' }}>⚡ Urgent</label>
                  </div>

                  {/* ── Aperçu en direct — verrouillage d'écran ── */}
                  {(pushAllForm.title || pushAllForm.body) && (
                    <div style={{ marginBottom:18, animation:'phoneRise .35s ease-out' }}>
                      <label style={{ fontSize:11, color:'#4b5563', marginBottom:6, display:'flex', alignItems:'center', gap:5, letterSpacing:.3, textTransform:'uppercase' }}>
                        <span style={{ width:6, height:6, borderRadius:'50%', background:'#10b981', animation:'notchBlink 1.6s ease-in-out infinite' }} />
                        Aperçu — écran verrouillé
                      </label>
                      <div style={{
                        borderRadius:20, padding:'14px 14px',
                        background:'linear-gradient(160deg, #1c1e24, #101216)',
                        border:'1px solid rgba(255,255,255,.08)',
                        boxShadow:'inset 0 1px 0 rgba(255,255,255,.04), 0 8px 24px rgba(0,0,0,.35)',
                      }}>
                        <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                          <div style={{
                            width:34, height:34, borderRadius:9, flexShrink:0,
                            background:'linear-gradient(135deg,#10b981,#059669)',
                            display:'flex', alignItems:'center', justifyContent:'center', fontSize:16,
                          }}>🌾</div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                              <span style={{ fontSize:11, fontWeight:700, color:'#9ca3af' }}>AgriMarché</span>
                              <span style={{ fontSize:10, color:'#4b5563' }}>· à l'instant</span>
                              {pushAllForm.urgent && <span style={{ fontSize:9, fontWeight:700, color:'#ef4444', background:'rgba(239,68,68,.12)', padding:'1px 6px', borderRadius:8 }}>URGENT</span>}
                            </div>
                            <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginBottom:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                              {pushAllForm.icon} {pushAllForm.title || 'Titre du push'}
                            </div>
                            <div style={{ fontSize:12, color:'#d1d5db', lineHeight:1.4, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>
                              {pushAllForm.body || 'Votre message apparaîtra ici au fil de la frappe.'}
                            </div>
                          </div>
                          {pushAllForm.imageUrl && (
                            <img src={pushAllForm.imageUrl} alt="" style={{ width:44, height:44, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <button onClick={sendPushToAllTokens} disabled={pushAllSending||pushAllImageUploading||!pushAllForm.title||!pushAllForm.body} className="btn-primary" style={{ width:'100%', justifyContent:'center', opacity:(pushAllSending||pushAllImageUploading||!pushAllForm.title||!pushAllForm.body)?0.5:1 }}>
                    {pushAllSending ? 'Diffusion en cours…' : <><Send size={14}/> Envoyer à tous les tokens</>}
                  </button>

                  {/* ── Résultat animé ── */}
                  {pushAllResult && (
                    <div style={{
                      marginTop:14, padding:'14px 16px', borderRadius:12,
                      background: pushAllResult.fail > 0 ? 'rgba(245,158,11,.06)' : 'rgba(16,185,129,.06)',
                      border: `1px solid ${pushAllResult.fail > 0 ? 'rgba(245,158,11,.25)' : 'rgba(16,185,129,.25)'}`,
                      display:'flex', alignItems:'center', justifyContent:'space-between',
                      animation:'phoneRise .3s ease-out',
                    }}>
                      <div>
                        <div style={{ fontSize:11, color:'#6b7280', marginBottom:2 }}>Message diffusé</div>
                        <div style={{ fontSize:22, fontWeight:800, color:'#fff', fontVariantNumeric:'tabular-nums' }}>
                          {pushAllDisplayCount.toLocaleString('fr-FR')}
                          <span style={{ fontSize:12, fontWeight:500, color:'#6b7280', marginLeft:5 }}>appareil{pushAllDisplayCount > 1 ? 's' : ''} atteint{pushAllDisplayCount > 1 ? 's' : ''}</span>
                        </div>
                      </div>
                      {pushAllResult.fail > 0 && (
                        <span style={{ fontSize:11, color:'#f59e0b', fontWeight:600 }}>{pushAllResult.fail} échec{pushAllResult.fail > 1 ? 's' : ''}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* ── 🤖 Promotion IA automatique (produits sans commande) ── */}
                <div className="glass-card" style={{ padding:20 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <h3 style={{ fontSize:15, fontWeight:600 }}>🤖 Promotion IA automatique</h3>
                    <label style={{ display:'flex', alignItems:'center', gap:6, cursor: aiPromoLoading ? 'wait' : 'pointer' }}>
                      <input
                        type="checkbox"
                        disabled={aiPromoLoading || aiPromoSaving}
                        checked={aiPromoSettings.enabled}
                        onChange={e => saveAiPromoSettings({ ...aiPromoSettings, enabled: e.target.checked })}
                        style={{ width:'auto', cursor:'pointer' }}
                      />
                      <span style={{ fontSize:12, color: aiPromoSettings.enabled ? '#10b981' : '#6b7280' }}>
                        {aiPromoSettings.enabled ? 'Activée' : 'Désactivée'}
                      </span>
                    </label>
                  </div>
                  <p style={{ fontSize:11, color:'#6b7280', marginBottom:16 }}>
                    Détecte les produits ajoutés sans aucune commande depuis un certain délai, génère un message
                    avec l'IA (DeepSeek) et l'envoie automatiquement en push. Planifié via Vercel Cron une fois par jour.
                  </p>

                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Délai avant relance (heures)</label>
                      <input type="number" min={1} value={aiPromoSettings.thresholdHours}
                        onChange={e => setAiPromoSettings({ ...aiPromoSettings, thresholdHours: Number(e.target.value) || 1 })}
                        onBlur={() => saveAiPromoSettings(aiPromoSettings)} />
                    </div>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Anti-spam (jours entre 2 relances)</label>
                      <input type="number" min={1} value={aiPromoSettings.cooldownDays}
                        onChange={e => setAiPromoSettings({ ...aiPromoSettings, cooldownDays: Number(e.target.value) || 1 })}
                        onBlur={() => saveAiPromoSettings(aiPromoSettings)} />
                    </div>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Max produits / exécution</label>
                      <input type="number" min={1} max={50} value={aiPromoSettings.maxPerRun}
                        onChange={e => setAiPromoSettings({ ...aiPromoSettings, maxPerRun: Number(e.target.value) || 1 })}
                        onBlur={() => saveAiPromoSettings(aiPromoSettings)} />
                    </div>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Cible</label>
                      <select value={aiPromoSettings.scope}
                        onChange={e => saveAiPromoSettings({ ...aiPromoSettings, scope: e.target.value as 'all' | 'region' })}>
                        <option value="region">Région du produit</option>
                        <option value="all">Tous les tokens</option>
                      </select>
                    </div>
                  </div>

                  <button onClick={runAiPromoNow} disabled={aiPromoRunning} className="btn-primary" style={{ width:'100%', justifyContent:'center', opacity: aiPromoRunning ? 0.5 : 1, marginBottom:14 }}>
                    {aiPromoRunning ? 'Analyse en cours…' : <><Sparkles size={14}/> Lancer maintenant (test manuel)</>}
                  </button>

                  {aiPromoHistory.length > 0 && (
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Dernières promotions envoyées</label>
                      <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:220, overflowY:'auto' }}>
                        {aiPromoHistory.map(h => (
                          <div key={h.id} style={{ padding:8, borderRadius:8, background:'#1f2127', fontSize:11 }}>
                            <div style={{ fontWeight:600 }}>{h.icon} {h.title}</div>
                            <div style={{ color:'#6b7280', marginTop:2 }}>{h.productName} · {h.recipientCount} destinataire(s) · {h.pushSuccessCount} réussi(s)</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── ⚠️ Alerte stock bas / rupture — ÉVÉNEMENTIELLE, sans cron ── */}
                <div className="glass-card" style={{ padding:20, marginTop:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <h3 style={{ fontSize:15, fontWeight:600 }}>⚠️ Alerte stock bas / rupture</h3>
                    <label style={{ display:'flex', alignItems:'center', gap:6, cursor: lowStockLoading ? 'wait' : 'pointer' }}>
                      <input
                        type="checkbox"
                        disabled={lowStockLoading || lowStockSaving}
                        checked={lowStockSettings.enabled}
                        onChange={e => saveLowStockSettings({ ...lowStockSettings, enabled: e.target.checked })}
                        style={{ width:'auto', cursor:'pointer' }}
                      />
                      <span style={{ fontSize:12, color: lowStockSettings.enabled ? '#10b981' : '#6b7280' }}>
                        {lowStockSettings.enabled ? 'Activée' : 'Désactivée'}
                      </span>
                    </label>
                  </div>
                  <p style={{ fontSize:11, color:'#6b7280', marginBottom:16 }}>
                    Prévient le vendeur dès qu'un de ses produits passe sous le seuil de stock. Pas de cron : se
                    déclenche à l'instant précis d'une commande (voir checkout), donc pas d'attente entre deux vérifications.
                  </p>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Seuil (stock ≤)</label>
                      <input type="number" min={0} value={lowStockSettings.threshold}
                        onChange={e => setLowStockSettings({ ...lowStockSettings, threshold: Number(e.target.value) || 0 })}
                        onBlur={() => saveLowStockSettings(lowStockSettings)} />
                    </div>
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Anti-spam (heures entre 2 alertes)</label>
                      <input type="number" min={1} value={lowStockSettings.cooldownHours}
                        onChange={e => setLowStockSettings({ ...lowStockSettings, cooldownHours: Number(e.target.value) || 1 })}
                        onBlur={() => saveLowStockSettings(lowStockSettings)} />
                    </div>
                  </div>
                  {lowStockHistory.length > 0 && (
                    <div>
                      <label style={{ fontSize:12, color:'#6b7280', marginBottom:6, display:'block' }}>Historique récent</label>
                      <div style={{ display:'flex', flexDirection:'column', gap:6, maxHeight:180, overflowY:'auto' }}>
                        {lowStockHistory.map(h => (
                          <div key={h.id} style={{ padding:8, borderRadius:8, background:'#1f2127', fontSize:11, color:'#6b7280' }}>
                            {h.productsNotified} vendeur(s) alerté(s) · {h.pushSuccessCount} push réussi(s)
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* ── ⏳ Relances commandes en attente + 👋 Clients inactifs — sans cron ── */}
                <div className="glass-card" style={{ padding:20, marginTop:16 }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                    <h3 style={{ fontSize:15, fontWeight:600 }}>⏳ Relances automatiques</h3>
                  </div>
                  <p style={{ fontSize:11, color:'#6b7280', marginBottom:16 }}>
                    Pas de cron ici non plus : ces deux règles dépendent du temps qui passe (pas d'événement
                    d'écriture précis à écouter), donc elles se déclenchent au fil du trafic réel de l'app — chaque
                    commande passée, et chaque ouverture de ce tableau de bord — avec un anti-doublon serveur pour
                    ne jamais scanner deux fois de suite inutilement. Sur une période totalement calme (aucun achat,
                    personne côté admin), rien ne se déclenche tant qu'aucun des deux ne se reproduit : c'est le
                    compromis assumé pour éviter toute infrastructure de planification.
                  </p>

                  <div style={{ borderTop:'1px solid #1a1c22', paddingTop:14, marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <h4 style={{ fontSize:13, fontWeight:600 }}>Commandes en attente non traitées</h4>
                      <label style={{ display:'flex', alignItems:'center', gap:6, cursor: pendingOrdersLoading ? 'wait' : 'pointer' }}>
                        <input
                          type="checkbox"
                          disabled={pendingOrdersLoading || pendingOrdersSaving}
                          checked={pendingOrdersSettings.enabled}
                          onChange={e => savePendingOrdersSettings({ ...pendingOrdersSettings, enabled: e.target.checked })}
                          style={{ width:'auto', cursor:'pointer' }}
                        />
                        <span style={{ fontSize:12, color: pendingOrdersSettings.enabled ? '#10b981' : '#6b7280' }}>
                          {pendingOrdersSettings.enabled ? 'Activée' : 'Désactivée'}
                        </span>
                      </label>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                      <div>
                        <label style={{ fontSize:11, color:'#6b7280', marginBottom:6, display:'block' }}>Relance après (h)</label>
                        <input type="number" min={1} value={pendingOrdersSettings.thresholdHours}
                          onChange={e => setPendingOrdersSettings({ ...pendingOrdersSettings, thresholdHours: Number(e.target.value) || 1 })}
                          onBlur={() => savePendingOrdersSettings(pendingOrdersSettings)} />
                      </div>
                      <div>
                        <label style={{ fontSize:11, color:'#6b7280', marginBottom:6, display:'block' }}>Anti-spam (h)</label>
                        <input type="number" min={1} value={pendingOrdersSettings.cooldownHours}
                          onChange={e => setPendingOrdersSettings({ ...pendingOrdersSettings, cooldownHours: Number(e.target.value) || 1 })}
                          onBlur={() => savePendingOrdersSettings(pendingOrdersSettings)} />
                      </div>
                      <div>
                        <label style={{ fontSize:11, color:'#6b7280', marginBottom:6, display:'block' }}>Escalade admin après (h)</label>
                        <input type="number" min={1} value={pendingOrdersSettings.escalateAfterHours}
                          onChange={e => setPendingOrdersSettings({ ...pendingOrdersSettings, escalateAfterHours: Number(e.target.value) || 1 })}
                          onBlur={() => savePendingOrdersSettings(pendingOrdersSettings)} />
                      </div>
                    </div>
                    {pendingOrdersHistory.length > 0 && (
                      <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6, maxHeight:140, overflowY:'auto' }}>
                        {pendingOrdersHistory.map(h => (
                          <div key={h.id} style={{ padding:8, borderRadius:8, background:'#1f2127', fontSize:11, color:'#6b7280' }}>
                            {h.ordersNotified} commande(s) relancée(s){h.escalated > 0 ? ` · ${h.escalated} escaladée(s) aux admins` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop:'1px solid #1a1c22', paddingTop:14, marginBottom:14 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <h4 style={{ fontSize:13, fontWeight:600 }}>Clients inactifs</h4>
                      <label style={{ display:'flex', alignItems:'center', gap:6, cursor: inactiveClientsLoading ? 'wait' : 'pointer' }}>
                        <input
                          type="checkbox"
                          disabled={inactiveClientsLoading || inactiveClientsSaving}
                          checked={inactiveClientsSettings.enabled}
                          onChange={e => saveInactiveClientsSettings({ ...inactiveClientsSettings, enabled: e.target.checked })}
                          style={{ width:'auto', cursor:'pointer' }}
                        />
                        <span style={{ fontSize:12, color: inactiveClientsSettings.enabled ? '#10b981' : '#6b7280' }}>
                          {inactiveClientsSettings.enabled ? 'Activée' : 'Désactivée'}
                        </span>
                      </label>
                    </div>
                    <p style={{ fontSize:10, color:'#6b7280', marginBottom:10 }}>
                      "Inactif" = pas de commande depuis N jours (pas de suivi de dernière connexion dans l'app).
                    </p>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div>
                        <label style={{ fontSize:11, color:'#6b7280', marginBottom:6, display:'block' }}>Inactif après (jours)</label>
                        <input type="number" min={1} value={inactiveClientsSettings.thresholdDays}
                          onChange={e => setInactiveClientsSettings({ ...inactiveClientsSettings, thresholdDays: Number(e.target.value) || 1 })}
                          onBlur={() => saveInactiveClientsSettings(inactiveClientsSettings)} />
                      </div>
                      <div>
                        <label style={{ fontSize:11, color:'#6b7280', marginBottom:6, display:'block' }}>Anti-spam (jours)</label>
                        <input type="number" min={1} value={inactiveClientsSettings.cooldownDays}
                          onChange={e => setInactiveClientsSettings({ ...inactiveClientsSettings, cooldownDays: Number(e.target.value) || 1 })}
                          onBlur={() => saveInactiveClientsSettings(inactiveClientsSettings)} />
                      </div>
                    </div>
                    {inactiveClientsHistory.length > 0 && (
                      <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:6, maxHeight:140, overflowY:'auto' }}>
                        {inactiveClientsHistory.map(h => (
                          <div key={h.id} style={{ padding:8, borderRadius:8, background:'#1f2127', fontSize:11, color:'#6b7280' }}>
                            {h.clientsChecked} client(s) vérifié(s) · {h.clientsNotified} relancé(s)
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <button onClick={runPeriodicChecksNow} disabled={periodicChecksRunning} className="btn-primary" style={{ width:'100%', justifyContent:'center', opacity: periodicChecksRunning ? 0.5 : 1 }}>
                    {periodicChecksRunning ? 'Scan en cours…' : <><Sparkles size={14}/> Forcer le scan maintenant (test manuel)</>}
                  </button>
                </div>

                </div>

              </div>
            )}

            {/* ═══ LIVRAISONS ═════════════════════════════════ */}
            {activeTab === 'delivery' && (
              <div className="animate-fadeIn">
                {/* Total plateforme : somme de tous les deliveryFee versés/dus
                    aux livreurs, distincte de `platformRevenue` (la
                    commission de la plateforme sur `amount`) — ce sont deux
                    montants différents qui ne doivent jamais être confondus. */}
                <div className="glass-card" style={{ padding:16, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>Total frais de livraison — commandes livrées</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#10b981' }}>{totalDelivererEarnings.toLocaleString()} FCFA</div>
                  </div>
                  <div style={{ fontSize:11, color:'#6b7280', textAlign:'right' }}>
                    Gagné, pas versé — aucun statut de paiement<br/>n'existe encore dans l'app
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16 }}>
                {deliveryPersons.map(d=>{
                  const stats = delivererEarnings[d.id!] || { total:0, today:0, week:0, count:0 };
                  return (
                  <div key={d.id} className="glass-card" style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                      <div style={{ width:44, height:44, borderRadius:12, background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🚚</div>
                      <div><div style={{ fontWeight:600 }}>{d.displayName}</div><div style={{ fontSize:12, color:'#6b7280' }}>{d.phone||'—'}</div></div>
                    </div>

                    {/* Gains — même donnée que "Mes gains" côté livreur */}
                    <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                      <div style={{ flex:1, background:'rgba(16,185,129,.08)', border:'1px solid rgba(16,185,129,.25)', borderRadius:10, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, color:'#6b7280' }}>Total</div>
                        <div style={{ fontSize:14, fontWeight:700, color:'#10b981' }}>{stats.total.toLocaleString()} FCFA</div>
                      </div>
                      <div style={{ flex:1, background:'#15171c', borderRadius:10, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, color:'#6b7280' }}>Aujourd'hui</div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{stats.today.toLocaleString()} FCFA</div>
                      </div>
                      <div style={{ flex:1, background:'#15171c', borderRadius:10, padding:'8px 10px' }}>
                        <div style={{ fontSize:10, color:'#6b7280' }}>7 jours</div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{stats.week.toLocaleString()} FCFA</div>
                      </div>
                    </div>

                    {[['Véhicule',d.vehicle||'Non spécifié'],['Région',d.region||'—'],['Livraisons validées',String(stats.count)],['Statut','✅ Disponible']].map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'6px 0', borderBottom:'1px solid #1a1c22' }}>
                        <span style={{ color:'#6b7280' }}>{k}</span><span>{v}</span>
                      </div>
                    ))}
                    <button className="btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:12 }}>
                      <Phone size={13}/> Contacter
                    </button>
                  </div>
                  );
                })}
                {deliveryPersons.length===0 && (
                  <div className="glass-card" style={{ padding:40, textAlign:'center', gridColumn:'1/-1', color:'#6b7280' }}>Aucun livreur disponible</div>
                )}
                </div>
              </div>
            )}

            {/* ═══ PARAMÈTRES ═════════════════════════════════ */}
            {activeTab === 'settings' && (
              <div className="glass-card animate-fadeIn" style={{ padding:20 }}>
                <h2 style={{ fontSize:18, fontWeight:700, marginBottom:20 }}>⚙️ Paramètres</h2>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(380px,1fr))', gap:16 }}>
                  {[
                    { title:'Plateforme',    items:[['Version','3.0.0 — IA Ultra'],['Commission','2% du CA'],['Devise','FCFA'],['Région','Sénégal']] },
                    { title:'Firebase',      items:[['Firestore','Connecté ✅'],['Auth','Actif ✅'],['Storage','Actif ✅'],['FCM',pushEnabled?'Activé ✅':'Désactivé']] },
                    { title:'Notifications', items:[['Son',soundEnabled?'Activé':'Désactivé'],['Push',pushEnabled?'Activé':'Désactivé'],['Token FCM',fcmToken?'Enregistré ✅':'En attente']] },
                    { title:'IA & Analytics',items:[['Scoring crédit','Actif ✅'],['Prédictions prix','Actif ✅'],['Anomalies','Actif ✅'],['Régions','14 régions']] },
                  ].map(section=>(
                    <div key={section.title} className="glass-card" style={{ padding:16 }}>
                      <h3 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#10b981' }}>{section.title}</h3>
                      {section.items.map(([k,v])=>(
                        <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid #1a1c22', fontSize:12 }}>
                          <span style={{ color:'#6b7280' }}>{k}</span>
                          <span style={{ fontWeight:500 }}>{v}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* ═══ PROMOTIONS & PUBLICITÉS ════════════════════ */}
            {activeTab === 'reviews' && (() => {
              const sellerStats = new Map<string, { name: string; phone: string; count: number; sum: number; low: number }>();
              reviews.forEach(r => {
                const key = r.sellerId || 'inconnu';
                const seller = users.find(u => (u.uid ?? u.id) === key);
                const entry = sellerStats.get(key) ?? {
                  name: r.sellerName || seller?.displayName || 'Vendeur inconnu',
                  phone: seller?.phone || '',
                  count: 0, sum: 0, low: 0,
                };
                entry.count += 1;
                entry.sum += r.rating || 0;
                if ((r.rating || 0) <= 2) entry.low += 1;
                sellerStats.set(key, entry);
              });
              const worstSellers = [...sellerStats.entries()]
                .map(([id, s]) => ({ id, ...s, avg: s.sum / s.count }))
                .filter(s => s.count > 0)
                .sort((a, b) => a.avg - b.avg || b.low - a.low);

              const filteredReviews = reviewSellerFilter === 'all'
                ? reviews
                : reviews.filter(r => r.sellerId === reviewSellerFilter);

              const globalAvg = reviews.length > 0
                ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1)
                : '—';
              const lowCount = reviews.filter(r => (r.rating || 0) <= 2).length;

              return (
                <div className="animate-fadeIn" style={{ display:'grid', gap:20 }}>
                  <div>
                    <h2 style={{ fontSize:18, fontWeight:700, display:'flex', alignItems:'center', gap:8 }}>
                      <Star size={18} color="#f59e0b" /> Avis clients
                    </h2>
                    <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>
                      Toutes les notes laissées par les clients, tous vendeurs confondus — pour repérer qui blâmer, avertir ou couper.
                    </p>
                  </div>

                  {/* ── Stats globales ── */}
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                    <div className="glass-card" style={{ padding:16 }}>
                      <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#6b7280' }}>Avis reçus</div>
                      <div style={{ fontSize:26, fontWeight:800, marginTop:4 }}>{reviews.length}</div>
                    </div>
                    <div className="glass-card" style={{ padding:16 }}>
                      <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#6b7280' }}>Note moyenne globale</div>
                      <div style={{ fontSize:26, fontWeight:800, marginTop:4 }}>{globalAvg} <span style={{ fontSize:13, color:'#6b7280' }}>/5</span></div>
                    </div>
                    <div className="glass-card" style={{ padding:16, border: lowCount>0 ? '1px solid rgba(239,68,68,.4)' : undefined }}>
                      <div style={{ fontSize:10, letterSpacing:1, textTransform:'uppercase', color:'#ef4444' }}>Avis ≤ 2/5 (alerte)</div>
                      <div style={{ fontSize:26, fontWeight:800, marginTop:4, color: lowCount>0 ? '#ef4444' : undefined }}>{lowCount}</div>
                    </div>
                  </div>

                  {/* ── Vendeurs à surveiller (pires notes) ── */}
                  {worstSellers.length > 0 && (
                    <div className="glass-card" style={{ padding:20 }}>
                      <h3 style={{ fontSize:14, fontWeight:700, marginBottom:12, display:'flex', alignItems:'center', gap:8 }}>
                        <AlertTriangle size={15} color="#ef4444" /> Vendeurs à surveiller (pires moyennes en premier)
                      </h3>
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        {worstSellers.slice(0, 8).map(s => (
                          <div key={s.id} onClick={() => setReviewSellerFilter(s.id)} style={{
                            display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px',
                            borderRadius:10, cursor:'pointer',
                            background: reviewSellerFilter===s.id ? 'rgba(16,185,129,.08)' : 'rgba(255,255,255,.02)',
                            border: s.avg <= 2.5 ? '1px solid rgba(239,68,68,.3)' : '1px solid #1f2127',
                          }}>
                            <div>
                              <div style={{ fontWeight:600, fontSize:13 }}>{s.name}</div>
                              {s.phone && <div style={{ fontSize:11, color:'#6b7280' }}>{s.phone}</div>}
                            </div>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontWeight:800, fontSize:15, color: s.avg <= 2.5 ? '#ef4444' : s.avg <= 3.5 ? '#f59e0b' : '#10b981' }}>
                                {s.avg.toFixed(1)}/5
                              </div>
                              <div style={{ fontSize:10, color:'#6b7280' }}>{s.count} avis{s.low > 0 ? ` · ${s.low} note(s) faible(s)` : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── Liste des avis (filtrable par vendeur) ── */}
                  <div className="glass-card" style={{ padding:20 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, gap:10, flexWrap:'wrap' }}>
                      <h3 style={{ fontSize:14, fontWeight:700 }}>Détail des avis</h3>
                      <select
                        value={reviewSellerFilter}
                        onChange={e => setReviewSellerFilter(e.target.value)}
                        style={{ background:'#0f1115', border:'1px solid #1f2127', color:'#e5e7eb', borderRadius:8, padding:'6px 10px', fontSize:12 }}
                      >
                        <option value="all">Tous les vendeurs</option>
                        {[...sellerStats.entries()].map(([id, s]) => (
                          <option key={id} value={id}>{s.name} ({s.count})</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ maxHeight:520, overflowY:'auto', display:'flex', flexDirection:'column', gap:8 }}>
                      {filteredReviews.map(r => {
                        const isLow = (r.rating || 0) <= 2;
                        return (
                          <div key={r.id} style={{
                            padding:12, borderRadius:10,
                            border: isLow ? '1px solid rgba(239,68,68,.35)' : '1px solid #1f2127',
                            background: isLow ? 'rgba(239,68,68,.05)' : 'transparent',
                          }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
                              <div>
                                <span style={{ fontWeight:600, fontSize:13 }}>{r.userName || 'Client'}</span>
                                <span style={{ fontSize:11, color:'#6b7280' }}> → {r.sellerName || 'Vendeur'}</span>
                              </div>
                              <span style={{ fontWeight:800, fontSize:13, color: isLow ? '#ef4444' : '#f59e0b' }}>
                                {r.rating}/5 ★
                              </span>
                            </div>
                            {r.comment && <p style={{ fontSize:12, color:'#9ca3af', marginTop:6 }}>{r.comment}</p>}
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                              <div style={{ fontSize:10, color:'#4b5563' }}>
                                {r.createdAt?.toDate?.().toLocaleString?.() ?? ''}
                                {r.userEmail ? ` · ${r.userEmail}` : ''}
                              </div>
                              <button
                                onClick={() => deleteReview(r.id)}
                                disabled={deletingReviewId === r.id}
                                className="btn-secondary"
                                style={{ padding:'3px 9px', fontSize:10, color:'#ef4444', borderColor:'#ef4444' }}
                              >
                                <Trash2 size={10}/> {deletingReviewId === r.id ? 'Suppression...' : 'Supprimer'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                      {filteredReviews.length === 0 && (
                        <div style={{ textAlign:'center', padding:40, color:'#4b5563' }}>Aucun avis pour ce filtre</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            {activeTab === 'ads' && (
              <div className="animate-fadeIn" style={{ display:'grid', gap:24 }}>

                {/* ── Header hero doré — divin ── */}
                <div className="divine-hero" style={{
                  position:'relative', overflow:'hidden', borderRadius:24, padding:'32px 26px',
                  background:'radial-gradient(ellipse 120% 80% at 20% -10%,rgba(212,175,55,0.16),transparent 60%), linear-gradient(135deg,#070b09 0%,#151f18 45%,#0a120d 100%)',
                  border:'1px solid rgba(212,175,55,0.4)', boxShadow:'0 20px 60px rgba(0,0,0,0.35)'
                }}>
                  {/* Halo tournant derrière l'icône */}
                  <div style={{ position:'absolute', top:-90, right:-90, width:280, height:280, pointerEvents:'none' }}>
                    <div className="divine-halo" style={{ width:'100%', height:'100%', borderRadius:'50%', background:'conic-gradient(from 0deg,rgba(212,175,55,0.35),transparent 30%,transparent 60%,rgba(245,225,164,0.3),transparent 90%)' }}/>
                  </div>
                  <div style={{ position:'absolute', bottom:-70, left:-40, width:180, height:180, borderRadius:'50%', background:'radial-gradient(circle,rgba(212,175,55,0.14),transparent 70%)', pointerEvents:'none' }}/>

                  {/* Particules scintillantes */}
                  {[
                    { top:'14%', left:'62%', size:3, delay:'0s' },
                    { top:'55%', left:'74%', size:4, delay:'.7s' },
                    { top:'30%', left:'86%', size:2, delay:'1.4s' },
                    { top:'70%', left:'55%', size:3, delay:'2.1s' },
                    { top:'20%', left:'40%', size:2, delay:'1.8s' },
                  ].map((p,i)=>(
                    <span key={i} className="divine-sparkle" style={{ top:p.top, left:p.left, width:p.size, height:p.size, background:'#F5E1A4', boxShadow:'0 0 8px 2px rgba(245,225,164,0.8)', animationDelay:p.delay }}/>
                  ))}

                  <div style={{ display:'flex', alignItems:'center', gap:16, position:'relative', zIndex:1 }}>
                    <div style={{ position:'relative', width:58, height:58, flexShrink:0 }}>
                      <div style={{ position:'absolute', inset:-8, borderRadius:'50%', border:'1px solid rgba(212,175,55,0.35)' }}/>
                      <div style={{ position:'absolute', inset:0, borderRadius:16, animation:'ringExpand 2.4s ease-out infinite', border:'1px solid rgba(212,175,55,0.5)' }}/>
                      <div style={{ width:58, height:58, borderRadius:16, display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg,#D4AF37,#F5E1A4,#B8860B)', boxShadow:'0 8px 28px rgba(212,175,55,0.55), inset 0 1px 2px rgba(255,255,255,0.5)' }}>
                        <Megaphone size={28} color="#151108"/>
                      </div>
                    </div>
                    <div>
                      <h2 className="divine-shimmer-text" style={{
                        fontSize:27, fontWeight:800, letterSpacing:0.4, margin:0,
                        backgroundImage:'linear-gradient(110deg,#B8860B 10%,#F5E1A4 35%,#fff 50%,#F5E1A4 65%,#B8860B 90%)',
                        WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent',
                      }}>
                        Promotions &amp; Publicités
                      </h2>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:4, letterSpacing:1.6, textTransform:'uppercase', display:'flex', alignItems:'center', gap:6 }}>
                        <Star size={10} color="#D4AF37" fill="#D4AF37"/> Sacré Terroir · Visibilité Premium · AgriMarché
                      </p>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginTop:24, position:'relative', zIndex:1 }}>
                    {[
                      { label:'Promos actives',  value: ads.filter(a=>a.active&&a.type==='promotion').length,  icon:<Sparkles size={14}/>, color:'#D4AF37' },
                      { label:'Pubs actives',    value: ads.filter(a=>a.active&&a.type==='publicite').length,  icon:<Gift size={14}/>,     color:'#F5E1A4' },
                      { label:'Total créées',    value: ads.length,                                             icon:<Star size={14}/>,     color:'#B8860B' },
                      { label:'En bannière',     value: ads.filter(a=>a.placement==='banner'||a.placement==='both').length, icon:<Award size={14}/>, color:'#10b981' },
                    ].map((s,i)=>(
                      <div key={i} className="divine-card" style={{ background:'linear-gradient(160deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))', border:'1px solid rgba(212,175,55,0.2)', borderRadius:14, padding:'14px 16px', backdropFilter:'blur(6px)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:5, color:s.color, marginBottom:7 }}>
                          {s.icon}
                          <span style={{ fontSize:9, letterSpacing:1.2, textTransform:'uppercase', color:'rgba(255,255,255,0.42)' }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize:28, fontWeight:800, color:'#fff', lineHeight:1, textShadow:'0 0 20px rgba(212,175,55,0.25)' }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Sous-onglets — divin ── */}
                <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.03)', borderRadius:18, padding:6, border:'1px solid rgba(212,175,55,0.15)' }}>
                  {([
                    ['promotions', '🏷️ Promotions', 'Prix réduits sur produits existants'],
                    ['publicites', '🖼️ Publicités', 'Bannières partenaires avec image'],
                  ] as const).map(([key, label, sub])=>(
                    <button key={key} onClick={()=>setAdsSubTab(key)}
                      style={{
                        flex:1, padding:'13px 16px', borderRadius:13, border:'none', cursor:'pointer', transition:'all .25s ease', position:'relative', overflow:'hidden',
                        background: adsSubTab===key ? 'linear-gradient(135deg,rgba(212,175,55,0.24),rgba(212,175,55,0.06))' : 'transparent',
                        boxShadow: adsSubTab===key ? '0 8px 24px rgba(212,175,55,0.18), inset 0 1px 0 rgba(255,255,255,0.06)' : 'none',
                        borderBottom: adsSubTab===key ? '2px solid #D4AF37' : '2px solid transparent',
                      }}>
                      <div style={{ fontWeight:700, fontSize:14, color: adsSubTab===key ? '#F5E1A4' : '#6b7280' }}>{label}</div>
                      <div style={{ fontSize:10, color: adsSubTab===key ? '#D4AF37' : '#4b5563', marginTop:2 }}>{sub}</div>
                    </button>
                  ))}
                </div>

                {/* ══════════════════════════════════════════════════
                    SOUS-ONGLET : PROMOTIONS (sélection produit + %)
                    ══════════════════════════════════════════════════ */}
                {adsSubTab === 'promotions' && (() => {
                  const selectedProduct = products.find(p=>p.id===promoForm.productId);
                  const originalPrice   = selectedProduct?.price ?? 0;
                  const discountedPrice = Math.round(originalPrice * (1 - promoForm.discountPercent / 100));
                  const savings         = originalPrice - discountedPrice;

                  return (
                    <div style={{ display:'grid', gap:20 }}>
                      {/* Formulaire */}
                      <div className="divine-hero" style={{ borderRadius:20, padding:24, background:'linear-gradient(160deg,#0f1a14 0%,#1a2a20 100%)', border:'1px solid rgba(212,175,55,0.3)' }}>
                        <h3 style={{ fontSize:16, fontWeight:700, color:'#F5E1A4', display:'flex', alignItems:'center', gap:8, margin:0, marginBottom:20 }}>
                          <Sparkles size={17} color="#D4AF37"/> {editingPromoId ? 'Modifier la promotion' : 'Créer une promotion produit'}
                        </h3>

                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

                          {/* Sélection produit */}
                          <div style={{ gridColumn:'1/-1' }}>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#D4AF37', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Produit concerné *</label>
                            <select
                              style={{ background:'#111317', border:'1px solid rgba(212,175,55,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                              value={promoForm.productId}
                              onChange={e=>setPromoForm({...promoForm, productId:e.target.value})}
                            >
                              <option value="">— Choisir un produit —</option>
                              {products.map(p=>(
                                <option key={p.id} value={p.id}>{p.name} · {p.category} · {p.price?.toLocaleString()} FCFA · Stock {p.stock}</option>
                              ))}
                            </select>
                          </div>

                          {/* Aperçu prix Jumia-style */}
                          {selectedProduct && (
                            <div style={{ gridColumn:'1/-1', background:'rgba(212,175,55,0.06)', border:'1px solid rgba(212,175,55,0.2)', borderRadius:14, padding:18 }}>
                              <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', letterSpacing:1, textTransform:'uppercase', marginBottom:10 }}>Aperçu prix — style Jumia</div>
                              <div style={{ display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                                {/* Image produit si disponible */}
                                {selectedProduct.images?.[0] && (
                                  <img src={selectedProduct.images[0]} alt={selectedProduct.name} style={{ width:64, height:64, objectFit:'cover', borderRadius:10, flexShrink:0 }} loading="lazy"/>
                                )}
                                <div>
                                  <div style={{ fontWeight:700, fontSize:15, color:'#fff', marginBottom:4 }}>{selectedProduct.name}</div>
                                  <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                                    {/* Nouveau prix — vert vif */}
                                    <span style={{ fontSize:26, fontWeight:800, color:'#10b981' }}>{discountedPrice.toLocaleString()} FCFA</span>
                                    {/* Ancien prix barré */}
                                    <span style={{ fontSize:16, color:'#6b7280', textDecoration:'line-through' }}>{originalPrice.toLocaleString()} FCFA</span>
                                    {/* Badge % réduction */}
                                    <span style={{ fontSize:13, fontWeight:700, color:'#fff', background:'#ef4444', borderRadius:6, padding:'3px 10px' }}>
                                      -{promoForm.discountPercent}%
                                    </span>
                                  </div>
                                  <div style={{ fontSize:12, color:'#f59e0b', marginTop:6 }}>
                                    💰 Vous économisez {savings.toLocaleString()} FCFA
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* % de réduction */}
                          <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#D4AF37', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>
                              Réduction : <span style={{ color:'#ef4444', fontSize:14 }}>{promoForm.discountPercent}%</span>
                            </label>
                            <input
                              type="range" min={5} max={80} step={5}
                              value={promoForm.discountPercent}
                              onChange={e=>setPromoForm({...promoForm, discountPercent:Number(e.target.value)})}
                              style={{ width:'100%', accentColor:'#D4AF37', cursor:'pointer', background:'transparent', border:'none', padding:0, height:6 }}
                            />
                            <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#6b7280', marginTop:4 }}>
                              <span>5%</span><span>80%</span>
                            </div>
                          </div>

                          {/* Badge */}
                          <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#D4AF37', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Badge</label>
                            <select
                              style={{ background:'#111317', border:'1px solid rgba(212,175,55,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                              value={promoForm.badge}
                              onChange={e=>setPromoForm({...promoForm,badge:e.target.value})}
                            >
                              <option value="🔥 PROMO">🔥 PROMO</option>
                              <option value="⏳ LIMITÉ">⏳ LIMITÉ</option>
                              <option value="💎 EXCLUSIF">💎 EXCLUSIF</option>
                              <option value="⭐ TOP VENTE">⭐ TOP VENTE</option>
                              <option value="🌱 BIO">🌱 BIO</option>
                              <option value="📦 SOLDES">📦 SOLDES</option>
                            </select>
                          </div>

                          {/* Emplacement */}
                          <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#D4AF37', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Emplacement</label>
                            <select
                              style={{ background:'#111317', border:'1px solid rgba(212,175,55,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                              value={promoForm.placement}
                              onChange={e=>setPromoForm({...promoForm,placement:e.target.value})}
                            >
                              <option value="banner">📌 Bannière vedette</option>
                              <option value="feed">🎞️ Carrousel feed</option>
                              <option value="both">📌🎞️ Les deux</option>
                            </select>
                          </div>

                          {/* Priorité */}
                          <div>
                            <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#D4AF37', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Priorité</label>
                            <select
                              style={{ background:'#111317', border:'1px solid rgba(212,175,55,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                              value={promoForm.priority}
                              onChange={e=>setPromoForm({...promoForm,priority:Number(e.target.value)})}
                            >
                              <option value={0}>Normale</option>
                              <option value={1}>🥈 Élevée</option>
                              <option value={2}>🥇 Maximale</option>
                            </select>
                          </div>

                          {/* Actif */}
                          <div style={{ display:'flex', alignItems:'center', gap:10, gridColumn:'1/-1' }}>
                            <input type="checkbox" id="promoActive" checked={promoForm.active} onChange={e=>setPromoForm({...promoForm,active:e.target.checked})} style={{ width:16, height:16, accentColor:'#D4AF37', cursor:'pointer' }}/>
                            <label htmlFor="promoActive" style={{ fontSize:13, fontWeight:500, color:'rgba(255,255,255,0.85)', cursor:'pointer' }}>Publier immédiatement</label>
                          </div>
                        </div>

                        <div style={{ display:'flex', gap:10, marginTop:20 }}>
                          {editingPromoId && (
                            <button
                              onClick={()=>{
                                setEditingPromoId(null);
                                setPromoForm({ productId:'', discountPercent:20, badge:'🔥 PROMO', placement:'banner', active:true, priority:0 });
                              }}
                              style={{
                                padding:'13px 18px', borderRadius:12, border:'1px solid rgba(255,255,255,0.15)',
                                background:'rgba(255,255,255,0.05)', color:'#9ca3af', fontWeight:600, fontSize:14, cursor:'pointer',
                              }}
                            >Annuler</button>
                          )}
                          <button
                            disabled={promoSaving || !promoForm.productId}
                            onClick={async () => {
                              if (!promoForm.productId || !selectedProduct) return;
                              setPromoSaving(true);
                              try {
                                // Toujours recalculé depuis le prix ACTUEL du produit, jamais figé
                                const payload = {
                                  type: 'promotion',
                                  productId: promoForm.productId,
                                  title: selectedProduct.name,
                                  subtitle: `${selectedProduct.category} · ${selectedProduct.region ?? ''}`,
                                  badge: promoForm.badge,
                                  imageUrl: selectedProduct.images?.[0] ?? '',
                                  // ⚠️ FIX : `/main/products?id=…` ne menait nulle part de précis
                                  // (le paramètre `id` n'est lu par aucune page). On pointe
                                  // maintenant vers la catégorie complète du produit, comme
                                  // Jumia/Alibaba le font pour leurs bannières promo.
                                  linkUrl: categoryLink(selectedProduct.category),
                                  placement: promoForm.placement,
                                  active: promoForm.active,
                                  priority: promoForm.priority,
                                  discountPercent: promoForm.discountPercent,
                                  originalPrice,
                                  discountedPrice,
                                  savings,
                                  updatedAt: serverTimestamp(),
                                };
                                if (editingPromoId) {
                                  await updateDoc(doc(db,'ads',editingPromoId), payload);
                                  toast.success('🔥 Promotion mise à jour');
                                } else {
                                  await addDoc(collection(db,'ads'), {
                                    ...payload,
                                    createdAt: serverTimestamp(),
                                    createdBy: authUser?.uid,
                                  });
                                  toast.success('🔥 Promotion publiée avec succès');
                                }
                                setEditingPromoId(null);
                                setPromoForm({ productId:'', discountPercent:20, badge:'🔥 PROMO', placement:'banner', active:true, priority:0 });
                              } catch { toast.error('Erreur lors de la publication'); }
                              finally { setPromoSaving(false); }
                            }}
                            style={{
                              flex:1, padding:'13px 0',
                              display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                              borderRadius:12, border:'none', fontWeight:700, fontSize:14,
                              cursor: (promoSaving||!promoForm.productId) ? 'not-allowed' : 'pointer',
                              opacity: (promoSaving||!promoForm.productId) ? 0.45 : 1,
                              background:'linear-gradient(135deg,#D4AF37,#F5E1A4,#B8860B)', color:'#0a0f0d',
                              boxShadow: (promoSaving||!promoForm.productId) ? 'none' : '0 10px 30px rgba(212,175,55,0.35)',
                            }}
                          >
                            {promoSaving
                              ? <><span style={{ width:16,height:16,border:'2px solid rgba(0,0,0,0.3)',borderTopColor:'#0a0f0d',borderRadius:'50%',display:'inline-block',animation:'spin 1s linear infinite' }}/> {editingPromoId ? 'Mise à jour…' : 'Publication…'}</>
                              : <><Sparkles size={16}/> {editingPromoId ? 'Mettre à jour la promotion' : 'Publier la promotion'}</>
                            }
                          </button>
                        </div>
                      </div>

                      {/* Liste des promotions */}
                      <div className="glass-card" style={{ padding:24 }}>
                        <h3 style={{ fontSize:16, fontWeight:700, marginBottom:18, display:'flex', alignItems:'center', gap:8 }}>
                          <Award size={18} color="#D4AF37"/>
                          <span>Promotions en cours</span>
                          <span style={{ marginLeft:4, fontSize:12, fontWeight:700, color:'#0a0f0d', background:'linear-gradient(135deg,#D4AF37,#F5E1A4)', borderRadius:20, padding:'2px 10px' }}>
                            {ads.filter(a=>a.type==='promotion'||!a.type).length}
                          </span>
                        </h3>

                        {ads.filter(a=>a.type==='promotion'||!a.type).length === 0 ? (
                          <div style={{ textAlign:'center', padding:'40px 0', color:'rgba(255,255,255,0.3)' }}>
                            <Sparkles size={40} style={{ opacity:0.2, marginBottom:12 }}/>
                            <p>Aucune promotion créée</p>
                          </div>
                        ) : (
                          <div style={{ display:'grid', gap:12 }}>
                            {[...ads].filter(a=>a.type==='promotion'||!a.type).sort((a,b)=>(b.priority||0)-(a.priority||0)).map(ad=>(
                              <div key={ad.id} className="divine-card" style={{
                                display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'center',
                                borderRadius:16, padding:14,
                                background: ad.active ? 'linear-gradient(160deg,#0f1a14,#16241c)' : 'rgba(255,255,255,0.03)',
                                border: ad.active ? '1px solid rgba(212,175,55,0.25)' : '1px solid rgba(255,255,255,0.07)',
                                boxShadow: ad.active ? '0 10px 30px rgba(212,175,55,0.08)' : 'none',
                              }}>
                                {/* Vignette */}
                                <div style={{ position:'relative', width:90, height:56, borderRadius:10, overflow:'hidden', flexShrink:0, background:'#0a0f0d' }}>
                                  {ad.imageUrl
                                    ? <img src={ad.imageUrl} alt={ad.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} loading="lazy"/>
                                    : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🌾</div>
                                  }
                                  {ad.badge && (
                                    <span style={{ position:'absolute', top:3, left:3, fontSize:7, fontWeight:700, color:'#0a0f0d', background:'linear-gradient(135deg,#D4AF37,#F5E1A4)', borderRadius:4, padding:'2px 5px' }}>{ad.badge}</span>
                                  )}
                                </div>
                                {/* Infos + prix barré */}
                                <div style={{ minWidth:0 }}>
                                  <div style={{ fontWeight:700, fontSize:14, color: ad.active ? '#F5E1A4' : '#9ca3af', marginBottom:3 }}>{ad.title}</div>
                                  {ad.discountPercent && (
                                    <div style={{ display:'flex', alignItems:'baseline', gap:8, flexWrap:'wrap' }}>
                                      <span style={{ fontSize:15, fontWeight:800, color:'#10b981' }}>{(ad.discountedPrice??0).toLocaleString()} FCFA</span>
                                      <span style={{ fontSize:12, color:'#6b7280', textDecoration:'line-through' }}>{(ad.originalPrice??0).toLocaleString()}</span>
                                      <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:'#ef4444', borderRadius:5, padding:'2px 7px' }}>-{ad.discountPercent}%</span>
                                    </div>
                                  )}
                                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:4 }}>
                                    {ad.placement==='banner'?'📌 Bannière':ad.placement==='feed'?'🎞️ Feed':'📌🎞️ Les deux'}
                                    {(ad.priority||0)>0 && <> · {ad.priority===2?'🥇 Max':'🥈 Élevée'}</>}
                                  </div>
                                </div>
                                {/* Actions */}
                                <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end', flexShrink:0 }}>
                                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, color: ad.active?'#0a0f0d':'#6b7280', background: ad.active?'linear-gradient(135deg,#D4AF37,#F5E1A4)':'rgba(255,255,255,0.07)' }}>
                                    {ad.active ? '● Active' : '○ Inactive'}
                                  </span>
                                  <div style={{ display:'flex', gap:5 }}>
                                    <button onClick={()=>{
                                      setEditingPromoId(ad.id);
                                      setPromoForm({
                                        productId: ad.productId || '',
                                        discountPercent: ad.discountPercent || 20,
                                        badge: ad.badge || '🔥 PROMO',
                                        placement: ad.placement || 'banner',
                                        active: ad.active,
                                        priority: ad.priority || 0,
                                      });
                                    }}
                                      style={{ fontSize:11, padding:'4px 9px', borderRadius:7, cursor:'pointer', fontWeight:600, border:'1px solid rgba(96,165,250,0.4)', background:'rgba(96,165,250,0.1)', color:'#60a5fa' }}>
                                      Modifier
                                    </button>
                                    <button onClick={()=>updateDoc(doc(db,'ads',ad.id),{active:!ad.active})}
                                      style={{ fontSize:11, padding:'4px 9px', borderRadius:7, cursor:'pointer', fontWeight:600, border: ad.active?'1px solid rgba(212,175,55,0.4)':'1px solid rgba(255,255,255,0.12)', background: ad.active?'rgba(212,175,55,0.1)':'rgba(255,255,255,0.05)', color: ad.active?'#D4AF37':'#9ca3af' }}>
                                      {ad.active ? 'Désactiver' : 'Activer'}
                                    </button>
                                    <button onClick={()=>{ if(confirm('Supprimer ?')) deleteDoc(doc(db,'ads',ad.id)); }}
                                      style={{ fontSize:11, padding:'4px 9px', borderRadius:7, border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'#ef4444', cursor:'pointer', fontWeight:600 }}>
                                      Supprimer
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* ══════════════════════════════════════════════════
                    SOUS-ONGLET : PUBLICITÉS (upload image Firebase)
                    ══════════════════════════════════════════════════ */}
                {adsSubTab === 'publicites' && (
                  <div style={{ display:'grid', gap:20 }}>

                    {/* Formulaire upload */}
                    <div className="divine-hero" style={{ borderRadius:20, padding:24, background:'linear-gradient(160deg,#0f1318 0%,#1a1a2e 100%)', border:'1px solid rgba(139,92,246,0.3)' }}>
                      <h3 style={{ fontSize:16, fontWeight:700, color:'#c4b5fd', display:'flex', alignItems:'center', gap:8, margin:0, marginBottom:20 }}>
                        <Globe size={17} color="#8b5cf6"/> {editingPubId ? 'Modifier la bannière partenaire' : 'Publier une bannière partenaire'}
                      </h3>

                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>

                        {/* Nom partenaire */}
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Partenaire / marque *</label>
                          <input
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            placeholder="Ex : SENCHIM Engrais, SAED, IFFCO…"
                            value={pubForm.partnerName}
                            onChange={e=>setPubForm({...pubForm, partnerName:e.target.value})}
                          />
                        </div>

                        {/* Titre bannière */}
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Titre affiché</label>
                          <input
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            placeholder="Ex : Engrais NPK — Saison des pluies"
                            value={pubForm.title}
                            onChange={e=>setPubForm({...pubForm, title:e.target.value})}
                          />
                        </div>

                        {/* Upload image */}
                        <div style={{ gridColumn:'1/-1' }}>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Image de la bannière {editingPubId ? '(laisser pour conserver l\'actuelle)' : '*'} (JPEG/PNG, max 2 Mo)</label>
                          <label htmlFor="pubImageInput" style={{
                            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:10,
                            borderRadius:12, border:'2px dashed rgba(139,92,246,0.35)', padding:'28px 20px', cursor:'pointer',
                            background: pubForm.imagePreview ? 'transparent' : 'rgba(139,92,246,0.04)',
                            position:'relative', overflow:'hidden', minHeight:120,
                          }}>
                            {pubForm.imagePreview ? (
                              <>
                                <img src={pubForm.imagePreview} alt="preview" style={{ maxHeight:160, maxWidth:'100%', borderRadius:8, objectFit:'contain' }} loading="lazy"/>
                                <span style={{ fontSize:11, color:'#8b5cf6' }}>Cliquer pour changer l'image</span>
                              </>
                            ) : (
                              <>
                                <div style={{ fontSize:36 }}>🖼️</div>
                                <div style={{ fontSize:13, color:'#8b5cf6', fontWeight:600 }}>Glisser ou cliquer pour uploader</div>
                                <div style={{ fontSize:11, color:'#6b7280' }}>JPEG · PNG · WebP — Max 2 Mo</div>
                              </>
                            )}
                          </label>
                          <input
                            id="pubImageInput"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            style={{ display:'none' }}
                            onChange={e=>{
                              const file = e.target.files?.[0];
                              if (!file) return;
                              if (file.size > 2 * 1024 * 1024) { toast.error('Image trop lourde (max 2 Mo)'); return; }
                              const preview = URL.createObjectURL(file);
                              setPubForm({...pubForm, imageFile:file, imagePreview:preview, imageUrl:''});
                            }}
                          />
                        </div>

                        {/* Catégorie liée (optionnel) — pré-remplit le lien ci-dessous avec
                            /category?category=... afin que la bannière conduise vers toute
                            la catégorie du partenaire, comme Jumia/Alibaba */}
                        <div style={{ gridColumn:'1/-1' }}>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Catégorie liée (optionnel)</label>
                          <select
                            style={{ background:'#111317', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            defaultValue=""
                            onChange={e=>{ if (e.target.value) setPubForm({...pubForm, linkUrl: categoryLink(e.target.value)}); }}
                          >
                            <option value="">— Choisir une catégorie pour pré-remplir le lien —</option>
                            {Array.from(new Set(products.map(p=>p.category).filter(Boolean))).sort().map(cat=>(
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>

                        {/* Lien au clic */}
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Lien (au clic)</label>
                          <input
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            placeholder="https://partenaire.com ou /category?category=riz"
                            value={pubForm.linkUrl}
                            onChange={e=>setPubForm({...pubForm, linkUrl:e.target.value})}
                          />
                        </div>

                        {/* Emplacement */}
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Emplacement</label>
                          <select
                            style={{ background:'#111317', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            value={pubForm.placement}
                            onChange={e=>setPubForm({...pubForm, placement:e.target.value})}
                          >
                            <option value="banner">📌 Bannière vedette</option>
                            <option value="feed">🎞️ Carrousel feed</option>
                            <option value="both">📌🎞️ Les deux</option>
                          </select>
                        </div>

                        {/* Priorité */}
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Priorité</label>
                          <select
                            style={{ background:'#111317', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            value={pubForm.priority}
                            onChange={e=>setPubForm({...pubForm, priority:Number(e.target.value)})}
                          >
                            <option value={0}>Normale</option>
                            <option value={1}>🥈 Élevée</option>
                            <option value={2}>🥇 Maximale</option>
                          </select>
                        </div>

                        {/* Actif */}
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <input type="checkbox" id="pubActive" checked={pubForm.active} onChange={e=>setPubForm({...pubForm,active:e.target.checked})} style={{ width:16, height:16, accentColor:'#8b5cf6', cursor:'pointer' }}/>
                          <label htmlFor="pubActive" style={{ fontSize:13, color:'rgba(255,255,255,0.85)', cursor:'pointer' }}>Publier immédiatement</label>
                        </div>
                      </div>

                      <div style={{ display:'flex', gap:10, marginTop:20 }}>
                        {editingPubId && (
                          <button
                            onClick={()=>{
                              setEditingPubId(null);
                              setEditingPubOldPath(null);
                              setPubForm({ title:'', partnerName:'', imageFile:null, imagePreview:'', imageUrl:'', linkUrl:'', placement:'banner', active:true, priority:0 });
                            }}
                            style={{
                              padding:'13px 18px', borderRadius:12, border:'1px solid rgba(255,255,255,0.15)',
                              background:'rgba(255,255,255,0.05)', color:'#9ca3af', fontWeight:600, fontSize:14, cursor:'pointer',
                            }}
                          >Annuler</button>
                        )}
                        <button
                          disabled={pubSaving || pubUploading || !pubForm.partnerName || (!pubForm.imageFile && !editingPubId)}
                          onClick={async () => {
                            if (!pubForm.partnerName) { toast.error('Le nom du partenaire est requis'); return; }
                            if (!editingPubId && !pubForm.imageFile) { toast.error('Veuillez sélectionner une image'); return; }
                            try {
                              let downloadURL = pubForm.imageUrl;
                              let newPath: string | null = null;

                              // ── Upload avec compression canvas ──────────────────
                              if (pubForm.imageFile) {
                                setPubUploading(true);
                                let blob: Blob;
                                try {
                                  // Compression : max 1200px, qualité 0.82 → ~150-300 Ko au lieu de 2 Mo
                                  blob = await compressImage(pubForm.imageFile, 1200, 0.82);
                                } catch {
                                  // Si la compression échoue (SVG, fichier corrompu) on upload l'original
                                  blob = pubForm.imageFile;
                                }
                                const safePartner = pubForm.partnerName.replace(/[^a-zA-Z0-9_-]/g, '_');
                                const publicId = `ads/publicites/${Date.now()}_${safePartner}`;
                                try {
                                  const uploaded = await uploadToCloudinary(blob, publicId);
                                  downloadURL = uploaded.url;
                                  newPath = uploaded.publicId;
                                } catch (uploadErr: any) {
                                  console.error('[Cloudinary] Erreur upload:', uploadErr?.message);
                                  toast.error(`Erreur upload : ${uploadErr?.message ?? 'inconnue'}`);
                                  return;
                                } finally {
                                  setPubUploading(false);
                                }
                              }

                              setPubSaving(true);
                              const payload: any = {
                                type: 'publicite',
                                title: pubForm.title || pubForm.partnerName,
                                partnerName: pubForm.partnerName,
                                imageUrl: downloadURL,
                                linkUrl: pubForm.linkUrl,
                                placement: pubForm.placement,
                                active: pubForm.active,
                                priority: pubForm.priority,
                                updatedAt: serverTimestamp(),
                              };
                              if (newPath) payload.cloudinaryPublicId = newPath;

                              if (editingPubId) {
                                await updateDoc(doc(db,'ads',editingPubId), payload);
                                // Note: ancienne image Cloudinary laissée orpheline (upload unsigned, pas de suppression côté client)
                                toast.success('🖼️ Bannière mise à jour');
                              } else {
                                await addDoc(collection(db,'ads'), {
                                  ...payload,
                                  createdAt: serverTimestamp(),
                                  createdBy: authUser?.uid,
                                });
                                toast.success('🖼️ Bannière partenaire publiée !');
                              }
                              setEditingPubId(null);
                              setEditingPubOldPath(null);
                              setPubForm({ title:'', partnerName:'', imageFile:null, imagePreview:'', imageUrl:'', linkUrl:'', placement:'banner', active:true, priority:0 });
                            } catch (err: any) {
                              console.error('[Publicité] Erreur générale:', err);
                              toast.error(`Erreur : ${err?.message ?? 'inconnue'}`);
                            } finally {
                              setPubUploading(false);
                              setPubSaving(false);
                            }
                          }}
                          style={{
                            flex:1, padding:'13px 0',
                            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                            borderRadius:12, border:'none', fontWeight:700, fontSize:14,
                            cursor: (pubSaving||pubUploading||!pubForm.partnerName||(!pubForm.imageFile&&!editingPubId)) ? 'not-allowed' : 'pointer',
                            opacity: (pubSaving||pubUploading||!pubForm.partnerName||(!pubForm.imageFile&&!editingPubId)) ? 0.45 : 1,
                            background:'linear-gradient(135deg,#8b5cf6,#6d28d9)', color:'#fff',
                            boxShadow: (pubSaving||pubUploading||!pubForm.partnerName||(!pubForm.imageFile&&!editingPubId)) ? 'none' : '0 10px 30px rgba(139,92,246,0.35)',
                          }}
                        >
                          {pubUploading
                            ? <><span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 1s linear infinite' }}/> Compression &amp; upload…</>
                            : pubSaving
                            ? <><span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 1s linear infinite' }}/> Enregistrement…</>
                            : <><Globe size={16}/> {editingPubId ? 'Mettre à jour la bannière' : 'Publier la bannière'}</>
                          }
                        </button>
                      </div>
                    </div>

                    {/* Liste des publicités */}
                    <div className="glass-card" style={{ padding:24 }}>
                      <h3 style={{ fontSize:16, fontWeight:700, marginBottom:18, display:'flex', alignItems:'center', gap:8 }}>
                        <Globe size={18} color="#8b5cf6"/>
                        <span>Bannières partenaires</span>
                        <span style={{ marginLeft:4, fontSize:12, fontWeight:700, color:'#fff', background:'rgba(139,92,246,0.5)', borderRadius:20, padding:'2px 10px' }}>
                          {ads.filter(a=>a.type==='publicite').length}
                        </span>
                      </h3>

                      {ads.filter(a=>a.type==='publicite').length === 0 ? (
                        <div style={{ textAlign:'center', padding:'40px 0', color:'rgba(255,255,255,0.3)' }}>
                          <Globe size={40} style={{ opacity:0.2, marginBottom:12 }}/>
                          <p>Aucune bannière partenaire</p>
                          <p style={{ fontSize:12, marginTop:6, color:'rgba(255,255,255,0.2)' }}>Uploadez votre première image ci-dessus</p>
                        </div>
                      ) : (
                        <div style={{ display:'grid', gap:12 }}>
                          {[...ads].filter(a=>a.type==='publicite').sort((a,b)=>(b.priority||0)-(a.priority||0)).map(ad=>(
                            <div key={ad.id} className="divine-card" style={{
                              display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'center',
                              borderRadius:16, padding:14,
                              background: ad.active ? 'linear-gradient(160deg,#0f1318,#1a1a2e)' : 'rgba(255,255,255,0.03)',
                              border: ad.active ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.07)',
                              boxShadow: ad.active ? '0 10px 30px rgba(139,92,246,0.10)' : 'none',
                            }}>
                              {/* Vignette */}
                              <div style={{ width:110, height:62, borderRadius:10, overflow:'hidden', flexShrink:0, background:'#0a0f0d' }}>
                                {ad.imageUrl
                                  ? <img src={ad.imageUrl} alt={ad.partnerName} style={{ width:'100%', height:'100%', objectFit:'cover' }} loading="lazy"/>
                                  : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🖼️</div>
                                }
                              </div>
                              {/* Infos */}
                              <div style={{ minWidth:0 }}>
                                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                                  <span style={{ fontSize:10, fontWeight:700, color:'#8b5cf6', background:'rgba(139,92,246,0.12)', borderRadius:6, padding:'2px 8px', letterSpacing:0.5 }}>PARTENAIRE</span>
                                  <span style={{ fontWeight:700, fontSize:14, color: ad.active?'#c4b5fd':'#9ca3af' }}>{ad.partnerName}</span>
                                </div>
                                {ad.title && ad.title!==ad.partnerName && (
                                  <div style={{ fontSize:12, color:'#6b7280', marginBottom:3 }}>{ad.title}</div>
                                )}
                                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>
                                  {ad.placement==='banner'?'📌 Bannière':ad.placement==='feed'?'🎞️ Feed':'📌🎞️ Les deux'}
                                  {(ad.priority||0)>0 && <> · {ad.priority===2?'🥇 Max':'🥈 Élevée'}</>}
                                  {ad.linkUrl && <> · <span style={{ overflow:'hidden', textOverflow:'ellipsis' }}>{ad.linkUrl.slice(0,40)}</span></>}
                                </div>
                              </div>
                              {/* Actions */}
                              <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end', flexShrink:0 }}>
                                <span style={{ fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, color: ad.active?'#fff':'#6b7280', background: ad.active?'rgba(139,92,246,0.5)':'rgba(255,255,255,0.07)' }}>
                                  {ad.active ? '● Active' : '○ Inactive'}
                                </span>
                                <div style={{ display:'flex', gap:5 }}>
                                  <button onClick={()=>{
                                    setEditingPubId(ad.id);
                                    setEditingPubOldPath(ad.cloudinaryPublicId || null);
                                    setPubForm({
                                      title: ad.title || '',
                                      partnerName: ad.partnerName || '',
                                      imageFile: null,
                                      imagePreview: ad.imageUrl || '',
                                      imageUrl: ad.imageUrl || '',
                                      linkUrl: ad.linkUrl || '',
                                      placement: ad.placement || 'banner',
                                      active: ad.active,
                                      priority: ad.priority || 0,
                                    });
                                  }}
                                    style={{ fontSize:11, padding:'4px 9px', borderRadius:7, cursor:'pointer', fontWeight:600, border:'1px solid rgba(96,165,250,0.4)', background:'rgba(96,165,250,0.1)', color:'#60a5fa' }}>
                                    Modifier
                                  </button>
                                  <button onClick={()=>updateDoc(doc(db,'ads',ad.id),{active:!ad.active})}
                                    style={{ fontSize:11, padding:'4px 9px', borderRadius:7, cursor:'pointer', fontWeight:600, border:'1px solid rgba(139,92,246,0.35)', background:'rgba(139,92,246,0.08)', color:'#8b5cf6' }}>
                                    {ad.active ? 'Désactiver' : 'Activer'}
                                  </button>
                                  <button onClick={async ()=>{
                                    if (!confirm('Supprimer cette bannière ?')) return;
                                    try {
                                      await deleteDoc(doc(db,'ads',ad.id));
                                      // Note: image Cloudinary laissée orpheline (pas de suppression côté client)
                                      toast.success('Bannière supprimée');
                                    } catch { toast.error('Erreur lors de la suppression'); }
                                  }}
                                    style={{ fontSize:11, padding:'4px 9px', borderRadius:7, border:'1px solid rgba(239,68,68,0.35)', background:'rgba(239,68,68,0.08)', color:'#ef4444', cursor:'pointer', fontWeight:600 }}>
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                  </div>
                )}

              </div>
            )}

          </div>
        </main>
      </div>

      {/* ══ MODALS ══════════════════════════════════════════════ */}

      {/* Assigner livreur */}
      {showAssignModal && (
        <div onClick={()=>setShowAssignModal(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} className="glass-card" style={{ width:400, maxWidth:'90%', padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:600 }}>Assigner un livreur</h3>
              <button onClick={()=>setShowAssignModal(false)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <p style={{ marginBottom:16, fontSize:12, color:'#6b7280' }}>Commande #{assignOrderNumber}</p>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {deliveryPersons.map(d=>(
                <button key={d.id} onClick={()=>assignDelivery(assignOrderId!,d.id!,d.displayName,d.phone)} className="glass-card" style={{ padding:12, textAlign:'left', cursor:'pointer', border:'1px solid #1f2127' }}>
                  <div style={{ fontWeight:600 }}>{d.displayName}</div>
                  <div style={{ fontSize:12, color:'#6b7280' }}>{d.phone} · {d.vehicle||'—'}</div>
                </button>
              ))}
              {deliveryPersons.length===0 && <p style={{ textAlign:'center', color:'#6b7280', padding:20 }}>Aucun livreur disponible</p>}
            </div>
          </div>
        </div>
      )}

      {/* Détails utilisateur */}
      {selectedUser && (
        <div onClick={()=>setSelectedUser(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} className="glass-card" style={{ width:440, maxWidth:'90%', padding:24, maxHeight:'85vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:600 }}>Détails utilisateur</h3>
              <button onClick={()=>setSelectedUser(null)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <div style={{ display:'flex', gap:14, marginBottom:20, alignItems:'center' }}>
              {selectedUser.avatar ? (
                <img src={selectedUser.avatar} alt="" style={{ width:56, height:56, borderRadius:28, objectFit:'cover', flexShrink:0 }}/>
              ) : (
                <div style={{ width:56, height:56, borderRadius:28, background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:700, flexShrink:0 }}>{selectedUser.displayName?.charAt(0)??'?'}</div>
              )}
              <div>
                <div style={{ fontWeight:700, fontSize:17 }}>{selectedUser.displayName || '—'}</div>
                <div style={{ fontSize:12, color:'#6b7280', textTransform:'capitalize' }}>{selectedUser.role}</div>
              </div>
            </div>

            {/* Aperçu activité */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:16 }}>
              {selectedUser.role === 'seller' ? (
                <>
                  <div style={{ background:'#1f2127', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:700 }}>{sellerProductCounts.get(selectedUser.id!) || 0}</div>
                    <div style={{ fontSize:10, color:'#6b7280' }}>Produits</div>
                  </div>
                  <div style={{ background:'#1f2127', borderRadius:10, padding:'10px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:700 }}>{orders.filter(o => o.sellerId === selectedUser.id).length}</div>
                    <div style={{ fontSize:10, color:'#6b7280' }}>Commandes reçues</div>
                  </div>
                </>
              ) : (
                <div style={{ background:'#1f2127', borderRadius:10, padding:'10px 8px', textAlign:'center', gridColumn:'span 2' }}>
                  <div style={{ fontSize:18, fontWeight:700 }}>{orders.filter(o => o.userId === selectedUser.id).length}</div>
                  <div style={{ fontSize:10, color:'#6b7280' }}>Commandes passées</div>
                </div>
              )}
            </div>

            {[['Email',selectedUser.email],['Téléphone',selectedUser.phone||'—'],['Région',selectedUser.region||'—'],['Inscription',selectedUser.createdAt?.toDate?.().toLocaleDateString?.()??'—']].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #1a1c22', fontSize:13 }}>
                <span style={{ color:'#6b7280' }}>{k}</span><span>{v}</span>
              </div>
            ))}

            <div style={{ display:'flex', gap:8, marginTop:18 }}>
              {selectedUser.phone && (
                <a href={`https://wa.me/221${selectedUser.phone.replace(/\D/g,'').replace(/^221/,'')}`} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ flex:1, textAlign:'center', textDecoration:'none', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  <MessageSquare size={13}/> WhatsApp
                </a>
              )}
              <button
                onClick={()=>{
                  setBroadcastMode('manual');
                  setSelectedUserIds(new Set([selectedUser.uid ?? selectedUser.id ?? '']));
                  setActiveTab('broadcast');
                  setSelectedUser(null);
                }}
                className="btn-secondary"
                style={{ flex:1, display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}
              >
                <Send size={13}/> Notifier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Détails financement */}
      {selectedLoan && (
        <div onClick={()=>setSelectedLoan(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} className="glass-card" style={{ width:440, maxWidth:'90%', padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:600 }}>Détails financement</h3>
              <button onClick={()=>setSelectedLoan(null)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <div style={{ textAlign:'center', padding:'14px 0', marginBottom:16, borderBottom:'1px solid #1f2127' }}>
              <div style={{ fontSize:30, fontWeight:700, color:'#10b981' }}>{(selectedLoan.amount ?? 0).toLocaleString()} FCFA</div>
              <div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>Demandé par {selectedLoan.sellerName}</div>
              <div style={{ marginTop:8 }}><StatusBadge status={selectedLoan.status}/></div>
            </div>
            {[['Téléphone',selectedLoan.sellerPhone||'—'],['Durée',`${selectedLoan.duration} mois`],['Mensualité',`${(selectedLoan.monthlyPayment ?? 0).toLocaleString()} FCFA`],['Motif',selectedLoan.purpose||'—'],['Région',selectedLoan.region||'—']].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #1a1c22', fontSize:13 }}>
                <span style={{ color:'#6b7280' }}>{k}</span><span>{v}</span>
              </div>
            ))}
            {selectedLoan.status==='pending' && (
              <div style={{ display:'flex', gap:12, marginTop:20 }}>
                <button onClick={()=>{ updateLoanStatus(selectedLoan.id!,'approved'); setSelectedLoan(null); }} className="btn-primary" style={{ flex:1, justifyContent:'center' }}><Check size={14}/> Approuver</button>
                <button onClick={()=>{ updateLoanStatus(selectedLoan.id!,'rejected'); setSelectedLoan(null); }} className="btn-secondary" style={{ flex:1, justifyContent:'center', color:'#ef4444', borderColor:'#ef4444' }}><X size={14}/> Refuser</button>
              </div>
            )}
            {selectedLoan.status==='approved' && (
              <button onClick={()=>{ markLoanAsPaid(selectedLoan.id!); setSelectedLoan(null); }} className="btn-primary" style={{ marginTop:16, width:'100%', justifyContent:'center', background:'#f59e0b' }}>💰 Marquer remboursé</button>
            )}
          </div>
        </div>
      )}

      {/* Créer financement */}
      {showLoanForm && (
        <div onClick={()=>setShowLoanForm(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', backdropFilter:'blur(8px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div onClick={e=>e.stopPropagation()} className="glass-card" style={{ width:500, maxWidth:'90%', maxHeight:'90vh', overflowY:'auto', padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:600 }}>📝 Nouvelle demande de financement</h3>
              <button onClick={()=>setShowLoanForm(false)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <input type="text"   placeholder="Nom complet *"        value={loanForm.sellerName}  onChange={e=>setLoanForm({...loanForm,sellerName:e.target.value})}/>
              <input type="tel"    placeholder="Téléphone"            value={loanForm.sellerPhone} onChange={e=>setLoanForm({...loanForm,sellerPhone:e.target.value})}/>
              <select             value={loanForm.region}             onChange={e=>setLoanForm({...loanForm,region:e.target.value})}>
                <option value="">Sélectionnez une région</option>
                {SENEGAL_REGIONS.map(r=><option key={r}>{r}</option>)}
              </select>
              <input type="text"   placeholder="Village"              value={loanForm.village}     onChange={e=>setLoanForm({...loanForm,village:e.target.value})}/>
              <input type="number" placeholder="Montant (FCFA) *"     value={loanForm.amount}      onChange={e=>setLoanForm({...loanForm,amount:e.target.value})} style={{ color:'#10b981', fontWeight:700 }}/>
              <select             value={loanForm.duration}           onChange={e=>setLoanForm({...loanForm,duration:e.target.value})}>
                {[3,6,12,18,24,36].map(m=><option key={m} value={m}>{m} mois</option>)}
              </select>
              <select             value={loanForm.purpose}            onChange={e=>setLoanForm({...loanForm,purpose:e.target.value})}>
                <option value="">Motif *</option>
                <option>Achat semences</option>
                <option>Matériel agricole</option>
                <option>Irrigation</option>
                <option>Stockage</option>
                <option>Transport</option>
              </select>
              <textarea placeholder="Description" value={loanForm.description} onChange={e=>setLoanForm({...loanForm,description:e.target.value})} rows={3} style={{ resize:'vertical' }}/>
              <button onClick={createLoan} className="btn-primary" style={{ marginTop:6, justifyContent:'center', padding:'12px 20px' }}><Check size={14}/> Enregistrer</button>
            </div>
          </div>
        </div>
      )}


    </AdminGuard>
  );
}

