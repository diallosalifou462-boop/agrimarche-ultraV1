// src/pwa/register-sw.ts
import { Workbox } from 'workbox-window';

export class ServiceWorkerRegistration {
  private static instance: ServiceWorkerRegistration;
  private wb: Workbox | null = null;
  private updateToast: HTMLElement | null = null;

  static getInstance(): ServiceWorkerRegistration {
    if (!ServiceWorkerRegistration.instance) {
      ServiceWorkerRegistration.instance = new ServiceWorkerRegistration();
    }
    return ServiceWorkerRegistration.instance;
  }

  async register(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.warn('Service workers are not supported');
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      this.wb = new Workbox('/sw.js');
      this.setupUpdateHandling();
      try {
        await this.wb.register();
        console.log('Service Worker registered successfully');
        this.checkForUpdates();
      } catch (error) {
        console.error('Service Worker registration failed:', error);
      }
    } else {
      console.log('Development mode: Service Worker disabled');
    }
  }

  private setupUpdateHandling(): void {
    if (!this.wb) return;

    this.wb.addEventListener('waiting', () => {
      console.log('New service worker waiting');
      this.showUpdateNotification();
    });

    this.wb.addEventListener('controlling', () => {
      console.log('Service worker now controlling the page');
      window.location.reload();
    });

    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data.type === 'UPDATE_AVAILABLE') {
        console.log('Update available:', event.data.version);
        this.showUpdateNotification(event.data.version);
      }
    });
  }

  private showUpdateNotification(version?: string): void {
    if (this.updateToast) this.updateToast.remove();

    this.updateToast = document.createElement('div');
    this.updateToast.className = 'update-toast';
    this.updateToast.style.cssText = `
      position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
      background:#2e7d32; color:white; padding:16px 24px; border-radius:16px;
      display:flex; align-items:center; gap:16px; z-index:9999;
      box-shadow:0 8px 32px rgba(0,0,0,0.2); animation:slideUp 0.3s ease;
    `;
    this.updateToast.innerHTML = `
      <div>🔄</div>
      <div>
        <strong>Nouvelle version disponible</strong>
        <p style="margin:0;font-size:12px;opacity:0.8">Agrimarche ${version || ''} s'est amélioré</p>
      </div>
      <button style="background:white;color:#2e7d32;border:none;padding:8px 16px;border-radius:25px;font-weight:600;cursor:pointer;">
        Mettre à jour
      </button>
    `;

    document.body.appendChild(this.updateToast);

    const updateButton = this.updateToast.querySelector('button');
    updateButton?.addEventListener('click', () => this.updateToLatest());

    setTimeout(() => {
      if (this.updateToast) {
        this.updateToast.style.opacity = '0';
        this.updateToast.style.transition = 'opacity 0.3s';
        setTimeout(() => this.updateToast?.remove(), 300);
      }
    }, 10000);
  }

  private updateToLatest(): void {
    if (this.wb) {
      this.wb.addEventListener('controlling', () => window.location.reload());
      this.wb.messageSkipWaiting();
    }
  }

  private async checkForUpdates(): Promise<void> {
    setInterval(async () => {
      if (this.wb) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) await registration.update();
      }
    }, 60 * 60 * 1000);
  }

  async unregister(): Promise<void> {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
    console.log('Service workers unregistered');
  }
}

const swRegistration = ServiceWorkerRegistration.getInstance();
export default swRegistration;

