'use client';
// src/components/InstallBanner.tsx
import { useState } from 'react';
import { usePWA } from '@/hooks/usePWA';

export function InstallBanner() {
  const { isInstallable, install, isStandalone } = usePWA();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || isStandalone || dismissed) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-0 right-0 z-50 px-4 animate-slide-up">
      <div className="max-w-lg mx-auto bg-white shadow-xl rounded-2xl border border-gray-100 flex items-center gap-4 p-4">
        <span className="text-4xl flex-shrink-0">📱</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-green-700 text-sm">Installer AgriMarché</p>
          <p className="text-xs text-gray-500 mt-0.5">Utilisez notre application pour une meilleure expérience</p>
        </div>
        <button
          onClick={install}
          className="flex-shrink-0 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition"
        >
          Installer
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 text-xl p-1"
          aria-label="Fermer"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

