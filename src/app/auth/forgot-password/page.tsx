'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

const FIREBASE_ERRORS: Record<string, string> = {
  'auth/user-not-found':    'Aucun compte avec cet email.',
  'auth/invalid-email':     'Adresse email invalide.',
  'auth/too-many-requests': 'Trop de tentatives. Réessayez plus tard.',
  'auth/network-request-failed': 'Pas de connexion internet.',
};

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [sent, setSent]       = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Veuillez saisir votre email.'); return; }
    setLoading(true);
    setError('');
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? '';
      setError(FIREBASE_ERRORS[code] || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <span className="text-5xl">🔑</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Mot de passe oublié</h1>
          <p className="text-gray-500 text-sm mt-1">
            Entrez votre email pour recevoir un lien de réinitialisation
          </p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-5xl mb-4">📧</div>
            <h2 className="font-semibold text-gray-900 mb-2">Email envoyé !</h2>
            <p className="text-sm text-gray-500 mb-6">
              Vérifiez votre boîte mail (et les spams) pour le lien de réinitialisation.
            </p>
            <Link
              href="/auth/login"
              className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition"
            >
              Retour à la connexion
            </Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.com"
                  autoComplete="email"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? 'Envoi…' : 'Envoyer le lien'}
              </button>
            </form>

            <p className="text-center text-sm text-gray-500 mt-6">
              <Link href="/auth/login" className="text-green-600 font-semibold hover:text-green-700">
                ← Retour à la connexion
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

