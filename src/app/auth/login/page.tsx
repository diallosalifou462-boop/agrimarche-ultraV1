'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const FORCED_ADMIN_EMAIL = 'support@agrimarche.com';

function getRedirectPath(email: string | null | undefined, role: string | undefined) {
  if (email === FORCED_ADMIN_EMAIL) return '/admin';
  if (role === 'admin') return '/admin';
  if (role === 'seller') return '/seller/dashboard';
  if (role === 'delivery') return '/delivery/dashboard';
  return '/main/products';
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, profile, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Redirige automatiquement si une session est déjà active (ex: retour sur /auth/login alors que connecté)
  useEffect(() => {
    if (authLoading) return; // attend la confirmation Firebase avant de juger
    if (user) {
      router.replace(getRedirectPath(user.email, profile?.role));
    }
  }, [user, profile, authLoading, router]);

  const handleLogin = async () => {
    setError('');

    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);

    try {
      const result = await signIn(email, password);
      // profile peut ne pas être encore rafraîchi dans le contexte juste après signIn,
      // donc on utilise directement l'email retourné pour le cas admin forcé.
      if (result.user.email === FORCED_ADMIN_EMAIL) {
        router.replace('/admin');
        return;
      }
      // Pour les autres rôles, on laisse le useEffect ci-dessus rediriger
      // une fois que le AuthContext aura chargé le profil Firestore.
    } catch (error) {
      setError('Email ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{
        background: 'linear-gradient(to bottom right, #f0fdf4, #ffffff, #ecfdf5)',
      }}
    >
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Image
            src="/logo.png"
            alt="AgriMarché Logo"
            width={120}
            height={120}
            priority
          />
          <h1 className="text-2xl font-bold text-gray-800 mt-3">
            Bienvenue sur AgriMarché
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Connectez-vous à votre compte
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input
            type="email"
            placeholder="votre@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mot de passe
          </label>
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
          />
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <p className="text-center text-sm text-gray-600 mt-6">
          Pas encore de compte ?{' '}
          <Link
            href="/auth/register"
            className="text-green-600 font-semibold hover:text-green-700"
          >
            S'inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}
