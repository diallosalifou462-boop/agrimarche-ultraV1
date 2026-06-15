'use client';

import { useEffect, useState } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/firebase';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchUserProfile = async (uid: string, email: string | null) => {
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        setProfile(userSnap.data());
      } else {
        const defaultProfile = {
          uid,
          email,
          displayName: '',
          phone: '',
          role: 'client',
          createdAt: new Date().toISOString(),
        };
        await setDoc(userRef, defaultProfile);
        setProfile(defaultProfile);
      }
    } catch (error) {
      console.error('Erreur chargement profil:', error);
    }
  };

  const updateUserProfile = async (data: { displayName?: string; phone?: string }) => {
    if (!user) throw new Error('Aucun utilisateur connecte');
    
    try {
      if (data.displayName) {
        await updateProfile(user, { displayName: data.displayName });
      }
      
      const userRef = doc(db, 'users', user.uid);
      await updateDoc(userRef, data);
      setProfile((prev: any) => ({ ...prev, ...data }));
    } catch (error) {
      console.error('Erreur mise a jour:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        await fetchUserProfile(firebaseUser.uid, firebaseUser.email);
      } else {
        setProfile(null);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserProfile(result.user.uid, result.user.email);
    return result;
  };

  const signUp = async (email: string, password: string, name: string) => {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    
    await updateProfile(result.user, { displayName: name });
    
    const userRef = doc(db, 'users', result.user.uid);
    const userProfile = {
      uid: result.user.uid,
      email: email,
      displayName: name,
      phone: '',
      role: 'client',
      createdAt: new Date().toISOString(),
    };
    await setDoc(userRef, userProfile);
    
    setProfile(userProfile);
    return result;
  };

  const logout = async () => {
    await signOut(auth);
    setProfile(null);
    setUser(null);
  };

  return {
    user,
    profile,
    loading,
    signIn,
    signUp,
    logout,
    updateUserProfile,
    resetPassword,
  };
}