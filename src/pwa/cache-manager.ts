// src/pwa/cache-manager.ts

export interface CacheConfig {
  name: string;
  maxAge: number;
  maxEntries: number;
}

export class CacheManager {
  private static instance: CacheManager;

  static getInstance(): CacheManager {
    if (!CacheManager.instance) {
      CacheManager.instance = new CacheManager();
    }
    return CacheManager.instance;
  }

  async precache(urls: string[], cacheName: string = 'static-v1'): Promise<void> {
    const cache = await caches.open(cacheName);
    await cache.addAll(urls);
    console.log(`Precached ${urls.length} assets to ${cacheName}`);
  }

  async getFromCache(url: string, cacheName: string): Promise<Response | null> {
    const cache = await caches.open(cacheName);

    const match = await cache.match(url);

    return match ?? null;
  }

  async setCache(url: string, response: Response, cacheName: string): Promise<void> {
    const cache = await caches.open(cacheName);
    await cache.put(url, response.clone());
  }

  async clearCache(cacheName?: string): Promise<void> {
    if (cacheName) {
      await caches.delete(cacheName);
      console.log(`Cleared cache: ${cacheName}`);
    } else {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('Cleared all caches');
    }
  }

  async getCacheSize(cacheName: string): Promise<number> {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    let size = 0;

    for (const request of keys) {
      const response = await cache.match(request);

      if (response) {
        const blob = await response.blob();
        size += blob.size;
      }
    }

    return size;
  }

  async cleanupOldCaches(maxAgeDays: number = 30): Promise<void> {
    const cacheNames = await caches.keys();

    const now = Date.now();

    const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;

    for (const name of cacheNames) {
      const cache = await caches.open(name);

      const keys = await cache.keys();

      for (const request of keys) {
        const response = await cache.match(request);

        if (response) {
          const dateHeader = response.headers.get('date');

          if (dateHeader && now - new Date(dateHeader).getTime() > maxAgeMs) {
            await cache.delete(request);
          }
        }
      }
    }
  }

  async prefetchResources(urls: string[]): Promise<void> {
    const cache = await caches.open('prefetch-v1');

    await Promise.all(
      urls.map(async url => {
        try {
          const response = await fetch(url);

          if (response.ok) {
            await cache.put(url, response);
          }
        } catch (error) {
          console.error(`Failed to prefetch ${url}:`, error);
        }
      })
    );
  }

  async getCacheStats(): Promise<{ [key: string]: { size: number; count: number } }> {
    const cacheNames = await caches.keys();

    const stats: any = {};

    for (const name of cacheNames) {
      const cache = await caches.open(name);

      const keys = await cache.keys();

      stats[name] = {
        count: keys.length,
        size: await this.getCacheSize(name)
      };
    }

    return stats;
  }
}

export const cacheManager = CacheManager.getInstance();