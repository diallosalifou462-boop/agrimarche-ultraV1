import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { logOtpServerAttempt } from '@/lib/otpServerDebugLog';

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
// INFOBIP — passerelle SMS pour l'OTP d'inscription des numéros
// Free (Yas) et Expresso (voir src/lib/carrier.ts pour le routage :
// Orange reste sur Firebase Phone Auth, ces deux-là passent par ici).
//
// ⚠️ Remplace l'ancienne intégration Orange SMS API : Orange ne
// délivrait pas de façon fiable vers les abonnés Free/Expresso
// (SMS inter-opérateurs). Infobip est un agrégateur multi-réseaux,
// déjà utilisé pour les SMS de notification de commande — voir
// /api/notifications/send/route.ts, mêmes variables d'environnement :
//   INFOBIP_BASE_URL   — ex: xxxxx.api.infobip.com
//   INFOBIP_API_KEY
//   INFOBIP_SENDER      — nom expéditeur SMS (11 car. max), défaut "AgriMarche"
// ============================================================

async function sendInfobipSms(recipientE164: string, message: string) {
  const infobipBaseUrl = process.env.INFOBIP_BASE_URL;
  const infobipApiKey = process.env.INFOBIP_API_KEY;
  const senderName = process.env.INFOBIP_SENDER || 'AgriMarche';

  if (!infobipBaseUrl || !infobipApiKey) {
    throw new Error('INFOBIP_BASE_URL ou INFOBIP_API_KEY manquant');
  }

  // Infobip attend le destinataire sans '+' (ex: 221771234567)
  const destination = recipientE164.replace(/^\+/, '');

  const res = await fetch(`https://${infobipBaseUrl}/sms/2/text/advanced`, {
    method: 'POST',
    headers: {
      Authorization: `App ${infobipApiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      messages: [{
        from: senderName,
        destinations: [{ to: destination }],
        text: message,
      }],
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(`Échec envoi SMS Infobip (${res.status}): ${JSON.stringify(json)}`);
  }

  const msgStatus = json?.messages?.[0]?.status;
  // ⚠️ FIX : Infobip renvoie normalement un statut du groupe "PENDING"
  // (ex: PENDING_ACCEPTED = "Message sent to next instance") à chaque envoi
  // réussi — ce n'est PAS un échec. Le seul groupe qui signale un vrai rejet
  // synchrone est "REJECTED". On se base sur groupName, pas sur une liste
  // de noms de statuts (l'ancienne vérification traitait à tort tout envoi
  // réussi comme rejeté).
  if (msgStatus?.groupName === 'REJECTED') {
    throw new Error(`Infobip a rejeté le SMS (statut: ${msgStatus.name ?? 'inconnu'})`);
  }

  return json;
}

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  // Défini tôt pour rester accessible dans le catch général (numéro
  // potentiellement invalide/non parsé à ce stade-là).
  let phoneE164ForLog = '';
  let dbForLog: FirebaseFirestore.Firestore | null = null;

  try {
    const { phone } = await req.json();
    const phoneE164 = toE164Senegal(String(phone || ''));
    phoneE164ForLog = phoneE164 || String(phone || '');

    const app = getAdminApp();
    const db = getFirestore(app);
    dbForLog = db;

    if (!phoneE164) {
      await logOtpServerAttempt(db, {
        step: 'invalid_phone',
        phoneE164: phoneE164ForLog,
        httpStatusToClient: 400,
        durationMs: Date.now() - startedAt,
      });
      return NextResponse.json(
        { error: 'Numéro invalide' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const docRef = db.collection('otp_codes').doc(phoneE164);

    const existing = await docRef.get();
    const now = Date.now();
    if (existing.exists) {
      const data = existing.data()!;
      const windowStart = data.windowStart ?? 0;
      const sendsInWindow = data.sendsInWindow ?? 0;
      if (now - windowStart < SEND_WINDOW_MS && sendsInWindow >= MAX_SENDS_PER_WINDOW) {
        await logOtpServerAttempt(db, {
          step: 'rate_limited',
          phoneE164,
          httpStatusToClient: 429,
          durationMs: Date.now() - startedAt,
        });
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

    let result: any;
    try {
      result = await sendInfobipSms(
        phoneE164,
        `Votre code AgriMarché : ${code} (valable 5 minutes)`
      );
    } catch (infobipErr: any) {
      // Distingue un vrai rejet Infobip (REJECTED) d'une erreur HTTP/réseau
      // vers Infobip lui-même, pour ne pas tout étiqueter pareil dans les logs.
      const msg = String(infobipErr?.message || infobipErr);
      const isRejection = /rejeté/i.test(msg);
      await logOtpServerAttempt(db, {
        step: isRejection ? 'infobip_rejected' : 'infobip_http_error',
        phoneE164,
        httpStatusToClient: 500,
        errorMessage: msg,
        durationMs: Date.now() - startedAt,
      });
      throw infobipErr; // laisse le catch général répondre au client normalement
    }

    console.log('[otp/send] SMS envoyé via Infobip:', JSON.stringify(result));
    await logOtpServerAttempt(db, {
      step: 'infobip_success',
      phoneE164,
      httpStatusToClient: 200,
      infobipStatus: result?.messages?.[0]?.status?.name ?? null,
      durationMs: Date.now() - startedAt,
    });

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('[otp/send] Erreur:', error);
    // Best-effort : si on a déjà `db`, on logge aussi les erreurs
    // inattendues qui ne sont pas passées par un des cas ci-dessus
    // (ex: JSON.parse du body qui échoue, Firebase Admin mal configuré).
    if (dbForLog) {
      await logOtpServerAttempt(dbForLog, {
        step: 'unexpected_error',
        phoneE164: phoneE164ForLog,
        httpStatusToClient: 500,
        errorMessage: error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
    }
    return NextResponse.json(
      { error: error?.message || 'Erreur serveur' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
