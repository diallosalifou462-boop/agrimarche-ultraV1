// src/pwa/install-prompt.ts
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export class InstallPromptManager {
  private static instance: InstallPromptManager;
  private deferredPrompt: BeforeInstallPromptEvent | null = null;
  private installListeners: ((visible: boolean) => void)[] = [];

  static getInstance(): InstallPromptManager {
    if (!InstallPromptManager.instance) {
      InstallPromptManager.instance = new InstallPromptManager();
    }
    return InstallPromptManager.instance;
  }

  initialize(): void {
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e as BeforeInstallPromptEvent;
      this.notifyListeners(true);
      console.log('Install prompt available');
    });

    window.addEventListener('appinstalled', () => {
      console.log('App installed successfully');
      this.deferredPrompt = null;
      this.notifyListeners(false);
      this.trackInstallation();
    });
  }

  async showInstallPrompt(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    try {
      await this.deferredPrompt.prompt();
      const result = await this.deferredPrompt.userChoice;
      this.deferredPrompt = null;
      this.notifyListeners(false);
      return result.outcome === 'accepted';
    } catch (error) {
      console.error('Error showing install prompt:', error);
      return false;
    }
  }

  isInstallable(): boolean {
    return this.deferredPrompt !== null;
  }

  onInstallableChange(callback: (visible: boolean) => void): () => void {
    this.installListeners.push(callback);
    return () => {
      this.installListeners = this.installListeners.filter(cb => cb !== callback);
    };
  }

  private notifyListeners(visible: boolean): void {
    this.installListeners.forEach(callback => callback(visible));
  }

  private trackInstallation(): void {
    fetch('/api/analytics/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'pwa_installed', timestamp: Date.now(), userAgent: navigator.userAgent })
    }).catch(console.error);
  }
}

export const installPrompt = InstallPromptManager.getInstance();

