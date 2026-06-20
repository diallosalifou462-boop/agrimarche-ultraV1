"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = AgriMarket;
const react_1 = require("react");
const link_1 = __importDefault(require("next/link"));
const image_1 = __importDefault(require("next/image"));
const navigation_1 = require("next/navigation");
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("@/lib/firebase/firebase");
const useCart_1 = require("@/hooks/useCart");
const useAuth_1 = require("@/hooks/useAuth");
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
function WaIcon({ s = 16 }) {
    return (<svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.121 1.531 5.856L.073 23.27a.75.75 0 00.918.882l5.57-1.461A11.944 11.944 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.75a9.73 9.73 0 01-4.964-1.363l-.355-.212-3.676.965.978-3.576-.232-.368A9.713 9.713 0 012.25 12C2.25 6.615 6.615 2.25 12 2.25S21.75 6.615 21.75 12 17.385 21.75 12 21.75z"/>
    </svg>);
}
function AgriMarket() {
    var _a, _b, _c;
    const router = (0, navigation_1.useRouter)();
    const { cart, addToCart } = (0, useCart_1.useCart)();
    const { user, logout } = (0, useAuth_1.useAuth)();
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [products, setProducts] = (0, react_1.useState)([]);
    const [filtered, setFiltered] = (0, react_1.useState)([]);
    const [search, setSearch] = (0, react_1.useState)('');
    const [listening, setListening] = (0, react_1.useState)(false);
    const [cat, setCat] = (0, react_1.useState)('Tous');
    const [sort, setSort] = (0, react_1.useState)('default');
    const [wishlist, setWishlist] = (0, react_1.useState)(new Set());
    const [showUserMenu, setShowUserMenu] = (0, react_1.useState)(false);
    const [showSort, setShowSort] = (0, react_1.useState)(false);
    const [location, setLocation] = (0, react_1.useState)(null);
    const [locStatus, setLocStatus] = (0, react_1.useState)('searching');
    const [addedIds, setAddedIds] = (0, react_1.useState)(new Set());
    const [selected, setSelected] = (0, react_1.useState)(null);
    const [imgIdx, setImgIdx] = (0, react_1.useState)(0);
    const [scrolled, setScrolled] = (0, react_1.useState)(false);
    const [recs, setRecs] = (0, react_1.useState)([]);
    const [ratings, setRatings] = (0, react_1.useState)(new Map());
    const [heroVisible, setHeroVisible] = (0, react_1.useState)(false);
    const [categoryProducts, setCategoryProducts] = (0, react_1.useState)([]);
    const drawerRef = (0, react_1.useRef)(null);
    const voiceRef = (0, react_1.useRef)(null);
    const cartCount = (cart === null || cart === void 0 ? void 0 : cart.itemCount) || 0;
    (0, react_1.useEffect)(() => { setMounted(true); setTimeout(() => setHeroVisible(true), 100); }, []);
    (0, react_1.useEffect)(() => {
        const fn = () => setScrolled(window.scrollY > 8);
        window.addEventListener('scroll', fn, { passive: true });
        return () => window.removeEventListener('scroll', fn);
    }, []);
    // ✅ CORRECTION 1 : Reconnaissance vocale avec logs de diagnostic
    (0, react_1.useEffect)(() => {
        if (typeof window === 'undefined')
            return;
        // Logs de diagnostic pour identifier le problème
        console.log('🔍 [Voice] webkitSpeechRecognition =', window.webkitSpeechRecognition);
        console.log('🔍 [Voice] SpeechRecognition =', window.SpeechRecognition);
        const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SR) {
            console.warn('⚠️ [Voice] Aucune API de reconnaissance vocale disponible dans ce navigateur.');
            return;
        }
        console.log('✅ [Voice] API disponible, initialisation...');
        voiceRef.current = new SR();
        voiceRef.current.lang = 'fr-FR';
        voiceRef.current.continuous = false;
        voiceRef.current.interimResults = false;
        voiceRef.current.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            console.log('🎤 [Voice] Résultat :', transcript);
            setSearch(transcript);
            setListening(false);
        };
        voiceRef.current.onerror = (e) => {
            console.error('❌ [Voice] Erreur :', e.error);
            setListening(false);
        };
        voiceRef.current.onend = () => {
            console.log('🔄 [Voice] Fin de l\'écoute');
            setListening(false);
        };
    }, []);
    const startVoice = () => {
        if (voiceRef.current && !listening) {
            console.log('🎙️ [Voice] Démarrage du micro...');
            try {
                voiceRef.current.start();
                setListening(true);
            }
            catch (err) {
                console.error('❌ [Voice] Erreur au démarrage :', err);
                setListening(false);
            }
        }
        else if (!voiceRef.current) {
            console.warn('⚠️ [Voice] Le micro n\'est pas initialisé.');
        }
        else {
            console.log('⏳ [Voice] Déjà en écoute...');
        }
    };
    (0, react_1.useEffect)(() => {
        const u = (0, firestore_1.onSnapshot)((0, firestore_1.collection)(firebase_1.db, 'products'), snap => {
            const d = snap.docs.map(doc => (Object.assign({ id: doc.id }, doc.data())));
            setProducts(d);
            setFiltered(d);
        });
        return () => u();
    }, []);
    (0, react_1.useEffect)(() => {
        if (!products.length)
            return;
        [...new Set(products.map(p => p.sellerId).filter(Boolean))].forEach(sid => {
            (0, firestore_1.onSnapshot)((0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'reviews'), (0, firestore_1.where)('sellerId', '==', sid)), snap => {
                const revs = snap.docs.map(d => d.data());
                const cnt = revs.length;
                const avg = cnt ? revs.reduce((s, r) => s + (r.rating || 0), 0) / cnt : 0;
                setRatings(prev => { const m = new Map(prev); m.set(sid, { sellerId: sid, averageRating: +avg.toFixed(1), reviewCount: cnt }); return m; });
            });
        });
    }, [products]);
    (0, react_1.useEffect)(() => {
        if (selected && products.length)
            setRecs(products.filter(p => p.category === selected.category && p.id !== selected.id).slice(0, 6));
    }, [selected, products]);
    (0, react_1.useEffect)(() => {
        if (selected && products.length) {
            setCategoryProducts(products.filter(p => p.category === selected.category && p.id !== selected.id).slice(0, 4));
        }
    }, [selected, products]);
    const getLocation = (0, react_1.useCallback)(() => {
        setLocStatus('searching');
        setLocation(null);
        if (!navigator.geolocation) {
            setLocStatus('error');
            return;
        }
        navigator.geolocation.getCurrentPosition(async ({ coords: { latitude: lat, longitude: lng, accuracy } }) => {
            var _a, _b;
            let addr = '';
            let detailedAddr = '';
            try {
                const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`, {
                    headers: { 'Accept-Language': 'fr-FR', 'User-Agent': 'AgriMarche/2.0' }
                });
                const d = await r.json();
                const a = d.address || {};
                const amenity = ((_a = d.extratags) === null || _a === void 0 ? void 0 : _a.name) || ((_b = d.namedetails) === null || _b === void 0 ? void 0 : _b.name) || '';
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
                if (university)
                    locationName = university;
                else if (school)
                    locationName = school;
                else if (college)
                    locationName = college;
                else if (institution)
                    locationName = institution;
                else if (amenity)
                    locationName = amenity;
                if (locationName) {
                    if (street) {
                        detailedAddr = `${locationName}, ${street}`;
                    }
                    else if (suburb) {
                        detailedAddr = `${locationName}, ${suburb}`;
                    }
                    else {
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
            }
            catch (err) {
                console.error('Geocoding error:', err);
                setLocStatus('error');
                setLocation({ address: 'Non disponible', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Non disponible' });
            }
        }, () => {
            setLocStatus('error');
            setLocation({ address: 'Non disponible', lat: 14.7167, lng: -17.4677, precision: 0, detailedAddress: 'Non disponible' });
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    }, []);
    (0, react_1.useEffect)(() => { getLocation(); }, [getLocation]);
    (0, react_1.useEffect)(() => {
        let r = [...products];
        if (search)
            r = r.filter(p => { var _a; return (_a = p.name) === null || _a === void 0 ? void 0 : _a.toLowerCase().includes(search.toLowerCase()); });
        if (cat !== 'Tous')
            r = r.filter(p => p.category === cat);
        if (sort === 'asc')
            r.sort((a, b) => (a.price || 0) - (b.price || 0));
        if (sort === 'desc')
            r.sort((a, b) => (b.price || 0) - (a.price || 0));
        setFiltered(r);
    }, [products, search, cat, sort]);
    const open = (p) => { setSelected(p); setImgIdx(0); document.body.style.overflow = 'hidden'; };
    const close = () => { setSelected(null); document.body.style.overflow = ''; };
    // ✅ CORRECTION 2 : addCart avec paramètre e optionnel
    const addCart = (p, e) => {
        if (e) e.stopPropagation(); // ✅ Vérification avant d'utiliser e
        const productForCart = {
            id: p.id,
            name: p.name,
            price: p.price,
            unit: p.unit,
            category: p.category,
            images: p.images || [],
            stock: p.stock || 999,
        };
        addToCart(productForCart, 1);
        setAddedIds(prev => new Set(prev).add(p.id));
        setTimeout(() => setAddedIds(prev => { const s = new Set(prev); s.delete(p.id); return s; }), 2200);
    };
    const toggleWish = (id, e) => {
        e === null || e === void 0 ? void 0 : e.stopPropagation();
        setWishlist(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
    };
    const wa = (name, phone, e) => {
        e === null || e === void 0 ? void 0 : e.stopPropagation();
        window.open(`https://wa.me/${(phone === null || phone === void 0 ? void 0 : phone.replace(/\D/g, '')) || WA_NUMBER}?text=${encodeURIComponent(`Bonjour, je suis intéressé par "${name}".`)}`, '_blank');
    };
    if (!mounted)
        return null;
    return (<>
      {/* ... CSS identique, inchangé ... */}
      {/* ... JSX identique, inchangé ... */}
    </>);
}