'use client';
import './agrimarche-products.css';

import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { collection, onSnapshot, query, where, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';

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
  { label: 'Boissons locales',  icon: '', color: '#E74C3C' },
];

const WA_NUMBER = '221779747073';

function WaIcon({ s = 16 }: { s?: number }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>
  );
}

// ✅ Nettoie et valide les URLs d'images avant de les passer à next/image
function safeImageSrc(src: string | undefined): string | null {
  if (!src) return null;
  const cleaned = src.replace(/`/g, '').trim();
  try {
    const url = new URL(cleaned);
    if (url.protocol === 'http:' || url.protocol === 'https:') return cleaned;
  } catch {}
  if (cleaned.startsWith('/')) return cleaned;
  return null;
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
  originalPrice?: number;
}

interface SellerRating { sellerId: string; averageRating: number; reviewCount: number; }

export default function AgriMarket() {
  const router = useRouter();
  const { cart, addToCart } = useCart();
  const { user, logout } = useAuth();

  const [mounted,            setMounted]            = useState(false);
  const [products,           setProducts]           = useState<ProductData[]>([]);
  const [filtered,           setFiltered]           = useState<ProductData[]>([]);
  const [search,             setSearch]             = useState('');
  const [listening,          setListening]          = useState(false);
  const [cat,                setCat]                = useState('Tous');
  const [sort,               setSort]               = useState<'default'|'asc'|'desc'>('default');
  const [wishlist,           setWishlist]           = useState<Set<string>>(new Set());
  const [showUserMenu,       setShowUserMenu]       = useState(false);
  const [showSort,           setShowSort]           = useState(false);
  const [location,           setLocation]           = useState<{address:string;lat:number;lng:number;precision:number;detailedAddress?:string}|null>(null);
  const [locStatus,          setLocStatus]          = useState<'searching'|'found'|'error'>('searching');
  const [addedIds,           setAddedIds]           = useState<Set<string>>(new Set());
  const [selected,           setSelected]           = useState<ProductData|null>(null);
  const [imgIdx,             setImgIdx]             = useState(0);
  const [scrolled,           setScrolled]           = useState(false);
  const [recs,               setRecs]               = useState<ProductData[]>([]);
  const [ads,                setAds]                = useState<any[]>([]);
  const [ratings,            setRatings]            = useState<Map<string,SellerRating>>(new Map());
  const [heroVisible,        setHeroVisible]        = useState(false);
  const [categoryProducts,   setCategoryProducts]   = useState<ProductData[]>([]);

  const drawerRef = useRef<HTMLDivElement>(null);
  const voiceRef  = useRef<any>(null);

  const cartCount = cart?.itemCount || 0;

  useEffect(() => { setMounted(true); setTimeout(() => setHeroVisible(true), 100); }, []);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) return;
    voiceRef.current = new SR();
    voiceRef.current.lang = 'fr-FR';
    voiceRef.current.continuous = false;
    voiceRef.current.interimResults = false;
    voiceRef.current.onresult  = (e: any) => { setSearch(e.results[0][0].transcript); setListening(false); };
    voiceRef.current.onerror   = () => setListening(false);
    voiceRef.current.onend     = () => setListening(false);
  }, []);

  const startVoice = () => { if (voiceRef.current && !listening) { voiceRef.current.start(); setListening(true); } };

  useEffect(() => {
    // Fetch active ads
    const unsubAds = onSnapshot(
      collection(db, 'ads'),
      snap => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter((a: any) => a.active);
        list.sort((a: any, b: any) => (b.priority||0) - (a.priority||0));
        setAds(list);
      },
      err => console.error('[AgriMarché][ads] Firestore error:', err)
    );

    const unsubProducts = onSnapshot(
      collection(db, 'products'),
      snap => {
        const d = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProductData[];
        setProducts(d);
        setFiltered(d);
      },
      err => console.error('[AgriMarché][products] Firestore error:', err)
    );

    return () => { unsubAds(); unsubProducts(); };
  }, []);

  // ✅ CORRECTION ICI : Vérification que sid existe avant de l'utiliser dans la Map
  useEffect(() => {
    if (!products.length) return;
    [...new Set(products.map(p => p.sellerId).filter(Boolean))].forEach(sid => {
      if (!sid) return; // ✅ Protection supplémentaire
      const q = query(collection(db, 'reviews'), where('sellerId', '==', sid));
      onSnapshot(q, snap => {
        const revs = snap.docs.map(d => d.data());
        const cnt = revs.length;
        const avg = cnt ? revs.reduce((s: number, r: any) => s + (r.rating || 0), 0) / cnt : 0;
        // ✅ sid est garanti d'être une string ici grâce au if (!sid) return
        setRatings(prev => { 
          const m = new Map(prev); 
          m.set(sid, { sellerId: sid, averageRating: +avg, reviewCount: cnt }); 
          return m; 
        });
      });
    });
  }, [products]);

  // Historique d'achats (catégories achetées), chargé une fois par session connectée
  const [purchasedCategories, setPurchasedCategories] = useState<Map<string, number>>(new Map());
  const [purchasedProductIds, setPurchasedProductIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user?.uid) { setPurchasedCategories(new Map()); setPurchasedProductIds(new Set()); return; }
    (async () => {
      try {
        const q = query(collection(db, 'orders'), where('userId', '==', user.uid));
        const snap = await getDocs(q);
        const catCount = new Map<string, number>();
        const prodIds = new Set<string>();
        snap.docs.forEach(d => {
          const items = (d.data().items || []) as any[];
          items.forEach(it => {
            if (it.category) catCount.set(it.category, (catCount.get(it.category) || 0) + (it.quantity || 1));
            if (it.productId) prodIds.add(it.productId);
          });
        });
        setPurchasedCategories(catCount);
        setPurchasedProductIds(prodIds);
      } catch { /* utilisateur non connecté ou pas de commandes */ }
    })();
  }, [user?.uid]);

  // Moteur de recommandations : catégorie, région, historique de consultation, achats passés, wishlist
  useEffect(() => {
    if (!selected || !products.length) { setRecs([]); return; }

    let cancelled = false;

    (async () => {
      // Historique de consultation (localStorage)
      const viewed = JSON.parse(localStorage.getItem('ag_viewed') || '[]') as string[];
      const updatedViewed = [selected.id, ...viewed.filter(id => id !== selected.id)].slice(0, 20);
      localStorage.setItem('ag_viewed', JSON.stringify(updatedViewed));

      // Région de l'utilisateur connecté (Firestore), sinon région du produit consulté
      let userRegion = selected.region?.toLowerCase() || '';
      try {
        if (user?.uid) {
          const snap = await getDoc(doc(db, 'users', user.uid));
          if (snap.exists() && snap.data()?.region) {
            userRegion = String(snap.data().region).toLowerCase();
          }
        }
      } catch { /* fallback à la région du produit */ }

      if (cancelled) return;

      const maxCatPurchases = Math.max(1, ...Array.from(purchasedCategories.values()));

      const scored = products
        .filter(p => p.id !== selected.id)
        .map(p => {
          let score = 0;

          // Même catégorie que le produit consulté
          if (p.category === selected.category) score += 3;

          // Même région que l'utilisateur
          if (userRegion && p.region?.toLowerCase() === userRegion) score += 2;

          // Déjà consulté récemment (plus récent = plus de poids)
          const viewIdx = updatedViewed.indexOf(p.id);
          if (viewIdx !== -1) score += Math.max(0, 3 - viewIdx);

          // Catégorie déjà achetée par le client (pondéré par fréquence)
          const catPurchases = purchasedCategories.get(p.category) || 0;
          if (catPurchases > 0) score += 2 * (catPurchases / maxCatPurchases);

          // Déjà dans la wishlist → forte pertinence
          if (wishlist.has(p.id)) score += 2;

          // Produit vérifié et en promotion → léger bonus de mise en avant
          if (p.farmerVerified) score += 0.5;
          if (p.originalPrice && p.originalPrice > p.price) score += 0.5;

          // Bonus de fraîcheur / variété : petite valeur aléatoire stable par session
          score += (p.id.charCodeAt(0) % 5) * 0.05;

          return { p, score };
        })
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(x => x.p);

      // Repli : si peu de recommandations pertinentes, compléter avec la même catégorie
      if (scored.length < 4) {
        const fallback = products
          .filter(p => p.id !== selected.id && p.category === selected.category && !scored.find(s => s.id === p.id))
          .slice(0, 6 - scored.length);
        scored.push(...fallback);
      }

      if (!cancelled) setRecs(scored);
    })();

    return () => { cancelled = true; };
  }, [selected, products, user?.uid, purchasedCategories, wishlist]);

  useEffect(() => {
    if (selected && products.length) {
      setCategoryProducts(products.filter(p => p.category === selected.category && p.id !== selected.id).slice(0, 4));
    }
  }, [selected, products]);

  const getLocation = useCallback(() => {
    setLocStatus('searching'); setLocation(null);
    if (!navigator.geolocation) { setLocStatus('error'); return; }
    navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lng, accuracy } }) => {
      let addr = '';
      let detailedAddr = '';
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`, { 
          headers: { 'Accept-Language': 'fr-FR', 'User-Agent': 'AgriMarche/2.0' } 
        });
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
        
        const suburb = a.suburb || a.neighbourhood || a.city_district || '';
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
        
        if (locationName) {
          if (street) {
            detailedAddr = `${locationName}, ${street}`;
          } else if (suburb) {
            detailedAddr = `${locationName}, ${suburb}`;
          } else {
            detailedAddr = locationName;
          }
        }
        else if (street && suburb) {
          detailedAddr = `${street}, ${suburb}`;
        }
        else if (street) {
          detailedAddr = street;
        }
        else if (suburb) {
          detailedAddr = suburb;
        }
        else if (hamlet) {
          detailedAddr = hamlet;
        }
        else if (village || town || city) {
          detailedAddr = village || town || city;
        }
        else {
          detailedAddr = 'Sénégal';
        }
        
        addr = [city, state].filter(Boolean).join(', ') || 'Sénégal';
        
        setLocation({ address: addr, lat, lng, precision: accuracy, detailedAddress: detailedAddr });
        setLocStatus('found');
      } catch (err) {
        console.error('Geocoding error:', err);
        setLocStatus('error'); 
        setLocation({ address: 'Non disponible', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Non disponible' });
      }
    }, 
    () => { 
      setLocStatus('error'); 
      setLocation({ address: 'Non disponible', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Non disponible' });
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  }, []);

  useEffect(() => { getLocation(); }, [getLocation]);

  useEffect(() => {
    let r = [...products];
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
    };
    addToCart(productForCart as any, 1);
    setAddedIds(prev => new Set(prev).add(p.id));
    setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 2200);
  };
  
  const toggleWish = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setWishlist(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  };
  
  const wa = (name: string, phone?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    window.open(`https://wa.me/${phone?.replace(/\D/g,'') || WA_NUMBER}?text=${encodeURIComponent(`Bonjour, je suis intéressé par "${name}".`)}`, '_blank');
  };

  if (!mounted) return null;

  return (
    <>

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button className="g-loc-chip" onClick={getLocation} style={{ minWidth: 0 }}>
            <div className={`g-loc-pulse ${locStatus}`} />
            <span className="g-loc-text">
              {locStatus === 'searching' ? 'Localisation...' :
               locStatus === 'error'     ? 'Non disponible' :
               location?.detailedAddress || location?.address || 'Sénégal'}
            </span>
          </button>
          <span className="g-count"><b>{filtered.length}</b> produits</span>
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

      <main className="g-main">
        <div className="g-section-head">
          <h2 className="g-section-title">
            {cat === 'Tous' ? 'Tous les produits' : cat}
          </h2>
          <div className="g-section-line" />
          <span className="g-section-badge">DIRECT PRODUCTEUR</span>
        </div>

        {/* ── Carrousel promotions vedettes (Sacré Terroir) ── */}
        {ads.filter(a => a.placement === 'banner' || a.placement === 'both').length > 0 && (
          <div style={{
            display:'flex', gap:12, overflowX:'auto', marginBottom:14, paddingBottom:2,
            scrollSnapType:'x mandatory', WebkitOverflowScrolling:'touch'
          }}>
            {ads.filter(a => a.placement === 'banner' || a.placement === 'both').map(ad => (
              <a key={ad.id} href={ad.linkUrl || '#'} style={{
                position:'relative', flex:'0 0 92%', maxWidth:480, height:130, borderRadius:18, overflow:'hidden',
                display:'block', scrollSnapAlign:'start',
                boxShadow:'0 12px 36px rgba(13,74,31,0.25)', border:'1px solid rgba(212,175,55,0.35)'
              }}>
                <img src={ad.imageUrl} alt={ad.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} loading="lazy"/>
                <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(10,15,13,0.92) 28%, rgba(10,15,13,0.15) 100%)' }}/>
                <div style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', maxWidth:'72%' }}>
                  {ad.badge && (
                    <span style={{
                      display:'inline-block', fontSize:10, fontWeight:700, letterSpacing:1.5, color:'#0a0f0d',
                      background:'linear-gradient(135deg,#D4AF37,#F5E1A4)', borderRadius:6, padding:'3px 10px', marginBottom:8
                    }}>{ad.badge}</span>
                  )}
                  <div style={{ fontFamily:"'Playfair Display', serif", fontSize:19, fontWeight:700, color:'#fff', lineHeight:1.25 }}>
                    {ad.title}
                  </div>
                  {ad.subtitle && (
                    <div style={{ fontSize:11, color:'#D4AF37', marginTop:4, letterSpacing:0.5 }}>{ad.subtitle}</div>
                  )}
                </div>
                <div style={{
                  position:'absolute', bottom:10, right:14, fontSize:10, fontWeight:700, letterSpacing:1,
                  color:'#0a0f0d', background:'linear-gradient(135deg,#D4AF37,#F5E1A4)', borderRadius:8, padding:'4px 10px'
                }}>DÉCOUVRIR ✦</div>
              </a>
            ))}
          </div>
        )}

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
                    {safeImageSrc(p.images?.[0]) ? (
                      <Image src={safeImageSrc(p.images![0])!} alt={p.name} fill style={{ objectFit: 'cover', transition: 'transform 0.6s cubic-bezier(.16,1,.3,1)' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 52, background: 'var(--graphite)' }}>
                        🌾
                      </div>
                    )}
                    <div className="g-card-fog" />

                    {p.farmerVerified && <div className="g-verified">✓ VÉRIFIÉ</div>}

                    <div className="g-card-price">
                      <div>
                        {p.originalPrice && p.originalPrice > p.price && (
                          <div style={{ fontSize:9, color:'#9ca3af', textDecoration:'line-through', lineHeight:1.2 }}>
                            {p.originalPrice.toLocaleString()} FCFA
                          </div>
                        )}
                        <div className="g-price-n">{p.price?.toLocaleString()}</div>
                        <div className="g-price-u">FCFA / {p.unit || 'kg'}</div>
                      </div>
                      {p.originalPrice && p.originalPrice > p.price && (
                        <div style={{ background:'#ef4444', color:'#fff', fontSize:8, fontWeight:700, borderRadius:4, padding:'2px 4px', alignSelf:'flex-start' }}>
                          -{Math.round((1 - p.price/p.originalPrice)*100)}%
                        </div>
                      )}
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

        {/* ── Pub feed (milieu de page) ── */}
        {ads.filter(a => a.placement === 'feed' || a.placement === 'both').slice(0,1).map(ad => (
          <a key={ad.id} href={ad.linkUrl || '#'} style={{
            position:'relative', display:'block', margin:'8px 0', height:90, borderRadius:16, overflow:'hidden',
            boxShadow:'0 8px 24px rgba(13,74,31,0.18)', border:'1px solid rgba(212,175,55,0.3)'
          }}>
            <img src={ad.imageUrl} alt={ad.title} style={{ width:'100%', height:'100%', objectFit:'cover' }} loading="lazy"/>
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(90deg, rgba(10,15,13,0.88) 30%, rgba(10,15,13,0.1) 100%)' }}/>
            <div style={{ position:'absolute', left:16, top:'50%', transform:'translateY(-50%)' }}>
              {ad.badge && (
                <span style={{
                  display:'inline-block', fontSize:9, fontWeight:700, letterSpacing:1.5, color:'#0a0f0d',
                  background:'linear-gradient(135deg,#D4AF37,#F5E1A4)', borderRadius:5, padding:'2px 8px', marginBottom:5
                }}>{ad.badge}</span>
              )}
              <div style={{ fontFamily:"'Playfair Display', serif", fontSize:15, fontWeight:700, color:'#fff' }}>{ad.title}</div>
              {ad.subtitle && <div style={{ fontSize:10, color:'#D4AF37', marginTop:2 }}>{ad.subtitle}</div>}
            </div>
          </a>
        ))}

        <div className="g-motif">— ✦ ◈ ✦ —</div>
      </main>

      <nav className="g-nav">
        <div className="g-nav-inner">
          <Link href="/main" className="g-nav-btn on">
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

      {selected && (() => {
        const sellerRating = ratings.get(selected.sellerId || '');
        const sellerStars  = sellerRating?.averageRating || 0;
        const sellerCnt    = sellerRating?.reviewCount   || 0;
        return (
        <>
          <div className="g-overlay" onClick={close} />
          <div className="g-drawer" ref={drawerRef}>

            {/* ── Handle ── */}
            <div className="g-drawer-handle">
              <div className="g-drawer-handle-bar" />
            </div>

            {/* ── Top bar : catégorie + fermer ── */}
            <div className="g-drawer-top">
              <span className="g-drawer-cat-pill">{selected.category}</span>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                {selected.farmerVerified && (
                  <span style={{
                    fontSize:8, fontWeight:800, letterSpacing:'0.1em', color:'#fff',
                    background:'linear-gradient(135deg,#1A6B35,#25894A)',
                    borderRadius:100, padding:'3px 10px'
                  }}>✓ VÉRIFIÉ</span>
                )}
                <button className="g-drawer-close" onClick={close}>✕</button>
              </div>
            </div>

            {/* ── Galerie photos ── */}
            <div className="g-drawer-gallery">
              {safeImageSrc(selected.images?.[imgIdx]) ? (
                <Image src={safeImageSrc(selected.images![imgIdx])!} alt={selected.name} fill style={{ objectFit: 'cover' }} />
              ) : (
                <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:80 }}>🌾</div>
              )}
              {(selected.images?.length ?? 0) > 1 && (
                <div className="g-gallery-dots">
                  {selected.images!.map((_, i) => (
                    <button key={i} onClick={() => setImgIdx(i)} className={`g-gdot ${imgIdx === i ? 'on' : ''}`} />
                  ))}
                </div>
              )}
              {selected.originalPrice && selected.originalPrice > selected.price && (
                <div style={{
                  position:'absolute', top:12, left:12,
                  background:'#ef4444', color:'#fff',
                  fontSize:11, fontWeight:800, borderRadius:8, padding:'4px 10px',
                  boxShadow:'0 4px 12px rgba(239,68,68,0.4)'
                }}>
                  -{Math.round((1 - selected.price / selected.originalPrice) * 100)}% PROMO
                </div>
              )}
            </div>

            <div className="g-dc">

              {/* ── Nom + prix ── */}
              <h2 className="g-dc-name">{selected.name}</h2>
              <div className="g-dc-price-row">
                <div>
                  {selected.originalPrice && selected.originalPrice > selected.price && (
                    <div style={{ fontSize:12, color:'#9ca3af', textDecoration:'line-through', lineHeight:1.2, marginBottom:2 }}>
                      {selected.originalPrice.toLocaleString()} FCFA
                    </div>
                  )}
                  <span className="g-dc-price">{selected.price?.toLocaleString()}</span>
                  <span className="g-dc-unit"> FCFA / {selected.unit || 'kg'}</span>
                </div>
                {/* Note vendeur inline */}
                {sellerCnt > 0 && (
                  <div style={{
                    display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2, flexShrink:0
                  }}>
                    <div style={{ display:'flex', gap:2 }}>
                      {[1,2,3,4,5].map(i => (
                        <svg key={i} width={13} height={13} viewBox="0 0 24 24"
                          fill={i <= Math.round(sellerStars) ? '#F59E0B' : 'rgba(245,158,11,0.2)'}>
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                        </svg>
                      ))}
                    </div>
                    <span style={{ fontSize:10, color:'var(--mtext)', fontWeight:600 }}>
                      {sellerStars.toFixed(1)} · {sellerCnt} avis
                    </span>
                  </div>
                )}
              </div>

              {selected.description && <p className="g-dc-desc">{selected.description}</p>}

              {/* ── Note vendeur détaillée (si avis) ── */}
              {sellerCnt > 0 && (
                <div style={{
                  margin:'0 0 16px',
                  padding:'14px 16px',
                  background:'linear-gradient(135deg, rgba(245,158,11,0.08), rgba(245,158,11,0.04))',
                  border:'1.5px solid rgba(245,158,11,0.25)',
                  borderRadius:16,
                  display:'flex', alignItems:'center', gap:14
                }}>
                  <div style={{
                    width:48, height:48, borderRadius:14, flexShrink:0,
                    background:'linear-gradient(135deg,#F59E0B,#D97706)',
                    display:'flex', alignItems:'center', justifyContent:'center',
                    fontSize:22, boxShadow:'0 4px 14px rgba(245,158,11,0.35)'
                  }}>⭐</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:9, fontWeight:800, letterSpacing:'0.14em', color:'#D97706', marginBottom:4 }}>
                      NOTE DU VENDEUR
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                      <span style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:28, fontWeight:700, color:'#D97706', lineHeight:1 }}>
                        {sellerStars.toFixed(1)}
                      </span>
                      <div>
                        <div style={{ display:'flex', gap:2, marginBottom:2 }}>
                          {[1,2,3,4,5].map(i => (
                            <svg key={i} width={11} height={11} viewBox="0 0 24 24"
                              fill={i <= Math.round(sellerStars) ? '#F59E0B' : 'rgba(245,158,11,0.2)'}>
                              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                            </svg>
                          ))}
                        </div>
                        <span style={{ fontSize:10, color:'var(--mtext)' }}>{sellerCnt} client{sellerCnt > 1 ? 's' : ''} satisfait{sellerCnt > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Infos meta ── */}
              <div className="g-dc-meta">
                <div className="g-meta-row">
                  <div className="g-meta-icon">📍</div>
                  <span className="g-meta-text">{selected.exactLocation || selected.region || 'Sénégal'}</span>
                </div>
                <div className="g-meta-row">
                  <div className="g-meta-icon">🌾</div>
                  <span className="g-meta-text">
                    {selected.farmer || 'Producteur local'}
                    {selected.farmerPhone && (
                      <span>&ensp;·&ensp;<span style={{ color:'var(--jade)', fontWeight:600 }}>{selected.farmerPhone}</span></span>
                    )}
                  </span>
                </div>
                {selected.stock !== undefined && (
                  <div className="g-meta-row">
                    <div className="g-meta-icon">📦</div>
                    <span className="g-meta-text">
                      Stock : <span>{selected.stock} {selected.unit || 'unités'}</span>
                      {selected.stock <= 5 && selected.stock > 0 && (
                        <span style={{ color:'#ef4444', fontWeight:700, marginLeft:6 }}>⚠ Presque épuisé</span>
                      )}
                      {selected.stock === 0 && (
                        <span style={{ color:'#ef4444', fontWeight:700, marginLeft:6 }}>✕ Rupture</span>
                      )}
                    </span>
                  </div>
                )}
                <div className="g-meta-row">
                  <div className="g-meta-icon">🚚</div>
                  <span className="g-meta-text">Livraison disponible · <span>Dakar & environs</span></span>
                </div>
                <div className="g-meta-row">
                  <div className="g-meta-icon">💳</div>
                  <span className="g-meta-text">Paiement : <span>Wave · Orange Money · Espèces</span></span>
                </div>
              </div>

              {/* ── Autres produits même catégorie ── */}
              {categoryProducts.length > 0 && (
                <div style={{ marginBottom:20 }}>
                  <div style={{
                    display:'flex', alignItems:'center', gap:8, marginBottom:12
                  }}>
                    <div style={{ width:3, height:18, background:'linear-gradient(var(--emerald),var(--jade))', borderRadius:2 }} />
                    <span style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:17, fontWeight:600, color:'var(--forest)' }}>
                      Aussi dans <em style={{ color:'var(--jade)' }}>{selected.category}</em>
                    </span>
                  </div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
                    {categoryProducts.map(catProd => {
                      const cpRating = ratings.get(catProd.sellerId || '');
                      const cpStars  = cpRating?.averageRating || 0;
                      const cpCnt    = cpRating?.reviewCount   || 0;
                      return (
                        <div
                          key={catProd.id}
                          onClick={(e) => { e.stopPropagation(); setSelected(catProd); setImgIdx(0); drawerRef.current?.scrollTo({ top:0, behavior:'smooth' }); }}
                          style={{
                            background:'var(--snow)', border:'1.5px solid var(--border)',
                            borderRadius:16, overflow:'hidden', cursor:'pointer',
                            transition:'all 0.25s ease', boxShadow:'var(--shadow-sm)'
                          }}
                          onMouseEnter={e => (e.currentTarget.style.transform='translateY(-3px)', e.currentTarget.style.borderColor='var(--jade)', e.currentTarget.style.boxShadow='var(--shadow-md)')}
                          onMouseLeave={e => (e.currentTarget.style.transform='', e.currentTarget.style.borderColor='var(--border)', e.currentTarget.style.boxShadow='var(--shadow-sm)')}
                        >
                          {/* Image */}
                          <div style={{ position:'relative', width:'100%', aspectRatio:'4/3', background:'var(--alabaster)' }}>
                            {safeImageSrc(catProd.images?.[0]) ? (
                              <Image src={safeImageSrc(catProd.images![0])!} alt={catProd.name} fill style={{ objectFit:'cover' }} />
                            ) : (
                              <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:32 }}>🌾</div>
                            )}
                            {catProd.originalPrice && catProd.originalPrice > catProd.price && (
                              <div style={{ position:'absolute', top:6, left:6, background:'#ef4444', color:'#fff', fontSize:8, fontWeight:800, borderRadius:5, padding:'2px 6px' }}>
                                -{Math.round((1 - catProd.price/catProd.originalPrice)*100)}%
                              </div>
                            )}
                          </div>
                          {/* Infos */}
                          <div style={{ padding:'8px 10px 10px' }}>
                            <div style={{ fontSize:7, fontWeight:700, letterSpacing:'0.12em', color:'var(--sage)', textTransform:'uppercase', marginBottom:3 }}>
                              {catProd.category}
                            </div>
                            <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:14, fontWeight:600, color:'var(--text)', lineHeight:1.2, marginBottom:4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>
                              {catProd.name}
                            </div>
                            {cpCnt > 0 && (
                              <div style={{ display:'flex', alignItems:'center', gap:3, marginBottom:4 }}>
                                {[1,2,3,4,5].map(i => (
                                  <svg key={i} width={9} height={9} viewBox="0 0 24 24"
                                    fill={i <= Math.round(cpStars) ? '#F59E0B' : 'rgba(245,158,11,0.2)'}>
                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                  </svg>
                                ))}
                                <span style={{ fontSize:8, color:'var(--dtext)' }}>({cpCnt})</span>
                              </div>
                            )}
                            <div style={{ fontSize:13, fontWeight:700, color:'var(--jade)' }}>
                              {catProd.price?.toLocaleString()} <span style={{ fontSize:9, fontWeight:500, color:'var(--mtext)' }}>FCFA/{catProd.unit||'kg'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── 3 boutons d'action ── */}
            <div style={{ padding:'0 20px 16px', display:'flex', flexDirection:'column', gap:10 }}>
              {/* Bouton principal : WhatsApp vendeur */}
              <button
                onClick={() => wa(selected.name, selected.farmerPhone)}
                style={{
                  width:'100%', height:54,
                  background:'linear-gradient(135deg,#1A6B35,#25894A)',
                  border:'none', borderRadius:16, color:'#fff',
                  fontFamily:"'DM Sans', sans-serif", fontSize:13, fontWeight:700, letterSpacing:'0.04em',
                  cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                  boxShadow:'0 6px 24px rgba(37,137,74,0.4), inset 0 1px 0 rgba(255,255,255,0.2)',
                  transition:'all 0.3s ease'
                }}
              >
                <WaIcon s={18} />
                Commander au vendeur
                {selected.farmerPhone && (
                  <span style={{ opacity:0.75, fontSize:11 }}>· {selected.farmerPhone}</span>
                )}
              </button>

              <div style={{ display:'flex', gap:10 }}>
                {/* WhatsApp AgriMarché */}
                <button
                  onClick={() => window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(`Bonjour AgriMarché, je suis intéressé par "${selected.name}" à ${selected.price?.toLocaleString()} FCFA/${selected.unit||'kg'}. Pouvez-vous m'aider ?`)}`, '_blank')}
                  style={{
                    flex:1, height:48,
                    background:'rgba(37,137,74,0.08)',
                    border:'1.5px solid rgba(37,137,74,0.25)',
                    borderRadius:14, color:'var(--emerald)',
                    fontFamily:"'DM Sans', sans-serif", fontSize:11, fontWeight:700, letterSpacing:'0.04em',
                    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                    transition:'all 0.25s ease'
                  }}
                >
                  <WaIcon s={14} />
                  AgriMarché
                  <span style={{ fontSize:9, opacity:0.7 }}>779747073</span>
                </button>

                {/* Panier */}
                <button
                  onClick={() => addCart(selected)}
                  style={{
                    flex:1, height:48,
                    background:'var(--forest)',
                    border:'none', borderRadius:14, color:'#fff',
                    fontFamily:"'DM Sans', sans-serif", fontSize:11, fontWeight:800, letterSpacing:'0.04em',
                    cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:7,
                    boxShadow:'0 4px 16px rgba(13,74,31,0.3)',
                    transition:'all 0.3s ease'
                  }}
                >
                  🛒 Ajouter au panier
                </button>
              </div>
            </div>

            {/* ── Recommandés pour vous ── */}
            {recs.length > 0 && (
              <div className="g-recs">
                <div className="g-recs-title">
                  <span style={{ color:'var(--jade)', fontSize:12 }}>✦</span>
                  Recommandés pour vous
                </div>
                <div className="g-recs-grid">
                  {recs.map(r => {
                    const rRating = ratings.get(r.sellerId || '');
                    const rStars  = rRating?.averageRating || 0;
                    const rCnt    = rRating?.reviewCount   || 0;
                    return (
                      <div key={r.id} className="g-rec" onClick={() => { setSelected(r); setImgIdx(0); drawerRef.current?.scrollTo({ top:0, behavior:'smooth' }); }}>
                        <div className="g-rec-img">
                          {safeImageSrc(r.images?.[0])
                            ? <Image src={safeImageSrc(r.images![0])!} alt={r.name} width={50} height={50} style={{ objectFit:'cover', width:'100%', height:'100%' }} />
                            : <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>🌾</div>}
                        </div>
                        <div style={{ minWidth:0, flex:1 }}>
                          <div className="g-rec-cat">{r.category}</div>
                          <div className="g-rec-name">{r.name}</div>
                          {rCnt > 0 && (
                            <div style={{ display:'flex', alignItems:'center', gap:2, margin:'2px 0' }}>
                              {[1,2,3,4,5].map(i => (
                                <svg key={i} width={8} height={8} viewBox="0 0 24 24"
                                  fill={i <= Math.round(rStars) ? '#F59E0B' : 'rgba(245,158,11,0.2)'}>
                                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                </svg>
                              ))}
                              <span style={{ fontSize:8, color:'var(--dtext)', marginLeft:2 }}>({rCnt})</span>
                            </div>
                          )}
                          <div className="g-rec-price">
                            {r.originalPrice && r.originalPrice > r.price && (
                              <span style={{ textDecoration:'line-through', color:'#9ca3af', fontSize:9, marginRight:3 }}>
                                {r.originalPrice.toLocaleString()}
                              </span>
                            )}
                            {r.price?.toLocaleString()} FCFA
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ height:40 }} />
          </div>
        </>
        );
      })()}
    </>
  );
}