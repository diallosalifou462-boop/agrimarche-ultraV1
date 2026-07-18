'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { ensureUserExists } from '@/lib/firebase/userProfile';

export default function SplashPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
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

    // ✅ Redirection selon le rôle, dès que l'auth est résolue
    let redirected = false;
    const safeRedirect = (path: string, reason: string) => {
      if (redirected) return;
      redirected = true;
      console.log(`[Splash] Redirection vers ${path} (${reason})`);
      router.push(path);
    };

    // Filet de sécurité ABSOLU : quoi qu'il arrive (promesse qui ne
    // résout ni ne rejette jamais, erreur non prévue, etc.), on ne
    // reste jamais bloqué plus de 5s sur le splash.
    const failsafeTimer = setTimeout(() => {
      console.error('[Splash] Timeout de sécurité déclenché (5s) — redirection forcée');
      safeRedirect('/main/products', 'failsafe timeout');
    }, 5000);

    // ⚠️ FIX : la vérification d'authentification démarre maintenant
    // IMMÉDIATEMENT au montage. Avant, un `setTimeout(..., 1200)` retardait
    // volontairement son démarrage — un délai artificiel qui s'ajoutait à la
    // vraie latence réseau/Firestore et rendait le lancement de l'app plus
    // lent qu'il ne devait l'être, sans aucun bénéfice pour l'utilisateur.
    console.log('[Splash] Démarrage de la vérification auth (onAuthStateChanged)');
    let unsubscribe: (() => void) | null = null;
    unsubscribe = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        try {
          console.log('[Splash] onAuthStateChanged déclenché, user =', firebaseUser?.uid ?? 'null');
          unsubscribe?.(); // on ne veut réagir qu'une seule fois ici

          if (!firebaseUser) {
            safeRedirect('/main/products', 'non connecté');
            return;
          }

          console.log('[Splash] Appel ensureUserExists()...');
          const profile = await ensureUserExists(firebaseUser);
          console.log('[Splash] Profil récupéré, role =', profile.role);
          const role = profile.role || 'client';

          if (role === 'admin') {
            safeRedirect('/admin', 'role admin');
          } else if (role === 'seller') {
            safeRedirect('/seller/dashboard', 'role seller');
          } else if (role === 'delivery') {
            safeRedirect('/delivery/dashboard', 'role delivery');
          } else {
            safeRedirect('/main/products', 'role client');
          }
        } catch (error) {
          // ✅ FIX CRITIQUE : sans ce catch, une erreur ici (Firestore,
          // réseau, permissions...) laissait l'app bloquée indéfiniment
          // sur le splash, car router.push() n'était jamais atteint.
          console.error('[Splash] Erreur pendant ensureUserExists()/redirection:', error);
          safeRedirect('/main/products', 'erreur récupérée (voir logs)');
        }
      },
      (error) => {
        // Erreur du listener onAuthStateChanged lui-même (rare, mais
        // possible : mauvaise config Firebase, réseau down, etc.)
        console.error('[Splash] Erreur onAuthStateChanged (listener):', error);
        safeRedirect('/main/products', 'erreur listener auth');
      },
    );

    return () => {
      clearTimeout(failsafeTimer);
      clearInterval(progressInterval);
      unsubscribe?.();
    };
  }, [router]);

  return (
    <div className="relative min-h-screen bg-green-50 flex flex-col items-center justify-center p-6 overflow-hidden">

      {/* LOGO — plus petit, discret */}
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
