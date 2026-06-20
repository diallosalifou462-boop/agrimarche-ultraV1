'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';

const CATEGORIES = [
  { label: 'Tous', icon: '✦', color: '#C9A84C' },
  { label: 'Fruits', icon: '', color: '#E8703A' },
  { label: 'Légumes', icon: '', color: '#3D9A5C' },
  { label: 'Céréales', icon: '', color: '#C9A84C' },
  { label: 'Tubercules', icon: '', color: '#8B6914' },
  { label: 'Machines agricoles', icon: '', color: '#607080' },
  { label: 'Condiments', icon: '', color: '#C0392B' },
  { label: 'Poissons', icon: '', color: '#2980B9' },
  { label: 'Produits laitiers', icon: '', color: '#B0A090' },
  { label: 'Légumineuses', icon: '', color: '#7D6A3E' },
  { label: 'Engrais', icon: '', color: '#2ECC71' },
  { label: 'Boissons locales', icon: '', color: '#E74C3C' },
];

const WA_NUMBER = '221779747073';

// Sanitize and validate an image URL before handing it to next/image.
// Some product photo URLs stored in Firestore have been seen with stray
// quotes/commas/whitespace from copy-paste, which makes `next/image`
// throw "Failed to parse src" / "Invalid URL" at runtime. This strips
// that junk and falls back to null (placeholder) if the result still
// isn't a usable absolute URL or root-relative path.
function safeImageSrc(url?: string | null): string | null {
  if (!url) return null;
  let s = url.trim();
  s = s.replace(/^["']+|["']+$/g, '').trim();
  s = s.replace(/[,;]+$/g, '').trim();
  if (!s) return null;
  if (s.startsWith('/')) return s;
  try {
    // eslint-disable-next-line no-new
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

function WaIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z" />
    </svg>
  );
}

type Product = {
  id: string;
  name?: string;
  price?: number;
  unit?: string;
  category?: string;
  images?: string[];
  farmer?: string;
  farmerPhone?: string;
  farmerVerified?: boolean;
  region?: string;
  exactLocation?: string;
  description?: string;
  stock?: number;
  sellerId?: string;
};

type LocStatus = 'searching' | 'found' | 'error' | 'unavailable';

type LocationInfo = {
  address: string;
  lat: number;
  lng: number;
  precision: number;
  detailedAddress: string;
};

export default function AgriMarket() {
  const router = useRouter();
  const { cart, addToCart } = useCart();
  const { user, logout } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [filtered, setFiltered] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [listening, setListening] = useState(false);
  const [cat, setCat] = useState('Tous');
  const [sort, setSort] = useState('default');
  const [wishlist, setWishlist] = useState(new Set<string>());
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showSort, setShowSort] = useState(false);
  const [location, setLocation] = useState<LocationInfo | null>(null);
  const [locStatus, setLocStatus] = useState<LocStatus>('searching');
  const [addedIds, setAddedIds] = useState(new Set<string>());
  const [selected, setSelected] = useState<Product | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [recs, setRecs] = useState<Product[]>([]);
  const [ratings, setRatings] = useState(new Map<string, { sellerId: string; averageRating: number; reviewCount: number }>());
  const [heroVisible, setHeroVisible] = useState(false);
  const [categoryProducts, setCategoryProducts] = useState<Product[]>([]);

  const drawerRef = useRef<HTMLDivElement>(null);
  const voiceRef = useRef<any>(null);

  const cartCount = cart?.itemCount || 0;

  // ── Mount + hero animation
  useEffect(() => {
    setMounted(true);
    setTimeout(() => setHeroVisible(true), 100);
  }, []);

  // ── Scroll listener
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // ── Voice recognition (web only, silently skip on APK)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      if (!SR) return;
      voiceRef.current = new SR();
      voiceRef.current.lang = 'fr-FR';
      voiceRef.current.continuous = false;
      voiceRef.current.interimResults = false;
      voiceRef.current.onresult = (e: any) => { setSearch(e.results[0][0].transcript); setListening(false); };
      voiceRef.current.onerror = () => setListening(false);
      voiceRef.current.onend = () => setListening(false);
    } catch {
      // Silently ignore — pas disponible en WebView/APK
    }
  }, []);

  const startVoice = () => {
    if (voiceRef.current && !listening) {
      try { voiceRef.current.start(); setListening(true); } catch { setListening(false); }
    }
  };

  // ── Firestore products
  useEffect(() => {
    const u = onSnapshot(collection(db, 'products'), snap => {
      const d = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Product[];
      setProducts(d);
      setFiltered(d);
    });
    return () => u();
  }, []);

  // ── Ratings
  useEffect(() => {
    if (!products.length) return;
    [...new Set(products.map(p => p.sellerId).filter(Boolean))].forEach(sid => {
      onSnapshot(query(collection(db, 'reviews'), where('sellerId', '==', sid)), snap => {
        const revs = snap.docs.map(d => d.data());
        const cnt = revs.length;
        const avg = cnt ? revs.reduce((s, r) => s + (r.rating || 0), 0) / cnt : 0;
        setRatings(prev => {
          const m = new Map(prev);
          m.set(sid!, { sellerId: sid!, averageRating: +avg.toFixed(1), reviewCount: cnt });
          return m;
        });
      });
    });
  }, [products]);

  // ── Recs + category products
  useEffect(() => {
    if (selected && products.length) setRecs(products.filter(p => p.category === selected.category && p.id !== selected.id).slice(0, 6));
  }, [selected, products]);

  useEffect(() => {
    if (selected && products.length) setCategoryProducts(products.filter(p => p.category === selected.category && p.id !== selected.id).slice(0, 4));
  }, [selected, products]);

  // ── Géolocalisation — APK-safe avec fallbacks multiples
  const locate = useCallback((highAccuracy: boolean, triedFallback: boolean) => {
    // Fallback immédiat si API absente (WebView Android sans permission)
    if (typeof window === 'undefined' || !('geolocation' in navigator)) {
      setLocStatus('unavailable');
      setLocation({ address: 'Sénégal', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Sénégal' });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords: { latitude: lat, longitude: lng, accuracy } }) => {
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=19&addressdetails=1&extratags=1&namedetails=1`,
            { headers: { 'Accept-Language': 'fr-FR', 'User-Agent': 'AgriMarche/2.0' } }
          );
          const d = await r.json();
          const a = d.address || {};
          const amenity = d.extratags?.name || d.namedetails?.name || '';
          const university = a.university || '';
          const school = a.school || '';
          const college = a.college || '';
          const institution = a.institution || '';
          const road = a.road || '';
          const pedestrian = a.pedestrian || '';
          const footway = a.footway || '';
          const path = a.path || '';
          const street = road || pedestrian || footway || path;
          const suburb = a.suburb || a.neighbourhood || a.quarter || a.residential || a.city_district || a.borough || '';
          const hamlet = a.hamlet || '';
          const village = a.village || '';
          const town = a.town || '';
          const city = a.city || '';
          const state = a.state || '';

          let locationName = '';
          if (university) locationName = university;
          else if (school) locationName = school;
          else if (college) locationName = college;
          else if (institution) locationName = institution;
          else if (amenity) locationName = amenity;

          let detailedAddr = '';
          if (locationName) {
            detailedAddr = street ? `${locationName}, ${street}` : suburb ? `${locationName}, ${suburb}` : locationName;
          } else if (street && suburb) {
            detailedAddr = `${street}, ${suburb}`;
          } else if (street) {
            detailedAddr = street;
          } else if (suburb) {
            detailedAddr = suburb;
          } else if (hamlet) {
            detailedAddr = hamlet;
          } else if (village || town || city) {
            detailedAddr = village || town || city;
          } else {
            detailedAddr = 'Sénégal';
          }

          const addr = [city, state].filter(Boolean).join(', ') || 'Sénégal';
          setLocation({ address: addr, lat, lng, precision: accuracy, detailedAddress: detailedAddr });
          setLocStatus('found');
        } catch {
          setLocStatus('error');
          setLocation({ address: 'Non disponible', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Non disponible' });
        }
      },
      (err) => {
        // PERMISSION_DENIED (1) ou POSITION_UNAVAILABLE (2) ou TIMEOUT (3)
        if (err.code === 1) {
          // Permission refusée — fréquent sur APK sans manifest correct
          setLocStatus('unavailable');
          setLocation({ address: 'Sénégal', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Sénégal' });
        } else if (!triedFallback) {
          // GPS haute précision indisponible/trop lent (fréquent sur PC/laptop sans puce GPS,
          // qui ne dispose que de la géoloc réseau/Wi-Fi) → on retente en accuracy réseau.
          locate(false, true);
        } else {
          setLocStatus('error');
          setLocation({ address: 'Non disponible', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Non disponible' });
        }
      },
      { enableHighAccuracy: highAccuracy, timeout: highAccuracy ? 8000 : 12000, maximumAge: 60000 }
    );
  }, []);

  const getLocation = useCallback(() => {
    setLocStatus('searching');
    setLocation(null);
    locate(true, false);
  }, [locate]);

  useEffect(() => { getLocation(); }, [getLocation]);

  // ── Filtre + tri
  useEffect(() => {
    let r = [...products];
    if (search) r = r.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));
    if (cat !== 'Tous') r = r.filter(p => p.category === cat);
    if (sort === 'asc') r.sort((a, b) => (a.price || 0) - (b.price || 0));
    if (sort === 'desc') r.sort((a, b) => (b.price || 0) - (a.price || 0));
    setFiltered(r);
  }, [products, search, cat, sort]);

  const open = (p: Product) => { setSelected(p); setImgIdx(0); document.body.style.overflow = 'hidden'; };
  const close = () => { setSelected(null); document.body.style.overflow = ''; };

  const addCart = (p: Product, e?: React.MouseEvent) => {
    e?.stopPropagation();
    addToCart({ id: p.id, name: p.name, price: p.price, unit: p.unit, category: p.category, images: p.images || [], stock: p.stock || 999 } as any, 1);
    setAddedIds(prev => new Set(prev).add(p.id));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 2200);
  };

  const toggleWish = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWishlist(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };

  const wa = (name?: string, phone?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    window.open(`https://wa.me/${phone?.replace(/\D/g, '') || WA_NUMBER}?text=${encodeURIComponent(`Bonjour, je suis intéressé par "${name}".`)}`, '_blank');
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
          box-shadow: 0 1px 0 rgba(255,255,255,0.9), var(--shadow-md);
        }

        .g-header-inner {
          max-width:1400px; margin:0 auto;
          padding:16px 20px 0;
          position:relative; z-index:1;
        }

        .g-logo-row { display:flex; align-items:center; justify-content:space-between; }
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

        .g-header-right { display:flex; align-items:center; gap:8px; position:relative; }

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
          position:absolute; top:-6px; right:-6px;
          background:linear-gradient(135deg, var(--emerald), var(--jade));
          color:white; font-size:9px; font-weight:700;
          min-width:18px; height:18px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          padding:0 4px; box-shadow:0 2px 6px rgba(0,0,0,0.2);
        }

        .g-search-row { padding:14px 0 16px; }
        .g-search-box {
          position:relative; background:var(--snow);
          border:1.5px solid var(--border); border-radius:100px;
          display:flex; align-items:center;
          transition:all 0.35s cubic-bezier(.16,1,.3,1);
          overflow:hidden; box-shadow:var(--shadow-sm);
        }
        .g-search-box:focus-within {
          background:var(--snow); border-color:var(--jade);
          box-shadow:0 0 0 4px rgba(37,137,74,0.1), var(--shadow-md);
        }
        .g-search-ic { padding:0 14px 0 20px; color:var(--sage); font-size:15px; flex-shrink:0; pointer-events:none; }
        .g-search-input {
          flex:1; height:50px;
          background:transparent; border:none; outline:none;
          font-family:'DM Sans', sans-serif;
          font-size:13.5px; font-weight:400;
          color:var(--text); letter-spacing:0.01em;
        }
        .g-search-input::placeholder { color:var(--dtext); }
        .g-mic-btn {
          margin:5px; width:40px; height:40px;
          background:var(--alabaster); border:1px solid var(--border);
          border-radius:100px; display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:16px; transition:all 0.3s ease; flex-shrink:0; color:var(--mtext);
        }
        .g-mic-btn:hover { background:var(--mist); color:var(--jade); border-color:var(--border2); }
        .g-mic-btn.on {
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff; border-color:transparent;
          animation:g-ring 1.2s ease-in-out infinite;
        }
        @keyframes g-ring {
          0%,100% { box-shadow:0 0 0 0 rgba(37,137,74,0.5); }
          50%      { box-shadow:0 0 0 12px rgba(37,137,74,0); }
        }

        .g-cats {
          position:sticky; top:118px; z-index:190;
          background:rgba(248,250,248,0.95); backdrop-filter:blur(20px);
          border-bottom:1px solid var(--border);
          overflow-x:auto; scrollbar-width:none;
        }
        .g-cats::-webkit-scrollbar { display:none; }
        .g-cats-inner { display:flex; gap:5px; padding:10px 16px; min-width:max-content; }

        .g-cat {
          display:inline-flex; align-items:center; gap:6px;
          padding:8px 16px; border-radius:100px;
          border:1.5px solid transparent; background:transparent;
          font-family:'DM Sans', sans-serif;
          font-size:11px; font-weight:500;
          color:var(--mtext); cursor:pointer; white-space:nowrap;
          transition:all 0.22s cubic-bezier(.34,1.56,.64,1); letter-spacing:0.01em;
        }
        .g-cat:hover { background:var(--mist); color:var(--emerald); border-color:var(--border2); box-shadow:var(--shadow-sm); }
        .g-cat.on {
          background:linear-gradient(135deg,var(--emerald),var(--jade));
          color:#fff; border-color:transparent; font-weight:700;
          box-shadow:0 4px 18px rgba(37,137,74,0.3), inset 0 1px 0 rgba(255,255,255,0.2);
          transform:scale(1.04);
        }
        .g-cat-ic { font-size:13px; }

        .g-toolbar {
          position:sticky; top:172px; z-index:180;
          background:rgba(248,250,248,0.96); backdrop-filter:blur(16px);
          border-bottom:1px solid var(--border);
          padding:10px 20px;
          display:flex; align-items:center; justify-content:space-between; gap:12px;
        }

        .g-loc-chip {
          display:flex; align-items:center; gap:8px;
          padding:7px 14px;
          background:var(--mist); border:1.5px solid var(--border2);
          border-radius:100px; cursor:pointer;
          transition:all 0.25s ease; min-width:0; box-shadow:var(--shadow-sm);
        }
        .g-loc-chip:hover { background:var(--silk); border-color:var(--jade); box-shadow:var(--shadow-md); }
        .g-loc-pulse {
          width:8px; height:8px; border-radius:50%;
          background:var(--jade); flex-shrink:0;
          box-shadow:0 0 0 3px rgba(37,137,74,0.2); transition:background 0.3s;
        }
        .g-loc-pulse.searching  { background:#F59E0B; animation:g-blink 1s ease-in-out infinite; }
        .g-loc-pulse.error      { background:#EF4444; }
        .g-loc-pulse.unavailable{ background:#94A3B8; }
        @keyframes g-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        .g-loc-text {
          font-size:11px; font-weight:600; color:var(--emerald);
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;
        }

        .g-sort-trigger {
          display:flex; align-items:center; gap:6px; padding:7px 14px;
          background:var(--snow); border:1.5px solid var(--border); border-radius:100px;
          font-family:'DM Sans', sans-serif;
          font-size:11px; font-weight:600; color:var(--mtext);
          cursor:pointer; white-space:nowrap;
          transition:all 0.25s ease; letter-spacing:0.03em; flex-shrink:0; box-shadow:var(--shadow-sm);
        }
        .g-sort-trigger:hover { background:var(--mist); color:var(--emerald); border-color:var(--border2); }
        .g-sort-trigger.on    { background:var(--mist); color:var(--emerald); border-color:var(--jade); }

        .g-sort-menu {
          position:absolute; right:0; top:calc(100%+8px);
          background:var(--snow); border:1.5px solid var(--border2);
          border-radius:18px; overflow:hidden; min-width:190px;
          box-shadow:var(--shadow-lg), 0 0 0 1px rgba(255,255,255,0.8) inset;
          animation:g-pop 0.2s cubic-bezier(.34,1.56,.64,1); z-index:9;
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
          font-size:26px; font-weight:600; font-style:italic; color:var(--forest);
        }
        .g-section-line {
          flex:1; height:1px;
          background:linear-gradient(90deg, var(--sage) 0%, transparent 100%); opacity:0.5;
        }
        .g-section-badge {
          font-family:'DM Sans', sans-serif;
          font-size:9px; font-weight:700; letter-spacing:0.15em; color:var(--sage);
        }

        .g-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
        @media(min-width:600px)  { .g-grid { grid-template-columns:repeat(3,1fr); } }
        @media(min-width:900px)  { .g-grid { grid-template-columns:repeat(4,1fr); gap:16px; } }
        @media(min-width:1200px) { .g-grid { grid-template-columns:repeat(5,1fr); } }

        .g-card {
          background:var(--snow); border:1.5px solid var(--border);
          border-radius:22px; overflow:hidden; cursor:pointer; position:relative;
          opacity:0; animation:g-rise 0.6s cubic-bezier(.16,1,.3,1) forwards;
          transition: transform 0.45s cubic-bezier(.34,1.4,.64,1), border-color 0.3s, box-shadow 0.45s;
          will-change:transform; box-shadow:var(--shadow-sm);
        }
        @keyframes g-rise {
          from { opacity:0; transform:translateY(36px) scale(0.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        .g-card:hover {
          transform:translateY(-12px) scale(1.02); border-color:var(--jade);
          box-shadow: var(--shadow-xl), 0 0 0 1px rgba(37,137,74,0.2), inset 0 1px 0 rgba(255,255,255,0.8);
        }
        .g-card.hero { grid-column:span 2; }
        .g-card.hero .g-card-visual { aspect-ratio:16/9; }

        .g-card-visual { aspect-ratio:1; position:relative; overflow:hidden; background:var(--alabaster); }
        .g-card-visual > span { transition:transform 0.65s cubic-bezier(.16,1,.3,1); }
        .g-card:hover .g-card-visual > span { transform:scale(1.09); }

        .g-card-fog {
          position:absolute; inset:0;
          background:linear-gradient(to top, rgba(13,74,31,0.75) 0%, rgba(13,74,31,0.2) 40%, transparent 70%);
          transition:opacity 0.35s;
        }
        .g-card:hover .g-card-fog { opacity:0.9; }

        .g-card-price {
          position:absolute; bottom:10px; left:12px; right:12px;
          display:flex; align-items:flex-end; justify-content:space-between;
        }
        .g-price-n {
          font-family:'Cormorant Garamond', serif;
          font-size:24px; font-weight:700; color:#fff;
          letter-spacing:0.02em; line-height:1; text-shadow:0 2px 12px rgba(0,0,0,0.4);
        }
        .g-price-u { font-size:9px; color:rgba(255,255,255,0.7); margin-bottom:2px; font-weight:500; letter-spacing:0.06em; }

        .g-verified {
          position:absolute; top:10px; left:10px;
          background:linear-gradient(135deg,var(--emerald),var(--jade)); color:#fff;
          font-family:'DM Sans', sans-serif; font-size:7px; font-weight:800;
          letter-spacing:0.1em; padding:3px 9px; border-radius:100px;
          box-shadow:0 4px 14px rgba(37,137,74,0.45);
        }

        .g-wish {
          position:absolute; top:10px; right:10px;
          width:34px; height:34px;
          background:rgba(255,255,255,0.75); backdrop-filter:blur(12px);
          border:1.5px solid rgba(255,255,255,0.6); border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; font-size:15px;
          transition:all 0.3s cubic-bezier(.34,1.56,.64,1); color:var(--mtext); box-shadow:var(--shadow-sm);
        }
        .g-wish:hover { transform:scale(1.2); background:rgba(255,255,255,0.92); color:var(--emerald); }
        .g-wish.on    { background:rgba(239,68,68,0.85); color:#fff; border-color:transparent; }

        .g-card-body { padding:12px 14px 14px; }
        .g-card-cat { font-size:8px; font-weight:700; letter-spacing:0.16em; color:var(--sage); text-transform:uppercase; margin-bottom:5px; }
        .g-card-name {
          font-family:'Cormorant Garamond', serif;
          font-size:17px; font-weight:600; color:var(--text); line-height:1.2; margin-bottom:6px;
          display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;
        }
        .g-card-farmer { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
        .g-farmer-avatar {
          width:16px; height:16px;
          background:linear-gradient(135deg,var(--emerald),var(--fern));
          border-radius:50%; display:flex; align-items:center; justify-content:center;
          font-size:8px; flex-shrink:0;
        }
        .g-farmer-name { font-size:10px; color:var(--dtext); font-weight:500; }

        .g-stars { display:flex; align-items:center; gap:2px; margin-bottom:10px; }

        .g-card-actions { display:flex; gap:8px; }
        .g-wa-btn {
          flex:1; height:36px;
          background:linear-gradient(135deg,var(--emerald),var(--fern)); border:none; border-radius:11px; color:#fff;
          font-family:'DM Sans', sans-serif; font-size:10px; font-weight:700; letter-spacing:0.06em;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;
          transition:all 0.3s ease; box-shadow:0 4px 16px rgba(37,137,74,0.3);
        }
        .g-wa-btn:hover { transform:translateY(-2px); box-shadow:0 8px 24px rgba(37,137,74,0.45); }

        .g-add-btn {
          width:36px; height:36px;
          background:var(--alabaster); border:1.5px solid var(--border); border-radius:11px;
          color:var(--mtext); font-size:18px; cursor:pointer; flex-shrink:0;
          display:flex; align-items:center; justify-content:center;
          transition:all 0.3s cubic-bezier(.34,1.56,.64,1); font-weight:300;
        }
        .g-add-btn:hover { background:var(--mist); color:var(--jade); border-color:var(--jade); transform:scale(1.1); }
        .g-add-btn.done  { background:linear-gradient(135deg,var(--emerald),var(--jade)); color:#fff; border-color:transparent; }

        .g-empty { grid-column:1/-1; text-align:center; padding:80px 20px; }
        .g-empty-glyph { font-family:'Italiana', serif; font-size:80px; color:var(--mint); letter-spacing:0.05em; display:block; margin-bottom:16px; line-height:1; }
        .g-empty-title { font-family:'Cormorant Garamond', serif; font-size:28px; font-style:italic; font-weight:600; color:var(--mtext); margin-bottom:8px; }
        .g-empty-sub { font-size:13px; color:var(--dtext); margin-bottom:24px; }
        .g-empty-btn {
          display:inline-flex; align-items:center; gap:8px; padding:13px 34px;
          background:linear-gradient(135deg,var(--emerald),var(--jade)); border:none; border-radius:100px;
          color:#fff; font-weight:700; font-size:12px; letter-spacing:0.1em; cursor:pointer;
          transition:all 0.3s ease; box-shadow:0 8px 28px rgba(37,137,74,0.35);
        }
        .g-empty-btn:hover { transform:translateY(-3px); box-shadow:0 16px 40px rgba(37,137,74,0.5); }

        .g-nav {
          position:fixed; bottom:0; left:0; right:0; z-index:300;
          background:rgba(255,255,255,0.96);
          backdrop-filter:blur(24px) saturate(1.8); -webkit-backdrop-filter:blur(24px) saturate(1.8);
          border-top:1.5px solid var(--border);
          box-shadow:0 -20px 60px rgba(13,74,31,0.1), 0 -1px 0 rgba(255,255,255,0.9);
          padding-bottom:env(safe-area-inset-bottom);
        }
        .g-nav-inner {
          max-width:480px; margin:0 auto;
          display:flex; align-items:center; justify-content:space-around; padding:8px 0 12px;
        }
        .g-nav-btn {
          display:flex; flex-direction:column; align-items:center; gap:3px;
          background:none; border:none; cursor:pointer;
          color:var(--dtext); text-decoration:none; padding:4px 10px; border-radius:14px;
          transition:all 0.25s ease;
        }
        .g-nav-btn:hover { color:var(--mtext); }
        .g-nav-btn.on    { color:var(--emerald); }
        .g-nav-ic { font-size:20px; line-height:1; }
        .g-nav-lbl { font-family:'DM Sans', sans-serif; font-size:7px; font-weight:700; letter-spacing:0.12em; }

        .g-nav-cta {
          display:flex; flex-direction:column; align-items:center; gap:4px;
          background:none; border:none; cursor:pointer; position:relative; top:-14px;
        }
        .g-nav-cta-ring {
          width:60px; height:60px;
          background:linear-gradient(145deg,var(--fern),var(--emerald),var(--forest));
          border-radius:20px; display:flex; align-items:center; justify-content:center;
          box-shadow: 0 8px 32px rgba(37,137,74,0.5), 0 0 0 1px rgba(255,255,255,0.3), 0 0 0 3px rgba(37,137,74,0.15), inset 0 1px 0 rgba(255,255,255,0.3);
          transition:all 0.4s cubic-bezier(.34,1.56,.64,1); color:#fff;
        }
        .g-nav-cta:hover .g-nav-cta-ring { transform:scale(1.12) rotate(-5deg); box-shadow:0 16px 48px rgba(37,137,74,0.65); }
        .g-nav-cta-lbl { font-size:6.5px; font-weight:800; letter-spacing:0.12em; color:var(--sage); }

        .g-user-menu {
          position:absolute; right:0; top:calc(100%+10px); width:240px;
          background:var(--snow); border:1.5px solid var(--border2); border-radius:22px; overflow:hidden;
          box-shadow:var(--shadow-xl), inset 0 1px 0 rgba(255,255,255,0.9);
          animation:g-pop 0.2s cubic-bezier(.34,1.56,.64,1); z-index:500;
        }
        .g-um-head { padding:16px 18px; border-bottom:1px solid var(--border); background:linear-gradient(135deg,var(--mist),var(--alabaster)); }
        .g-um-role { font-size:8px; font-weight:800; letter-spacing:0.18em; color:var(--sage); margin-bottom:3px; }
        .g-um-email { font-size:12px; font-weight:500; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .g-um-item {
          display:flex; align-items:center; gap:10px; padding:11px 18px;
          font-size:12px; font-weight:500; color:var(--mtext);
          cursor:pointer; transition:all 0.2s; text-decoration:none; border:none; background:none; width:100%;
        }
        .g-um-item:hover { background:var(--mist); color:var(--text); }
        .g-um-item.red   { color:rgba(239,68,68,0.8); }
        .g-um-item.red:hover { background:rgba(239,68,68,0.06); color:#EF4444; }

        .g-overlay {
          position:fixed; inset:0; z-index:400;
          background:rgba(13,46,21,0.4);
          backdrop-filter:blur(20px) saturate(1.5); -webkit-backdrop-filter:blur(20px) saturate(1.5);
          animation:g-fade 0.3s ease;
        }
        @keyframes g-fade { from{opacity:0} to{opacity:1} }

        .g-drawer {
          position:fixed; bottom:0; left:0; right:0; z-index:401;
          max-height:90vh; background:var(--snow);
          border-radius:30px 30px 0 0; border-top:2px solid var(--border2);
          overflow-y:auto; scrollbar-width:none;
          box-shadow:0 -40px 100px rgba(13,74,31,0.25), inset 0 1px 0 rgba(255,255,255,0.9);
          animation:g-up 0.45s cubic-bezier(.16,1,.3,1);
        }
        .g-drawer::-webkit-scrollbar { display:none; }
        @keyframes g-up { from{transform:translateY(100%)} to{transform:translateY(0)} }

        .g-drawer-handle { display:flex; align-items:center; justify-content:center; padding:14px 0 8px; }
        .g-drawer-handle-bar { width:44px; height:5px; background:var(--silk); border-radius:5px; }

        .g-drawer-top {
          position:sticky; top:0; z-index:5; background:var(--snow);
          padding:0 20px 12px; display:flex; align-items:center; justify-content:space-between;
          border-bottom:1px solid var(--border);
        }
        .g-drawer-cat-pill {
          font-size:9px; font-weight:700; letter-spacing:0.14em; color:var(--emerald);
          background:var(--mist); border:1.5px solid var(--border2); padding:5px 14px; border-radius:100px;
        }
        .g-drawer-close {
          width:36px; height:36px; background:var(--alabaster); border:1.5px solid var(--border);
          border-radius:50%; display:flex; align-items:center; justify-content:center;
          cursor:pointer; color:var(--mtext); font-size:14px; transition:all 0.25s ease; box-shadow:var(--shadow-sm);
        }
        .g-drawer-close:hover { background:var(--mist); color:var(--text); transform:rotate(90deg); border-color:var(--border2); }

        .g-drawer-gallery { position:relative; width:100%; aspect-ratio:4/3; background:var(--alabaster); }
        .g-drawer-gallery::after {
          content:''; position:absolute; bottom:0; left:0; right:0; height:45%;
          background:linear-gradient(to top, var(--snow) 0%, transparent 100%); pointer-events:none;
        }

        .g-gallery-dots { position:absolute; bottom:16px; left:50%; transform:translateX(-50%); display:flex; gap:6px; z-index:2; }
        .g-gdot { height:4px; border-radius:4px; border:none; cursor:pointer; background:rgba(255,255,255,0.5); width:16px; transition:all 0.3s ease; }
        .g-gdot.on { background:var(--snow); width:30px; box-shadow:0 2px 8px rgba(0,0,0,0.2); }

        .g-dc { padding:20px 20px 0; }
        .g-dc-name { font-family:'Cormorant Garamond', serif; font-size:34px; font-weight:700; color:var(--forest); line-height:1.05; margin-bottom:10px; letter-spacing:-0.01em; }
        .g-dc-price-row { display:flex; align-items:baseline; gap:8px; margin-bottom:16px; }
        .g-dc-price { font-family:'Cormorant Garamond', serif; font-size:46px; font-weight:700; color:var(--jade); line-height:1; letter-spacing:0.01em; }
        .g-dc-unit { font-size:13px; color:var(--dtext); font-weight:400; }
        .g-dc-desc { font-size:13px; line-height:1.75; color:var(--mtext); margin-bottom:18px; }

        .g-dc-meta { display:flex; flex-direction:column; gap:8px; margin-bottom:20px; }
        .g-meta-row { display:flex; align-items:center; gap:12px; padding:12px 14px; background:var(--alabaster); border:1.5px solid var(--border); border-radius:15px; }
        .g-meta-icon { width:32px; height:32px; background:var(--mist); border-radius:10px; display:flex; align-items:center; justify-content:center; font-size:15px; flex-shrink:0; border:1px solid var(--border); }
        .g-meta-text { font-size:12px; font-weight:500; color:var(--mtext); }
        .g-meta-text span { color:var(--jade); font-weight:600; }

        .g-category-cards { margin-top:12px; padding:16px; background:var(--mist); border-radius:20px; margin-bottom:12px; }
        .g-category-title { font-family:'Cormorant Garamond', serif; font-size:16px; font-weight:600; color:var(--forest); margin-bottom:12px; display:flex; align-items:center; gap:6px; }
        .g-category-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:10px; }
        .g-category-card { background:var(--snow); border:1.5px solid var(--border); border-radius:14px; padding:10px; cursor:pointer; transition:all 0.25s ease; }
        .g-category-card:hover { transform:translateY(-2px); border-color:var(--jade); box-shadow:var(--shadow-md); }
        .g-category-card-image { width:100%; aspect-ratio:1; border-radius:10px; overflow:hidden; position:relative; margin-bottom:8px; background:var(--alabaster); }
        .g-category-card-name { font-family:'Cormorant Garamond', serif; font-size:13px; font-weight:600; color:var(--text); margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .g-category-card-price { font-size:11px; font-weight:700; color:var(--jade); }
        .g-category-card-cat { font-size:7px; font-weight:700; letter-spacing:0.1em; color:var(--sage); text-transform:uppercase; margin-bottom:2px; }

        .g-dc-actions { display:flex; gap:10px; padding:20px; }
        .g-dwa {
          flex:1; height:56px;
          background:linear-gradient(135deg,var(--emerald),var(--jade)); border:none; border-radius:18px; color:#fff;
          font-family:'DM Sans', sans-serif; font-size:13px; font-weight:700; letter-spacing:0.04em;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.3s ease;
          box-shadow:0 6px 24px rgba(37,137,74,0.4), inset 0 1px 0 rgba(255,255,255,0.2);
        }
        .g-dwa:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(37,137,74,0.55); }

        .g-dcart {
          flex:1; height:56px; background:var(--forest); border:none; border-radius:18px; color:#fff;
          font-family:'DM Sans', sans-serif; font-size:13px; font-weight:800; letter-spacing:0.04em;
          cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;
          transition:all 0.3s ease;
          box-shadow:0 6px 24px rgba(13,74,31,0.3), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .g-dcart:hover { transform:translateY(-2px); box-shadow:0 14px 36px rgba(13,74,31,0.45); background:var(--emerald); }

        .g-recs { border-top:1px solid var(--border); padding:20px 20px 32px; }
        .g-recs-title {
          font-family:'Cormorant Garamond', serif; font-size:18px; font-style:italic; font-weight:600;
          color:var(--mtext); margin-bottom:14px; display:flex; align-items:center; gap:8px;
        }
        .g-recs-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:10px; }
        .g-rec { display:flex; gap:10px; padding:10px; background:var(--alabaster); border:1.5px solid var(--border); border-radius:15px; cursor:pointer; transition:all 0.25s ease; }
        .g-rec:hover { background:var(--mist); border-color:var(--jade); transform:translateY(-2px); box-shadow:var(--shadow-md); }
        .g-rec-img { width:50px; height:50px; border-radius:11px; overflow:hidden; background:var(--silk); flex-shrink:0; }
        .g-rec-cat  { font-size:7.5px; font-weight:700; letter-spacing:0.12em; color:var(--sage); margin-bottom:2px; }
        .g-rec-name { font-family:'Cormorant Garamond', serif; font-size:13px; font-weight:600; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .g-rec-price { font-size:10px; font-weight:600; color:var(--jade); margin-top:2px; }

        .g-motif { text-align:center; padding:8px 0 24px; color:var(--silk); font-size:11px; letter-spacing:0.4em; user-select:none; }
      `}</style>

      {/* ── HEADER ── */}
      <header className={`g-header ${scrolled ? 'scrolled' : ''}`}>
        <div className="g-header-inner">
          <div className="g-logo-row">
            <Link href="/" className="g-logo-link">
              <div className="g-wordmark">
                <div className="g-wordmark-main">AGRIMARCHÉ</div>
                <div className="g-wordmark-sub">MARCHÉ PAYSAN DU SÉNÉGAL</div>
              </div>
            </Link>

            <div className="g-header-right">
              <Link href="/cart" className="g-icon-btn">
                🛒
                {cartCount > 0 && <span className="cart-badge">{cartCount}</span>}
              </Link>
              <div style={{ position: 'relative' }}>
                <button className="g-icon-btn" onClick={() => setShowUserMenu(v => !v)}>
                  {user ? '👤' : '◎'}
                </button>
                {showUserMenu && (
                  <div className="g-user-menu">
                    <div className="g-um-head">
                      <div className="g-um-role">COMPTE</div>
                      <div className="g-um-email">{user?.email || 'Invité'}</div>
                    </div>
                    <Link href="/privacy" className="g-um-item">🛡️ &nbsp;Confidentialité</Link>
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
              <button onClick={startVoice} className={`g-mic-btn ${listening ? 'on' : ''}`}>
                {listening ? '🎤' : '🎙'}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── CATÉGORIES ── */}
      <div className="g-cats">
        <div className="g-cats-inner">
          {CATEGORIES.map(c => (
            <button key={c.label} onClick={() => setCat(c.label)} className={`g-cat ${cat === c.label ? 'on' : ''}`}>
              {c.icon && <span className="g-cat-ic">{c.icon}</span>}
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── TOOLBAR (localisation + tri — sans compteur) ── */}
      <div className="g-toolbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="g-loc-chip" onClick={getLocation} style={{ minWidth: 0 }}>
            <div className={`g-loc-pulse ${locStatus}`} />
            <span className="g-loc-text">
              {locStatus === 'searching'
                ? 'Localisation…'
                : locStatus === 'error'
                  ? 'Non disponible'
                  : locStatus === 'unavailable'
                    ? 'Sénégal'
                    : location?.detailedAddress || location?.address || 'Sénégal'}
            </span>
          </button>
          {/* ✅ Compteur supprimé */}
        </div>

        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setShowSort(v => !v)} className={`g-sort-trigger ${sort !== 'default' ? 'on' : ''}`}>
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

      {/* ── GRILLE PRODUITS ── */}
      <main className="g-main">
        <div className="g-section-head">
          <h2 className="g-section-title">{cat === 'Tous' ? 'Tous les produits' : cat}</h2>
          <div className="g-section-line" />
          <span className="g-section-badge">DIRECT PRODUCTEUR</span>
        </div>

        <div className="g-grid">
          {filtered.length === 0 ? (
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
              const rd = ratings.get(p.sellerId || '');
              const stars = rd?.averageRating || 0;
              const cnt = rd?.reviewCount || 0;
              const isHero = idx % 9 === 0 && idx !== 0;
              return (
                <div
                  key={p.id}
                  className={`g-card ${isHero ? 'hero' : ''}`}
                  style={{ animationDelay: `${Math.min(idx * 38, 700)}ms` }}
                  onClick={() => open(p)}
                >
                  <div className="g-card-visual">
                    {safeImageSrc(p.images?.[0]) ? (
                      <Image src={safeImageSrc(p.images?.[0])!} alt={p.name || ''} fill style={{ objectFit: 'cover', transition: 'transform 0.6s cubic-bezier(.16,1,.3,1)' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, background: 'var(--alabaster)' }}>🌾</div>
                    )}
                    <div className="g-card-fog" />
                    {p.farmerVerified && <div className="g-verified">✓ VÉRIFIÉ</div>}
                    <div className="g-card-price">
                      <div>
                        <div className="g-price-n">{p.price?.toLocaleString()}</div>
                        <div className="g-price-u">FCFA / {p.unit || 'kg'}</div>
                      </div>
                    </div>
                    <button onClick={e => toggleWish(p.id, e)} className={`g-wish ${wishlist.has(p.id) ? 'on' : ''}`}>
                      {wishlist.has(p.id) ? '♥️' : '♡'}
                    </button>
                  </div>

                  <div className="g-card-body">
                    <div className="g-card-cat">{p.category}</div>
                    <h3 className="g-card-name">{p.name}</h3>
                    <div className="g-card-farmer">
                      <div className="g-farmer-avatar">🌱</div>
                      <span className="g-farmer-name">{p.farmer?.split(' ')[0] || 'Producteur'}</span>
                    </div>
                    {cnt > 0 && (
                      <div className="g-stars">
                        {[1, 2, 3, 4, 5].map(i => (
                          <svg key={i} width={10} height={10} viewBox="0 0 24 24" fill={i <= Math.floor(stars) ? 'var(--jade)' : 'rgba(13,74,31,0.15)'}>
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                        ))}
                        <span style={{ fontSize: 8, color: 'var(--dtext)', marginLeft: 3 }}>({cnt})</span>
                      </div>
                    )}
                    <div className="g-card-actions">
                      <button onClick={e => { wa(p.name, p.farmerPhone, e); }} className="g-wa-btn">
                        <WaIcon s={10} /> CONTACTER
                      </button>
                      <button onClick={e => addCart(p, e)} className={`g-add-btn ${addedIds.has(p.id) ? 'done' : ''}`}>
                        {addedIds.has(p.id) ? '✓' : '+'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="g-motif">— ✦ ◈ ✦ —</div>
      </main>

      {/* ── NAV BOTTOM ── */}
      <nav className="g-nav">
        <div className="g-nav-inner">
          <Link href="/" className="g-nav-btn on">
            <span className="g-nav-ic">⌂</span>
            <span className="g-nav-lbl">ACCUEIL</span>
          </Link>
          <button className="g-nav-btn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <span className="g-nav-ic">⊞</span>
            <span className="g-nav-lbl">CATÉGORIES</span>
          </button>

          <button
            className="g-nav-cta"
            onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent('Bonjour, je souhaite commander sur AgriMarché.')}`, '_blank')}
          >
            <div className="g-nav-cta-ring"><WaIcon s={26} /></div>
            <span className="g-nav-cta-lbl">WHATSAPP</span>
          </button>

          <Link href="/cart" className="g-nav-btn">
            <span className="g-nav-ic">◻</span>
            <span className="g-nav-lbl">PANIER</span>
          </Link>
          <Link href="/main/unlock-ia" className="g-nav-btn">
            <span className="g-nav-ic">🤖</span>
            <span className="g-nav-lbl">IA</span>
          </Link>
        </div>
      </nav>

      {/* ── DRAWER PRODUIT ── */}
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
              {safeImageSrc(selected.images?.[imgIdx]) ? (
                <Image src={safeImageSrc(selected.images?.[imgIdx])!} alt={selected.name || ''} fill style={{ objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 80 }}>🌾</div>
              )}
              {(selected.images?.length || 0) > 1 && (
                <div className="g-gallery-dots">
                  {selected.images!.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)} className={`g-gdot ${imgIdx === i ? 'on' : ''}`} />
                  ))}
                </div>
              )}
            </div>

            <div className="g-dc">
              <h2 className="g-dc-name">{selected.name}</h2>
              <div className="g-dc-price-row">
                <span className="g-dc-price">{selected.price?.toLocaleString()}</span>
                <span className="g-dc-unit">FCFA / {selected.unit || 'kg'}</span>
              </div>
              {selected.description && <p className="g-dc-desc">{selected.description}</p>}

              {categoryProducts.length > 0 && (
                <div className="g-category-cards">
                  <div className="g-category-title">
                    <span>📦</span> Autres produits dans <span style={{ color: 'var(--jade)' }}>{selected.category}</span>
                  </div>
                  <div className="g-category-grid">
                    {categoryProducts.map(catProd => (
                      <div key={catProd.id} className="g-category-card" onClick={e => {
                        e.stopPropagation();
                        setSelected(catProd);
                        setImgIdx(0);
                        drawerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}>
                        <div className="g-category-card-image">
                          {safeImageSrc(catProd.images?.[0]) ? (
                            <Image src={safeImageSrc(catProd.images?.[0])!} alt={catProd.name || ''} fill style={{ objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🌾</div>
                          )}
                        </div>
                        <div className="g-category-card-cat">{catProd.category}</div>
                        <div className="g-category-card-name">{catProd.name}</div>
                        <div className="g-category-card-price">{catProd.price?.toLocaleString()} FCFA</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="g-dc-meta">
                <div className="g-meta-row">
                  <div className="g-meta-icon">📍</div>
                  <span className="g-meta-text">{selected.exactLocation || selected.region || 'Sénégal'}</span>
                </div>
                <div className="g-meta-row">
                  <div className="g-meta-icon">🌾</div>
                  <span className="g-meta-text">
                    {selected.farmer || 'Producteur local'}
                    {selected.farmerPhone && <span>&ensp;·&ensp;<span>{selected.farmerPhone}</span></span>}
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
              <button onClick={() => wa(selected.name, selected.farmerPhone)} className="g-dwa">
                <WaIcon s={16} /> Commander
              </button>
              <button onClick={() => addCart(selected)} className="g-dcart">
                🛒 Panier
              </button>
            </div>

            {recs.length > 0 && (
              <div className="g-recs">
                <div className="g-recs-title">
                  <span style={{ color: 'var(--jade)', fontSize: 12 }}>✦</span>
                  Produits similaires
                </div>
                <div className="g-recs-grid">
                  {recs.map(r => (
                    <div key={r.id} className="g-rec" onClick={() => {
                      setSelected(r);
                      setImgIdx(0);
                      drawerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>
                      <div className="g-rec-img">
                        {safeImageSrc(r.images?.[0])
                          ? <Image src={safeImageSrc(r.images?.[0])!} alt={r.name || ''} width={50} height={50} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🌾</div>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="g-rec-cat">{r.category}</div>
                        <div className="g-rec-name">{r.name}</div>
                        <div className="g-rec-price">{r.price?.toLocaleString()} FCFA</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ height: 40 }} />
          </div>
        </>
      )}
    </>
  );
}
