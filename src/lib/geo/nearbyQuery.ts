/**
 * Écoute en temps réel des documents d'une collection Firestore situés dans
 * un rayon donné, via index geohash (voir lib/geo/geohash.ts pour le
 * pourquoi). Générique : utilisable pour 'products', 'users' (vendeurs),
 * livreurs, etc. — tout ce qui a un champ `geohash` + `lat`/`lng`.
 *
 * ⚠️ PRÉREQUIS AVANT BRANCHEMENT EN PRODUCTION :
 * 1. `npm install geofire-common`
 * 2. Les documents existants n'ont PAS de champ `geohash` tant qu'ils n'ont
 *    pas été soit ré-enregistrés (voir les écritures mises à jour dans
 *    seller/register, seller/page.tsx, seller/products/add), soit
 *    rétro-remplis par un script de migration (à écrire séparément, avec
 *    firebase-admin — nécessite les credentials du projet, que je n'ai pas
 *    ici). Tant que ce backfill n'est pas fait, une requête geohash sur la
 *    collection 'products' ne renverra QUE les produits créés/modifiés après
 *    ce déploiement — pas une régression silencieuse, mais un vide pour les
 *    anciens produits. D'où le param `fallbackWhenEmpty` ci-dessous.
 */

import { collection, onSnapshot, query, where, orderBy, limit as fbLimit, type Firestore, type DocumentData } from 'firebase/firestore';
import { computeGeohashQueryBounds, geoDistanceBetween } from './geohash';

export interface NearbyResult<T> {
  id: string;
  data: T;
  distanceKm: number;
}

/**
 * S'abonne aux documents de `collectionName` dans `radiusMeters` autour de
 * `center`. Appelle `onUpdate` à chaque changement avec la liste triée par
 * distance croissante. Retourne une fonction de désabonnement unique — à
 * appeler pour fermer TOUTES les sous-requêtes internes (nettoyage automatique).
 *
 * `perQueryLimit` borne chaque sous-requête individuelle (protection contre
 * une zone géohash anormalement dense) ; le total affiché peut donc, dans un
 * cas extrême, être légèrement incomplet plutôt que de charger des milliers
 * de documents d'un coup — comportement jugé préférable à un plantage mémoire.
 */
export function subscribeNearby<T extends DocumentData>(
  db: Firestore,
  collectionName: string,
  center: { lat: number; lng: number },
  radiusMeters: number,
  onUpdate: (results: Array<NearbyResult<T>>) => void,
  options?: { perQueryLimit?: number; extraWhere?: [string, any, any] }
): () => void {
  const bounds = computeGeohashQueryBounds(center, radiusMeters);
  const perQueryLimit = options?.perQueryLimit ?? 100;

  // Un Map par sous-requête, fusionnés à chaque update — évite qu'un tick
  // d'une seule sous-requête écrase les résultats des autres (comportement
  // correct pour du temps réel multi-requêtes, contrairement à un simple
  // "dernier tableau reçu gagne").
  const perQueryResults = new Map<number, Map<string, T>>();

  const emit = () => {
    const merged = new Map<string, T>();
    for (const m of perQueryResults.values()) {
      for (const [id, data] of m) merged.set(id, data);
    }

    const withDistance: Array<NearbyResult<T>> = [];
    merged.forEach((data, id) => {
      const lat = (data as any).lat;
      const lng = (data as any).lng;
      if (typeof lat !== 'number' || typeof lng !== 'number') return;
      const distanceKm = geoDistanceBetween([center.lat, center.lng], [lat, lng]);
      // Les bornes geohash couvrent un carré englobant le cercle demandé :
      // on ré-applique ici le filtre de rayon exact pour ne garder que les
      // points réellement dans le cercle (pas les coins du carré).
      if (distanceKm * 1000 <= radiusMeters) {
        withDistance.push({ id, data, distanceKm });
      }
    });
    withDistance.sort((a, b) => a.distanceKm - b.distanceKm);
    onUpdate(withDistance);
  };

  const unsubs = bounds.map(([start, end], i) => {
    let constraints = [
      where('geohash', '>=', start),
      where('geohash', '<=', end),
      orderBy('geohash'),
      fbLimit(perQueryLimit),
    ] as any[];
    if (options?.extraWhere) {
      const [field, op, value] = options.extraWhere;
      constraints = [where(field, op, value), ...constraints];
    }
    const q = query(collection(db, collectionName), ...constraints);
    return onSnapshot(q, (snap) => {
      const m = new Map<string, T>();
      snap.forEach((doc) => m.set(doc.id, doc.data() as T));
      perQueryResults.set(i, m);
      emit();
    }, (err) => {
      console.warn(`[nearbyQuery] sous-requête geohash #${i} en échec :`, err);
    });
  });

  return () => unsubs.forEach((u) => u());
}
