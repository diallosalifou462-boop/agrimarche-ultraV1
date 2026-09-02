'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

const HERO_ITEMS = [
  { emoji: '🍅', label: 'Tomates fraîches' },
  { emoji: '🥭', label: 'Mangues de Thiès' },
  { emoji: '🌾', label: 'Mil de Kaolack' },
  { emoji: '🧅', label: 'Oignons de Podor' },
  { emoji: '🥜', label: 'Arachides bio' },
  { emoji: '🌶️', label: 'Piments locaux' },
];

const FEATURES = [
  { icon: '🌱', title: 'Produits frais', desc: 'Directement des producteurs sénégalais sans intermédiaire' },
  { icon: '💰', title: 'Prix justes', desc: 'Des prix équitables pour les agriculteurs et les acheteurs' },
  { icon: '🚚', title: 'Livraison locale', desc: 'Livraison rapide dans toutes les régions du Sénégal' },
  { icon: '📱', title: 'Application mobile', desc: 'Disponible hors-ligne grâce à notre technologie PWA' },
];

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!loading && user) router.replace('/main/products');
  }, [user, loading, router]);

  if (!mounted || loading) return null;

  return (
    <div className="min-h-screen bg-white">

      {/* ── HERO ── */}
      <section className="bg-gradient-to-br from-green-700 via-green-600 to-emerald-500 text-white px-4 py-16 sm:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-6xl mb-4">🌱</div>
          <h1 className="text-3xl sm:text-5xl font-bold mb-4 leading-tight">
            Le marché agricole<br />du Sénégal
          </h1>
          <p className="text-green-100 text-lg sm:text-xl mb-8 max-w-xl mx-auto">
            Achetez et vendez des produits frais directement entre agriculteurs et consommateurs.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/auth/register"
              className="bg-white text-green-700 font-bold px-8 py-4 rounded-2xl hover:bg-green-50 transition text-base shadow-lg"
            >
              Commencer gratuitement →
            </Link>
            <Link
              href="/auth/login"
              className="border-2 border-white/50 text-white font-semibold px-8 py-4 rounded-2xl hover:bg-white/10 transition text-base"
            >
              Se connecter
            </Link>
          </div>
        </div>

        {/* Défilement produits */}
        <div className="mt-12 flex gap-3 overflow-x-auto pb-2 max-w-2xl mx-auto justify-center flex-wrap">
          {HERO_ITEMS.map((item) => (
            <div key={item.label} className="flex-shrink-0 bg-white/20 backdrop-blur rounded-xl px-4 py-2 flex items-center gap-2">
              <span className="text-2xl">{item.emoji}</span>
              <span className="text-sm font-medium text-white">{item.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-2xl font-bold text-gray-900 text-center mb-10">
          Pourquoi choisir AgriMarché ?
        </h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="text-center p-6 rounded-2xl bg-gray-50 hover:bg-green-50 transition">
              <div className="text-4xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA VENDEUR ── */}
      <section className="bg-green-50 border-y border-green-100 px-4 py-14">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-5xl mb-4">🌾</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Vous êtes agriculteur ?</h2>
          <p className="text-gray-600 mb-6">
            Rejoignez des centaines de vendeurs et vendez vos récoltes directement en ligne.
            Aucune commission, aucune prise de tête.
          </p>
          <Link
            href="/auth/register"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-4 rounded-2xl transition"
          >
            Devenir vendeur →
          </Link>
        </div>
      </section>

      {/* ── FOOTER SIMPLE ── */}
      <footer className="px-4 py-8 text-center text-sm text-gray-400">
        <p>AgriMarché © {new Date().getFullYear()} · La marketplace agricole du Sénégal</p>
      </footer>
    </div>
  );
}

