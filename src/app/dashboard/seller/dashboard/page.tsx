'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSellerData } from '@/hooks/useSellerData';
import { useEffect } from 'react';
import Link from 'next/link';
import { SellerAIInsights } from '@/components/SellerAIInsights';

function StatCard({ icon, label, value, change }: {
  icon: string; label: string; value: string | number; change?: number;
}) {
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500 mb-1">{label}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <span className="text-3xl">{icon}</span>
      </div>
      {change !== undefined && (
        <p className={`text-xs mt-2 font-medium ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% ce mois
        </p>
      )}
    </div>
  );
}

export default function SellerDashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const { stats, orders, products, earnings, loading } = useSellerData();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
    if (!authLoading && !user) {
      router.replace('/auth/login');
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-bounce">🌱</div>
          <p className="text-gray-500 text-sm">Chargement du tableau de bord…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

      {/* Bienvenue */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-bold text-gray-900 text-xl">
            Bonjour, {user?.displayName || user?.displayName} 👋
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">Voici un résumé de votre activité</p>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-1.5">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-green-700 font-medium">Boutique active</span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📦" label="Commandes" value={stats.orders} change={stats.ordersChange} />
        <StatCard icon="🛒" label="Produits vendus" value={stats.productsSold} change={stats.productsSoldChange} />
        <StatCard
          icon="💰"
          label="Revenus (FCFA)"
          value={earnings.total.toLocaleString('fr-SN')}
          change={earnings.change}
        />
        <StatCard
          icon="⭐"
          label="Note moyenne"
          value={stats.rating ? stats.rating.toFixed(1) : '—'}
          change={stats.ratingChange}
        />
      </div>

      {/* IA Insights — La vraie valeur ajoutée */}
       <SellerAIInsights
  products={products.top || []}
  orders={orders.recent || []}
  earnings={Number(earnings)}
/>

      {/* Actions rapides */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { href: '/dashboard/seller/products', icon: '📦', label: 'Mes produits' },
          { href: '/dashboard/seller/orders', icon: '📋', label: 'Commandes' },
          { href: '/dashboard/seller/earnings', icon: '💰', label: 'Revenus' },
          { href: '/main/products', icon: '🛍️', label: 'Voir la boutique' },
        ].map(a => (
          <Link key={a.href} href={a.href}
            className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:border-green-200 hover:shadow-md transition flex flex-col items-center gap-2 text-center"
          >
            <span className="text-2xl">{a.icon}</span>
            <span className="text-xs font-semibold text-gray-700">{a.label}</span>
          </Link>
        ))}
      </div>

      {/* Commandes récentes */}
      {orders.recent?.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
            <h2 className="font-bold text-gray-900">Commandes récentes</h2>
            <Link href="/dashboard/seller/orders" className="text-xs text-green-600 font-medium hover:underline">Voir tout →</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {orders.recent?.slice(0, 5).map((order: any) => (
              <div key={order.id} className="px-5 py-3.5 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">#{order.id?.slice(-6)}</p>
                  <p className="text-xs text-gray-400">{order.createdAt?.toDate?.()?.toLocaleDateString('fr-SN') || '—'}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-green-700">{order.total?.toLocaleString('fr-SN')} FCFA</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    order.status === 'delivered' ? 'bg-green-100 text-green-700' :
                    order.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

