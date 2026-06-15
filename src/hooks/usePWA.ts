// src/hooks/usePWA.ts
import { useEffect, useState } from 'react';
import { installPrompt } from '@/pwa/install-prompt';
import { offlineSync } from '@/pwa/offline-sync';
import { notificationsManager } from '@/pwa/notifications';

interface PWAState {
  isInstallable: boolean;
  isOnline: boolean;
  isStandalone: boolean;
  notificationsEnabled: boolean;
  pendingOrdersCount: number;
}

export function usePWA() {
  const [state, setState] = useState<PWAState>({
    isInstallable: false,
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isStandalone: typeof window !== 'undefined'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false,
    notificationsEnabled: typeof Notification !== 'undefined'
      ? Notification.permission === 'granted'
      : false,
    pendingOrdersCount: 0
  });

  useEffect(() => {
    const handleOnline = () => setState(prev => ({ ...prev, isOnline: true }));
    const handleOffline = () => setState(prev => ({ ...prev, isOnline: false }));

    const displayModeQuery = window.matchMedia('(display-mode: standalone)');
    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setState(prev => ({ ...prev, isStandalone: e.matches }));
    };

    const updatePendingCount = async () => {
      try {
        const count = await offlineSync.getPendingOrdersCount();
        setState(prev => ({ ...prev, pendingOrdersCount: count }));
      } catch (error) {
        console.error('Erreur mise à jour compteur:', error);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    displayModeQuery.addEventListener('change', handleDisplayModeChange);

    const unsubscribe = installPrompt.onInstallableChange((visible) => {
      setState(prev => ({ ...prev, isInstallable: visible }));
    });

    const interval = setInterval(updatePendingCount, 5000);
    updatePendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      displayModeQuery.removeEventListener('change', handleDisplayModeChange);
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      console.warn('installPrompt non disponible');
      return false;
    }
    return installPrompt.showInstallPrompt();
  };

  // ✅ CORRECTION : Vérifier que notificationsManager n'est pas null
  const requestNotifications = async () => {
    if (!notificationsManager) {
      console.warn('notificationsManager non disponible');
      return false;
    }
    
    try {
      const granted = await notificationsManager.requestPermission();
      setState(prev => ({ ...prev, notificationsEnabled: granted }));
      return granted;
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
      return false;
    }
  };

  const syncNow = async () => {
    if (!offlineSync) {
      console.warn('offlineSync non disponible');
      return;
    }
    
    try {
      await offlineSync.syncAllPending();
      const count = await offlineSync.getPendingOrdersCount();
      setState(prev => ({ ...prev, pendingOrdersCount: count }));
    } catch (error) {
      console.error('Erreur lors de la synchronisation:', error);
    }
  };

  return { ...state, install, requestNotifications, syncNow };
}