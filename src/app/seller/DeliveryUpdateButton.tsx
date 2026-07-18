'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Truck } from 'lucide-react';

const STEPS = [
  { key: 'pending',    label: 'En attente' },
  { key: 'picked_up',  label: 'Récupérée' },
  { key: 'in_transit', label: 'En livraison' },
  { key: 'delivered',  label: 'Livrée' },
];

interface Props {
  orderId: string;
  currentStep: string;
  onUpdate?: () => void;
}

export default function DeliveryUpdateButton({ orderId, currentStep, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const currentIndex = STEPS.findIndex(s => s.key === currentStep);
  const nextStep = STEPS[currentIndex + 1];

  if (!nextStep) return null;

  const handleClick = async () => {
    setLoading(true);
    try {
      await updateDoc(doc(db, 'orders', orderId), {
        deliveryStatus: nextStep.key,
        deliveryUpdatedAt: new Date().toISOString(),
      });
      onUpdate?.();
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la mise à jour du suivi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="px-4 py-2 border border-emerald-300 text-emerald-700 rounded-xl text-sm font-medium hover:bg-emerald-50 transition disabled:opacity-50 flex items-center gap-2"
    >
      <Truck className="w-4 h-4" />
      {loading ? '…' : `Marquer : ${nextStep.label}`}
    </button>
  );
}

