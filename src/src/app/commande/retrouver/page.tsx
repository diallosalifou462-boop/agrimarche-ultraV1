'use client';

// ============================================================
//   /commande/retrouver — accès invité, sans SMS, sans mot de passe
// ============================================================
// Parcours (règles #3, #11, #12 du cahier des charges) :
//   1. Le client tape son numéro de téléphone (celui du checkout).
//   2. On lui montre SES commandes actives (résumé, jamais le code) pour
//      qu'il confirme laquelle est la sienne — friction volontairement
//      minimale, la vraie barrière étant la présence physique du livreur.
//   3. Une fois confirmée, un compte invité est créé/retrouvé et une
//      session s'ouvre automatiquement (signInWithCustomToken) — aucun
//      mot de passe, aucun SMS. Le client est ensuite redirigé vers sa
//      commande, où le code (déjà généré par claimOrder) l'attend.
//
// ⚠️ Dépendance non résolue à ce stade : le checkout doit écrire
// `guestPhone` sur la commande pour un achat sans compte — voir la note
// de fin de réponse.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { findGuestOrders, claimGuestOrderSession, GuestOrderSummary, DeliveryCodeError } from '@/lib/deliveryCodeActions';
import { formatFCFA } from '@/lib/orderStatus';

export default function RetrouverCommandePage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [step, setStep] = useState<'phone' | 'choose'>('phone');
  const [orders, setOrders] = useState<GuestOrderSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (phone.trim().length < 8) {
      setError('Entrez le numéro utilisé lors de votre commande.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const found = await findGuestOrders(phone);
      if (found.length === 0) {
        setError("Aucune commande en cours trouvée avec ce numéro. Vérifiez qu'il s'agit bien du numéro donné à la commande.");
        return;
      }
      setOrders(found);
      setStep('choose');
    } catch (e) {
      setError(e instanceof DeliveryCodeError ? e.message : 'Erreur de connexion. Réessayez.');
    } finally {
      setLoading(false);
    }
  };

  const handleChoose = async (orderId: string) => {
    setClaimingId(orderId);
    setError(null);
    try {
      await claimGuestOrderSession(orderId, phone);
      router.push(`/account/orders?id=${orderId}`);
    } catch (e) {
      setError(e instanceof DeliveryCodeError ? e.message : 'Erreur de connexion. Réessayez.');
      setClaimingId(null);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420, marginTop: 24 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#C9A96E', textTransform: 'uppercase', textAlign: 'center' }}>
          AgriMarché
        </p>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1A1A', textAlign: 'center', margin: '6px 0 6px' }}>
          Retrouver ma commande
        </h1>
        <p style={{ fontSize: 13, color: '#9A9A9A', textAlign: 'center', marginBottom: 28, lineHeight: 1.5 }}>
          Pas besoin de compte pour récupérer votre code de livraison —
          juste le numéro que vous avez donné à la commande.
        </p>

        {step === 'phone' && (
          <>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ex. 77 123 45 67"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12,
                border: '1px solid #e5e0d5', fontSize: 15, color: '#1A1A1A', marginBottom: 12,
              }}
            />
            {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginBottom: 12, lineHeight: 1.4 }}>{error}</p>}
            <button
              onClick={handleSearch}
              disabled={loading}
              style={{
                width: '100%', padding: '15px', borderRadius: 12, border: 'none',
                background: loading ? '#d6c6a3' : '#C9A96E', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Recherche…' : 'Retrouver ma commande'}
            </button>
          </>
        )}

        {step === 'choose' && (
          <>
            <p style={{ fontSize: 12.5, color: '#6b6b6b', marginBottom: 12 }}>
              Confirmez : laquelle est votre commande ?
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {orders.map((o) => (
                <button
                  key={o.orderId}
                  onClick={() => handleChoose(o.orderId)}
                  disabled={claimingId !== null}
                  style={{
                    textAlign: 'left', padding: '14px 16px', borderRadius: 14,
                    border: '1px solid #e5e0d5', background: '#fff',
                    cursor: claimingId ? 'not-allowed' : 'pointer', opacity: claimingId && claimingId !== o.orderId ? 0.5 : 1,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>{o.summary}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#9A9A9A' }}>
                    {o.sellerName ? `${o.sellerName} · ` : ''}{o.total !== null ? formatFCFA(o.total) : ''}
                  </p>
                  {claimingId === o.orderId && (
                    <p style={{ margin: '6px 0 0', fontSize: 12, color: '#C9A96E' }}>Ouverture de votre commande…</p>
                  )}
                </button>
              ))}
            </div>
            {error && <p style={{ color: '#dc2626', fontSize: 12.5, marginTop: 12, lineHeight: 1.4 }}>{error}</p>}
            <button
              onClick={() => { setStep('phone'); setOrders([]); setError(null); }}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#9A9A9A', fontSize: 12.5, cursor: 'pointer', width: '100%' }}
            >
              Ce n'est pas mon numéro, recommencer
            </button>
          </>
        )}
      </div>
    </div>
  );
}
