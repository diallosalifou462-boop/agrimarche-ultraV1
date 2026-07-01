'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  User,
  Phone,
  Leaf,
  Truck,
  Shield,
  MapPin,
  Map,
  Home,
} from 'lucide-react';

// ============================================================
// RÉGIONS & DÉPARTEMENTS DU SÉNÉGAL
// (même liste de régions que le dashboard admin, pour cohérence
// avec targetRegion dans les diffusions)
// ============================================================

const SENEGAL_REGIONS = [
  "Dakar", "Thiès", "Saint-Louis", "Diourbel", "Louga", "Fatick",
  "Kaolack", "Kaffrine", "Tambacounda", "Kédougou", "Ziguinchor",
  "Sédhiou", "Kolda", "Matam"
] as const;

type SenegalRegion = typeof SENEGAL_REGIONS[number];

const DEPARTMENTS_BY_REGION: Record<SenegalRegion, string[]> = {
  "Dakar":        ["Dakar", "Guédiawaye", "Keur Massar", "Pikine", "Rufisque"],
  "Thiès":        ["Mbour", "Thiès", "Tivaouane"],
  "Saint-Louis":  ["Dagana", "Podor", "Saint-Louis"],
  "Diourbel":     ["Bambey", "Diourbel", "Mbacké"],
  "Louga":        ["Kébémer", "Linguère", "Louga"],
  "Fatick":       ["Fatick", "Foundiougne", "Gossas"],
  "Kaolack":      ["Guinguinéo", "Kaolack", "Nioro du Rip"],
  "Kaffrine":     ["Birkilane", "Kaffrine", "Koungheul", "Malem-Hodar"],
  "Tambacounda":  ["Bakel", "Goudiry", "Koumpentoum", "Tambacounda"],
  "Kédougou":     ["Kédougou", "Salemata", "Saraya"],
  "Ziguinchor":   ["Bignona", "Oussouye", "Ziguinchor"],
  "Sédhiou":      ["Bounkiling", "Goudomp", "Sédhiou"],
  "Kolda":        ["Kolda", "Médina Yoro Foulah", "Vélingara"],
  "Matam":        ["Kanel", "Matam", "Ranérou Ferlo"],
};

export default function RegisterPage() {
  const router = useRouter();
  const { signUp, user, loading: authLoading } = useAuth();
  const [isClient, setIsClient] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    region: '' as SenegalRegion | '',
    departement: '',
    commune: '',
    quartier: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (isClient && user && !authLoading) {
      router.push('/');
    }
  }, [user, authLoading, router, isClient]);

  const handleRegionChange = (value: string) => {
    // Le département dépend de la région : on réinitialise si la région change
    setFormData({ ...formData, region: value as SenegalRegion, departement: '' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    if (formData.password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (!formData.region || !formData.departement) {
      setError('Veuillez sélectionner votre région et votre département');
      return;
    }

    if (!formData.commune.trim()) {
      setError('Veuillez indiquer votre commune');
      return;
    }

    if (!agreeTerms) {
      setError('Vous devez accepter les conditions générales');
      return;
    }

    setLoading(true);

    try {
      await signUp(formData.email, formData.password, formData.name, {
        phone: formData.phone,
        region: formData.region,
        departement: formData.departement,
        commune: formData.commune.trim(),
        quartier: formData.quartier.trim() || '',
      });
      router.push('/auth/login');
    } catch (error) {
      setError("Erreur lors de l'inscription");
    } finally {
      setLoading(false);
    }
  };

  // ✅ Écran de chargement côté serveur
  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  const availableDepartments = formData.region ? DEPARTMENTS_BY_REGION[formData.region] : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* HEADER */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl mb-4 shadow-lg">
              <Leaf size={28} className="text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Inscription</h2>
            <p className="text-gray-500 text-sm mt-1">Créez votre compte Agrimarché</p>
          </div>

          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* NOM */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom complet
              </label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Jean Dupont"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* EMAIL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="exemple@email.com"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* TELEPHONE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone
              </label>
              <div className="relative">
                <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="77 000 00 00"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* RÉGION */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Région
              </label>
              <div className="relative">
                <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  required
                  value={formData.region}
                  onChange={(e) => handleRegionChange(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none appearance-none bg-white"
                >
                  <option value="">Sélectionnez une région</option>
                  {SENEGAL_REGIONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* DÉPARTEMENT (dépend de la région) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Département
              </label>
              <div className="relative">
                <Map size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  required
                  disabled={!formData.region}
                  value={formData.departement}
                  onChange={(e) => setFormData({ ...formData, departement: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none appearance-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">
                    {formData.region ? 'Sélectionnez un département' : "Choisissez d'abord une région"}
                  </option>
                  {availableDepartments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* COMMUNE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Commune
              </label>
              <div className="relative">
                <Home size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  value={formData.commune}
                  onChange={(e) => setFormData({ ...formData, commune: e.target.value })}
                  placeholder="Ex : Sangalkam, Mbour, Mékhé..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* QUARTIER (optionnel) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quartier <span className="text-gray-400">(optionnel)</span>
              </label>
              <div className="relative">
                <Home size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={formData.quartier}
                  onChange={(e) => setFormData({ ...formData, quartier: e.target.value })}
                  placeholder="Ex : Médina, Liberté 6..."
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* TERMS */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                J'accepte les{' '}
                <Link href="/legal/terms" className="text-green-600 hover:underline">
                  conditions générales
                </Link>
              </span>
            </label>

            {/* BUTTON */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50"
            >
              {loading ? 'Inscription...' : "S'inscrire"}
            </button>
          </form>

          {/* LOGIN LINK */}
          <p className="text-center text-sm text-gray-600 mt-6">
            Déjà un compte ?{' '}
            <Link href="/auth/login" className="text-green-600 font-semibold hover:text-green-700">
              Se connecter
            </Link>
          </p>

          {/* FOOTER */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <Truck size={11} />
              <span>Livraison rapide</span>
            </div>
            <div className="flex items-center gap-1">
              <Shield size={11} />
              <span>Paiement sécurisé</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

