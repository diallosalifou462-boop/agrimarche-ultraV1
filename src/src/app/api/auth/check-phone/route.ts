import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// ============================================================
// Vérifie si un numéro correspond déjà à un compte, SANS envoyer de SMS
// ni toucher à otp_codes/Infobip. Utilisé par le flow Orange (Firebase
// Phone Auth natif/web), qui n'appelle jamais /api/otp/send : sans ce
// contrôle, il n'y avait aucun moyen de bloquer AVANT l'envoi du SMS
// natif :
//   - une réinscription sur un numéro déjà connu (finit en erreur
//     Firebase brute "provider-already-linked" côté client) ;
//   - un "mot de passe oublié" sur un numéro jamais inscrit (créait un
//     compte fantôme dès la confirmation du code, Firebase Phone Auth ne
//     vérifiant pas l'existence préalable d'un compte).
//
// Même paramètre `purpose` que /api/otp/send, pour rester cohérent entre
// les deux flows (custom Free/Expresso et natif Orange).
// ============================================================

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

export async function POST(req: NextRequest) {
  try {
    const { phone, purpose } = await req.json();
    const phoneE164 = toE164Senegal(String(phone || ''));

    if (!phoneE164) {
      return NextResponse.json(
        { error: 'Numéro invalide' },
        { status: 400, headers: CORS_HEADERS }
      );
    }
    if (purpose !== 'register' && purpose !== 'reset') {
      return NextResponse.json(
        { error: "Paramètre 'purpose' invalide" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const app = getAdminApp();
    const adminAuth = getAuth(app);

    let accountExists = true;
    try {
      await adminAuth.getUserByPhoneNumber(phoneE164);
    } catch {
      accountExists = false;
    }

    if (purpose === 'register' && accountExists) {
      return NextResponse.json(
        { error: 'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».' },
        { status: 409, headers: CORS_HEADERS }
      );
    }

    if (purpose === 'reset' && !accountExists) {
      return NextResponse.json(
        { error: "Aucun compte n'est associé à ce numéro." },
        { status: 404, headers: CORS_HEADERS }
      );
    }

    return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[auth/check-phone] Erreur:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
