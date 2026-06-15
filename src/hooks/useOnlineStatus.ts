// src/hooks/useOnlineStatus.ts
import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const [offlineDuration, setOfflineDuration] = useState<number>(0);

  useEffect(() => {
    let offlineStartTime: number | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;

    const handleOnline = () => {
      setIsOnline(true);
      if (offlineStartTime) {
        setOfflineDuration(Date.now() - offlineStartTime);
        setWasOffline(true);
        offlineStartTime = null;
        if (interval) { clearInterval(interval); interval = null; }
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      offlineStartTime = Date.now();
      setWasOffline(false);
      setOfflineDuration(0);
      interval = setInterval(() => {
        if (offlineStartTime) setOfflineDuration(Date.now() - offlineStartTime);
      }, 1000);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (interval) clearInterval(interval);
    };
  }, []);

  const formatOfflineDuration = (): string => {
    if (!wasOffline && offlineDuration === 0) return '';
    const seconds = Math.floor(offlineDuration / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''}`;
    return `${seconds} sec`;
  };

  return { isOnline, wasOffline, offlineDuration, formatOfflineDuration };
}
