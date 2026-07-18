'use client';

import { Suspense, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  verifyPasswordResetCode,
  confirmPasswordReset,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';

type Status = 'checking' | 'valid' | 'invalid' | 'success';

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Firebase ajoute ces paramètres automatiquement dans le lien de l'email
  const oobCode = searchParams.get('oobCode');
  const mode = searchParams.get('mode'); // attendu: "resetPassword"

  const [status, setStatus] = useState<Status>('checking');
  const [email, setEmail] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const checkCode = async () => {
      if (!oobCode || mode !== 'resetPassword') {
        setStatus('invalid');
        return;
      }
      try {
        // Vérifie que le lien est valide et n'a pas déjà été utilisé/expiré,
        // et récupère l'email associé pour l'affichage.
        const verifiedEmail = await verifyPasswordResetCode(auth, oobCode);
        setEmail(verifiedEmail);
        setStatus('valid');
      } catch (err) {
        setStatus('invalid');
      }
    };
    checkCode();
  }, [oobCode, mode]);

  const handleSubmit = async () => {
    setError('');

    if (!password || !confirmPassword) {
      setError('Veuillez remplir les deux champs');
      return;
    }
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    if (!oobCode) {
      setError("Lien invalide");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setStatus('success');
    } catch (err: any) {
      if (err?.code === 'auth/expired-action-code') {
        setError('Ce lien a expiré, demandez-en un nouveau');
      } else if (err?.code === 'auth/invalid-action-code') {
        setError('Ce lien est invalide ou a déjà été utilisé');
      } else if (err?.code === 'auth/weak-password') {
        setError('Mot de passe trop faible');
      } else {
        setError("Une erreur s'est produite, réessayez");
      }
    } finally {
      setSubmitting(false);
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
            Nouveau mot de passe
          </h1>
          {email && status !== 'success' && (
            <p className="text-sm text-gray-500 mt-1">{email}</p>
          )}
        </div>

        {status === 'checking' && (
          <p className="text-center text-sm text-gray-500">Vérification du lien...</p>
        )}

        {status === 'invalid' && (
          <div className="bg-red-50 text-red-600 text-sm p-4 rounded-xl text-center">
            Ce lien est invalide ou a expiré. Retournez sur la page de connexion pour
            demander un nouveau lien de réinitialisation.
            <button
              onClick={() => router.replace('/auth/login')}
              className="block w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition"
            >
              Retour à la connexion
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="bg-green-50 text-green-700 text-sm p-4 rounded-xl text-center">
            Votre mot de passe a été mis à jour avec succès.
            <button
              onClick={() => router.replace('/auth/login')}
              className="block w-full mt-4 bg-green-600 hover:bg-green-700 text-white font-semibold py-2.5 rounded-xl transition"
            >
              Se connecter
            </button>
          </div>
        )}

        {status === 'valid' && (
          <>
            {error && (
              <div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50"
            >
              {submitting ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div
          className="min-h-screen flex items-center justify-center p-4"
          style={{
            background: 'linear-gradient(to bottom right, #f0fdf4, #ffffff, #ecfdf5)',
          }}
        >
          <p className="text-sm text-gray-500">Chargement...</p>
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}

