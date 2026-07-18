'use client';

import Link from 'next/link';
import Image from 'next/image';

export default function MainPage() {
  return (
    <div className="min-h-screen bg-[#FAF8F3] flex flex-col">

      {/* HEADER — logo discret, jamais le héros */}
      <header className="flex items-center justify-between px-5 py-4 max-w-md w-full mx-auto">
        <div className="flex items-center gap-2">
          <Image src="/logo.png" alt="Agrimarché" width={28} height={28} className="rounded-md" />
          <span className="text-sm font-bold text-emerald-800">AgriMarché</span>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 flex flex-col justify-center px-5 max-w-md w-full mx-auto">

        {/* PROMESSE — comprise en 3 secondes */}
        <div className="mb-9">
          <h1 className="text-[28px] leading-tight font-extrabold text-emerald-900 mb-2">
            Achetez et vendez vos récoltes, partout au Sénégal.
          </h1>
          <p className="text-[15px] text-emerald-700/80">
            Producteurs et acheteurs se retrouvent ici. Simple, direct, sans détour.
          </p>
        </div>

        {/* ACTION PRINCIPALE — un seul focus */}
        <Link
          href="/main/products"
          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-center font-bold text-base py-4 rounded-2xl shadow-lg shadow-emerald-600/25 transition-all"
        >
          🌾 Voir les produits
        </Link>

        {/* ACTIONS SECONDAIRES — discrètes, sous la principale */}
        <div className="flex gap-3 mt-3">
          <Link
            href="/main/account"
            className="flex-1 text-center border border-emerald-200 text-emerald-800 font-medium text-sm py-3.5 rounded-2xl bg-white hover:bg-emerald-50 transition-colors"
          >
            👤 Mon profil
          </Link>

          <Link
            href="/main/unlock-ia"
            className="flex-1 text-center border border-purple-200 text-purple-700 font-medium text-sm py-3.5 rounded-2xl bg-white hover:bg-purple-50 transition-colors"
          >
            🤖 IA
          </Link>
        </div>
      </main>

      {/* FOOTER — minimal */}
      <footer className="text-center text-[11px] text-emerald-800/30 py-5">
        © 2026 AgriMarché
      </footer>
    </div>
  );
}
