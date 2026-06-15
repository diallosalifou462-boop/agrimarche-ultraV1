'use client';

import { useState, useEffect } from 'react';
import { MapPin, Truck, Package, CheckCircle, Clock, Box, Navigation } from 'lucide-react';
import React from 'react';

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
  estimatedDate?: Date | string | any;
}

// ✅ CORRECTION : Remplacer JSX.Element par React.ReactNode
const stepIcons: Record<string, React.ReactNode> = {
  'Commande validée': React.createElement(CheckCircle, { size: 16 }),
  'Préparation': React.createElement(Package, { size: 16 }),
  'Prêt à expédier': React.createElement(Box, { size: 16 }),
  'Pris en charge': React.createElement(Truck, { size: 16 }),
  'En transit': React.createElement(Truck, { size: 16 }),
  'Arrivé à destination': React.createElement(MapPin, { size: 16 }),
  'Livré': React.createElement(CheckCircle, { size: 16 }),
};

// Fonction pour formater la date de manière sécurisée
const formatDate = (date: any): string => {
  if (!date) return 'Date inconnue';
  
  // Si c'est déjà un objet Date
  if (date instanceof Date && !isNaN(date.getTime())) {
    return date.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  
  // Si c'est un Timestamp Firestore
  if (date?.toDate && typeof date.toDate === 'function') {
    const d = date.toDate();
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  }
  
  // Si c'est une string ou un nombre
  try {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    }
  } catch (e) {
    console.error('Erreur formatage date:', e);
  }
  
  return 'Date inconnue';
};

// Helper pour récupérer l'icône correspondante
const getStepIcon = (iconName: string, isCompleted: boolean) => {
  const Icon = stepIcons[iconName];
  if (Icon) {
    return Icon;
  }
  // Fallback par défaut
  return isCompleted ? 
    React.createElement(CheckCircle, { size: 18 }) : 
    React.createElement(Clock, { size: 16 });
};

export default function DeliveryTracker({ steps, currentStatus, estimatedDate }: DeliveryTrackerProps) {
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    const lastCompleted = [...steps].reverse().find(step => step.completed);
    if (lastCompleted) {
      const index = steps.findIndex(step => step.label === lastCompleted.label);
      setActiveStep(index);
    }
  }, [steps]);

  const isCompleted = currentStatus === 'delivered';
  const formattedEstimatedDate = formatDate(estimatedDate);

  return (
    <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
      {/* En-tête */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg">Suivi de livraison</h3>
            {estimatedDate && !isCompleted && formattedEstimatedDate !== 'Date inconnue' && (
              <p className="text-emerald-100 text-xs mt-1">
                📅 Livraison estimée : {formattedEstimatedDate}
              </p>
            )}
            {isCompleted && (
              <p className="text-emerald-100 text-xs mt-1 flex items-center gap-1">
                {React.createElement(CheckCircle, { size: 12 })} Livrée avec succès
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-2xl font-black">{steps.filter(s => s.completed).length}/{steps.length}</p>
            <p className="text-[9px] text-emerald-100">étapes</p>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="p-5">
        <div className="relative">
          {/* Ligne de connexion verticale */}
          <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gray-200" />
          
          {/* Étapes */}
          <div className="space-y-6 relative">
            {steps.map((step, index) => {
              const isActive = index <= activeStep;
              const isCurrent = index === activeStep && !step.completed;
              const isLast = index === steps.length - 1;
              
              return (
                <div key={`${step.label}-${index}`} className="relative flex gap-4">
                  {/* Cercle indicateur */}
                  <div className="relative z-10">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                        step.completed
                          ? 'bg-emerald-500 text-white shadow-md'
                          : isCurrent
                          ? 'bg-amber-500 text-white animate-pulse'
                          : 'bg-gray-100 text-gray-400'
                      }`}
                    >
                      {step.completed ? (
                        React.createElement(CheckCircle, { size: 18 })
                      ) : (
                        <span className="text-sm">
                          {getStepIcon(step.icon, step.completed)}
                        </span>
                      )}
                    </div>
                    {!isLast && (
                      <div
                        className={`absolute top-10 left-5 w-0.5 h-12 -translate-x-1/2 ${
                          step.completed ? 'bg-emerald-500' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>

                  {/* Contenu */}
                  <div className="flex-1 pb-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <p className={`font-semibold ${step.completed ? 'text-gray-800' : 'text-gray-500'}`}>
                        {step.label}
                      </p>
                      {step.timestamp && (
                        <p className="text-[9px] text-gray-400">
                          {new Date(step.timestamp).toLocaleDateString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{step.description}</p>
                    
                    {/* Indicateur "étape actuelle" */}
                    {isCurrent && (
                      <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 rounded-full">
                        {React.createElement(Clock, { size: 10, className: "text-amber-600" })}
                        <span className="text-[8px] font-medium text-amber-600">En cours</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}