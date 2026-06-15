// src/hooks/useSellerData.ts
import { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from './useAuth';
import type { SellerStats, SellerEarnings, Order, Product } from '@/types';

interface SellerData {
  stats: SellerStats;
  orders: { recent: Order[] };
  products: { top: Product[]; lowStock: Product[] };
  earnings: SellerEarnings;
  loading: boolean;
}

const defaultStats: SellerStats = {
  orders: 0, ordersChange: 0,
  productsSold: 0, productsSoldChange: 0,
  rating: 0, ratingChange: 0,
};
const defaultEarnings: SellerEarnings = { total: 0, change: 0, history: [] };

export function useSellerData(): SellerData {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SellerStats>(defaultStats);
  const [earnings, setEarnings] = useState<SellerEarnings>(defaultEarnings);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [topProducts, setTopProducts] = useState<Product[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<Product[]>([]);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    // FIX: use 'sellerIds' array-contains (matches checkout write) instead of 'sellerId' ==
    const ordersQ = query(
      collection(db, 'orders'),
      where('sellerIds', 'array-contains', user.uid),
      orderBy('createdAt', 'desc'),
      limit(10)
    );

    const unsubOrders = onSnapshot(
      ordersQ,
      (snap) => {
        const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
        setRecentOrders(orders);
        const totalEarnings = orders.reduce((sum, o) => sum + o.total, 0);
        const productsSold = orders.reduce(
          (sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0),
          0
        );
        setStats((prev) => ({ ...prev, orders: orders.length, productsSold }));
        setEarnings((prev) => ({ ...prev, total: totalEarnings }));
        setLoading(false);
      },
      (err) => {
        console.error('[useSellerData] orders listener error:', err);
        setLoading(false);
      }
    );

    // Top products by review count
    const topQ = query(
      collection(db, 'products'),
      where('sellerId', '==', user.uid),
      orderBy('reviewCount', 'desc'),
      limit(5)
    );
    getDocs(topQ)
      .then((snap) => setTopProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))))
      .catch(console.error);

    // FIX: add orderBy('stock') to match Firestore composite index requirement for inequality query
    const lowQ = query(
      collection(db, 'products'),
      where('sellerId', '==', user.uid),
      where('status', '==', 'active'),
      where('stock', '<', 10),
      orderBy('stock', 'asc')
    );
    getDocs(lowQ)
      .then((snap) => setLowStockProducts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Product))))
      .catch(console.error);

    return () => unsubOrders();
  }, [user]);

  return {
    stats,
    orders: { recent: recentOrders },
    products: { top: topProducts, lowStock: lowStockProducts },
    earnings,
    loading,
  };
}
