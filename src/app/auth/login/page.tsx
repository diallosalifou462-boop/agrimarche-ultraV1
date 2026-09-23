'use client';

import BrandLogo from '@/components/BrandLogo';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  ConfirmationResult,
  signInWithEmailAndPassword,
  signInWithCredential,
  PhoneAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { resolveLoginEmails, ensureMainAccountAfterPhoneCode, NoAccountForPhoneError } from '@/lib/auth/phoneSession';
import { Capacitor } from '@capacitor/core';
import { detectCarrier } from '@/lib/carrier';
import { apiUrl } from '@/lib/api-config';
import { logOtpAttempt } from '@/lib/otpDiagnostics';

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
  return `${phone.replace(/\D/g, '')}@sunumenef.sn`;
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
  const useCustomOtpRef = useRef(false);

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
    const requested = searchParams.get('redirect');
    router.replace(requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : getRedirectPath(profile?.role));
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

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event: any) => {
      console.error('[DEBUG] phoneVerificationFailed — événement complet:', JSON.stringify(event));
      const detail = event?.code ? ` (code: ${event.code})` : '';
      setError((event.message || "Impossible d'envoyer le SMS") + detail);
      setLoading(false);
    });

    const completedSub = FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
      try {
        // ⚠️ FIX (23/09) : on remplit seulement le code ; la connexion se
        // fait au clic sur « Confirmer » (handleVerifyOTP → SDK web). Avant,
        // on redirigeait sans aucune connexion côté web.
        if (event.verificationCode) setOtp(event.verificationCode.split(''));
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
      // Email RÉEL du compte (le format a changé selon l'époque et
      // l'opérateur) ; formats historiques en secours si serveur injoignable.
      let signedIn = false;
      let lastErr: any = null;
      for (const email of await resolveLoginEmails(phone)) {
        try {
          await signInWithEmailAndPassword(auth, email, password);
          signedIn = true;
          break;
        } catch (e: any) {
          lastErr = e;
          const retryable = e?.code === 'auth/invalid-credential' || e?.code === 'auth/user-not-found' || e?.code === 'auth/wrong-password';
          if (!retryable) break;
        }
      }
      if (!signedIn) throw lastErr ?? Object.assign(new Error('invalid'), { code: 'auth/invalid-credential' });

      // Numéro + mot de passe corrects → connexion directe, AUCUN code
      // envoyé, quel que soit l'opérateur. La redirection (selon le rôle,
      // ou vers ?redirect=) est faite par l'effet qui surveille `user`.
      setLoading(false);
    } catch (err: any) {
      const code = err?.code;
      if (err instanceof NoAccountForPhoneError) {
        setError("Aucun compte n'est associé à ce numéro. Créez votre compte.");
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        // ⚠️ Ce code Firebase ne distingue PAS « mauvais mot de passe » de
        // « ce compte n'a jamais eu de mot de passe » (compte « téléphone
        // seul » orphelin — voir phoneAccounts.ts). Sans cette vérif, un
        // utilisateur dont le compte est orphelin voit indéfiniment
        // « mot de passe incorrect » et retape le même mot de passe en
        // boucle, alors qu'aucun mot de passe ne marchera jamais : seul
        // « mot de passe oublié » peut le débloquer.
        try {
          const checkRes = await fetch(apiUrl('/api/auth/check-phone'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: toE164(phone), purpose: 'login' }),
          });
          const checkJson = await checkRes.json().catch(() => null);
          if (checkRes.ok && checkJson?.hasPassword === false) {
            setError('Ce compte n\'a pas encore de mot de passe défini. Utilisez « Mot de passe oublié » pour en créer un.');
            setLoading(false);
            return;
          }
        } catch {
          // Vérif indisponible (réseau) : on retombe sur le message générique.
        }
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

      const carrier = detectCarrier(phone);
      if (carrier === 'free' || carrier === 'expresso') {
        useCustomOtpRef.current = true;
        const fetchStartedAt = Date.now();
        logOtpAttempt({ flow: 'resend', step: 'fetch_start', phoneE164, carrier });
        let res: Response;
        try {
          res = await fetch(apiUrl('/api/otp/send'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: phoneE164 }),
          });
        } catch (networkErr: any) {
          const msg = String(networkErr?.message || networkErr);
          console.error('[DEBUG] /api/otp/send (resend) — échec RÉSEAU:', networkErr);
          logOtpAttempt({
            flow: 'resend', step: 'fetch_network_error', phoneE164, carrier,
            errorMessage: msg, durationMs: Date.now() - fetchStartedAt,
          });
          setError(`Connexion au serveur impossible (réseau). Détail: ${msg}`);
          setLoading(false);
          return;
        }
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          console.error('[DEBUG] /api/otp/send (resend) — erreur API:', res.status, json);
          logOtpAttempt({
            flow: 'resend', step: 'fetch_api_error', phoneE164, carrier,
            httpStatus: res.status, errorMessage: json?.error,
            durationMs: Date.now() - fetchStartedAt,
          });
          setError(json?.error || `Erreur lors de l'envoi du code (HTTP ${res.status})`);
          setLoading(false);
          return;
        }
        logOtpAttempt({
          flow: 'resend', step: 'fetch_success', phoneE164, carrier,
          httpStatus: res.status, durationMs: Date.now() - fetchStartedAt,
        });
        setResendCooldown(60);
        setLoading(false);
        return;
      }
      useCustomOtpRef.current = false;

      const bridgeLikelyNative = Capacitor.isNativePlatform() || (await waitForNativeBridge());
      isNativeRef.current = bridgeLikelyNative;
      if (bridgeLikelyNative) {
        try {
          await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phoneE164 });
          return;
        } catch (nativeErr: any) {
          const msg = String(nativeErr?.message || nativeErr);
          if (!/not implemented|not available|unimplemented/i.test(msg)) throw nativeErr;
        }
      }
      setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaRef.current!);
      setConfirmResult(result);
      setResendCooldown(60);
      setLoading(false);
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
      if (useCustomOtpRef.current) {
        const phoneE164 = toE164(phone);
        const res = await fetch(apiUrl('/api/otp/verify'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phoneE164, code }),
        });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error || 'Code incorrect');
          setLoading(false);
          return;
        }
        await signInWithCustomToken(auth, json.customToken);
        router.replace(redirect);
        return;
      }

      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        // ⚠️ FIX (23/09) : le plugin natif ne connecte PAS le SDK web. On
        // connecte donc le SDK web directement avec le code, sinon
        // auth.currentUser reste null (voir auth/forgot-password).
        await signInWithCredential(auth, PhoneAuthProvider.credential(verificationId, code));
      } else {
        if (!confirmResult) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await confirmResult.confirm(code);
      }
      // Orange : si Firebase a connecté un compte « téléphone seul » vide au
      // lieu du vrai compte, on revient sur le vrai compte (le doublon est
      // supprimé côté serveur et le numéro rattaché au vrai compte).
      await ensureMainAccountAfterPhoneCode(phone);
      router.replace(redirect);
    } catch (err: any) {
      if (err?.code === 'auth/invalid-verification-code') {
        setError('Code incorrect');
      } else if (err?.code === 'auth/code-expired') {
        setError('Code expiré, renvoyez un nouveau SMS');
      } else {
        setError(err?.code ? 'Erreur de vérification' : (err?.message || 'Erreur de vérification'));
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
            <BrandLogo size={96} variant="full" className="w-full h-full rounded-full" />
          </div>
          <h1 className="text-2xl font-bold mt-3">Bienvenue sur Sunu Mëñëf</h1>
          <p className="text-sm text-gray-500 mt-1">Connectez-vous avec votre numéro et votre mot de passe</p>
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
          <Lock size={16} />
          {loading ? 'Connexion...' : 'Se connecter'}
        </button>

        <p className="text-center mt-5 text-sm">
          Pas encore de compte ?{' '}
          <Link href={`/auth/register?redirect=${encodeURIComponent(redirect)}`} className="text-green-600 font-semibold">Créer un compte</Link>
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
