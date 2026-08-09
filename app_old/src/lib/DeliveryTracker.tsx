// components/DeliveryTracker.tsx

'use client';

import { CheckCircle, Package, Truck, MapPin, Clock } from 'lucide-react';

interface DeliveryStep {
  label: string;
  description: string;
  icon: string;
  completed: boolean;
  timestamp: Date | null;
}

interface DeliveryTrackerProps {
  steps: DeliveryStep[];
  currentStatus: string;
  estimatedDate?: Date;
}

export default function DeliveryTracker({ steps, currentStatus, estimatedDate }: DeliveryTrackerProps) {
  const completedCount = steps.filter(s => s.completed).length;
  const isCompleted = currentStatus === 'delivered';

  return (
    <div className="bg-white rounded-2xl shadow-md border overflow-hidden">
      {/* En-tête */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm">Suivi de livraison</h3>
            {estimatedDate && !isCompleted && (
              <p className="text-emerald-100 text-[10px] mt-0.5">
                📅 Livraison estimée : {estimatedDate.toLocaleDateString('fr-FR')}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xl font-black">{completedCount}/{steps.length}</p>
            <p className="text-[8px] text-emerald-100">étapes</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-4">
        <div className="space-y-3">
          {steps.map((step, idx) => {
            const isActive = step.completed;
            const isCurrent = idx === completedCount && !isCompleted;
            
            return (
              <div key={step.label} className="flex items-center gap-3">
                {/* Icône */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                  isActive ? 'bg-emerald-500 text-white' :
                  isCurrent ? 'bg-amber-500 text-white animate-pulse' :
                  'bg-gray-100 text-gray-400'
                }`}>
                  {isActive ? <CheckCircle size={12} /> : <span className="text-xs">{step.icon}</span>}
                </div>
                
                {/* Texte */}
                <div className="flex-1">
                  <p className={`text-xs font-semibold ${isActive ? 'text-gray-800' : 'text-gray-400'}`}>
                    {step.label}
                  </p>
                  <p className="text-[9px] text-gray-400">{step.description}</p>
                </div>
                
                {/* Badge "en cours" */}
                {isCurrent && (
                  <div className="flex items-center gap-0.5 px-1.5 py-0.5 bg-amber-100 rounded-full">
                    <Clock size={8} className="text-amber-600" />
                    <span className="text-[7px] font-medium text-amber-600">En cours</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
