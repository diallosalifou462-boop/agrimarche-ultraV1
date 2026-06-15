'use client';

import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Attendre que le chargement soit fini
    if (loading) return;
    
    // Pas d'utilisateur connecté
    if (!user) {
      router.replace('/auth/login');
      return;
    }
    
    // Utilisateur connecté mais pas admin
    if (profile?.role !== 'admin') {
      router.replace('/main/products');
      return;
    }
    
    // Admin : on reste sur la page
  }, [user, profile, loading, router]);

  // Pendant le chargement, afficher un loader
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060e09]">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 border-2 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  // Si pas admin ou pas connecté, ne rien afficher (la redirection est en cours)
  if (!user || profile?.role !== 'admin') {
    return null;
  }

  // Admin autorisé
  return <>{children}</>;
}