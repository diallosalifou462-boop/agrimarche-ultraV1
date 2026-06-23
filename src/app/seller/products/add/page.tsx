'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { db, storage } from '@/lib/firebase/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Package, Plus, Loader2, ArrowLeft, X, CheckCircle, AlertCircle, Camera, Leaf } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

// ─── Config ───────────────────────────────────────────────────────────────────
const MAX_IMAGES = 5;
const MAX_DIMENSION = 800;   // px — petit = léger = rapide sur 3G
const JPEG_QUALITY = 0.65;   // bon compromis qualité/poids

const CATEGORIES = [
  { id: 'fruits', label: 'Fruits' },
  { id: 'legumes', label: 'Légumes' },
  { id: 'cereales', label: 'Céréales' },
  { id: 'tubercules', label: 'Tubercules' },
  { id: 'machines_agricoles', label: 'Machines agricoles' },
  { id: 'condiments', label: 'Condiments' },
  { id: 'poissons', label: 'Poissons' },
  { id: 'produits_laitiers', label: 'Produits laitiers' },
  { id: 'legumineuses', label: 'Légumineuses' },
  { id: 'engrais', label: 'Engrais' },
  { id: 'boissons_locales', label: 'Boissons locales' },
];

// ─── Compression rapide ───────────────────────────────────────────────────────
function compressImage(file: File): Promise<{ file: File; originalKb: number; compressedKb: number }> {
  return new Promise((resolve) => {
    if (file.type === 'image/gif') {
      resolve({ file, originalKb: file.size / 1024, compressedKb: file.size / 1024 });
      return;
    }
    const img = document.createElement('img');
    const url = URL.createObjectURL(file);
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
        if (width > height) { height = Math.round(height * MAX_DIMENSION / width); width = MAX_DIMENSION; }
        else { width = Math.round(width * MAX_DIMENSION / height); height = MAX_DIMENSION; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.filter = 'contrast(1.05) saturate(1.08) brightness(1.02)';
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob || blob.size >= file.size) {
          resolve({ file, originalKb: file.size / 1024, compressedKb: file.size / 1024 });
          return;
        }
        const compressed = new File([blob], file.name.replace(/\.(png|jpe?g|webp)$/i, '.jpg'), { type: 'image/jpeg' });
        resolve({ file: compressed, originalKb: file.size / 1024, compressedKb: compressed.size / 1024 });
      }, 'image/jpeg', JPEG_QUALITY);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ file, originalKb: file.size / 1024, compressedKb: file.size / 1024 }); };
    img.src = url;
  });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface ImageEntry {
  id: string;
  localPreview: string; // blob URL — affiché immédiatement
  uploadedUrl: string | null;
  progress: number;     // 0-100
  status: 'compressing' | 'uploading' | 'done' | 'error';
  sizeInfo?: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AddProductPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<ImageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '', description: '', price: '', originalPrice: '',
    unit: 'kg', stock: '', category: 'legumes',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Vérif profil vendeur
  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid)).then((snap) => {
      if (!snap.exists()) { router.replace('/seller/register'); return; }
      const d = snap.data();
      if (!d.displayName?.trim() || !d.phone?.trim() || !d.region?.trim())
        router.replace('/seller/register');
    }).catch(console.error);
  }, [user, router]);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, message: msg });
    setTimeout(() => setToast(null), 4000);
  };

  const updateImage = (id: string, patch: Partial<ImageEntry>) =>
    setImages((prev) => prev.map((img) => img.id === id ? { ...img, ...patch } : img));

  // ─── Upload avec progression ──────────────────────────────────────────────
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const slots = MAX_IMAGES - images.length;
    if (slots <= 0) { showToast('error', `Maximum ${MAX_IMAGES} photos`); return; }
    const candidates = files.slice(0, slots);

    const valid = candidates.filter((f) => {
      if (!f.type.startsWith('image/')) { showToast('error', 'Format non supporté'); return false; }
      if (f.size > 10 * 1024 * 1024) { showToast('error', 'Image trop lourde (max 10 Mo)'); return false; }
      return true;
    });
    if (!valid.length) { if (fileInputRef.current) fileInputRef.current.value = ''; return; }

    // 1. Créer aperçus locaux IMMÉDIATEMENT — le vendeur voit ses photos de suite
    const entries: ImageEntry[] = valid.map((f) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
      localPreview: URL.createObjectURL(f),
      uploadedUrl: null,
      progress: 0,
      status: 'compressing',
    }));
    setImages((prev) => [...prev, ...entries]);

    // 2. Compresser + uploader en parallèle avec progression
    await Promise.all(valid.map(async (file, i) => {
      const entry = entries[i];
      try {
        // Compression
        const { file: compressed, originalKb, compressedKb } = await compressImage(file);
        const saved = Math.round(100 - (compressedKb / originalKb) * 100);
        updateImage(entry.id, {
          status: 'uploading',
          progress: 5,
          sizeInfo: saved > 5 ? `-${saved}%` : undefined,
        });

        // Upload avec progression réelle
        const storageRef = ref(storage, `products/${user?.uid}/${Date.now()}_${compressed.name}`);
        const task = uploadBytesResumable(storageRef, compressed);

        await new Promise<void>((resolve, reject) => {
          task.on('state_changed',
            (snap) => {
              const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
              updateImage(entry.id, { progress: pct });
            },
            (err) => { reject(err); },
            async () => {
              const url = await getDownloadURL(task.snapshot.ref);
              updateImage(entry.id, { uploadedUrl: url, status: 'done', progress: 100 });
              resolve();
            }
          );
        });
      } catch {
        updateImage(entry.id, { status: 'error', progress: 0 });
        showToast('error', "Erreur d'upload, réessayez");
      }
    }));

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img?.localPreview.startsWith('blob:')) URL.revokeObjectURL(img.localPreview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const setMainImage = (id: string) => {
    setImages((prev) => {
      const idx = prev.findIndex((i) => i.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.unshift(item);
      return next;
    });
  };

  // ─── Validation ───────────────────────────────────────────────────────────
  const validate = () => {
    const e: Record<string, string> = {};
    if (!formData.name.trim() || formData.name.length < 3) e.name = 'Minimum 3 caractères';
    if (formData.name.length > 50) e.name = 'Maximum 50 caractères';
    if (!formData.price || Number(formData.price) <= 0) e.price = 'Prix valide requis';
    if (Number(formData.price) > 1000000) e.price = 'Prix max: 1 000 000 FCFA';
    if (formData.stock && Number(formData.stock) < 0) e.stock = 'Stock invalide';
    if (!images.filter(i => i.status === 'done').length) e.image = 'Ajoutez au moins une photo';
    setErrors(e);
    return !Object.keys(e).length;
  };

  // ─── Submit ───────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { router.push('/auth/login'); return; }
    if (!validate()) return;
    setLoading(true);
    try {
      const imageUrls = images.filter(i => i.uploadedUrl).map(i => i.uploadedUrl!);
      await addDoc(collection(db, 'products'), {
        sellerId: user.uid,
        name: formData.name.trim(),
        description: formData.description.trim() || 'Produit de qualité, directement du producteur',
        price: Number(formData.price),
        originalPrice: formData.originalPrice && Number(formData.originalPrice) > Number(formData.price)
          ? Number(formData.originalPrice) : null,
        unit: formData.unit,
        stock: formData.stock === '' ? -1 : Number(formData.stock),
        category: formData.category,
        categoryLabel: CATEGORIES.find(c => c.id === formData.category)?.label || formData.category,
        status: 'active', sales: 0, images: imageUrls,
        createdAt: serverTimestamp(),
        updatedAt: new Date().toISOString(),
      });

      fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'all',
          title: '🌾 Nouveau produit disponible !',
          body: `${formData.name} - ${Number(formData.price).toLocaleString()} FCFA`,
          link: '/main/products',
        }),
      }).catch(console.error);

      showToast('success', 'Produit ajouté !');
      setTimeout(() => router.push('/seller/dashboard'), 1500);
    } catch {
      showToast('error', "Erreur lors de l'ajout");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return (
    <div className="min-h-screen bg-emerald-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center shadow-lg max-w-sm w-full">
        <Package size={36} className="text-emerald-500 mx-auto mb-3" />
        <h2 className="text-lg font-bold mb-4">Connexion requise</h2>
        <button onClick={() => router.push('/auth/login')} className="w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold">
          Se connecter
        </button>
      </div>
    </div>
  );

  const anyUploading = images.some(i => i.status === 'compressing' || i.status === 'uploading');
  const allDone = images.length > 0 && images.every(i => i.status === 'done' || i.status === 'error');

  return (
    <div className="min-h-screen bg-gray-50 pb-24">

      {/* Toast */}
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50" style={{ animation: 'slideDown .25s ease-out' }}>
          <div className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-white text-sm font-medium ${
            toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
          }`}>
            {toast.type === 'success' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
            {toast.message}
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-5">

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/seller/dashboard" className="p-2 rounded-xl bg-white shadow-sm border border-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </Link>
          <h1 className="text-lg font-black text-gray-800 flex items-center gap-2">
            <Leaf size={18} className="text-emerald-500" />
            Nouveau produit
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* ── Photos ── */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="flex items-center gap-2 font-bold text-gray-800 text-sm">
                <Camera size={15} className="text-emerald-500" />
                Photos
                <span className="text-gray-400 font-normal">({images.length}/{MAX_IMAGES})</span>
              </label>
              {anyUploading && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> En cours...
                </span>
              )}
              {allDone && images.length > 0 && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle size={11} /> Prêt
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2">
              {images.map((img, idx) => (
                <div key={img.id} className="relative">
                  <div
                    onClick={() => img.status === 'done' && idx !== 0 && setMainImage(img.id)}
                    className={`relative aspect-square rounded-xl overflow-hidden bg-gray-100 ${
                      img.status === 'done' && idx !== 0 ? 'cursor-pointer' : ''
                    }`}
                  >
                    {/* Aperçu local immédiat */}
                    <Image src={img.localPreview} alt="" fill className="object-cover" unoptimized />

                    {/* Overlay progression */}
                    {(img.status === 'compressing' || img.status === 'uploading') && (
                      <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1">
                        {/* Barre de progression */}
                        <div className="w-3/4 h-1.5 bg-white/30 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-white rounded-full transition-all duration-300"
                            style={{ width: `${img.status === 'compressing' ? 5 : img.progress}%` }}
                          />
                        </div>
                        <span className="text-white text-[10px] font-bold">
                          {img.status === 'compressing' ? 'Optimisation...' : `${img.progress}%`}
                        </span>
                      </div>
                    )}

                    {/* Erreur */}
                    {img.status === 'error' && (
                      <div className="absolute inset-0 bg-rose-500/80 flex items-center justify-center">
                        <AlertCircle size={20} className="text-white" />
                      </div>
                    )}

                    {/* Badge principale */}
                    {idx === 0 && img.status === 'done' && (
                      <div className="absolute top-1 left-1 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
                        Principale
                      </div>
                    )}

                    {/* Badge taille économisée */}
                    {img.sizeInfo && img.status === 'done' && (
                      <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[8px] px-1 py-0.5 rounded">
                        {img.sizeInfo}
                      </div>
                    )}
                  </div>

                  {/* Supprimer */}
                  <button
                    type="button"
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center shadow"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}

              {/* Bouton ajouter */}
              {images.length < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center hover:border-emerald-400 hover:bg-emerald-50 transition"
                >
                  <Plus size={22} className="text-emerald-400 mb-0.5" />
                  <span className="text-[9px] text-gray-400">Photo</span>
                </button>
              )}
            </div>

            <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden" />
            {errors.image && <p className="text-rose-500 text-xs mt-2">{errors.image}</p>}

            <p className="text-[10px] text-gray-400 text-center mt-2">
              Photos optimisées automatiquement · JPG PNG WebP · max 10 Mo
            </p>
          </div>

          {/* ── Formulaire ── */}
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Nom du produit <span className="text-emerald-500">*</span>
              </label>
              <input
                type="text" value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Tomates, Mil local, Mangues..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 outline-none text-sm"
              />
              {errors.name && <p className="text-rose-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={2} placeholder="Origine, qualité..."
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 outline-none resize-none text-sm"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">
                  Prix <span className="text-emerald-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number" value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 outline-none text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">FCFA</span>
                </div>
                {errors.price && <p className="text-rose-500 text-xs mt-1">{errors.price}</p>}
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Prix barré</label>
                <div className="relative">
                  <input
                    type="number" value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                    placeholder="Optionnel"
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 outline-none text-sm"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-[10px]">FCFA</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Unité</label>
                <select value={formData.unit} onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                  {['kg','tonne','g','l','unite','botte','sachet','bunch','douzaine'].map(u =>
                    <option key={u} value={u}>{u}</option>
                  )}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Stock</label>
                <input
                  type="number" value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="Illimité"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-50 outline-none text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">
                Catégorie <span className="text-emerald-500">*</span>
              </label>
              <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-emerald-400 outline-none text-sm">
                {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>

          {/* ── Submit ── */}
          <button
            type="submit"
            disabled={loading || anyUploading}
            className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold text-sm shadow-md hover:bg-emerald-700 active:scale-[0.98] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 size={17} className="animate-spin" /> Ajout en cours...</>
            ) : anyUploading ? (
              <><Loader2 size={17} className="animate-spin" /> Upload en cours...</>
            ) : (
              'Ajouter mon produit'
            )}
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-12px) translateX(-50%); }
          to   { opacity: 1; transform: translateY(0)    translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
