'use client';

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db, UserProfile } from './firebase';

export function useRealtimeUser(uid: string | null) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!uid) {
      setLoading(false);
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', uid), (snapshot) => {
      if (snapshot.exists()) {
        setUser(snapshot.data() as UserProfile);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [uid]);

  return { user, loading };
}