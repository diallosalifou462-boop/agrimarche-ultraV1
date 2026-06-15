'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { db, storage } from '@/lib/firebase/firebase';
import { collection, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Package, Plus, Loader2, ArrowLeft, Upload, X,
  Sparkles, Leaf, CheckCircle, AlertCircle, Image as ImageIcon,
  Wand2, Trash2, Camera, Zap, Star, Heart, Shield,
  Rocket, Gem, Crown
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

// Configuration API Remove.bg
const REMOVE_BG_API_KEY = process.env.NEXT_PUBLIC_REMOVE_BG_API_KEY;

// Categories completes (sans emojis)
const CATEGORIES = [
  { id: 'tous', label: 'Tous', color: 'bg-gray-500' },
  { id: 'fruits', label: 'Fruits', color: 'bg-red-500' },
  { id: 'legumes', label: 'Legumes', color: 'bg-green-500' },
  { id: 'cereales', label: 'Cereales', color: 'bg-amber-500' },
  { id: 'tubercules', label: 'Tubercules', color: 'bg-orange-500' },
  { id: 'machines_agricoles', label: 'Machines agricoles', color: 'bg-blue-600' },
  { id: 'condiments', label: 'Condiments', color: 'bg-yellow-600' },
  { id: 'poissons', label: 'Poissons', color: 'bg-cyan-500' },
  { id: 'produits_laitiers', label: 'Produits laitiers', color: 'bg-sky-500' },
  { id: 'legumineuses', label: 'Legumineuses', color: 'bg-emerald-600' },
  { id: 'engrais', label: 'Engrais', color: 'bg-lime-600' },
  { id: 'boissons_locales', label: 'Boissons locales', color: 'bg-teal-600' },
];

export default function AddProductPage() {
  const router = useRouter();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [cleaningImage, setCleaningImage] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [cleanedImageUrl, setCleanedImageUrl] = useState<string | null>(null);
  const [aiConfidence, setAiConfidence] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    price: '',
    originalPrice: '',
    unit: 'kg',
    stock: '',
    category: 'legumes',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 🔒 Vérifier que le vendeur a rempli son profil avant d'ajouter un produit
  useEffect(() => {
    if (!user) return;
    const checkProfile = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (!userDoc.exists()) {
          router.replace('/seller/register');
          return;
        }
        const data = userDoc.data();
        const isComplete = data.displayName?.trim() && data.phone?.trim() && data.region?.trim();
        if (!isComplete) {
          router.replace('/seller/register');
        }
      } catch (e) {
        console.error('Vérification profil:', e);
      }
    };
    checkProfile();
  }, [user, router]);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  // Nettoyage image par IA
  const cleanImageWithAI = async (file: File): Promise<string | null> => {
    if (!REMOVE_BG_API_KEY) {
      showToast('error', 'Configuration API manquante');
      return null;
    }

    setCleaningImage(true);
    const formData = new FormData();
    formData.append('image_file', file);
    formData.append('size', 'auto');
    formData.append('type', 'product');

    try {
      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': REMOVE_BG_API_KEY,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.errors?.[0]?.title || `Erreur ${response.status}`);
      }

      const blob = await response.blob();
      const cleanedFile = new File([blob], `ai_cleaned_${Date.now()}.png`, { type: 'image/png' });
      
      const storageRef = ref(storage, `products/${user?.uid}/cleaned/${Date.now()}.png`);
      await uploadBytes(storageRef, cleanedFile);
      const downloadUrl = await getDownloadURL(storageRef);
      
      setCleanedImageUrl(downloadUrl);
      setAiConfidence(98);
      showToast('success', 'IA : fond supprimé avec succès !');
      return downloadUrl;
    } catch (error: any) {
      console.error('Erreur API Remove.bg:', error);
      showToast('error', `Nettoyage IA échoué: ${error.message}`);
      return null;
    } finally {
      setCleaningImage(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast('error', 'Format non supporté (JPG, PNG, WebP uniquement)');
      return;
    }

    if (file.size > 8 * 1024 * 1024) {
      showToast('error', 'Image trop lourde (max 8 Mo)');
      return;
    }

    setUploadingImage(true);
    setImageFile(file);
    
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const originalRef = ref(storage, `products/${user?.uid}/originals/${Date.now()}_${file.name}`);
      await uploadBytes(originalRef, file);
      const originalUrl = await getDownloadURL(originalRef);
      
      const cleanedUrl = await cleanImageWithAI(file);
      
      if (cleanedUrl) {
        setImagePreview(cleanedUrl);
        showToast('success', 'Photo professionnelle prête !');
      } else {
        setImagePreview(originalUrl);
      }
    } catch (error) {
      console.error('Upload error:', error);
      showToast('error', 'Erreur lors de l\'upload');
      setImagePreview(null);
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setCleanedImageUrl(null);
    setAiConfidence(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Nom du produit requis';
    if (formData.name.length < 3) newErrors.name = 'Minimum 3 caracteres';
    if (formData.name.length > 50) newErrors.name = 'Maximum 50 caracteres';
    if (!formData.price || Number(formData.price) <= 0) newErrors.price = 'Prix valide requis';
    if (Number(formData.price) > 1000000) newErrors.price = 'Prix maximum: 1 000 000 FCFA';
    if (formData.stock && Number(formData.stock) < 0) newErrors.stock = 'Stock invalide';
    if (!imagePreview) newErrors.image = 'Ajoutez une photo du produit';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showToast('error', 'Connexion requise');
      router.push('/auth/login');
      return;
    }
    if (!validateForm()) return;

    setLoading(true);
    try {
      const finalImageUrl = cleanedImageUrl || imagePreview;
      
      const productData = {
        sellerId: user.uid,
        name: formData.name.trim(),
        description: formData.description.trim() || 'Produit de qualite, directement du producteur',
        price: Number(formData.price),
        originalPrice: formData.originalPrice && Number(formData.originalPrice) > Number(formData.price) ? Number(formData.originalPrice) : null,
        unit: formData.unit,
        stock: formData.stock === '' ? -1 : Number(formData.stock),
        category: formData.category,
        categoryLabel: CATEGORIES.find(c => c.id === formData.category)?.label || formData.category,
        status: 'active',
        sales: 0,
        images: [finalImageUrl],
        aiEnhanced: !!cleanedImageUrl,
        aiConfidence: aiConfidence,
        createdAt: serverTimestamp(),
        updatedAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'products'), productData);
      showToast('success', 'Produit ajouté avec succès !');

      // ✅ ENVOI DE LA NOTIFICATION À TOUS LES UTILISATEURS
      try {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 'all',
            title: '🌾 Nouveau produit disponible !',
            body: `${formData.name} - ${Number(formData.price).toLocaleString()} FCFA`,
            link: '/main/products',
          }),
        });
      } catch (notifError) {
        console.error('Erreur lors de l\'envoi de la notification:', notifError);
      }
      
      setTimeout(() => {
        router.push('/seller/dashboard');
      }, 2000);
    } catch (error) {
      console.error('Erreur:', error);
      showToast('error', 'Erreur lors de l\'ajout du produit');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur rounded-3xl p-8 text-center max-w-md shadow-2xl">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Package size={32} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-2">Bienvenue !</h2>
          <p className="text-gray-500 mb-6">Connectez-vous pour ajouter vos produits</p>
          <button 
            onClick={() => router.push('/auth/login')} 
            className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white px-8 py-3 rounded-xl font-semibold hover:scale-105 transition"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  const selectedCategory = CATEGORIES.find(c => c.id === formData.category);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/30 via-white to-teal-50/30 pb-24">
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-slideDown">
          <div className={`flex items-center gap-2 px-5 py-3 rounded-xl shadow-xl backdrop-blur ${
            toast.type === 'success' 
              ? 'bg-emerald-500 text-white' 
              : 'bg-rose-500 text-white'
          }`}>
            {toast.type === 'success' ? <Sparkles size={18} /> : <AlertCircle size={18} />}
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-8">
          <Link href="/seller/dashboard" className="group flex items-center gap-2 text-gray-600 hover:text-emerald-600 transition">
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Retour</span>
          </Link>
          <div className="text-center">
            <h1 className="text-2xl font-black bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent flex items-center gap-2">
              <Gem size={22} className="text-emerald-500" />
              Nouveau produit
            </h1>
            <p className="text-[10px] text-gray-400 mt-1">Optimise par IA</p>
          </div>
          <div className="w-16" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Upload Image */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/50">
            <label className="block font-bold text-gray-800 mb-3 flex items-center gap-2">
              <Camera size={18} className="text-emerald-500" />
              Photo du produit
              {cleaningImage && (
                <span className="ml-2 text-xs text-emerald-600 flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  IA en action...
                </span>
              )}
            </label>
            
            {!imagePreview ? (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-all group"
              >
                <div className="w-20 h-20 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition shadow-lg">
                  <Rocket size={32} className="text-emerald-600" />
                </div>
                <p className="text-sm font-medium text-gray-700">Cliquez pour ajouter une photo</p>
                <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP (max 8 Mo)</p>
                <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full text-xs font-bold shadow-md">
                  <Wand2 size={14} />
                  IA : Suppression fond automatique
                </div>
              </div>
            ) : (
              <div className="relative">
                <div className="relative aspect-square w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-gradient-to-br from-gray-100 to-gray-50 shadow-lg">
                  <Image src={imagePreview} alt="Aperçu" fill className="object-contain" />
                  {cleaningImage && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center">
                      <div className="bg-white rounded-xl p-4 flex items-center gap-3 shadow-2xl">
                        <Loader2 size={24} className="animate-spin text-emerald-500" />
                        <div>
                          <p className="font-bold text-gray-800">IA en action</p>
                          <p className="text-xs text-gray-500">Suppression du fond...</p>
                        </div>
                      </div>
                    </div>
                  )}
                  {cleanedImageUrl && !cleaningImage && (
                    <div className="absolute top-3 right-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-full p-1.5 shadow-lg">
                      <CheckCircle size={14} />
                    </div>
                  )}
                </div>
                
                <div className="flex justify-center gap-2 mt-3">
                  <button
                    type="button"
                    onClick={removeImage}
                    className="px-3 py-1.5 bg-rose-50 text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-100 transition flex items-center gap-1"
                  >
                    <Trash2 size={12} />
                    Supprimer
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium hover:bg-gray-200 transition flex items-center gap-1"
                  >
                    <Upload size={12} />
                    Changer
                  </button>
                </div>

                {cleanedImageUrl && (
                  <div className="mt-2 text-center">
                    <p className="text-xs text-emerald-600 font-medium flex items-center justify-center gap-1">
                      <Star size={12} className="fill-emerald-500" />
                      Nettoye par IA
                      <Shield size={10} />
                    </p>
                  </div>
                )}
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            {errors.image && <p className="text-rose-500 text-xs mt-2 text-center">{errors.image}</p>}
          </div>

          {/* Formulaire produit */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-6 shadow-xl border border-white/50 space-y-5">
            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">
                Nom du produit <span className="text-emerald-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Ex: Tomates bio coeur de boeuf"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition"
              />
              {errors.name && <p className="text-rose-500 text-xs mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-800 mb-2">Description</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                rows={3}
                placeholder="Décrivez votre produit (origine, qualite, certification...)"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none transition resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-1">Optionnel mais recommande</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Prix <span className="text-emerald-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                    placeholder="0"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">FCFA</span>
                </div>
                {errors.price && <p className="text-rose-500 text-xs mt-1">{errors.price}</p>}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Prix barré <span className="text-gray-400 text-xs font-normal">(optionnel)</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={formData.originalPrice}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value })}
                    placeholder="Ancien prix"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">FCFA</span>
                </div>
                {formData.originalPrice && Number(formData.originalPrice) <= Number(formData.price) && (
                  <p className="text-amber-500 text-xs mt-1">Doit être supérieur au prix actuel</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">Unite</label>
                <select
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none"
                >
                  <option value="kg">Kilogramme (kg)</option>
                  <option value="g">Gramme (g)</option>
                  <option value="l">Litre (L)</option>
                  <option value="unite">Piece (unite)</option>
                  <option value="botte">Botte</option>
                  <option value="sachet">Sachet</option>
                  <option value="bunch">Regime</option>
                  <option value="douzaine">Douzaine</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">Stock disponible</label>
                <input
                  type="number"
                  value={formData.stock}
                  onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  placeholder="Illimite"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none"
                />
                <p className="text-[10px] text-gray-400 mt-1">Laisser vide = stock illimite</p>
              </div>

              {/* Selection categorie */}
              <div>
                <label className="block text-sm font-bold text-gray-800 mb-2">
                  Categorie <span className="text-emerald-500">*</span>
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 outline-none"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
                {selectedCategory && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${selectedCategory.color}`}></div>
                    <span className="text-xs text-gray-500">
                      Categorie : {selectedCategory.label}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bouton submit */}
          <button
            type="submit"
            disabled={loading || uploadingImage || cleaningImage}
            className="relative w-full overflow-hidden group bg-gradient-to-r from-emerald-600 via-green-600 to-teal-600 text-white py-4 rounded-xl font-bold shadow-xl transition-all duration-300 hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-400 via-green-400 to-teal-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <span className="relative flex items-center justify-center gap-2">
              {loading || uploadingImage || cleaningImage ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {cleaningImage ? 'IA nettoie la photo...' : uploadingImage ? 'Upload en cours...' : 'Ajout en cours...'}
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  Ajouter mon produit
                  <Zap size={14} />
                </>
              )}
            </span>
          </button>
        </form>

        {/* Bandeau premium IA */}
        <div className="mt-8 p-5 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-emerald-500/10 rounded-2xl text-center border border-emerald-200/50 backdrop-blur-sm">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Crown size={18} className="text-emerald-600" />
            <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Experience Premium IA</span>
            <Wand2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-[11px] text-gray-600 leading-relaxed">
            Nos vendeurs augmentent leurs ventes de <strong className="text-emerald-600">+47%</strong> avec des photos nettes<br />
            Nettoyage automatique de l'arriere-plan par intelligence artificielle
          </p>
          <div className="flex items-center justify-center gap-1 mt-3">
            <Heart size={10} className="text-rose-400" />
            <span className="text-[9px] text-gray-400">100% gratuit • instantane • professionnel</span>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-20px) translateX(-50%); }
          to { opacity: 1; transform: translateY(0) translateX(-50%); }
        }
        .animate-slideDown {
          animation: slideDown 0.3s ease-out forwards;
        }
      `}</style>
    </div>
  );
}