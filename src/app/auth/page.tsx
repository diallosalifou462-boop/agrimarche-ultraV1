'use client';

import Image from 'next/image';
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // TOUS LES HOOKS D'ABORD
  const { signIn } = useAuth(); // ✅ Supprimé signInWithGoogle

  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ENSUITE SEULEMENT
  if (!mounted) {
    return null;
  }

  const redirect = searchParams.get('redirect') || '/main/products';

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Veuillez remplir tous les champs.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await signIn(email, password);
      router.replace(redirect);
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code;
      if (msg === 'auth/invalid-credential' || msg === 'auth/wrong-password') {
        setError('Email ou mot de passe incorrect.');
      } else {
        setError('Connexion échouée.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-[350px]">
        <div className="text-center mb-6">
          <Image
            src="/logo.png"
            alt="Agrimarché"
            width={120}
            height={120}
            className="mx-auto"
          />
          <h1 className="text-2xl font-bold mt-3">Bienvenue à Agrimarche</h1>
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border p-3 rounded mb-4"
        />

        <div className="relative mb-4">
          <input
            type={showPwd ? 'text' : 'password'}
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border p-3 rounded"
          />
          <button
            type="button"
            onClick={() => setShowPwd(!showPwd)}
            className="absolute right-3 top-3"
          >
            {showPwd ? '🙈' : '👁️'}
          </button>
        </div>

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-green-600 text-white py-3 rounded"
        >
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <p className="text-center mt-5 text-sm">
          Pas encore de compte ?{' '}
          <Link href="/auth/register" className="text-green-600">
            S'inscrire
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}

