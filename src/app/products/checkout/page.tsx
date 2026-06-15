'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';

const SENEGAL_REGIONS = [
  'Dakar', 'Thiès', 'Saint-Louis', 'Diourbel', 'Louga',
  'Tambacounda', 'Kaolack', 'Ziguinchor', 'Kolda', 'Fatick',
  'Kaffrine', 'Kédougou', 'Matam', 'Sédhiou',
];

export default function CheckoutPage() {
  const router = useRouter();
  const { cart, clearCart } = useCart();
  const { user} = useAuth();

  const [form, setForm] = useState({
  street: '',
  city: '',
 region: 'Dakar',
  phone: user?.phoneNumber ?? '',
  notes: '',
  paymentMethod: 'cash',
});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (cart.items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="text-6xl">🛒</div>
        <p className="font-semibold text-gray-700">Votre panier est vide</p>
        <Link href="/main/products" className="text-green-600 hover:underline text-sm">← Retour aux produits</Link>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!form.street || !form.city) { setError('Veuillez remplir l\'adresse de livraison.'); return; }
    if (!user) { router.push('/auth/login?redirect=/checkout'); return; }
    setLoading(true);
    setError('');
    try {
      // FIX: extract unique sellerIds from cart items so seller/orders query works
      const sellerIds = [...new Set(cart.items.map(i => i.product.sellerId).filter(Boolean))];

      const order = {
        userId: user.uid,
        // FIX: add sellerId (first seller) + sellerIds array for multi-seller support
        sellerId: sellerIds[0] ?? null,
        sellerIds,
        items: cart.items,
        total: cart.total,
        status: 'pending',
        deliveryAddress: { street: form.street, city: form.city, region: form.region, country: 'Sénégal' },
        paymentMethod: form.paymentMethod,
        paymentStatus: 'pending',
        notes: form.notes || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, 'orders'), order);
      clearCart();
      router.push(`/orders?success=${ref.id}`);
    } catch (err) {
      console.error(err);
      setError('Erreur lors de la commande. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const up = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-gray-50 pb-24 md:pb-8">
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/cart" className="text-gray-400 hover:text-gray-600 transition">←</Link>
          <h1 className="font-bold text-gray-900">Finaliser la commande</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Récap panier */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Récapitulatif ({cart.itemCount} article{cart.itemCount > 1 ? 's' : ''})</h2>
          <div className="space-y-2">
            {cart.items.map(item => (
              <div key={item.product.id} className="flex justify-between text-sm">
                <span className="text-gray-600">{item.product.name} × {item.quantity}</span>
                <span className="font-medium">{(item.product.price * item.quantity).toLocaleString()} FCFA</span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-bold">
              <span>Total</span>
              <span className="text-green-700">{cart.total.toLocaleString()} FCFA</span>
            </div>
          </div>
        </div>

        {/* Adresse livraison */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">Adresse de livraison</h2>
          <input
            value={form.street}
            onChange={e => up('street', e.target.value)}
            placeholder="Rue, quartier, numéro…"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            value={form.city}
            onChange={e => up('city', e.target.value)}
            placeholder="Ville"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={form.region}
            onChange={e => up('region', e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500 bg-white"
          >
            {SENEGAL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <input
            value={form.phone}
            onChange={e => up('phone', e.target.value)}
            placeholder="Téléphone (+221…)"
            type="tel"
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {/* Paiement */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
          <h2 className="font-semibold text-gray-900">Mode de paiement</h2>
          {[
            { value: 'cash', label: '💵 Paiement à la livraison', desc: 'Payez en espèces à réception' },
            { value: 'orange_money', label: '🟠 Orange Money', desc: 'Paiement mobile sécurisé' },
            { value: 'wave', label: '🌊 Wave', desc: 'Transfert Wave rapide' },
          ].map(opt => (
            <label key={opt.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${form.paymentMethod === opt.value ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:bg-gray-50'}`}>
              <input type="radio" name="payment" value={opt.value} checked={form.paymentMethod === opt.value} onChange={e => up('paymentMethod', e.target.value)} className="mt-0.5 accent-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Notes (optionnel)</h2>
          <textarea
            value={form.notes}
            onChange={e => up('notes', e.target.value)}
            placeholder="Instructions spéciales pour la livraison…"
            rows={2}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
        </div>

        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-2xl transition flex items-center justify-center gap-2 text-base disabled:opacity-70"
        >
          {loading ? (
            <><span className="animate-spin">⏳</span> Commande en cours…</>
          ) : (
            <>✅ Confirmer la commande · {cart.total.toLocaleString()} FCFA</>
          )}
        </button>
      </div>
    </div>
  );
}
