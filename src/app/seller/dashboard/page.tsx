'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  DollarSign, ShoppingBag, Package, Star,
  Clock, TrendingUp, Award, Navigation, ChevronRight,
} from 'lucide-react';
import { auth, getUserProfile } from '@/lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface Product { id: string; name: string; price: number; stock: number; sales: number; whatsappClicks: number; }
interface Order   { id: string; customerName: string; amount: number; status: string; }

const STATUS_COLORS: Record<string, string> = {
  'En attente':     'bg-amber-50 text-amber-600 ring-amber-200',
  'En préparation': 'bg-sky-50 text-sky-600 ring-sky-200',
  'Expédiée':       'bg-violet-50 text-violet-600 ring-violet-200',
};

function WaIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>
  );
}

export default function SellerDashboard() {
  const [sellerLocation, setSellerLocation] = useState('');
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) { window.location.href = '/seller/register'; return; }
      const profile = await getUserProfile(user.uid);
      if (!profile) { window.location.href = '/seller/register'; return; }
      const allowedRoles = ['seller', 'both', 'admin'];
      if (!allowedRoles.includes(profile.role)) { window.location.href = '/seller/register'; return; }
      if (profile.role === 'both' && profile.currentMode !== 'seller') { window.location.href = '/'; return; }
      setAuthorized(true);

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`);
            const data = await res.json();
            setSellerLocation(data.display_name?.split(',')[0] || 'Position détectée');
          } catch { setSellerLocation('Position détectée'); }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  if (!authorized) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-11 h-11 rounded-full border-[3px] border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-xs text-gray-400 font-medium tracking-wide">Vérification de l'accès…</p>
      </div>
    </div>
  );

  // ⚠️ Valeurs à 0 / vides pour le moment — en attente du branchement aux vraies données (Firestore)
  const stats = [
    { label: "Chiffre d'affaires", value: '0', unit: 'FCFA', icon: DollarSign, bg: 'bg-emerald-500', light: 'bg-emerald-50 text-emerald-700' },
    { label: 'Commandes',          value: '0', unit: '',     icon: ShoppingBag, bg: 'bg-sky-500',     light: 'bg-sky-50 text-sky-700' },
    { label: 'Produits',           value: '0', unit: '',     icon: Package,     bg: 'bg-violet-500',  light: 'bg-violet-50 text-violet-700' },
    { label: 'Note moyenne',       value: '—', unit: '',     icon: Star,        bg: 'bg-amber-500',   light: 'bg-amber-50 text-amber-700' },
    { label: 'En attente',         value: '0', unit: '',     icon: Clock,       bg: 'bg-orange-500',  light: 'bg-orange-50 text-orange-700' },
  ];

  const topProducts: Product[] = [];

  const recentOrders: Order[] = [];

  const maxSales = topProducts.length > 0 ? Math.max(...topProducts.map(p => p.sales)) : 1;

  return (
    <div className="space-y-5 pb-10" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* ── LOCALISATION ── */}
      {sellerLocation && (
        <div className="flex items-center gap-3 bg-white border border-emerald-100 rounded-2xl px-4 py-3 shadow-sm">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
            <Navigation size={15} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Votre boutique</p>
            <p className="text-sm text-gray-700 font-semibold truncate">{sellerLocation}</p>
          </div>
        </div>
      )}

      {/* ── STATS ── */}
      {/* Big stat first on mobile */}
      <div className="bg-gradient-to-br from-emerald-600 to-teal-500 rounded-2xl p-5 shadow-lg shadow-emerald-100 relative overflow-hidden">
        <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="flex items-center gap-3 relative">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <DollarSign size={18} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] text-white/70 font-semibold uppercase tracking-widest">Chiffre d'affaires</p>
            <p className="text-white text-2xl font-black leading-tight">0 <span className="text-sm font-semibold opacity-80">FCFA</span></p>
          </div>
        </div>
      </div>

      {/* Secondary stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {stats.slice(1).map(({ label, value, unit, icon: Icon, light }) => (
          <div key={label} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className={`w-8 h-8 rounded-xl ${light} flex items-center justify-center mb-3`}>
              <Icon size={15} />
            </div>
            <p className="text-2xl font-black text-gray-800 leading-none">
              {value}
              {unit && <span className="text-xs font-semibold text-gray-400 ml-1">{unit}</span>}
            </p>
            <p className="text-[11px] text-gray-400 font-medium mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* ── TOP PRODUITS ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2">
            <TrendingUp size={14} className="text-emerald-500" />
            Meilleures ventes
          </h2>
          <Link href="/seller/products" className="flex items-center gap-0.5 text-emerald-600 text-sm font-semibold">
            Voir tout <ChevronRight size={14} />
          </Link>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {topProducts.length === 0 ? (
            <p className="text-xs text-gray-400 font-medium text-center py-4">Aucune vente pour le moment</p>
          ) : (
            topProducts.map((p, i) => (
              <div key={p.id} className="flex items-center gap-4">
                {/* Rank */}
                <span className={`text-xs font-black w-5 text-center shrink-0 ${i === 0 ? 'text-amber-500' : 'text-gray-300'}`}>
                  {i === 0 ? '★' : `${i + 1}`}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-baseline mb-1.5">
                    <p className="text-sm font-bold text-gray-800 truncate">{p.name}</p>
                    <p className="text-sm font-black text-emerald-600 shrink-0 ml-2">{p.sales} <span className="text-[10px] font-semibold text-gray-400">ventes</span></p>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full"
                      style={{ width: `${(p.sales / maxSales) * 100}%` }}
                    />
                  </div>
                  {/* Clics WhatsApp */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <WaIcon s={11} />
                    <span className="text-[10px] font-bold text-emerald-600">{p.whatsappClicks}</span>
                    <span className="text-[10px] font-medium text-gray-400">clic{p.whatsappClicks === 1 ? '' : 's'} WhatsApp</span>
                  </div>
                  <p className="text-[10px] text-gray-400 font-medium mt-1">
                    {p.price.toLocaleString()} FCFA · Stock : {p.stock}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── COMMANDES RÉCENTES ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2">
            <ShoppingBag size={14} className="text-emerald-500" />
            Commandes récentes
          </h2>
          <Link href="/seller/orders" className="flex items-center gap-0.5 text-emerald-600 text-sm font-semibold">
            Voir tout <ChevronRight size={14} />
          </Link>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {recentOrders.length === 0 ? (
            <p className="text-xs text-gray-400 font-medium text-center py-4">Aucune commande pour le moment</p>
          ) : (
            recentOrders.map((order) => {
              const pill = STATUS_COLORS[order.status] || 'bg-gray-50 text-gray-600 ring-gray-200';
              return (
                <div key={order.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-800 truncate">{order.customerName}</p>
                    <p className="text-[10px] text-gray-400 font-medium">{order.id}</p>
                  </div>
                  <div className="shrink-0 text-right flex flex-col items-end gap-1">
                    <p className="text-sm font-black text-emerald-700">
                      {order.amount.toLocaleString()} <span className="text-[10px] font-semibold text-gray-400">FCFA</span>
                    </p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${pill}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── OBJECTIF DU MOIS ── */}
      <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-500 rounded-2xl p-5 text-white shadow-lg shadow-emerald-100 relative overflow-hidden">
        <div className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <Award size={15} className="text-amber-300" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">Objectif du mois</span>
          </div>
          <p className="text-3xl font-black mt-1 mb-0.5">
            2 000 000 <span className="text-sm font-semibold opacity-70">FCFA</span>
          </p>
          <p className="text-xs text-white/60 mb-4">Atteignez ce montant pour passer niveau Premium</p>

          {/* Progress */}
          <div className="flex justify-between text-xs font-bold mb-2">
            <span>Progression</span>
            <span>0 %</span>
          </div>
          <div className="h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white rounded-full transition-all duration-700" style={{ width: '0%' }} />
          </div>
          <p className="text-[10px] text-white/50 mt-2">0 FCFA sur 2 000 000 FCFA</p>
        </div>
      </div>

    </div>
  );
}
