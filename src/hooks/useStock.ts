'use client';

import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase'; // ✅ Correction : @/lib au lieu de @lib

export function useStock(productId: string) {
  const [stock, setStock] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!productId) return;

    const unsubscribe = onSnapshot(doc(db, 'stocks', productId), (doc) => {
      if (doc.exists()) {
        setStock(doc.data().quantity);
      } else {
        setStock(0);
      }
      setLoading(false);
    }, (error) => {
      console.error('Erreur stock:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [productId]);

  const decreaseStock = useCallback(async (quantity: number) => {
    if (!productId) return false;
    try {
      await updateDoc(doc(db, 'stocks', productId), {
        quantity: increment(-quantity)
      });
      return true;
    } catch (error) {
      console.error('Erreur mise à jour stock:', error);
      return false;
    }
  }, [productId]);

  const increaseStock = useCallback(async (quantity: number) => {
    if (!productId) return false;
    try {
      await updateDoc(doc(db, 'stocks', productId), {
        quantity: increment(quantity)
      });
      return true;
    } catch (error) {
      console.error('Erreur mise à jour stock:', error);
      return false;
    }
  }, [productId]);

  return { stock, loading, decreaseStock, increaseStock };
}
