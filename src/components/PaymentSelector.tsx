'use client';

import { useState } from 'react';
import { initiatePayment, PAYMENT_METHODS, PaymentMethod } from '@/lib/payment/paytech';

interface PaymentSelectorProps {
  orderId: string;
  total: number;
  onSuccess?: (paymentUrl: string) => void;
  onError?: (error: string) => void;
}

export function PaymentSelector({ orderId, total, onSuccess, onError }: PaymentSelectorProps) {
  const [selected, setSelected]   = useState<PaymentMethod>('wave_sn');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await initiatePayment({ orderId, method: selected });
      if (onSuccess) onSuccess(result.paymentUrl);
      // Redirection vers la page de paiement mobile
      window.location.href = result.paymentUrl;
    } catch (err: any) {
      const msg = err.message || 'Erreur paiement';
      setError(msg);
      if (onError) onError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-gray-900 text-lg">Choisir le mode de paiement</h3>

      <div className="grid grid-cols-2 gap-3">
        {PAYMENT_METHODS.map(method => (
          <button
            key={method.id}
            type="button"
            onClick={() => setSelected(method.id)}
            className={`flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition
              ${selected === method.id
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-gray-300 bg-white'}`}
          >
            <span className="text-3xl">{method.icon}</span>
            <span className="font-semibold text-sm text-gray-900">{method.name}</span>
            <span className="text-xs text-gray-500 text-center">{method.description}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      <div className="bg-gray-50 rounded-xl p-4">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Total à payer</span>
          <span className="font-bold text-gray-900 text-base">
            {total.toLocaleString()} FCFA
          </span>
        </div>
        <p className="text-xs text-gray-400">
          Vous serez redirigé vers{' '}
          {selected === 'wave_sn' ? 'Wave' : 'Orange Money'} pour finaliser le paiement.
        </p>
      </div>

      <button
        onClick={handlePay}
        disabled={loading}
        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-4 rounded-2xl transition disabled:opacity-60 disabled:cursor-not-allowed text-base"
      >
        {loading
          ? 'Redirection en cours…'
          : `Payer ${total.toLocaleString()} FCFA avec ${selected === 'wave_sn' ? 'Wave 🌊' : 'Orange Money 🟠'}`}
      </button>

      <p className="text-center text-xs text-gray-400">
        🔒 Paiement sécurisé via PayTech · Certifié PCI-DSS
      </p>
    </div>
  );
}
