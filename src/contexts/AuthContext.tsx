'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
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

    // 🔎 CAUSE RÉELLE (confirmée) : sur natif, le plugin @capacitor-firebase/
    // authentication ne synchronise la session vers le SDK JS (`firebase/auth`,
    // donc `onAuthStateChanged`) qu'en réaction À UN APPEL EXPLICITE (sign-in,
    // getCurrentUser...). Cette synchro se produit bien pendant l'inscription
    // (voir waitForJsAuthSync côté register), mais PAS au lancement à froid /
    // retour d'arrière-plan de l'app : la session native existe déjà, mais
    // rien ne redéclenche l'échange vers le SDK JS. `onAuthStateChanged` reste
    // alors silencieux indéfiniment — d'où le filet de sécurité ci-dessous qui
    // se déclenchait systématiquement sur mobile. Le vrai fix : appeler
    // `getCurrentUser()` nous-mêmes dès le montage sur natif, ce qui force
    // cette synchro (cf. capawesome-team/capacitor-firebase discussion #559).
    if (Capacitor.isNativePlatform()) {
      FirebaseAuthentication.getCurrentUser().catch((err) => {
        console.error('[AuthContext] Échec resynchro native → JS SDK:', err);
      });
    }

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

    // Sur natif, un retour d'arrière-plan ne redéclenche pas non plus la
    // synchro automatiquement (cf. issue citée plus haut) : on la relance
    // nous-mêmes à chaque reprise d'activité de l'app.
    let removeResumeListener: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) => {
        App.addListener('appStateChange', ({ isActive }) => {
          if (isActive) {
            FirebaseAuthentication.getCurrentUser().catch((err) => {
              console.error('[AuthContext] Échec resynchro (reprise app):', err);
            });
          }
        }).then((handle) => {
          removeResumeListener = () => handle.remove();
        });
      }).catch(() => {
        // @capacitor/app indisponible — pas de resynchro au retour d'arrière-plan
      });
    }

    return () => {
      clearTimeout(failsafe);
      unsubscribe();
      removeResumeListener?.();
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

