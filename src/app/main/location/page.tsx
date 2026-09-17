'use client';

// « Mon adresse » — adresse de livraison par défaut du client.
// Avant : composant LiveLocation qui suivait le GPS en continu et réécrivait
// le profil toutes les minutes (y compris la position boutique d'un vendeur),
// avec un « mode manuel » qui ne permettait pas de déplacer le point.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, MapPin } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import LocationEditor from '@/components/LocationEditor';
import { cacheConfirmedLocation, readSavedDeliveryAddress, saveDeliveryAddress } from '@/lib/geo/userLocation';
import { getAnyCachedLocation } from '@/lib/locationCache';
import type { LocationRecord } from '@/lib/geo/quality';

export default function LocationPage() {
  const { user, profile, patchLocalProfile } = useAuth() as { user: { uid: string } | null; profile: any; patchLocalProfile?: (d: Record<string, any>) => void };
  const [current, setCurrent] = useState<LocationRecord | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const fromProfile = readSavedDeliveryAddress(profile);
    if (fromProfile) { setCurrent(fromProfile); return; }
    const cached = getAnyCachedLocation();
    if (cached && (cached as any).pinned) {
      setCurrent({
        lat: cached.lat,
        lng: cached.lng,
        accuracy: null,
        source: 'MANUAL_PIN',
        address: cached.address || cached.city || `${cached.lat.toFixed(5)}, ${cached.lng.toFixed(5)}`,
        city: cached.city,
        region: cached.region,
      });
    }
  }, [profile]);

  const isSeller = profile?.role === 'seller';

  const onConfirm = async (rec: LocationRecord) => {
    if (user?.uid && !profile?.isGuest) {
      await saveDeliveryAddress(user.uid, rec, profile?.role);
      patchLocalProfile?.({ deliveryLocation: { ...rec, updatedAt: Date.now() } });
    } else {
      cacheConfirmedLocation(rec);
    }
    setCurrent(rec);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F3] px-4 py-5">
      <div className="max-w-md mx-auto">
        <Link href="/main/products" className="inline-flex items-center gap-1 text-sm text-emerald-800 mb-4">
          <ArrowLeft size={16} /> Retour
        </Link>
        <h1 className="text-2xl font-extrabold text-emerald-900">Mon adresse de livraison</h1>
        <p className="text-sm text-emerald-800/70 mt-1 mb-5">
          Utilisée pour vos commandes et pour afficher les produits près de chez vous.
        </p>

        {isSeller && (
          <div className="mb-4 rounded-xl bg-amber-50 text-amber-800 text-xs p-3 leading-relaxed">
            Ceci est l’adresse où <strong>vous</strong> recevez vos achats. Votre point de retrait vendeur se modifie dans{' '}
            <Link href="/seller" className="underline font-semibold">votre espace vendeur</Link>.
          </div>
        )}

        {saved && (
          <div className="mb-4 rounded-xl bg-emerald-100 text-emerald-800 text-sm p-3 flex items-center gap-2">
            <CheckCircle2 size={16} /> Adresse enregistrée
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          {current && !editing ? (
            <div className="flex items-start gap-3">
              <MapPin size={18} className="text-emerald-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{current.address}</p>
                {current.instructions && <p className="text-xs text-gray-500 mt-1">📝 {current.instructions}</p>}
              </div>
              <button onClick={() => setEditing(true)} className="text-sm font-semibold text-emerald-700">
                Modifier
              </button>
            </div>
          ) : (
            <LocationEditor
              initial={current}
              withInstructions
              confirmLabel="Enregistrer cette adresse"
              onCancel={current ? () => setEditing(false) : undefined}
              onConfirm={onConfirm}
            />
          )}
        </div>

        {!user && (
          <div className="mt-4 rounded-2xl bg-white border border-emerald-200 p-4 text-center">
            <p className="text-sm text-gray-700">Gardez votre adresse sur tous vos appareils et suivez vos commandes.</p>
            <Link
              href="/auth/register?redirect=/main/location"
              className="mt-3 inline-block w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
            >
              Créer mon compte
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
