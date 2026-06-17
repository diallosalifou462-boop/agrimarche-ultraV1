'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Attendre que Firebase Auth ET le profil Firestore soient prêts
    if (loading) return;
    if (!user) { router.replace('/auth/login'); return; }

    // Attendre que profile soit chargé avant de juger le rôle
    if (profile === null) return; // ← profil pas encore chargé, on attend

    if (profile?.role !== 'admin') {
      router.replace('/main/products');
    }
  }, [user, profile, loading, router]);

  // Pendant le chargement OU pendant que profile se charge → spinner
  if (loading || (user && profile === null)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060e09]">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Pas connecté ou pas admin → rien (redirection en cours)
  if (!user || profile?.role !== 'admin') {
    return null;
  }

  // Admin confirmé ✅
  return <>{children}</>;
}
