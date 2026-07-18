'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
} from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { Capacitor } from '@capacitor/core';

// ─── Attend que le pont natif Capacitor soit prêt ─────
// Sur certains démarrages, window.Capacitor s'injecte avec
// un léger retard après le premier rendu. Sans cette attente,
// isNativePlatform() peut répondre "false" par erreur, même
// dans l'APK, et faire basculer à tort sur le flow web/reCAPTCHA.
async function waitForNativeBridge(timeoutMs = 1500): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (Capacitor.isNativePlatform()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return Capacitor.isNativePlatform();
}
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { Eye, EyeOff, Lock, User, Phone, Truck, Shield, MapPin, Map, Home, CheckCircle, ArrowLeft, MessageSquare } from 'lucide-react';

// ─── Régions & Départements ───────────────────────────────
const SENEGAL_REGIONS = [
  "Dakar", "Thiès", "Saint-Louis", "Diourbel", "Louga", "Fatick",
  "Kaolack", "Kaffrine", "Tambacounda", "Kédougou", "Ziguinchor",
  "Sédhiou", "Kolda", "Matam",
] as const;
type SenegalRegion = typeof SENEGAL_REGIONS[number];

const DEPARTMENTS_BY_REGION: Record<SenegalRegion, string[]> = {
  "Dakar":        ["Dakar","Guédiawaye","Keur Massar","Pikine","Rufisque"],
  "Thiès":        ["Mbour","Thiès","Tivaouane"],
  "Saint-Louis":  ["Dagana","Podor","Saint-Louis"],
  "Diourbel":     ["Bambey","Diourbel","Mbacké"],
  "Louga":        ["Kébémer","Linguère","Louga"],
  "Fatick":       ["Fatick","Foundiougne","Gossas"],
  "Kaolack":      ["Guinguinéo","Kaolack","Nioro du Rip"],
  "Kaffrine":     ["Birkilane","Kaffrine","Koungheul","Malem-Hodar"],
  "Tambacounda":  ["Bakel","Goudiry","Koumpentoum","Tambacounda"],
  "Kédougou":     ["Kédougou","Salemata","Saraya"],
  "Ziguinchor":   ["Bignona","Oussouye","Ziguinchor"],
  "Sédhiou":      ["Bounkiling","Goudomp","Sédhiou"],
  "Kolda":        ["Kolda","Médina Yoro Foulah","Vélingara"],
  "Matam":        ["Kanel","Matam","Ranérou Ferlo"],
};

// ─── Formatage numéro → E.164 Sénégal ────────────────────
function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('221')) return `+${digits}`;
  if (digits.length === 9) return `+221${digits}`;
  return `+${digits}`;
}

type Step = 'form' | 'otp' | 'success';

export default function RegisterPage() {
  const router = useRouter();
  const { signUp, user, loading: authLoading, suppressAutoProfileRef } = useAuth();
  const [isClient, setIsClient] = useState(false);

  // ─── Étapes ───────────────────────────────────────────
  const [step, setStep] = useState<Step>('form');

  // ─── Form data ────────────────────────────────────────
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    password: '',
    confirmPassword: '',
    region: '' as SenegalRegion | '',
    departement: '',
    commune: '',
    quartier: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  // ─── OTP ──────────────────────────────────────────────
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmationResult | null>(null);
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // ─── UI state ─────────────────────────────────────────
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const isNativeRef = useRef(false);

  useEffect(() => { setIsClient(true); }, []);

  // 🔍 DEBUG TEMPORAIRE — s'affiche dès l'ouverture de la page,
  // pas besoin de remplir le formulaire. À retirer après diagnostic.
  useEffect(() => {
    console.log('=== [DEBUG] Diagnostic Capacitor (au chargement) ===');
    console.log('[DEBUG] Capacitor.getPlatform():', Capacitor.getPlatform());
    console.log('[DEBUG] Capacitor.isNativePlatform():', Capacitor.isNativePlatform());
    console.log('[DEBUG] typeof window.Capacitor:', typeof (window as any).Capacitor);
    console.log('[DEBUG] window.Capacitor object:', (window as any).Capacitor);
    console.log('[DEBUG] window.location.href:', window.location.href);
    console.log('[DEBUG] navigator.userAgent:', navigator.userAgent);
    console.log('=====================================================');
  }, []);

  useEffect(() => {
    if (isClient && user && !authLoading) router.push('/');
  }, [user, authLoading, router, isClient]);

  // Cooldown timer pour renvoi OTP
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(v => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // ─── Bypass reCAPTCHA en local (dev only, flow web) ───
  // Double condition (NODE_ENV + hostname) pour ne JAMAIS
  // désactiver la vérif en prod web. N'affecte pas l'APK,
  // qui utilise désormais le plugin natif ci-dessus.
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
  // Remplace le flow reCAPTCHA web par la vérif native
  // (Play Integrity), plus fiable dans une WebView.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const codeSentSub = FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
      setVerificationId(event.verificationId);
      setStep('otp');
      setResendCooldown(60);
      setLoading(false);
    });

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
      setError(event.message || "Impossible d'envoyer le SMS. Vérifiez le numéro.");
      setLoading(false);
    });

    // Auto-vérification Android (SMS Retriever) : le code
    // est parfois validé automatiquement sans saisie manuelle
    const completedSub = FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
      try {
        if (event.verificationCode) setOtp(event.verificationCode.split(''));
        await finalizeRegistration();
      } catch (err) {
        console.error('[DEBUG] finalizeRegistration a échoué (auto-vérif Android):', err);
        // L'utilisateur pourra toujours saisir/valider le code manuellement
      }
    });

    return () => {
      codeSentSub.then(l => l.remove());
      failedSub.then(l => l.remove());
      completedSub.then(l => l.remove());
    };
  }, []);

  // ─── reCAPTCHA invisible ──────────────────────────────
  const setupRecaptcha = () => {
    if (recaptchaRef.current) {
      recaptchaRef.current.clear();
      recaptchaRef.current = null;
    }
    recaptchaRef.current = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
    });
  };

  // ─── Envoi OTP ────────────────────────────────────────
  const sendOTP = async () => {
    setError('');
    setLoading(true);
    try {
      const phoneE164 = toE164(formData.phone);

      // Attend activement le pont natif (contourne le timing bug)
      const isNative = await waitForNativeBridge();
      isNativeRef.current = isNative;

      // 🔍 DEBUG TEMPORAIRE — à retirer une fois le diagnostic fait
      console.log('[DEBUG] Capacitor.getPlatform():', Capacitor.getPlatform());
      console.log('[DEBUG] waitForNativeBridge() résultat:', isNative);
      console.log('[DEBUG] typeof window.Capacitor:', typeof (window as any).Capacitor);
      console.log('[DEBUG] window.location.href:', window.location.href);

      if (isNative) {
        // APK Android/iOS : vérification native, pas de reCAPTCHA.
        // La suite (setStep('otp'), etc.) est gérée par le
        // listener 'phoneCodeSent' ci-dessus.
        await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phoneE164 });
      } else {
        // Web (navigateur/dev) : flow classique + reCAPTCHA
        setupRecaptcha();
        const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaRef.current!);
        setConfirmResult(result);
        setStep('otp');
        setResendCooldown(60);
        setLoading(false);
      }
    } catch (err: any) {
      console.error(err);
      if (err?.code === 'auth/invalid-phone-number') {
        setError('Numéro de téléphone invalide');
      } else if (err?.code === 'auth/too-many-requests') {
        setError('Trop de tentatives. Réessayez plus tard.');
      } else {
        setError("Impossible d'envoyer le SMS. Vérifiez le numéro.");
      }
      setLoading(false);
    }
  };

  // ─── Validation du formulaire avant envoi OTP ─────────
  const handleFormSubmit = async (e: React.FormEvent) => {
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
    if (!formData.phone.trim()) {
      setError('Veuillez saisir votre numéro de téléphone');
      return;
    }
    if (!formData.region || !formData.departement) {
      setError('Veuillez sélectionner votre région et département');
      return;
    }
    if (!formData.commune.trim()) {
      setError('Veuillez indiquer votre commune');
      return;
    }
    if (!agreeTerms) {
      setError('Vous devez accepter les conditions générales');
      return;
    }
    // Active la suspension AVANT toute connexion Firebase, pour éliminer
    // toute course avec onAuthStateChanged (voir useAuth.ts). Relâché par
    // signUp() en cas de succès, ou ici même si l'utilisateur abandonne.
    suppressAutoProfileRef.current = true;
    await sendOTP();
  };

  // ─── Saisie OTP (6 cases) ─────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    const paste = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (paste.length === 6) {
      setOtp(paste.split(''));
      otpRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  // ─── Création du compte (commune aux 2 flows) ─────────
  // Attend que le plugin capacitor-firebase ait fini sa synchro auto
  // native → JS (auth.currentUser) après une connexion native, sans
  // jamais rejouer le code SMS nous-mêmes (voir incident précédent).
  const waitForJsAuthSync = async (timeoutMs = 3000) => {
    const start = Date.now();
    while (!auth.currentUser && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 150));
    }
  };

  const finalizeRegistration = async () => {
    if (isNativeRef.current) await waitForJsAuthSync();
    const syntheticEmail = `${formData.phone.replace(/\D/g, '')}@agrimarche.sn`;
    await signUp(syntheticEmail, formData.password, formData.name, {
      phone: formData.phone,
      phoneVerified: true,
      region: formData.region,
      departement: formData.departement,
      commune: formData.commune.trim(),
      quartier: formData.quartier.trim() || '',
    });
    setStep('success');
    setTimeout(() => router.push('/auth/login'), 2500);
  };

  // ─── Vérification OTP + création compte ───────────────
  const handleVerifyOTP = async () => {
    const code = otp.join('');
    if (code.length < 6) { setError('Entrez le code à 6 chiffres'); return; }

    setLoading(true);
    setError('');
    try {
      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
        // Le plugin capacitor-firebase synchronise déjà automatiquement
        // la session vers le SDK JS (skipNativeAuth n'est pas activé ici),
        // pas besoin de rejouer le credential manuellement.
      } else {
        if (!confirmResult) { setError('Session expirée, renvoyez le code'); setLoading(false); return; }
        await confirmResult.confirm(code);
      }

      await finalizeRegistration();
    } catch (err: any) {
      console.error('[DEBUG] Erreur handleVerifyOTP:', err);
      if (err?.code === 'auth/invalid-verification-code') {
        setError('Code incorrect, vérifiez le SMS');
      } else if (err?.code === 'auth/code-expired') {
        setError('Code expiré, renvoyez un nouveau SMS');
      } else {
        setError("Erreur lors de la vérification");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-green-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement...</p>
        </div>
      </div>
    );
  }

  const availableDepartments = formData.region ? DEPARTMENTS_BY_REGION[formData.region] : [];

  // ═══════════════════════════════════════════════════════
  // ÉCRAN OTP
  // ═══════════════════════════════════════════════════════
  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div id="recaptcha-container" />
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <button
              onClick={() => { suppressAutoProfileRef.current = false; setStep('form'); setOtp(['','','','','','']); setError(''); }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
            >
              <ArrowLeft size={16} /> Retour
            </button>

            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl mb-4 shadow-lg">
                <MessageSquare size={28} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800">Vérification SMS</h2>
              <p className="text-gray-500 text-sm mt-2">
                Code envoyé au <span className="font-semibold text-gray-700">{toE164(formData.phone)}</span>
              </p>
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">{error}</div>
            )}

            {/* 6 cases OTP */}
            <div className="flex justify-center gap-3 mb-8" onPaste={handleOtpPaste}>
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
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl outline-none transition-all ${
                    digit
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 focus:border-green-400'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleVerifyOTP}
              disabled={loading || otp.join('').length < 6}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 mb-4"
            >
              {loading ? 'Vérification...' : 'Confirmer le code'}
            </button>

            <div className="text-center">
              {resendCooldown > 0 ? (
                <p className="text-sm text-gray-400">
                  Renvoyer dans <span className="font-semibold text-gray-600">{resendCooldown}s</span>
                </p>
              ) : (
                <button
                  onClick={sendOTP}
                  disabled={loading}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Renvoyer le code SMS
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // ÉCRAN SUCCÈS
  // ═══════════════════════════════════════════════════════
  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-4">
            <CheckCircle size={40} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Compte créé !</h2>
          <p className="text-gray-500 text-sm">Numéro vérifié avec succès. Redirection vers la connexion…</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // FORMULAIRE PRINCIPAL
  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      <div id="recaptcha-container" />
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* HEADER */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow-lg ring-4 ring-green-100 mb-4 overflow-hidden">
              <Image src="/logo.png" alt="AgriMarché" width={80} height={80} className="w-full h-full object-cover rounded-full" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Inscription</h2>
            <p className="text-gray-500 text-sm mt-1">Créez votre compte AgriMarché</p>
          </div>

          {/* SMS badge */}
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-2 mb-5">
            <MessageSquare size={14} className="text-green-600 flex-shrink-0" />
            <p className="text-xs text-green-700">Vérification par SMS obligatoire</p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm">{error}</div>
            )}

            {/* NOM */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nom complet</label>
              <div className="relative">
                <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" required
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Jean Dupont"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* TÉLÉPHONE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numéro de téléphone <span className="text-green-600 text-xs font-normal">(reçoit le code SMS)</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded">+221</span>
                <input
                  type="tel" required
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="77 000 00 00"
                  className="w-full pl-16 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* RÉGION */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Région</label>
              <div className="relative">
                <MapPin size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  required
                  value={formData.region}
                  onChange={e => setFormData({ ...formData, region: e.target.value as SenegalRegion, departement: '' })}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none appearance-none bg-white"
                >
                  <option value="">Sélectionnez une région</option>
                  {SENEGAL_REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            {/* DÉPARTEMENT */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Département</label>
              <div className="relative">
                <Map size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <select
                  required
                  disabled={!formData.region}
                  value={formData.departement}
                  onChange={e => setFormData({ ...formData, departement: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 outline-none appearance-none bg-white disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">{formData.region ? 'Sélectionnez un département' : "Choisissez d'abord une région"}</option>
                  {availableDepartments.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>

            {/* COMMUNE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commune</label>
              <div className="relative">
                <Home size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text" required
                  value={formData.commune}
                  onChange={e => setFormData({ ...formData, commune: e.target.value })}
                  placeholder="Ex : Sangalkam, Mbour…"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* QUARTIER (optionnel) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quartier <span className="text-gray-400">(optionnel)</span>
              </label>
              <div className="relative">
                <Home size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={formData.quartier}
                  onChange={e => setFormData({ ...formData, quartier: e.target.value })}
                  placeholder="Ex : Médina, Liberté 6…"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* MOT DE PASSE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'} required
                  value={formData.password}
                  onChange={e => setFormData({ ...formData, password: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* CONFIRM MOT DE PASSE */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmer le mot de passe</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'} required
                  value={formData.confirmPassword}
                  onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:border-green-500 focus:ring-2 focus:ring-green-200 outline-none"
                />
              </div>
            </div>

            {/* CGU */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={agreeTerms} onChange={e => setAgreeTerms(e.target.checked)} className="w-4 h-4 rounded border-gray-300" />
              <span className="text-sm text-gray-600">
                J'accepte les <Link href="/legal/terms" className="text-green-600 hover:underline">conditions générales</Link>
              </span>
            </label>

            {/* BOUTON → ENVOYER OTP */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <MessageSquare size={16} />
              {loading ? 'Envoi du SMS...' : 'Recevoir le code par SMS'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Déjà un compte ?{' '}
            <Link href="/auth/login" className="text-green-600 font-semibold hover:text-green-700">Se connecter</Link>
          </p>

          <div className="mt-6 pt-4 border-t border-gray-100 flex justify-center gap-4 text-xs text-gray-400">
            <div className="flex items-center gap-1"><Truck size={11} /><span>Livraison rapide</span></div>
            <div className="flex items-center gap-1"><Shield size={11} /><span>Paiement sécurisé</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
