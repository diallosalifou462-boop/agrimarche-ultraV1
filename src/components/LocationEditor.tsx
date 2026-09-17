'use client';

// ============================================================================
//  LocationEditor — l'UNIQUE écran de choix de position de l'app.
//  Utilisé pour : adresse de livraison (checkout, « Mon adresse ») et point
//  de retrait vendeur (inscription vendeur, espace vendeur).
//
//  Trois façons d'arriver au même résultat, toujours vérifiable sur la carte :
//   1. « Ma position actuelle » : meilleur point GPS sur ~15 s (pas le premier,
//      souvent faux de plusieurs km), avec la précision affichée ;
//   2. recherche d'un lieu (quartier, marché, repère connu) ;
//   3. point placé à la main sur la carte (fonctionne SANS GPS).
//  Rien n'est enregistré tant que l'utilisateur n'a pas confirmé.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import { LocateFixed, Search, MapPin, Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import LocationPicker from '@/components/LocationPicker';
import { reverseGeocode, searchPlaces } from '@/lib/geo/geocode';
import type { GeocodeResult } from '@/lib/geo/types';
import { isPlausibleSenegalCoordinate, distanceKm } from '@/lib/geo/distance';
import {
  DAKAR_CENTER,
  GPS_APPROX_ACCURACY_M,
  classifyAccuracy,
  formatReverseAddress,
  getBestGpsFix,
  gpsErrorMessage,
  type LocationRecord,
  type LocationSource,
} from '@/lib/geo/quality';

interface LocationEditorProps {
  initial?: LocationRecord | null;
  onConfirm: (rec: LocationRecord) => void | Promise<void>;
  onCancel?: () => void;
  confirmLabel?: string;
  /** Champ « repère pour le livreur » (adresses de livraison). */
  withInstructions?: boolean;
  /** Texte d'aide sous le titre. */
  helper?: string;
}

type Pin = { lat: number; lng: number };

export default function LocationEditor({
  initial,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirmer cette position',
  withInstructions = false,
  helper,
}: LocationEditorProps) {
  const [pin, setPin] = useState<Pin | null>(initial ? { lat: initial.lat, lng: initial.lng } : null);
  const [source, setSource] = useState<LocationSource>(initial?.source ?? 'MANUAL_PIN');
  const [accuracy, setAccuracy] = useState<number | null>(initial?.accuracy ?? null);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [geo, setGeo] = useState<{ city?: string; region?: string }>({ city: initial?.city, region: initial?.region });
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');

  const [gpsState, setGpsState] = useState<'idle' | 'searching'>('idle');
  const [gpsProgress, setGpsProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // Point GPS d'origine : si l'utilisateur déplace le pin de plus de 15 m,
  // la position devient « placée à la main » (la précision GPS ne s'applique plus).
  const gpsOriginRef = useRef<Pin | null>(initial?.source === 'GPS' ? { lat: initial.lat, lng: initial.lng } : null);
  const addressForRef = useRef<string>(initial ? `${initial.lat.toFixed(5)},${initial.lng.toFixed(5)}` : '');

  // Adresse lisible du point, recalculée quand le pin s'arrête de bouger.
  useEffect(() => {
    if (!pin) return;
    const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
    if (key === addressForRef.current) return;
    const controller = new AbortController();
    const t = setTimeout(async () => {
      const r = await reverseGeocode(pin.lat, pin.lng, { signal: controller.signal });
      if (controller.signal.aborted) return;
      addressForRef.current = key;
      setAddress(formatReverseAddress(r, pin.lat, pin.lng));
      setGeo({ city: r?.city, region: r?.region });
    }, 600);
    return () => { clearTimeout(t); controller.abort(); };
  }, [pin]);

  // Recherche de lieu
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      searchPlaces(q, 5).then(setResults).finally(() => setSearching(false));
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const useGps = useCallback(async () => {
    setError(null);
    setGpsState('searching');
    setGpsProgress(null);
    try {
      const fix = await getBestGpsFix({ onProgress: setGpsProgress });
      gpsOriginRef.current = { lat: fix.lat, lng: fix.lng };
      setPin({ lat: fix.lat, lng: fix.lng });
      setAccuracy(fix.accuracy);
      setSource('GPS');
    } catch (err) {
      setError(gpsErrorMessage(err));
    } finally {
      setGpsState('idle');
    }
  }, []);

  const pickResult = (r: GeocodeResult) => {
    if (!isPlausibleSenegalCoordinate(r.latitude, r.longitude)) {
      setError('Ce lieu est hors du Sénégal.');
      return;
    }
    gpsOriginRef.current = null;
    setPin({ lat: r.latitude, lng: r.longitude });
    setAccuracy(null);
    setSource('MAP_SEARCH');
    setQuery('');
    setResults([]);
    setError(null);
  };

  const onMapChange = (lat: number, lng: number) => {
    const origin = gpsOriginRef.current;
    const movedM = origin ? distanceKm(origin.lat, origin.lng, lat, lng) * 1000 : Infinity;
    setPin({ lat, lng });
    if (movedM > 15) {
      // Déplacé à la main : ce n'est plus le point GPS ni le lieu recherché.
      gpsOriginRef.current = null;
      setSource('MANUAL_PIN');
      setAccuracy(null);
    }
    setError(null);
  };

  const quality = source === 'GPS' ? classifyAccuracy(accuracy) : 'precise';
  const gpsUnusable = source === 'GPS' && typeof accuracy === 'number' && accuracy > GPS_APPROX_ACCURACY_M;

  const confirm = async () => {
    if (!pin) { setError('Choisissez une position.'); return; }
    if (!isPlausibleSenegalCoordinate(pin.lat, pin.lng)) { setError('Le point doit être au Sénégal.'); return; }
    if (gpsUnusable) { setError('Le GPS est trop imprécis ici : déplacez le point exactement au bon endroit.'); return; }
    setConfirming(true);
    try {
      let finalAddress = address;
      let finalGeo = geo;
      const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
      if (key !== addressForRef.current || !finalAddress) {
        const r = await reverseGeocode(pin.lat, pin.lng);
        finalAddress = formatReverseAddress(r, pin.lat, pin.lng);
        finalGeo = { city: r?.city, region: r?.region };
      }
      await onConfirm({
        lat: pin.lat,
        lng: pin.lng,
        accuracy: source === 'GPS' ? accuracy : null,
        source,
        address: finalAddress,
        city: finalGeo.city,
        region: finalGeo.region,
        ...(withInstructions && instructions.trim() ? { instructions: instructions.trim() } : {}),
      });
    } catch (err: any) {
      setError(err?.message || "La position n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-3 text-left">
      {helper && <p className="text-xs text-gray-500 leading-relaxed">{helper}</p>}

      {/* 1. GPS */}
      <button
        type="button"
        onClick={useGps}
        disabled={gpsState === 'searching'}
        className="w-full py-3 px-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-emerald-800 font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-70"
      >
        {gpsState === 'searching' ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            {gpsProgress ? `Affinage du GPS… ±${Math.round(gpsProgress)} m` : 'Recherche du GPS…'}
          </>
        ) : (
          <><LocateFixed size={16} /> Utiliser ma position actuelle</>
        )}
      </button>

      {/* 2. Recherche */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ou rechercher un lieu (quartier, marché, repère…)"
          className="w-full pl-9 pr-9 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-emerald-500"
        />
        {searching && <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-emerald-600" />}
        {results.length > 0 && (
          <div className="absolute z-[1000] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {results.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => pickResult(r)}
                className="block w-full text-left px-3 py-2.5 text-xs text-gray-700 hover:bg-emerald-50 border-t first:border-t-0 border-gray-100"
              >
                {r.displayName}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Carte */}
      {pin ? (
        <div className="space-y-2">
          <LocationPicker lat={pin.lat} lng={pin.lng} onChange={onMapChange} zoom={source === 'GPS' ? 17 : 16} />
          <p className="text-[11px] text-gray-500 text-center">
            Touchez la carte ou déplacez le marqueur <strong>exactement</strong> au bon endroit.
          </p>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => { setPin({ ...DAKAR_CENTER }); setSource('MANUAL_PIN'); setAccuracy(null); setError(null); }}
          className="w-full py-2.5 rounded-xl border border-dashed border-gray-300 text-gray-600 text-sm flex items-center justify-center gap-2"
        >
          <MapPin size={15} /> Placer le point moi-même sur la carte
        </button>
      )}

      {/* État de la position */}
      {pin && (
        <div
          className={`rounded-xl px-3 py-2.5 text-xs flex items-start gap-2 ${
            quality === 'precise' ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
          }`}
        >
          {quality === 'precise' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          <div className="leading-relaxed">
            <div className="font-semibold">{address || 'Recherche de l’adresse…'}</div>
            <div>
              {source === 'GPS' && typeof accuracy === 'number' && (
                quality === 'precise'
                  ? `GPS précis (±${Math.round(accuracy)} m)`
                  : `GPS approximatif (±${Math.round(accuracy)} m) — vérifiez le point sur la carte`
              )}
              {source === 'MANUAL_PIN' && 'Point placé sur la carte'}
              {source === 'MAP_SEARCH' && 'Lieu trouvé par la recherche — vérifiez le point'}
            </div>
          </div>
        </div>
      )}

      {withInstructions && (
        <textarea
          value={instructions}
          onChange={(e) => setInstructions(e.target.value.slice(0, 300))}
          rows={2}
          placeholder="Repère pour le livreur (ex : portail bleu, en face de la boulangerie)"
          className="w-full px-3 py-2.5 text-sm rounded-xl border border-gray-200 outline-none focus:border-emerald-500 resize-none"
        />
      )}

      {error && (
        <p className="text-xs text-rose-600 flex items-start gap-1.5">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {error}
        </p>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm flex items-center gap-1"
          >
            <X size={14} /> Annuler
          </button>
        )}
        <button
          type="button"
          onClick={confirm}
          disabled={!pin || confirming || gpsState === 'searching'}
          className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {confirming ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
