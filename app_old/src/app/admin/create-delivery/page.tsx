'use client';

import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase/firebase';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut as secondarySignOut } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { Truck, User, Phone, Mail, Lock, Loader2, CheckCircle, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// ✅ FIX CRITIQUE (2 bugs) :
//
// 1. SESSION ADMIN DÉTRUITE : createUserWithEmailAndPassword(auth, ...) sur
//    l'app Firebase PRINCIPALE connecte automatiquement le navigateur en
//    tant que le NOUVEAU compte livreur créé, à la place de l'admin — ce
//    qui déconnecte l'admin en plein milieu de son propre dashboard. On
//    utilise donc une app Firebase SECONDAIRE, isolée, juste pour créer le
//    compte Auth, sans jamais toucher à la session admin de l'app principale.
//
// 2. PERMISSION-DENIED SUR LE PROFIL : l'écriture Firestore
//    users/{newUid} se faisait alors que le navigateur était déjà
//    authentifié comme le NOUVEAU livreur (request.auth.uid == newUid,
//    pas celui de l'admin) — la règle exigeait pourtant role in
//    ['client','seller'], donc role:'delivery' était systématiquement
//    rejeté ("Missing or insufficient permissions"), même après le fix #1.
//    On écrit maintenant ce document pendant que l'ADMIN est encore
//    authentifié dans l'app PRINCIPALE (jamais déconnecté grâce au fix #1),
//    ce qui satisfait désormais la règle `isAdmin()` ajoutée dans
//    firestore.rules pour la création de profils par un admin.
function getDeliveryCreatorApp() {
  const name = 'delivery-account-creator';
  const existing = getApps().find((a) => a.name === name);
  if (existing) return existing;
  // Même config que l'app principale (src/lib/firebase/firebase.ts) —
  // nécessaire pour pointer vers le même projet Firebase.
  return initializeApp(
    {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyD9HHxhbNvOQizx7Qbp4JVSThFW1OyTO_A',
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'agrimarche-24e37.firebaseapp.com',
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'agrimarche-24e37',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'agrimarche-24e37.appspot.com',
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '21462709831',
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:21462709831:web:e82e3b09279ac7584ba362',
    },
    name,
  );
}

export default function CreateDeliveryPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({
    email: '',
    password: '',
    displayName: '',
    phone: '',
    vehicle: '',
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Vérification admin
  if (!authLoading && (!user || profile?.role !== 'admin')) {
    router.push('/');
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!form.email || !form.password || !form.displayName) {
      setError('Remplissez tous les champs obligatoires');
      return;
    }

    if (form.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    setLoading(true);

    try {
      // 1. Créer l'utilisateur Firebase Auth SUR L'APP SECONDAIRE — la
      //    session admin de l'app principale (celle utilisée par `db` et
      //    par useAuth() ci-dessus) n'est jamais touchée.
      const creatorApp = getDeliveryCreatorApp();
      const secondaryAuth = getAuth(creatorApp);
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, form.email, form.password);
      const newUser = userCredential.user;

      // On se déconnecte immédiatement de l'app secondaire (elle a fait
      // son travail : créer le compte Auth) pour ne pas laisser traîner
      // une session inutile en mémoire.
      await secondarySignOut(secondaryAuth);

      // 2. Ajouter le profil dans Firestore — fait via `db` (app principale),
      //    donc pendant que l'admin est TOUJOURS authentifié comme lui-même.
      //    Satisfait la règle `isAdmin()` de firestore.rules (create sur
      //    users/{userId} par un admin, pour un tiers).
      await setDoc(doc(db, 'users', newUser.uid), {
        uid: newUser.uid,
        email: form.email,
        displayName: form.displayName,
        phone: form.phone || '',
        vehicle: form.vehicle || '',
        role: 'delivery',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Succès
      setSuccess(true);
      setForm({ email: '', password: '', displayName: '', phone: '', vehicle: '' });
      
      // 4. Cache le message après 3 secondes
      setTimeout(() => setSuccess(false), 3000);
      
    } catch (error: any) {
      console.error('Erreur création livreur:', error);
      
      if (error.code === 'auth/email-already-in-use') {
        setError('Cet email est déjà utilisé par un autre compte');
      } else if (error.code === 'auth/weak-password') {
        setError('Mot de passe trop faible (minimum 6 caractères)');
      } else if (error.code === 'auth/invalid-email') {
        setError('Email invalide');
      } else {
        setError('Erreur lors de la création du compte');
      }
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center gap-3">
          <Link href="/admin" className="text-gray-600 hover:text-emerald-600">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-lg font-bold text-gray-900">Gestion des livreurs</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        
        {/* Carte d'information */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-5 text-white mb-6 shadow-sm">
          <div className="flex items-center gap-3 mb-2">
            <Truck size={24} />
            <h2 className="text-lg font-bold">Ajouter un nouveau livreur</h2>
          </div>
          <p className="text-emerald-100 text-sm">
            Créez un compte pour un livreur. Il pourra se connecter avec son email et mot de passe.
          </p>
        </div>

        {/* Message de succès */}
        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-xl flex items-center gap-2 text-green-700">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Livreur créé avec succès !</span>
          </div>
        )}

        {/* Message d'erreur */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-red-700">
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Formulaire */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 space-y-4">
          
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Nom complet *
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                placeholder="Mamadou Fall"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Email *
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="livreur@agrimarche.sn"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Mot de passe *
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="•••••••• (min. 6 caractères)"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
                required
                minLength={6}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Téléphone
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+221 77 123 45 67"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">
              Véhicule
            </label>
            <div className="relative">
              <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                value={form.vehicle}
                onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
                placeholder="Moto - AB 123 CD"
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 mt-4 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : <Truck size={18} />}
            {loading ? 'Création en cours...' : 'Créer le livreur'}
          </button>
        </form>

        <p className="text-xs text-gray-400 text-center mt-6">
          🔐 Le livreur pourra se connecter avec son email et mot de passe
        </p>
      </div>
    </div>
  );
}
