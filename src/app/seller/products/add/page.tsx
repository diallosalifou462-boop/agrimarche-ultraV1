'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { notifyAllUsers } from '@/lib/notifications/notifyUser';
// Firebase Storage remplacé par Cloudinary
import {
  ArrowLeft, Plus, X, Loader2, CheckCircle, XCircle,
  Package, Leaf, Image as ImageIcon, Sparkles,
  Tag, Scale, MapPin, AlignLeft, Layers, Info
} from 'lucide-react';

const CATEGORIES = [
  'Fruits', 'Légumes', 'Céréales', 'Tubercules',
  'Machines agricoles', 'Condiments', 'Poissons',
  'Produits laitiers', 'Légumineuses', 'Engrais', 'Elevage', 'Boissons', 'Produits transformés', 'Semences & Agricole'
];

const UNITS = ['kg', 'g', 'tonne', 'litre', 'unité', 'sac', 'botte', 'caisse', 'carton', 'panier'];

const MAX_PHOTOS = 5;
const MAX_FILE_SIZE_MB = 5;

interface PhotoItem {
  id: string;
  file: File;
  preview: string;
  progress: number;
  url: string | null;
  error: string | null;
  uploading: boolean;
}

interface FormData {
  name: string;
  description: string;
  price: string;
  unit: string;
  category: string;
  stock: string;
  minOrder: string;
}

export default function AddProductPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [userId, setUserId]       = useState<string | null>(null);
  const [sellerInfo, setSellerInfo] = useState<{ name: string; region: string; city: string; phone: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [photos, setPhotos]       = useState<PhotoItem[]>([]);
  const [form, setForm]           = useState<FormData>({
    name: '', description: '', price: '', unit: 'kg',
    category: '', stock: '', minOrder: '1',
  });
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast]         = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [darkMode, setDarkMode]   = useState(false);

  // ── Auth + seller info ──────────────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('sellerTheme');
    if (saved === 'dark') {
      setDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace('/auth/login'); return; }
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (!snap.exists()) { router.replace('/seller/register'); return; }
      const d = snap.data();
      if (!d?.displayName?.trim() || !d?.phone?.trim() || !d?.region?.trim()) {
        router.replace('/seller/register'); return;
      }
      setUserId(user.uid);
      setSellerInfo({
        name: d.displayName, region: d.region,
        city: d.city || '', phone: d.phone,
      });
      setAuthLoading(false);
    });
    return () => unsub();
  }, [router]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Photo picking ───────────────────────────────────────────────────────────
  const handlePickPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = files.slice(0, remaining);

    const newItems: PhotoItem[] = toAdd.map(file => {
      if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
        showToast('error', `${file.name} dépasse ${MAX_FILE_SIZE_MB}MB`);
        return null!;
      }
      return {
        id: Math.random().toString(36).slice(2),
        file,
        preview: URL.createObjectURL(file),
        progress: 0,
        url: null,
        error: null,
        uploading: false,
      };
    }).filter(Boolean);

    setPhotos(prev => [...prev, ...newItems]);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const removePhoto = (id: string) => {
    setPhotos(prev => {
      const item = prev.find(p => p.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return prev.filter(p => p.id !== id);
    });
  };

  // ── Upload vers Cloudinary ────────────────────────────────────────────────
  const uploadPhoto = async (item: PhotoItem, uid: string): Promise<string> => {
    const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME!;
    const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET!;

    setPhotos(prev => prev.map(p => p.id === item.id ? { ...p, uploading: true, progress: 0 } : p));

    const formData = new FormData();
    formData.append('file', item.file);
    formData.append('upload_preset', UPLOAD_PRESET);
    formData.append('folder', `agrimarche/products/${uid}`);
    formData.append('public_id', `${Date.now()}_${item.id}`);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          setPhotos(prev => prev.map(p => p.id === item.id ? { ...p, progress: pct } : p));
        }
      };

      xhr.onload = () => {
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          const url: string = data.secure_url;
          setPhotos(prev => prev.map(p => p.id === item.id ? { ...p, uploading: false, url, progress: 100 } : p));
          resolve(url);
        } else {
          const err = new Error(`Cloudinary error ${xhr.status}`);
          setPhotos(prev => prev.map(p => p.id === item.id ? { ...p, uploading: false, error: err.message } : p));
          reject(err);
        }
      };

      xhr.onerror = () => {
        const err = new Error('Erreur réseau Cloudinary');
        setPhotos(prev => prev.map(p => p.id === item.id ? { ...p, uploading: false, error: err.message } : p));
        reject(err);
      };

      xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`);
      xhr.send(formData);
    });
  };

  // ── Form submit ─────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    console.log('🔥🔥🔥 HANDLESUBMIT APPELÉ 🔥🔥🔥');
    if (!userId || !sellerInfo) return;

    // Validation
    if (!form.name.trim())      { showToast('error', 'Le nom du produit est requis'); return; }
    if (!form.category)         { showToast('error', 'Choisissez une catégorie'); return; }
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      showToast('error', 'Prix invalide'); return;
    }
    if (photos.length === 0)    { showToast('error', 'Ajoutez au moins 1 photo'); return; }

    setSubmitting(true);
    try {
      // 1. Upload all photos not yet uploaded
      const photoUrls: string[] = [];
      for (const photo of photos) {
        if (photo.url) {
          photoUrls.push(photo.url);
        } else {
          const url = await uploadPhoto(photo, userId);
          photoUrls.push(url);
        }
      }

      // 2. Save to Firestore
      console.log('=== DEBUG PRODUIT ===');
      console.log('auth.currentUser.uid:', auth.currentUser?.uid);
      console.log('userId (state):', userId);
      console.log('price:', Number(form.price), typeof Number(form.price));
      console.log('stock brut:', form.stock, '→', form.stock ? Number(form.stock) : null);
      console.log('stock is int?', Number.isInteger(form.stock ? Number(form.stock) : null));
      console.log('name:', form.name.trim(), 'length:', form.name.trim().length);

      const newProductRef = await addDoc(collection(db, 'products'), {
        name:          form.name.trim(),
        description:   form.description.trim(),
        price:         Number(form.price),
        unit:          form.unit,
        category:      form.category,
        // stock: null = illimité (voir placeholder "Laisser vide = illimité")
        stock:         form.stock ? Number(form.stock) : null,
        minOrder:      Number(form.minOrder) || 1,
        images:        photoUrls,
        sellerId:      userId,
        farmer:        sellerInfo.name,
        farmerPhone:   sellerInfo.phone,
        region:        sellerInfo.region,
        exactLocation: [sellerInfo.city, sellerInfo.region].filter(Boolean).join(', '),
        status:        'active',
        sales:         0,
        createdAt:     serverTimestamp(),
        updatedAt:     serverTimestamp(),
      });

      // Notifier tout le monde qu'un nouveau produit est disponible.
      // Best-effort : ne bloque jamais la publication du vendeur si ça échoue.
      notifyAllUsers({
        type: 'promotion',
        title: '🌾 Nouveau produit disponible !',
        body: `${form.name.trim()} par ${sellerInfo.name} — ${Number(form.price).toLocaleString('fr-FR')} FCFA/${form.unit}`,
        link: `/product?id=${newProductRef.id}`,
        excludeUserId: userId,
      });

      showToast('success', 'Produit publié avec succès !');
      setTimeout(() => router.push('/seller/products'), 1200);
    } catch (err: any) {
      console.error(err);
      showToast('error', 'Erreur lors de la publication');
      setSubmitting(false);
    }
  };

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-950 flex items-center justify-center">
        <div className="relative">
          <div className="w-14 h-14 rounded-full border-4 border-emerald-200 border-t-emerald-600 dark:border-emerald-800 dark:border-t-emerald-400 animate-spin" />
          <Leaf className="absolute inset-0 m-auto w-5 h-5 text-emerald-500 animate-pulse" />
        </div>
      </div>
    );
  }

  const canAddMore = photos.length < MAX_PHOTOS;
  const isUploading = photos.some(p => p.uploading);
  const formValid = form.name.trim() && form.category && Number(form.price) > 0 && photos.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/40 via-white to-teal-50/40 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-950/30 pb-28 transition-colors duration-300">

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-slideDown">
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
              : 'bg-gradient-to-r from-rose-500 to-pink-500'
          }`}>
            {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
            {toast.message}
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-6">

        {/* Header */}
        <div className="backdrop-blur-xl bg-white/70 dark:bg-gray-800/70 rounded-2xl p-4 mb-6 shadow-lg border border-white/30 dark:border-gray-700 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-600 transition"
          >
            <ArrowLeft size={18} className="text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-800 dark:text-white">Nouveau produit</h1>
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <MapPin size={9} />
              {sellerInfo ? `${sellerInfo.city || sellerInfo.region}` : 'Chargement...'}
            </p>
          </div>
          <div className="ml-auto w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-md">
            <Package size={18} className="text-white" />
          </div>
        </div>

        {/* ── PHOTOS ── */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon size={15} className="text-emerald-500" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">
              Photos
            </span>
            <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Existing photos */}
            {photos.map((photo) => (
              <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-700">
                <Image src={photo.preview} alt="preview" fill style={{ objectFit: 'cover' }} sizes="120px" />

                {/* Upload progress overlay */}
                {photo.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
                    <Loader2 size={18} className="text-white animate-spin" />
                    <span className="text-white text-xs font-bold">{photo.progress}%</span>
                    <div className="w-3/4 h-1 bg-white/30 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-400 transition-all duration-200"
                        style={{ width: `${photo.progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Done checkmark */}
                {photo.url && !photo.uploading && (
                  <div className="absolute bottom-1 right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center">
                    <CheckCircle size={12} className="text-white" />
                  </div>
                )}

                {/* Error */}
                {photo.error && (
                  <div className="absolute inset-0 bg-rose-500/70 flex items-center justify-center">
                    <XCircle size={20} className="text-white" />
                  </div>
                )}

                {/* Remove button */}
                {!photo.uploading && (
                  <button
                    onClick={() => removePhoto(photo.id)}
                    className="absolute top-1 right-1 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center shadow"
                  >
                    <X size={11} className="text-white" />
                  </button>
                )}

                {/* Order badge */}
                <div className="absolute top-1 left-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center">
                  <span className="text-white text-[9px] font-bold">
                    {photos.indexOf(photo) + 1}
                  </span>
                </div>
              </div>
            ))}

            {/* Add button */}
            {canAddMore && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-900/20 flex flex-col items-center justify-center gap-1 hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all duration-200 group"
              >
                <Plus size={20} className="text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                <span className="text-[9px] text-emerald-400 group-hover:text-emerald-600 font-medium">Ajouter</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePickPhotos}
          />

          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">
            Formats : JPG, PNG, WEBP · Max {MAX_FILE_SIZE_MB}MB par photo
          </p>
        </div>

        {/* ── INFOS PRODUIT ── */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Info size={15} className="text-emerald-500" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Informations</span>
          </div>

          {/* Nom */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <Tag size={11} /> Nom du produit *
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="ex: Tomates cerises bio de Niayes"
              maxLength={80}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
            />
          </div>

          {/* Catégorie */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <Layers size={11} /> Catégorie *
            </label>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setForm(f => ({ ...f, category: cat }))}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 ${
                    form.category === cat
                      ? 'bg-emerald-500 text-white shadow-md scale-105'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 flex items-center gap-1">
              <AlignLeft size={11} /> Description
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Origine, mode de culture, conservation..."
              rows={3}
              maxLength={400}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition resize-none"
            />
            <p className="text-right text-[10px] text-gray-400 mt-0.5">{form.description.length}/400</p>
          </div>
        </div>

        {/* ── PRIX & STOCK ── */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-2xl p-4 mb-4 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Scale size={15} className="text-emerald-500" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Prix & Stock</span>
          </div>

          {/* Prix + Unité */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Prix (FCFA) *
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                  placeholder="500"
                  min="0"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                />
              </div>
            </div>
            <div className="w-28">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Unité
              </label>
              <select
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
              >
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>

          {/* Stock + Commande min */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Stock disponible
              </label>
              <input
                type="number"
                value={form.stock}
                onChange={e => setForm(f => ({ ...f, stock: e.target.value }))}
                placeholder="Laisser vide = illimité"
                min="0"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
              />
            </div>
            <div className="w-28">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5">
                Commande min
              </label>
              <input
                type="number"
                value={form.minOrder}
                onChange={e => setForm(f => ({ ...f, minOrder: e.target.value }))}
                placeholder="1"
                min="1"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-white text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
              />
            </div>
          </div>

          {/* Prix affiché */}
          {form.price && Number(form.price) > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Prix affiché</span>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-300">
                {Number(form.price).toLocaleString()} FCFA
                <span className="text-xs font-normal ml-1 opacity-70">/{form.unit}</span>
              </span>
            </div>
          )}
        </div>

        {/* ── LOCALISATION (read-only) ── */}
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur rounded-2xl p-4 mb-6 shadow-sm border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <MapPin size={15} className="text-emerald-500" />
            <span className="text-sm font-bold text-gray-700 dark:text-gray-200">Localisation</span>
            <span className="ml-auto text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">Auto</span>
          </div>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 font-semibold">
            {sellerInfo ? `${sellerInfo.city ? sellerInfo.city + ', ' : ''}${sellerInfo.region}` : '—'}
          </p>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            Définie depuis votre profil vendeur
          </p>
        </div>

        {/* ── BOUTON PUBLIER ── */}
        <button
          onClick={handleSubmit}
          disabled={submitting || isUploading || !formValid}
          className={`w-full py-4 rounded-2xl font-black text-base tracking-wide transition-all duration-300 flex items-center justify-center gap-3 shadow-xl ${
            formValid && !submitting && !isUploading
              ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white hover:from-emerald-500 hover:to-teal-500 hover:shadow-emerald-200 dark:hover:shadow-emerald-900 hover:scale-[1.02] active:scale-[0.98]'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
          }`}
        >
          {submitting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Publication en cours…
            </>
          ) : isUploading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Upload photos…
            </>
          ) : (
            <>
              <Sparkles size={20} />
              Publier le produit
            </>
          )}
        </button>

        {!formValid && !submitting && (
          <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-2">
            {!form.name.trim() ? 'Nom requis' : !form.category ? 'Catégorie requise' : !form.price ? 'Prix requis' : 'Photo requise'}
          </p>
        )}

      </div>

      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-16px) translateX(-50%); }
          to   { opacity: 1; transform: translateY(0)    translateX(-50%); }
        }
        .animate-slideDown { animation: slideDown 0.25s ease-out forwards; }
      `}</style>
    </div>
  );
}

