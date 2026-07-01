// src/lib/payment/paytech.ts
// Client côté front pour initier les paiements mobile
import { auth } from '@/lib/firebase/firebase';

export type PaymentMethod = 'wave_sn' | 'orange_money_sn';

export interface InitiatePaymentParams {
  orderId: string;
  method: PaymentMethod;
}

export interface InitiatePaymentResult {
  paymentUrl: string;
  token?: string;
  simulated?: boolean;
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001';

/**
 * Initie un paiement mobile via le backend Agrimarche.
 */
export async function initiatePayment(
  params: InitiatePaymentParams
): Promise<InitiatePaymentResult> {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté');

  const idToken = await user.getIdToken();

  const res = await fetch(`${BACKEND_URL}/api/payments/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur initialisation paiement');
  }

  return res.json();
}

/**
 * Vérifie le statut d'un paiement
 */
export async function getPaymentStatus(orderId: string) {
  const user = auth.currentUser;
  if (!user) throw new Error('Utilisateur non connecté');

  const idToken = await user.getIdToken();

  const res = await fetch(`${BACKEND_URL}/api/payments/status/${orderId}`, {
    headers: { 'Authorization': `Bearer ${idToken}` },
  });

  if (!res.ok) throw new Error('Impossible de récupérer le statut');
  return res.json();
}

export const PAYMENT_METHODS = [
  {
    id: 'wave_sn' as PaymentMethod,
    name: 'Wave',
    icon: '🌊',
    description: 'Paiement instantané via Wave',
    color: '#1DC9FF',
  },
  {
    id: 'orange_money_sn' as PaymentMethod,
    name: 'Orange Money',
    icon: '🟠',
    description: 'Paiement via Orange Money',
    color: '#FF6600',
  },
] as const;

