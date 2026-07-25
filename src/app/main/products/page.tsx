'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, where, orderBy, doc, updateDoc, increment, limit } from 'firebase/firestore';
import { db, waitForFirestoreReady, trace } from '@/lib/firebase/firebase';
import { logEvent } from 'firebase/analytics';
import { analytics } from '@/lib/firebase/firebase';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { Network } from '@capacitor/network';

const CATEGORIES = [
  { label: 'Tous',              icon: '✦',  color: '#C9A84C' },
  { label: 'Fruits',            icon: '', color: '#E8703A' },
  { label: 'Légumes',           icon: '', color: '#3D9A5C' },
  { label: 'Céréales',          icon: '', color: '#C9A84C' },
  { label: 'Tubercules',        icon: '', color: '#8B6914' },
  { label: 'Machines agricoles',icon: '', color: '#607080' },
  { label: 'Condiments',        icon: '', color: '#C0392B' },
  { label: 'Poissons',          icon: '', color: '#2980B9' },
  { label: 'Produits laitiers', icon: '', color: '#B0A090' },
  { label: 'Légumineuses',      icon: '', color: '#7D6A3E' },
  { label: 'Engrais',           icon: '', color: '#2ECC71' },
  { label: 'Elevage',  icon: '', color: '#E74C3C' },
];

const WA_NUMBER = '221779747073';
const PAGE_SIZE = 40; // Nombre de produits chargés par page — évite de télécharger tout le catalogue d'un coup

function WaIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>
  );
}

function CartIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="21" r="1.4" fill="currentColor" stroke="none" />
      <path d="M1.5 2h2.7l2.3 12.4a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L21.5 6H5" />
    </svg>
  );
}

// Optimise une URL Cloudinary à la volée : format auto (WebP/AVIF selon le
// navigateur), qualité auto, recadrage à la taille réellement affichée.
// N'a aucun effet sur les URLs qui ne sont pas des URLs Cloudinary (fallback
// silencieux) — donc ne casse jamais l'affichage si l'origine change un jour.
function cld(url?: string, width = 400, height?: number, crop: 'fill' | 'limit' = 'fill'): string | undefined {
  if (!url || !url.includes('/upload/')) return url;
  const t = `f_auto,q_auto,c_${crop},w_${width}${height ? `,h_${height}` : ''}`;
  return url.replace('/upload/', `/upload/${t}/`);
}

// ✅ Type Product simplifié et compatible
interface ProductData {
  id: string;
  name: string;
  description?: string;
  price: number;
  unit: string;
  category: string;
  farmer?: string;
  farmerPhone?: string;
  farmerVerified?: boolean;
  images?: string[];
  stock?: number;
  exactLocation?: string;
  region?: string;
  lat?: number;
  lng?: number;
  sellerId?: string;
  createdAt?: any;
  whatsappClicks?: number;
}

interface SellerRating { sellerId: string; averageRating: number; reviewCount: number; }

// ─────────────────────────────────────────────────────────────────────────────
export default function AgriMarket() {
  const router = useRouter();
  const { cart, addToCart } = useCart();
  const { user, profile, loading: authLoading, logout } = useAuth();

  // ⚡ FIX (vitesse perçue) : lecture SYNCHRONE du cache local au tout
  // premier rendu (avant même le premier paint) — sur toute ouverture après
  // la première, les produits de la dernière visite s'affichent
  // instantanément (0ms perçu, aucun skeleton visible), pendant que
  // Firestore va chercher les données fraîches en silence et les remplace
  // dès qu'elles arrivent. `useState(() => ...)` avec une fonction est un
  // "initializer paresseux" React : il ne s'exécute qu'une fois, au montage,
  // jamais à chaque re-render.
  const readProductsCache = (): ProductData[] => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem('agrimarche_products_cache');
      return raw ? (JSON.parse(raw) as ProductData[]) : [];
    } catch { return []; }
  };

  const [mounted,            setMounted]            = useState(false);
  const [products,           setProducts]           = useState<ProductData[]>(readProductsCache);
  const [productsLoaded,     setProductsLoaded]     = useState(() => readProductsCache().length > 0);
  // ⚠️ FIX : voir le useEffect du listener 'products' plus bas — avant,
  // une erreur Firestore (permission-denied, règles, réseau...) ne faisait
  // qu'un console.error sans jamais sortir la page du skeleton de
  // chargement, qui tournait donc à l'infini ("recherche en boucle").
  const [loadError,          setLoadError]          = useState(false);
  // Diagnostic visible à l'écran : capture le détail technique brut de la
  // dernière erreur du listener produits, pour pouvoir le lire/screenshoter
  // directement sur le téléphone sans outil externe (Safari Web Inspector
  // nécessite un Mac, indisponible sur PC Windows).
  const [debugErrorDetail,   setDebugErrorDetail]   = useState('');
  const [retryTick,          setRetryTick]          = useState(0);
  const [pageLimit,          setPageLimit]          = useState(PAGE_SIZE);
  const [loadingMore,        setLoadingMore]        = useState(false);
  const [hasMore,            setHasMore]            = useState(true);
  const [freshProducts,      setFreshProducts]      = useState<ProductData[]>([]);
  const [popularProducts,    setPopularProducts]    = useState<ProductData[]>([]);
  const [filtered,           setFiltered]           = useState<ProductData[]>(readProductsCache);
  const [search,             setSearch]             = useState('');
  const [cat,                setCat]                = useState('Tous');
  const [sort,               setSort]               = useState<'default'|'asc'|'desc'>('default');
  const [wishlist,           setWishlist]           = useState<Set<string>>(new Set());
  const [showUserMenu,       setShowUserMenu]       = useState(false);
  const [showSort,           setShowSort]           = useState(false);
  const [location,           setLocation]           = useState<{address:string;lat:number;lng:number;precision:number;detailedAddress?:string;region?:string}|null>(null);
  const [locStatus,          setLocStatus]          = useState<'searching'|'found'|'error'>('searching');
  const [addedIds,           setAddedIds]           = useState<Set<string>>(new Set());
  const [selected,           setSelected]           = useState<ProductData|null>(null);
  const [imgIdx,             setImgIdx]             = useState(0);
  const [cardImgIdx,         setCardImgIdx]         = useState<Map<string,number>>(new Map());
  const [recImgIdx,          setRecImgIdx]          = useState<Map<string,number>>(new Map());
  const [scrolled,           setScrolled]           = useState(false);
  const [ratings,            setRatings]            = useState<Map<string,SellerRating>>(new Map());
  const [heroVisible,        setHeroVisible]        = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);

  const getCardImg = (id: string) => cardImgIdx.get(id) || 0;
  const setCardImg = (id: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardImgIdx(prev => { const m = new Map(prev); m.set(id, idx); return m; });
  };
  const getRecImg = (id: string) => recImgIdx.get(id) || 0;
  const setRecImg = (id: string, idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecImgIdx(prev => { const m = new Map(prev); m.set(id, idx); return m; });
  };

  const cartCount = cart?.itemCount || 0;

  useEffect(() => { setMounted(true); setTimeout(() => setHeroVisible(true), 100); }, []);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // ⚡ Détection silencieuse d'un chargement bloqué (6s au lieu de 10 — on
  // veut que l'app réagisse vite). Ne montre AUCUN écran d'erreur : ça
  // déclenche juste la reprise automatique ci-dessous.
  useEffect(() => {
    if (productsLoaded) return;
    const t = setTimeout(async () => {
      // ⚡ FIX (diagnostic) : avant de conclure "bug de l'app", on vérifie le
      // VRAI état réseau du téléphone via le plugin natif Capacitor. Ça
      // distingue clairement "le téléphone n'a réellement aucune connexion"
      // (rien à corriger côté code, c'est le réseau du terrain) de "le
      // téléphone est connecté mais Firestore ne répond quand même pas"
      // (là, c'est un vrai bug à corriger).
      let networkInfo = 'statut réseau inconnu (plugin indisponible)';
      try {
        const status = await Network.getStatus();
        networkInfo = status.connected
          ? `connecté (${status.connectionType})`
          : 'DÉCONNECTÉ — le téléphone n\'a aucune connexion réseau active';
      } catch (netErr) {
        networkInfo = `impossible de lire le statut réseau (${(netErr as Error)?.message || netErr})`;
      }

      // ⚡ FIX (diagnostic) : test d'accès à Firestore en HTTP simple (API
      // REST publique), complètement indépendant du SDK Firebase et de son
      // transport interne (gRPC/long-polling). Si CE test passe alors que le
      // SDK reste bloqué, le problème est dans le SDK/sa configuration. Si CE
      // test échoue AUSSI, le problème est réseau/projet (bloqué par
      // l'opérateur, mauvais projectId, Firestore désactivé, etc.) — pas un
      // bug de l'app.
      let restInfo = 'non testé';
      try {
        const restRes = await Promise.race([
          fetch('https://firestore.googleapis.com/v1/projects/agrimarche-24e37/databases/(default)/documents/products?pageSize=1'),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout REST 5s')), 5000)),
        ]);
        restInfo = restRes.ok ? `OK (HTTP ${restRes.status})` : `HTTP ${restRes.status}`;
      } catch (restErr) {
        restInfo = `échec (${(restErr as Error)?.message || restErr})`;
      }

      console.warn('[products] Chargement bloqué (6s) — reprise automatique en arrière-plan. Réseau:', networkInfo, '— Test REST Firestore:', restInfo);
      setLoadError(true);
      setDebugErrorDetail(prev => prev || `timeout après 6s — réseau : ${networkInfo} — accès direct Firestore : ${restInfo}`);
    }, 6000);
    return () => clearTimeout(t);
  }, [productsLoaded, retryTick]);

  // ⚡ FIX (fluidité) : plus de bouton "Réessayer" qui casse l'expérience —
  // en cas d'échec, l'app retente TOUTE SEULE en arrière-plan, de plus en
  // plus vite au début (1s, 2s, 4s...) sans jamais dépasser 10s entre deux
  // tentatives, jusqu'à ce que ça marche. L'utilisateur n'a jamais besoin
  // d'intervenir ; le skeleton reste affiché pendant les tentatives
  // silencieuses au lieu d'un écran d'erreur qui casse la fluidité.
  useEffect(() => {
    if (!loadError) return;
    const attempt = Math.min(retryTick, 4); // plafonne la progression du délai
    const delay = Math.min(1000 * 2 ** attempt, 10000);
    const t = setTimeout(() => {
      setProductsLoaded(false);
      setLoadError(false);
      setRetryTick(v => v + 1);
    }, delay);
    return () => clearTimeout(t);
  }, [loadError, retryTick]);

  useEffect(() => {
    // ⚡ FIX (vitesse) : les produits sont un catalogue PUBLIC — les invités
    // doivent pouvoir les voir sans compte (voir commentaire ci-dessous).
    // Attendre `authLoading` avant même de démarrer cette requête forçait
    // deux opérations totalement indépendantes (restaurer la session ET
    // charger le catalogue) à s'exécuter en SÉRIE au lieu d'EN PARALLÈLE —
    // ajoutant inutilement tout le temps de résolution de l'auth au délai
    // avant le premier affichage des produits. On démarre donc la requête
    // immédiatement, dès le montage.
    //
    // (Si les règles Firestore exigent un minimum d'authentification pour
    // lire 'products', il faut les assouplir côté Firebase — voir plus bas.)
    //
    // ⚡ FIX (v4) : on attend explicitement `firestoreWarmupPromise` (voir
    // firebase.ts) avant de lancer ce premier onSnapshot. Au tout premier
    // lancement à froid avec le réseau déjà actif, la pile réseau native
    // iOS peut ne pas être prête pour la toute première requête — cette
    // promesse s'assure qu'une requête "de réveil" est bien passée avant
    // que Firestore ne tente sa propre connexion.
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    trace('PRODUITS', 'page montée — attente waitForFirestoreReady()');
    waitForFirestoreReady().then(() => {
      if (cancelled) return;
      trace('PRODUITS', 'waitForFirestoreReady() résolu — pose du listener principal');
      unsubscribe = onSnapshot(query(collection(db, 'products'), limit(pageLimit)), snap => {
        trace('PRODUITS', `onSnapshot déclenché — ${snap.docs.length} doc(s), fromCache=${snap.metadata.fromCache}`);
        const d = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductData[];
        setProducts(d); setFiltered(d);
        setProductsLoaded(true);
        setLoadError(false);
        setDebugErrorDetail('');
        setLoadingMore(false);
        // S'il y a moins de résultats que la limite demandée, on a atteint la fin du catalogue.
        setHasMore(d.length >= pageLimit);
        // ⚡ Cache local synchrone (voir hydratation instantanée plus haut) :
        // la prochaine ouverture de cette page affichera ces produits dès le
        // tout premier rendu, en 0ms perçu, avant même que Firestore réponde.
        try { localStorage.setItem('agrimarche_products_cache', JSON.stringify(d)); } catch { /* ignore (quota/privé) */ }
      }, (error) => {
        // ⚡ FIX : on ne bascule plus productsLoaded à true ici — le skeleton
        // reste affiché pendant que la reprise automatique retente en
        // arrière-plan, au lieu d'afficher un écran d'erreur qui casse la
        // fluidité perçue de l'app.
        console.error('[products] Erreur listener:', error);
        setLoadError(true);
        setDebugErrorDetail(`${error?.code || 'inconnu'} — ${error?.message || String(error)}`);
        setLoadingMore(false);
      });
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [pageLimit, retryTick]);

  // Requêtes séparées, triées côté serveur, indépendantes de la pagination ci-dessus :
  // sans ça, "Nouveautés" et "Les plus demandés" ne regarderaient que les 40 premiers
  // produits chargés (ordre arbitraire), pas les vrais plus récents / plus demandés
  // de tout le catalogue.
  // ⚡ Même raisonnement : catalogue public, pas de raison d'attendre l'auth.
  useEffect(() => {
    let cancelled = false;
    let u: (() => void) | undefined;
    waitForFirestoreReady().then(() => {
      if (cancelled) return;
      u = onSnapshot(
        query(collection(db, 'products'), orderBy('createdAt', 'desc'), limit(10)),
        snap => setFreshProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductData[]),
        () => setFreshProducts([]) // le champ createdAt peut être absent selon les documents existants
      );
    });
    return () => { cancelled = true; u?.(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let u: (() => void) | undefined;
    waitForFirestoreReady().then(() => {
      if (cancelled) return;
      u = onSnapshot(
        query(collection(db, 'products'), orderBy('whatsappClicks', 'desc'), limit(10)),
        snap => setPopularProducts(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductData[]),
        () => setPopularProducts([])
      );
    });
    return () => { cancelled = true; u?.(); };
  }, []);

  // ── ANNONCES (Firestore collection 'ads') ──
  const [ads, setAds] = useState<any[]>([]);
  const [adIdx, setAdIdx] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let u: (() => void) | undefined;
    waitForFirestoreReady().then(() => {
      if (cancelled) return;
      u = onSnapshot(
        query(collection(db, 'ads'), where('active', '==', true)),
        snap => {
          const list = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0));
          setAds(list);
          setAdIdx(0);
        },
        // Erreur silencieuse — ads optionnelles, ne pas crasher si permission manquante
        (err) => { console.warn('ads listener ignoré:', err.code); }
      );
    });
    return () => { cancelled = true; u?.(); };
  }, []);
  useEffect(() => {
    if (ads.length <= 1) return;
    const t = setInterval(() => setAdIdx(i => (i + 1) % ads.length), 4500);
    return () => clearInterval(t);
  }, [ads.length]);


  useEffect(() => {
    if (!products.length) return;

    // ✅ on garde les fonctions de désabonnement et on les appelle au
    //    nettoyage de l'effet — avant, aucun `unsub` n'était même conservé,
    //    donc les listeners Firestore s'accumulaient à chaque changement
    //    de la liste de produits, sans jamais se fermer.
    const unsubs = [...new Set(products.map(p => p.sellerId).filter((sid): sid is string => !!sid))].map(sid =>
      onSnapshot(query(collection(db, 'reviews'), where('sellerId', '==', sid)), snap => {
        const revs = snap.docs.map(d => d.data());
        const cnt = revs.length;
        const avg = cnt ? revs.reduce((s: number, r: any) => s + (r.rating || 0), 0) / cnt : 0;
        setRatings(prev => { const m = new Map(prev); m.set(sid, { sellerId: sid, averageRating: +avg.toFixed(1), reviewCount: cnt }); return m; });
      })
    );

    return () => unsubs.forEach(unsub => unsub());
  }, [products]);

  // ============================================================
  // ✅ RECOMMANDATIONS PRODUIT — région, producteur, proximité réelle, catégorie
  //    Remplace l'ancien double affichage ("Autres produits dans X" +
  //    "Produits similaires") qui dupliquait exactement le même filtre.
  //    Les sections "saison" et "populaire" de la version précédente ont été
  //    retirées : elles reposaient sur des données simulées/aléatoires
  //    (Math.random() pour la note, liste figée pour la saison) qui n'apportaient
  //    aucune valeur réelle et pouvaient induire l'utilisateur en erreur.
  // ============================================================
  const distanceKm = (lat1: number, lng1: number, lat2: number, lng2: number) => {
    const R = 6371, toRad = (d: number) => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  };

  // ============================================================
  //   SECTIONS DYNAMIQUES DE L'ACCUEIL (point 14 du brief)
  //   Construites uniquement à partir de données réelles :
  //   - Nouveautés  → createdAt réel du produit
  //   - Près de vous → lat/lng réels + position GPS détectée
  //   - Les plus demandés → whatsappClicks réel (compteur de contacts)
  //   Une section n'apparaît que si elle a au moins 3 produits réels
  //   à montrer — jamais de rangée à moitié vide ou de donnée simulée.
  // ============================================================
  const homeSections = useMemo(() => {
    const inStock = products.filter(p => p.stock === undefined || p.stock === null || p.stock > 0);
    const sections: { key: string; title: string; icon: string; items: ProductData[]; distances?: Map<string, number> }[] = [];

    // Basé sur la requête dédiée orderBy(createdAt) — précis quel que soit le nombre
    // de produits déjà chargés dans la page principale.
    const fresh = freshProducts.filter(p => p.stock === undefined || p.stock === null || p.stock > 0);
    if (fresh.length >= 3) {
      sections.push({ key: 'new', title: 'Nouveautés du jour', icon: '✦', items: fresh.slice(0, 10) });
    }

    if (location?.lat && location?.lng) {
      const distances = new Map<string, number>();
      const nearby = inStock
        .filter(p => p.lat !== undefined && p.lng !== undefined)
        .map(p => { distances.set(p.id, distanceKm(location.lat, location.lng, p.lat!, p.lng!)); return p; })
        .sort((a, b) => (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0));
      if (nearby.length >= 3) {
        sections.push({ key: 'near', title: 'Près de chez vous', icon: '📍', items: nearby.slice(0, 10), distances });
      }
    }

    // Basé sur la requête dédiée orderBy(whatsappClicks) — précis même si le produit
    // le plus demandé ne fait pas partie des 40 premiers chargés dans la grille.
    const popular = popularProducts.filter(p =>
      (p.whatsappClicks ?? 0) > 0 && (p.stock === undefined || p.stock === null || p.stock > 0)
    );
    if (popular.length >= 3) {
      sections.push({ key: 'popular', title: 'Les plus demandés', icon: '🔥', items: popular.slice(0, 10) });
    }

    return sections;
  }, [products, freshProducts, popularProducts, location]);

  const recommendationSections = useMemo(() => {
    if (!selected) return [] as { title: string; badge: string; items: ProductData[]; distances?: Map<string, number> }[];
    const others = products.filter(p => p.id !== selected.id);
    const sections: { title: string; badge: string; items: ProductData[]; distances?: Map<string, number> }[] = [];

    // 1. Région de l'utilisateur (uniquement si une région réelle a été détectée/choisie)
    if (location?.region) {
      const sameRegion = others.filter(p => (p.region || '').toLowerCase() === location.region!.toLowerCase());
      if (sameRegion.length > 0) {
        sections.push({ title: `Populaire en ${location.region}`, badge: '📍 Région', items: sameRegion.slice(0, 6) });
      }
    }

    // 2. Même producteur
    if (selected.farmer) {
      const sameFarmer = others.filter(p => p.farmer === selected.farmer);
      if (sameFarmer.length > 0) {
        sections.push({ title: `Autres produits de ${selected.farmer}`, badge: '👨\u200d🌾 Producteur', items: sameFarmer.slice(0, 6) });
      }
    }

    // 3. Proximité réelle (distance calculée à partir de la position GPS détectée)
    if (location?.lat && location?.lng) {
      const distances = new Map<string, number>();
      const nearby = others
        .filter(p => p.lat !== undefined && p.lng !== undefined)
        .map(p => { distances.set(p.id, distanceKm(location.lat, location.lng, p.lat!, p.lng!)); return p; })
        .sort((a, b) => (distances.get(a.id) ?? 0) - (distances.get(b.id) ?? 0));
      if (nearby.length > 0) {
        sections.push({ title: 'Près de chez vous', badge: '📍 Proche', items: nearby.slice(0, 6), distances });
      }
    }

    // 4. Même catégorie (toujours présent en dernier recours pour ne jamais laisser le drawer vide)
    const sameCategory = others.filter(p => p.category === selected.category);
    if (sameCategory.length > 0) {
      sections.push({ title: 'Dans la même catégorie', badge: '📂 Catégorie', items: sameCategory.slice(0, 6) });
    }

    return sections;
  }, [selected, products, location]);

  // ── Lecture de la localisation sauvegardée par /main/location ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem('agrimarche_location');
      if (!raw) { setLocStatus('found'); return; }
      const saved = JSON.parse(raw);
      setLocation({
        address: saved.address,
        lat: saved.lat,
        lng: saved.lng,
        precision: saved.precision,
        detailedAddress: saved.detailedAddress,
        region: saved.region,
      });
      setLocStatus('found');
    } catch {
      setLocStatus('found');
    }
  }, []);



  useEffect(() => {
    let r = [...products];
    // Exclure les produits en rupture de stock
    r = r.filter(p => p.stock === undefined || p.stock === null || p.stock > 0);
    if (search) r = r.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));
    if (cat !== 'Tous') r = r.filter(p => p.category === cat);
    if (sort === 'asc')  r.sort((a,b) => (a.price||0)-(b.price||0));
    if (sort === 'desc') r.sort((a,b) => (b.price||0)-(a.price||0));
    setFiltered(r);
  }, [products, search, cat, sort]);

  const open  = (p: ProductData) => { setSelected(p); setImgIdx(0); document.body.style.overflow = 'hidden'; };
  const close = () => { setSelected(null); document.body.style.overflow = ''; };
  
  // ✅ Correction : conversion explicite pour addToCart
  const addCart = (p: ProductData, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const productForCart = {
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit,
      category: p.category,
      images: p.images || [],
      stock: p.stock || 999,
      // ⚠️ FIX MULTI-VENDEUR : sellerId doit être conservé jusqu'au panier —
      // checkout/page.tsx regroupe les commandes par sellerId ; s'il est
      // absent ici, tous les articles retombent sur le même groupe par
      // défaut (user.uid / 'agrimarche-official') et une seule commande
      // est créée même si le panier contient plusieurs vendeurs distincts.
      sellerId: p.sellerId || '',
      region: p.region || '',
    };
    addToCart(productForCart as any, 1);
    setAddedIds(prev => new Set(prev).add(p.id));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 2200);
  };
  
  const toggleWish = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWishlist(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  
  const wa = (name: string, phone?: string, productId?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (analytics) {
      logEvent(analytics, 'whatsapp_click', { product_name: name });
    }
    if (productId) {
      updateDoc(doc(db, 'products', productId), {
        whatsappClicks: increment(1),
      }).catch(err => console.error('Erreur increment whatsappClicks:', err));
    }
    window.open(`https://wa.me/${phone?.replace(/\D/g,'') || WA_NUMBER}?text=${encodeURIComponent(`Bonjour, je suis intéressé par "${name}".`)}`, '_blank');
  };

  if (!mounted) return null;

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600;1,700&family=DM+Sans:wght@300;400;500;600;700&family=Italiana&display=swap');

        :root {
          --snow:       #FFFFFF;
          --pearl:      #F8FAF8;
          --alabaster:  #F2F7F3;
          --mist:       #E8F2EB;
          --silk:       #D6EAD9;
          --veil:       rgba(255,255,255,0.85);

          --forest:     #0D4A1F;
          --emerald:    #1A6B35;
          --jade:       #25894A;
          --fern:       #3CAD63;
          --sage:       #6EC98A;
          --mint:       #A8E8BC;
          --celadon:    #C8F0D4;

          --ink:        #0A1F0F;
          --moss:       rgba(13,74,31,0.08);
          --vines:      rgba(13,74,31,0.14);
          --leaf:       rgba(37,137,74,0.18);

          --border:     rgba(13,74,31,0.12);
          --border2:    rgba(13,74,31,0.22);

          --text:       #0D2E15;
          --mtext:      rgba(13,46,21,0.6);
          --dtext:      rgba(13,46,21,0.35);

          --shadow-sm:  0 2px 12px rgba(13,74,31,0.08);
          --shadow-md:  0 8px 32px rgba(13,74,31,0.12);
          --shadow-lg:  0 24px 64px rgba(13,74,31,0.16);
          --shadow-xl:  0 40px 100px rgba(13,74,31,0.2);
        }

        *, *::before, *::after { margin:0; padding:0; box-sizing:border-box; }
        html { scroll-behavior:smooth; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--pearl);
          color: var(--text);
          min-height: 100vh;
          overflow-x: hidden;
        }

        body::before {
          content:'';
          position:fixed; inset:0; pointer-events:none; z-index:0;
          background:
            radial-gradient(ellipse 80% 60% at 10% 0%, rgba(168,232,188,0.35) 0%, transparent 60%),
            radial-gradient(ellipse 60% 80% at 90% 100%, rgba(200,240,212,0.4) 0%, transparent 55%),
            radial-gradient(ellipse 50% 50% at 50% 50%, rgba(242,247,243,1) 0%, var(--pearl) 100%);
        }

        body::after {
          content:'';
          position:fixed; inset:0; pointer-events:none; z-index:9999;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='400' height='400' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
          opacity:0.018; mix-blend-mode:multiply;
        }

        ::-webkit-scrollbar { width:3px; }
        ::-webkit-scrollbar-track { background:var(--alabaster); }
        ::-webkit-scrollbar-thumb { background:var(--sage); border-radius:2px; }

        .g-header {
          position:sticky; top:0; z-index:200;
          background:rgba(248,250,248,0.92);
          border-bottom:1px solid var(--border);
          transition:all 0.5s cubic-bezier(.16,1,.3,1);
        }
        .g-header.scrolled {
          background:rgba(255,255,255,0.96);
          backdrop-filter:blur(32px) saturate(1.8);
          -webkit-backdrop-filter:blur(32px) saturate(1.8);
          border-bottom-color:var(--border2);
          box-shadow:
            0 1px 0 rgba(255,255,255,0.9),
            var(--shadow-md);
        }

        .g-header-inner {
          max-width:1400px; margin:0 auto;
          padding:16px 20px 0;
          position:relative; z-index:1;
        }

        .g-logo-row {
          display:flex; align-items:center; justify-content:space-between;
        }
        .g-logo-link { display:flex; align-items:center; gap:14px; text-decoration:none; }

        .g-wordmark { display:flex; flex-direction:column; gap:0; }
        .g-wordmark-main {
          font-family:'Italiana', serif;
          font-size:30px;
          letter-spacing:0.06em;
          line-height:1;
          background:linear-gradient(135deg, var(--forest) 0%, var(--emerald) 45%, var(--jade) 100%);
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
          background-clip:text;
        }
        .g-wordmark-sub {
          font-family:'DM Sans', sans-serif;
          font-size:7px;
          letter-spacing:0.38em;
          color:var(--sage);
          font-weight:600;
          margin-top:2px;
          text-transform:uppercase;
        }

        .g-icon-btn {
          width:40px; height:40px;
          background:var(--veil);
          border:1px solid var(--border);
          border-radius:12px;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:17px;
          transition:all 0.25s cubic-bezier(.34,1.56,.64,1);
          color:var(--text); text-decoration:none;
          box-shadow:var(--shadow-sm);
          position:relative;
        }
        .g-icon-btn:hover {
          background:var(--snow);
          border-color:var(--border2);
          transform:translateY(-1px);
          box-shadow:var(--shadow-md);
        }
        
        .cart-badge {
          position:absolute;
          top:-6px;
          right:-6px;
          background:linear-gradient(135deg, var(--emerald), var(--jade));
          color:white;
          font-size:9px;
          font-weight:700;
          min-width:18px;
          height:18px;
          border-radius:50%;
          display:flex;
          align-items:center;
          justify-content:center;
          padding:0 4px;
          box-shadow:0 2px 6px rgba(0,0,0,0.2);
        }

        .cart-badge-nav {
          top:2px;
          right:calc(50% - 20px);
        }

        .g-search-row { padding:14px 0 16px; }
        .g-search-box {
          position:relative;
          background:var(--snow);
          border:1.5px solid var(--border);
          border-radius:100px;
          display:flex; align-items:center;
          transition:all 0.35s cubic-bezier(.16,1,.3,1);
          overflow:hidden;
          box-shadow:var(--shadow-sm);
        }
        .g-search-box:focus-within {
          background:var(--snow);
          border-color:var(--jade);
          box-shadow:0 0 0 4px rgba(37,137,74,0.1), var(--shadow-md);
        }
        .g-search-ic {
          padding:0 14px 0 20px;
          color:var(--sage);
          font-size:15px; flex-shrink:0; pointer-events:none;
        }
        .g-search-input {
          flex:1; height:50px;
          background:transparent; border:none; outline:none;
          font-family:'DM Sans', sans-serif;
          font-size:13.5px; font-weight:400;
          color:var(--text); letter-spacing:0.01em;
        }
        .g-search-input::placeholder { color:var(--dtext); }

        .g-cats {
          position:sticky; top:118px; z-index:190;
          background:rgba(248,250,248,0.95);
          backdrop-filter:blur(20px);
          border-bottom:1px solid var(--border);
          overflow-x:auto; scrollbar-width:none;
        }
        .g-cats::-webkit-scrollbar { display:none; }
        .g-cats-inner {
          display:flex; gap:5px; padding:10px 16px; min-width:max-content;
        }

        .g-cat {
          display:inline-flex; align-items:center; gap:6px;
          padding:8px 16px; border-radius:100px;
          border:1.5px solid transparent;
          background:transparent;
          font-family:'DM Sans', sans-serif;
          font-size:11px; font-weight:500;
          color:var(--mtext); cursor:pointer; white-space:nowrap;
          transition:all 0.22s cubic-bezier(.34,1.56,.64,1);
          letter-spacing:0.01em;
        }
        .g-cat:hover {
          background:var(--mist);
          color:var(--emerald);
          border-color:var(--border2);
          box-shadow:var(--shadow-sm);
        }
        .g-cat.on {
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff; border-color:transparent;
          font-weight:700;
          box-shadow:0 4px 18px rgba(37,137,74,0.3), inset 0 1px 0 rgba(255,255,255,0.2);
          transform:scale(1.04);
        }
        .g-cat-ic { font-size:13px; }

        .g-toolbar {
          position:sticky; top:172px; z-index:180;
          background:rgba(248,250,248,0.96);
          backdrop-filter:blur(16px);
          border-bottom:1px solid var(--border);
          padding:10px 20px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
        }

        .g-loc-chip {
          display:flex; align-items:center; gap:8px;
          padding:7px 14px;
          background:var(--mist);
          border:1.5px solid var(--border2);
          border-radius:100px; cursor:pointer;
          transition:all 0.25s ease; min-width:0;
          box-shadow:var(--shadow-sm);
        }
        .g-loc-chip:hover { background:var(--silk); border-color:var(--jade); box-shadow:var(--shadow-md); }
        .g-loc-pulse {
          width:8px; height:8px; border-radius:50%;
          background:var(--jade); flex-shrink:0;
          box-shadow:0 0 0 3px rgba(37,137,74,0.2);
          transition:background 0.3s;
        }
        .g-loc-pulse.searching { background:#F59E0B; animation:g-blink 1s ease-in-out infinite; }
        .g-loc-pulse.error     { background:#EF4444; }
        @keyframes g-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .g-loc-text {
          font-size:11px; font-weight:600; color:var(--emerald);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;
        }

        .g-sort-trigger {
          display:flex; align-items:center; gap:6px; padding:7px 14px;
          background:var(--snow);
          border:1.5px solid var(--border);
          border-radius:100px;
          font-family:'DM Sans', sans-serif;
          font-size:11px; font-weight:600; color:var(--mtext);
          cursor:pointer; white-space:nowrap;
          transition:all 0.25s ease; letter-spacing:0.03em; flex-shrink:0;
          box-shadow:var(--shadow-sm);
        }
        .g-sort-trigger:hover { background:var(--mist); color:var(--emerald); border-color:var(--border2); }
        .g-sort-trigger.on    { background:var(--mist); color:var(--emerald); border-color:var(--jade); }

        .g-sort-menu {
          position:absolute; right:0; top:calc(100%+8px);
          background:var(--snow);
          border:1.5px solid var(--border2);
          border-radius:18px; overflow:hidden;
          min-width:190px;
          box-shadow:var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.8) inset;
          animation:g-pop 0.2s cubic-bezier(.34,1.56,.64,1);
          z-index:9;
        }
        @keyframes g-pop {
          from { opacity:0; transform:translateY(-10px) scale(0.95); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .g-sort-item {
          display:flex; align-items:center; justify-content:space-between;
          padding:12px 18px; font-size:12px; font-weight:500; color:var(--mtext);
          cursor:pointer; transition:all 0.2s; border:none; background:none; width:100%;
        }
        .g-sort-item:hover { background:var(--mist); color:var(--text); }
        .g-sort-item.on    { color:var(--jade); font-weight:700; }

        .g-main { max-width:1400px; margin:0 auto; padding:28px 16px 140px; position:relative; z-index:1; }

        .g-section-head {
          display:flex; align-items:baseline; gap:16px;
          margin-bottom:22px; padding-bottom:16px;
          border-bottom:1px solid var(--border);
        }
        .g-section-title {
          font-family:'Cormorant Garamond', serif;
          font-size:26px; font-weight:600; font-style:italic;
          color:var(--forest);
        }
        .g-section-line {
          flex:1; height:1px;
          background:linear-gradient(90deg, var(--sage) 0%, transparent 100%);
          opacity:0.5;
        }
        .g-section-badge {
          font-family:'DM Sans', sans-serif;
          font-size:9px; font-weight:700;
          letter-spacing:0.15em; color:var(--sage);
        }

        .g-grid {
          display:grid; grid-template-columns:repeat(3,1fr); gap:8px;
        }
        @media(min-width:600px)  { .g-grid { grid-template-columns:repeat(4,1fr); gap:12px; } }
        @media(min-width:900px)  { .g-grid { grid-template-columns:repeat(5,1fr); gap:16px; } }
        @media(min-width:1200px) { .g-grid { grid-template-columns:repeat(6,1fr); } }

        .g-hsec { padding:18px 0 4px; }
        .g-hsec-head { display:flex; align-items:center; gap:7px; padding:0 14px 10px; }
        .g-hsec-icon { font-size:15px; line-height:1; }
        .g-hsec-title { font-size:15px; font-weight:800; color:var(--ink); margin:0; letter-spacing:-0.01em; }
        .g-hrow {
          display:flex; gap:10px; overflow-x:auto; padding:0 14px 6px;
          scroll-snap-type:x proximity; -webkit-overflow-scrolling:touch;
          scrollbar-width:none;
        }
        .g-hrow::-webkit-scrollbar { display:none; }
        .g-hcard {
          flex:0 0 auto; width:132px; scroll-snap-align:start; cursor:pointer;
          transition:transform 0.15s ease;
        }
        .g-hcard:active { transform:scale(0.96); }
        .g-hcard-img {
          position:relative; width:132px; height:132px; border-radius:14px;
          overflow:hidden; background:var(--mist);
        }
        .g-hcard-verified {
          position:absolute; top:6px; right:6px; width:18px; height:18px; border-radius:50%;
          background:var(--jade); color:#fff; font-size:10px; font-weight:800;
          display:flex; align-items:center; justify-content:center; box-shadow:0 1px 4px rgba(0,0,0,0.25);
        }
        .g-hcard-name {
          margin-top:7px; font-size:12.5px; font-weight:600; color:var(--ink);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .g-hcard-price { font-size:12.5px; font-weight:800; color:var(--jade); }
        .g-hcard-price span { font-size:10px; font-weight:600; color:var(--sage); }
        .g-hcard-dist { font-size:10.5px; font-weight:600; color:var(--sage); margin-top:1px; }

        .g-card {
          background:var(--snow);
          border:1.5px solid var(--border);
          border-radius:22px;
          overflow:hidden; cursor:pointer; position:relative;
          opacity:0;
          animation:g-rise 0.6s cubic-bezier(.16,1,.3,1) forwards;
          transition:
            transform 0.45s cubic-bezier(.34,1.4,.64,1),
            border-color 0.3s,
            box-shadow 0.45s;
          will-change:transform;
          box-shadow:var(--shadow-sm);
        }
        @keyframes g-rise {
          from { opacity:0; transform:translateY(36px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .g-card:hover {
          transform:translateY(-12px) scale(1.02);
          border-color:var(--jade);
          box-shadow:
            var(--shadow-xl),
            0 0 0 1px rgba(37,137,74,0.2),
            inset 0 1px 0 rgba(255,255,255,0.8);
        }

        .g-card.hero { grid-column:span 2; }
        .g-card.hero .g-card-visual { aspect-ratio:16/9; }

        .g-card-visual {
          aspect-ratio:1; position:relative; overflow:hidden;
          background:var(--alabaster);
        }
        .g-card-visual > span {
          transition:transform 0.65s cubic-bezier(.16,1,.3,1);
        }
        .g-card:hover .g-card-visual > span { transform:scale(1.09); }

        .g-card-fog {
          position:absolute; inset:0;
          background:linear-gradient(
            to top,
            rgba(13,74,31,0.75) 0%,
            rgba(13,74,31,0.2) 40%,
            transparent 70%
          );
          transition:opacity 0.35s;
        }
        .g-card:hover .g-card-fog { opacity:0.9; }

        /* ── Carousel flèches + dots ── */
        .g-carr-arrow {
          position:absolute; top:50%; transform:translateY(-50%);
          width:28px; height:28px; border-radius:50%;
          background:rgba(255,255,255,0.82); backdrop-filter:blur(8px);
          border:1px solid rgba(255,255,255,0.5);
          color:var(--forest); font-size:18px; font-weight:700;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; z-index:4; padding:0; line-height:1;
          opacity:0; transition:opacity 0.2s, transform 0.2s;
          box-shadow:0 2px 12px rgba(0,0,0,0.18);
        }
        .g-carr-arrow.left  { left:7px; }
        .g-carr-arrow.right { right:7px; }
        .g-card:hover .g-carr-arrow { opacity:1; }
        .g-carr-arrow:hover { background:rgba(255,255,255,0.97); transform:translateY(-50%) scale(1.12); }

        .g-carr-dots {
          position:absolute; bottom:8px; left:0; right:0;
          display:flex; justify-content:center; gap:5px; z-index:4;
        }
        .g-carr-dot {
          width:5px; height:5px; border-radius:50%;
          border:none; cursor:pointer; padding:0;
          background:rgba(255,255,255,0.45);
          transition:all 0.2s;
        }
        .g-carr-dot.on {
          width:14px; border-radius:3px;
          background:#fff;
        }

        .g-card-price {
          position:absolute; bottom:6px; left:8px; right:8px;
          display:flex; align-items:flex-end; justify-content:space-between;
        }
        .g-price-n {
          font-family:'Cormorant Garamond', serif;
          font-size:16px; font-weight:700; color:#fff;
          letter-spacing:0.01em; line-height:1;
          text-shadow:0 2px 8px rgba(0,0,0,0.4);
        }
        .g-price-u {
          font-size:7px; color:rgba(255,255,255,0.7);
          margin-bottom:1px; font-weight:500; letter-spacing:0.04em;
        }

        .g-verified {
          position:absolute; top:10px; left:10px;
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:6px; font-weight:800;
          letter-spacing:0.08em; padding:2px 6px;
          border-radius:100px;
          box-shadow:0 4px 14px rgba(37,137,74,0.45);
        }

        .g-wish {
          position:absolute; top:10px; right:10px;
          width:34px; height:34px;
          background:rgba(255,255,255,0.75);
          backdrop-filter:blur(12px);
          border:1.5px solid rgba(255,255,255,0.6);
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:11px;
          transition:all 0.3s cubic-bezier(.34,1.56,.64,1);
          color:var(--mtext);
          box-shadow:var(--shadow-sm);
        }
        .g-wish:hover { transform:scale(1.2); background:rgba(255,255,255,0.92); color:var(--emerald); }
        .g-wish.on    { background:rgba(239,68,68,0.85); color:#fff; border-color:transparent; }

        .g-card-body { padding:8px 9px 10px; }

        .g-card-cat {
          font-size:7px; font-weight:700;
          letter-spacing:0.12em; color:var(--sage);
          text-transform:uppercase; margin-bottom:3px;
        }

        .g-card-name {
          font-family:'Cormorant Garamond', serif;
          font-size:13px; font-weight:600; color:var(--text);
          line-height:1.2; margin-bottom:4px;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
          overflow:hidden;
        }

        .g-card-desc {
          font-size: 9px;
          color: var(--mtext);
          margin: 2px 0 4px;
          line-height: 1.35;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
        }
        .g-card-farmer {
          display:flex; align-items:center; gap:4px; margin-bottom:5px;
        }
        .g-farmer-avatar {
          width:12px; height:12px;
          background:linear-gradient(135deg,var(--emerald),var(--fern));
          border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:6px; flex-shrink:0;
        }
        .g-farmer-name { font-size:9px; color:var(--dtext); font-weight:500; }

        .g-stars { display:flex; align-items:center; gap:1px; margin-bottom:6px; }

        .g-card-actions { display:flex; gap:5px; }

        .g-wa-btn {
          flex:1; height:28px;
          background:linear-gradient(135deg,var(--emerald),var(--fern));
          border:none; border-radius:9px; color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:8px; font-weight:700; letter-spacing:0.04em;
          cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:5px;
          transition:all 0.3s ease;
          box-shadow:0 4px 16px rgba(37,137,74,0.3);
        }
        .g-wa-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(37,137,74,0.45); }

        .g-add-btn {
          width:28px; height:28px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:9px;
          color:var(--mtext); font-size:14px;
          cursor:pointer; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          transition:all 0.3s cubic-bezier(.34,1.56,.64,1);
          font-weight:300;
        }
        .g-add-btn:hover { background:var(--mist); color:var(--jade); border-color:var(--jade); transform:scale(1.1); }
        .g-add-btn.done  { background:linear-gradient(135deg,var(--emerald),var(--jade)); color:#fff; border-color:transparent; animation:g-cart-pop 0.42s cubic-bezier(.34,1.56,.64,1); }

        @keyframes g-cart-pop {
          0%   { transform:scale(1); }
          40%  { transform:scale(1.35) rotate(-8deg); }
          70%  { transform:scale(0.92); }
          100% { transform:scale(1); }
        }

        .g-empty { grid-column:1/-1; text-align:center; padding:80px 20px; }

        .g-loadmore-btn {
          padding:12px 26px; border-radius:14px; border:1.5px solid var(--border);
          background:var(--alabaster); color:var(--jade); font-family:'DM Sans', sans-serif;
          font-size:13px; font-weight:700; letter-spacing:0.02em; cursor:pointer;
          transition:all 0.2s ease;
        }
        .g-loadmore-btn:hover:not(:disabled) { background:var(--mist); border-color:var(--jade); transform:translateY(-2px); }
        .g-loadmore-btn:disabled { opacity:0.6; cursor:default; }

        .g-skel { pointer-events:none; }
        .g-skel-shimmer, .g-skel-line {
          background:linear-gradient(90deg, var(--mist) 25%, var(--alabaster) 50%, var(--mist) 75%);
          background-size:200% 100%;
          animation:g-shimmer 1.4s ease-in-out infinite;
          border-radius:6px;
        }
        .g-skel-line { height:9px; margin:6px 9px; }
        @keyframes g-shimmer {
          0%   { background-position:200% 0; }
          100% { background-position:-200% 0; }
        }
        .g-empty-glyph {
          font-family:'Italiana', serif;
          font-size:80px; color:var(--mint); letter-spacing:0.05em;
          display:block; margin-bottom:16px; line-height:1;
        }
        .g-empty-title {
          font-family:'Cormorant Garamond', serif;
          font-size:28px; font-style:italic; font-weight:600;
          color:var(--mtext); margin-bottom:8px;
        }
        .g-empty-sub { font-size:13px; color:var(--dtext); margin-bottom:24px; }
        .g-empty-btn {
          display:inline-flex; align-items:center; gap:8px;
          padding:13px 34px;
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          border:none; border-radius:100px;
          color:#fff; font-weight:700; font-size:12px;
          letter-spacing:0.1em; cursor:pointer;
          transition:all 0.3s ease;
          box-shadow:0 8px 28px rgba(37,137,74,0.35);
        }
        .g-empty-btn:hover { transform:translateY(-3px); box-shadow:0 16px 40px rgba(37,137,74,0.5); }

        .g-nav {
          position:fixed; bottom:0; left:0; right:0; z-index:300;
          background:rgba(255,255,255,0.96);
          backdrop-filter:blur(24px) saturate(1.8);
          -webkit-backdrop-filter:blur(24px) saturate(1.8);
          border-top:1.5px solid var(--border);
          box-shadow:0 -20px 60px rgba(13,74,31,0.1), 0 -1px 0 rgba(255,255,255,0.9);
          padding-bottom:env(safe-area-inset-bottom);
        }
        .g-nav-inner {
          max-width:480px; margin:0 auto;
          display:flex; align-items:center; justify-content:space-around;
          padding:8px 0 12px;
        }
        .g-nav-btn {
          display:flex; flex-direction:column; align-items:center; gap:3px;
          background:none; border:none; cursor:pointer;
          color:var(--dtext); text-decoration:none;
          padding:4px 10px; border-radius:14px;
          transition:all 0.25s ease;
        }
        .g-nav-btn:hover { color:var(--mtext); }
        .g-nav-btn.on    { color:var(--emerald); }
        .g-nav-ic { font-size:20px; line-height:1; }
        .g-nav-lbl {
          font-family:'DM Sans', sans-serif;
          font-size:7px; font-weight:700; letter-spacing:0.12em;
        }

        .g-nav-cta {
          display:flex; flex-direction:column; align-items:center; gap:4px;
          background:none; border:none; cursor:pointer;
          position:relative; top:-14px;
        }
        .g-nav-cta-ring {
          width:60px; height:60px;
          background:linear-gradient(145deg,var(--fern),var(--emerald),var(--forest));
          border-radius:20px;
          display:flex; align-items:center; justify-content:center;
          box-shadow:
            0 8px 32px rgba(37,137,74,0.5),
            0 0 0 1px rgba(255,255,255,0.3),
            0 0 0 3px rgba(37,137,74,0.15),
            inset 0 1px 0 rgba(255,255,255,0.3);
          transition:all 0.4s cubic-bezier(.34,1.56,.64,1);
          color:#fff;
        }
        .g-nav-cta:hover .g-nav-cta-ring {
          transform:scale(1.12) rotate(-5deg);
          box-shadow:0 16px 48px rgba(37,137,74,0.65);
        }
        .g-nav-cta-lbl {
          font-size:6.5px; font-weight:800; letter-spacing:0.12em;
          color:var(--sage);
        }

        .g-user-menu {
          position:absolute; right:0; top:calc(100%+10px);
          width:240px;
          background:var(--snow);
          border:1.5px solid var(--border2);
          border-radius:22px; overflow:hidden;
          box-shadow:var(--shadow-xl), inset 0 1px 0 rgba(255,255,255,0.9);
          animation:g-pop 0.2s cubic-bezier(.34,1.56,.64,1);
          z-index:500;
        }
        .g-user-menu-up {
          top:auto; bottom:calc(100% + 10px); right:-8px;
          width:220px;
        }
        .g-um-head {
          padding:16px 18px;
          border-bottom:1px solid var(--border);
          background:linear-gradient(135deg,var(--mist),var(--alabaster));
        }
        .g-um-role {
          font-size:8px; font-weight:800; letter-spacing:0.18em;
          color:var(--sage); margin-bottom:3px;
        }
        .g-um-email {
          font-size:12px; font-weight:500; color:var(--text);
          overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        }
        .g-um-item {
          display:flex; align-items:center; gap:10px;
          padding:11px 18px;
          font-size:12px; font-weight:500; color:var(--mtext);
          cursor:pointer; transition:all 0.2s;
          text-decoration:none; border:none; background:none; width:100%;
        }
        .g-um-item:hover { background:var(--mist); color:var(--text); }
        .g-um-item.red   { color:rgba(239,68,68,0.8); }
        .g-um-item.red:hover { background:rgba(239,68,68,0.06); color:#EF4444; }

        .g-overlay {
          position:fixed; inset:0; z-index:400;
          background:rgba(13,46,21,0.4);
          backdrop-filter:blur(20px) saturate(1.5);
          -webkit-backdrop-filter:blur(20px) saturate(1.5);
          animation:g-fade 0.3s ease;
        }
        @keyframes g-fade { from{opacity:0} to{opacity:1} }

        .g-drawer {
          position:fixed; bottom:0; left:0; right:0; z-index:401;
          max-height:90vh;
          background:var(--snow);
          border-radius:30px 30px 0 0;
          border-top:2px solid var(--border2);
          overflow-y:auto; scrollbar-width:none;
          box-shadow:0 -40px 100px rgba(13,74,31,0.25), inset 0 1px 0 rgba(255,255,255,0.9);
          animation:g-up 0.45s cubic-bezier(.16,1,.3,1);
        }
        .g-drawer::-webkit-scrollbar { display:none; }
        @keyframes g-up { from{transform:translateY(100%)} to{transform:translateY(0)} }

        .g-drawer-handle {
          display:flex; align-items:center; justify-content:center;
          padding:14px 0 8px;
        }
        .g-drawer-handle-bar {
          width:44px; height:5px;
          background:var(--silk);
          border-radius:5px;
        }

        .g-drawer-top {
          position:sticky; top:0; z-index:5;
          background:var(--snow);
          padding:0 20px 12px;
          display:flex; align-items:center; justify-content:space-between;
          border-bottom:1px solid var(--border);
        }
        .g-drawer-cat-pill {
          font-size:9px; font-weight:700; letter-spacing:0.14em;
          color:var(--emerald);
          background:var(--mist);
          border:1.5px solid var(--border2);
          padding:5px 14px; border-radius:100px;
        }
        .g-drawer-close {
          width:36px; height:36px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--mtext); font-size:14px;
          transition:all 0.25s ease;
          box-shadow:var(--shadow-sm);
        }
        .g-drawer-close:hover { background:var(--mist); color:var(--text); transform:rotate(90deg); border-color:var(--border2); }

        .g-drawer-gallery { position:relative; width:100%; aspect-ratio:4/3; background:var(--alabaster); }
        .g-drawer-gallery::after {
          content:'';
          position:absolute; bottom:0; left:0; right:0; height:45%;
          background:linear-gradient(to top, var(--snow) 0%, transparent 100%);
          pointer-events:none;
        }

        .g-gallery-dots {
          position:absolute; bottom:16px; left:50%;
          transform:translateX(-50%);
          display:flex; gap:6px; z-index:2;
        }
        .g-gdot {
          height:4px; border-radius:4px; border:none; cursor:pointer;
          background:rgba(255,255,255,0.5); width:16px;
          transition:all 0.3s ease;
        }
        .g-gdot.on { background:var(--snow); width:30px; box-shadow:0 2px 8px rgba(0,0,0,0.2); }

        .g-dc { padding:20px 20px 0; }
        .g-dc-name {
          font-family:'Cormorant Garamond', serif;
          font-size:34px; font-weight:700; color:var(--forest);
          line-height:1.05; margin-bottom:10px; letter-spacing:-0.01em;
        }
        .g-dc-price-row { display:flex; align-items:baseline; gap:8px; margin-bottom:16px; }
        .g-dc-price {
          font-family:'Cormorant Garamond', serif;
          font-size:46px; font-weight:700; color:var(--jade);
          line-height:1; letter-spacing:0.01em;
        }
        .g-dc-unit { font-size:13px; color:var(--dtext); font-weight:400; }
        .g-dc-desc { font-size:13px; line-height:1.75; color:var(--mtext); margin-bottom:18px; }

        .g-dc-meta { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
        .g-meta-row {
          display:flex; align-items:center; gap:12px;
          padding:12px 14px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:15px;
        }
        .g-meta-icon {
          width:32px; height:32px;
          background:var(--mist);
          border-radius:10px;
          display:flex; align-items:center; justify-content:center;
          font-size:15px; flex-shrink:0;
          border:1px solid var(--border);
        }
        .g-meta-text { font-size:12px; font-weight:500; color:var(--mtext); }
        .g-meta-text span { color:var(--jade); font-weight:600; }

        .g-dc-actions { display:flex; gap:10px; padding:20px; }
        .g-dwa {
          flex:1; height:56px;
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          border:none; border-radius:18px; color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:13px; font-weight:700; letter-spacing:0.04em;
          cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.3s ease;
          box-shadow:0 6px 24px rgba(37,137,74,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .g-dwa:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(37,137,74,0.55); }

        .g-dcart {
          flex:1; height:56px;
          background:var(--forest);
          border:none; border-radius:18px; color:#fff;
          font-family:'DM Sans', sans-serif;
          font-size:13px; font-weight:800; letter-spacing:0.04em;
          cursor:pointer;
          display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.3s ease;
          box-shadow:0 6px 24px rgba(13,74,31,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .g-dcart:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(13,74,31,0.45); background:var(--emerald); }

        .g-recs { border-top:1px solid var(--border); padding:20px 20px 32px; }
        .g-recs-title {
          font-family:'Cormorant Garamond', serif;
          font-size:18px; font-style:italic; font-weight:600;
          color:var(--mtext); margin-bottom:14px;
          display:flex; align-items:center; gap:8px;
        }
        .g-recs-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        .g-rec {
          display:flex; gap:10px; padding:10px;
          background:var(--alabaster);
          border:1.5px solid var(--border);
          border-radius:15px; cursor:pointer;
          transition:all 0.25s ease;
        }
        .g-rec:hover { background:var(--mist); border-color:var(--jade); transform:translateY(-2px); box-shadow:var(--shadow-md); }
        .g-rec-img {
          width:50px; height:50px; border-radius:11px;
          overflow:hidden; background:var(--silk); flex-shrink:0;
        }
        .g-rec-cat  { font-size:7.5px; font-weight:700; letter-spacing:0.12em; color:var(--sage); margin-bottom:2px; }
        .g-rec-name {
          font-family:'Cormorant Garamond', serif;
          font-size:13px; font-weight:600; color:var(--text);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .g-rec-price { font-size:10px; font-weight:600; color:var(--jade); margin-top:2px; }

        .g-motif {
          text-align:center; padding:8px 0 24px;
          color:var(--silk); font-size:11px;
          letter-spacing:0.4em; user-select:none;
        }
      `}</style>

      <header className={`g-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="g-header-inner">
          <div className="g-logo-row">
            <Link href="/" className="g-logo-link">
              <div className="g-wordmark">
                <div className="g-wordmark-main">AGRIMARCHÉ</div>
                <div className="g-wordmark-sub">MARCHÉ PAYSAN DU SÉNÉGAL</div>
              </div>
            </Link>

          </div>

          <div className="g-search-row">
            <div className="g-search-box">
              <span className="g-search-ic">◎</span>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tomates Casamance, mil Thiès, oignons Potou…"
                className="g-search-input"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="g-cats">
        <div className="g-cats-inner">
          {CATEGORIES.map(c => (
            <button
              key={c.label}
              onClick={() => setCat(c.label)}
              className={`g-cat ${cat === c.label ? 'on' : ''}`}
            >
              {c.icon && <span className="g-cat-ic">{c.icon}</span>}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="g-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, position: 'relative' }}>
          {/* Bouton localisation GPS */}
          <button
            className="g-loc-chip"
            onClick={() => router.push('/main/location')}
            style={{ minWidth: 0, flexShrink: 0 }}
            title="Changer ma position"
          >
            <div className={`g-loc-pulse ${locStatus}`} />
            <span className="g-loc-text" style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {locStatus === 'searching' ? 'Localisation...' :
               locStatus === 'error'     ? 'Sénégal' :
               location?.detailedAddress || location?.address || 'Sénégal'}
            </span>
          </button>
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setShowSort(v => !v)}
            className={`g-sort-trigger ${sort !== 'default' ? 'on' : ''}`}
          >
            ⚖ {sort === 'asc' ? 'PRIX ↑' : sort === 'desc' ? 'PRIX ↓' : 'TRIER'}
          </button>
          {showSort && (
            <div className="g-sort-menu">
              {(['default', 'asc', 'desc'] as const).map(m => (
                <button key={m} onClick={() => { setSort(m); setShowSort(false); }} className={`g-sort-item ${sort === m ? 'on' : ''}`}>
                  {m === 'default' ? '◈  Pertinence' : m === 'asc' ? '↑  Prix croissant' : '↓  Prix décroissant'}
                  {sort === m && <span style={{ color: 'var(--jade)' }}>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {homeSections.map((section, sIdx) => (
        <div key={section.key} className="g-hsec">
          <div className="g-hsec-head">
            <span className="g-hsec-icon">{section.icon}</span>
            <h2 className="g-hsec-title">{section.title}</h2>
          </div>
          <div className="g-hrow">
            {section.items.map((p, pIdx) => {
              const img = (p.images ?? [])[0];
              const dist = section.distances?.get(p.id);
              const priority = sIdx === 0 && pIdx < 3;
              return (
                <div key={p.id} className="g-hcard" onClick={() => open(p)}>
                  <div className="g-hcard-img">
                    {img ? (
                      <img
                        src={cld(img, 260, 260)}
                        alt={p.name}
                        loading={priority ? 'eager' : 'lazy'}
                        decoding="async"
                        fetchPriority={priority ? 'high' : 'auto'}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🌾</div>
                    )}
                    {p.farmerVerified && <div className="g-hcard-verified">✓</div>}
                  </div>
                  <div className="g-hcard-name">{p.name}</div>
                  <div className="g-hcard-price">
                    {p.price?.toLocaleString()} <span>FCFA/{p.unit || 'kg'}</span>
                  </div>
                  {dist !== undefined && (
                    <div className="g-hcard-dist">{dist.toFixed(1)} km</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ── CARROUSEL ANNONCES ── */}
      {ads.length > 0 && (
        <div style={{ padding: '0 16px 4px', position: 'relative' }}>
          <div
            onClick={() => { const ad = ads[adIdx]; if (ad?.linkUrl) window.location.href = ad.linkUrl; }}
            style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', cursor: ads[adIdx]?.linkUrl ? 'pointer' : 'default', boxShadow: '0 8px 32px rgba(13,74,31,0.14)' }}
          >
            {/* Image avec fallback couleur si URL cassée */}
            {ads[adIdx]?.imageUrl && ads[adIdx].imageUrl.startsWith('http') ? (
              <img
                src={cld(ads[adIdx].imageUrl, 800, 320)}
                alt={ads[adIdx]?.title || 'Annonce'}
                loading="lazy"
                decoding="async"
                onError={e => { const el = e.currentTarget; el.style.display = 'none'; (el.nextElementSibling as HTMLElement).style.display = 'flex'; }}
                style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
              />
            ) : null}
            {/* Fallback si pas d'image valide */}
            <div style={{
              display: (ads[adIdx]?.imageUrl && ads[adIdx].imageUrl.startsWith('http')) ? 'none' : 'flex',
              width: '100%', height: 160,
              background: 'linear-gradient(135deg, var(--forest), var(--jade))',
              alignItems: 'center', justifyContent: 'center',
              fontSize: 48,
            }}>🌾</div>
            {/* Overlay bas */}
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.72))', padding: '28px 14px 12px' }}>
              {ads[adIdx]?.badge && (
                <span style={{ display: 'inline-block', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 6, marginBottom: 4, letterSpacing: '0.06em' }}>
                  {ads[adIdx].badge}
                </span>
              )}
              <div style={{ color: '#fff', fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>{ads[adIdx]?.title}</div>
              {ads[adIdx]?.type === 'promotion' && ads[adIdx]?.discountedPrice ? (
                <div style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ color: '#00ff87', fontWeight: 800, fontSize: 13 }}>{ads[adIdx].discountedPrice.toLocaleString()} FCFA</span>
                  {ads[adIdx]?.originalPrice && <span style={{ textDecoration: 'line-through', color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{ads[adIdx].originalPrice.toLocaleString()}</span>}
                  <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>-{ads[adIdx].discountPercent}%</span>
                </div>
              ) : ads[adIdx]?.partnerName ? (
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11, marginTop: 2 }}>Partenaire · {ads[adIdx].partnerName}</div>
              ) : null}
            </div>
            {/* Dots */}
            {ads.length > 1 && (
              <div style={{ position: 'absolute', bottom: 10, right: 12, display: 'flex', gap: 5 }}>
                {ads.map((_: any, i: number) => (
                  <button
                    key={i}
                    onClick={e => { e.stopPropagation(); setAdIdx(i); }}
                    style={{ width: i === adIdx ? 18 : 6, height: 6, borderRadius: 3, border: 'none', background: i === adIdx ? '#00ff87' : 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0, transition: 'all 0.3s' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <main className="g-main">
        <div className="g-section-head">
          <h2 className="g-section-title">
            {cat === 'Tous' ? 'Tous les produits' : cat}
          </h2>
          <div className="g-section-line" />
          <span className="g-section-badge">DIRECT PRODUCTEUR</span>
        </div>

        {loadError && debugErrorDetail && (
          <div style={{
            margin: '0 20px 12px', padding: '8px 12px', borderRadius: 8,
            background: '#fff3f3', border: '1px solid #ffc9c9',
            fontSize: 12, color: '#c92a2a', fontFamily: 'monospace',
            wordBreak: 'break-word',
          }}>
            🔧 Diagnostic (temporaire) : {debugErrorDetail}
          </div>
        )}

        <div className="g-grid">
          {!productsLoaded ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={`skel-${i}`} className="g-card g-skel">
                <div className="g-card-visual g-skel-shimmer" />
                <div className="g-card-body">
                  <div className="g-skel-line" style={{ width: '40%' }} />
                  <div className="g-skel-line" style={{ width: '80%', height: 12 }} />
                  <div className="g-skel-line" style={{ width: '55%' }} />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="g-empty">
              <span className="g-empty-glyph">VIDE</span>
              <div className="g-empty-title">Aucun produit trouvé</div>
              <p className="g-empty-sub">Essayez une autre recherche ou catégorie.</p>
              <button onClick={() => { setSearch(''); setCat('Tous'); }} className="g-empty-btn">
                ✦ TOUT AFFICHER
              </button>
            </div>
          ) : (
            filtered.map((p, idx) => {
              const rd    = ratings.get(p.sellerId || '');
              const stars = rd?.averageRating || 0;
              const cnt   = rd?.reviewCount   || 0;
              const isHero = idx % 9 === 0 && idx !== 0;

              return (
                <div
                  key={p.id}
                  className={`g-card ${isHero ? 'hero' : ''}`}
                  style={{ animationDelay: `${Math.min(idx * 38, 700)}ms` }}
                  onClick={() => open(p)}
                >
                  <div className="g-card-visual">
                    {(() => {
                      const imgs = (p.images ?? []).slice(0, 5);
                      const ci = getCardImg(p.id);
                      return (
                        <>
                          {imgs[ci] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={cld(imgs[ci], isHero ? 700 : 380, isHero ? 400 : 380)}
                              alt={p.name}
                              loading={idx < 4 ? 'eager' : 'lazy'}
                              decoding="async"
                              fetchPriority={idx < 4 ? 'high' : 'auto'}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s cubic-bezier(.16,1,.3,1)' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, background: 'var(--graphite)' }}>🌾</div>
                          )}
                          <div className="g-card-fog" />
                          {p.farmerVerified && <div className="g-verified">✓ VÉRIFIÉ</div>}
                          {/* Flèches carousel — visibles dès qu'il y a des images */}
                          {imgs.length > 0 && (
                            <>
                              <button
                                className="g-carr-arrow left"
                                onClick={e => { setCardImg(p.id, (ci - 1 + imgs.length) % imgs.length, e); }}
                              >‹</button>
                              <button
                                className="g-carr-arrow right"
                                onClick={e => { setCardImg(p.id, (ci + 1) % imgs.length, e); }}
                              >›</button>
                              {imgs.length > 1 && (
                                <div className="g-carr-dots">
                                  {imgs.map((_, i) => (
                                    <button
                                      key={i}
                                      className={`g-carr-dot ${i === ci ? 'on' : ''}`}
                                      onClick={e => setCardImg(p.id, i, e)}
                                    />
                                  ))}
                                </div>
                              )}
                            </>
                          )}
                          <div className="g-card-price">
                            <div>
                              <div className="g-price-n">{p.price?.toLocaleString()}</div>
                              <div className="g-price-u">FCFA / {p.unit || 'kg'}</div>
                            </div>
                          </div>
                          <button onClick={e => toggleWish(p.id, e)} className={`g-wish ${wishlist.has(p.id) ? 'on' : ''}`}>
                            {wishlist.has(p.id) ? '♥️' : '♡'}
                          </button>
                        </>
                      );
                    })()}
                  </div>

                  <div className="g-card-body">
                    <div className="g-card-cat">{p.category}</div>
                    <h3 className="g-card-name">{p.name}</h3>
                    {p.description && (
                      <p className="g-card-desc">{p.description}</p>
                    )}
                    <div className="g-card-farmer">
                      <div className="g-farmer-avatar">🌱</div>
                      <span className="g-farmer-name">{p.farmer?.split(' ')[0] || 'Producteur'}</span>
                    </div>
                    {cnt > 0 && (
                      <div className="g-stars">
                        {[1,2,3,4,5].map(i => (
                          <svg key={i} width={10} height={10} viewBox="0 0 24 24"
                            fill={i <= Math.floor(stars) ? 'var(--jade)' : 'rgba(13,74,31,0.15)'}>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                          </svg>
                        ))}
                        <span style={{ fontSize: 8, color: 'var(--dtext)', marginLeft: 3 }}>({cnt})</span>
                      </div>
                    )}
                    <div className="g-card-actions">
                      <button onClick={e => { wa(p.name, p.farmerPhone, p.id, e); }} className="g-wa-btn">
                        <WaIcon s={10} /> CONTACTER
                      </button>
                      <button
                        onClick={e => addCart(p, e)}
                        className={`g-add-btn ${addedIds.has(p.id) ? 'done' : ''}`}
                        aria-label="Ajouter au panier"
                      >
                        {addedIds.has(p.id) ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          <CartIcon s={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {productsLoaded && filtered.length > 0 && hasMore && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '18px 14px 4px' }}>
            <button
              onClick={() => { setLoadingMore(true); setPageLimit(v => v + PAGE_SIZE); }}
              disabled={loadingMore}
              className="g-loadmore-btn"
            >
              {loadingMore ? 'Chargement…' : 'Voir plus de produits'}
            </button>
          </div>
        )}

        <div className="g-motif">— ✦ ◈ ✦ —</div>
      </main>



      <nav className="g-nav">
        <div className="g-nav-inner">
          <Link href="/" className="g-nav-btn on">
            <span className="g-nav-ic">⌂</span>
            <span className="g-nav-lbl">ACCUEIL</span>
          </Link>

          <button
            className="g-nav-cta"
            onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Bonjour, je souhaite commander sur AgriMarché.')}`, '_blank')}
          >
            <div className="g-nav-cta-ring"><WaIcon s={26} /></div>
            <span className="g-nav-cta-lbl">WHATSAPP</span>
          </button>

          <Link href="/cart" className="g-nav-btn" style={{ position: 'relative' }}>
            <span className="g-nav-ic"><CartIcon s={20} /></span>
            <span className="g-nav-lbl">PANIER</span>
            {cartCount > 0 && <span className="cart-badge cart-badge-nav">{cartCount}</span>}
          </Link>

          <div style={{ position: 'relative' }}>
            <button className="g-nav-btn" onClick={() => setShowUserMenu(v => !v)}>
              <span className="g-nav-ic">{user ? '👤' : '◎'}</span>
              <span className="g-nav-lbl">COMPTE</span>
            </button>
            {showUserMenu && (
              <div className="g-user-menu g-user-menu-up">
                <div className="g-um-head">
                  <div className="g-um-role">COMPTE</div>
                  <div className="g-um-email">
                    {profile?.displayName || profile?.phone || user?.email || 'Invité'}
                  </div>
                </div>
                <Link href="/privacy" className="g-um-item">🛡️ &nbsp;Confidentialité</Link>
                <Link href="/conditions-utilisation" className="g-um-item">📋 &nbsp;Conditions d'utilisation</Link>
                <Link href="/account" className="g-um-item">👤 &nbsp;Mon compte</Link>
                {user && (
                  <button onClick={async () => { await logout(); router.push('/'); }} className="g-um-item red">
                    🚪 &nbsp;Déconnexion
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </nav>

      {selected && (
        <>
          <div className="g-overlay" onClick={close} />
          <div className="g-drawer" ref={drawerRef}>
            <div className="g-drawer-handle">
              <div className="g-drawer-handle-bar" />
            </div>

            <div className="g-drawer-top">
              <span className="g-drawer-cat-pill">{selected.category}</span>
              <button className="g-drawer-close" onClick={close}>✕</button>
            </div>

            <div className="g-drawer-gallery">
              {(() => {
                const galleryImages = (selected.images ?? []).slice(0, 5); // ✅ 5 images max par produit
                return (
                  <>
                    {galleryImages[imgIdx] ? (
                      <img src={cld(galleryImages[imgIdx], 900, 900, 'limit')} alt={selected.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>🌾</div>
                    )}
                    {/* Flèches drawer */}
                    {galleryImages.length > 1 && (
                      <>
                        <button
                          onClick={() => setImgIdx(i => (i - 1 + galleryImages.length) % galleryImages.length)}
                          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', zIndex: 10 }}
                        >‹</button>
                        <button
                          onClick={() => setImgIdx(i => (i + 1) % galleryImages.length)}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '50%', width: 36, height: 36, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.18)', zIndex: 10 }}
                        >›</button>
                        <div className="g-gallery-dots">
                          {galleryImages.map((_, i) => (
                            <button key={i} onClick={() => setImgIdx(i)} className={`g-gdot ${imgIdx === i ? 'on' : ''}`} />
                          ))}
                        </div>
                      </>
                    )}
                  </>
                );
              })()}
            </div>

            <div className="g-dc">
              <h2 className="g-dc-name">{selected.name}</h2>
              <div className="g-dc-price-row">
                <span className="g-dc-price">{selected.price?.toLocaleString()}</span>
                <span className="g-dc-unit">FCFA / {selected.unit || 'kg'}</span>
              </div>
              {selected.description && <p className="g-dc-desc">{selected.description}</p>}

              <div className="g-dc-meta">
                <div className="g-meta-row">
                  <div className="g-meta-icon">📍</div>
                  <span className="g-meta-text">{selected.exactLocation || selected.region || 'Sénégal'}</span>
                </div>
                <div className="g-meta-row">
                  <div className="g-meta-icon">🌾</div>
                  <span className="g-meta-text">
                    {selected.farmer || 'Producteur local'}
                    {/* numéro masqué — visible uniquement via WhatsApp */}
                  </span>
                </div>
                {selected.stock !== undefined && (
                  <div className="g-meta-row">
                    <div className="g-meta-icon">📦</div>
                    <span className="g-meta-text">Stock disponible : <span>{selected.stock} {selected.unit || 'unités'}</span></span>
                  </div>
                )}
              </div>
            </div>

            <div className="g-dc-actions">
              <button onClick={() => wa(selected.name, selected.farmerPhone, selected.id)} className="g-dwa">
                <WaIcon s={16} /> Commander
              </button>
              <button onClick={() => addCart(selected)} className="g-dcart">
                🛒 Panier
              </button>
            </div>

            {recommendationSections.length > 0 && (
              <div style={{ margin: '0 20px 4px', padding: '12px 16px', background: 'rgba(37,137,74,0.06)', border: '1px solid rgba(37,137,74,0.15)', borderRadius: 14 }}>
                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--sage)', textTransform: 'uppercase', marginBottom: 10 }}>
                  ✦ Suggestions personnalisées
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
                  <tbody>
                    {[
                      { icon: '📍', label: 'Région',      desc: 'Produits populaires dans votre région',          prio: 1 },
                      { icon: '👨‍🌾', label: 'Producteur',  desc: 'Autres produits du même producteur',             prio: 2 },
                      { icon: '📍', label: 'Proximité',   desc: 'Produits les plus proches géographiquement (GPS)',prio: 3 },
                      { icon: '📂', label: 'Catégorie',   desc: 'Produits de la même catégorie',                  prio: 4 },
                    ]
                    .filter(row => recommendationSections.some(s => s.badge.includes(row.label)))
                    .map(row => (
                      <tr key={row.label}>
                        <td style={{ padding: '4px 6px 4px 0', color: 'var(--jade)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                          {row.icon} {row.label}
                        </td>
                        <td style={{ padding: '4px 0', color: 'var(--mtext)' }}>{row.desc}</td>
                        <td style={{ padding: '4px 0 4px 8px', color: 'var(--dtext)', fontWeight: 700, textAlign: 'right' }}>#{row.prio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {recommendationSections.map(section => (
              <div key={section.title} className="g-recs">
                <div className="g-recs-title">
                  <span style={{ color: 'var(--jade)', fontSize: 12 }}>✦</span>
                  {section.title}
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--sage)', textTransform: 'uppercase', marginLeft: 'auto' }}>
                    {section.badge}
                  </span>
                </div>
                <div className="g-recs-grid">
                  {section.items.map(r => (
                    <div key={r.id} className="g-rec" onClick={() => { setSelected(r); setImgIdx(0); drawerRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                      <div className="g-rec-img" style={{ position: 'relative' }}>
                        {(() => {
                          const rimgs = (r.images ?? []).slice(0, 5);
                          const ri = getRecImg(r.id);
                          return (
                            <>
                              {rimgs[ri]
                                ? <img src={cld(rimgs[ri], 100, 100)} alt={r.name} loading="lazy" decoding="async" style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌾</div>}
                              {rimgs.length > 1 && (
                                <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 3 }}>
                                  {rimgs.map((_, i) => (
                                    <button
                                      key={i}
                                      onClick={e => setRecImg(r.id, i, e)}
                                      style={{
                                        width: i === ri ? 10 : 5, height: 5, borderRadius: 3, border: 'none', cursor: 'pointer', padding: 0,
                                        background: i === ri ? '#fff' : 'rgba(255,255,255,0.45)',
                                        transition: 'all 0.2s',
                                      }}
                                    />
                                  ))}
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="g-rec-cat">{r.category}</div>
                        <div className="g-rec-name">{r.name}</div>
                        <div className="g-rec-price">
                          {r.price?.toLocaleString()} FCFA
                          {section.distances?.has(r.id) && (
                            <span style={{ color: 'var(--sage)', fontWeight: 500 }}>
                              &ensp;·&ensp;{section.distances.get(r.id)!.toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <div style={{ height: 40 }} />
          </div>
        </>
      )}
    </>
  );
}
