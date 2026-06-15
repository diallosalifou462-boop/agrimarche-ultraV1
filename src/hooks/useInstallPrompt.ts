// src/hooks/useInstallPrompt.ts
import { useEffect, useState } from 'react';
import { installPrompt } from '@/pwa/install-prompt';

export function useInstallPrompt() {
  const [isInstallable, setIsInstallable] = useState<boolean>(false);
  const [isInstalled, setIsInstalled] = useState<boolean>(
    typeof window !== 'undefined'
      ? window.matchMedia('(display-mode: standalone)').matches
      : false
  );

  useEffect(() => {
    setIsInstallable(installPrompt.isInstallable());
    const unsubscribe = installPrompt.onInstallableChange(setIsInstallable);

    window.addEventListener('appinstalled', () => setIsInstalled(true));

    return () => { unsubscribe(); };
  }, []);

  const install = async (): Promise<boolean> => {
    return installPrompt.showInstallPrompt();
  };

  return { isInstallable, isInstalled, install };
}
