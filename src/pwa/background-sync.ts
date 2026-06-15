// src/pwa/background-sync.ts
export class BackgroundSyncManager {
  private static instance: BackgroundSyncManager;

  static getInstance(): BackgroundSyncManager {
    if (!BackgroundSyncManager.instance) {
      BackgroundSyncManager.instance = new BackgroundSyncManager();
    }
    return BackgroundSyncManager.instance;
  }

  async registerSync(tag: string): Promise<boolean> {
    if (!('serviceWorker' in navigator) || !('SyncManager' in window)) {
      console.warn('Background sync not supported');
      return false;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      await (registration as any).sync.register(tag);
      console.log(`Background sync registered: ${tag}`);
      return true;
    } catch (error) {
      console.error('Background sync registration failed:', error);
      return false;
    }
  }

  async registerOrderSync(): Promise<boolean> {
    return this.registerSync('sync-orders');
  }

  async registerCartSync(): Promise<boolean> {
    return this.registerSync('sync-cart');
  }

  async getSyncTags(): Promise<string[]> {
    if (!('serviceWorker' in navigator)) return [];
    try {
      const registration = await navigator.serviceWorker.ready;
      return await (registration as any).sync.getTags();
    } catch {
      return [];
    }
  }
}

export const backgroundSync = BackgroundSyncManager.getInstance();
