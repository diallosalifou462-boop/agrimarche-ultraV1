'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { db } from '@/lib/firebase/firebase';
import {
  collection,
  query,
  where,
  orderBy,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { Star, Trash2, AlertCircle } from 'lucide-react';

interface Review {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  sellerId: string;
  rating: number;
  comment: string;
  createdAt: Date | Timestamp;
}

interface ReviewsSectionProps {
  sellerId: string;
  sellerName: string;
}

export default function ReviewsSection({ sellerId, sellerName }: ReviewsSectionProps) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRating, setUserRating] = useState(0);
  const [userComment, setUserComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [averageRating, setAverageRating] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);

  // ✅ Synchronisation temps réel des avis
  useEffect(() => {
    if (!sellerId) return;

    const reviewsQuery = query(
      collection(db, 'reviews'),
      where('sellerId', '==', sellerId),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(reviewsQuery, (snapshot) => {
      const reviewsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Review[];
      
      setReviews(reviewsData);
      setTotalReviews(reviewsData.length);
      
      if (reviewsData.length > 0) {
        const avg = reviewsData.reduce((sum, r) => sum + r.rating, 0) / reviewsData.length;
        setAverageRating(Number(avg.toFixed(1)));
      } else {
        setAverageRating(0);
      }
      
      setLoading(false);
    }, (error) => {
      console.error('Erreur chargement avis:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sellerId]);

  // Vérifier si l'utilisateur a déjà noté
  const hasUserReviewed = reviews.some(r => r.userId === user?.uid);

  const handleSubmitReview = async () => {
    if (!user) {
      alert('Connectez-vous pour laisser un avis');
      return;
    }
    
    if (userRating === 0) {
      alert('Veuillez sélectionner une note');
      return;
    }
    
    if (userComment.trim().length < 3) {
      alert('Veuillez écrire un commentaire (minimum 3 caractères)');
      return;
    }
    
    setSubmitting(true);
    
    try {
      await addDoc(collection(db, 'reviews'), {
        userId: user.uid,
        userName: user.displayName || 'Client',
        userPhoto: user.photoURL || null,
        sellerId: sellerId,
        sellerName: sellerName,
        rating: userRating,
        comment: userComment.trim(),
        createdAt: Timestamp.now(),
      });
      
      setUserRating(0);
      setUserComment('');
      alert('Merci pour votre avis !');
    } catch (error) {
      console.error('Erreur ajout avis:', error);
      alert('Erreur lors de l\'envoi de l\'avis');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm('Supprimer cet avis ?')) return;
    
    try {
      await deleteDoc(doc(db, 'reviews', reviewId));
      alert('Avis supprimé');
    } catch (error) {
      console.error('Erreur suppression:', error);
      alert('Erreur lors de la suppression');
    }
  };

  const formatDate = (date: any) => {
    if (!date) return 'Date inconnue';
    if (date?.toDate) {
      return date.toDate().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    return new Date(date).toLocaleDateString('fr-FR');
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* En-tête des avis */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                size={18}
                className={`${star <= Math.round(averageRating) ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`}
              />
            ))}
          </div>
          <div>
            <span className="text-2xl font-bold text-gray-800">{averageRating}</span>
            <span className="text-gray-400 text-sm ml-1">/5</span>
          </div>
          <div className="text-sm text-gray-500">
            ({totalReviews} avis)
          </div>
        </div>
      </div>

      {/* Formulaire d'avis (si non connecté ou déjà noté) */}
      {!hasUserReviewed && (
        <div className="bg-gray-50 rounded-xl p-4">
          <h3 className="font-semibold text-gray-800 mb-3">Donnez votre avis</h3>
          <div className="flex items-center gap-1 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setUserRating(star)}
                className="focus:outline-none"
              >
                <Star
                  size={24}
                  className={`${star <= userRating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'} transition-all hover:scale-110`}
                />
              </button>
            ))}
          </div>
          <textarea
            value={userComment}
            onChange={(e) => setUserComment(e.target.value)}
            placeholder="Partagez votre expérience avec ce vendeur..."
            className="w-full p-3 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 outline-none resize-none text-sm"
            rows={3}
          />
          <button
            onClick={handleSubmitReview}
            disabled={submitting}
            className="mt-3 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition disabled:opacity-50"
          >
            {submitting ? 'Envoi...' : 'Publier mon avis'}
          </button>
        </div>
      )}

      {hasUserReviewed && (
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-sm text-green-700">Vous avez déjà laissé un avis pour ce vendeur</p>
        </div>
      )}

      {/* Liste des avis */}
      {reviews.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <AlertCircle size={32} className="mx-auto mb-2 opacity-50" />
          <p className="text-sm">Aucun avis pour le moment</p>
          <p className="text-xs">Soyez le premier à donner votre avis</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {reviews.map((review) => (
            <div key={review.id} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-green-400 rounded-full flex items-center justify-center text-white text-xs font-bold">
                    {review.userName?.charAt(0).toUpperCase() || '?'}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800 text-sm">{review.userName}</p>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={12}
                            className={`${star <= review.rating ? 'text-amber-500 fill-amber-500' : 'text-gray-300'}`}
                          />
                        ))}
                      </div>
                      <span className="text-[9px] text-gray-400">{formatDate(review.createdAt)}</span>
                    </div>
                  </div>
                </div>
                {user?.uid === review.userId && (
                  <button
                    onClick={() => handleDeleteReview(review.id)}
                    className="text-gray-300 hover:text-rose-500 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <p className="text-gray-600 text-sm mt-2">{review.comment}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}