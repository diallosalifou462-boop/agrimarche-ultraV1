'use client';

import { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from './useAuth';

type UserRole = 'client' | 'vendor' | 'admin' | null;

export function useRole() {
  const { user } = useAuth();
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setRole(userDoc.data().role || 'client');
        } else {
          setRole('client');
        }
      } catch (error) {
        console.error('Erreur chargement rôle:', error);
        setRole('client');
      } finally {
        setLoading(false);
      }
    };

    fetchRole();
  }, [user]);

  const isClient = role === 'client';
  const isVendor = role === 'vendor';
  const isAdmin = role === 'admin';

  return { role, loading, isClient, isVendor, isAdmin };
}
