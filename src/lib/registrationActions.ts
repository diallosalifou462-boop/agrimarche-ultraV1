/**
 * registrationActions.ts
 * ============================================================
 * Remplace les anciens appels fetch(apiUrl('/api/otp/send')) et
 * fetch(apiUrl('/api/otp/verify')) par les nouvelles Cloud Functions
 * callables (functions/src/registration.ts et orangeRegistration.ts) :
 * hash+pepper du code (au lieu du stockage en clair), anti-fraude,
 * verrou d'unicité du numéro, App Check.
 *
 * Utilisé par app/auth/register/page.tsx et app/seller/register/page.tsx
 * pour le flux Free/Yas et Expresso (voir src/lib/carrier.ts — Orange
 * passe par Firebase Phone Auth côté client, puis complete_orange).
 */

import { getFunctions, httpsCallable } from 'firebase/functions';
import { app } from '@/lib/firebase/firebase';
import { callWithRetry } from '@/lib/callWithRetry';

const functions = getFunctions(app, 'us-central1'); // même région que functions/src/index.ts

export class RegistrationActionError extends Error {
  code: string; // code Firebase (ex: 'functions/already-exists')
  techCode?: string; // code technique renvoyé par le serveur (ex: 'PHONE_ALREADY_USED')
  details?: any; // HttpsError.details (ex: pushDiag, lu par PushDiagnosticPanel)
  constructor(message: string, code: string, techCode?: string, details?: any) {
    super(message);
    this.code = code;
    this.techCode = techCode;
    this.details = details;
  }
}

// Traduit une erreur Firebase Functions en RegistrationActionError avec le
// message déjà localisé en français par errorMessages.ts côté serveur —
// pas de re-traduction ici, une seule source de vérité.
function toActionError(e: any): RegistrationActionError {
  const localized = e?.details?.message;
  return new RegistrationActionError(
    localized || 'Une erreur est survenue. Réessaie.',
    e?.code || 'functions/internal',
    e?.message,
    e?.details,
  );
}

export interface RegistrationProfile {
  password: string;
  name: string;
  region: string;
  departement: string;
  commune: string;
  quartier: string;
  role?: 'client' | 'seller';
  platform?: string;
}

interface StartResponse {
  sessionId: string;
  channel: 'push' | 'sms' | 'sms_infobip';
  // Détail du push côté serveur, lu par PushDiagnosticPanel.
  pushDiag?: import('@/lib/pushDiagnostics').ServerPushDiag;
  maxAttempts: number;
  otpTtlSeconds: number;
}

export async function startRegistration(phone: string, pushToken?: string): Promise<StartResponse> {
  const fn = httpsCallable<{ phone: string; pushToken?: string }, StartResponse>(functions, 'registrationStart');
  try {
    const res = await callWithRetry(() => fn({ phone, pushToken }));
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

// forceSms : « Pas reçu la notification ? Recevoir le code par SMS ».
export async function resendRegistrationCode(
  sessionId: string,
  pushToken?: string,
  opts: { forceSms?: boolean } = {},
): Promise<{ channel: 'push' | 'sms' }> {
  const fn = httpsCallable<{ sessionId: string; pushToken?: string; forceSms?: boolean }, { channel: 'push' | 'sms' }>(
    functions,
    'registrationResend',
  );
  try {
    const res = await callWithRetry(() => fn({ sessionId, pushToken: opts.forceSms ? undefined : pushToken, forceSms: opts.forceSms }));
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

export async function verifyRegistrationCode(
  sessionId: string,
  code: string,
  profile: RegistrationProfile,
  // customToken peut manquer : le compte est alors créé, mais le serveur n'a
  // pas pu signer le jeton (droit IAM). L'app se rabat sur mot de passe.
): Promise<{ uid: string; customToken?: string }> {
  const fn = httpsCallable<{ sessionId: string; code: string; profile: RegistrationProfile }, { uid: string; customToken?: string }>(
    functions,
    'registrationVerify',
  );
  // ⚠️ Retry ajouté le 19/09 — et c'est SÛR, contrairement au commentaire
  // qui figurait ici avant. registrationVerify est idempotent côté serveur
  // depuis le correctif des sessions bloquées :
  //   - session déjà 'verified'  → renvoie { alreadyDone: true, uid } et
  //     resigne un customToken, sans consommer de tentative ;
  //   - session en 'verifying'   → renvoie VERIFICATION_IN_PROGRESS
  //     ('aborted'), sans consommer de tentative non plus ;
  //   - un code FAUX renvoie 'invalid-argument' (INVALID_CODE) — jamais
  //     retenté, justement pour ne pas brûler les tentatives.
  // Sans ce retry, une coupure réseau d'une seconde APRÈS la création du
  // compte affichait « Erreur lors de la vérification » alors que le compte
  // existait : l'utilisateur recommençait, et son numéro était « déjà
  // utilisé ». C'était l'une des impasses les plus dures du parcours.
  const RETRY_TECH_CODES = new Set(['VERIFICATION_IN_PROGRESS']);
  const RETRY_FIREBASE_CODES = new Set([
    'functions/unavailable',
    'functions/deadline-exceeded',
    'functions/internal',
    'functions/aborted',
  ]);

  let lastError: any;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fn({ sessionId, code, profile });
      return res.data;
    } catch (e: any) {
      lastError = e;
      const techCode = String(e?.message ?? '');
      const retryable =
        RETRY_TECH_CODES.has(techCode) ||
        RETRY_FIREBASE_CODES.has(e?.code ?? '') ||
        (typeof navigator !== 'undefined' && !navigator.onLine);
      if (!retryable || attempt === 4) break;
      // La création du compte côté serveur prend typiquement moins d'une
      // seconde : on attend un peu plus à chaque tour (1 s, 2 s, 3,5 s)
      // pour la laisser finir plutôt que de marteler la fonction.
      await new Promise((r) => setTimeout(r, [1000, 2000, 3500][attempt - 1] ?? 3500));
    }
  }
  throw toActionError(lastError);
}

// Orange : appelé après signInWithPhoneNumber / FirebaseAuthentication
// côté client (le compte Firebase Auth existe déjà, avec un uid signé).
export async function completeOrangeRegistration(
  profile: RegistrationProfile,
  pushToken?: string,
): Promise<{ uid: string; alreadyRegistered: boolean }> {
  const fn = httpsCallable<{ profile: RegistrationProfile; pushToken?: string }, { uid: string; alreadyRegistered: boolean }>(
    functions,
    'completeOrangeRegistration',
  );
  try {
    const res = await callWithRetry(() => fn({ profile, pushToken }));
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

// ============================================================
// Connexion (2ᵉ facteur) et réinitialisation de mot de passe
// — remplacent /api/otp/send et /api/otp/verify pour login/page.tsx
// et forgot-password/page.tsx (Free/Yas et Expresso uniquement ; Orange
// reste sur Firebase Phone Auth côté client, inchangé).
// Voir functions/src/loginOtp.ts et functions/src/passwordReset.ts.
// ============================================================

interface OtpSessionResponse {
  sessionId: string;
  otpTtlSeconds: number;
}

// Connexion : aucun paramètre envoyé — request.auth suffit côté serveur,
// qui va lire le numéro sur users/{uid}. Doit être appelé APRÈS un
// signInWithEmailAndPassword réussi (mot de passe déjà vérifié), jamais
// avant, sinon l'utilisateur n'est pas encore authentifié.
export async function loginSendOtp(): Promise<OtpSessionResponse> {
  const fn = httpsCallable<Record<string, never>, OtpSessionResponse>(functions, 'loginSendOtp');
  try {
    const res = await callWithRetry(() => fn({}));
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

export async function loginVerifyOtp(sessionId: string, code: string): Promise<{ verified: boolean; customToken: string }> {
  const fn = httpsCallable<{ sessionId: string; code: string }, { verified: boolean; customToken: string }>(
    functions,
    'loginVerifyOtp',
  );
  try {
    // Pas de retry : même raison que verifyRegistrationCode ci-dessus.
    const res = await fn({ sessionId, code });
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

// Réinitialisation : logique INVERSE de startRegistration — un numéro
// qui n'appartient à aucun compte est refusé (ACCOUNT_NOT_FOUND) plutôt
// qu'accepté.
// Le code part par notification push d'abord (appareil déjà connu du
// compte), puis par SMS Infobip en secours. `forceSms` : l'utilisateur
// n'a pas reçu la notification et redemande explicitement un SMS.
export interface ResetOtpSessionResponse extends OtpSessionResponse {
  channel?: 'push' | 'sms_infobip';
}

export async function resetPasswordSendOtp(
  phone: string,
  opts: { pushToken?: string; forceSms?: boolean } = {},
): Promise<ResetOtpSessionResponse> {
  const fn = httpsCallable<{ phone: string; pushToken?: string; forceSms?: boolean }, ResetOtpSessionResponse>(
    functions,
    'resetPasswordSendOtp',
  );
  const payload: { phone: string; pushToken?: string; forceSms?: boolean } = { phone };
  if (opts.pushToken) payload.pushToken = opts.pushToken;
  if (opts.forceSms) payload.forceSms = true;
  try {
    const res = await callWithRetry(() => fn(payload));
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

export async function resetPasswordVerifyOtp(sessionId: string, code: string): Promise<{ uid: string; customToken: string }> {
  const fn = httpsCallable<{ sessionId: string; code: string }, { uid: string; customToken: string }>(
    functions,
    'resetPasswordVerifyOtp',
  );
  try {
    const res = await fn({ sessionId, code });
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}
