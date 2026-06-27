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

// ─── Helper : numéro → email synthétique ─────────────────
export function phoneToEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@agrimarche.sn`;
}

export function useAuth() {
  const [user, setUser]       = useState<User | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // ─── Chargement profil Firestore ──────────────────────
  const fetchUserProfile = async (uid: string, email: string | null) => {
    try {
      const userRef  = doc(db, 'users', uid);
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

  // ─── Mise à jour profil ───────────────────────────────
  const updateUserProfile = async (data: { displayName?: string; phone?: string }) => {
    if (!user) throw new Error('Aucun utilisateur connecté');
    if (data.displayName) await updateProfile(user, { displayName: data.displayName });
    const userRef = doc(db, 'users', user.uid);
    await updateDoc(userRef, data);
    setProfile((prev: any) => ({ ...prev, ...data }));
  };

  // ─── Reset mot de passe (legacy email — non utilisé en prod) ──
  const resetPassword = async (email: string) => {
    return sendPasswordResetEmail(auth, email);
  };

  // ─── Observer Firebase Auth ───────────────────────────
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

  // ─── Connexion ────────────────────────────────────────
  // Accepte soit un email réel, soit un numéro de téléphone.
  // Si c'est un numéro, on le convertit en email synthétique.
  const signIn = async (emailOrPhone: string, password: string) => {
    const email = emailOrPhone.includes('@')
      ? emailOrPhone
      : phoneToEmail(emailOrPhone);
    const result = await signInWithEmailAndPassword(auth, email, password);
    await fetchUserProfile(result.user.uid, result.user.email);
    return result;
  };

  // ─── Inscription ──────────────────────────────────────
  // `extra` contient phone, région, département, commune, phoneVerified, etc.
  const signUp = async (
    emailOrPhone: string,
    password: string,
    name: string,
    extra?: Record<string, any>,
  ) => {
    const email = emailOrPhone.includes('@')
      ? emailOrPhone
      : phoneToEmail(emailOrPhone);

    const result = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(result.user, { displayName: name });

    const userProfile = {
      uid:           result.user.uid,
      email,
      displayName:   name,
      phone:         extra?.phone        ?? '',
      phoneVerified: extra?.phoneVerified ?? false,
      role:          extra?.role         ?? 'client',
      region:        extra?.region       ?? '',
      departement:   extra?.departement  ?? '',
      commune:       extra?.commune      ?? '',
      quartier:      extra?.quartier     ?? '',
      createdAt:     new Date().toISOString(),
    };

    await setDoc(doc(db, 'users', result.user.uid), userProfile);
    setProfile(userProfile);
    return result;
  };

  // ─── Déconnexion ──────────────────────────────────────
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
    phoneToEmail,
  };
}
