"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LoginPage;
const image_1 = __importDefault(require("next/image"));
const react_1 = require("react");
const navigation_1 = require("next/navigation");
const link_1 = __importDefault(require("next/link"));
const useAuth_1 = require("@/hooks/useAuth");
function LoginContent() {
    const router = (0, navigation_1.useRouter)();
    const searchParams = (0, navigation_1.useSearchParams)();
    // TOUS LES HOOKS D'ABORD
    const { signIn } = (0, useAuth_1.useAuth)(); // ✅ Supprimé signInWithGoogle
    const [mounted, setMounted] = (0, react_1.useState)(false);
    const [email, setEmail] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    const [showPwd, setShowPwd] = (0, react_1.useState)(false);
    (0, react_1.useEffect)(() => {
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
        }
        catch (err) {
            const msg = err === null || err === void 0 ? void 0 : err.code;
            if (msg === 'auth/invalid-credential' || msg === 'auth/wrong-password') {
                setError('Email ou mot de passe incorrect.');
            }
            else {
                setError('Connexion échouée.');
            }
        }
        finally {
            setLoading(false);
        }
    };
    return (<div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-[350px]">
        <div className="text-center mb-6">
          <image_1.default src="/logo.png" alt="Agrimarché" width={120} height={120} className="mx-auto"/>
          <h1 className="text-2xl font-bold mt-3">Bienvenue à Agrimarche</h1>
        </div>

        {error && (<div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">
            {error}
          </div>)}

        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-3 rounded mb-4"/>

        <div className="relative mb-4">
          <input type={showPwd ? 'text' : 'password'} placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border p-3 rounded"/>
          <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3">
            {showPwd ? '🙈' : '👁️'}
          </button>
        </div>

        <button onClick={handleLogin} disabled={loading} className="w-full bg-green-600 text-white py-3 rounded">
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <p className="text-center mt-5 text-sm">
          Pas encore de compte ?{' '}
          <link_1.default href="/auth/register" className="text-green-600">
            S'inscrire
          </link_1.default>
        </p>
      </div>
    </div>);
}
function LoginPage() {
    return (<react_1.Suspense fallback={null}>
      <LoginContent />
    </react_1.Suspense>);
}
