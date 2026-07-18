'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  updatePassword,
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
import { MessageSquare, ArrowLeft, Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';

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

  const setupRecaptcha = () => {
    if (recaptchaRef.current) { recaptchaRef.current.clear(); recaptchaRef.current = null; }
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
  };

  const sendOTP = async () => {
    if (!phone) { setError('Saisissez votre numéro'); return; }
    setError(''); setLoading(true);
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

  const wrapperClass = "min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4";
  const cardClass = "bg-white rounded-3xl shadow-xl w-full max-w-sm p-8";

  // ── Succès ──────────────────────────────────────────
  if (step === 'success') return (
    <div className={wrapperClass}>
      <div className={`${cardClass} text-center`}>
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
          <CheckCircle size={36} className="text-green-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">Mot de passe mis à jour</h2>
        <p className="text-sm text-gray-500 mb-6">Vous pouvez maintenant vous connecter</p>
        <Link href="/auth/login" className="block w-full text-center bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition">
          Se connecter
        </Link>
      </div>
    </div>
  );

  // ── Nouveau mot de passe ──────────────────────────
  if (step === 'newpwd') return (
    <div className={wrapperClass}>
      <div className={cardClass}>
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-3">
            <Lock size={24} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Nouveau mot de passe</h2>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">{error}</div>}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nouveau mot de passe</label>
          <div className="relative">
            <input type={showPwd ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)}
              placeholder="••••••••" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500 pr-11" />
            <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-3 text-gray-400">
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer</label>
          <input type={showPwd ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
            placeholder="••••••••" className="w-full border border-gray-200 rounded-xl px-4 py-3 outline-none focus:border-green-500" />
        </div>
        <button onClick={handleNewPassword} disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50">
          {loading ? 'Mise à jour...' : 'Mettre à jour'}
        </button>
      </div>
    </div>
  );

  // ── OTP ───────────────────────────────────────────
  if (step === 'otp') return (
    <div className={wrapperClass}>
      <div id="recaptcha-container" />
      <div className={cardClass}>
        <button onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-3">
            <MessageSquare size={24} className="text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">Code SMS</h2>
          <p className="text-sm text-gray-500 mt-1">Envoyé au <span className="font-semibold">{toE164(phone)}</span></p>
        </div>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">{error}</div>}
        <div className="flex justify-center gap-2 mb-6" onPaste={handleOtpPaste}>
          {otp.map((digit, i) => (
            <input key={i} ref={el => { otpRefs.current[i] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={e => handleOtpChange(i, e.target.value)}
              onKeyDown={e => handleOtpKeyDown(i, e)}
              className={`w-11 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all py-3 ${digit ? 'border-green-500 bg-green-50 text-green-700' : 'border-gray-200 focus:border-green-400'}`}
            />
          ))}
        </div>
        <button onClick={verifyOTP} disabled={loading || otp.join('').length < 6}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mb-3">
          {loading ? 'Vérification...' : 'Confirmer'}
        </button>
        <div className="text-center">
          {resendCooldown > 0
            ? <p className="text-sm text-gray-400">Renvoyer dans <span className="font-semibold">{resendCooldown}s</span></p>
            : <button onClick={sendOTP} disabled={loading} className="text-sm text-green-600 hover:text-green-700 font-medium">Renvoyer</button>
          }
        </div>
      </div>
    </div>
  );

  // ── Saisie numéro ─────────────────────────────────
  return (
    <div className={wrapperClass}>
      <div id="recaptcha-container" />
      <div className={cardClass}>
        <div className="text-center mb-8">
          <span className="text-5xl">🔑</span>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Mot de passe oublié</h1>
          <p className="text-gray-500 text-sm mt-1">Entrez votre numéro pour recevoir un SMS</p>
        </div>
        {error && <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200">{error}</div>}
        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">Numéro de téléphone</label>
          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:border-green-500 focus-within:ring-2 focus-within:ring-green-100">
            <span className="px-3 text-xs font-semibold text-gray-500 bg-gray-50 border-r border-gray-200 py-3">+221</span>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="77 000 00 00" className="flex-1 px-3 py-3 outline-none text-sm" />
          </div>
        </div>
        <button onClick={sendOTP} disabled={loading}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-60 flex items-center justify-center gap-2">
          <MessageSquare size={16} />
          {loading ? 'Envoi...' : 'Envoyer le code SMS'}
        </button>
        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/auth/login" className="text-green-600 font-semibold hover:text-green-700">← Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}
