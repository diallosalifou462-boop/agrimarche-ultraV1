"use strict";
'use client';
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = SellerProductsPage;
const react_1 = require("react");
const navigation_1 = require("next/navigation");
const firestore_1 = require("firebase/firestore");
const storage_1 = require("firebase/storage");
const firebase_1 = require("@/lib/firebase/firebase");
const useAuth_1 = require("@/hooks/useAuth");
const CATEGORIES = [
    'Légumes', 'Fruits', 'Céréales', 'Légumineuses',
    'Tubercules', 'Épices', 'Laitier', 'Viande', 'Poisson', 'Autre',
];
const UNITS = ['kg', 'g', 'litre', 'pièce', 'sac', 'botte', 'caisse', 'tonne'];
const EMPTY_FORM = {
    name: '', description: '', price: '', originalPrice: '',
    category: 'Légumes', stock: '', unit: 'kg', location: '',
    isOrganic: false, minOrder: '', tags: '',
};
function formatPrice(n) {
    return new Intl.NumberFormat('fr-SN', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n);
}
function SellerProductsPage() {
    const { user, loading: authLoading } = (0, useAuth_1.useAuth)();
    const router = (0, navigation_1.useRouter)();
    const [products, setProducts] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [modalOpen, setModalOpen] = (0, react_1.useState)(false);
    const [editingId, setEditingId] = (0, react_1.useState)(null);
    const [form, setForm] = (0, react_1.useState)(EMPTY_FORM);
    const [saving, setSaving] = (0, react_1.useState)(false);
    const [deleting, setDeleting] = (0, react_1.useState)(null);
    const [uploadProgress, setUploadProgress] = (0, react_1.useState)(0);
    const [previewImages, setPreviewImages] = (0, react_1.useState)([]);
    const [uploadedUrls, setUploadedUrls] = (0, react_1.useState)([]);
    const [error, setError] = (0, react_1.useState)('');
    const [success, setSuccess] = (0, react_1.useState)('');
    const fileRef = (0, react_1.useRef)(null);
    // Auth guard
    (0, react_1.useEffect)(() => {
        if (!authLoading && !user)
            router.replace('/auth/login');
        if (!authLoading && !user) {
            router.replace('/main/products');
        }
    }, [user, authLoading, router]);
    // Écoute produits vendeur en temps réel
    (0, react_1.useEffect)(() => {
        if (!user)
            return;
        const q = (0, firestore_1.query)((0, firestore_1.collection)(firebase_1.db, 'products'), (0, firestore_1.where)('sellerId', '==', user.uid), (0, firestore_1.orderBy)('createdAt', 'desc'));
        const unsub = (0, firestore_1.onSnapshot)(q, (snap) => {
            setProducts(snap.docs.map(d => (Object.assign({ id: d.id }, d.data()))));
            setLoading(false);
        });
        return () => unsub();
    }, [user]);
    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setPreviewImages([]);
        setUploadedUrls([]);
        setError('');
        setModalOpen(true);
    };
    const openEdit = (p) => {
        var _a, _b, _c, _d;
        setEditingId(p.id);
        setForm({
            name: p.name, description: p.description,
            price: String(p.price), originalPrice: p.originalPrice ? String(p.originalPrice) : '',
            category: p.category, stock: String(p.stock), unit: p.unit,
            location: p.location, isOrganic: p.isOrganic,
            minOrder: p.minOrder ? String(p.minOrder) : '',
            tags: (_b = (_a = p.tags) === null || _a === void 0 ? void 0 : _a.join(', ')) !== null && _b !== void 0 ? _b : '',
        });
        setPreviewImages((_c = p.images) !== null && _c !== void 0 ? _c : []);
        setUploadedUrls((_d = p.images) !== null && _d !== void 0 ? _d : []);
        setError('');
        setModalOpen(true);
    };
    const handleImageUpload = (e) => {
        var _a;
        const files = Array.from((_a = e.target.files) !== null && _a !== void 0 ? _a : []);
        if (!files.length || !user)
            return;
        files.forEach(file => {
            // Prévisualisation immédiate
            const reader = new FileReader();
            reader.onload = (ev) => {
                setPreviewImages(prev => { var _a; return [...prev, (_a = ev.target) === null || _a === void 0 ? void 0 : _a.result]; });
            };
            reader.readAsDataURL(file);
            // Upload Firebase Storage
            const storageRef = (0, storage_1.ref)(firebase_1.storage, `products/${user.uid}/${Date.now()}_${file.name}`);
            const uploadTask = (0, storage_1.uploadBytesResumable)(storageRef, file);
            uploadTask.on('state_changed', (snap) => {
                setUploadProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
            }, (err) => { console.error('Upload error:', err); }, async () => {
                const url = await (0, storage_1.getDownloadURL)(uploadTask.snapshot.ref);
                setUploadedUrls(prev => [...prev, url]);
                setUploadProgress(0);
            });
        });
    };
    const removeImage = (index) => {
        setPreviewImages(prev => prev.filter((_, i) => i !== index));
        setUploadedUrls(prev => prev.filter((_, i) => i !== index));
    };
    const handleSave = async () => {
        setError('');
        if (!form.name.trim()) {
            setError('Le nom du produit est obligatoire.');
            return;
        }
        if (!form.price || isNaN(Number(form.price))) {
            setError('Prix invalide.');
            return;
        }
        if (!form.stock || isNaN(Number(form.stock))) {
            setError('Stock invalide.');
            return;
        }
        if (!user)
            return;
        setSaving(true);
        try {
            const data = {
                name: form.name.trim(),
                description: form.description.trim(),
                price: Number(form.price),
                originalPrice: form.originalPrice ? Number(form.originalPrice) : null,
                category: form.category,
                categoryId: form.category.toLowerCase(),
                stock: Number(form.stock),
                unit: form.unit,
                location: form.location.trim(),
                isOrganic: form.isOrganic,
                minOrder: form.minOrder ? Number(form.minOrder) : 1,
                tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
                images: uploadedUrls,
                sellerId: user.uid,
                sellerName: user.displayName || 'Vendeur',
                sellerRating: 0,
                rating: 0,
                reviewCount: 0,
                status: 'active',
                updatedAt: (0, firestore_1.serverTimestamp)(),
            };
            if (editingId) {
                await (0, firestore_1.updateDoc)((0, firestore_1.doc)(firebase_1.db, 'products', editingId), data);
                setSuccess('Produit modifié avec succès ✅');
            }
            else {
                const docRef = await (0, firestore_1.addDoc)((0, firestore_1.collection)(firebase_1.db, 'products'), Object.assign(Object.assign({}, data), { createdAt: (0, firestore_1.serverTimestamp)() }));
                setSuccess('Produit ajouté avec succès ✅');
                try {
                    await fetch('/api/notify/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            productId: docRef.id,
                            productName: data.name,
                            productPrice: data.price,
                            farmerName: data.sellerName
                        })
                    });
                }
                catch (notifyError) {
                    console.error('Erreur notification:', notifyError);
                }
            }
            setModalOpen(false);
            setTimeout(() => setSuccess(''), 3000);
        }
        catch (err) {
            console.error(err);
            setError('Erreur lors de la sauvegarde. Réessayez.');
        }
        finally {
            setSaving(false);
        }
    };
    const handleDelete = async (id) => {
        if (!confirm('Supprimer ce produit ?'))
            return;
        setDeleting(id);
        try {
            await (0, firestore_1.deleteDoc)((0, firestore_1.doc)(firebase_1.db, 'products', id));
        }
        catch (err) {
            console.error(err);
            alert('Erreur lors de la suppression.');
        }
        finally {
            setDeleting(null);
        }
    };
    const setField = (k, v) => setForm(prev => (Object.assign(Object.assign({}, prev), { [k]: v })));
    if (authLoading || loading) {
        return (<div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center"><div className="text-4xl mb-3">🌱</div>
          <p className="text-gray-500 text-sm">Chargement…</p></div>
      </div>);
    }
    return (<div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4 sticky top-14 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="font-bold text-gray-900">Mes produits</h1>
            <p className="text-xs text-gray-500 mt-0.5">{products.length} produit{products.length > 1 ? 's' : ''}</p>
          </div>
          <button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-2 transition">
            <span className="text-base">+</span> Ajouter un produit
          </button>
        </div>
      </div>

      {/* Notification succès */}
      {success && (<div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up">
          {success}
        </div>)}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {products.length === 0 ? (<div className="text-center py-20">
            <div className="text-6xl mb-4">📦</div>
            <p className="font-semibold text-gray-900 mb-2">Aucun produit encore</p>
            <p className="text-sm text-gray-500 mb-6">Ajoutez votre premier produit pour commencer à vendre</p>
            <button onClick={openCreate} className="bg-green-600 hover:bg-green-700 text-white font-semibold px-6 py-3 rounded-xl transition">
              + Ajouter mon premier produit
            </button>
          </div>) : (<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map(product => {
                var _a;
                return (<div key={product.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                {/* Image */}
                <div className="aspect-video bg-gray-100 relative overflow-hidden">
                  {((_a = product.images) === null || _a === void 0 ? void 0 : _a[0]) ? (<img src={product.images[0]} alt={product.name} className="w-full h-full object-cover"/>) : (<div className="w-full h-full flex items-center justify-center text-4xl">🌾</div>)}
                  {/* Badges */}
                  <div className="absolute top-2 left-2 flex gap-1 flex-wrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${product.status === 'active' ? 'bg-green-100 text-green-700' :
                        product.stock === 0 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      {product.stock === 0 ? 'Épuisé' : product.status === 'active' ? 'Actif' : 'Inactif'}
                    </span>
                    {product.isOrganic && (<span className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">🌿 Bio</span>)}
                  </div>
                </div>

                <div className="p-4">
                  <p className="text-xs text-gray-400 mb-0.5">{product.category}</p>
                  <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">{product.name}</h3>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-green-700 font-bold text-sm">{formatPrice(product.price)}<span className="text-gray-400 font-normal text-xs">/{product.unit}</span></span>
                    <span className="text-xs text-gray-500">Stock : <span className={`font-semibold ${product.stock < 5 ? 'text-orange-500' : 'text-gray-700'}`}>{product.stock} {product.unit}</span></span>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => openEdit(product)} className="flex-1 text-xs font-medium py-2 rounded-xl border border-gray-200 hover:bg-gray-50 transition text-gray-700">
                      ✏️ Modifier
                    </button>
                    <button onClick={() => handleDelete(product.id)} disabled={deleting === product.id} className="flex-1 text-xs font-medium py-2 rounded-xl border border-red-100 hover:bg-red-50 text-red-500 transition disabled:opacity-50">
                      {deleting === product.id ? '…' : '🗑️ Supprimer'}
                    </button>
                  </div>
                </div>
              </div>);
            })}
          </div>)}
      </div>

      {/* ── MODAL AJOUTER / MODIFIER ── */}
      {modalOpen && (<div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-2xl sm:rounded-3xl rounded-t-3xl max-h-[92vh] flex flex-col">
            {/* Header modal */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h2 className="font-bold text-gray-900">
                {editingId ? 'Modifier le produit' : 'Ajouter un produit'}
              </h2>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
            </div>

            {/* Corps modal scrollable */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {error && (<div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">⚠️ {error}</div>)}

              {/* Images */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Photos du produit</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {previewImages.map((src, i) => (<div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                      <img src={src} alt="" className="w-full h-full object-cover"/>
                      <button onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✕</button>
                    </div>))}
                  <button onClick={() => { var _a; return (_a = fileRef.current) === null || _a === void 0 ? void 0 : _a.click(); }} className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-300 hover:border-green-400 flex flex-col items-center justify-center text-gray-400 hover:text-green-500 transition text-xs">
                    <span className="text-2xl">📷</span>
                    <span>Ajouter</span>
                  </button>
                </div>
                {uploadProgress > 0 && (<div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                    <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }}/>
                  </div>)}
                <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleImageUpload} className="hidden"/>
              </div>

              {/* Nom */}
              <Field label="Nom du produit *">
                <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="Ex: Tomates cerises bio de Casamance" className={INPUT}/>
              </Field>

              {/* Description */}
              <Field label="Description">
                <textarea value={form.description} onChange={e => setField('description', e.target.value)} placeholder="Décrivez votre produit : fraîcheur, origine, qualité…" rows={3} className={INPUT + ' resize-none'}/>
              </Field>

              {/* Prix + Prix barré */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prix (FCFA) *">
                  <input type="number" min="0" value={form.price} onChange={e => setField('price', e.target.value)} placeholder="1500" className={INPUT}/>
                </Field>
                <Field label="Prix barré (optionnel)">
                  <input type="number" min="0" value={form.originalPrice} onChange={e => setField('originalPrice', e.target.value)} placeholder="2000" className={INPUT}/>
                </Field>
              </div>

              {/* Catégorie + Unité */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Catégorie *">
                  <select value={form.category} onChange={e => setField('category', e.target.value)} className={INPUT}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Unité *">
                  <select value={form.unit} onChange={e => setField('unit', e.target.value)} className={INPUT}>
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </Field>
              </div>

              {/* Stock + Commande min */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stock disponible *">
                  <input type="number" min="0" value={form.stock} onChange={e => setField('stock', e.target.value)} placeholder="50" className={INPUT}/>
                </Field>
                <Field label="Commande minimum">
                  <input type="number" min="1" value={form.minOrder} onChange={e => setField('minOrder', e.target.value)} placeholder="1" className={INPUT}/>
                </Field>
              </div>

              {/* Localisation */}
              <Field label="Localisation">
                <input value={form.location} onChange={e => setField('location', e.target.value)} placeholder="Ex: Dakar, Thiès, Ziguinchor…" className={INPUT}/>
              </Field>

              {/* Tags */}
              <Field label="Tags (séparés par des virgules)">
                <input value={form.tags} onChange={e => setField('tags', e.target.value)} placeholder="frais, local, bio, saison" className={INPUT}/>
              </Field>

              {/* Bio */}
              <label className="flex items-center gap-3 cursor-pointer py-2">
                <div onClick={() => setField('isOrganic', !form.isOrganic)} className={`w-11 h-6 rounded-full transition-colors ${form.isOrganic ? 'bg-green-500' : 'bg-gray-300'} relative`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${form.isOrganic ? 'left-5' : 'left-0.5'}`}/>
                </div>
                <span className="text-sm font-medium text-gray-700">Produit biologique 🌿</span>
              </label>

            </div>

            {/* Footer modal */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 flex-shrink-0">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-3 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition">
                Annuler
              </button>
              <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold text-sm transition flex items-center justify-center gap-2">
                {saving ? (<><span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"/> Sauvegarde…</>) : (editingId ? '✅ Modifier' : '✅ Publier le produit')}
              </button>
            </div>
          </div>
        </div>)}
    </div>);
}
const INPUT = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 outline-none text-sm transition bg-gray-50 focus:bg-white';
function Field({ label, children }) {
    return (<div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>);
}
