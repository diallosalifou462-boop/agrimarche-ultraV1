'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  sellerId: string;
  sellerName?: string;
  onReviewSubmitted?: () => void;
}

interface Review {
  id: number;
  sellerId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  date: string;
  createdAt: string;
}

export default function ReviewForm({ sellerId, sellerName, onReviewSubmitted }: Props) {
  const { user } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Vérifier si l'utilisateur a déjà laissé un avis
  const [hasReviewed, setHasReviewed] = useState(false);

  useEffect(() => {
    if (user && sellerId) {
      const existingReviews = JSON.parse(
        localStorage.getItem('agrimarche_reviews') || '[]'
      );
      const userReview = existingReviews.find(
        (review: Review) => review.sellerId === sellerId && review.userId === user.uid
      );
      setHasReviewed(!!userReview);
    }
  }, [sellerId, user]);

  const handleSubmit = async () => {
    // Réinitialiser les erreurs
    setError('');

    // Validation 1 : Utilisateur connecté
    if (!user) {
      setError('Veuillez vous connecter pour laisser un avis');
      return;
    }

    // Validation 2 : Note requise
    if (rating === 0) {
      setError('Veuillez sélectionner une note');
      return;
    }

    // Validation 3 : Commentaire requis
    if (!comment.trim()) {
      setError('Veuillez écrire un commentaire');
      return;
    }

    // Validation 4 : Longueur minimum
    if (comment.trim().length < 10) {
      setError('Votre commentaire doit contenir au moins 10 caractères');
      return;
    }

    // Validation 5 : Longueur maximum
    if (comment.trim().length > 500) {
      setError('Votre commentaire ne doit pas dépasser 500 caractères');
      return;
    }

    // Validation 6 : Déjà avis
    if (hasReviewed) {
      setError('Vous avez déjà laissé un avis pour ce vendeur');
      return;
    }

    setIsSubmitting(true);

    // Simuler un délai d'envoi
    await new Promise(resolve => setTimeout(resolve, 500));

    const existingReviews = JSON.parse(
      localStorage.getItem('agrimarche_reviews') || '[]'
    );

    const newReview: Review = {
      id: Date.now(),
      sellerId,
      userId: user.uid,
      userName: user.displayName || 'Client',
      rating,
      comment: comment.trim(),
      date: new Date().toLocaleDateString('fr-FR'),
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(
      'agrimarche_reviews',
      JSON.stringify([newReview, ...existingReviews])
    );

    // Réinitialiser le formulaire
    setSaved(true);
    setComment('');
    setRating(0);
    setHasReviewed(true);

    // Notifier le parent
    if (onReviewSubmitted) {
      onReviewSubmitted();
    }

    // Masquer le message après 3 secondes
    setTimeout(() => setSaved(false), 3000);
    setIsSubmitting(false);
  };

  // Libellés des notes
  const ratingLabels: Record<number, string> = {
    1: 'Très déçu 😞',
    2: 'Moyen 😐',
    3: 'Correct 🙂',
    4: 'Bien 👍',
    5: 'Excellent 🎉'
  };

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-lg text-gray-900">
          ⭐ Donner un avis
        </h2>
        {sellerName && (
          <span className="text-xs text-gray-400">
            Pour {sellerName}
          </span>
        )}
      </div>

      {/* Message si déjà avis */}
      {hasReviewed && !saved && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
          📝 Vous avez déjà laissé un avis pour ce vendeur
        </div>
      )}

      {/* Message si non connecté */}
      {!user && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-yellow-700 text-sm">
          🔒 Connectez-vous pour laisser un avis
        </div>
      )}

      {/* ÉTOILES avec effet hover */}
      <div className="mb-2">
        <div className="flex gap-1 mb-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => user && !hasReviewed && setRating(star)}
              onMouseEnter={() => user && !hasReviewed && setHoverRating(star)}
              onMouseLeave={() => user && !hasReviewed && setHoverRating(0)}
              disabled={!user || hasReviewed}
              className={`text-3xl transition-all duration-200 ${
                !user || hasReviewed ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'
              }`}
              aria-label={`Noter ${star} étoiles`}
            >
              {star <= (hoverRating || rating) ? '⭐' : '☆'}
            </button>
          ))}
        </div>
        {rating > 0 && (
          <p className="text-sm text-gray-500">
            {ratingLabels[rating]}
          </p>
        )}
      </div>

      {/* COMMENTAIRE */}
      <div className="mt-4">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          disabled={!user || hasReviewed}
          placeholder={
            !user 
              ? 'Connectez-vous pour laisser un avis...'
              : hasReviewed
              ? 'Vous avez déjà donné votre avis'
              : 'Partagez votre expérience avec ce vendeur...'
          }
          className={`w-full border rounded-xl p-4 min-h-[120px] transition ${
            !user || hasReviewed
              ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
              : 'border-gray-200 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent'
          }`}
          maxLength={500}
        />
        <div className="flex justify-between mt-1">
          <p className="text-xs text-gray-400">
            Minimum 10 caractères
          </p>
          <p className={`text-xs ${
            comment.length > 500 ? 'text-red-500' : 'text-gray-400'
          }`}>
            {comment.length}/500
          </p>
        </div>
      </div>

      {/* ERREUR */}
      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* MESSAGE SUCCÈS */}
      {saved && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm animate-fade-in">
          ✅ Merci pour votre avis ! Il apparaîtra bientôt.
        </div>
      )}

      {/* BOUTON */}
      <button
        onClick={handleSubmit}
        disabled={!user || hasReviewed || isSubmitting || rating === 0 || !comment.trim() || comment.trim().length < 10}
        className={`w-full mt-4 py-3 rounded-2xl font-bold transition-all transform ${
          !user || hasReviewed || isSubmitting || rating === 0 || !comment.trim() || comment.trim().length < 10
            ? 'bg-gray-300 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 hover:scale-[1.02] shadow-md'
        } text-white`}
      >
        {isSubmitting 
          ? 'Envoi en cours...' 
          : !user 
          ? '🔒 Connectez-vous'
          : hasReviewed 
          ? '✅ Déjà noté'
          : '📝 Publier l\'avis'}
      </button>

      {/* Statistiques rapides */}
      <div className="mt-4 pt-3 border-t border-gray-100 text-xs text-center text-gray-400">
        Votre avis aide les autres acheteurs à faire leur choix
      </div>
    </div>
  );
}