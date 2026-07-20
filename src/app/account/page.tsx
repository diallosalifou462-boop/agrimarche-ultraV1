'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  collection,
  query,
  where,
  orderBy,
  doc,
  getDoc,
  writeBatch,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import {
  User, Mail, Phone, Package, ShoppingBag, LogOut, Edit2, Save,
  CheckCircle, Store, ChevronRight, Shield, Crown, Loader2, X,
  Sparkles, ArrowRight, AlertTriangle, Star,
} from 'lucide-react';
import { ORDER_STATUS_CONFIG, normalizeStatus, statusTint, formatFCFA, canClientCancel, canClientConfirmDelivery } from '@/lib/orderStatus';
// ✅ Même cloche de notifications que l'espace vendeur (voir seller/layout.tsx) :
// affiche en temps réel commandes, avis, messages... pour le client aussi.
import { NotificationBell } from '@/components/NotificationBell';

interface UserFormData {
  displayName: string;
  phone: string;
  city: string;
  address: string;
}

interface SellerRating {
  averageRating: number;
  reviewCount: number;
}

// Le vocabulaire de statut (normalizeStatus, couleurs, libellés) vient de
// @/lib/orderStatus — la même source unique que admin-page.tsx,
// seller-orders-page.tsx et delivery-dashboard-page.tsx. Avant cette
// unification, chaque page avait sa propre copie de ce mapping, avec le
// risque réel qu'une page migre une clé (ex. 'expediee' → 'en_livraison')
// sans que les 3 autres suivent — exactement le bug que les commentaires
// "✅ FIX" ci-dessous documentaient.
const getStatus = (s: string) => {
  const cfg = ORDER_STATUS_CONFIG[normalizeStatus(s)];
  return {
    label: cfg.label,
    dotColor: cfg.color,
    pillBg: statusTint(s, 0.1),
    pillColor: cfg.color,
    pillRing: statusTint(s, 0.25),
  };
};

// ✅ FIX : vérifie si seller_orders existe avant de l'inclure dans le batch
// car batch.update() sur un doc inexistant fait échouer TOUT le batch (y compris orders)
async function clientUpdateOrder(orderId: string, payload: Record<string, any>) {
  const batch = writeBatch(db);
  // set+merge crée le doc s'il n'existe pas, le met à jour s'il existe
  batch.set(doc(db, 'orders', orderId), payload, { merge: true });
  const sellerOrderRef = doc(db, 'seller_orders', orderId);
  const sellerOrderSnap = await getDoc(sellerOrderRef);
  if (sellerOrderSnap.exists()) {
    batch.set(sellerOrderRef, payload, { merge: true });
  }
  return batch.commit();
}

export default function AccountPage() {
  const { user, profile, loading, logout, updateUserProfile, authDebugInfo } = useAuth();
  const router = useRouter();

  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [orders, setOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [sellerRatings, setSellerRatings] = useState<Map<string, SellerRating>>(new Map());
  const [formData, setFormData] = useState<UserFormData>({
    displayName: '', phone: '', city: '', address: '',
  });

  // ── Récupération des notes des vendeurs ─────────────────────────────────
  useEffect(() => {
    if (!user) return;

    const sellers = [...new Set(orders.map((o: any) => o.sellerId).filter(Boolean))] as string[];

    const unsubs: Array<() => void> = sellers.map(sellerId => {
      const reviewsQuery = query(
        collection(db, 'reviews'),
        where('sellerId', '==', sellerId)
      );

      return onSnapshot(reviewsQuery, (snapshot) => {
        const reviews = snapshot.docs.map(doc => doc.data());
        const count = reviews.length;
        const average = count > 0
          ? reviews.reduce((sum: number, review: any) => sum + (review.rating || 0), 0) / count
          : 0;

        setSellerRatings(prev => {
          const newMap = new Map(prev);
          newMap.set(sellerId, {
            averageRating: Number(average.toFixed(1)),
            reviewCount: count
          });
          return newMap;
        });
      });
    });

    return () => unsubs.forEach(unsub => unsub());
  }, [orders, user]);

  // ── Sync temps réel des commandes (orders + seller_orders fusionnés) ──────
  useEffect(() => {
    if (!user) { setLoadingOrders(false); return; }

    // Certaines commandes n'existent que dans seller_orders → on lit les deux et on déduplique
    const ordersMap = new Map<string, any>();

    const processSnap = (snap: any) => {
      snap.docs.forEach((d: any) => {
        const raw = d.data().status || 'en_attente';
        const normalized = normalizeStatus(raw);
        console.log(`[AgriMarché/Account] Order ${d.id.slice(-6)} | raw="${raw}" → "${normalized}"`);
        // On garde la version la plus récente (updatedAt) si le doc existe dans les deux collections
        const existing = ordersMap.get(d.id);
        const newTs = d.data().updatedAt?.seconds || d.data().createdAt?.seconds || 0;
        const oldTs = existing?.updatedAt?.seconds || existing?.createdAt?.seconds || 0;
        if (!existing || newTs >= oldTs) {
          ordersMap.set(d.id, { id: d.id, ...d.data(), status: normalized, total: d.data().total || d.data().amount || 0 });
        }
      });
      const ordersData = Array.from(ordersMap.values()).sort((a, b) => {
        const ta = b.createdAt?.seconds || 0;
        const tb = a.createdAt?.seconds || 0;
        return ta - tb;
      });
      console.log(`[AgriMarché/Account] Stats | total=${ordersData.length} | en_cours=${ordersData.filter((o:any)=>['en_attente','en_preparation','en_livraison'].includes(o.status)).length} | livrées=${ordersData.filter((o:any)=>o.status==='livre').length} | annulées=${ordersData.filter((o:any)=>o.status==='annule').length}`);
      setOrders(ordersData);
      setLoadingOrders(false);
    };

    const q1 = query(collection(db, 'orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    const q2 = query(collection(db, 'seller_orders'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsub1 = onSnapshot(q1, processSnap, (err) => { console.error(err); setLoadingOrders(false); });
    const unsub2 = onSnapshot(q2, processSnap, (err) => { console.error(err); setLoadingOrders(false); });

    return () => { unsub1(); unsub2(); };
  }, [user]);

  useEffect(() => { if (!loading && !user) router.push('/auth/login'); }, [loading, user, router]);

  useEffect(() => {
    if (profile) {
      setFormData({
        displayName: profile.displayName || '',
        phone:       profile.phone || '',
        city:        profile?.sellerInfo?.city || '',
        address:     profile?.sellerInfo?.shopName || '',
      });
    }
  }, [profile]);

  // ── Annulation CLIENT ────────────────────────────────────────────────────
  const handleCancelOrder = async (orderId: string) => {
    if (!confirm('⚠️ Annuler cette commande ?')) return;
    setUpdating(orderId);
    try {
      await clientUpdateOrder(orderId, {
        status:      'annule',
        statusLabel: 'Annulée par le client',
        cancelledBy: 'client',
        cancelledAt: Timestamp.now(),
        updatedAt:   Timestamp.now(), // Firestore Timestamp, pas string ISO — cf. processSnap plus haut
      });
    } catch (e: any) {
      // Message doux et rassurant pour le client — le détail technique
      // (utile pour le diagnostic) va uniquement dans la console, jamais
      // devant l'utilisateur.
      console.error('[handleCancelOrder] Échec sur commande', orderId, {
        code: e?.code, message: e?.message, statusActuel: orders.find((o: any) => o.id === orderId)?.status,
      });
      const isOffline = !navigator.onLine || e?.code === 'unavailable' || e?.message?.includes('offline');
      alert(isOffline
        ? '📶 Pas de connexion internet. Reconnecte-toi et réessaie 🙏'
        : '😊 Petit souci technique de notre côté — ta commande n\'a pas pu être annulée pour l\'instant. Réessaie dans un instant, ou contacte-nous si ça persiste, on s\'en occupe !');
    } finally {
      setUpdating(null);
    }
  };

  // ── Confirmation réception ─────────────────────────────────────────────
  const handleConfirmOrder = async (orderId: string) => {
    if (!confirm('✅ Confirmez-vous avoir reçu cette commande ?')) return;
    setUpdating(orderId);
    try {
      await clientUpdateOrder(orderId, {
        status:      'livre',
        statusLabel: 'Livrée – confirmée par le client',
        updatedAt:   Timestamp.now(),
      });
    } catch (e: any) {
      console.error('[handleConfirmOrder] Échec sur commande', orderId, {
        code: e?.code, message: e?.message, statusActuel: orders.find((o: any) => o.id === orderId)?.status,
      });
      const isOffline = !navigator.onLine || e?.code === 'unavailable' || e?.message?.includes('offline');
      alert(isOffline
        ? '📶 Pas de connexion internet. Reconnecte-toi et réessaie 🙏'
        : '😊 Petit souci technique de notre côté — la confirmation n\'a pas pu être enregistrée pour l\'instant. Réessaie dans un instant, ou contacte-nous si ça persiste, on s\'en occupe !');
    } finally {
      setUpdating(null);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateUserProfile({ displayName: formData.displayName, phone: formData.phone });
      setSaveSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      console.error(e);
      alert('Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => { await logout(); router.push('/'); };

  // ✅ FIX : stats recalculées avec les bonnes clés de statut
  const stats = {
    total:    orders.length,
    enCours:  orders.filter(o => ['en_attente', 'en_preparation', 'en_livraison'].includes(o.status)).length,
    livrees:  orders.filter(o => o.status === 'livre').length,
    annulees: orders.filter(o => o.status === 'annule').length,
  };

  const userRole = profile?.role || 'client';
  const isSeller = ['seller', 'both', 'admin'].includes(userRole);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f0faf4]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-full border-[3px] border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-sm text-gray-400 tracking-wide font-medium">Chargement…</p>
        {authDebugInfo && (
          <div style={{
            marginTop: 8, padding: '8px 12px', borderRadius: 8, maxWidth: 320,
            background: '#fff3f3', border: '1px solid #ffc9c9',
            fontSize: 12, color: '#c92a2a', fontFamily: 'monospace',
            wordBreak: 'break-word', textAlign: 'center',
          }}>
            🔧 Diagnostic (temporaire) : {authDebugInfo}
          </div>
        )}
      </div>
    </div>
  );

  if (!user) return null;
  const initial = user.email?.charAt(0).toUpperCase() ?? '?';

  const renderStars = (rating: number) => {
    const fullStars  = Math.floor(rating);
    const hasHalf    = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalf ? 1 : 0);
    return (
      <div className="flex items-center gap-0.5">
        {[...Array(fullStars)].map((_, i)  => <Star key={`f${i}`} size={10} className="text-amber-500 fill-amber-500" />)}
        {hasHalf                            && <Star key="h"       size={10} className="text-amber-500 fill-amber-500" />}
        {[...Array(emptyStars)].map((_, i) => <Star key={`e${i}`} size={10} className="text-gray-300" />)}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f0faf4]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* HERO */}
      <div className="relative bg-gradient-to-br from-emerald-600 via-green-600 to-teal-500 pt-14 pb-20 px-5 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-40 h-40 rounded-full bg-teal-300/20 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-black shadow-lg ring-2 ring-white/30">
              {initial}
            </div>
            {isSeller && (
              <div className="absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-lg bg-amber-400 flex items-center justify-center shadow">
                <Crown size={11} className="text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-white text-xl font-black leading-tight truncate">{formData.displayName || 'Mon compte'}</h1>
            <p className="text-white/70 text-xs mt-0.5 truncate">{user.email}</p>
            <span className="inline-flex items-center gap-1 mt-2 bg-white/15 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full">
              <Shield size={9} />{userRole}
            </span>
          </div>
          <NotificationBell
            triggerClassName="relative p-2.5 rounded-xl bg-white/15 hover:bg-white/25 transition shrink-0"
            badgeClassName="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
          />
        </div>
      </div>

      {/* STATS */}
      <div className="mx-4 -mt-10 relative z-10">
        <div className="bg-white rounded-2xl shadow-lg shadow-emerald-100 grid grid-cols-4 divide-x divide-gray-100 overflow-hidden">
          {[
            { val: stats.total,    label: 'Total',    color: 'text-gray-800' },
            { val: stats.enCours,  label: 'En cours', color: 'text-amber-600' },
            { val: stats.livrees,  label: 'Livrées',  color: 'text-emerald-600' },
            { val: stats.annulees, label: 'Annulées', color: 'text-rose-500' },
          ].map(({ val, label, color }) => (
            <div key={label} className="flex flex-col items-center py-4 px-1">
              <span className={`text-2xl font-black ${color}`}>{val}</span>
              <span className="text-[10px] text-gray-400 font-medium mt-0.5 text-center leading-tight">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN */}
      <div className="px-4 mt-5 pb-10 space-y-4">

        {saveSuccess && (
          <div className="flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-lg shadow-emerald-200">
            <CheckCircle size={18} className="shrink-0" />
            <span className="text-sm font-semibold">Profil mis à jour ✦</span>
          </div>
        )}

        {/* PROFIL */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest">Profil</h2>
            {!isEditing && (
              <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold">
                <Edit2 size={13} />Modifier
              </button>
            )}
          </div>

          {isEditing ? (
            <div className="px-5 pb-5 space-y-3">
              {(['displayName', 'phone'] as const).map((field) => (
                <div key={field} className="space-y-2.5">
                  <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {field === 'displayName' ? 'Nom complet' : 'Téléphone'}
                  </label>
                  <input
                    type={field === 'phone' ? 'tel' : 'text'}
                    value={formData[field]}
                    onChange={e => setFormData({ ...formData, [field]: e.target.value })}
                    placeholder={field === 'phone' ? '+221 XX XXX XX XX' : 'Votre nom'}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                  />
                </div>
              ))}
              <div className="flex gap-2.5 pt-1">
                <button onClick={handleSave} disabled={saving} className="flex-1 bg-emerald-600 active:bg-emerald-700 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition disabled:opacity-60">
                  {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}Sauvegarder
                </button>
                <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-100 active:bg-gray-200 text-gray-600 py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition">
                  <X size={15} />Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="px-5 pb-5 space-y-2">
              {[
                { icon: User,   val: formData.displayName || '—', label: 'Nom' },
                { icon: Mail,   val: user.email || '—',           label: 'Email' },
                { icon: Phone,  val: formData.phone || '—',       label: 'Téléphone' },
                { icon: Shield, val: userRole,                    label: 'Rôle' },
              ].map(({ icon: Icon, val, label }) => (
                <div key={label} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                  <Icon size={16} className="text-emerald-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">{label}</p>
                    <p className="text-sm text-gray-800 font-medium truncate">{val}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COMMANDES */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest flex items-center gap-2">
              <Package size={14} className="text-emerald-500" />Commandes
            </h2>
            <Link href="/account/orders" className="flex items-center gap-0.5 text-emerald-600 text-sm font-semibold">
              Tout voir <ChevronRight size={14} />
            </Link>
          </div>

          <div className="px-5 pb-5">
            {loadingOrders ? (
              <div className="flex flex-col items-center py-10 gap-3">
                <Loader2 size={28} className="animate-spin text-emerald-400" />
                <p className="text-xs text-gray-400 font-medium">Chargement…</p>
              </div>
            ) : orders.length === 0 ? (
              <div className="flex flex-col items-center py-10 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center">
                  <ShoppingBag size={28} className="text-gray-200" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-600">Aucune commande</p>
                  <p className="text-xs text-gray-400 mt-1">Vos achats apparaîtront ici</p>
                </div>
                <Link href="/main/products" className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold">
                  <Sparkles size={14} />Découvrir les produits
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {orders.slice(0, 3).map((order) => {
                  const s = getStatus(order.status);
                  // ⚠️ Doit rester en phase avec isSelfCancellableStatus() / isInDeliveryStatus()
                  // dans firestore.rules — géré via @/lib/orderStatus pour ne plus jamais diverger.
                  // Avant : le bouton "Annuler" restait actif en 'en_preparation', une écriture
                  // que la règle Firestore rejette (le client ne peut plus s'auto-annuler une fois
                  // la préparation commencée) → clic qui échoue silencieusement côté client.
                  const canCancel  = canClientCancel(order.status);
                  const canConfirm = canClientConfirmDelivery(order.status);
                  const isUpdating = updating === order.id;
                  const cancelledBySeller = order.status === 'annule' && order.cancelledBy === 'seller';
                  const sellerRating = sellerRatings.get(order.sellerId);

                  return (
                    <div key={order.id} className="border border-gray-100 rounded-2xl overflow-hidden">
                      <div className="flex items-start justify-between gap-3 p-4">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-800 truncate leading-snug">
                            {order.items?.[0]?.productName || 'Commande'}
                            {order.items?.length > 1 && <span className="text-gray-400 font-normal"> +{order.items.length - 1}</span>}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">{order.date}</p>
                          <p className="text-base font-black text-emerald-700 mt-1">
                            {formatFCFA(order.total || order.amount)}
                          </p>
                          {sellerRating && sellerRating.reviewCount > 0 && (
                            <div className="flex items-center gap-1 mt-1">
                              {renderStars(sellerRating.averageRating)}
                              <span className="text-[8px] text-gray-400 ml-1">
                                ({sellerRating.reviewCount} avis)
                              </span>
                            </div>
                          )}
                        </div>
                        <span
                          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ring-1"
                          style={{ background: s.pillBg, color: s.pillColor, boxShadow: `inset 0 0 0 1px ${s.pillRing}` }}
                        >
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dotColor }} />{s.label}
                        </span>
                      </div>

                      {/* Annulée par le vendeur */}
                      {cancelledBySeller && (
                        <div className="mx-4 mb-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-start gap-2">
                          <AlertTriangle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs font-bold text-rose-700">Commande refusée par le vendeur</p>
                            <p className="text-[11px] text-rose-500 mt-0.5">Le vendeur n'a pas pu traiter votre commande.</p>
                          </div>
                        </div>
                      )}

                      {(canCancel || canConfirm) && (
                        <div className="px-4 pb-4 flex gap-2">
                          {canConfirm && (
                            <button
                              onClick={() => handleConfirmOrder(order.id)}
                              disabled={isUpdating}
                              className="flex-1 bg-emerald-600 active:bg-emerald-700 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
                            >
                              {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                              Confirmer réception
                            </button>
                          )}
                          {canCancel && (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              disabled={isUpdating}
                              className="flex-1 bg-rose-500 active:bg-rose-600 text-white py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 transition"
                            >
                              {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                              Annuler
                            </button>
                          )}
                        </div>
                      )}

                      {order.status === 'livre' && (
                        <div className="mx-4 mb-4 space-y-2">
                          <div className="bg-emerald-50 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <CheckCircle size={14} className="text-emerald-500 shrink-0" />
                            <span className="text-xs text-emerald-700 font-semibold">Livrée avec succès</span>
                          </div>
                          <button
                            onClick={() => router.push(`/review?id=${order.id}`)}
                            className="w-full bg-yellow-400 hover:bg-yellow-500 text-black py-2 rounded-xl text-sm font-bold"
                          >
                            ⭐ Noter le vendeur
                          </button>
                        </div>
                      )}

                      {order.status === 'annule' && (
                        <div className="px-4 pb-4">
                          <Link href="/main/products" className="flex items-center justify-center gap-2 border-2 border-emerald-500 text-emerald-600 py-2.5 rounded-xl text-xs font-bold">
                            Commander à nouveau <ArrowRight size={12} />
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                })}

                {orders.length > 3 && (
                  <Link href="/account/orders" className="flex items-center justify-center gap-1.5 text-emerald-600 text-sm font-semibold py-2">
                    Voir {orders.length - 3} commande{orders.length - 3 > 1 ? 's' : ''} de plus <ArrowRight size={13} />
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ACTIONS */}
        <div className="space-y-3">
          {!isSeller ? (
            <Link href="/seller/register" className="flex items-center justify-between bg-gradient-to-r from-emerald-600 to-teal-500 text-white px-5 py-4 rounded-2xl shadow-md shadow-emerald-200 font-bold text-sm active:opacity-90 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><Store size={16} /></div>
                Devenir vendeur
              </div>
              <ChevronRight size={18} className="opacity-70" />
            </Link>
          ) : (
            <Link href="/seller/dashboard" className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-4 rounded-2xl shadow-md shadow-amber-200 font-bold text-sm active:opacity-90 transition">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center"><Crown size={16} /></div>
                Ma boutique vendeur
              </div>
              <ChevronRight size={18} className="opacity-70" />
            </Link>
          )}

          <button onClick={handleLogout} className="w-full flex items-center justify-between bg-white border border-rose-100 text-rose-500 px-5 py-4 rounded-2xl text-sm font-semibold active:bg-rose-50 transition">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center"><LogOut size={16} /></div>
              Déconnexion
            </div>
            <ChevronRight size={18} className="opacity-40" />
          </button>
        </div>

      </div>
    </div>
  );
}
