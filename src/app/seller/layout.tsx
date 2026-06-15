'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Store, Package, ShoppingBag, BarChart3, Loader2 } from 'lucide-react';
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isRegisterPage = pathname === '/seller/register';
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  // ✅ Synchronisation temps réel du profil
  useEffect(() => {
    if (isRegisterPage) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/seller/register');
        setLoading(false);
        return;
      }

      // ✅ Écoute temps réel du profil utilisateur
      const userRef = doc(db, 'users', user.uid);
      const unsubDoc = onSnapshot(userRef, (docSnap) => {
        console.log('=== LAYOUT DEBUG ===');
        console.log('docSnap exists:', docSnap.exists());
        if (docSnap.exists()) {
          const userProfile = docSnap.data();
          console.log('userProfile:', userProfile);
          console.log('displayName:', userProfile.displayName);
          console.log('phone:', userProfile.phone);
          console.log('region:', userProfile.region);
          console.log('role:', userProfile.role);
          const hasFields = !!(userProfile.displayName?.trim() && userProfile.phone?.trim() && userProfile.region?.trim());
          console.log('hasFields:', hasFields);
          
          if (!hasFields) {
            console.log('→ Redirection register (champs manquants)');
            router.push('/seller/register');
          } else {
            console.log('→ Profil OK, accès autorisé');
            setProfile(userProfile);
          }
        } else {
          console.log('→ Document inexistant, redirection register');
          router.push('/seller/register');
        }
        setLoading(false);
      }, (error) => {
        console.error('Erreur layout:', error);
        setLoading(false);
      });

      return () => unsubDoc();
    });

    return () => unsubscribe();
  }, [router, isRegisterPage]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-emerald-600" />
          <p className="text-gray-500 font-medium">Vérification de l'accès vendeur...</p>
        </div>
      </div>
    );
  }

  if (isRegisterPage) {
    return <>{children}</>;
  }

  if (!profile) return null;

  const navItems = [
    { href: '/seller', label: 'Tableau de bord', icon: BarChart3 },
    { href: '/seller/products', label: 'Produits', icon: Package },
    { href: '/seller/orders', label: 'Commandes', icon: ShoppingBag },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-emerald-50/30 to-cyan-50/30 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-950/30 transition-colors duration-300">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-emerald-700 via-green-600 to-teal-700 text-white sticky top-0 z-20 shadow-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Espace Vendeur</h1>
                <p className="text-xs text-emerald-200">Gérez votre boutique</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden md:flex flex-col items-end">
                <span className="text-sm font-medium">{profile.displayName}</span>
                <span className="text-xs text-emerald-200">{profile.role}</span>
              </div>
              <Link href="/main" className="p-2 hover:bg-white/10 rounded-xl transition text-sm">
                Quitter
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* NAVIGATION */}
      <div className="max-w-7xl mx-auto px-6 pt-6">
        <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 overflow-x-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl whitespace-nowrap transition font-medium ${
                  isActive
                    ? 'bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-400 border-x border-t border-gray-200 dark:border-gray-700'
                    : 'text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* CONTENU */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {children}
      </div>
    </div>
  );
}