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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
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

    return () => unsubscribe();
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

