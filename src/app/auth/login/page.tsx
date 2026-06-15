'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

export default function LoginPage() {
  const router = useRouter();
  const { signIn, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const redirectBasedOnRole = async () => {
      if (user && !authLoading) {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.data();
        const role = userData?.role || 'client';
        
        if (role === 'admin') {
          router.push('/admin');
        } else if (role === 'seller') {
          router.push('/seller/dashboard');
        } else if (role === 'delivery') {
          router.push('/delivery/dashboard');
        } else {
          router.push('/main/products');
        }
      }
    };
    
    redirectBasedOnRole();
  }, [user, authLoading, router]);

  const handleLogin = async () => {
    setError('');

    if (!email || !password) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);

    try {
      const result = await signIn(email, password);
      
      const userRef = doc(db, 'users', result.user.uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      const role = userData?.role || 'client';
      
      if (role === 'admin') {
        router.push('/admin');
      } else if (role === 'seller') {
        router.push('/seller/dashboard');
      } else if (role === 'delivery') {
        router.push('/delivery/dashboard');
      } else {
        router.push('/main/products');
      }
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