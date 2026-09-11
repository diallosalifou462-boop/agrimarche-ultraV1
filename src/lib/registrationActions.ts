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
  constructor(message: string, code: string, techCode?: string) {
    super(message);
    this.code = code;
    this.techCode = techCode;
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
  channel: 'push' | 'sms';
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

export async function resendRegistrationCode(sessionId: string, pushToken?: string): Promise<{ channel: 'push' | 'sms' }> {
  const fn = httpsCallable<{ sessionId: string; pushToken?: string }, { channel: 'push' | 'sms' }>(functions, 'registrationResend');
  try {
    const res = await callWithRetry(() => fn({ sessionId, pushToken }));
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
}

export async function verifyRegistrationCode(
  sessionId: string,
  code: string,
  profile: RegistrationProfile,
): Promise<{ uid: string; customToken: string }> {
  const fn = httpsCallable<{ sessionId: string; code: string; profile: RegistrationProfile }, { uid: string; customToken: string }>(
    functions,
    'registrationVerify',
  );
  try {
    // Pas de retry ici : un retry sur une vérification déjà partiellement
    // traitée pourrait consommer une 2ᵉ tentative pour rien (voir le
    // statut 'verifying' documenté dans registration.ts).
    const res = await fn({ sessionId, code, profile });
    return res.data;
  } catch (e) {
    throw toActionError(e);
  }
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
export async function resetPasswordSendOtp(phone: string): Promise<OtpSessionResponse> {
  const fn = httpsCallable<{ phone: string }, OtpSessionResponse>(functions, 'resetPasswordSendOtp');
  try {
    const res = await callWithRetry(() => fn({ phone }));
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
