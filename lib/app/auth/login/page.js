"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = LoginPage;
const react_1 = require("react");
const image_1 = __importDefault(require("next/image"));
const link_1 = __importDefault(require("next/link"));
const navigation_1 = require("next/navigation");
const useAuth_1 = require("@/hooks/useAuth");
const firestore_1 = require("firebase/firestore");
const firebase_1 = require("@/lib/firebase/firebase");
function LoginPage() {
    const router = (0, navigation_1.useRouter)();
    const { signIn, user, loading: authLoading } = (0, useAuth_1.useAuth)();
    const [email, setEmail] = (0, react_1.useState)('');
    const [password, setPassword] = (0, react_1.useState)('');
    const [loading, setLoading] = (0, react_1.useState)(false);
    const [error, setError] = (0, react_1.useState)('');
    (0, react_1.useEffect)(() => {
        const redirectBasedOnRole = async () => {
            if (user && !authLoading) {
                const userRef = (0, firestore_1.doc)(firebase_1.db, 'users', user.uid);
                const userSnap = await (0, firestore_1.getDoc)(userRef);
                const userData = userSnap.data();
                const role = (userData === null || userData === void 0 ? void 0 : userData.role) || 'client';
                if (role === 'admin') {
                    router.push('/admin');
                }
                else if (role === 'seller') {
                    router.push('/seller/dashboard');
                }
                else if (role === 'delivery') {
                    router.push('/delivery/dashboard');
                }
                else {
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
            const userRef = (0, firestore_1.doc)(firebase_1.db, 'users', result.user.uid);
            const userSnap = await (0, firestore_1.getDoc)(userRef);
            const userData = userSnap.data();
            const role = (userData === null || userData === void 0 ? void 0 : userData.role) || 'client';
            if (role === 'admin') {
                router.push('/admin');
            }
            else if (role === 'seller') {
                router.push('/seller/dashboard');
            }
            else if (role === 'delivery') {
                router.push('/delivery/dashboard');
            }
            else {
                router.push('/main/products');
            }
        }
        catch (error) {
            setError('Email ou mot de passe incorrect');
        }
        finally {
            setLoading(false);
        }
    };
    return (<div className="min-h-screen flex items-center justify-center p-4" style={{
            background: 'linear-gradient(to bottom right, #f0fdf4, #ffffff, #ecfdf5)',
        }}>
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <image_1.default src="/logo.png" alt="AgriMarché Logo" width={120} height={120} priority/>
          <h1 className="text-2xl font-bold text-gray-800 mt-3">
            Bienvenue sur AgriMarché
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Connectez-vous à votre compte
          </p>
        </div>

        {error && (<div className="bg-red-50 text-red-600 text-sm p-3 rounded-xl mb-4">
            {error}
          </div>)}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email
          </label>
          <input type="email" placeholder="votre@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"/>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mot de passe
          </label>
          <input type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100"/>
        </div>

        <button onClick={handleLogin} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <p className="text-center text-sm text-gray-600 mt-6">
          Pas encore de compte ?{' '}
          <link_1.default href="/auth/register" className="text-green-600 font-semibold hover:text-green-700">
            S'inscrire
          </link_1.default>
        </p>
      </div>
    </div>);
}
