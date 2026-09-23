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
  PhoneAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { ensureMainAccountAfterPhoneCode } from '@/lib/auth/phoneSession';
import { Capacitor } from '@capacitor/core';
import { detectCarrier } from '@/lib/carrier';
import { apiUrl } from '@/lib/api-config';
import { resetPasswordSendOtp, resetPasswordVerifyOtp, RegistrationActionError } from '@/lib/registrationActions';
import { PENDING_FCM_TOKEN_KEY } from '@/hooks/useFCMToken';
import { listenForOtpPush } from '@/lib/auth/otpPushListener';
import AuthDiagPanel, { authDiag, errInfo, userInfo, AUTH_DIAG_BUILD } from '@/components/AuthDiagPanel';
import { onAuthStateChanged } from 'firebase/auth';

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

  // 🔍 DIAGNOSTIC (23/09) : trace chaque changement de session Firebase
  // (SDK web). Si l'utilisateur disparaît, on voit À QUEL MOMENT.
  useEffect(() => {
    authDiag('info', 'Page ouverte', { build: AUTH_DIAG_BUILD, natif: Capacitor.isNativePlatform(), plateforme: Capacitor.getPlatform(), user: userInfo(auth.currentUser) });
    return onAuthStateChanged(auth, (u) => {
      authDiag(u ? 'info' : 'warn', 'onAuthStateChanged', userInfo(u));
    });
  }, []);

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
      authDiag('ok', 'SMS envoyé (natif)', { verificationId: event.verificationId ? `${event.verificationId.slice(0, 8)}… (${event.verificationId.length})` : 'VIDE' });
      setVerificationId(event.verificationId);
      verificationIdRef.current = event.verificationId;
      setStep('otp');
      setResendCooldown(60);
      setLoading(false);
    });

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
      authDiag('error', 'Échec envoi SMS (natif)', event);
      setError(event.message || "Impossible d'envoyer le SMS");
      setLoading(false);
    });

    // ⚠️ FIX (23/09) : auto-lecture du SMS sur Android. On ne confirme plus
    // le code côté NATIF (FirebaseAuthentication.confirmVerificationCode) :
    // ça connectait l'utilisateur dans la couche native seulement, jamais
    // dans le SDK web → auth.currentUser restait null ("user0=false") et la
    // session de vérification était consommée, donc la saisie manuelle
    // échouait ensuite ("Erreur de vérification"). On passe par le même
    // chemin que la saisie manuelle : verifyOTP → connexion SDK web.
    const completedSub = FirebaseAuthentication.addListener('phoneVerificationCompleted', (event) => {
      const code = event.verificationCode;
      authDiag('info', 'Auto-vérification Android', { codeLu: !!code });
      if (!code) return; // pas de code lisible : l'utilisateur saisit le SMS
      setOtp(code.split(''));
      void verifyFnRef.current(code);
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
      authDiag('info', 'Envoi du code', { numero: phoneE164, operateur: carrier });
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
      authDiag(checkRes.ok ? 'ok' : 'error', 'check-phone', { status: checkRes.status, reponse: checkJson });
      if (!checkRes.ok) {
        setError(checkJson?.error || "Aucun compte n'est associé à ce numéro.");
        setLoading(false);
        return;
      }

      const isNative = await waitForNativeBridge();
      isNativeRef.current = isNative;
      authDiag('info', `Chemin ${isNative ? 'NATIF' : 'WEB'} (Orange / Firebase Phone Auth)`);
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
      authDiag('error', 'Exception envoi SMS', errInfo(err));
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
    authDiag('info', 'Validation du code', { chemin: useCustomOtpRef.current ? 'custom (Free/Expresso)' : isNativeRef.current ? 'natif→SDK web' : 'web', longueur: code.length });
    try {
      if (useCustomOtpRef.current) {
        // Free/Yas et Expresso : vérification par la function
        // resetPasswordVerifyOtp, qui renvoie un customToken pour ouvrir la
        // session Firebase et pouvoir ensuite appeler updatePassword().
        if (!resetSessionId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        try {
          const { customToken } = await resetPasswordVerifyOtp(resetSessionId, code);
          await signInWithCustomToken(auth, customToken);
          authDiag('ok', 'signInWithCustomToken OK', userInfo(auth.currentUser));
        } catch (err: any) {
          authDiag('error', 'Échec code custom', errInfo(err));
          setError(err instanceof RegistrationActionError ? err.message : 'Code incorrect');
          setLoading(false);
          return;
        }
        setStep('newpwd');
        setLoading(false);
        return;
      }

      if (isNativeRef.current) {
        // ⚠️ FIX (23/09) : l'envoi du SMS se fait en natif (Play Integrity /
        // APNs), mais la CONNEXION doit se faire dans le SDK web, sinon
        // auth.currentUser reste null et updatePassword() est impossible
        // ("Session invalide [user0=false sess=NON custom=false]").
        const vid = verificationIdRef.current ?? verificationId;
        if (!vid) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await signInWithCredential(auth, PhoneAuthProvider.credential(vid, code));
        authDiag('ok', 'signInWithCredential OK', userInfo(auth.currentUser));
      } else {
        if (!confirmResult) { setError('Session expirée'); setLoading(false); return; }
        await confirmResult.confirm(code);
        authDiag('ok', 'confirmResult.confirm OK', userInfo(auth.currentUser));
      }
      // Orange : le nouveau mot de passe doit aller sur le VRAI compte, pas
      // sur un compte « téléphone seul » vide que Firebase aurait créé.
      authDiag('info', 'ensureMainAccount — avant', userInfo(auth.currentUser));
      await ensureMainAccountAfterPhoneCode(phone);
      authDiag(auth.currentUser ? 'ok' : 'error', 'ensureMainAccount — après', userInfo(auth.currentUser));
      setStep('newpwd');
    } catch (err: any) {
      authDiag('error', 'Échec validation du code', errInfo(err));
      if (err?.code === 'auth/invalid-verification-code') setError('Code incorrect');
      else if (err?.code === 'auth/code-expired') setError('Code expiré, renvoyez');
      else if (err?.code === 'auth/session-expired') setError('Code expiré, renvoyez');
      // 🔍 DIAGNOSTIC TEMPORAIRE (23/09) : affiche le code Firebase réel.
      else setError(`Erreur de vérification${err?.code ? ` (${err.code})` : err?.message ? ` (${err.message})` : ''}`);
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
    authDiag(auth.currentUser ? 'info' : 'error', 'Nouveau mot de passe — session', userInfo(auth.currentUser));
    try {
      let user = auth.currentUser;
      // ⚠️ FIX (22/09) : observé en production — `auth.currentUser` peut
      // redevenir null entre l'écran du code et celui du nouveau mot de
      // passe (session en mémoire perdue au changement de vue), même quand
      // `signInWithCustomToken` avait bien réussi juste avant (sinon on ne
      // serait jamais arrivé sur cet écran). `resetPasswordVerifyOtp` est
      // volontairement rejouable tant que la session serveur existe encore
      // (voir le commentaire « Rejouable » dans passwordReset.ts) : on s'en
      // sert ici pour ré-authentifier silencieusement avant d'abandonner,
      // plutôt que de renvoyer l'utilisateur revalider son code pour rien.
      // 🔍 DIAGNOSTIC TEMPORAIRE (22/09) : à retirer une fois la cause
      // trouvée. On trace précisément où ça coince, affiché à l'écran
      // faute d'accès à la console de l'appareil.
      let diag = `user0=${!!auth.currentUser}`;
      if (!user && useCustomOtpRef.current && resetSessionId) {
        const lastCode = otp.join('').replace(/\D/g, '');
        diag += ` sess=oui code=${lastCode.length}`;
        if (lastCode.length === 6) {
          try {
            const { customToken } = await resetPasswordVerifyOtp(resetSessionId, lastCode);
            diag += ` verify=ok`;
            await signInWithCustomToken(auth, customToken);
            user = auth.currentUser;
            diag += ` signin=${!!user}`;
          } catch (retryErr: any) {
            diag += ` retryErr=${retryErr?.code || retryErr?.message || 'inconnu'}`;
          }
        }
      } else if (!user) {
        diag += ` sess=${resetSessionId ? 'oui' : 'NON'} custom=${useCustomOtpRef.current}`;
      }
      if (!user) throw new Error(`Session invalide [${diag}]`);
      // ⚠️ Rafraîchit le jeton avant l'opération sensible : updatePassword()
      // exige une connexion « récente » côté Firebase, et le temps passé à
      // taper le nouveau mot de passe peut suffire à faire expirer cette
      // fraîcheur, même juste après une vérification par code réussie.
      await user.getIdToken(true);
      authDiag('ok', 'getIdToken(true) OK');
      await updatePassword(user, newPassword);
      authDiag('ok', 'updatePassword OK — mot de passe changé');
      setStep('success');
    } catch (err: any) {
      // ⚠️ Le message générique masquait la vraie cause à l'écran ET dans
      // les rapports du terrain — impossible de diagnostiquer un « Impossible
      // de mettre à jour le mot de passe » qui pouvait être n'importe quoi.
      // On affiche maintenant le code technique, et un message clair pour
      // le seul cas qui a une action concrète (recommencer la vérification).
      console.error('[ForgotPassword] updatePassword a échoué:', err?.code, err?.message);
      authDiag('error', 'Échec mise à jour mot de passe', errInfo(err));
      if (err?.code === 'auth/requires-recent-login') {
        setError('Votre session a expiré pendant la saisie. Revérifiez votre code pour continuer.');
        setStep('otp');
      } else if (err?.code === 'auth/weak-password') {
        setError('Mot de passe trop faible : utilisez au moins 6 caractères.');
      } else if (err?.code === 'auth/network-request-failed') {
        setError('Connexion internet interrompue. Réessayez.');
      } else {
        // 🔍 DIAGNOSTIC TEMPORAIRE (22/09) : affiche err.message (contient le
        // détail [...] posé plus haut pour "Session invalide") quand il n'y a
        // pas de code Firebase standard — à retirer une fois la cause trouvée.
        const detail = err?.code || err?.message || '';
        setError(`Impossible de mettre à jour le mot de passe${detail ? ` (${detail})` : ''}. Réessayez.`);
      }
    } finally { setLoading(false); }
  };

  const wrapperClass = "min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4";
  const cardClass = "bg-white rounded-3xl shadow-xl w-full max-w-sm p-8";

  // ── Succès ──────────────────────────────────────────
  if (step === 'success') return (
    <div className={wrapperClass}>
      <AuthDiagPanel />
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
      <AuthDiagPanel />
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
      <AuthDiagPanel />
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
      <AuthDiagPanel />
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
