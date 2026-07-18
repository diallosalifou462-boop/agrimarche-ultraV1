'use client';

// src/hooks/useWhatsAppAuth.ts
import { useState, useCallback } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return `+${digits}`;
}

export function useWhatsAppAuth() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestOtp = useCallback(async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const call = httpsCallable(functions, 'requestWhatsAppOtp');
      await call({ phone: toE164(phone) });
      return true;
    } catch (e: any) {
      setError(e?.message || "Échec de l'envoi du code");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const verifyOtp = useCallback(async (phone: string, code: string) => {
    setLoading(true);
    setError(null);
    try {
      const functions = getFunctions();
      const call = httpsCallable(functions, 'verifyWhatsAppOtp');
      const result = await call({ phone: toE164(phone), code });
      const { customToken } = result.data as { customToken: string };
      await signInWithCustomToken(auth, customToken);
      return true;
    } catch (e: any) {
      setError(e?.message || 'Code incorrect');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { requestOtp, verifyOtp, loading, error };
}
