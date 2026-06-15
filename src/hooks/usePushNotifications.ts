// src/hooks/usePushNotifications.ts
import { useEffect, useState } from 'react';
import { notificationsManager } from '@/pwa/notifications';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSupported, setIsSupported] = useState<boolean>(false);

  useEffect(() => {
    setIsSupported('Notification' in window && 'serviceWorker' in navigator);
  }, []);

  const requestPermission = async (): Promise<boolean> => {
    // ✅ Vérification complète
    if (typeof window === 'undefined') {
      return false;
    }
    
    if (!notificationsManager) {
      console.warn('notificationsManager non disponible');
      return false;
    }
    
    if (typeof notificationsManager.requestPermission !== 'function') {
      console.warn('notificationsManager.requestPermission n\'est pas une fonction');
      return false;
    }
    
    try {
      const granted = await notificationsManager.requestPermission();
      setPermission(Notification.permission);
      return granted;
    } catch (error) {
      console.error('Erreur lors de la demande de permission:', error);
      return false;
    }
  };

  return { 
    permission, 
    isSupported, 
    requestPermission, 
    isGranted: permission === 'granted' 
  };
}