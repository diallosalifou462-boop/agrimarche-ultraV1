import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function getAdminApp() {
  if (getApps().length) return getApps()[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson && serviceAccountJson.trim() !== '') {
    const serviceAccount = JSON.parse(serviceAccountJson);
    return initializeApp({ credential: cert(serviceAccount) });
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin n'est pas configuré.");
  }
  return initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
}

function toE164Senegal(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    if (digits.startsWith('221')) digits = '+' + digits;
    else if (digits.length === 9) digits = '+221' + digits;
    else digits = '+' + digits;
  }
  return /^\+221\d{9}$/.test(digits) ? digits : null;
}

const MAX_ATTEMPTS = 5;

export async function POST(req: NextRequest) {
  try {
    const { phone, code } = await req.json();
    const phoneE164 = toE164Senegal(String(phone || ''));
    const submittedCode = String(code || '').trim();

    if (!phoneE164 || !/^\d{6}$/.test(submittedCode)) {
      return NextResponse.json(
        { error: 'Requête invalide' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const docRef = db.collection('otp_codes').doc(phoneE164);
    const snap = await docRef.get();

    if (!snap.exists) {
      return NextResponse.json(
        { error: "Aucun code n'a été envoyé à ce numéro, ou il a expiré." },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const data = snap.data()!;

    if (Date.now() > data.expiresAt) {
      await docRef.delete();
      return NextResponse.json(
        { error: 'Code expiré. Demandez-en un nouveau.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    if ((data.attempts ?? 0) >= MAX_ATTEMPTS) {
      await docRef.delete();
      return NextResponse.json(
        { error: 'Trop de tentatives incorrectes. Demandez un nouveau code.' },
        { status: 429, headers: CORS_HEADERS }
      );
    }

    if (data.code !== submittedCode) {
      await docRef.update({ attempts: (data.attempts ?? 0) + 1 });
      return NextResponse.json(
        { error: 'Code incorrect.' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // Code correct : on consomme le document (usage unique)
    await docRef.delete();

    // Crée l'utilisateur Firebase Auth s'il n'existe pas déjà pour ce
    // numéro, puis génère un jeton personnalisé pour que le client se
    // connecte avec (signInWithCustomToken). Le reste du flow (écriture
    // du profil Firestore users/, etc.) est ensuite géré normalement
    // côté client par AuthContext.signUp / la logique de login existante,
    // exactement comme pour le flow Firebase Phone Auth natif (Orange).
    const adminAuth = getAuth(app);
    let uid: string;
    try {
      const existingUser = await adminAuth.getUserByPhoneNumber(phoneE164);
      uid = existingUser.uid;
    } catch {
      const newUser = await adminAuth.createUser({ phoneNumber: phoneE164 });
      uid = newUser.uid;
    }

    const customToken = await adminAuth.createCustomToken(uid);

    return NextResponse.json(
      { success: true, customToken, uid },
      { headers: CORS_HEADERS }
    );
  } catch (error: any) {
    console.error('[otp/verify] Erreur:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
