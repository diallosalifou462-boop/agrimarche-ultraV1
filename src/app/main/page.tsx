'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

interface Particle {
  id: number;
  left: string;
  animationDelay: string;
  animationDuration: string;
  width: string;
  height: string;
  background: string;
}

export default function MainPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const [particles, setParticles] = useState<Particle[]>([]);
  const [hasAIAccess, setHasAIAccess] = useState(false);
  const [checking, setChecking] = useState(true);

  // Vérifier l'accès IA via le compte Firestore
  useEffect(() => {
    if (authLoading) return;

    const checkAIAccess = async () => {
      setChecking(true);

      if (!user?.uid) {
        setHasAIAccess(false);
        setChecking(false);
        return;
      }

      // 1. Vérification Firestore (source de vérité)
      if (db) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);
          const userData = userDoc.data();

          if (userData?.hasAIAccess && userData?.aiExpiryDate) {
            const expiryDate = userData.aiExpiryDate.toDate?.() || new Date(userData.aiExpiryDate);
            if (expiryDate > new Date()) {
              setHasAIAccess(true);
              setChecking(false);
              return;
            }
          }
        } catch (error) {
          console.error('Erreur Firestore:', error);
        }
      }

      // 2. Fallback localStorage
      const savedCode = localStorage.getItem('ai_access_code');
      const savedUserId = localStorage.getItem('ai_user_id');
      if (savedCode && savedUserId === user.uid) {
        const expiry = localStorage.getItem('ai_code_expiry');
        if (expiry && new Date().getTime() < parseInt(expiry)) {
          setHasAIAccess(true);
          setChecking(false);
          return;
        }
      }

      setHasAIAccess(false);
      setChecking(false);
    };

    checkAIAccess();
  }, [user, authLoading]);

  // Générer les particules côté client uniquement (évite l'hydration mismatch)
  useEffect(() => {
    const generatedParticles: Particle[] = [...Array(55)].map((_, i) => ({
      id: i,
      left: `${Math.random() * 100}%`,
      animationDelay: `${Math.random() * 20}s`,
      animationDuration: `${14 + Math.random() * 16}s`,
      width: `${1 + Math.random() * 3.5}px`,
      height: `${1 + Math.random() * 3.5}px`,
      background: `rgba(55, 125, 75, ${0.08 + Math.random() * 0.18})`,
    }));
    setParticles(generatedParticles);
  }, []);

  return (
    <div className="sacred-container">
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #fafef7; overflow-x: hidden; }
        
        .sacred-container {
          position: relative;
          min-height: 100vh;
          background: radial-gradient(ellipse at 20% 30%, #ffffff 0%, #f5fbf2 50%, #edf8e8 100%);
          overflow: hidden;
        }
        
        .celestial-breath {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          z-index: 1;
          background: radial-gradient(circle at var(--x, 50%) var(--y, 50%), rgba(230, 255, 220, 0.25) 0%, rgba(80, 150, 90, 0.05) 40%, transparent 70%);
          transition: background 0.05s;
        }
        
        .eternal-silence {
          position: fixed;
          inset: 0;
          background: radial-gradient(ellipse at 50% 50%, transparent 50%, rgba(20, 60, 30, 0.04) 100%);
          pointer-events: none;
          z-index: 0;
        }
        
        .light-seed {
          position: fixed;
          pointer-events: none;
          z-index: 0;
          width: 2px;
          height: 2px;
          background: rgba(55, 115, 75, 0.2);
          border-radius: 50%;
          opacity: 0;
          animation: riseSlow 18s ease-in infinite;
        }
        
        @keyframes riseSlow {
          0% { transform: translateY(100vh) translateX(0); opacity: 0; }
          15% { opacity: 0.35; }
          85% { opacity: 0.35; }
          100% { transform: translateY(-15vh) translateX(35px); opacity: 0; }
        }
        
        .emblem-glow { position: relative; display: inline-block; }
        .emblem-glow::before {
          content: '';
          position: absolute;
          inset: -28px;
          background: radial-gradient(circle, rgba(55, 125, 75, 0.1), transparent 70%);
          border-radius: 50%;
          opacity: 0.45;
          animation: glowPulse 4s ease-in-out infinite;
        }
        .emblem-glow::after {
          content: '';
          position: absolute;
          inset: -14px;
          background: radial-gradient(circle, rgba(75, 145, 95, 0.06), transparent 65%);
          border-radius: 50%;
          opacity: 0.4;
          animation: glowPulse 5s ease-in-out infinite reverse;
        }
        
        @keyframes glowPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.96); }
          50% { opacity: 0.6; transform: scale(1.04); }
        }
        
        .sacred-emblem {
          position: relative;
          border-radius: 2rem;
          overflow: hidden;
          box-shadow: 0 30px 50px -20px rgba(30, 70, 40, 0.35);
          transition: all 0.6s cubic-bezier(0.2, 0.95, 0.4, 1.05);
        }
        .sacred-emblem:hover { transform: scale(1.015); box-shadow: 0 40px 60px -22px rgba(35, 85, 50, 0.45); }
        .sacred-emblem img { transition: transform 0.8s ease-out; }
        .sacred-emblem:hover img { transform: scale(1.04); }
        
        .name-breath {
          animation: breathLight 3.2s ease-in-out infinite;
          display: inline-block;
        }
        
        @keyframes breathLight {
          0%, 100% { letter-spacing: -0.02em; text-shadow: 0 0 0px rgba(45, 100, 65, 0); }
          50% { letter-spacing: 0.015em; text-shadow: 0 0 12px rgba(55, 120, 75, 0.1); }
        }
        
        .flowing-line {
          position: relative;
          width: 160px;
          height: 1.5px;
          background: linear-gradient(90deg, transparent, #2d6a4f, #40916c, #74c69d, #40916c, #2d6a4f, transparent);
          background-size: 200% 100%;
          animation: flowStream 5s ease-in-out infinite;
          border-radius: 2px;
        }
        
        @keyframes flowStream {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        
        .invocation-text {
          line-height: 1.45;
          text-shadow: 0 1px 2px rgba(30, 60, 35, 0.04);
          font-weight: 350;
        }
        
        .gate-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.45s cubic-bezier(0.2, 0.9, 0.4, 1.1);
          z-index: 2;
          backdrop-filter: blur(2px);
          cursor: pointer;
        }
        .gate-btn::before {
          content: '';
          position: absolute;
          top: var(--y, 50%);
          left: var(--x, 50%);
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 245, 0.35);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        .gate-btn:hover::before { width: 360px; height: 360px; }
        .gate-btn:active { transform: scale(0.97); }
        
        .gate-outline {
          position: relative;
          overflow: hidden;
          transition: all 0.4s cubic-bezier(0.2, 0.9, 0.4, 1.1);
          backdrop-filter: blur(2px);
          cursor: pointer;
        }
        .gate-outline::before {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0%;
          height: 2px;
          background: linear-gradient(90deg, #2d6a4f, #74c69d);
          transition: width 0.45s ease;
        }
        .gate-outline:hover::before { width: 100%; }
        .gate-outline:hover { background: rgba(45, 106, 79, 0.05); transform: translateY(-2px); }
        
        .ia-premium-btn {
          position: relative;
          overflow: hidden;
          transition: all 0.45s cubic-bezier(0.2, 0.9, 0.4, 1.1);
          z-index: 2;
          backdrop-filter: blur(2px);
          background: linear-gradient(135deg, #8b5cf6, #6d28d9, #4c1d95);
          box-shadow: 0 8px 32px rgba(107, 70, 193, 0.3);
          display: inline-block;
          text-decoration: none;
          cursor: pointer;
        }
        .ia-premium-btn::before {
          content: '';
          position: absolute;
          top: var(--y, 50%);
          left: var(--x, 50%);
          width: 0;
          height: 0;
          border-radius: 50%;
          background: rgba(255, 255, 245, 0.25);
          transform: translate(-50%, -50%);
          transition: width 0.6s, height 0.6s;
        }
        .ia-premium-btn:hover::before { width: 360px; height: 360px; }
        .ia-premium-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(107, 70, 193, 0.4); }
        
        .ia-premium-badge {
          position: absolute;
          top: -8px;
          right: -8px;
          background: linear-gradient(135deg, #f59e0b, #d97706);
          color: white;
          font-size: 9px;
          font-weight: bold;
          padding: 2px 8px;
          border-radius: 20px;
          animation: pulse 2s ease infinite;
        }
        
        @keyframes pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        
        .access-badge {
          background: linear-gradient(135deg, #16a34a, #22c55e);
          padding: 4px 12px;
          border-radius: 30px;
          font-size: 11px;
          font-weight: 600;
          margin-left: 12px;
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: rgba(35, 75, 50, 0.03); }
        ::-webkit-scrollbar-thumb { background: rgba(45, 106, 79, 0.2); border-radius: 4px; }
        
        .footer-text {
          position: fixed;
          bottom: 16px;
          left: 0;
          right: 0;
          text-align: center;
          font-size: 11px;
          color: rgba(45, 106, 79, 0.4);
          letter-spacing: 1px;
          font-family: system-ui, sans-serif;
          z-index: 100;
          pointer-events: none;
        }
      `}</style>

      <div
        className="celestial-breath"
        onMouseMove={(e) => {
          document.documentElement.style.setProperty('--x', e.clientX + 'px');
          document.documentElement.style.setProperty('--y', e.clientY + 'px');
        }}
      />
      <div className="eternal-silence" />

      {particles.map((particle) => (
        <div
          key={particle.id}
          className="light-seed"
          style={{
            left: particle.left,
            animationDelay: particle.animationDelay,
            animationDuration: particle.animationDuration,
            width: particle.width,
            height: particle.height,
            background: particle.background,
          }}
        />
      ))}

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="emblem-glow mb-10">
          <div className="sacred-emblem rounded-3xl shadow-2xl">
            <div className="absolute inset-0 bg-gradient-to-tr from-emerald-500/12 to-transparent pointer-events-none" />
            <Image src="/logo.png" alt="Agrimarché" width={300} height={300} priority className="rounded-3xl" />
          </div>
        </div>

        <h1 className="text-7xl md:text-9xl font-black text-center tracking-tighter">
          <span className="name-breath inline-block text-emerald-800 drop-shadow-sm">AGRI</span>
          <span className="name-breath inline-block text-emerald-500" style={{ animationDelay: '0.2s' }}>MARCHÉ</span>
        </h1>

        <div className="flowing-line mt-8 mb-9" />

        <p className="text-xl md:text-2xl italic text-emerald-700/70 text-center max-w-2xl font-light tracking-wide invocation-text">
          la terre directement chez vous
        </p>

        <div className="flex flex-wrap justify-center gap-6 mt-16">

          {/* 🔓 PRODUITS - GRATUIT */}
          <Link
            href="/main/products"
            className="gate-btn bg-gradient-to-r from-emerald-800 to-emerald-600 hover:from-emerald-700 hover:to-emerald-500 text-white px-8 md:px-12 py-4 rounded-full font-bold shadow-2xl transition-all duration-300 text-center tracking-wide"
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              e.currentTarget.style.setProperty('--x', (e.clientX - rect.left) + 'px');
              e.currentTarget.style.setProperty('--y', (e.clientY - rect.top) + 'px');
            }}
          >
            🌾 découvrir les produits
          </Link>

          {/* 🔒 IA PREMIUM */}
          {checking ? (
            <div className="gate-btn bg-gradient-to-r from-purple-400 to-indigo-400 text-white px-8 md:px-12 py-4 rounded-full font-bold opacity-60 cursor-wait text-center tracking-wide">
              ⏳ Vérification…
            </div>
          ) : hasAIAccess ? (
            <Link
              href="/main/ai-assistant"
              className="gate-btn bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white px-8 md:px-12 py-4 rounded-full font-bold shadow-2xl transition-all duration-300 text-center tracking-wide flex items-center gap-2"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--x', (e.clientX - rect.left) + 'px');
                e.currentTarget.style.setProperty('--y', (e.clientY - rect.top) + 'px');
              }}
            >
              🤖 IA Premium active
              <span className="access-badge">✅ Débloqué</span>
            </Link>
          ) : (
            <Link
              href="/main/unlock-ia"
              className="ia-premium-btn text-white px-8 md:px-12 py-4 rounded-full font-bold transition-all duration-300 text-center tracking-wide relative inline-flex items-center justify-center"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                e.currentTarget.style.setProperty('--x', (e.clientX - rect.left) + 'px');
                e.currentTarget.style.setProperty('--y', (e.clientY - rect.top) + 'px');
              }}
            >
              🤖 Débloquer l'IA Premium
              <span className="ia-premium-badge">🔥 500 FCFA</span>
            </Link>
          )}

          {/* 🔓 PROFIL - GRATUIT */}
          <Link
            href="/main/account"
            className="gate-outline border-2 border-emerald-500 text-emerald-700 bg-white/30 px-8 md:px-12 py-4 rounded-full font-bold transition-all duration-300 text-center shadow-md hover:shadow-xl"
          >
            👤 mon profil
          </Link>
        </div>

        <div className="mt-20">
          <div className="w-24 h-px bg-gradient-to-r from-transparent via-emerald-400/25 to-transparent" />
        </div>
      </div>

      <div className="footer-text">
        © 2026 Agrimarché - v2.0
      </div>
    </div>
  );
}
