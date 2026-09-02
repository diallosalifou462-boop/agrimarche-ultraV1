// src/pwa/offline-sync.ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

interface AgrimarcheDB extends DBSchema {
  pendingOrders: {
    key: string;
    value: {
      id: string;
      order: unknown;
      timestamp: number;
      retryCount: number;
      failed?: boolean;
    };
    indexes: { 'by-timestamp': number };
  };
  pendingCart: {
    key: string;
    value: { id: string; cart: unknown; timestamp: number };
  };
  syncQueue: {
    key: string;
    value: {
      id: string;
      type: 'order' | 'cart' | 'favorite';
      data: unknown;
      timestamp: number;
      processed: boolean;
    };
    indexes: { 'by-type': string };
  };
}

export class OfflineSyncManager {
  private static instance: OfflineSyncManager;
  private db: IDBPDatabase<AgrimarcheDB> | null = null;
  private syncInProgress = false;
  private initPromise: Promise<void> | null = null;

  static getInstance(): OfflineSyncManager {
    if (!OfflineSyncManager.instance) {
      OfflineSyncManager.instance = new OfflineSyncManager();
    }
    return OfflineSyncManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.db) return;
    if (this.initPromise) return this.initPromise;

    if (typeof window === 'undefined') return;

    this.initPromise = openDB<AgrimarcheDB>('AgrimarcheOffline', 2, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingOrders')) {
          const s = db.createObjectStore('pendingOrders', { keyPath: 'id' });
          s.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('pendingCart')) {
          db.createObjectStore('pendingCart', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('syncQueue')) {
          const s = db.createObjectStore('syncQueue', { keyPath: 'id' });
          s.createIndex('by-type', 'type');
        }
      },
    })
      .then((database) => {
        this.db = database;
      })
      .catch((err) => {
        console.warn('[OfflineSync] IndexedDB not available:', err);
        this.initPromise = null;
      });

    return this.initPromise;
  }

  private async getDB(): Promise<IDBPDatabase<AgrimarcheDB> | null> {
    if (!this.db) await this.initialize();
    return this.db;
  }

  async queueOrder(order: unknown): Promise<void> {
    const db = await this.getDB();
    if (!db) return;
    await db.add('pendingOrders', {
      id: `order_${Date.now()}`,
      order,
      timestamp: Date.now(),
      retryCount: 0,
    });
  }

  async queueCartUpdate(cart: unknown): Promise<void> {
    const db = await this.getDB();
    if (!db) return;
    await db.put('pendingCart', { id: `cart_${Date.now()}`, cart, timestamp: Date.now() });
  }

  async syncAllPending(): Promise<void> {
    if (this.syncInProgress || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    this.syncInProgress = true;
    try {
      // Extension point: implement real sync here
    } catch (err) {
      console.error('[OfflineSync]', err);
    } finally {
      this.syncInProgress = false;
    }
  }

  async getPendingOrdersCount(): Promise<number> {
    const db = await this.getDB();
    if (!db) return 0;
    const orders = await db.getAll('pendingOrders');
    return orders.filter((o) => !o.failed).length;
  }

  async clearAllPending(): Promise<void> {
    const db = await this.getDB();
    if (!db) return;
    await db.clear('pendingOrders');
    await db.clear('pendingCart');
  }
}

export const offlineSync = OfflineSyncManager.getInstance();

