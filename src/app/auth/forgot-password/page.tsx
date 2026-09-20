'use client';

import { useState, useRef, useEffect, FormEvent } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  ConfirmationResult,
  updatePassword,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { ensureMainAccountAfterPhoneCode } from '@/lib/auth/phoneSession';
import { Capacitor } from '@capacitor/core';
import { detectCarrier } from '@/lib/carrier';
import { apiUrl } from '@/lib/api-config';
import { resetPasswordSendOtp, resetPasswordVerifyOtp, RegistrationActionError } from '@/lib/registrationActions';
import { PENDING_FCM_TOKEN_KEY } from '@/hooks/useFCMToken';
import { listenForOtpPush } from '@/lib/auth/otpPushListener';

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
import { MessageSquare, Bell, ArrowLeft, Lock, CheckCircle, Eye, EyeOff } from 'lucide-react';

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return `+${digits}`;
}

// Token push de CET appareil, s'il a déjà été capté (voir useFCMToken.ts).
// Le serveur ne l'utilise que s'il appartient bien au compte ; sinon il
// prend le dernier appareil connu du compte, ou envoie un SMS.
function readPendingPushToken(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.localStorage.getItem(PENDING_FCM_TOKEN_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw)?.token || undefined;
  } catch {
    return undefined;
  }
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
  // Free/Yas et Expresso : session côté functions + canal réellement utilisé
  const [resetSessionId, setResetSessionId] = useState<string | null>(null);
  const [otpChannel, setOtpChannel] = useState<'push' | 'sms'>('sms');
  // Un deuxième appui (ou un appui pendant la validation automatique)
  // rejouerait le même code sur une session déjà consommée : le serveur le
  // refuserait et « Code incorrect » s'afficherait à tort.
  const verifyingRef = useRef(false);

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

  const startCooldown = () => {
    setResendCooldown(60);
    const t = setInterval(() => setResendCooldown(v => { if (v <= 1) clearInterval(t); return v - 1; }), 1000);
  };

  // ─── Free/Yas et Expresso : functions resetPasswordSendOtp ─────────
  // ⚠️ CHANGEMENT (20/09) : notification push abandonnée ici aussi (voir
  // le même changement dans auth/register/page.tsx) — toujours SMS
  // Infobip direct, aucun pushToken transmis. Un seul chemin fiable.
  const sendResetCode = async () => {
    setError(''); setLoading(true);
    try {
      // forceSms: true est INDISPENSABLE ici — contrairement à l'inscription,
      // le serveur de réinitialisation retrouve tout seul un token push
      // connu du compte (resolvePushToken côté functions/src/passwordReset.ts)
      // même si le client n'en envoie pas ; sans ce flag il retenterait le
      // push quand même.
      const { sessionId, channel } = await resetPasswordSendOtp(toE164(phone), { forceSms: true });
      setResetSessionId(sessionId);
      setOtpChannel(channel === 'push' ? 'push' : 'sms');
      setOtp(['', '', '', '', '', '']);
      setStep('otp');
      startCooldown();
    } catch (err: any) {
      setError(err instanceof RegistrationActionError ? err.message : "Erreur lors de l'envoi du code");
    } finally {
      setLoading(false);
    }
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
        await sendResetCode();
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
    const wasComplete = otp.join('').length === 6;
    const next = [...otp]; next[i] = val.slice(-1); setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
    // Valide au PASSAGE de 5 à 6 chiffres, jamais sur un champ déjà rempli :
    // sinon corriger un seul chiffre consommerait une tentative par frappe.
    const full = next.join('');
    if (!wasComplete && full.length === 6) void verifyFnRef.current(full);
  };
  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) { setOtp(paste.split('')); otpRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  // `codeOverride` : code arrivé par notification push, validé sans attendre
  // le prochain rendu React (otp.join('') renverrait encore l'ancienne valeur).
  const verifyOTP = async (codeOverride?: string) => {
    if (loading || verifyingRef.current) return;
    verifyingRef.current = true;
    const code = (codeOverride ?? otp.join('')).replace(/\D/g, '');
    if (code.length < 6) { setError('Code à 6 chiffres requis'); verifyingRef.current = false; return; }
    setLoading(true); setError('');
    try {
      if (useCustomOtpRef.current) {
        // Free/Yas et Expresso : vérification par la function
        // resetPasswordVerifyOtp, qui renvoie un customToken pour ouvrir la
        // session Firebase et pouvoir ensuite appeler updatePassword().
        if (!resetSessionId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        try {
          const { customToken } = await resetPasswordVerifyOtp(resetSessionId, code);
          await signInWithCustomToken(auth, customToken);
        } catch (err: any) {
          setError(err instanceof RegistrationActionError ? err.message : 'Code incorrect');
          setLoading(false);
          return;
        }
        setStep('newpwd');
        setLoading(false);
        return;
      }

      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée'); setLoading(false); return; }
        await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
      } else {
        if (!confirmResult) { setError('Session expirée'); setLoading(false); return; }
        await confirmResult.confirm(code);
      }
      // Orange : le nouveau mot de passe doit aller sur le VRAI compte, pas
      // sur un compte « téléphone seul » vide que Firebase aurait créé.
      await ensureMainAccountAfterPhoneCode(phone);
      setStep('newpwd');
    } catch (err: any) {
      if (err?.code === 'auth/invalid-verification-code') setError('Code incorrect');
      else if (err?.code === 'auth/code-expired') setError('Code expiré, renvoyez');
      else setError(err?.code ? 'Erreur de vérification' : (err?.message || 'Erreur de vérification'));
    } finally { setLoading(false); verifyingRef.current = false; }
  };

  // ─── Validation AUTOMATIQUE du code reçu par notification ──────────
  // Même principe que sur l'inscription : le serveur place le code dans le
  // data payload du push (voir otpChannel.ts), l'app le remplit et le valide
  // sans aucune saisie. verifyOTP est recréé à chaque rendu : on le garde
  // dans un ref pour que l'écouteur, branché une seule fois, appelle
  // toujours la version à jour (resetSessionId notamment).
  const verifyFnRef = useRef(verifyOTP);
  verifyFnRef.current = verifyOTP;
  const autoTriedRef = useRef<string | null>(null);
  const [autoCode, setAutoCode] = useState<string | null>(null);
  const [autoVerifying, setAutoVerifying] = useState(false);

  useEffect(() => {
    // Branché dès le montage : les écouteurs FCM ne rejouent pas une
    // notification déjà arrivée, donc un écouteur posé trop tard rate le code.
    const stop = listenForOtpPush((event) => {
      setOtp(event.code.split(''));
      setError('');
      setAutoCode(event.code);
    }, 'reset_otp');
    return stop;
  }, []);

  useEffect(() => {
    if (!autoCode || !resetSessionId || !useCustomOtpRef.current) return;
    if (autoTriedRef.current === autoCode) return;
    autoTriedRef.current = autoCode;
    setAutoVerifying(true);
    void verifyFnRef.current(autoCode).finally(() => {
      setAutoVerifying(false);
      setAutoCode(null);
    });
  }, [autoCode, resetSessionId]);

  const handleNewPassword = async () => {
    if (newPassword.length < 6) { setError('6 caractères minimum'); return; }
    if (newPassword !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return; }
    setLoading(true); setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Session invalide');
      // ⚠️ Rafraîchit le jeton avant l'opération sensible : updatePassword()
      // exige une connexion « récente » côté Firebase, et le temps passé à
      // taper le nouveau mot de passe peut suffire à faire expirer cette
      // fraîcheur, même juste après une vérification par code réussie.
      await user.getIdToken(true);
      await updatePassword(user, newPassword);
      setStep('success');
    } catch (err: any) {
      // ⚠️ Le message générique masquait la vraie cause à l'écran ET dans
      // les rapports du terrain — impossible de diagnostiquer un « Impossible
      // de mettre à jour le mot de passe » qui pouvait être n'importe quoi.
      // On affiche maintenant le code technique, et un message clair pour
      // le seul cas qui a une action concrète (recommencer la vérification).
      console.error('[ForgotPassword] updatePassword a échoué:', err?.code, err?.message);
      if (err?.code === 'auth/requires-recent-login') {
        setError('Votre session a expiré pendant la saisie. Revérifiez votre code pour continuer.');
        setStep('otp');
      } else if (err?.code === 'auth/weak-password') {
        setError('Mot de passe trop faible : utilisez au moins 6 caractères.');
      } else if (err?.code === 'auth/network-request-failed') {
        setError('Connexion internet interrompue. Réessayez.');
      } else {
        setError(`Impossible de mettre à jour le mot de passe${err?.code ? ` (${err.code})` : ''}. Réessayez.`);
      }
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
        <button onClick={() => { setStep('phone'); setOtp(['','','','','','']); setError(''); setResetSessionId(null); setOtpChannel('sms'); }}
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-green-100 rounded-full mb-3">
            {otpChannel === 'push'
              ? <Bell size={24} className="text-green-600" />
              : <MessageSquare size={24} className="text-green-600" />}
          </div>
          <h2 className="text-xl font-bold text-gray-800">
            {otpChannel === 'push' ? 'Vérification par notification' : 'Code SMS'}
          </h2>
          {otpChannel === 'push'
            ? <p className="text-sm text-gray-500 mt-1">Code envoyé par notification sur votre appareil Sunu Mëñëf</p>
            : <p className="text-sm text-gray-500 mt-1">Envoyé au <span className="font-semibold">{toE164(phone)}</span></p>}
          {/* Le code reçu par notification se remplit et se valide seul : on le
              dit, sinon l'utilisateur cherche à taper un code qui s'écrit tout
              seul sous ses yeux. */}
          {otpChannel === 'push' && !autoVerifying && (
            <p className="text-green-600 text-xs mt-2">Aucune saisie nécessaire : le code se validera automatiquement.</p>
          )}
          {autoVerifying && (
            <p className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium mt-3">
              <span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
              Code reçu — vérification…
            </p>
          )}
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
        {/* () => verifyOTP() et non verifyOTP : sinon React passerait
            l'événement souris comme `codeOverride`. */}
        <button onClick={() => verifyOTP()} disabled={loading || otp.join('').length < 6}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 mb-3">
          {loading ? 'Vérification...' : 'Confirmer'}
        </button>
        <div className="text-center">
          {resendCooldown > 0
            ? <p className="text-sm text-gray-400">Renvoyer dans <span className="font-semibold">{resendCooldown}s</span></p>
            : <button onClick={sendOTP} disabled={loading} className="text-sm text-green-600 hover:text-green-700 font-medium">Renvoyer</button>
          }
          {useCustomOtpRef.current && otpChannel === 'push' && (
            <button onClick={() => sendResetCode()} disabled={loading}
              className="block mx-auto mt-3 text-sm text-gray-500 hover:text-gray-700 underline">
              Pas reçu la notification ? Recevoir le code par SMS
            </button>
          )}
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
          <BrandLogo size={88} className="mx-auto" />
          <h1 className="text-2xl font-bold text-gray-900 mt-3">Mot de passe oublié</h1>
          <p className="text-gray-500 text-sm mt-1">Entrez votre numéro pour recevoir un code</p>
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
          {loading ? 'Envoi...' : 'Envoyer le code'}
        </button>
        <p className="text-center text-sm text-gray-500 mt-6">
          <Link href="/auth/login" className="text-green-600 font-semibold hover:text-green-700">← Retour à la connexion</Link>
        </p>
      </div>
    </div>
  );
}
