'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { trace } from '@/lib/firebase/firebase';

// 🔴 BUG TROUVÉ (trace du 23/07) : ce Splash avait SON PROPRE
// `onAuthStateChanged` + son propre appel `ensureUserExists()`,
// complètement indépendant de celui d'`AuthContext.tsx` (qui se
// présente pourtant comme "la source unique", voir son commentaire
// d'en-tête). Les deux listeners réagissent au même événement Firebase,
// mais PAS FORCÉMENT DANS LE MÊME ORDRE — et surtout, ce Splash
// naviguait (`router.push`) dès qu'IL était prêt, sans jamais attendre
// que `AuthContext.loading` passe à `false`.
//
// Conséquence : la page `/main/products` peut monter alors que
// `AuthContext` (donc `useAuth().user`/`.profile`, donc `CartProvider`
// qui dépend de `authLoading`) est ENCORE en train de se résoudre en
// arrière-plan. Le produit/panier/profil affichés à ce moment-là sont
// alors ceux d'un état transitoire (souvent "invité"), pas l'état final
// — exactement le symptôme "compte mal initialisé / panier incorrect"
// rapporté, et un pur problème de course entre deux listeners Auth
// redondants, indépendant du réseau lui-même.
//
// FIX : le Splash n'a plus SA PROPRE source de vérité Auth. Il consomme
// le `AuthContext` partagé (unique listener réel dans toute l'app) et
// attend que `loading === false` avant de décider où naviguer.
export default function SplashPage() {
  const router = useRouter();
  const { user, profile, loading: authLoading, authDebugInfo } = useAuth();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    trace('SPLASH', 'monté — en attente de AuthContext.loading === false');
    // ✅ Progression visuelle rapide (termine avant la redirection)
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 8;
      });
    }, 45);
    return () => clearInterval(progressInterval);
  }, []);

  useEffect(() => {
    let redirected = false;
    const safeRedirect = (path: string, reason: string) => {
      if (redirected) return;
      redirected = true;
      trace('SPLASH', `redirection vers ${path} (${reason})`);
      router.push(path);
    };

    // Filet de sécurité ABSOLU : si AuthContext ne résout jamais
    // `loading` (déjà protégé par son propre failsafe de 8s), on ne
    // reste jamais bloqué plus de 9s sur le splash.
    const failsafeTimer = setTimeout(() => {
      console.error('[Splash] Timeout de sécurité déclenché (9s) — redirection forcée');
      safeRedirect('/main/products', 'failsafe timeout');
    }, 9000);

    if (authLoading) {
      trace('SPLASH', 'AuthContext encore en chargement, on attend...', { authDebugInfo });
      return () => clearTimeout(failsafeTimer);
    }

    trace('SPLASH', `AuthContext prêt — user=${user?.uid ?? 'null'}, role=${profile?.role ?? 'n/a'}`);

    if (!user) {
      safeRedirect('/main/products', 'non connecté');
    } else {
      const role = profile?.role || 'client';
      if (role === 'admin') {
        safeRedirect('/admin', 'role admin');
      } else if (role === 'seller') {
        safeRedirect('/seller/dashboard', 'role seller');
      } else if (role === 'delivery') {
        safeRedirect('/delivery/dashboard', 'role delivery');
      } else {
        safeRedirect('/main/products', 'role client');
      }
    }

    return () => clearTimeout(failsafeTimer);
  }, [router, user, profile, authLoading, authDebugInfo]);

  return (
    <div className="relative min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 overflow-hidden">

      {/* LOGO */}
      <div className="relative z-10">
        <Image
          src="/logo.png"
          alt="Agrimarché"
          width={120}
          height={120}
          priority
          className="relative z-10"
        />
      </div>

      {/* TITRE */}
      <div className="relative z-10 mt-6 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight text-green-800">
          AgriMarché
        </h1>
      </div>

      {/* PHRASE D'UTILITÉ — dit tout de suite ce que fait l'app */}
      <div className="relative z-10 mt-3">
        <p className="text-green-700 text-center text-base font-medium">
          Achetez et vendez vos récoltes, partout au Sénégal
        </p>
      </div>

      {/* BARRE DE CHARGEMENT — une seule, sans pourcentage ni points */}
      <div className="relative z-10 mt-10 w-56">
        <div className="relative h-1.5 bg-green-200/60 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full bg-green-600 rounded-full transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

    </div>
  );
}
