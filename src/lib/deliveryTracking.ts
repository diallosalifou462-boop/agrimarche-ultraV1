// lib/deliveryTracking.ts

import { db } from './firebase/firebase';
import { doc, updateDoc, Timestamp } from 'firebase/firestore';

// Liste des étapes de livraison
export const DELIVERY_STEPS = [
  { label: 'Commande validée', description: 'Votre commande a été confirmée', icon: '✅' },
  { label: 'Préparation', description: 'Le vendeur prépare votre colis', icon: '📦' },
  { label: 'Prêt à expédier', description: 'Colis prêt, en attente du transporteur', icon: '📭' },
  { label: 'Pris en charge', description: 'Le transporteur a récupéré votre colis', icon: '🚚' },
  { label: 'En transit', description: 'Votre colis est en route', icon: '🚛' },
  { label: 'Arrivé à destination', description: 'Colis arrivé dans votre région', icon: '📍' },
  { label: 'Livré', description: 'Colis livré avec succès', icon: '🎉' },
];

// Mettre à jour une étape de livraison
export const updateDeliveryStep = async (
  orderId: string,
  stepKey: string,
  completed: boolean
) => {
  const orderRef = doc(db, 'orders', orderId);
  
  await updateDoc(orderRef, {
    [`deliverySteps.${stepKey}.completed`]: completed,
    [`deliverySteps.${stepKey}.timestamp`]: new Date(),
    deliveryStatus: stepKey,
  });
  
  return true;
};

// Initialiser le suivi d'une commande
export const initDeliveryTracking = async (orderId: string) => {
  const orderRef = doc(db, 'orders', orderId);
  
  const initialSteps = {
    pending: { completed: true, timestamp: new Date() },
    preparing: { completed: false, timestamp: null },
    ready: { completed: false, timestamp: null },
    picked_up: { completed: false, timestamp: null },
    in_transit: { completed: false, timestamp: null },
    arrived: { completed: false, timestamp: null },
    delivered: { completed: false, timestamp: null },
  };
  
  await updateDoc(orderRef, {
    deliveryStatus: 'pending',
    deliverySteps: initialSteps,
  });
  
  return true;
};

// Date estimée de livraison (J+3)
export const getEstimatedDeliveryDate = (orderDate: Date): Date => {
  const estimated = new Date(orderDate);
  estimated.setDate(estimated.getDate() + 3);
  return estimated;
};