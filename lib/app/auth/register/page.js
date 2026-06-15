"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.forceDynamic = void 0;
exports.default = RegisterPage;
const react_1 = require("react");
const link_1 = __importDefault(require("next/link"));
const navigation_1 = require("next/navigation");
const useAuth_1 = require("@/hooks/useAuth");
const lucide_react_1 = require("lucide-react");
// ✅ IMPORTANT: Désactiver complètement le SSR pour cette page
exports.forceDynamic = 'force-dynamic';
function RegisterPage() {
    const router = (0, navigation_1.useRouter)();
    const { signUp, user, loading: authLoading } = (0, useAuth_1.useAuth)();
    const [isClient, setIsClient] = (0, react_1.useState)(false);
    const [formData, setFormData] = (0, react_1.useState)({
        name: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
    });
    const [showPassword, setShowPassword] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [agreeTerms, setAgreeTerms] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
        setIsClient(true);
    }, []);
    (0, react_1.useEffect)(() => {
        if (isClient && user && !authLoading) {
            router.push('/');
        }
    }, [user, authLoading, router, isClient]);
    const handleSubmit = async (e) => {
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
        if (!agreeTerms) {
            setError('Vous devez accepter les conditions générales');
            return;
        }
        setLoading(true);
        try {
            await signUp(formData.email, formData.password, formData.name);
            router.push('/auth/login');
        }
        catch (error) {
            setError("Erreur lors de l'inscription");
        }
        finally {
            setLoading(false);
        }
    };
    // ✅ Ne rien rendre côté serveur
    if (!isClient) {
        return (<div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"/>
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>);
    }
    return (<div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* HEADER */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl mb-4 shadow-lg">
              <lucide_react_1.Leaf size={28} className="text-white"/>
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Inscription</h2>
            <p className="text-gray-500 text-sm mt-1">Créez votre compte Agrimarché</p>
          </div>

          {/* FORM */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (<div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm">
                {error}
              </div>)}

            {/* NOM */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nom complet
              </label>
              <div className="relative">
                <lucide_react_1.User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="text" required value={formData.name} onChange={(e) => setFormData(Object.assign(Object.assign({}, formData), { name: e.target.value }))} placeholder="Jean Dupont" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"/>
              </div>
            </div>

            {/* EMAIL */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <lucide_react_1.Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="email" required value={formData.email} onChange={(e) => setFormData(Object.assign(Object.assign({}, formData), { email: e.target.value }))} placeholder="exemple@email.com" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"/>
              </div>
            </div>

            {/* TELEPHONE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Téléphone
              </label>
              <div className="relative">
                <lucide_react_1.Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type="tel" value={formData.phone} onChange={(e) => setFormData(Object.assign(Object.assign({}, formData), { phone: e.target.value }))} placeholder="77 000 00 00" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"/>
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mot de passe
              </label>
              <div className="relative">
                <lucide_react_1.Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type={showPassword ? 'text' : 'password'} required value={formData.password} onChange={(e) => setFormData(Object.assign(Object.assign({}, formData), { password: e.target.value }))} placeholder="••••••••" className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"/>
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <lucide_react_1.EyeOff size={18}/> : <lucide_react_1.Eye size={18}/>}
                </button>
              </div>
            </div>

            {/* CONFIRM PASSWORD */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <lucide_react_1.Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input type={showPassword ? 'text' : 'password'} required value={formData.confirmPassword} onChange={(e) => setFormData(Object.assign(Object.assign({}, formData), { confirmPassword: e.target.value }))} placeholder="••••••••" className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"/>
              </div>
            </div>

            {/* TERMS */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="w-4 h-4"/>
              <span className="text-sm text-gray-600">
                J'accepte les{' '}
                <link_1.default href="/legal/terms" className="text-green-600">
                  conditions générales
                </link_1.default>
              </span>
            </label>

            {/* BUTTON */}
            <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50">
              {loading ? 'Inscription...' : "S'inscrire"}
            </button>
          </form>

          {/* LOGIN LINK */}
          <p className="text-center text-sm text-gray-600 mt-6">
            Déjà un compte ?{' '}
            <link_1.default href="/auth/login" className="text-green-600 font-semibold hover:text-green-700">
              Se connecter
            </link_1.default>
          </p>

          {/* FOOTER */}
          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-1">
              <lucide_react_1.Truck size={11}/>
              <span>Livraison rapide</span>
            </div>
            <div className="flex items-center gap-1">
              <lucide_react_1.Shield size={11}/>
              <span>Paiement sécurisé</span>
            </div>
          </div>
        </div>
      </div>
    </div>);
}
