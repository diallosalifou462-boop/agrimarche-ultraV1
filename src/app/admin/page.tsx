'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { AdminGuard } from "@/components/AdminGuard";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  UserCheck, X, Truck, TrendingUp, TrendingDown, RefreshCw,
  Download, Bell, Search, ChevronLeft, ChevronRight,
  LayoutDashboard, Package, Users, Leaf, Banknote, Map,
  MessageSquare, Settings, LogOut, Plus, Eye, Check, Ban, Zap,
  BellRing, Volume2, VolumeX, Brain, Sparkles, Shield, Award, Star,
  Clock, DollarSign, Percent, Calendar, Phone, Mail, MapPin,
  CreditCard, Wallet, Target, AlertTriangle, CheckCircle, XCircle,
  HelpCircle, Menu, Moon, Sun, Monitor, Database, Cloud, Server, Megaphone,
  ShieldCheck, Fingerprint, Key, Lock, Unlock, Gift, Heart, ThumbsUp,
  Send, Globe
} from "lucide-react";
import { db, auth, storage, messaging } from "@/lib/firebase";
import {
  collection, updateDoc, deleteDoc, doc,
  query, orderBy, onSnapshot, Timestamp, addDoc, serverTimestamp,
  writeBatch, where, getDocs, getDoc, setDoc, limit,
  startAfter, increment, arrayUnion, arrayRemove
} from "firebase/firestore";
import {
  signOut
} from "firebase/auth";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { getToken, onMessage } from "firebase/messaging";
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
  farmer: string;
  farmerId: string;
  farmerPhone: string;
  category: string;
  region: string;
  amount: number;
  qty: number;
  time: string;
  status: 'Livrée' | 'En cours' | 'Annulée' | 'En attente';
  createdAt: Timestamp;
  deliveryPersonId?: string;
  deliveryPersonName?: string;
  paymentMethod?: 'wave' | 'orange' | 'free' | 'card';
  paymentStatus?: 'pending' | 'paid' | 'failed';
  commission?: number;
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

interface Notification {
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

// Broadcast notification form state
interface BroadcastForm {
  title: string;
  body: string;
  icon: string;
  type: Notification['type'];
  priority: Notification['priority'];
  urgent: boolean;
  targetRole: 'all' | 'client' | 'seller' | 'admin' | 'delivery';
  targetRegion: string;
  channels: {
    inApp: boolean;
    email: boolean;
    push: boolean;
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

const StatusBadge = ({ status }: { status: string }) => {
  const config: Record<string, { bg: string; color: string; icon: string }> = {
    'Livrée':     { bg: 'rgba(16,185,129,.1)',  color: '#10b981', icon: '✅' },
    'En cours':   { bg: 'rgba(6,182,212,.1)',   color: '#06b6d4', icon: '🔄' },
    'Annulée':    { bg: 'rgba(239,68,68,.1)',   color: '#ef4444', icon: '❌' },
    'En attente': { bg: 'rgba(245,158,11,.1)',  color: '#f59e0b', icon: '⏳' },
    'pending':    { bg: 'rgba(245,158,11,.1)',  color: '#f59e0b', icon: '⏳' },
    'approved':   { bg: 'rgba(16,185,129,.1)',  color: '#10b981', icon: '✅' },
    'rejected':   { bg: 'rgba(239,68,68,.1)',   color: '#ef4444', icon: '❌' },
    'active':     { bg: 'rgba(6,182,212,.1)',   color: '#06b6d4', icon: '🔄' },
    'paid':       { bg: 'rgba(16,185,129,.1)',  color: '#10b981', icon: '💰' },
    'defaulted':  { bg: 'rgba(239,68,68,.1)',   color: '#ef4444', icon: '⛔' },
  };
  const c = config[status] ?? { bg: 'rgba(107,114,128,.1)', color: '#6b7280', icon: '📌' };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:c.bg, color:c.color }}>
      {c.icon} {status}
    </span>
  );
};

const StatCard = ({ icon, label, value, change, color }: { icon: React.ReactNode; label: string; value: number; change?: number; color: string }) => (
  <div className="glass-card" style={{ padding:20 }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12 }}>
      <div style={{ width:40, height:40, borderRadius:12, background:`${color}20`, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {icon}
      </div>
      {change !== undefined && (
        <span style={{ fontSize:11, color:change>=0?'#10b981':'#ef4444', background:`${change>=0?'#10b981':'#ef4444'}15`, padding:'2px 8px', borderRadius:20 }}>
          {change>=0?'+':''}{change}%
        </span>
      )}
    </div>
    <div style={{ fontSize:26, fontWeight:700, marginBottom:4 }}>{value?.toLocaleString?.() ?? 0}</div>
    <div style={{ fontSize:12, color:'#6b7280' }}>{label}</div>
  </div>
);

// ============================================================
// COMPOSANT PRINCIPAL
// ============================================================

export default function AdminDashboard() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();

  // ── UI STATE ──────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen]       = useState(true);
  const [activeTab, setActiveTab]           = useState('dashboard');
  const [searchQuery, setSearchQuery]       = useState('');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [currentPage, setCurrentPage]       = useState(0);
  const pageSize = 10;

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
    channels:{ inApp:true, email:false, push:false },
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
  const [loans, setLoans]                   = useState<Loan[]>([]);
  const [deliveryPersons, setDeliveryPersons] = useState<UserProfile[]>([]);
  const [notifications, setNotifications]   = useState<Notification[]>([]);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [loading, setLoading]               = useState(true);
  const [lastSync, setLastSync]             = useState(new Date());
  const [unreadCount, setUnreadCount]       = useState(0);

  // ── DIRECT MESSAGE ────────────────────────────────────────
  const [dmSearch, setDmSearch]             = useState('');
  const [dmTarget, setDmTarget]             = useState<UserProfile | null>(null);
  const [dmForm, setDmForm]                 = useState({ title:'', body:'', icon:'💬', type:'message' as Notification['type'], priority:'medium' as Notification['priority'], urgent:false });
  const [dmSending, setDmSending]           = useState(false);

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

  // ── NOTIFICATION SETTINGS ─────────────────────────────────
  const [soundEnabled, setSoundEnabled]     = useState(true);
  const [pushEnabled, setPushEnabled]       = useState(false);
  const [fcmToken, setFcmToken]             = useState<string | null>(null);

  // ── COMPUTED ──────────────────────────────────────────────
  const totalRevenue    = useMemo(() => orders.reduce((s,o) => s + (o.amount ?? 0), 0), [orders]);
  const platformRevenue = useMemo(() => Math.round(totalRevenue * COMMISSION_RATE), [totalRevenue]);
  const deliveredOrders = useMemo(() => orders.filter(o => o.status === 'Livrée').length, [orders]);
  const pendingLoans    = useMemo(() => loans.filter(l => l.status === 'pending').length, [loans]);
  const totalLoanVolume = useMemo(() => loans.reduce((s,l) => s + (l.amount ?? 0), 0), [loans]);

  // ── REGION STATS ──────────────────────────────────────────
  const regionStats = useMemo(() => {
    return SENEGAL_REGIONS.map(region => {
      const regionOrders  = orders.filter(o => o.region?.toLowerCase() === region.toLowerCase());
      const regionUsers   = users.filter(u  => u.region?.toLowerCase() === region.toLowerCase());
      const regionProducts= products.filter(p => p.region?.toLowerCase() === region.toLowerCase());
      const revenue       = regionOrders.reduce((s,o) => s + (o.amount ?? 0), 0);
      return {
        region,
        orders:   regionOrders.length,
        users:    regionUsers.length,
        products: regionProducts.length,
        revenue,
        ...REGION_INFO[region]
      };
    }).sort((a,b) => b.revenue - a.revenue);
  }, [orders, users, products]);

  // ── ROLE GUARD ────────────────────────────────────────────
  const FORCED_ADMIN_EMAIL = "support@agrimarche.com";

  useEffect(() => {
    if (authLoading) return; // attend la confirmation Firebase
    if (!authUser) { router.replace('/auth/login'); return; }

    // Accès admin garanti pour ce compte, peu importe le champ Firestore
    if (authUser.email === FORCED_ADMIN_EMAIL) return;

    getDoc(doc(db, 'users', authUser.uid)).then(snap => {
      if (!snap.exists() || snap.data()?.role !== 'admin') {
        router.replace('/');
      }
    });
  }, [authUser, authLoading, router]);

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
          // Normalise le statut : supporte les valeurs anglaises et françaises
          const statusMap: Record<string, Order['status']> = {
            delivered: 'Livrée', livree: 'Livrée', 'en cours': 'En cours',
            processing: 'En cours', pending: 'En attente', 'en attente': 'En attente',
            cancelled: 'Annulée', annulee: 'Annulée', annulée: 'Annulée',
          };
          const rawStatus = (data.status ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const status: Order['status'] = (
            data.status === 'Livrée' || data.status === 'En cours' ||
            data.status === 'En attente' || data.status === 'Annulée'
          ) ? data.status : (statusMap[rawStatus] ?? statusMap[data.status?.toLowerCase?.()] ?? 'En attente');
          return { id: d.id, ...data, amount, status } as Order;
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

    const unsubLoans = onSnapshot(
      query(collection(db, 'loans'), orderBy('createdAt', 'desc')),
      snap => setLoans(snap.docs.map(d => ({ id: d.id, ...d.data() } as Loan)))
    );

    const unsubNotifs = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(100)),
      snap => {
        const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
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

    return () => { unsubOrders(); unsubUsers(); unsubProducts(); unsubLoans(); unsubNotifs(); unsubBroadcast(); unsubAds(); };
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
  useEffect(() => {
    const initFCM = async () => {
      if (!messaging || !authUser) return;
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          const token = await getToken(messaging, { vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY });
          if (token) {
            setFcmToken(token);
            setPushEnabled(true);
            await updateDoc(doc(db, 'users', authUser.uid), { fcmTokens: arrayUnion(token) }).catch(() => {});
          }
        }
      } catch (e) { console.error('FCM:', e); }
    };
    initFCM();
  }, [authUser]);

  // ── ACTIONS ───────────────────────────────────────────────

  const updateOrderStatus = async (orderId: string, status: Order['status']) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
      toast.success(`Statut : ${status}`);
      const order = orders.find(o => o.id === orderId);
      if (order?.farmerId) {
        await addDoc(collection(db, 'notifications'), {
          userId: order.farmerId,
          type: 'order',
          title: `Commande #${order.orderNumber} — ${status}`,
          body: `Le statut de votre commande a changé.`,
          icon: status === 'Livrée' ? '✅' : '📦',
          deepLink: `/orders/${order.orderNumber}`,
          urgent: false, priority: 'medium', read: false,
          createdAt: Timestamp.now()
        });
      }
    } catch { toast.error('Erreur mise à jour'); }
  };

  const assignDelivery = async (orderId: string, deliveryId: string, deliveryName: string) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        deliveryPersonId: deliveryId, deliveryPersonName: deliveryName, status: 'En cours'
      });
      toast.success(`Livreur assigné : ${deliveryName}`);
      setShowAssignModal(false);
      setAssignOrderId(null);
    } catch { toast.error('Erreur assignation'); }
  };

  const updateUserRole = async (userId: string, role: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role });
      toast.success(`Rôle : ${role}`);
    } catch { toast.error('Erreur rôle'); }
  };

  const deleteUser = async (userId: string) => {
    if (!confirm('Supprimer cet utilisateur ?')) return;
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
        await addDoc(collection(db, 'notifications'), {
          userId: loan.sellerId, type: 'loan',
          title: '✅ Financement approuvé !',
          body: `Votre demande de ${(loan.amount ?? 0).toLocaleString()} FCFA a été approuvée.`,
          icon: '💰', deepLink: '/loans',
          urgent: false, priority: 'high', read: false, createdAt: Timestamp.now()
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
      const product = products.find(p => p.id === productId);
      if (product && clampedStock < 5 && product.stock >= 5) {
        await addDoc(collection(db, 'notifications'), {
          userId: product.sellerId, type: 'alert',
          title: '⚠️ Stock critique',
          body: `Il ne reste que ${clampedStock} unités de "${product.name}".`,
          icon: '⚠️', deepLink: `/products/${product.id}`,
          urgent: true, priority: 'high', read: false, createdAt: Timestamp.now()
        });
      }
    } catch { toast.error('Erreur stock'); }
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

      // Email channel — envoi via Resend
      let emailCount = 0;
      if (broadcastForm.channels.email) {
        const emailTargets = targetUsers.filter(u => u.email);
        const emailErrors: string[] = [];
        for (const u of emailTargets) {
          try {
            const res = await fetch('/api/send-email', {
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
      let pushCount = 0;
      if (broadcastForm.channels.push) {
        const allTokens: string[] = [];
        targetUsers.forEach(u => {
          if (Array.isArray(u.fcmTokens)) allTokens.push(...u.fcmTokens.filter(Boolean));
        });
        const uniqueTokens = Array.from(new Set(allTokens));
        if (uniqueTokens.length > 0) {
          // FCM multicast limite à 500 tokens par requête
          for (let i = 0; i < uniqueTokens.length; i += 500) {
            const chunk = uniqueTokens.slice(i, i + 500);
            try {
              const res = await fetch('/api/send-push', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  tokens: chunk,
                  title: `${broadcastForm.icon} ${broadcastForm.title}`,
                  body: broadcastForm.body,
                  deepLink: broadcastForm.deepLink || '/',
                  urgent: broadcastForm.urgent,
                }),
              });
              if (res.ok) {
                const data = await res.json().catch(() => ({}));
                pushCount += data?.successCount ?? chunk.length;
              } else {
                const err = await res.json().catch(() => ({}));
              }
            } catch (fetchErr: any) {
            }
          }
        }
      }


      await addDoc(collection(db, 'broadcasts'), {
        ...broadcastForm,
        sentBy: authUser?.uid,
        sentAt: Timestamp.now(),
        recipientCount: targetUsers.length,
        inAppCount,
        emailCount: broadcastForm.channels.email ? emailCount : 0,
        pushCount,
      });

      toast.success(`Envoyé à ${targetUsers.length} utilisateur(s)`);
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
      await addDoc(collection(db, 'notifications'), {
        userId: dmTarget.uid ?? dmTarget.id,
        type: dmForm.type,
        title: dmForm.title,
        body: dmForm.body,
        icon: dmForm.icon,
        deepLink: '/',
        urgent: dmForm.urgent,
        priority: dmForm.priority,
        read: false,
        createdAt: Timestamp.now(),
        sentByAdmin: authUser?.uid,
      });
      toast.success(`Message envoyé à ${dmTarget.displayName}`);
      setDmForm({ title:'', body:'', icon:'💬', type:'message', priority:'medium', urgent:false });
      setDmTarget(null);
      setDmSearch('');
    } catch { toast.error('Erreur envoi'); }
    finally { setDmSending(false); }
  };

  const sendAiMessage = async () => {
    const userMsg = aiInput.trim();
    if (!userMsg || aiLoading) return;

    // Contexte métier injecté automatiquement
    const systemPrompt = `Tu es un assistant expert pour AgriMarché, une plateforme agricole sénégalaise.
Contexte actuel:
- Commandes totales: ${orders.length} (dont ${orders.filter(o=>o.status==='En attente').length} en attente)
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

  const filteredOrders = useMemo(() => orders.filter(o => {
    if (statusFilter !== 'all' && o.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return o.orderNumber?.toLowerCase().includes(q) || o.farmer?.toLowerCase().includes(q);
    }
    return true;
  }), [orders, statusFilter, searchQuery]);

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
        return d && d.getMonth() === i && d.getFullYear() === year;
      }).reduce((s,o) => s + (o.amount ?? 0), 0)
    }));
  }, [orders]);

  const categoryData = useMemo(() => {
    const cats: Record<string,number> = {};
    products.forEach(p => { cats[p.category] = (cats[p.category] ?? 0) + 1; });
    return Object.entries(cats).map(([name,value]) => ({ name, value }));
  }, [products]);

  // ── KPIs ──────────────────────────────────────────────────
  const kpis = [
    { label:"Chiffre d'affaires",  value:totalRevenue,    change:12.4, icon:<TrendingUp size={20} color="#06b6d4"/>,  color:'#06b6d4' },
    { label:"Revenus plateforme",  value:platformRevenue, change:12.4, icon:<Banknote size={20} color="#10b981"/>,    color:'#10b981' },
    { label:"Commandes",           value:orders.length,   change:8.2,  icon:<Package size={20} color="#8b5cf6"/>,    color:'#8b5cf6' },
    { label:"Financements (FCFA)", value:totalLoanVolume, change:-2.3, icon:<Wallet size={20} color="#f59e0b"/>,     color:'#f59e0b' },
    { label:"Utilisateurs",        value:users.length,    change:15.7, icon:<Users size={20} color="#ec4899"/>,      color:'#ec4899' },
    { label:"Livreurs actifs",     value:deliveryPersons.length, change:5.3, icon:<Truck size={20} color="#06b6d4"/>,color:'#06b6d4' },
  ];

  // ── NAV ───────────────────────────────────────────────────
  const navItems = [
    { id:'dashboard',      label:'Tableau de bord',  icon:<LayoutDashboard size={18}/>, badge:0 },
    { id:'orders',         label:'Commandes',         icon:<Package size={18}/>,         badge:orders.filter(o=>o.status==='En attente').length },
    { id:'users',          label:'Utilisateurs',      icon:<Users size={18}/>,            badge:0 },
    { id:'products',       label:'Produits',           icon:<Leaf size={18}/>,            badge:0 },
    { id:'loans',          label:'Financements',       icon:<Banknote size={18}/>,        badge:pendingLoans },
    { id:'analytics',      label:'Analyses IA',        icon:<Brain size={18}/>,           badge:0 },
    { id:'ai-assistant',   label:'Assistant DeepSeek',  icon:<Sparkles size={18}/>,        badge:0 },
    { id:'ai-codes',       label:'Codes IA',             icon:<Key size={18}/>,              badge:0 },
    { id:'regions',        label:'Régions',             icon:<Map size={18}/>,             badge:0 },
    { id:'weather',        label:'Météo Sénégal',        icon:<Cloud size={18}/>,            badge:0 },
    { id:'broadcast',      label:'Diffusion',           icon:<Send size={18}/>,            badge:0 },
    { id:'ads',            label:'Promos & Pubs',        icon:<Megaphone size={18}/>,       badge:0 },
    { id:'notifications',  label:'Notifications',       icon:<BellRing size={18}/>,        badge:unreadCount },
    { id:'delivery',       label:'Livraisons',          icon:<Truck size={18}/>,           badge:0 },
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
              <div key={item.id} onClick={() => { setActiveTab(item.id); setCurrentPage(0); }} style={{
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

            {/* ═══ DASHBOARD ══════════════════════════════════ */}
            {activeTab === 'dashboard' && (
              <div className="animate-fadeIn">
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, marginBottom:24 }}>
                  {kpis.map((kpi,i) => <StatCard key={i} {...kpi}/>)}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:24, marginBottom:24 }}>
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>📈 Revenus mensuels</h3>
                    <div style={{ height:280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={monthlyRevenue}>
                          <defs>
                            <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%"  stopColor="#10b981" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2127"/>
                          <XAxis dataKey="month" stroke="#6b7280" fontSize={11}/>
                          <YAxis stroke="#6b7280" fontSize={11} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                          <Tooltip contentStyle={{ background:'#111317', border:'1px solid #1f2127', borderRadius:8 }} formatter={(v:any)=>`${Number(v).toLocaleString()} FCFA`}/>
                          <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="url(#revGrad)" strokeWidth={2}/>
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="glass-card" style={{ padding:20 }}>
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>🥧 Catégories</h3>
                    <div style={{ height:280 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={55} outerRadius={95} label={({name,percent})=>`${name} ${((percent ?? 0)*100).toFixed(0)}%`}>
                            {categoryData.map((_,i) => <Cell key={i} fill={['#10b981','#06b6d4','#8b5cf6','#f59e0b','#ef4444'][i%5]}/>)}
                          </Pie>
                          <Tooltip/>
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                {/* Recent orders */}
                <div className="glass-card" style={{ padding:20 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                    <h3 style={{ fontSize:15, fontWeight:600 }}>🛒 Dernières commandes</h3>
                    <button onClick={()=>setActiveTab('orders')} className="btn-secondary" style={{ padding:'6px 12px', fontSize:12 }}>Voir tout →</button>
                  </div>
                  <div style={{ overflowX:'auto' }}>
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom:'1px solid #1f2127' }}>
                          {['N°','Client','Montant','Commission','Statut'].map(h => (
                            <th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11, color:'#6b7280' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {orders.slice(0,5).map(o => (
                          <tr key={o.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                            <td style={{ padding:'10px 8px', fontFamily:'monospace', fontSize:12, color:'#10b981' }}>{o.orderNumber}</td>
                            <td style={{ padding:'10px 8px', fontSize:13 }}>{o.farmer}</td>
                            <td style={{ padding:'10px 8px', fontWeight:600 }}>{(o.amount ?? 0).toLocaleString()} FCFA</td>
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
                      <option value="Livrée">Livrée</option>
                      <option value="En cours">En cours</option>
                      <option value="En attente">En attente</option>
                      <option value="Annulée">Annulée</option>
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
                        {['N°','Client','Catégorie','Région','Montant','Commission','Statut','Actions'].map(h=>(
                          <th key={h} style={{ textAlign:'left', padding:'10px 8px', fontSize:11, color:'#6b7280' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map(order => (
                        <tr key={order.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                          <td style={{ padding:'10px 8px', fontFamily:'monospace', fontSize:12, color:'#10b981' }}>{order.orderNumber}</td>
                          <td style={{ padding:'10px 8px', fontSize:13 }}>{order.farmer}</td>
                          <td style={{ padding:'10px 8px', fontSize:12, color:'#9ca3af' }}>{order.category}</td>
                          <td style={{ padding:'10px 8px', fontSize:12 }}>{order.region}</td>
                          <td style={{ padding:'10px 8px', fontWeight:600 }}>{(order.amount ?? 0).toLocaleString()} FCFA</td>
                          <td style={{ padding:'10px 8px', color:'#f59e0b', fontSize:12 }}>{Math.round((order.amount ?? 0)*COMMISSION_RATE).toLocaleString()} FCFA</td>
                          <td style={{ padding:'10px 8px' }}><StatusBadge status={order.status}/></td>
                          <td style={{ padding:'10px 8px' }}>
                            <div style={{ display:'flex', gap:6 }}>
                              <select value={order.status} onChange={e=>updateOrderStatus(order.id!,e.target.value as Order['status'])} style={{ width:'auto', padding:'5px 8px', fontSize:11 }}>
                                <option value="En attente">En attente</option>
                                <option value="En cours">En cours</option>
                                <option value="Livrée">Livrée</option>
                                <option value="Annulée">Annulée</option>
                              </select>
                              {(order.status === 'En attente' || (order.status === 'En cours' && !order.deliveryPersonId)) && (
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
              <div className="glass-card animate-fadeIn" style={{ padding:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                  <div>
                    <h2 style={{ fontSize:18, fontWeight:700 }}>👥 Utilisateurs</h2>
                    <p style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{users.length} comptes</p>
                  </div>
                  <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={{ width:'auto' }}>
                    <option value="all">Tous les rôles</option>
                    <option value="client">Clients</option>
                    <option value="seller">Vendeurs</option>
                    <option value="delivery">Livreurs</option>
                    <option value="admin">Admins</option>
                  </select>
                </div>
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
                      {users.filter(u => statusFilter==='all' || u.role===statusFilter).map(user => (
                        <tr key={user.id} style={{ borderBottom:'1px solid #1a1c22' }}>
                          <td style={{ padding:'10px 8px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                              <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:600, flexShrink:0 }}>
                                {user.displayName?.charAt(0) ?? '?'}
                              </div>
                              <span style={{ fontSize:13 }}>{user.displayName}</span>
                            </div>
                          </td>
                          <td style={{ padding:'10px 8px', fontSize:12, color:'#9ca3af' }}>{user.email}</td>
                          <td style={{ padding:'10px 8px', fontSize:12 }}>{user.phone || '—'}</td>
                          <td style={{ padding:'10px 8px' }}>
                            <select value={user.role} onChange={e=>updateUserRole(user.id!,e.target.value)} style={{ width:'auto', padding:'5px 8px', fontSize:11 }}>
                              <option value="client">Client</option>
                              <option value="seller">Vendeur</option>
                              <option value="delivery">Livreur</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td style={{ padding:'10px 8px', fontSize:12, color:'#6b7280' }}>{user.createdAt?.toDate?.().toLocaleDateString?.() ?? '—'}</td>
                          <td style={{ padding:'10px 8px' }}>
                            <button onClick={()=>setSelectedUser(user)} className="btn-secondary" style={{ padding:'5px 10px', fontSize:11, marginRight:6 }}><Eye size={11}/> Voir</button>
                            <button onClick={()=>deleteUser(user.id!)} className="btn-secondary" style={{ padding:'5px 10px', fontSize:11, color:'#ef4444', borderColor:'#ef4444' }}><X size={11}/> Suppr.</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ═══ PRODUITS ═══════════════════════════════════ */}
            {activeTab === 'products' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))', gap:16 }} className="animate-fadeIn">
                {products.map(product => (
                  <div key={product.id} className="glass-card" style={{ padding:16 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                      <div><span style={{ fontSize:11, color:'#6b7280' }}>{product.category}</span><h3 style={{ fontSize:15, fontWeight:600, marginTop:3 }}>{product.name}</h3></div>
                      <span style={{ fontSize:17, fontWeight:700, color:'#10b981', whiteSpace:'nowrap' }}>{product.price.toLocaleString()} FCFA</span>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10, fontSize:12, color:'#6b7280' }}>
                      <span>📍 {product.region}</span>
                      <span>👤 {product.sellerName}</span>
                    </div>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                        <span>Stock</span>
                        <span style={{ fontWeight:600, color:product.stock<5?'#ef4444':'#10b981' }}>{product.stock} unités</span>
                      </div>
                      <div style={{ height:4, background:'#1f2127', borderRadius:2 }}>
                        <div style={{ width:`${Math.min(100,(product.stock/100)*100)}%`, height:'100%', background:product.stock<5?'#ef4444':'#10b981', borderRadius:2, transition:'width .3s' }}/>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button onClick={()=>updateProductStock(product.id!,product.stock-1)} className="btn-secondary" style={{ flex:1, justifyContent:'center' }}>−1</button>
                      <button onClick={()=>updateProductStock(product.id!,product.stock+10)} className="btn-primary" style={{ flex:1, justifyContent:'center' }}>+10</button>
                    </div>
                  </div>
                ))}
                {products.length === 0 && (
                  <div className="glass-card" style={{ padding:40, textAlign:'center', gridColumn:'1/-1', color:'#6b7280' }}>Aucun produit trouvé</div>
                )}
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
                      const sellerOrders = orders.filter(o=>o.farmerId===seller.uid||o.farmerId===seller.id);
                      const paidOrders   = sellerOrders.filter(o=>o.status==='Livrée');
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
                      { label:'Commandes', val:`${orders.length}`, sub:`${orders.filter(o=>o.status==='En attente').length} en attente`, color:'#06b6d4' },
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
                {/* Header stats */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:14, marginBottom:24 }}>
                  {[
                    { label:'Régions actives',     value:regionStats.filter(r=>r.revenue>0).length, color:'#10b981' },
                    { label:'Total commandes',      value:orders.length,                              color:'#06b6d4' },
                    { label:'Utilisateurs géocodés',value:users.filter(u=>u.region).length,          color:'#8b5cf6' },
                    { label:'Produits référencés',  value:products.filter(p=>p.region).length,       color:'#f59e0b' },
                  ].map((s,i)=>(
                    <div key={i} className="glass-card" style={{ padding:16 }}>
                      <div style={{ fontSize:24, fontWeight:700, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:12, color:'#6b7280', marginTop:4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Region cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))', gap:16, marginBottom:24 }}>
                  {regionStats.map(r => (
                    <div key={r.region} className="glass-card" style={{ padding:20, borderLeft:`3px solid ${r.color}` }}>
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
                    </div>
                  ))}
                </div>

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
                  <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>📢 Envoyer un message</h2>
                  <p style={{ fontSize:12, color:'#6b7280', marginBottom:20 }}>Diffusez aux utilisateurs via notifications in-app et email (Resend).</p>

                  {/* Cible */}
                  <div style={{ marginBottom:20, padding:16, background:'rgba(16,185,129,.05)', borderRadius:12, border:'1px solid rgba(16,185,129,.15)' }}>
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#10b981' }}>🎯 Audience cible</h4>

                    {/* Mode switcher */}
                    <div style={{ display:'flex', gap:8, marginBottom:14 }}>
                      {([['filter','🔍 Par critères'],['manual','✅ Sélection manuelle']] as const).map(([mode,label])=>(
                        <button key={mode} onClick={()=>{ setBroadcastMode(mode); setSelectedUserIds(new Set()); setUserPickerSearch(''); }}
                          style={{ flex:1, padding:'8px 0', borderRadius:10, border:`1px solid ${broadcastMode===mode?'#10b981':'rgba(255,255,255,.08)'}`, background:broadcastMode===mode?'rgba(16,185,129,.1)':'transparent', color:broadcastMode===mode?'#10b981':'#6b7280', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all .2s' }}>
                          {label}
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
                        <div style={{ marginTop:10, padding:'8px 12px', background:'#1f2127', borderRadius:8, fontSize:12, color:'#9ca3af' }}>
                          {(() => {
                            let count = users.length;
                            if (broadcastForm.targetRole !== 'all') count = users.filter(u=>u.role===broadcastForm.targetRole).length;
                            if (broadcastForm.targetRegion !== 'all') count = users.filter(u=>(broadcastForm.targetRole==='all'||u.role===broadcastForm.targetRole)&&u.region?.toLowerCase()===broadcastForm.targetRegion.toLowerCase()).length;
                            return `👥 ${count} destinataire(s) sélectionné(s)`;
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
                            <div style={{ fontSize:11, color:'#10b981', fontWeight:600, marginBottom:6 }}>✅ {selectedUserIds.size} destinataire(s) sélectionné(s)</div>
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
                    <h4 style={{ fontSize:13, fontWeight:600, marginBottom:12, color:'#06b6d4' }}>📡 Canaux d'envoi</h4>
                    <div style={{ display:'flex', gap:12, flexWrap:'wrap' }}>
                      {([['inApp','🔔 In-App','10b981'],['email','✉️ Email','8b5cf6'],['push','📲 Push','f59e0b']] as const).map(([key,label,color])=>(
                        <label key={key} style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'8px 14px', borderRadius:10, border:`1px solid ${broadcastForm.channels[key]?`#${color}`:'rgba(255,255,255,.08)'}`, background:broadcastForm.channels[key]?`rgba(${key==='inApp'?'16,185,129':key==='email'?'139,92,246':'245,158,11'},.1)`:'transparent', transition:'all .2s', width:'auto' }}>
                          <input type="checkbox" checked={broadcastForm.channels[key]} onChange={e=>setBroadcastForm({...broadcastForm,channels:{...broadcastForm.channels,[key]:e.target.checked}})} style={{ width:'auto', cursor:'pointer' }}/>
                          <span style={{ fontSize:13, fontWeight:500 }}>{label}</span>
                        </label>
                      ))}
                    </div>
                    <p style={{ fontSize:11, color:'#4b5563', marginTop:8 }}>Les emails sont envoyés via Resend, le push via Firebase Cloud Messaging (FCM).</p>
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
                      <label htmlFor="urgent" style={{ fontSize:13, cursor:'pointer' }}>⚡ Message urgent</label>
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
                    <h3 style={{ fontSize:15, fontWeight:600, marginBottom:16 }}>📋 Historique des envois</h3>
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
                                <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(16,185,129,.1)', color:'#10b981' }}>👥 {b.recipientCount}</span>
                                {b.inAppCount>0   && <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(6,182,212,.1)',   color:'#06b6d4' }}>🔔 {b.inAppCount}</span>}
                                {b.emailCount>0    && <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(139,92,246,.1)',   color:'#8b5cf6' }}>✉️ {b.emailCount}</span>}
                                {b.pushCount>0     && <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(245,158,11,.1)',  color:'#f59e0b' }}>📲 {b.pushCount}</span>}
                                {b.emailCount>0   && <span style={{ fontSize:10, padding:'3px 8px', borderRadius:20, background:'rgba(139,92,246,.1)',   color:'#8b5cf6' }}>✉ {b.emailCount}</span>}
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

              </div>
            )}

            {/* ═══ LIVRAISONS ═════════════════════════════════ */}
            {activeTab === 'delivery' && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:16 }} className="animate-fadeIn">
                {deliveryPersons.map(d=>(
                  <div key={d.id} className="glass-card" style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                      <div style={{ width:44, height:44, borderRadius:12, background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🚚</div>
                      <div><div style={{ fontWeight:600 }}>{d.displayName}</div><div style={{ fontSize:12, color:'#6b7280' }}>{d.phone||'—'}</div></div>
                    </div>
                    {[['Véhicule',d.vehicle||'Non spécifié'],['Région',d.region||'—'],['Statut','✅ Disponible']].map(([k,v])=>(
                      <div key={k} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'6px 0', borderBottom:'1px solid #1a1c22' }}>
                        <span style={{ color:'#6b7280' }}>{k}</span><span>{v}</span>
                      </div>
                    ))}
                    <button className="btn-primary" style={{ width:'100%', justifyContent:'center', marginTop:12 }}>
                      <Phone size={13}/> Contacter
                    </button>
                  </div>
                ))}
                {deliveryPersons.length===0 && (
                  <div className="glass-card" style={{ padding:40, textAlign:'center', gridColumn:'1/-1', color:'#6b7280' }}>Aucun livreur disponible</div>
                )}
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
            {activeTab === 'ads' && (
              <div className="animate-fadeIn" style={{ display:'grid', gap:24 }}>

                {/* ── Header hero doré ── */}
                <div style={{
                  position:'relative', overflow:'hidden', borderRadius:20, padding:'28px 24px',
                  background:'linear-gradient(135deg,#0a0f0d 0%,#16241c 55%,#0a0f0d 100%)',
                  border:'1px solid rgba(212,175,55,0.35)', boxShadow:'0 20px 60px rgba(0,0,0,0.35)'
                }}>
                  <div style={{ position:'absolute', top:-60, right:-60, width:220, height:220, borderRadius:'50%', background:'radial-gradient(circle,rgba(212,175,55,0.22),transparent 70%)', pointerEvents:'none' }}/>
                  <div style={{ display:'flex', alignItems:'center', gap:14, position:'relative', zIndex:1 }}>
                    <div style={{ width:52, height:52, borderRadius:15, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, background:'linear-gradient(135deg,#D4AF37,#F5E1A4,#B8860B)', boxShadow:'0 8px 24px rgba(212,175,55,0.45)' }}>
                      <Megaphone size={26} color="#111"/>
                    </div>
                    <div>
                      <h2 style={{ fontSize:24, fontWeight:700, letterSpacing:0.4, margin:0, background:'linear-gradient(135deg,#F5E1A4 0%,#D4AF37 50%,#B8860B 100%)', WebkitBackgroundClip:'text', backgroundClip:'text', color:'transparent' }}>
                        Promotions &amp; Publicités
                      </h2>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:3, letterSpacing:1.2, textTransform:'uppercase' }}>
                        Sacré Terroir · Visibilité Premium · AgriMarché
                      </p>
                    </div>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginTop:22, position:'relative', zIndex:1 }}>
                    {[
                      { label:'Promos actives',  value: ads.filter(a=>a.active&&a.type==='promotion').length,  icon:<Sparkles size={14}/>, color:'#D4AF37' },
                      { label:'Pubs actives',    value: ads.filter(a=>a.active&&a.type==='publicite').length,  icon:<Gift size={14}/>,     color:'#F5E1A4' },
                      { label:'Total créées',    value: ads.length,                                             icon:<Star size={14}/>,     color:'#B8860B' },
                      { label:'En bannière',     value: ads.filter(a=>a.placement==='banner'||a.placement==='both').length, icon:<Award size={14}/>, color:'#10b981' },
                    ].map((s,i)=>(
                      <div key={i} style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(212,175,55,0.18)', borderRadius:12, padding:'12px 14px', backdropFilter:'blur(6px)' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:5, color:s.color, marginBottom:6 }}>
                          {s.icon}
                          <span style={{ fontSize:9, letterSpacing:1.2, textTransform:'uppercase', color:'rgba(255,255,255,0.4)' }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize:26, fontWeight:800, color:'#fff', lineHeight:1 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── Sous-onglets ── */}
                <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.03)', borderRadius:16, padding:5, border:'1px solid rgba(212,175,55,0.15)' }}>
                  {([
                    ['promotions', '🏷️ Promotions', 'Prix réduits sur produits existants'],
                    ['publicites', '🖼️ Publicités', 'Bannières partenaires avec image'],
                  ] as const).map(([key, label, sub])=>(
                    <button key={key} onClick={()=>setAdsSubTab(key)}
                      style={{
                        flex:1, padding:'12px 16px', borderRadius:12, border:'none', cursor:'pointer', transition:'all .2s',
                        background: adsSubTab===key ? 'linear-gradient(135deg,rgba(212,175,55,0.2),rgba(212,175,55,0.08))' : 'transparent',
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
                      <div style={{ borderRadius:20, padding:24, background:'linear-gradient(160deg,#0f1a14 0%,#1a2a20 100%)', border:'1px solid rgba(212,175,55,0.22)' }}>
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
                                  linkUrl: `/main/products?id=${promoForm.productId}`,
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
                              <div key={ad.id} style={{
                                display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'center',
                                borderRadius:16, padding:14,
                                background: ad.active ? 'linear-gradient(160deg,#0f1a14,#16241c)' : 'rgba(255,255,255,0.03)',
                                border: ad.active ? '1px solid rgba(212,175,55,0.25)' : '1px solid rgba(255,255,255,0.07)',
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
                    <div style={{ borderRadius:20, padding:24, background:'linear-gradient(160deg,#0f1318 0%,#1a1a2e 100%)', border:'1px solid rgba(139,92,246,0.25)' }}>
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

                        {/* Lien au clic */}
                        <div>
                          <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#8b5cf6', letterSpacing:1, textTransform:'uppercase', marginBottom:6 }}>Lien (au clic)</label>
                          <input
                            style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(139,92,246,0.25)', borderRadius:10, padding:12, color:'#fff', width:'100%', fontSize:13, outline:'none' }}
                            placeholder="https://partenaire.com ou /main/products"
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
                            if (!pubForm.partnerName) return;
                            if (!editingPubId && !pubForm.imageFile) return;
                            try {
                              let downloadURL = pubForm.imageUrl;
                              let newPath: string | null = null;

                              // Upload uniquement si une nouvelle image a été choisie
                              if (pubForm.imageFile) {
                                setPubUploading(true);
                                const ext  = pubForm.imageFile.name.split('.').pop();
                                newPath = `ads/publicites/${Date.now()}_${pubForm.partnerName.replace(/\s+/g,'_')}.${ext}`;
                                const storageRef = ref(storage, newPath);
                                await uploadBytes(storageRef, pubForm.imageFile);
                                downloadURL = await getDownloadURL(storageRef);
                                setPubUploading(false);
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
                              if (newPath) payload.storagePath = newPath;

                              if (editingPubId) {
                                await updateDoc(doc(db,'ads',editingPubId), payload);
                                // Supprime l'ancienne image du Storage si elle a été remplacée
                                if (newPath && editingPubOldPath) {
                                  try { await deleteObject(ref(storage, editingPubOldPath)); } catch { /* fichier déjà absent, on ignore */ }
                                }
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
                            } catch (err) {
                              console.error(err);
                              toast.error('Erreur lors de l\'upload');
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
                            ? <><span style={{ width:16,height:16,border:'2px solid rgba(255,255,255,0.3)',borderTopColor:'#fff',borderRadius:'50%',display:'inline-block',animation:'spin 1s linear infinite' }}/> Upload en cours…</>
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
                            <div key={ad.id} style={{
                              display:'grid', gridTemplateColumns:'auto 1fr auto', gap:14, alignItems:'center',
                              borderRadius:16, padding:14,
                              background: ad.active ? 'linear-gradient(160deg,#0f1318,#1a1a2e)' : 'rgba(255,255,255,0.03)',
                              border: ad.active ? '1px solid rgba(139,92,246,0.3)' : '1px solid rgba(255,255,255,0.07)',
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
                                    setEditingPubOldPath(ad.storagePath || null);
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
                                      if (ad.storagePath) {
                                        try { await deleteObject(ref(storage, ad.storagePath)); } catch { /* fichier déjà absent */ }
                                      }
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
                <button key={d.id} onClick={()=>assignDelivery(assignOrderId!,d.id!,d.displayName)} className="glass-card" style={{ padding:12, textAlign:'left', cursor:'pointer', border:'1px solid #1f2127' }}>
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
          <div onClick={e=>e.stopPropagation()} className="glass-card" style={{ width:440, maxWidth:'90%', padding:24 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <h3 style={{ fontSize:17, fontWeight:600 }}>Détails utilisateur</h3>
              <button onClick={()=>setSelectedUser(null)} style={{ background:'none', border:'none', color:'#6b7280', cursor:'pointer' }}><X size={20}/></button>
            </div>
            <div style={{ display:'flex', gap:14, marginBottom:20, alignItems:'center' }}>
              <div style={{ width:56, height:56, borderRadius:28, background:'rgba(16,185,129,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, fontWeight:700 }}>{selectedUser.displayName?.charAt(0)??'?'}</div>
              <div><div style={{ fontWeight:700, fontSize:17 }}>{selectedUser.displayName}</div><div style={{ fontSize:12, color:'#6b7280' }}>{selectedUser.role}</div></div>
            </div>
            {[['Email',selectedUser.email],['Téléphone',selectedUser.phone||'—'],['Région',selectedUser.region||'—'],['Inscription',selectedUser.createdAt?.toDate?.().toLocaleDateString?.()??'—']].map(([k,v])=>(
              <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #1a1c22', fontSize:13 }}>
                <span style={{ color:'#6b7280' }}>{k}</span><span>{v}</span>
              </div>
            ))}
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
