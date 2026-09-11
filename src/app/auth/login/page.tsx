'use client';

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
  signOut,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { Capacitor } from '@capacitor/core';
import { detectCarrier } from '@/lib/carrier';
import { loginSendOtp, loginVerifyOtp, RegistrationActionError } from '@/lib/registrationActions';
import { AuthHero } from '../_shared/AuthHero';
import { AuthSheet, AuthErrorBanner, LineField, PrimaryButton, AuthLink, BackRow, OtpCells } from '../_shared/AuthFormKit';

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
import { Eye, EyeOff } from 'lucide-react';

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
  // sessionId renvoyé par loginSendOtp (loginOtp.ts) — Free/Yas et
  // Expresso uniquement ; à transmettre tel quel à loginVerifyOtp.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const isNativeRef = useRef(false);
  const useCustomOtpRef = useRef(false);
  // ⚠️ SÉCURITÉ 2FA : signInWithEmailAndPassword() (étape 1, plus bas)
  // ouvre une VRAIE session Firebase persistée (browserLocalPersistence,
  // voir lib/firebase/firebase.ts) AVANT que l'OTP (étape 2) soit vérifié.
  // Sans ce garde-fou, le useEffect de redirection ci-dessous — qui ne
  // réagit qu'à `user` — se déclenche dès que le mot de passe est validé,
  // et envoie l'utilisateur directement dans l'app sans jamais lui
  // demander le code SMS : la 2ᵉ étape devient facultative en pratique.
  // Ce ref reste `true` entre la validation du mot de passe et la
  // validation de l'OTP ; le useEffect ignore tout changement de `user`
  // tant qu'il est à `true`.
  const otpPendingRef = useRef(false);

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
    // Voir le commentaire sur otpPendingRef plus haut : ne jamais rediriger
    // sur une session ouverte par la seule étape 1 (mot de passe), qui
    // n'a pas encore passé l'OTP.
    if (otpPendingRef.current) return;
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

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event: any) => {
      console.error('[DEBUG] phoneVerificationFailed — événement complet:', JSON.stringify(event));
      const detail = event?.code ? ` (code: ${event.code})` : '';
      setError((event.message || "Impossible d'envoyer le SMS") + detail);
      setLoading(false);
    });

    const completedSub = FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
      try {
        if (event.verificationCode) setOtp(event.verificationCode.split(''));
        otpPendingRef.current = false; // auto-vérif Android = 2FA complète
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
      // Session mot de passe ouverte, OTP pas encore validé : voir
      // otpPendingRef plus haut.
      otpPendingRef.current = true;

      // Mot de passe OK → envoie l'OTP
      const phoneE164 = toE164(phone);

      const carrier = detectCarrier(phone);
      if (carrier === 'free' || carrier === 'expresso') {
        useCustomOtpRef.current = true;
        // loginSendOtp (loginOtp.ts) : aucun numéro envoyé, le serveur lit
        // celui de users/{uid} — request.auth est déjà renseigné ici
        // puisque signInWithEmailAndPassword vient de réussir juste au-dessus.
        try {
          const { sessionId: sid } = await loginSendOtp();
          setSessionId(sid);
        } catch (otpErr: any) {
          // L'OTP n'est pas parti : cette tentative de connexion s'arrête
          // là, sans jamais avoir passé la 2FA. On referme la session
          // mot de passe plutôt que de la laisser traîner (voir
          // otpPendingRef) — sinon un simple retour sur l'app plus tard
          // pourrait être considéré comme connecté sans OTP validé.
          await signOut(auth).catch(() => {});
          otpPendingRef.current = false;
          const msg = otpErr instanceof RegistrationActionError ? otpErr.message : "Erreur lors de l'envoi du code";
          setError(msg);
          setLoading(false);
          return;
        }
        setStep('otp');
        setResendCooldown(60);
        setLoading(false);
        return;
      }
      useCustomOtpRef.current = false;

      const bridgeLikelyNative = Capacitor.isNativePlatform() || (await waitForNativeBridge());
      isNativeRef.current = bridgeLikelyNative;
      if (bridgeLikelyNative) {
        try {
          // APK : la suite est gérée par le listener 'phoneCodeSent'
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
      setStep('otp');
      setResendCooldown(60);
      setLoading(false);
    } catch (err: any) {
      // Idem qu'au-dessus : si le mot de passe avait été validé mais que
      // l'envoi du SMS (natif ou web) a ensuite échoué, ne pas laisser une
      // session non-2FA active.
      if (otpPendingRef.current) {
        await signOut(auth).catch(() => {});
        otpPendingRef.current = false;
      }
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

      const carrier = detectCarrier(phone);
      if (carrier === 'free' || carrier === 'expresso') {
        useCustomOtpRef.current = true;
        // Une nouvelle session écrase l'ancienne (nouveau sessionId, ancien
        // code déjà supprimé côté serveur si vérifié — sinon simplement
        // remplacé) : on renvoie systématiquement à loginSendOtp() plutôt
        // qu'à un endpoint /resend dédié, cohérent avec loginOtp.ts qui n'a
        // volontairement qu'un seul callable d'envoi.
        try {
          const { sessionId: sid } = await loginSendOtp();
          setSessionId(sid);
        } catch (otpErr: any) {
          const msg = otpErr instanceof RegistrationActionError ? otpErr.message : "Erreur lors de l'envoi du code";
          setError(msg);
          setLoading(false);
          return;
        }
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
        if (!sessionId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        try {
          const { customToken } = await loginVerifyOtp(sessionId, code);
          await signInWithCustomToken(auth, customToken);
          // 2FA complète : la vraie session (post-OTP) remplace la session
          // mot de passe intermédiaire, le garde-fou n'a plus lieu d'être.
          otpPendingRef.current = false;
          router.replace(redirect);
        } catch (otpErr: any) {
          const msg = otpErr instanceof RegistrationActionError ? otpErr.message : 'Code incorrect';
          setError(msg);
          setLoading(false);
        }
        return;
      }

      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
      } else {
        if (!confirmResult) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await confirmResult.confirm(code);
      }
      // 2FA complète (voir note équivalente ci-dessus).
      otpPendingRef.current = false;
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
      <div className="min-h-screen" style={{ background: '#F7F0E2' }}>
        <div id="recaptcha-container" />
        <AuthHero variant="signal" title="Un code en chemin" subtitle={`Envoyé par SMS au ${toE164(phone)}`} compact />
        <AuthSheet>
          <BackRow onClick={() => {
            // Abandon de la 2FA en cours de route : on referme la session
            // mot de passe intermédiaire plutôt que de la laisser vivante
            // sans OTP validé (voir otpPendingRef).
            signOut(auth).catch(() => {});
            otpPendingRef.current = false;
            setStep('form'); setOtp(['', '', '', '', '', '']); setError('');
          }} />

          {error && <AuthErrorBanner>{error}</AuthErrorBanner>}

          <OtpCells
            digits={otp}
            refs={otpRefs}
            onChange={handleOtpChange}
            onKeyDown={handleOtpKeyDown}
            onPaste={handleOtpPaste}
          />

          <PrimaryButton onClick={handleVerifyOTP} disabled={loading || otp.join('').length < 6}>
            {loading ? 'Vérification…' : 'Se connecter'}
          </PrimaryButton>

          <div className="mt-4 text-center">
            {resendCooldown > 0 ? (
              <p className="text-sm" style={{ color: '#14172E66' }}>
                Renvoyer dans <span className="font-semibold">{resendCooldown}s</span>
              </p>
            ) : (
              <button onClick={resendOTP} disabled={loading} className="text-sm font-medium" style={{ color: '#C6572A' }}>
                Renvoyer le code
              </button>
            )}
          </div>
        </AuthSheet>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════
  // FORMULAIRE PRINCIPAL (numéro + mot de passe)
  // ═══════════════════════════════════════════════════
  return (
    <div className="min-h-screen" style={{ background: '#F7F0E2' }}>
      <div id="recaptcha-container" />
      <AuthHero variant="welcome" title="Bienvenue au marché" subtitle="Connexion sécurisée par SMS, à votre numéro" />
      <AuthSheet>
        {error && <AuthErrorBanner>{error}</AuthErrorBanner>}

        <div className="space-y-5">
          <LineField
            label="Numéro de téléphone"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            prefix="+221"
            type="tel"
            placeholder="77 000 00 00"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />

          <LineField
            label="Mot de passe"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
              </svg>
            }
            type={showPwd ? 'text' : 'password'}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            trailing={
              <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ color: '#14172E80' }}>
                {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            }
          />
        </div>

        <div className="mt-7">
          <PrimaryButton onClick={handlePhoneLogin} disabled={loading}>
            {loading ? 'Envoi du SMS…' : 'Se connecter'}
          </PrimaryButton>
        </div>

        <p className="mt-6 text-center text-sm" style={{ color: '#14172E99' }}>
          Pas encore de compte ? <AuthLink href="/auth/register">S'inscrire</AuthLink>
        </p>
        <p className="mt-2 text-center text-xs" style={{ color: '#14172E66' }}>
          <Link href="/auth/forgot-password" className="hover:underline">Mot de passe oublié ?</Link>
        </p>
      </AuthSheet>
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
