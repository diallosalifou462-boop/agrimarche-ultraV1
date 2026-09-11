'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  ConfirmationResult,
  updatePassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { Capacitor } from '@capacitor/core';
import { detectCarrier } from '@/lib/carrier';
import { apiUrl } from '@/lib/api-config';
import { resetPasswordSendOtp, resetPasswordVerifyOtp, RegistrationActionError } from '@/lib/registrationActions';
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

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return `+${digits}`;
}

type Step = 'phone' | 'otp' | 'newpwd' | 'success';

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const verificationIdRef = useRef<string | null>(null);
  // sessionId renvoyé par resetPasswordSendOtp (passwordReset.ts) —
  // Free/Yas et Expresso uniquement ; à transmettre tel quel à
  // resetPasswordVerifyOtp.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

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
      verificationIdRef.current = event.verificationId;
      setStep('otp');
      setResendCooldown(60);
      setLoading(false);
    });

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
      setError(event.message || "Impossible d'envoyer le SMS");
      setLoading(false);
    });

    // Auto-vérification Android : on confirme explicitement le code
    // pour être sûr que auth.currentUser soit bien mis à jour, car
    // handleNewPassword en dépend directement.
    const completedSub = FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
      try {
        if (event.verificationCode) setOtp(event.verificationCode.split(''));
        if (verificationIdRef.current && event.verificationCode) {
          await FirebaseAuthentication.confirmVerificationCode({
            verificationId: verificationIdRef.current,
            verificationCode: event.verificationCode,
          });
        }
        setStep('newpwd');
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

  const isNativeRef = useRef(false);
  // true si on utilise le système OTP maison (backend + Infobip) au lieu
  // de Firebase Phone Auth — cas des numéros Free/Yas et Expresso, voir
  // lib/carrier.ts et le même flow dans auth/register/page.tsx.
  const useCustomOtpRef = useRef(false);

  const setupRecaptcha = () => {
    if (recaptchaRef.current) { recaptchaRef.current.clear(); recaptchaRef.current = null; }
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
  };

  const sendOTP = async () => {
    if (!phone) { setError('Saisissez votre numéro'); return; }
    setError(''); setLoading(true);
    try {
      const phoneE164 = toE164(phone);

      // ─── Routage par opérateur (identique à auth/register) ──────
      // Firebase Phone Auth échoue souvent sur Free/Yas et Expresso au
      // Sénégal : on passe ces numéros par notre backend OTP (Infobip).
      const carrier = detectCarrier(phone);
      if (carrier === 'free' || carrier === 'expresso') {
        useCustomOtpRef.current = true;
        try {
          // resetPasswordSendOtp (passwordReset.ts) : refuse explicitement
          // un numéro qui n'appartient à aucun compte (ACCOUNT_NOT_FOUND) —
          // logique inverse de l'inscription.
          const { sessionId: sid } = await resetPasswordSendOtp(phoneE164);
          setSessionId(sid);
        } catch (otpErr: any) {
          const msg = otpErr instanceof RegistrationActionError ? otpErr.message : "Erreur lors de l'envoi du code";
          setError(msg);
          setLoading(false);
          return;
        }
        setStep('otp');
        setResendCooldown(60);
        setLoading(false);
        const t = setInterval(() => setResendCooldown(v => { if (v <= 1) clearInterval(t); return v - 1; }), 1000);
        return;
      }
      useCustomOtpRef.current = false;

      // ─── Orange (flow Firebase natif/web) ───────────────────────
      // Firebase Phone Auth ne vérifie pas qu'un compte existe déjà avant
      // d'envoyer le SMS — il en crée un à la volée à la confirmation du
      // code si besoin. Sans ce contrôle préalable (aucun envoi de SMS,
      // aucun coût), un numéro jamais inscrit pourrait "réinitialiser" un
      // mot de passe et se retrouver avec un compte fantôme vide.
      const checkRes = await fetch(apiUrl('/api/auth/check-phone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneE164, purpose: 'reset' }),
      });
      const checkJson = await checkRes.json().catch(() => null);
      if (!checkRes.ok) {
        setError(checkJson?.error || "Aucun compte n'est associé à ce numéro.");
        setLoading(false);
        return;
      }

      const isNative = await waitForNativeBridge();
      isNativeRef.current = isNative;
      if (isNative) {
        await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phoneE164 });
      } else {
        setupRecaptcha();
        const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaRef.current!);
        setConfirmResult(result);
        setStep('otp');
        setResendCooldown(60);
        setLoading(false);
        const t = setInterval(() => setResendCooldown(v => { if (v <= 1) clearInterval(t); return v - 1; }), 1000);
      }
    } catch (err: any) {
      if (err?.code === 'auth/invalid-phone-number') setError('Numéro invalide');
      else if (err?.code === 'auth/too-many-requests') setError('Trop de tentatives');
      else setError("Impossible d'envoyer le SMS");
      setLoading(false);
    }
  };

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

  const verifyOTP = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Code à 6 chiffres requis'); return; }
    setLoading(true); setError('');
    try {
      if (useCustomOtpRef.current) {
        // Free/Yas et Expresso : vérification côté serveur (Admin SDK) via
        // resetPasswordVerifyOtp (passwordReset.ts) — pas de `registration`
        // ici (compte déjà existant). On récupère un customToken pour
        // établir la session Firebase et pouvoir ensuite appeler
        // updatePassword().
        if (!sessionId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        try {
          const { customToken } = await resetPasswordVerifyOtp(sessionId, code);
          await signInWithCustomToken(auth, customToken);
          setStep('newpwd');
        } catch (otpErr: any) {
          const msg = otpErr instanceof RegistrationActionError ? otpErr.message : 'Code incorrect';
          setError(msg);
        } finally {
          setLoading(false);
        }
        return;
      }

      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée'); setLoading(false); return; }
        await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
      } else {
        if (!confirmResult) { setError('Session expirée'); setLoading(false); return; }
        await confirmResult.confirm(code);
      }
      setStep('newpwd');
    } catch (err: any) {
      if (err?.code === 'auth/invalid-verification-code') setError('Code incorrect');
      else if (err?.code === 'auth/code-expired') setError('Code expiré, renvoyez');
      else setError('Erreur de vérification');
    } finally { setLoading(false); }
  };

  const handleNewPassword = async () => {
    if (newPassword.length < 6) { setError('6 caractères minimum'); return; }
    if (newPassword !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true); setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Session invalide');
      await updatePassword(user, newPassword);
      setStep('success');
    } catch (err: any) {
      setError("Impossible de mettre à jour le mot de passe");
    } finally { setLoading(false); }
  };

  // ── Succès ──────────────────────────────────────────
  if (step === 'success') return (
    <div className="min-h-screen" style={{ background: '#F7F0E2' }}>
      <AuthHero variant="bloom" title="Nouveau mot de passe" subtitle="Votre accès est prêt, comme une graine qui vient de lever" compact />
      <AuthSheet>
        <div className="text-center">
          <Link
            href="/auth/login"
            className="mt-2 block w-full rounded-xl py-3.5 text-center text-[0.95rem] font-semibold text-[#F7F0E2] transition"
            style={{ background: '#C6572A' }}
          >
            Se connecter
          </Link>
        </div>
      </AuthSheet>
    </div>
  );

  // ── Nouveau mot de passe ──────────────────────────
  if (step === 'newpwd') return (
    <div className="min-h-screen" style={{ background: '#F7F0E2' }}>
      <AuthHero variant="sprout" title="Nouveau mot de passe" subtitle="Choisissez-en un que vous seul connaissez" compact />
      <AuthSheet>
        {error && <AuthErrorBanner>{error}</AuthErrorBanner>}
        <div className="space-y-5">
          <LineField
            label="Nouveau mot de passe"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" strokeLinecap="round" />
              </svg>
            }
            type={showPwd ? 'text' : 'password'}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            trailing={
              <button type="button" onClick={() => setShowPwd(!showPwd)} style={{ color: '#14172E80' }}>
                {showPwd ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            }
          />
          <LineField
            label="Confirmer le mot de passe"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            type={showPwd ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="mt-7">
          <PrimaryButton onClick={handleNewPassword} disabled={loading}>
            {loading ? 'Mise à jour…' : 'Mettre à jour'}
          </PrimaryButton>
        </div>
      </AuthSheet>
    </div>
  );

  // ── OTP ───────────────────────────────────────────
  if (step === 'otp') return (
    <div className="min-h-screen" style={{ background: '#F7F0E2' }}>
      <div id="recaptcha-container" />
      <AuthHero variant="signal" title="Un code en chemin" subtitle={`Envoyé par SMS au ${toE164(phone)}`} compact />
      <AuthSheet>
        <BackRow onClick={() => { setStep('phone'); setOtp(['', '', '', '', '', '']); setError(''); }} />

        {error && <AuthErrorBanner>{error}</AuthErrorBanner>}

        <OtpCells
          digits={otp}
          refs={otpRefs}
          onChange={handleOtpChange}
          onKeyDown={handleOtpKeyDown}
          onPaste={handleOtpPaste}
        />

        <PrimaryButton onClick={verifyOTP} disabled={loading || otp.join('').length < 6}>
          {loading ? 'Vérification…' : 'Confirmer'}
        </PrimaryButton>

        <div className="mt-4 text-center">
          {resendCooldown > 0 ? (
            <p className="text-sm" style={{ color: '#14172E66' }}>
              Renvoyer dans <span className="font-semibold">{resendCooldown}s</span>
            </p>
          ) : (
            <button onClick={sendOTP} disabled={loading} className="text-sm font-medium" style={{ color: '#C6572A' }}>
              Renvoyer
            </button>
          )}
        </div>
      </AuthSheet>
    </div>
  );

  // ── Saisie numéro ─────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#F7F0E2' }}>
      <div id="recaptcha-container" />
      <AuthHero variant="welcome" title="Mot de passe oublié" subtitle="Entrez votre numéro pour recevoir un code par SMS" />
      <AuthSheet>
        {error && <AuthErrorBanner>{error}</AuthErrorBanner>}

        <LineField
          label="Numéro de téléphone"
          icon={
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          prefix="+221"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="77 000 00 00"
        />

        <div className="mt-7">
          <PrimaryButton onClick={sendOTP} disabled={loading}>
            {loading ? 'Envoi…' : 'Envoyer le code SMS'}
          </PrimaryButton>
        </div>

        <p className="mt-6 text-center text-sm" style={{ color: '#14172E99' }}>
          <AuthLink href="/auth/login">← Retour à la connexion</AuthLink>
        </p>
      </AuthSheet>
    </div>
  );
}
