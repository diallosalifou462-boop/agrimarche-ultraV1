'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

export default function SplashPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // ✅ Progression visuelle
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 45);

    // ✅ Redirection selon le rôle après 2500ms
    const timer = setTimeout(() => {
      onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) {
          // Pas connecté → page de login
          router.push('/auth/login');
          return;
        }

        // Connecté → vérifier le rôle dans Firestore
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        const role = snap.data()?.role || 'client';

        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'seller') {
          router.push('/seller/dashboard');
        } else if (role === 'delivery') {
          router.push('/delivery/dashboard');
        } else {
          router.push('/main/products');
        }
      });
    }, 2500);

    return () => {
      clearTimeout(timer);
      clearInterval(progressInterval);
    };
  }, [router]);

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-white via-green-50 to-emerald-100 flex flex-col items-center justify-center p-6 overflow-hidden">

      {/* BACKGROUND */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full border border-green-200/30 animate-ping"
          style={{ animationDuration: '4s' }}
        />
        <div className="absolute w-[400px] h-[400px] rounded-full border border-green-300/20 animate-pulse" />
        <div className="absolute w-[300px] h-[300px] rounded-full bg-green-100/20 blur-3xl" />
      </div>

      {/* LOGO */}
      <div className="relative z-10 transition-all duration-700">
        <div className="relative group">
          <div className="absolute inset-0 bg-green-500/20 blur-2xl rounded-full scale-110" />
          <Image
            src="/logo.png"
            alt="Agrimarché"
            width={240}
            height={240}
            priority
            className="relative z-10 drop-shadow-2xl transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      </div>

      {/* TITRE */}
      <div className="relative z-10 mt-8 text-center">
        <h1 className="text-5xl md:text-6xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-green-800 via-green-600 to-emerald-500 bg-clip-text text-transparent">
            AGRI
          </span>
          <span className="bg-gradient-to-r from-emerald-500 via-green-600 to-green-800 bg-clip-text text-transparent">
            MARCHÉ
          </span>
        </h1>
        <div className="flex justify-center mt-3">
          <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-green-500 to-transparent" />
        </div>
      </div>

      {/* SLOGAN */}
      <div className="relative z-10 mt-4">
        <p className="text-green-700 text-center text-lg italic font-light tracking-wide">
          <span className="relative">
            la terre directement chez vous
            <span className="absolute -bottom-1 left-0 w-full h-px bg-green-300/50" />
          </span>
        </p>
      </div>

      {/* BARRE */}
      <div className="relative z-10 mt-12 w-64">
        <div className="relative h-1.5 bg-gray-200/60 rounded-full overflow-hidden backdrop-blur-sm">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-green-500 via-emerald-400 to-green-600 rounded-full transition-all duration-100 ease-out"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute top-0 right-0 w-2 h-full bg-white/30 blur-sm" />
          </div>
        </div>
        <p className="text-center text-xs text-green-600 mt-2 font-mono">
          {progress}%
        </p>
      </div>

      {/* DOTS */}
      <div className="relative z-10 mt-6 flex gap-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>

      {/* FOOTER */}
      <div className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-xs text-gray-400 tracking-wide">
          ©️ {new Date().getFullYear()} Agrimarché — v2.0
        </p>
      </div>

    </div>
  );
}
