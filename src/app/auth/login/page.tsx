'use client';

import Image from 'next/image';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  signInWithEmailAndPassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { Capacitor } from '@capacitor/core';

// ─── Attend que le pont natif Capacitor soit prêt ─────
async function waitForNativeBridge(timeoutMs = 1500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (Capacitor.isNativePlatform()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return Capacitor.isNativePlatform();
}
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Phone, Lock, Eye, EyeOff, MessageSquare, ArrowLeft } from 'lucide-react';

// ─── Helpers ─────────────────────────────────────────────
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return `+${digits}`;
}

function toSyntheticEmail(phone: string): string {
  return `${phone.replace(/\D/g, '')}@agrimarche.sn`;
}

const FORCED_ADMIN_EMAIL = 'support@agrimarche.com';

function getRedirectPath(role?: string) {
  if (role === 'admin') return '/admin';
  if (role === 'seller') return '/seller/dashboard';
  if (role === 'delivery') return '/delivery/dashboard';
  return '/main/products';
}

type Step = 'form' | 'otp';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, user, profile, loading: authLoading } = useAuth();

  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<Step>('form');

  // Formulaire
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  // OTP
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const isNativeRef = useRef(false);

  // UI
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setMounted(true); }, []);

  // 🔍 DEBUG TEMPORAIRE — à retirer après diagnostic.
  useEffect(() => {
    console.log('=== [DEBUG] Diagnostic Capacitor (au chargement) ===');
    console.log('[DEBUG] Capacitor.getPlatform():', Capacitor.getPlatform());
    console.log('[DEBUG] Capacitor.isNativePlatform():', Capacitor.isNativePlatform());
    console.log('[DEBUG] typeof window.Capacitor:', typeof (window as any).Capacitor);
    console.log('[DEBUG] window.location.href:', window.location.href);
    console.log('=====================================================');
  }, []);

  useEffect(() => {
    if (!mounted || authLoading || !user) return;
    router.replace(getRedirectPath(profile?.role));
  }, [user, profile, authLoading, mounted, router]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ─── Bypass reCAPTCHA en local (dev only, flow web) ───
  useEffect(() => {
    const isLocalHost =
      typeof window !== 'undefined' &&
      ['localhost', '127.0.0.1'].includes(window.location.hostname);
    if (process.env.NODE_ENV === 'development' && isLocalHost && !Capacitor.isNativePlatform()) {
      auth.settings.appVerificationDisabledForTesting = true;
      console.info('[Auth] Vérification reCAPTCHA désactivée (dev only).');
    }
  }, []);

  // ─── Listeners natifs (APK Android/iOS uniquement) ────
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const codeSentSub = FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
      setVerificationId(event.verificationId);
      setStep('otp');
      setResendCooldown(60);
      setLoading(false);
    });

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
      setError(event.message || "Impossible d'envoyer le SMS");
      setLoading(false);
    });

    const completedSub = FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
      try {
        if (event.verificationCode) setOtp(event.verificationCode.split(''));
        router.replace(searchParams.get('redirect') || '/main/products');
      } catch {
        // L'utilisateur pourra toujours saisir/valider le code manuellement
      }
    });

    return () => {
      codeSentSub.then(l => l.remove());
      failedSub.then(l => l.remove());
      completedSub.then(l => l.remove());
    };
  }, []);

  if (!mounted) return null;

  const redirect = searchParams.get('redirect') || '/main/products';

  // ─── reCAPTCHA invisible ────────────────────────────
  const setupRecaptcha = () => {
    if (recaptchaRef.current) { recaptchaRef.current.clear(); recaptchaRef.current = null; }
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
  };

  // ─── Étape 1 : vérifier mot de passe + envoyer OTP ──
  const handlePhoneLogin = async () => {
    setError('');
    if (!phone || !password) { setError('Remplissez tous les champs'); return; }

    setLoading(true);
    try {
      // Vérifie le mot de passe via email synthétique
      const email = toSyntheticEmail(phone);
      await signInWithEmailAndPassword(auth, email, password);

      // Mot de passe OK → envoie l'OTP
      const phoneE164 = toE164(phone);
      const isNative = await waitForNativeBridge();
      isNativeRef.current = isNative;
      if (isNative) {
        // APK : la suite est gérée par le listener 'phoneCodeSent'
        await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phoneE164 });
      } else {
        setupRecaptcha();
        const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaRef.current!);
        setConfirmResult(result);
        setStep('otp');
        setResendCooldown(60);
        setLoading(false);
      }
    } catch (err: any) {
      const code = err?.code;
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setError('Numéro ou mot de passe incorrect');
      } else if (code === 'auth/invalid-phone-number') {
        setError('Numéro de téléphone invalide');
      } else if (code === 'auth/too-many-requests') {
        setError('Trop de tentatives, réessayez plus tard');
      } else {
        setError('Connexion échouée, réessayez');
      }
      setLoading(false);
    }
  };

  // ─── Renvoi OTP ─────────────────────────────────────
  const resendOTP = async () => {
    setError('');
    setLoading(true);
    try {
      const phoneE164 = toE164(phone);
      const isNative = await waitForNativeBridge();
      isNativeRef.current = isNative;
      if (isNative) {
        await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phoneE164 });
      } else {
        setupRecaptcha();
        const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaRef.current!);
        setConfirmResult(result);
        setResendCooldown(60);
        setLoading(false);
      }
    } catch {
      setError("Impossible d'envoyer le SMS");
      setLoading(false);
    }
  };

  // ─── Saisie OTP ─────────────────────────────────────
  const handleOtpChange = (i: number, val: string) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp]; next[i] = val.slice(-1); setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };
  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) { setOtp(paste.split('')); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  // ─── Étape 2 : confirmer OTP → connecté ─────────────
  const handleVerifyOTP = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Code à 6 chiffres requis'); return; }

    setLoading(true);
    setError('');
    try {
      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
      } else {
        if (!confirmResult) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await confirmResult.confirm(code);
      }
      // Firebase est déjà connecté via Phone Auth,
      // le useEffect va déclencher la redirection
      router.replace(redirect);
    } catch (err: any) {
      if (err?.code === 'auth/invalid-verification-code') {
        setError('Code incorrect');
      } else if (err?.code === 'auth/code-expired') {
        setError('Code expiré, renvoyez un nouveau SMS');
      } else {
        setError('Erreur de vérification');
      }
    } finally {
      setLoading(false);
    }
  };

  // ═══════════════════════════════════════════════════
  // ÉCRAN OTP
  // ═══════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div id="recaptcha-container" />
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
          <button
            onClick={() => { setStep('form'); setOtp(['','','','','','']); setError(''); }}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
          >
            <ArrowLeft size={16} /> Retour
          </button>

          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-3">
              <MessageSquare size={26} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-800">Code SMS</h2>
            <p className="text-sm text-gray-500 mt-1">
              Envoyé au <span className="font-semibold">{toE164(phone)}</span>
            </p>
          </div>

          {error && (
            <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm mb-4">{error}</div>
          )}

          {/* 6 cases OTP */}
          <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={el => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                className={`w-11 h-13 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all py-3 ${
                  digit ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 focus:border-green-400'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleVerifyOTP}
            disabled={loading || otp.join('').length < 6}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mb-3"
          >
            {loading ? 'Vérification...' : 'Se connecter'}
          </button>

          <div className="text-center">
            {resendCooldown > 0 ? (
              <p className="text-sm text-gray-400">Renvoyer dans <span className="font-semibold">{resendCooldown}s</span></p>
            ) : (
              <button onClick={resendOTP} disabled={loading} className="text-sm text-green-600 hover:text-green-700 font-medium">
                Renvoyer le code
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // FORMULAIRE PRINCIPAL (numéro + mot de passe)
  // ═══════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div id="recaptcha-container" />
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-white shadow-lg ring-4 ring-green-100 mb-3 overflow-hidden">
            <Image src="/logo.png" alt="AgriMarché" width={96} height={96} className="w-full h-full object-cover rounded-full" />
          </div>
          <h1 className="text-2xl font-bold mt-3">Bienvenue sur AgriMarché</h1>
          <p className="text-sm text-gray-500 mt-1">Connexion sécurisée par SMS</p>
        </div>

        {/* SMS badge */}
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4">
          <MessageSquare size={13} className="text-green-600 flex-shrink-0" />
          <p className="text-xs text-green-700">Un code SMS vous sera envoyé pour confirmer</p>
        </div>

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>
        )}

        {/* TÉLÉPHONE */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de téléphone</label>
          <div className="relative flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100">
            <span className="px-3 text-xs font-semibold text-gray-500 bg-gray-50 border-r border-gray-200 py-3 whitespace-nowrap">+221</span>
            <input
              type="tel"
              placeholder="77 000 00 00"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              className="flex-1 px-3 py-3 outline-none text-sm"
            />
          </div>
        </div>

        {/* MOT DE PASSE */}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
          <div className="relative">
            <input
              type={showPwd ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 pr-12"
            />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-gray-400">
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <button
          onClick={handlePhoneLogin}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <MessageSquare size={16} />
          {loading ? 'Envoi du SMS...' : 'Se connecter'}
        </button>

        <p className="text-center mt-5 text-sm">
          Pas encore de compte ?{' '}
          <Link href="/auth/register" className="text-green-600 font-semibold">S'inscrire</Link>
        </p>

        <p className="text-center mt-2 text-xs text-gray-400">
          <Link href="/auth/forgot-password" className="hover:text-green-600">Mot de passe oublié ?</Link>
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
