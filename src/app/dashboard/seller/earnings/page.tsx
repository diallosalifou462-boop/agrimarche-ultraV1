'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { useSellerData } from '@/hooks/useSellerData';

function formatPrice(n: number) {
  return new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n);
}

export default function SellerEarningsPage() {
  const { user, loading: authLoading } = useAuth();
  const { earnings, loading } = useSellerData();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center"><div className="text-4xl mb-3">💰</div>
          <p className="text-gray-500 text-sm">Chargement des revenus…</p></div>
      </div>
    );
  }

  // Simuler un historique visuel simple (barres)
  const maxAmount = earnings.history.length > 0
    ? Math.max(...earnings.history.map(h => h.amount), 1)
    : 1;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <h1 className="font-bold text-gray-900 text-lg">Mes revenus</h1>

      {/* Total */}
      <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white">
        <p className="text-green-200 text-sm mb-1">Revenus totaux</p>
        <p className="text-4xl font-bold">{formatPrice(earnings.total)}</p>
        {earnings.change !== 0 && (
          <p className={`text-sm mt-2 font-medium ${earnings.change >= 0 ? 'text-green-200' : 'text-red-200'}`}>
            {earnings.change >= 0 ? '↑' : '↓'} {Math.abs(earnings.change)}% ce mois
          </p>
        )}
      </div>

      {/* Graphique des revenus */}
      {earnings.history.length > 0 ? (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
          <h2 className="font-bold text-gray-900 mb-4 text-sm">Historique des revenus</h2>
          <div className="flex items-end gap-2 h-32">
            {earnings.history.map((h, i) => {
              const pct = maxAmount > 0 ? (h.amount / maxAmount) * 100 : 0;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-green-500 rounded-t-lg transition-all"
                    style={{ height: `${Math.max(pct, 2)}%` }}
                    title={formatPrice(h.amount)}
                  />
                  <span className="text-xs text-gray-400 truncate w-full text-center">
                    {h.date}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm text-center">
          <div className="text-4xl mb-3">📈</div>
          <p className="text-gray-500 text-sm">L&apos;historique de vos revenus apparaîtra ici dès vos premières ventes.</p>
        </div>
      )}

      {/* Infos */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
        <p className="font-semibold mb-1">💡 Comment recevoir vos paiements ?</p>
        <p>Les paiements sont effectués via mobile money (Wave, Orange Money) ou virement bancaire. Configurez votre compte de paiement dans les paramètres.</p>
      </div>
    </div>
  );
}

