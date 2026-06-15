// src/types/orders.ts
// Kept for legacy compatibility; canonical types are in src/types/index.ts
export type { OrderStatus } from './index';

export interface MarketplaceOrder {
  id: string;
  userId: string;
  sellerId: string;
  productId: string;
  quantity: number;
  total: number;
  status: import('./index').OrderStatus;
  createdAt: number;
}
