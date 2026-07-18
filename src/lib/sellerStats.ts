// lib/sellerStats.ts

import { db } from './firebase/firebase';
import {
  collection,
  query,
  where,
  getDocs,
  orderBy,
  Timestamp,
} from 'firebase/firestore';

export interface DailySales {
  date: string;
  amount: number;
  orders: number;
}

export interface TopProduct {
  id: string;
  name: string;
  price: number;
  sales: number;
  revenue: number;
  imageUrl: string;
}

export interface ConversionStats {
  totalVisitors: number;
  totalOrders: number;
  conversionRate: number;
}

// Récupérer les ventes par jour
export const getDailySales = async (
  sellerId: string,
  days: number = 30
): Promise<DailySales[]> => {
  const daysAgo = new Date();
  daysAgo.setDate(daysAgo.getDate() - days);

  const ordersQuery = query(
    collection(db, 'orders'),
    where('sellerId', '==', sellerId),
    where('createdAt', '>=', Timestamp.fromDate(daysAgo)),
    orderBy('createdAt', 'desc')
  );

  const snapshot = await getDocs(ordersQuery);
  const salesByDay: Record<string, DailySales> = {};

  // Initialiser les derniers jours
  for (let i = 0; i < days; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    salesByDay[dateStr] = { date: dateStr, amount: 0, orders: 0 };
  }

  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.createdAt?.toDate() || new Date();
    const dateStr = date.toISOString().split('T')[0];
    
    if (salesByDay[dateStr]) {
      salesByDay[dateStr].amount += data.total || 0;
      salesByDay[dateStr].orders += 1;
    }
  });

  return Object.values(salesByDay).sort((a, b) => a.date.localeCompare(b.date));
};

// Récupérer les meilleurs produits
export const getTopProducts = async (
  sellerId: string,
  limit: number = 10
): Promise<TopProduct[]> => {
  const productsQuery = query(
    collection(db, 'products'),
    where('sellerId', '==', sellerId)
  );

  const productsSnapshot = await getDocs(productsQuery);
  const products = productsSnapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as any[];

  const ordersQuery = query(
    collection(db, 'orders'),
    where('sellerId', '==', sellerId)
  );

  const ordersSnapshot = await getDocs(ordersQuery);
  const productSales: Record<string, { sales: number; revenue: number }> = {};

  ordersSnapshot.docs.forEach(doc => {
    const items = doc.data().items || [];
    items.forEach((item: any) => {
      const productId = item.productId;
      if (!productSales[productId]) {
        productSales[productId] = { sales: 0, revenue: 0 };
      }
      productSales[productId].sales += item.quantity;
      productSales[productId].revenue += item.total || (item.price * item.quantity);
    });
  });

  const topProducts = products
    .map(product => ({
      id: product.id,
      name: product.name,
      price: product.price,
      sales: productSales[product.id]?.sales || 0,
      revenue: productSales[product.id]?.revenue || 0,
      imageUrl: product.images?.[0] || '',
    }))
    .sort((a, b) => b.sales - a.sales)
    .slice(0, limit);

  return topProducts;
};

// Calculer le taux de conversion
export const getConversionRate = async (sellerId: string): Promise<ConversionStats> => {
  const ordersQuery = query(
    collection(db, 'orders'),
    where('sellerId', '==', sellerId)
  );
  const ordersSnapshot = await getDocs(ordersQuery);
  const totalOrders = ordersSnapshot.size;
  
  const estimatedVisitors = totalOrders * 100;
  const conversionRate = totalOrders > 0 ? (totalOrders / estimatedVisitors) * 100 : 0;

  return {
    totalVisitors: estimatedVisitors,
    totalOrders,
    conversionRate: Number(conversionRate.toFixed(1)),
  };
};

// Récupérer les statistiques mensuelles
export const getMonthlyStats = async (sellerId: string) => {
  const currentYear = new Date().getFullYear();
  const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
  
  const monthlyData = months.map((month, idx) => ({ 
    month, 
    monthIndex: idx,
    amount: 0, 
    orders: 0,
    formattedAmount: '0 FCFA'
  }));

  const ordersQuery = query(
    collection(db, 'orders'),
    where('sellerId', '==', sellerId),
    where('createdAt', '>=', Timestamp.fromDate(new Date(currentYear, 0, 1)))
  );

  const snapshot = await getDocs(ordersQuery);
  
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    const date = data.createdAt?.toDate() || new Date();
    if (date.getFullYear() === currentYear) {
      const monthIndex = date.getMonth();
      monthlyData[monthIndex].amount += data.total || 0;
      monthlyData[monthIndex].orders += 1;
    }
  });

  // Ajouter les formats
  return monthlyData.map(m => ({
    ...m,
    formattedAmount: m.amount.toLocaleString() + ' FCFA'
  }));
};
