'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import BrandLogo from '@/components/BrandLogo';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  signInWithCustomToken,
  ConfirmationResult, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { Capacitor } from '@capacitor/core';
import { detectCarrier } from '@/lib/carrier';
import { apiUrl } from '@/lib/api-config';
import { resolveLoginEmails } from '@/lib/auth/phoneSession';
import { startRegistration, verifyRegistrationCode, completeOrangeRegistration, RegistrationActionError, resendRegistrationCode } from '@/lib/registrationActions';
import { useFCMToken, PENDING_FCM_TOKEN_KEY } from '@/hooks/useFCMToken';
import { listenForOtpPush } from '@/lib/auth/otpPushListener';
import { saveRegistrationDraft, readRegistrationDraft, clearRegistrationDraft } from '@/lib/auth/registrationDraft';
import { haptic } from '@/lib/feedback';
import PushDiagnosticPanel from '@/components/PushDiagnosticPanel';
import { pushDiag, maskToken, type ServerPushDiag } from '@/lib/pushDiagnostics';

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
import { Eye, EyeOff, Lock, User, Phone, Truck, Shield, MapPin, Map, Home, CheckCircle, ArrowLeft, MessageSquare, Bell } from 'lucide-react';

// ─── Token FCM capté avant l'inscription (voir useFCMToken.ts) ────────
// useFCMToken écrit ce token en localStorage dès qu'il est obtenu, sans
// attendre qu'un compte existe (deviceTokens/{token} côté Firestore).
// On le relit ici, best-effort : en son absence, startRegistration()
// retombe simplement sur l'envoi par SMS Infobip.
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

// Page où revenir après l'inscription (ex : /checkout quand on crée son
// compte au moment de commander). Chemins internes uniquement. Le compte est
// déjà connecté à la fin de l'inscription : inutile de repasser par la connexion.
function getSafeRedirect(): string {
  if (typeof window === 'undefined') return '/main/products';
  const r = new URLSearchParams(window.location.search).get('redirect');
  return r && r.startsWith('/') && !r.startsWith('//') ? r : '/main/products';
}

export default function RegisterPage() {
  const router = useRouter();
  const { user, loading: authLoading, suppressAutoProfileRef } = useAuth();
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
  const [sessionId, setSessionId] = useState<string | null>(null); // session du nouveau backend (Free/Yas, Expresso)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null);

  // ─── UI state ─────────────────────────────────────────
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const isNativeRef = useRef(false);
  // true si on utilise le système OTP maison (backend + Infobip) au lieu
  // de Firebase Phone Auth — cas des numéros Free/Yas et Expresso, voir lib/carrier.ts
  const verifyingRef = useRef(false);
  const useCustomOtpRef = useRef(false);
  // Résultat de la DERNIÈRE vérification : true = compte créé, false = refusée
  // (code faux, expiré, session close). Lu par la validation automatique pour
  // rouvrir la saisie manuelle en cas d'échec — sinon l'écran d'attente
  // resterait affiché avec un message d'erreur et aucun moyen d'agir.
  // Un ref et non un état : il est lu dans un .finally(), avant que React
  // n'ait commité le rendu suivant.
  const lastVerifyOkRef = useRef<boolean | null>(null);

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

  // ⚠️ GARDE-FOU (même piège que sur auth/login/page.tsx, voir
  // otpPendingRef) : sur Android/iOS, la vérification du téléphone peut
  // aboutir INSTANTANÉMENT côté natif (SMS Retriever / Play Integrity),
  // ce qui rend `user` non-nul avant même que finalizeRegistration()
  // (completeOrangeRegistration : nom, région, mot de passe, rôle...)
  // ait fini son appel réseau. Sans ce ref, ce useEffect se déclenche
  // dès que Firebase confirme le numéro et propulse l'utilisateur vers
  // '/' (donc vers /main/products via le Splash) AVANT que le compte
  // soit réellement finalisé — l'inscription semble "sauter" une étape.
  const registrationInProgressRef = useRef(false);

  // ─── Capture du token push AVANT la création du compte ────────────
  // Best-effort : on demande la permission dès l'arrivée sur la page,
  // pour laisser le temps à useFCMToken de l'écrire en localStorage
  // (voir readPendingPushToken) avant que l'utilisateur n'ait fini de
  // remplir le formulaire et n'atteigne l'envoi du code.
  //
  // ⚠️ 1 seconde tentative : sur iOS, juste après l'acceptation de la
  // permission, l'enregistrement APNs peut ne pas être encore terminé
  // et getToken() échoue même si l'utilisateur a bien autorisé les
  // notifications (rien à voir avec un refus). On retente donc une
  // deuxième fois après un court délai avant d'abandonner. Si les deux
  // tentatives échouent, on n'insiste pas davantage : startRegistration()
  // retombe simplement sur SMS Infobip, comme prévu.
  const { requestPermission: requestPushPermission } = useFCMToken();
  // ⚠️ FIX (16/09) : toujours appeler la version LA PLUS RÉCENTE de
  // requestPermission. Le useEffect ci-dessous ([] en dépendances) gardait
  // sinon celle du tout premier rendu, figée avec isNative=false.
  const requestPushRef = useRef(requestPushPermission);
  requestPushRef.current = requestPushPermission;
  // Canal réellement utilisé par le serveur, pour l'afficher à l'écran OTP.
  const [otpChannel, setOtpChannel] = useState<'push' | 'sms' | null>(null);
  // Diagnostic renvoyé par le serveur (voir PushDiagnosticPanel).
  const [serverPushDiag, setServerPushDiag] = useState<ServerPushDiag | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Laisse le pont Capacitor s'injecter, sinon on part en branche web.
      const bridge = await waitForNativeBridge();
      pushDiag('platform', 'info', bridge ? 'Pont Capacitor prêt (app native)' : 'Pas de pont Capacitor (navigateur web)');
      if (cancelled) return;
      const first = await requestPushRef.current().catch(() => null);
      if (first || cancelled) return;
      console.warn('[Push] Token non récupéré, nouvelle tentative dans 2s…');
      await new Promise((r) => setTimeout(r, 2000));
      if (cancelled) return;
      const second = await requestPushRef.current().catch(() => null);
      if (!second) {
        console.warn('[Push] Toujours pas de token après 2 tentatives — inscription par SMS.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isClient && user && !authLoading && !registrationInProgressRef.current) {
      router.push(getSafeRedirect());
    }
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

    const failedSub = FirebaseAuthentication.addListener('phoneVerificationFailed', (event: any) => {
      console.error('[DEBUG] phoneVerificationFailed — événement complet:', JSON.stringify(event));
      const detail = event?.code ? ` (code: ${event.code})` : '';
      setError((event.message || "Impossible d'envoyer le SMS. Vérifiez le numéro.") + detail);
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
  // « Renvoyer le code » : on relance la session EXISTANTE (registrationResend)
  // au lieu d'en ouvrir une nouvelle. Une nouvelle session sur le même numéro
  // était refusée par le serveur (« inscription déjà en cours »), donc le
  // bouton échouait toujours.
  const resendOTP = async (forceSms = false) => {
    if (!sessionId) { await sendOTP(); return; }
    setError('');
    setLoading(true);
    try {
      const { channel } = await resendRegistrationCode(sessionId, readPendingPushToken(), { forceSms });
      setOtpChannel(channel === 'push' ? 'push' : 'sms');
      setOtp(['', '', '', '', '', '']);
      setResendCooldown(60);
      // Nouveau code en route : on réarme la validation automatique, sinon
      // les garde-fous du code précédent bloqueraient celui-ci.
      autoCodeRef.current = null;
      autoVerifiedRef.current = null;
      setAutoCode(null);
    } catch (err: any) {
      setError(err instanceof RegistrationActionError ? err.message : "Le code n'a pas pu être renvoyé");
    } finally {
      setLoading(false);
    }
  };

  const sendOTP = async () => {
    setError('');
    setLoading(true);
    try {
      const phoneE164 = toE164(formData.phone);

      // ─── Routage par opérateur ──────────────────────────
      // Firebase Phone Auth (SMS Google) est fiable sur Orange, mais
      // échoue très souvent sur Free/Yas et Expresso au Sénégal. Pour ces
      // deux opérateurs, on passe par notre propre backend OTP (envoi du
      // SMS via Infobip) au lieu de Firebase. Voir src/lib/carrier.ts.
      const carrier = detectCarrier(formData.phone);
      if (carrier === 'free' || carrier === 'expresso') {
        useCustomOtpRef.current = true;
        pushDiag('carrier', 'info', `Opérateur : ${carrier}`, carrier);

        // Le diagnostic réseau détaillé (logOtpAttempt) visait spécifiquement
        // le fetch() brut vers l'ancienne route Vercel /api/otp/send (CORS,
        // ATS, DNS...). Il ne s'applique plus : httpsCallable passe par le
        // SDK Firebase Functions, avec sa propre gestion de transport/retry.
        try {
          // ⚠️ FIX (16/09) : si le token n'est pas encore en localStorage
          // (formulaire rempli très vite, APNs lent sur iOS...), dernière
          // tentative bornée à 5 s avant de se résigner au SMS.
          let pushToken = readPendingPushToken();
          if (pushToken) {
            pushDiag('token', 'ok', 'Token trouvé sur l’appareil au moment de l’envoi', maskToken(pushToken));
          } else {
            pushDiag('send_token', 'warn', 'Pas de token au moment de l’envoi — dernière tentative (5 s max)…');
            const fresh = await Promise.race([
              requestPushRef.current().catch(() => null),
              new Promise<null>((r) => setTimeout(() => r(null), 5000)),
            ]);
            pushToken = fresh || readPendingPushToken();
          }
          pushDiag(
            'send_token',
            pushToken ? 'ok' : 'error',
            pushToken ? 'Token envoyé au serveur (registrationStart)' : 'AUCUN token envoyé au serveur → le code partira par SMS',
            pushToken ? maskToken(pushToken) : undefined,
          );
          console.log('[Push] Token envoyé à registrationStart :', pushToken ? `${pushToken.slice(0, 12)}…` : 'AUCUN → SMS');
          const { sessionId: newSessionId, channel, pushDiag: srv } = await startRegistration(phoneE164, pushToken);
          setOtpChannel(channel === 'push' ? 'push' : 'sms');
          if (srv) {
            setServerPushDiag(srv);
            pushDiag(
              'server',
              srv.pushOk ? 'ok' : srv.pushAttempted ? 'error' : 'warn',
              srv.pushOk
                ? 'Serveur : push accepté par Firebase (FCM)'
                : srv.pushAttempted
                ? 'Serveur : FCM a REFUSÉ le push → SMS envoyé à la place'
                : 'Serveur : aucun token reçu → SMS envoyé',
              srv.errorCode ? `${srv.errorCode}${srv.errorMessage ? ` — ${srv.errorMessage}` : ''}` : undefined,
            );
          } else {
            pushDiag('server', 'warn', `Serveur : canal ${channel} (functions pas encore redéployées, pas de détail)`);
          }
          setSessionId(newSessionId);
          setStep('otp');
          setResendCooldown(60);
          // Brouillon gardé sur l'appareil : si le système décharge l'app
          // avant l'appui sur la notification, on reprendra ici au lieu de
          // repartir d'un formulaire vide. Jamais le mot de passe.
          saveRegistrationDraft({
            sessionId: newSessionId,
            phone: phoneE164,
            name: formData.name,
            region: formData.region,
            departement: formData.departement,
            commune: formData.commune.trim(),
            quartier: formData.quartier.trim(),
            channel: channel === 'push' ? 'push' : 'sms',
          });
          // Préchargement de la page d'arrivée pendant que l'utilisateur
          // attend le code : à la fin, l'affichage est immédiat.
          try { router.prefetch(getSafeRedirect()); } catch { /* best-effort */ }
        } catch (err: any) {
          const msg = err instanceof RegistrationActionError ? err.message : "Erreur lors de l'envoi du code";
          pushDiag('server', 'error', 'registrationStart a échoué', err?.techCode || err?.code || msg);
          if (err?.details?.pushDiag) setServerPushDiag(err.details.pushDiag);
          setError(msg);
        } finally {
          setLoading(false);
        }
        return;
      }
      useCustomOtpRef.current = false;
      pushDiag('carrier', 'warn', `Opérateur : ${carrier} → Firebase Phone Auth (SMS Google, pas de push)`, carrier);

      // ─── Vérif préalable (Orange) ────────────────────────────────
      // Aucun envoi de SMS, aucun coût : bloque une réinscription sur un
      // numéro déjà connu AVANT de lancer Firebase Phone Auth, au lieu de
      // laisser passer le SMS et d'échouer plus tard sur
      // "provider-already-linked" au moment de finaliser le compte.
      const checkRes = await fetch(apiUrl('/api/auth/check-phone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneE164, purpose: 'register' }),
      });
      const checkJson = await checkRes.json().catch(() => null);
      if (!checkRes.ok) {
        setError(checkJson?.error || 'Ce numéro est déjà inscrit.');
        setLoading(false);
        return;
      }

      // ─── Fix : on ne devine plus via un timeout (source du bug
      // "internal error" intermittent sur iOS). On essaie D'ABORD le
      // plugin natif ; on ne bascule sur le flow web/reCAPTCHA que si
      // le plugin natif est réellement indisponible (erreur Capacitor
      // "UNIMPLEMENTED"/"not available"), jamais sur un simple délai.
      const bridgeLikelyNative = Capacitor.isNativePlatform() || (await waitForNativeBridge());
      isNativeRef.current = bridgeLikelyNative;

      console.log('[DEBUG] Capacitor.getPlatform():', Capacitor.getPlatform());
      console.log('[DEBUG] bridgeLikelyNative:', bridgeLikelyNative);

      if (bridgeLikelyNative) {
        try {
          // APK Android/iOS : vérification native, pas de reCAPTCHA.
          // La suite (setStep('otp'), etc.) est gérée par le
          // listener 'phoneCodeSent' ci-dessus.
          await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phoneE164 });
          return;
        } catch (nativeErr: any) {
          const msg = String(nativeErr?.message || nativeErr);
          const pluginUnavailable =
            /not implemented|not available|unimplemented/i.test(msg);
          console.error('[DEBUG] Échec plugin natif:', msg);
          if (!pluginUnavailable) {
            // Vraie erreur Firebase (numéro invalide, quota, etc.) :
            // on la laisse remonter au catch général, PAS de fallback web.
            throw nativeErr;
          }
          // Sinon (plugin réellement absent, ex: build web pur) : on
          // continue vers le flow web ci-dessous.
        }
      }

      // Web (navigateur/dev, ou plugin natif introuvable) : flow
      // classique + reCAPTCHA
      setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, phoneE164, recaptchaRef.current!);
      setConfirmResult(result);
      setStep('otp');
      setResendCooldown(60);
      setLoading(false);
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
    registrationInProgressRef.current = true;
    await sendOTP();
  };

  // ─── Saisie OTP (6 cases) ─────────────────────────────
  const handleOtpChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) otpRefs.current[index + 1]?.focus();
    // Saisie manuelle terminée : on valide sans attendre l'appui sur
    // « Confirmer ». Le code est passé explicitement, donc pas de
    // dépendance au prochain rendu React.
    //
    // ⚠️ Uniquement au PASSAGE de 5 à 6 chiffres. Déclencher dès que les six
    // cases sont pleines ferait partir une tentative à CHAQUE frappe sur un
    // champ déjà rempli — les 5 tentatives autorisées seraient brûlées en
    // corrigeant un seul chiffre.
    const wasComplete = otp.join('').length === 6;
    const full = newOtp.join('');
    if (!wasComplete && full.length === 6) void verifyFnRef.current(full);
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
      void verifyFnRef.current(paste);
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
    // Orange : écrit désormais le profil (+ email/mot de passe pour
    // pouvoir se reconnecter ensuite) côté serveur via l'Admin SDK — voir
    // completeOrangeRegistration dans functions/src/orangeRegistration.ts
    // — au lieu du writeDoc direct côté client (signUp) d'avant, qui
    // dépendait de firestore.rules et ne passait jamais par les mêmes
    // vérifications (unicité du numéro, journalisation) que Free/Expresso.
    await completeOrangeRegistration({
      password: formData.password,
      name: formData.name,
      region: formData.region,
      departement: formData.departement,
      commune: formData.commune.trim(),
      quartier: formData.quartier.trim() || '',
      role: 'client',
    });
    // Le SDK client ne sait pas encore que l'e-mail/mot de passe viennent
    // d'être ajoutés côté serveur (Admin SDK) : on force un rafraîchissement
    // du user local pour que le reste de l'app (ex: affichage de l'email)
    // ne reste pas sur l'ancien état "téléphone seul".
    await auth.currentUser?.reload();
    clearRegistrationDraft();
    void haptic('success');
    setStep('success');
    // On ne relâche le garde-fou qu'ICI, une fois le profil réellement
    // écrit côté serveur — pas avant. La redirection est désormais
    // explicite (/auth/login), plus besoin que le useEffect générique
    // s'en charge.
    registrationInProgressRef.current = false;
    setTimeout(() => router.replace(getSafeRedirect()), 2500);
  };

  // ─── Vérification OTP + création compte ───────────────
  // `codeOverride` : code arrivé par notification push, validé sans attendre
  // le prochain rendu React. Lire otp.join('') juste après setOtp() aurait
  // renvoyé l'ancienne valeur (état figé dans la closure) et fait échouer la
  // validation automatique une fois sur deux.
  const handleVerifyOTP = async (codeOverride?: string) => {
    // Un deuxième appui pendant la vérification renvoie le même code sur une
    // session DÉJÀ consommée : le serveur le refuse et « Code incorrect »
    // s'affiche alors que le compte vient d'être créé.
    if (loading || verifyingRef.current) return;
    verifyingRef.current = true;
    lastVerifyOkRef.current = null;
    const code = (codeOverride ?? otp.join('')).replace(/\D/g, '');
    if (code.length < 6) { setError('Entrez le code à 6 chiffres'); verifyingRef.current = false; return; }

    setLoading(true);
    setError('');
    try {
      if (useCustomOtpRef.current) {
        // Free/Yas et Expresso : vérification + création complète du
        // compte (email synthétique + mot de passe, profil Firestore)
        // côté serveur via l'Admin SDK — voir registrationVerify dans
        // functions/src/registration.ts. On ne rappelle plus signUp()
        // ici : le profil est déjà écrit, il ne reste qu'à établir la
        // session côté client avec le customToken renvoyé.
        if (!sessionId) { setError('Session expirée, renvoyez le code'); setLoading(false); verifyingRef.current = false; return; }
        try {
          const { customToken } = await verifyRegistrationCode(sessionId, code, {
            password: formData.password,
            name: formData.name,
            region: formData.region,
            departement: formData.departement,
            commune: formData.commune.trim(),
            quartier: formData.quartier.trim(),
            role: 'client',
          });
          // Le compte est créé. Si le serveur n'a pas pu signer le jeton de
          // connexion (droit IAM manquant côté Google), on se connecte avec le
          // numéro et le mot de passe qui viennent d'être choisis : l'inscription
          // ne doit JAMAIS échouer alors que le compte existe.
          if (customToken) {
            await signInWithCustomToken(auth, customToken);
          } else {
            let connected = false;
            // ⚠️ FIX (19/09) : `phone` n'existait pas dans cette portée
            // (seul `phoneE164`, local à sendOTP). Ce repli — le seul chemin
            // de connexion quand le serveur n'a pas pu signer de customToken
            // (droit IAM signBlob manquant) — levait donc un ReferenceError
            // attrapé plus bas, et affichait « Code incorrect » alors que le
            // compte venait d'être créé correctement.
            for (const email of await resolveLoginEmails(toE164(formData.phone))) {
              try {
                await signInWithEmailAndPassword(auth, email, formData.password);
                connected = true;
                break;
              } catch { /* format suivant */ }
            }
            if (!connected) {
              lastVerifyOkRef.current = true;
              setError('Compte créé. Connectez-vous avec votre numéro et votre mot de passe.');
              setLoading(false);
              verifyingRef.current = false;
              setTimeout(() => router.replace('/auth/login'), 2500);
              return;
            }
          }
          lastVerifyOkRef.current = true;
          suppressAutoProfileRef.current = false;
          clearRegistrationDraft();
          void haptic('success');
          setStep('success');
          // 1,1 s : juste assez pour voir « Compte créé ! » et comprendre ce
          // qui vient de se passer, assez court pour que l'enchaînement
          // notification → compte → catalogue reste d'un seul geste.
          setTimeout(() => router.replace(getSafeRedirect()), 1100);
        } catch (err: any) {
          lastVerifyOkRef.current = false;
          setError(err instanceof RegistrationActionError ? err.message : 'Code incorrect');
        } finally {
          setLoading(false);
          verifyingRef.current = false;
        }
        return;
      }

      if (isNativeRef.current) {
        if (!verificationId) { setError('Session expirée, renvoyez le code'); setLoading(false); verifyingRef.current = false; return; }
        await FirebaseAuthentication.confirmVerificationCode({ verificationId, verificationCode: code });
        // Le plugin capacitor-firebase synchronise déjà automatiquement
        // la session vers le SDK JS (skipNativeAuth n'est pas activé ici),
        // pas besoin de rejouer le credential manuellement.
      } else {
        if (!confirmResult) { setError('Session expirée, renvoyez le code'); setLoading(false); verifyingRef.current = false; return; }
        await confirmResult.confirm(code);
      }

      await finalizeRegistration();
    } catch (err: any) {
      console.error('[DEBUG] Erreur handleVerifyOTP:', err);
      if (err instanceof RegistrationActionError) {
        setError(err.message);
      } else if (err?.code === 'auth/invalid-verification-code') {
        setError('Code incorrect, vérifiez le SMS');
      } else if (err?.code === 'auth/code-expired') {
        setError('Code expiré, renvoyez un nouveau SMS');
      } else if (err?.code === 'auth/provider-already-linked' || err?.code === 'auth/email-already-in-use') {
        // Flow Orange (Firebase Phone Auth) : ce numéro correspond déjà à
        // un compte existant — même numéro = même utilisateur Firebase —
        // et signUp() tente alors de relier un provider email/mot de passe
        // déjà présent. On remplace l'erreur Firebase brute par un message
        // clair, cohérent avec le blocage déjà en place pour Free/Expresso.
        setError('Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».');
      } else {
        setError("Erreur lors de la vérification");
      }
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  };

  // ─── Validation AUTOMATIQUE du code reçu par notification ──────────
  // « J'appuie sur Envoyer → la notification arrive → je suis dans l'app. »
  // Le serveur place le code dans le data payload du push (voir
  // decideChannelAndSend dans functions/src/registration.ts). Dès qu'il
  // arrive — app ouverte, ou appui sur la notification quand elle est en
  // fond — on remplit les 6 cases et on valide, sans aucune saisie.
  //
  // handleVerifyOTP est recréé à chaque rendu : on le garde dans un ref pour
  // que l'écouteur, branché une seule fois, appelle toujours la version à
  // jour (sinon il capturerait des états périmés : sessionId, formData…).
  const verifyFnRef = useRef(handleVerifyOTP);
  verifyFnRef.current = handleVerifyOTP;
  const autoVerifiedRef = useRef<string | null>(null);
  const [autoVerifying, setAutoVerifying] = useState(false);
  // Code reçu mais pas encore validable : le push peut arriver AVANT que
  // setSessionId() ait été appliqué (le serveur envoie la notification
  // pendant registrationStart, donc avant même que l'appel ne réponde).
  // On le met en attente ici plutôt que de le perdre.
  const [autoCode, setAutoCode] = useState<string | null>(null);
  const autoCodeRef = useRef<string | null>(null);
  // Passe à true quand on renonce à la validation automatique : les 6 cases
  // apparaissent alors. Soit l'utilisateur l'a demandé (« saisir le code
  // moi-même »), soit la notification n'est pas arrivée à temps.
  const [manualEntry, setManualEntry] = useState(false);
  // Repli SMS déclenché tout seul : on le dit une fois, sans en faire un échec.
  const [autoSmsFallback, setAutoSmsFallback] = useState(false);
  const smsFallbackDoneRef = useRef(false);

  // ─── Reprise après déchargement de l'app ───────────────────────────
  // L'utilisateur a demandé son code, quitté l'app, et le système l'a
  // déchargée. Il appuie sur la notification : la WebView redémarre à zéro.
  // Sans ceci il retombait sur un formulaire vide alors que son numéro était
  // déjà réservé côté serveur — l'impasse la plus déroutante du parcours.
  //
  // ⚠️ On ne restaure QUE dans ce cas précis : un code arrive alors qu'aucune
  // session n'est en mémoire. Restaurer dès le montage aurait renvoyé sur
  // l'écran de code un utilisateur qui revenait simplement sur la page pour
  // recommencer — un effet de bord bien pire que le problème résolu.
  const sessionIdRef = useRef<string | null>(null);
  sessionIdRef.current = sessionId;
  const [resumedDraft, setResumedDraft] = useState(false);

  const restoreDraftIfNeeded = (): boolean => {
    if (sessionIdRef.current) return true; // session vivante, rien à restaurer
    const draft = readRegistrationDraft();
    if (!draft) return false;
    useCustomOtpRef.current = true;
    setFormData((prev) => ({
      ...prev,
      name: draft.name,
      phone: draft.phone.replace(/^\+221/, ''),
      region: (draft.region as SenegalRegion) || '',
      departement: draft.departement,
      commune: draft.commune,
      quartier: draft.quartier,
    }));
    setSessionId(draft.sessionId);
    sessionIdRef.current = draft.sessionId;
    setOtpChannel(draft.channel);
    setResumedDraft(true);
    setStep('otp');
    return true;
  };

  useEffect(() => {
    // Branché dès le montage, pas seulement à l'étape OTP : les écouteurs FCM
    // ne rejouent pas les notifications déjà arrivées, donc un écouteur posé
    // trop tard rate le code définitivement.
    const stop = listenForOtpPush((event) => {
      // App relancée par l'appui sur la notification : restaure la session.
      if (!restoreDraftIfNeeded()) return;
      // Ref posé AVANT le setState : le minuteur de repli SMS le lit pour
      // annuler son envoi même si React n'a pas encore appliqué le rendu.
      autoCodeRef.current = event.code;
      setOtp(event.code.split(''));
      setError('');
      setAutoCode(event.code);
      // Petite vibration : l'utilisateur sait que c'est parti sans rien lire.
      void haptic('light');
    }, 'registration_otp');
    return stop;
  }, []);

  // Dès que le code ET la session sont là, on valide sans saisie.
  useEffect(() => {
    if (!autoCode || !sessionId || !useCustomOtpRef.current) return;
    // Reprise après déchargement : le serveur exige le mot de passe pour
    // créer le compte. On attend que l'utilisateur le retape plutôt que
    // d'envoyer une requête qui sera refusée (PASSWORD_REQUIRED) et de lui
    // afficher une erreur incompréhensible.
    if (formData.password.length < 6) return;
    if (autoVerifiedRef.current === autoCode) return; // déjà tenté
    autoVerifiedRef.current = autoCode;
    setAutoVerifying(true);
    // Le code est passé explicitement : aucune dépendance au prochain rendu
    // (otp.join('') renverrait encore l'ancienne valeur ici).
    void verifyFnRef.current(autoCode).finally(() => {
      setAutoVerifying(false);
      setAutoCode(null);
      // Code refusé : on affiche les cases et les boutons de renvoi. Sans
      // ceci l'écran d'attente restait affiché avec un message d'erreur et
      // aucun moyen d'agir — exactement l'impasse qu'on veut supprimer.
      if (lastVerifyOkRef.current === false) {
        setManualEntry(true);
        void haptic('warning');
      }
    });
    // formData.password est dans les dépendances pour le cas « reprise » :
    // le code est déjà là, on n'attend plus que le mot de passe retapé.
  }, [autoCode, sessionId, formData.password]);

  // ─── Repli SMS AUTOMATIQUE ─────────────────────────────────────────
  // Une notification peut ne jamais arriver pour des raisons hors de portée
  // de l'app : notifications coupées au niveau du système, mode économie
  // d'énergie, token périmé côté FCM. Avant, l'écran restait planté avec un
  // petit lien « Pas reçu la notification ? » — c'est-à-dire une impasse
  // pour qui ne le remarque pas. Passé ce délai, on demande nous-mêmes un
  // SMS et on affiche les cases : l'utilisateur n'a rien à comprendre ni à
  // appuyer, il reçoit simplement son code par un autre chemin.
  const PUSH_GRACE_MS = 12000;
  useEffect(() => {
    if (step !== 'otp' || otpChannel !== 'push') return;
    if (!sessionId || !useCustomOtpRef.current) return;
    if (autoCode || autoVerifying || manualEntry) return;
    if (smsFallbackDoneRef.current) return;

    const timer = setTimeout(async () => {
      // Un code vient peut-être d'arriver à la dernière seconde : on lit les
      // refs, pas l'état React, qui peut ne pas être encore appliqué. Sans
      // ça, on enverrait un SMS payant pour rien.
      if (smsFallbackDoneRef.current || autoVerifiedRef.current || autoCodeRef.current) return;
      smsFallbackDoneRef.current = true;
      pushDiag('received', 'warn', `Aucune notification reçue en ${PUSH_GRACE_MS / 1000} s — bascule automatique sur SMS`);
      setAutoSmsFallback(true);
      setManualEntry(true);
      await resendOTP(true);
    }, PUSH_GRACE_MS);
    return () => clearTimeout(timer);
  }, [step, otpChannel, sessionId, autoCode, autoVerifying, manualEntry]);

  // Reprise sans mot de passe : c'est la seule chose que le brouillon ne
  // stocke jamais (un mot de passe en clair dans localStorage serait lisible
  // par n'importe quel script de la WebView). Un champ à retaper, au lieu de
  // tout le formulaire.
  const needsPasswordAgain = resumedDraft && formData.password.length < 6;

  // ─── Les deux états de l'écran de vérification ─────────────────────
  // waitingForPush : le code doit arriver par notification et va se valider
  // tout seul. On ne montre alors NI cases de saisie NI bouton — il n'y a
  // rien à faire, et proposer un champ vide pousse l'utilisateur à chercher
  // un code qu'il n'a pas à taper. C'est là tout l'effet recherché : il
  // appuie une fois, et il se retrouve dans l'application.
  // showOtpBoxes : dès qu'on retombe sur le SMS, qu'il demande à saisir
  // lui-même, ou pendant la validation automatique — où les chiffres qui
  // se remplissent sous ses yeux rendent le geste lisible.
  const waitingForPush =
    otpChannel === 'push' && !manualEntry && !autoVerifying && !autoSmsFallback && !needsPasswordAgain;
  const showOtpBoxes = !waitingForPush;

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

  // Free/Yas et Expresso passent par notre backend OTP, qui tente la
  // notification avant le SMS (voir lib/carrier.ts et decideChannelAndSend).
  // Orange reste sur Firebase Phone Auth, donc SMS Google.
  // Champ vide ou préfixe inconnu → 'unknown', donc on annonce le SMS :
  // c'est le défaut prudent, on ne promet jamais une notification sans
  // savoir qu'elle est possible.
  const detectedCarrier = detectCarrier(formData.phone);
  const expectPushChannel = detectedCarrier === 'free' || detectedCarrier === 'expresso';

  // ═══════════════════════════════════════════════════════
  // ÉCRAN OTP
  // ═══════════════════════════════════════════════════════
  const pushPanel = (
    <PushDiagnosticPanel serverDiag={serverPushDiag} onRetryToken={() => { setServerPushDiag(null); requestPushRef.current(); }} />
  );

  if (step === 'otp') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
        {pushPanel}
        <div id="recaptcha-container" />
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <button
              onClick={() => {
                suppressAutoProfileRef.current = false;
                clearRegistrationDraft();
                setResumedDraft(false);
                setStep('form');
                setOtp(['','','','','','']);
                setError('');
              }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6"
            >
              <ArrowLeft size={16} /> Retour
            </button>

            <div className="text-center mb-8">
              {/* Icône : la cloche qui pulse tant qu'on attend la
                  notification, l'enveloppe dès qu'on est passé au SMS. */}
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 shadow-lg bg-gradient-to-br from-green-600 to-emerald-600 ${waitingForPush ? 'animate-pulse' : ''}`}>
                {waitingForPush
                  ? <Bell size={28} className="text-white" />
                  : <MessageSquare size={28} className="text-white" />}
              </div>
              <h2 className="text-2xl font-bold text-gray-800">
                {autoVerifying
                  ? 'Code reçu'
                  : waitingForPush
                  ? 'Vérification automatique'
                  : 'Vérification SMS'}
              </h2>
              <p className="text-gray-500 text-sm mt-2">
                {waitingForPush
                  ? 'La notification arrive sur cet appareil. Restez ici, il n’y a rien à faire.'
                  : <>Code envoyé au <span className="font-semibold text-gray-700">{toE164(formData.phone)}</span></>}
              </p>
              {autoVerifying && (
                <p className="flex items-center justify-center gap-2 text-green-700 text-sm font-medium mt-3">
                  <span className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  Création de votre compte…
                </p>
              )}
              {/* Bascule automatique vers le SMS : présentée comme une suite
                  normale du parcours, pas comme un échec. */}
              {autoSmsFallback && !autoVerifying && (
                <p className="text-amber-700 bg-amber-50 rounded-xl px-3 py-2 text-xs mt-3">
                  La notification n’est pas arrivée. Nous vous envoyons le code par SMS au {toE164(formData.phone)}.
                </p>
              )}
              {/* Reprise après déchargement de l'app : il ne manque que le
                  mot de passe, le reste du formulaire est déjà rétabli. */}
              {needsPasswordAgain && (
                <p className="text-blue-700 bg-blue-50 rounded-xl px-3 py-2 text-xs mt-3">
                  Nous avons retrouvé votre inscription. Retapez le mot de passe que vous venez de choisir pour terminer.
                </p>
              )}
            </div>

            {/* Reprise : un seul champ à remplir, pas tout le formulaire. */}
            {needsPasswordAgain && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Votre mot de passe</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoFocus
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value, confirmPassword: e.target.value })}
                    placeholder="Au moins 6 caractères"
                    className="w-full pl-10 pr-10 py-3 border-2 border-gray-200 rounded-xl outline-none focus:border-green-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm mb-4">{error}</div>
            )}

            {/* 6 cases OTP — masquées tant que le code doit arriver par
                notification : l'utilisateur n'a rien à saisir, et un champ
                vide devant lui l'inciterait à chercher un code qu'il ne
                doit pas taper. Elles apparaissent dès qu'on passe au SMS,
                sur demande, ou pendant la validation automatique (on y voit
                alors le code se remplir, ce qui rend le geste lisible). */}
            <div className={`${showOtpBoxes ? 'flex' : 'hidden'} justify-center gap-3 mb-8`} onPaste={handleOtpPaste}>
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

            {/* Pendant l'attente de la notification : une barre de
                progression plutôt qu'un bouton désactivé. Rien à appuyer. */}
            {/* Trois points qui rebondissent : animations Tailwind d'origine
                uniquement (animate-bounce), pas de keyframe maison — une
                keyframe déclarée dans un <style jsx> est renommée par le
                scoping et ne serait jamais trouvée par la classe. */}
            {waitingForPush && (
              <div className="flex items-center justify-center gap-2 mb-6" aria-label="En attente de la notification">
                {[0, 150, 300].map((delay) => (
                  <span
                    key={delay}
                    className="w-2.5 h-2.5 rounded-full bg-green-500 animate-bounce"
                    style={{ animationDelay: `${delay}ms` }}
                  />
                ))}
              </div>
            )}

            {/* () => handleVerifyOTP() et non handleVerifyOTP : sinon React
                passerait l'événement souris en premier argument, donc comme
                `codeOverride`. */}
            {showOtpBoxes && (
              <button
                onClick={() => handleVerifyOTP()}
                disabled={loading || otp.join('').length < 6 || needsPasswordAgain}
                className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 mb-4"
              >
                {autoVerifying ? 'Connexion…' : loading ? 'Vérification...' : 'Confirmer le code'}
              </button>
            )}

            <div className="text-center">
              {/* Pendant l'attente du push, on n'affiche ni compte à rebours
                  ni bouton de renvoi : le repli SMS est automatique. Juste
                  une issue pour qui veut saisir le code à la main tout de
                  suite (notification lue sur un autre écran, par exemple). */}
              {waitingForPush ? (
                <button
                  type="button"
                  onClick={() => setManualEntry(true)}
                  className="text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Saisir le code moi-même
                </button>
              ) : resendCooldown > 0 ? (
                <p className="text-sm text-gray-400">
                  Renvoyer dans <span className="font-semibold text-gray-600">{resendCooldown}s</span>
                </p>
              ) : (
                <button
                  onClick={() => (useCustomOtpRef.current ? resendOTP(false) : sendOTP())}
                  disabled={loading}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Renvoyer le code SMS
                </button>
              )}
              {useCustomOtpRef.current && otpChannel === 'push' && !waitingForPush && !autoSmsFallback && (
                <button
                  type="button"
                  onClick={() => resendOTP(true)}
                  disabled={loading}
                  className="block mx-auto mt-2 text-xs text-gray-500 hover:text-gray-700 underline"
                >
                  Pas reçu la notification ? Recevoir le code par SMS
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
        {pushPanel}
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md text-center">
          {/* Halo qui s'étend (animate-ping, d'origine dans Tailwind) : la
              réussite se voit du coin de l'œil, même téléphone à la main. */}
          <div className="relative inline-flex items-center justify-center w-20 h-20 mb-4">
            <span className="absolute inset-0 rounded-full bg-green-200 animate-ping opacity-75" />
            <span className="absolute inset-0 rounded-full bg-green-100" />
            <CheckCircle size={40} className="relative text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Bienvenue, {formData.name.split(' ')[0] || 'bienvenue'} !</h2>
          {/* L'utilisateur est DÉJÀ connecté à ce stade (customToken ou
              mot de passe) : on ne le renvoie plus « vers la connexion »,
              on l'emmène directement dans l'application. */}
          <p className="text-gray-500 text-sm">Votre compte est prêt. Ouverture de Sunu Mëñëf…</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════
  // FORMULAIRE PRINCIPAL
  // ═══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-emerald-50 flex items-center justify-center p-4">
      {pushPanel}
      <div id="recaptcha-container" />
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8">

          {/* HEADER */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-white shadow-lg ring-4 ring-green-100 mb-4 overflow-hidden">
              <BrandLogo size={80} variant="full" className="w-full h-full rounded-full" />
            </div>
            <h2 className="text-2xl font-bold text-gray-800">Inscription</h2>
            <p className="text-gray-500 text-sm mt-1">Créez votre compte Sunu Mëñëf</p>
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

            {/* BOUTON → ENVOYER OTP
                Le libellé ne promet plus « par SMS » : sur Free/Yas et
                Expresso le code arrive par notification et se valide tout
                seul. Annoncer un SMS qui n'arrive pas était la première
                raison de croire que quelque chose avait échoué. */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white py-3 rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {expectPushChannel ? <Bell size={16} /> : <MessageSquare size={16} />}
              {loading ? 'Un instant…' : 'Créer mon compte'}
            </button>

            {/* On dit à l'avance ce qui va se passer : l'enchaînement
                automatique se lit alors comme voulu, et non comme un bug. */}
            <p className="text-center text-xs text-gray-500 mt-3">
              {expectPushChannel
                ? 'Vous recevrez une notification avec votre code. La vérification se fait automatiquement, vous n’avez rien à saisir.'
                : 'Vous recevrez un SMS avec votre code de vérification.'}
            </p>
          </form>

          <p className="text-center text-sm text-gray-600 mt-6">
            Déjà un compte ?{' '}
            <Link href={`/auth/login?redirect=${encodeURIComponent(getSafeRedirect())}`} className="text-green-600 font-semibold hover:text-green-700">Se connecter</Link>
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
