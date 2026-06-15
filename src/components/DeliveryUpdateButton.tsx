'use client';

import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { Truck, MapPin, CheckCircle, Loader2 } from 'lucide-react';
import React from 'react';

interface DeliveryUpdateButtonProps {
  orderId: string;
  currentStep?: string;
  onUpdate?: () => void;
}

interface DeliveryStep {
  completed: boolean;
  timestamp: string | null;  // ✅ Accepter string ou null
}

const DELIVERY_STEPS = [
  { id: 'pending', label: 'En attente', icon: Truck },
  { id: 'preparing', label: 'Préparation', icon: Truck },
  { id: 'shipped', label: 'Expédié', icon: Truck },
  { id: 'out_for_delivery', label: 'En livraison', icon: MapPin },
  { id: 'delivered', label: 'Livré', icon: CheckCircle },
];

export default function DeliveryUpdateButton({ 
  orderId, 
  currentStep = 'pending', 
  onUpdate 
}: DeliveryUpdateButtonProps) {
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const currentStepIndex = DELIVERY_STEPS.findIndex(s => s.id === currentStep);
  const nextSteps = DELIVERY_STEPS.slice(currentStepIndex + 1);

  const updateDeliveryStep = async (stepId: string) => {
    setLoading(true);
    try {
      const orderRef = doc(db, 'orders', orderId);
      
      // ✅ Initialiser les étapes de livraison avec timestamp: null
      const deliverySteps: Record<string, DeliveryStep> = {
        pending: { completed: false, timestamp: null },
        preparing: { completed: false, timestamp: null },
        shipped: { completed: false, timestamp: null },
        out_for_delivery: { completed: false, timestamp: null },
        delivered: { completed: false, timestamp: null },
      };

      // ✅ Marquer toutes les étapes jusqu'à stepId inclus comme complétées
      const stepIndex = DELIVERY_STEPS.findIndex(s => s.id === stepId);
      for (let i = 0; i <= stepIndex; i++) {
        const step = DELIVERY_STEPS[i];
        deliverySteps[step.id] = {
          completed: true,
          timestamp: new Date().toISOString(),
        };
      }

      await updateDoc(orderRef, {
        deliveryStatus: stepId,
        deliverySteps: deliverySteps,
        updatedAt: new Date().toISOString(),
      });

      setShowModal(false);
      if (onUpdate) onUpdate();
      alert(`✅ Statut de livraison mis à jour : ${DELIVERY_STEPS.find(s => s.id === stepId)?.label}`);
    } catch (error) {
      console.error('Erreur mise à jour livraison:', error);
      alert('Erreur lors de la mise à jour');
    } finally {
      setLoading(false);
    }
  };

  if (nextSteps.length === 0) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="px-4 py-2 bg-emerald-500 text-white rounded-xl text-sm font-medium hover:bg-emerald-600 transition disabled:opacity-50 flex items-center gap-2"
      >
        <Truck size={16} />
        Mettre à jour livraison
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">
              Mise à jour de la livraison
            </h3>
            
            <div className="space-y-2 mb-6">
              {nextSteps.map((step) => {
                const Icon = step.icon;
                return (
                  <button
                    key={step.id}
                    onClick={() => updateDeliveryStep(step.id)}
                    disabled={loading}
                    className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-emerald-300 hover:bg-emerald-50 transition disabled:opacity-50"
                  >
                    <Icon size={20} className="text-emerald-500" />
                    <span className="flex-1 text-left font-medium text-gray-700">
                      {step.label}
                    </span>
                    {loading && <Loader2 size={16} className="animate-spin text-emerald-500" />}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setShowModal(false)}
              className="w-full px-4 py-2 border border-gray-300 text-gray-600 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}