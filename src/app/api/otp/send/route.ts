import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

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

// ============================================================
// ORANGE SMS API (Sénégal) — couvre Orange, Free ET Expresso,
// contrairement à Africa's Talking qui ne couvre pas le Sénégal.
// Doc : https://developer.orange.com/apis/sms-sn
//
// Variables d'environnement nécessaires :
//   ORANGE_SMS_CLIENT_ID       — depuis le portail Orange Developer
//   ORANGE_SMS_CLIENT_SECRET   — idem
//   ORANGE_SMS_SENDER_NUMBER   — le numéro Orange SN utilisé pour créer
//                                 l'app (format : 221XXXXXXXXX, sans +)
// ============================================================

// Jeton mis en cache en mémoire (process Next.js) pour éviter de
// renégocier un token à chaque envoi — Orange recommande de le
// réutiliser jusqu'à 60 min.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getOrangeAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.value;
  }

  const clientId = process.env.ORANGE_SMS_CLIENT_ID;
  const clientSecret = process.env.ORANGE_SMS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('ORANGE_SMS_CLIENT_ID ou ORANGE_SMS_CLIENT_SECRET manquant');
  }

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://api.orange.com/oauth/v3/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échec obtention token Orange (${res.status}): ${text}`);
  }

  const json = await res.json();
  const ttlMs = Math.max((json.expires_in ?? 3600) - 300, 60) * 1000;
  cachedToken = { value: json.access_token, expiresAt: Date.now() + ttlMs };
  return cachedToken.value;
}

async function sendOrangeSms(recipientE164: string, message: string) {
  const senderNumber = process.env.ORANGE_SMS_SENDER_NUMBER; // ex: 221771234567
  if (!senderNumber) {
    throw new Error('ORANGE_SMS_SENDER_NUMBER manquant');
  }

  const accessToken = await getOrangeAccessToken();
  const senderTel = `tel:+${senderNumber}`;
  const url = `https://api.orange.com/smsmessaging/v1/outbound/${encodeURIComponent(senderTel)}/requests`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      outboundSMSMessageRequest: {
        address: `tel:${recipientE164}`,
        senderAddress: senderTel,
        outboundSMSTextMessage: { message },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Échec envoi SMS Orange (${res.status}): ${text}`);
  }

  return res.json();
}

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    const phoneE164 = toE164Senegal(String(phone || ''));
    if (!phoneE164) {
      return NextResponse.json(
        { error: 'Numéro invalide' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const app = getAdminApp();
    const db = getFirestore(app);
    const docRef = db.collection('otp_codes').doc(phoneE164);

    const existing = await docRef.get();
    const now = Date.now();
    if (existing.exists) {
      const data = existing.data()!;
      const windowStart = data.windowStart ?? 0;
      const sendsInWindow = data.sendsInWindow ?? 0;
      if (now - windowStart < SEND_WINDOW_MS && sendsInWindow >= MAX_SENDS_PER_WINDOW) {
        return NextResponse.json(
          { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
          { status: 429, headers: CORS_HEADERS }
        );
      }
    }

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 chiffres
    const data = existing.exists ? existing.data()! : {};
    const windowStart = (data.windowStart && now - data.windowStart < SEND_WINDOW_MS)
      ? data.windowStart
      : now;
    const sendsInWindow = (data.windowStart && now - data.windowStart < SEND_WINDOW_MS)
      ? (data.sendsInWindow ?? 0) + 1
      : 1;

    await docRef.set({
      code,
      expiresAt: now + CODE_TTL_MS,
      attempts: 0,
      windowStart,
      sendsInWindow,
    });

    const result = await sendOrangeSms(
      phoneE164,
      `Votre code AgriMarché : ${code} (valable 5 minutes)`
    );
    console.log('[otp/send] SMS envoyé via Orange SMS API:', JSON.stringify(result));

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[otp/send] Erreur:', error);
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
