'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

const NAV_ITEMS = [
  { href: '/dashboard/seller/dashboard', icon: '📊', label: 'Vue d\'ensemble' },
  { href: '/dashboard/seller/products',  icon: '📦', label: 'Mes produits' },
  { href: '/dashboard/seller/orders',    icon: '🧾', label: 'Commandes' },
  { href: '/dashboard/seller/earnings',  icon: '💰', label: 'Revenus' },
];

export default function SellerDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  // 🔒 Guard: vendeur connecté uniquement
  useEffect(() => {
    if (!user) { router.replace('/auth/login'); return; }
    getDoc(doc(db, 'users', user.uid)).then(snap => {
      if (!snap.exists()) { router.replace('/seller/register'); return; }
      const role = snap.data()?.role;
      if (!['seller', 'both', 'admin'].includes(role)) router.replace('/seller/register');
    });
  }, [user, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex">

      {/* ── SIDEBAR DESKTOP ── */}
      <aside className="hidden md:flex flex-col w-56 bg-white border-r border-gray-200 sticky top-14 h-[calc(100vh-3.5rem)] flex-shrink-0">
        <div className="px-4 py-5 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Dashboard Vendeur</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-gray-100">
          <Link
            href="/main/products"
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-gray-50 transition"
          >
            <span>←</span>
            <span>Retour à la boutique</span>
          </Link>
        </div>
      </aside>

      {/* ── CONTENU PRINCIPAL ── */}
      <div className="flex-1 min-w-0">
        {/* Nav mobile dashboard */}
        <div className="md:hidden flex overflow-x-auto bg-white border-b border-gray-200 px-2 py-2 gap-1 sticky top-14 z-30">
          {NAV_ITEMS.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition ${
                  active ? 'bg-green-50 text-green-700' : 'text-gray-600'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </div>
  );
}

