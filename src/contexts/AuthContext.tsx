'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { ensureUserExists } from '@/lib/firebase/userProfile';

interface AuthContextType {
  user: User | null;
  profile: any | null;
  loading: boolean;
  logout: () => Promise<void>;
  updateUserProfile: (data: any) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log('[AuthContext] Abonnement à onAuthStateChanged...');

    // ⚠️ FIX : filet de sécurité. Si onAuthStateChanged ne se déclenche
    // JAMAIS (ex. conflit de synchronisation entre le plugin natif
    // @capacitor-firebase/authentication et le SDK web firebase/auth, ou
    // tout autre souci d'initialisation), `loading` restait bloqué à
    // `true` pour toujours — ce qui bloque en cascade TOUTES les pages de
    // l'app qui attendent `authLoading` avant de charger leurs propres
    // données (produits, panier, compte...), car aucune ne reçoit jamais
    // le signal "on sait maintenant si l'utilisateur est connecté ou non".
    const failsafe = setTimeout(() => {
      console.error('[AuthContext] onAuthStateChanged ne s\'est jamais déclenché après 8s — déblocage forcé');
      setLoading(false);
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      clearTimeout(failsafe);
      console.log('[AuthContext] onAuthStateChanged déclenché, user =', firebaseUser?.uid ?? 'null');
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          // Garantit que users/{uid} existe (le crée avec des valeurs
          // par défaut si c'est la première connexion post-OTP) avant
          // que le reste de l'app (admin, assistant IA, dashboard
          // vendeur...) ne tente d'y lire/écrire quoi que ce soit.
          const profile = await ensureUserExists(firebaseUser);
          setProfile(profile);
        } catch (error) {
          console.error('[AuthContext] Erreur chargement/création profil:', error);
          setProfile(null);
        }
      } else {
        setProfile(null);
      }

      setLoading(false);
    });

    return () => {
      clearTimeout(failsafe);
      unsubscribe();
    };
  }, []);

  const logout = async () => {
    await auth.signOut();
  };

  const updateUserProfile = async (data: any) => {
    // Implémente la mise à jour du profil
    console.log('Update profile:', data);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, logout, updateUserProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

// ✅ EXPORT DE useAuth (c'est ce qui manquait)
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

