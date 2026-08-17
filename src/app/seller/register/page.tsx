'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { ArrowLeft, Loader2, CheckCircle, User, Phone, MapPin } from 'lucide-react';
import { ADMIN_MARGIN_RATE } from '@/lib/pricing';

const REGIONS = [
  'Dakar', 'Thiès', 'Saint-Louis', 'Kaolack', 'Ziguinchor',
  'Diourbel', 'Louga', 'Tambacounda', 'Fatick', 'Kolda',
  'Matam', 'Kaffrine', 'Kédougou', 'Sédhiou'
];

const CITIES_BY_REGION: Record<string, string[]> = {
  'Dakar': ['Dakar-Plateau', 'Grand Dakar', 'Parcelles Assainies', 'Guédiawaye', 'Pikine', 'Rufisque', 'Yeumbeul', 'Mbao'],
  'Thiès': ['Thiès', 'Mbour', 'Tivaouane', 'Joal-Fadiouth', 'Khombole', 'Pout'],
  'Saint-Louis': ['Saint-Louis', 'Richard Toll', 'Dagana', 'Podor'],
  'Kaolack': ['Kaolack', 'Nioro du Rip', 'Guinguinéo'],
  'Ziguinchor': ['Ziguinchor', 'Bignona', 'Oussouye'],
  'Diourbel': ['Diourbel', 'Bambey', 'Mbacké'],
  'Louga': ['Louga', 'Linguère', 'Kébémer'],
  'Tambacounda': ['Tambacounda', 'Bakel', 'Koupentoum'],
  'Kolda': ['Kolda', 'Vélingara', 'Médina Yoro Foulah'],
  'Fatick': ['Fatick', 'Foundiougne', 'Gossas'],
  'Kaffrine': ['Kaffrine', 'Malem Hodar', 'Koungheul'],
  'Kédougou': ['Kédougou', 'Salémata', 'Saraya'],
  'Sédhiou': ['Sédhiou', 'Bounkiling', 'Goudomp'],
  'Matam': ['Matam', 'Kanel', 'Ranerou-Ferlo']
};

export default function SellerRegisterPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', region: '', city: '' });
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace('/auth/login');
        return;
      }

      try {
        // ✅ Utilisation de la collection 'users' au lieu de 'sellers'
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setForm({
            name: data.displayName || '',
            phone: data.phone || '',
            region: data.region || '',
            city: data.city || '',
          });
          setAcceptedTerms(!!data.termsAcceptedAt);
          setIsEditing(true);
        } else {
          setIsEditing(false);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.phone.trim() || !form.region) return;
    // ⚠️ Garde-fou obligatoire : pas de compte vendeur sans acceptation
    // explicite de la commission. Le `required` HTML sur la case suffit en
    // usage normal, mais on revérifie ici pour ne jamais dépendre uniquement
    // de la validation du navigateur.
    if (!acceptedTerms) return;

    const user = auth.currentUser;
    if (!user) return;

    setSaving(true);
    try {
      const userRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      const exists = userDoc.exists();

      // ✅ Correction : créer un objet avec toutes les propriétés nécessaires
      //
      // ⚠️ FIX : `email` n'est plus inclus dans une mise à jour (doc déjà
      // existant). Les règles Firestore interdisent à un update() de
      // changer ce champ (doesNotChange(['uid','email','createdAt'])).
      // Pour les comptes Free/Yas/Expresso (créés via /api/otp/verify,
      // sans email attaché à l'objet Firebase Auth avant leur premier
      // signIn), auth.currentUser.email vaut `null` côté client alors que
      // le document Firestore a déjà `email: "<tel>@agrimarche.sn"` —
      // envoyer `email: user.email` écrasait ce champ par null et violait
      // la règle → "permission-denied" sur CE formulaire. En omettant la
      // clé lors d'un update (merge:true), on ne touche pas au champ
      // existant et la règle passe. On ne l'envoie qu'à la création,
      // où il est requis par hasFields(['email','createdAt','role']).
      const dataToSave: {
        displayName: string;
        phone: string;
        region: string;
        city: string;
        role: string;
        updatedAt: Date;
        email?: string | null;
        createdAt?: Date;
        uid?: string;
        termsAcceptedAt: Date;
        termsAcceptedMarginRate: number;
      } = {
        displayName: form.name.trim(),
        phone: form.phone.trim(),
        region: form.region,
        city: form.city || '',
        role: 'seller',
        updatedAt: new Date(),
        // Preuve d'acceptation : horodatage + taux exact accepté au moment
        // du clic (utile si ADMIN_MARGIN_RATE change plus tard — on garde
        // une trace de ce à quoi CE vendeur a consenti, pas juste "il a
        // coché une case un jour").
        termsAcceptedAt: new Date(),
        termsAcceptedMarginRate: ADMIN_MARGIN_RATE,
      };

      if (!exists) {
        dataToSave.createdAt = new Date();
        dataToSave.uid = user.uid;
        dataToSave.email = user.email;
      }

      await setDoc(userRef, dataToSave, { merge: true });

      setSaveSuccess(true);
      setTimeout(() => {
        router.replace('/seller');
      }, 1000);
    } catch (error: any) {
      console.error(error);
      alert('Erreur : ' + (error?.code || '') + ' — ' + (error?.message || error));
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6fbf7] dark:bg-gray-900">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f6fbf7] dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <button
          onClick={() => router.back()}
          className="mb-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition"
        >
          <ArrowLeft size={20} className="text-gray-600 dark:text-gray-400" />
        </button>

        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <svg viewBox="0 0 64 64" fill="none" className="w-10 h-10">
              <circle cx="32" cy="32" r="32" fill="white" fillOpacity="0.2"/>
              <path d="M28 20c-6.627 0-12 5.373-12 12s5.373 12 12 12c3.5 0 6.657-1.5 8.9-3.9" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <path d="M40 20v18c0 3.314-2.686 6-6 6" stroke="#7fe0a8" strokeWidth="3" strokeLinecap="round" fill="none"/>
              <circle cx="40" cy="17" r="2.5" fill="#7fe0a8"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
            {isEditing ? 'Mon profil vendeur' : 'Devenir vendeur'}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isEditing ? 'Modifiez vos informations' : 'Rejoignez AgriMarché'}
          </p>
        </div>

        {saveSuccess && (
          <div className="mb-4 p-3 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-xl flex items-center gap-2 animate-fadeIn">
            <CheckCircle size={16} />
            <span className="text-sm font-medium">Profil enregistré ! Redirection...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
              Nom complet
            </label>
            <div className="relative">
              <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Mamadou Diallo"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full pl-11 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 outline-none text-gray-800 dark:text-white dark:bg-gray-700"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
              Téléphone
            </label>
            <div className="relative">
              <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="tel"
                placeholder="77 123 45 67"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full pl-11 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 outline-none text-gray-800 dark:text-white dark:bg-gray-700"
                required
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">🔒 Votre numéro reste privé</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
              Région
            </label>
            <div className="relative">
              <MapPin size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value, city: '' })}
                className="w-full pl-11 pr-4 py-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:focus:ring-emerald-800 outline-none text-gray-800 dark:text-white dark:bg-gray-700 appearance-none bg-white dark:bg-gray-700"
                required
              >
                <option value="">Sélectionner une région</option>
                {REGIONS.map(r => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>

          {form.region && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
                Département / Ville <span className="font-normal lowercase">(optionnel)</span>
              </label>
              <select
                value={form.city}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                className="w-full p-3 border border-gray-200 dark:border-gray-600 rounded-xl focus:border-emerald-500 outline-none text-gray-800 dark:text-white dark:bg-gray-700 bg-white"
              >
                <option value="">Sélectionner</option>
                {CITIES_BY_REGION[form.region]?.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-start gap-3 pt-1">
            <input
              type="checkbox"
              id="acceptedTerms"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
              className="mt-1 w-4 h-4 accent-emerald-600 shrink-0"
            />
            <label htmlFor="acceptedTerms" className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
              J'accepte les conditions de vente d'AgriMarché, notamment l'application
              d'une commission de X % sur les ventes réalisées via la plateforme.
            </label>
          </div>

          <button
            type="submit"
            disabled={saving || !acceptedTerms}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 shadow-md transition-transform active:scale-98 disabled:opacity-70"
          >
            {saving ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <CheckCircle size={18} />
            )}
            {saving ? 'Enregistrement...' : (isEditing ? 'Mettre à jour' : 'Commencer la vente')}
          </button>
        </form>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}
