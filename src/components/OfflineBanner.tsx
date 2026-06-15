'use client';
// src/components/OfflineBanner.tsx
import { useEffect, useState } from 'react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export function OfflineBanner() {
  const { isOnline, wasOffline, formatOfflineDuration } = useOnlineStatus();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isOnline || wasOffline) {
      setVisible(true);
    }
    if (isOnline && wasOffline) {
      // Auto-hide after 3 s once reconnected
      const t = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(t);
    }
  }, [isOnline, wasOffline]);

  if (!visible) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[9998] px-4 py-2.5 text-center text-sm font-medium animate-fade-in ${
        isOnline ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
      }`}
    >
      {isOnline
        ? `✅ Connexion rétablie${formatOfflineDuration() ? ` (hors-ligne ${formatOfflineDuration()})` : ''}`
        : '📡 Vous êtes hors-ligne — les données seront synchronisées automatiquement'}
    </div>
  );
}
