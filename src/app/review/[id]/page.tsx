'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, addDoc, Timestamp, doc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { useAuth } from '@/hooks/useAuth';
import { ArrowLeft, Star, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';

export default function ReviewPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [sellerName, setSellerName] = useState('');
  const [orderDate, setOrderDate] = useState('');
  const [productNames, setProductNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);

  // Vérifier si l'utilisateur a déjà noté cette commande
  const checkIfAlreadyReviewed = async () => {
    if (!id || !user) return;
    
    try {
      const reviewsRef = collection(db, 'reviews');
      const q = query(reviewsRef, where('orderId', '==', id), where('userId', '==', user.uid));
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        setHasReviewed(true);
      }
    } catch (error) {
      console.error('Erreur vérification avis:', error);
    }
  };

  useEffect(() => {
    const loadOrder = async () => {
      if (!id) return;
      
      try {
        const orderDoc = await getDoc(doc(db, 'orders', id as string));
        if (orderDoc.exists()) {
          const data = orderDoc.data();
          setSellerId(data.sellerId || '');
          setSellerName(data.sellerName || 'Vendeur');
          setOrderDate(data.date || new Date().toLocaleDateString('fr-FR'));
          
          const items = data.items || [];
          setProductNames(items.map((item: any) => item.productName || item.name));
        }
      } catch (error) {
        console.error('Erreur chargement commande:', error);
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
    checkIfAlreadyReviewed();
  }, [id, user]);

  const saveReview = async () => {
    if (!user) {
      alert('Connectez-vous pour laisser un avis');
      router.push('/auth/login');
      return;
    }

    if (hasReviewed) {
      alert('Vous avez déjà noté cette commande');
      return;
    }

    if (rating === 0) {
      alert('Veuillez sélectionner une note');
      return;
    }

    // ✅ Le champ est annoncé comme "optionnel" dans le formulaire — la
    //    validation doit donc le rester. On bloque seulement les
    //    commentaires renseignés mais trop courts pour être utiles.
    if (comment.trim().length > 0 && comment.trim().length < 5) {
      alert('Votre commentaire est un peu court (minimum 5 caractères), ou laissez-le vide');
      return;
    }

    setSubmitting(true);

    try {
      await addDoc(collection(db, 'reviews'), {
        orderId: id,
        sellerId,
        sellerName,
        userId: user.uid,
        userName: user.displayName || 'Client',
        userEmail: user.email,
        rating,
        comment: comment.trim(),
        productNames,
        createdAt: Timestamp.now(),
      });

      // 🔔 NOTIFICATION AU VENDEUR
      try {
        await fetch('/api/notifications/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: sellerId,
            title: '⭐ Nouvel avis',
            body: `${user?.displayName || 'Un client'} a noté votre boutique ${rating}/5`,
            link: '/seller/dashboard',
          }),
        });
        console.log('✅ Notification vendeur avis envoyée');
      } catch (notifError) {
        console.error('Erreur envoi notification avis:', notifError);
      }

      alert('⭐ Merci pour votre avis !');
      router.push('/account/orders');
    } catch (error) {
      console.error('Erreur envoi avis:', error);
      alert('Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white to-gray-50">
        <div className="text-center">
          <Loader2 size={40} className="animate-spin text-emerald-500 mx-auto mb-3" />
          <p className="text-gray-400 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (hasReviewed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white to-gray-50 p-4">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-600 mb-6 hover:text-emerald-600 transition"
          >
            <ArrowLeft size={20} /> Retour
          </button>

          <div className="bg-white rounded-2xl p-8 shadow-xl text-center">
            <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-amber-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">Avis déjà publié</h2>
            <p className="text-gray-500 text-sm mb-6">
              Vous avez déjà noté cette commande. Merci pour votre contribution !
            </p>
            <button
              onClick={() => router.push('/account/orders')}
              className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-semibold hover:bg-emerald-700 transition"
            >
              Voir mes commandes
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-emerald-50/20 p-4">
      <div className="max-w-md mx-auto">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-500 mb-6 hover:text-emerald-600 transition-all duration-300 group"
        >
          <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm">Retour</span>
        </button>

        <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-8 text-center">
            <div className="w-20 h-20 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
              <span className="text-4xl">⭐</span>
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Donner mon avis</h1>
            <p className="text-emerald-100 text-sm">Partagez votre expérience</p>
          </div>

          <div className="p-6">
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-xs text-gray-500 mb-1">Commande du {orderDate}</p>
              <p className="font-semibold text-gray-800">{sellerName}</p>
              {productNames.length > 0 && (
                <p className="text-xs text-gray-500 mt-2">
                  {productNames.slice(0, 2).join(', ')}
                  {productNames.length > 2 && ` + ${productNames.length - 2} autre(s)`}
                </p>
              )}
            </div>

            <div className="text-center mb-6">
              <p className="text-sm font-medium text-gray-700 mb-3">Votre note</p>
              <div className="flex justify-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="focus:outline-none transition-all duration-200 hover:scale-110"
                  >
                    <Star
                      size={44}
                      className={`${
                        star <= (hoverRating || rating)
                          ? 'text-amber-500 fill-amber-500'
                          : 'text-gray-300 fill-gray-200'
                      } transition-all duration-200`}
                    />
                  </button>
                ))}
              </div>
              {rating > 0 && (
                <p className="text-xs text-emerald-600 mt-2">
                  {rating === 5 ? '🌟 Excellent !' :
                   rating === 4 ? '👍 Très bien' :
                   rating === 3 ? '😐 Correct' :
                   rating === 2 ? '😕 Peut mieux faire' :
                   '👎 Décevant'}
                </p>
              )}
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Votre commentaire <span className="text-gray-400 text-xs">(optionnel)</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Qu'avez-vous pensé de votre expérience ? Qualité des produits, délai de livraison, communication..."
                className="w-full border border-gray-200 rounded-xl p-4 h-36 resize-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none transition text-sm"
              />
              <p className="text-right text-[10px] text-gray-400 mt-1">
                {comment.length}/500
              </p>
            </div>

            <button
              onClick={saveReview}
              disabled={submitting || rating === 0}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white py-4 rounded-xl font-semibold transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25"
            >
              {submitting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                <>
                  <Star size={18} className="fill-white" />
                  Publier mon avis
                </>
              )}
            </button>

            <div className="flex items-center justify-center gap-2 mt-4">
              <AlertCircle size={10} className="text-gray-300" />
              <p className="text-[8px] text-gray-400">
                Votre avis aide les autres acheteurs et les vendeurs à s'améliorer
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}