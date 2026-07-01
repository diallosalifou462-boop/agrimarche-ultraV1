// src/lib/performance/africa-optimization.ts

type ConnectionType = 'slow-2g' | '2g' | '3g' | '4g';

interface NetworkInformation {
  effectiveType: ConnectionType;
  saveData: boolean;
  rtt: number;
  downlink: number;
  addEventListener(event: string, handler: () => void): void;
}

export class AfricaOptimization {
  private static initialized = false;

  /** Détecte si la connexion est lente */
  static isSlowConnection(): boolean {
    const nav = navigator as any;
    const conn: NetworkInformation | undefined = nav.connection || nav.mozConnection || nav.webkitConnection;
    if (!conn) return false;
    return conn.saveData || conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
  }

  /** Active le mode économie de données */
  static enableDataSaver(): void {
    if (typeof window === 'undefined') return;
    if (!this.isSlowConnection()) return;

    document.documentElement.setAttribute('data-data-saver', 'true');
    this.disableAnimations();
    this.reducePrefetching();
    console.info('[Agrimarche] Mode économie données activé');
  }

  private static disableAnimations(): void {
    const style = document.createElement('style');
    style.id = 'data-saver-styles';
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
      }
    `;
    document.head.appendChild(style);
  }

  private static reducePrefetching(): void {
    document.querySelectorAll('link[rel="prefetch"]').forEach((l) => l.remove());
  }

  /** Surveille la connexion et adapte l'UI */
  static monitorConnection(): void {
    if (typeof window === 'undefined') return;
    const nav = navigator as any;
    const conn: NetworkInformation | undefined = nav.connection;
    if (!conn) return;

    const update = () => {
      if (conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g') {
        document.body.classList.add('slow-connection');
      } else {
        document.body.classList.remove('slow-connection');
      }
    };

    conn.addEventListener('change', update);
    update();
  }

  /** Lazy loading agressif pour les images */
  static setupAggressiveLazyLoading(): void {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;
          if (el instanceof HTMLImageElement) {
            const src = el.dataset.src;
            if (src) el.src = src;
          }
          observer.unobserve(el);
        });
      },
      { rootMargin: '50px', threshold: 0.01 }
    );

    document.querySelectorAll('[data-lazy]').forEach((el) => observer.observe(el));
  }

  /** Cache régional – précharge les produits populaires sénégalais */
  static async cacheByRegion(): Promise<void> {
    if (typeof window === 'undefined' || !('caches' in window)) return;

    let region = 'sn'; // default Sénégal
    try {
      const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) });
      const data = await res.json();
      region = (data.country_code as string).toLowerCase();
    } catch {
      // silencieux
    }

    try {
      const cache = await caches.open(`agrimarche-regional-${region}`);
      const popRes = await fetch(`/api/products/popular?region=${region}`);
      if (popRes.ok) {
        const products = await popRes.json();
        const urls: string[] = products.map((p: any) => `/api/products/${p.id}`);
        await cache.addAll(urls);
      }
    } catch {
      // silencieux – pas critique
    }
  }

  /** Initialisation unique */
  static init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.enableDataSaver();
    this.monitorConnection();
    this.setupAggressiveLazyLoading();
    // Cache région en arrière-plan, non bloquant
    this.cacheByRegion().catch(() => {});
  }
}

// Auto-init côté client
if (typeof window !== 'undefined') {
  AfricaOptimization.init();
}

