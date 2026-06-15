"use client";

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

import {
  ShoppingCart,
  Check,
  MapPin,
  Package,
  ChevronLeft,
  ChevronRight,
  X,
  Leaf,
  Heart,
  MessageCircle,
  Navigation,
} from 'lucide-react';

import { products } from '@/data/products';
import { useCart } from '@/hooks/useCart';

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice?: number;
  unit: string;
  category: string;
  region: string;
  description?: string;
  images?: string[];
  stock?: number;
}

interface UserLocation {
  city: string;
  region: string;
  country: string;
  lat: number;
  lng: number;
  detected: boolean;
}

const PLACEHOLDER_IMAGE = '/placeholder-product.png';

// ✅ JSON parse sécurisé
const parseJSON = <T,>(value: string | null): T | null => {
  try {
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
};

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { addToCart, cart } = useCart();
  const locationButtonRef = useRef<HTMLButtonElement>(null);

  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [adding, setAdding] = useState(false);
  const [addedSuccess, setAddedSuccess] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [imageError, setImageError] = useState(false);

  // 🌍 Géolocalisation
  const [location, setLocation] = useState<UserLocation>({
    city: '',
    region: '',
    country: '',
    lat: 0,
    lng: 0,
    detected: false
  });
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationError, setLocationError] = useState('');
  const [deliveryEstimate, setDeliveryEstimate] = useState('');

  // ✅ Stock sécurisé
  const stock = product?.stock ?? 999;
  const maxQuantity = stock > 100 ? 20 : stock;
  const images = product?.images || [];
  const imageCount = images.length;

  // 🌿 Seller
  const sellerData = useMemo(
    () => ({
      id: 'agrimarche-official',
      name: 'AgriMarché',
      phone: '779747073',
      photo: '/logo.png',
      region: 'Dakar, Sénégal',
      verified: true,
      whatsapp: '221779747073',
      bio: 'Service officiel AgriMarché. Produits agricoles frais et livraison rapide.'
    }),
    []
  );

  // 📍 Distance
  const calculateDistance = useCallback(
    (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371;
      const dLat = ((lat2 - lat1) * Math.PI) / 180;
      const dLon = ((lon2 - lon1) * Math.PI) / 180;
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
          Math.cos((lat2 * Math.PI) / 180) *
          Math.sin(dLon / 2) *
          Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },
    []
  );

  // 🚚 Livraison
  const updateDeliveryEstimate = useCallback(
    (userLat: number, userLng: number) => {
      const sellerLat = 14.7167;
      const sellerLng = -17.4677;
      const distance = calculateDistance(userLat, userLng, sellerLat, sellerLng);

      if (distance <= 10) {
        setDeliveryEstimate('24h');
      } else if (distance <= 50) {
        setDeliveryEstimate('24-48h');
      } else if (distance <= 200) {
        setDeliveryEstimate('48-72h');
      } else {
        setDeliveryEstimate('3-5 jours');
      }
    },
    [calculateDistance]
  );

  // 🌐 Fallback IP
  const fallbackToIPGeolocation = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch('https://ipapi.co/json/', {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      const data = await response.json();

      const newLocation = {
        city: data.city || 'Dakar',
        region: data.region || 'Dakar',
        country: data.country_name || 'Sénégal',
        lat: data.latitude || 14.7167,
        lng: data.longitude || -17.4677,
        detected: false
      };
      setLocation(newLocation);
      updateDeliveryEstimate(newLocation.lat, newLocation.lng);
    } catch (error) {
      console.error(error);
      setLocation({
        city: 'Dakar',
        region: 'Dakar',
        country: 'Sénégal',
        lat: 14.7167,
        lng: -17.4677,
        detected: false
      });
      setDeliveryEstimate('48-72h');
    } finally {
      setLocationLoading(false);
    }
  }, [updateDeliveryEstimate]);

  // 📍 Détection
  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError('Géolocalisation non supportée');
      setLocationLoading(false);
      fallbackToIPGeolocation();
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        try {
          const cacheKey = `geocode_${latitude}_${longitude}`;
          const cached = parseJSON<{
            city: string;
            region: string;
            country: string;
            timestamp: number;
          }>(localStorage.getItem(cacheKey));

          if (cached && Date.now() - cached.timestamp < 3600000) {
            setLocation({
              city: cached.city,
              region: cached.region,
              country: cached.country,
              lat: latitude,
              lng: longitude,
              detected: true
            });
            updateDeliveryEstimate(latitude, longitude);
            setLocationLoading(false);
            return;
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000);
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=fr`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          const data = await response.json();

          const city = data.address?.city || data.address?.town || data.address?.village || 'Dakar';
          const region = data.address?.state || data.address?.region || 'Sénégal';
          const country = data.address?.country || 'Sénégal';

          const newLocation = { city, region, country, lat: latitude, lng: longitude, detected: true };
          setLocation(newLocation);
          updateDeliveryEstimate(latitude, longitude);
          localStorage.setItem(cacheKey, JSON.stringify({ ...newLocation, timestamp: Date.now() }));
          localStorage.setItem('user_location', JSON.stringify(newLocation));
        } catch (error) {
          console.error(error);
          fallbackToIPGeolocation();
        } finally {
          setLocationLoading(false);
        }
      },
      () => {
        setLocationError('Erreur de localisation');
        fallbackToIPGeolocation();
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, [fallbackToIPGeolocation, updateDeliveryEstimate]);

  // 📍 Init location
  useEffect(() => {
    const savedLocation = parseJSON<UserLocation>(localStorage.getItem('user_location'));
    if (savedLocation) {
      setLocation(savedLocation);
      updateDeliveryEstimate(savedLocation.lat, savedLocation.lng);
      setLocationLoading(false);
    } else {
      detectLocation();
    }
  }, [detectLocation, updateDeliveryEstimate]);

  // 📦 Load product
  useEffect(() => {
    if (!id) return;

    const loadProduct = async () => {
      setLoading(true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const foundProduct = products.find((p) => p.id === id);

      if (!foundProduct) {
        setError('Produit introuvable');
        setLoading(false);
        return;
      }

      setProduct(foundProduct);
      const relatedProducts = products
        .filter((p) => p.category === foundProduct.category && p.id !== foundProduct.id)
        .slice(0, 4);
      setRelated(relatedProducts);
      setLoading(false);
    };

    loadProduct();
  }, [id]);

  // ✅ Reset
  useEffect(() => {
    setQuantity(1);
    setSelectedImage(0);
    setImageError(false);
  }, [product]);

  // ✅ Timeout add cart
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (addedSuccess) {
      timer = setTimeout(() => {
        setAdding(false);
        setAddedSuccess(false);
      }, 1500);
    }
    return () => clearTimeout(timer);
  }, [addedSuccess]);

  // 🛒 Add cart - ✅ CORRECTION ICI
  const handleAddToCart = useCallback(() => {
    if (!product) return;
    
    // ✅ Conversion explicite pour addToCart
    const safeProduct = {
      id: product.id,
      name: product.name,
      price: product.price,
      unit: product.unit,
      category: product.category,
      images: product.images || [],
      stock: stock,
    };
    
    setAdding(true);
    addToCart(safeProduct as any, quantity);
    setAddedSuccess(true);
  }, [product, quantity, addToCart, stock]);

  // ❤️ Wishlist
  const handleWishlist = useCallback(() => {
    setIsWishlisted((prev) => !prev);
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }
  }, []);

  // 🚀 Go cart
  const handleGoToCart = useCallback(() => {
    router.push('/cart');
  }, [router]);

  // 📸 Next image
  const nextImage = useCallback(() => {
    if (imageCount > 0) {
      setSelectedImage((prev) => (prev + 1) % imageCount);
    }
  }, [imageCount]);

  // 📸 Prev image
  const prevImage = useCallback(() => {
    if (imageCount > 0) {
      setSelectedImage((prev) => (prev - 1 + imageCount) % imageCount);
    }
  }, [imageCount]);

  // ⌨️ Keyboard
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!showLightbox) return;
      if (e.key === 'ArrowLeft') prevImage();
      if (e.key === 'ArrowRight') nextImage();
      if (e.key === 'Escape') setShowLightbox(false);
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [showLightbox, nextImage, prevImage]);

  // ⏳ Loading
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  // ❌ Error
  if (error || !product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500">{error || 'Produit non trouvé'}</p>
          <Link href="/main/products" className="text-emerald-600 mt-4 inline-block">
            ← Retour aux produits
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-teal-50 to-green-50">
      {/* HEADER */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-emerald-100 px-4 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/main/products" className="flex items-center gap-3">
            <Leaf className="w-8 h-8 text-emerald-600" />
            <span className="text-2xl font-bold text-emerald-700">AgriMarché</span>
          </Link>

          <Link href="/cart" className="relative bg-emerald-600 text-white px-5 py-2 rounded-xl flex items-center gap-2">
            <ShoppingCart size={18} />
            <span>Panier</span>
            <span className="absolute -top-2 -right-2 bg-amber-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
              {cart.itemCount}
            </span>
          </Link>
        </div>
      </div>

      {/* MAIN */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* GEO */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl shadow-lg p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Navigation size={22} className="text-white" />
                </div>
                <div>
                  <p className="text-xs text-gray-400">Votre position</p>
                  {locationLoading ? (
                    <p className="text-sm">Détection...</p>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-emerald-600" />
                      <span className="font-bold">
                        {location.city}, {location.region}
                      </span>
                    </div>
                  )}
                </div>
              </div>
              {deliveryEstimate && (
                <div className="bg-emerald-50 px-4 py-2 rounded-xl">
                  <p className="text-sm font-bold text-emerald-700">Livraison : {deliveryEstimate}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PRODUCT */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="grid lg:grid-cols-2">
            {/* IMAGE */}
            <div className="p-6">
              <div
                className="relative aspect-square rounded-2xl overflow-hidden cursor-pointer"
                onClick={() => setShowLightbox(true)}
              >
                <Image
                  src={imageError ? PLACEHOLDER_IMAGE : images[selectedImage] || PLACEHOLDER_IMAGE}
                  alt={product.name}
                  fill
                  className="object-cover"
                  onError={() => setImageError(true)}
                />
              </div>

              {/* MINIATURES */}
              {images.length > 1 && (
                <div className="flex gap-3 mt-4 overflow-x-auto">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`relative w-20 h-20 rounded-xl overflow-hidden border-2 flex-shrink-0 ${
                        i === selectedImage ? 'border-emerald-500' : 'border-gray-200'
                      }`}
                    >
                      <Image src={img || PLACEHOLDER_IMAGE} alt={`${product.name}-${i}`} fill className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* INFO */}
            <div className="p-6 md:p-8 flex flex-col">
              <div className="flex justify-between items-start">
                <div>
                  <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs">
                    🌿 {product.category}
                  </span>
                  <h1 className="text-4xl font-bold mt-3">{product.name}</h1>
                </div>
                <button onClick={handleWishlist} className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 transition">
                  <Heart size={22} className={isWishlisted ? 'fill-red-500 text-red-500' : 'text-gray-400'} />
                </button>
              </div>

              {/* PRICE */}
              <div className="mt-6">
                <div className="flex flex-col gap-1">
                  {product.originalPrice && product.originalPrice > product.price && (
                    <div className="flex items-center gap-2">
                      <span className="text-lg text-gray-400 line-through">{product.originalPrice.toLocaleString()} FCFA</span>
                      <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        -{Math.round((1 - product.price/product.originalPrice)*100)}%
                      </span>
                    </div>
                  )}
                  <div className="flex items-baseline gap-2">
                    <span className="text-5xl font-black text-emerald-700">{product.price.toLocaleString()}</span>
                    <span className="text-xl text-emerald-600">FCFA</span>
                  </div>
                </div>
                <p className="text-gray-400">/ {product.unit}</p>
              </div>

              {/* DESC */}
              <p className="mt-6 text-gray-600 leading-relaxed">{product.description}</p>

              {/* GRID */}
              <div className="grid grid-cols-2 gap-3 mt-6">
                <div className="bg-emerald-50 rounded-2xl p-3">
                  <MapPin size={18} className="text-emerald-600" />
                  <p className="text-xs text-gray-500 mt-1">Région</p>
                  <p className="font-semibold">{product.region}</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl p-3">
                  <Package size={18} className="text-emerald-600" />
                  <p className="text-xs text-gray-500 mt-1">Stock</p>
                  <p className="font-semibold">{stock > 0 ? `${stock} unités` : 'Rupture'}</p>
                </div>
              </div>

              {/* QUANTITY */}
              <div className="mt-8">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
                  >
                    -
                  </button>
                  <span className="font-bold text-lg">{quantity}</span>
                  <button
                    onClick={() => setQuantity((q) => Math.min(q + 1, maxQuantity))}
                    className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 transition"
                  >
                    +
                  </button>
                </div>
                <p className="mt-4 font-bold text-emerald-700">
                  Total : {(product.price * quantity).toLocaleString()} FCFA
                </p>
              </div>

              {/* BUTTONS */}
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={handleAddToCart}
                  disabled={stock <= 0 || adding}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addedSuccess ? (
                    <>
                      <Check size={20} />
                      Ajouté !
                    </>
                  ) : (
                    <>
                      <ShoppingCart size={20} />
                      Ajouter au panier
                    </>
                  )}
                </button>

                <a
                  href={`https://wa.me/${sellerData.whatsapp}?text=Bonjour%20AgriMarch%C3%A9%2C%20je%20souhaite%20commander%20${encodeURIComponent(
                    product.name
                  )}%20(${quantity}%20${product.unit})`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-green-500 hover:bg-green-600 text-white py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition"
                >
                  <MessageCircle size={20} />
                  Commander via WhatsApp
                </a>

                {addedSuccess && (
                  <button
                    onClick={handleGoToCart}
                    className="bg-amber-500 hover:bg-amber-600 text-white py-4 rounded-2xl font-bold transition"
                  >
                    Voir panier →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RELATED */}
        {related.length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold mb-6">Produits similaires</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((p) => (
                <Link key={p.id} href={`/product/${p.id}`} className="bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition">
                  <div className="relative aspect-square">
                    <Image src={p.images?.[0] || PLACEHOLDER_IMAGE} alt={p.name} fill className="object-cover" />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold truncate">{p.name}</h3>
                    <p className="text-emerald-700 font-bold mt-2">{p.price.toLocaleString()} FCFA</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* LIGHTBOX */}
      {showLightbox && imageCount > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setShowLightbox(false)}
        >
          <button
            onClick={() => setShowLightbox(false)}
            className="absolute top-6 right-6 text-white hover:text-gray-300 transition z-10"
          >
            <X size={36} />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              prevImage();
            }}
            className="absolute left-6 text-white hover:text-gray-300 transition z-10"
          >
            <ChevronLeft size={36} />
          </button>

          <div className="relative w-full max-w-5xl h-full max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
            <Image
              src={imageError ? PLACEHOLDER_IMAGE : images[selectedImage] || PLACEHOLDER_IMAGE}
              alt={product.name}
              fill
              className="object-contain"
            />
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              nextImage();
            }}
            className="absolute right-6 text-white hover:text-gray-300 transition z-10"
          >
            <ChevronRight size={36} />
          </button>
        </div>
      )}
    </div>
  );
}