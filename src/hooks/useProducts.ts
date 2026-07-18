"use client";

import { useState, useEffect, useCallback } from 'react';
import { collection, query, getDocs, where, orderBy, limit, startAfter } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export function useProducts(filters: any = {}) {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [lastDoc, setLastDoc] = useState<any>(null);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(20));
      
      // Ajouter des filtres si nécessaire
      if (filters.category) {
        q = query(q, where('category', '==', filters.category));
      }
      if (filters.region) {
        q = query(q, where('region', '==', filters.region));
      }
      
      const snapshot = await getDocs(q);
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setProducts(productsData);
      setHasMore(productsData.length === 20);
      if (productsData.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.region]);

  const loadMore = useCallback(async () => {
    if (!lastDoc || !hasMore) return;
    
    setLoading(true);
    try {
      let q = query(collection(db, 'products'), orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(20));
      
      if (filters.category) {
        q = query(q, where('category', '==', filters.category));
      }
      if (filters.region) {
        q = query(q, where('region', '==', filters.region));
      }
      
      const snapshot = await getDocs(q);
      const newProducts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setProducts(prev => [...prev, ...newProducts]);
      setHasMore(newProducts.length === 20);
      if (newProducts.length > 0) {
        setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [lastDoc, hasMore, filters.category, filters.region]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  return {
    products,
    loading,
    error,
    hasMore,
    loadMore,
  };
}
