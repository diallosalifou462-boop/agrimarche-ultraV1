// src/pwa/notifications.ts
// getMessaging and onMessage are dynamically imported to avoid SSR crashes.
import { auth } from '@/lib/firebase/firebase';

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  url?: string;
  data?: Record<string, string>;
}

export class PushNotificationsManager {
  private static instance: PushNotificationsManager;
  private messaging: unknown = null;
  private permissionGranted = false;
  private token: string | null = null;
  private app: unknown = null;

  static getInstance(): PushNotificationsManager {
    if (!PushNotificationsManager.instance) {
      PushNotificationsManager.instance = new PushNotificationsManager();
    }
    return PushNotificationsManager.instance;
  }

  async initialize(): Promise<void> {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      // ✅ Importer getApp depuis firebase/app, pas depuis messaging
      const { getMessaging, onMessage } = await import('firebase/messaging');
      const { getApps, initializeApp, getApp } = await import('firebase/app');
      
      // Récupérer ou initialiser l'app Firebase
      let firebaseApp;
      const apps = getApps();
      if (apps.length === 0) {
        const firebaseConfig = {
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        };
        firebaseApp = initializeApp(firebaseConfig as any);
      } else {
        firebaseApp = getApp();
      }
      
      this.app = firebaseApp;
      this.messaging = getMessaging(this.app as any);
      
      // ✅ CORRECTION : Utiliser un wrapper pour adapter la signature
      this.setupForegroundListener((payload: unknown) => {
        const p = payload as { 
          notification?: { title?: string; body?: string; icon?: string }; 
          data?: Record<string, string> 
        };
        if (p.notification) {
          this.showInAppNotification({
            title: p.notification.title ?? 'Agrimarche',
            body: p.notification.body ?? '',
            icon: p.notification.icon,
            url: p.data?.url,
            data: p.data,
          });
        }
      });
      
      if (process.env.NODE_ENV === 'production') {
        await this.requestPermission();
      }
    } catch (err) {
      console.warn('[Push] FCM unavailable:', err);
    }
  }

  async requestPermission(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    const permission = await Notification.requestPermission();
    this.permissionGranted = permission === 'granted';
    if (this.permissionGranted) {
      await this.getFCMToken();
      await this.registerTokenOnServer();
    }
    return this.permissionGranted;
  }

  private async getFCMToken(): Promise<string | null> {
    if (!this.messaging) return null;
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn('[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY not set');
      return null;
    }
    try {
      const { getToken } = await import('firebase/messaging');
      const currentToken = await getToken(this.messaging as any, { vapidKey });
      if (currentToken) {
        this.token = currentToken;
        return currentToken;
      }
      return null;
    } catch (err) {
      console.error('[Push] Token error:', err);
      return null;
    }
  }

  private async registerTokenOnServer(): Promise<void> {
    if (!this.token) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
      const idToken = await user.getIdToken();
      await fetch('/api/notifications/register-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ token: this.token, platform: 'web', userId: user.uid }),
      });
    } catch (err) {
      console.error('[Push] Register token error:', err);
    }
  }

  // ✅ CORRECTION : Méthode simplifiée qui prend directement un callback
  private setupForegroundListener(onMessageCallback: (payload: unknown) => void): void {
    if (!this.messaging) return;
    
    // Importer onMessage et l'utiliser correctement
    import('firebase/messaging').then(({ onMessage }) => {
      onMessage(this.messaging as any, onMessageCallback);
    }).catch(err => {
      console.warn('[Push] Failed to setup foreground listener:', err);
    });
  }

  private showInAppNotification(notification: NotificationPayload): void {
    if (typeof document === 'undefined') return;
    const container = document.createElement('div');
    container.style.cssText = `
      position:fixed;top:20px;right:20px;z-index:9999;
      background:white;border-radius:16px;padding:16px;
      box-shadow:0 8px 32px rgba(0,0,0,0.15);
      display:flex;align-items:center;gap:12px;
      max-width:320px;border-left:4px solid #2e7d32;
    `;
    container.innerHTML = `
      <div style="font-size:24px;">🔔</div>
      <div style="flex:1;">
        <strong style="display:block;color:#2e7d32;">${notification.title}</strong>
        <p style="margin:4px 0 0;font-size:13px;color:#666;">${notification.body}</p>
      </div>
      <button style="background:none;border:none;font-size:18px;cursor:pointer;color:#999;">×</button>
    `;
    document.body.appendChild(container);
    const timer = setTimeout(() => container.remove(), 5000);
    container.querySelector('button')?.addEventListener('click', () => {
      clearTimeout(timer);
      container.remove();
    });
    if (notification.url) {
      container.style.cursor = 'pointer';
      container.addEventListener('click', () => {
        window.location.href = notification.url!;
        container.remove();
      });
    }
  }

  get isPermissionGranted(): boolean { return this.permissionGranted; }
  get fcmToken(): string | null { return this.token; }
}

export const notificationsManager = typeof window !== 'undefined' 
  ? PushNotificationsManager.getInstance() 
  : null;