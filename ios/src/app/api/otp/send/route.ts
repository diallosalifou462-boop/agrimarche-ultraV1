export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
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
  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey,
    }),
  });
}
function toE164Senegal(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) {
    digits = '+' + digits.slice(1).replace(/\D/g, '');
  } else {
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) {
      digits = digits.slice(2);
    }
    if (digits.startsWith('221')) {
      digits = '+' + digits;
    } else if (digits.length === 9) {
      digits = '+221' + digits;
    } else {
      digits = '+' + digits;
    }
  }
  return /^\+221\d{9}$/.test(digits) ? digits : null;
}
// ============================================================
// INFOBIP — passerelle SMS pour l'OTP d'inscription des numéros
// ============================================================
async function sendInfobipSms(
  recipientE164: string,
  message: string
) {
  const infobipBaseUrl = process.env.INFOBIP_BASE_URL;
  const infobipApiKey = process.env.INFOBIP_API_KEY;
  const senderName =
    process.env.INFOBIP_SENDER || 'AgriMarche';
  if (!infobipBaseUrl || !infobipApiKey) {
    throw new Error(
      'INFOBIP_BASE_URL ou INFOBIP_API_KEY manquant'
    );
  }
  const destination = recipientE164.replace(/^\+/, '');
  const res = await fetch(
    `https://${infobipBaseUrl}/sms/2/text/advanced`,
    {
      method: 'POST',
      headers: {
        Authorization: `App ${infobipApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            from: senderName,
            destinations: [{ to: destination }],
            text: message,
          },
        ],
      }),
    }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(
      `Échec envoi SMS Infobip (${res.status}): ${JSON.stringify(json)}`
    );
  }
  const msgStatus = json?.messages?.[0]?.status;
  if (msgStatus?.groupName === 'REJECTED') {
    throw new Error(
      `Infobip a rejeté le SMS (statut: ${
        msgStatus.name ?? 'inconnu'
      })`
    );
  }
  return json;
}
const CODE_TTL_MS = 5 * 60 * 1000;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;
export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  let phoneE164ForLog = '';
  let dbForLog: FirebaseFirestore.Firestore | null = null;
  try {
    const { phone, purpose } = await req.json();
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
        {
          status: 400,
          headers: CORS_HEADERS,
        }
      );
    }
    if (purpose === 'register' || purpose === 'reset') {
      const adminAuth = getAuth(app);
      let accountExists = true;
      try {
        await adminAuth.getUserByPhoneNumber(phoneE164);
      } catch {
        accountExists = false;
      }
      if (purpose === 'register' && accountExists) {
        await logOtpServerAttempt(db, {
          step: 'already_registered',
          phoneE164,
          httpStatusToClient: 409,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          {
            error:
              'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».',
          },
          {
            status: 409,
            headers: CORS_HEADERS,
          }
        );
      }
      if (purpose === 'reset' && !accountExists) {
        await logOtpServerAttempt(db, {
          step: 'no_account_for_reset',
          phoneE164,
          httpStatusToClient: 404,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          {
            error:
              "Aucun compte n'est associé à ce numéro.",
          },
          {
            status: 404,
            headers: CORS_HEADERS,
          }
        );
      }
    }
    const docRef = db
      .collection('otp_codes')
      .doc(phoneE164);
    const existing = await docRef.get();
    const now = Date.now();
    if (existing.exists) {
      const data = existing.data()!;
      const windowStart = data.windowStart ?? 0;
      const sendsInWindow = data.sendsInWindow ?? 0;
      if (
        now - windowStart < SEND_WINDOW_MS &&
        sendsInWindow >= MAX_SENDS_PER_WINDOW
      ) {
        await logOtpServerAttempt(db, {
          step: 'rate_limited',
          phoneE164,
          httpStatusToClient: 429,
          durationMs: Date.now() - startedAt,
        });
        return NextResponse.json(
          {
            error:
              'Trop de tentatives. Réessayez dans quelques minutes.',
          },
          {
            status: 429,
            headers: CORS_HEADERS,
          }
        );
      }
    }
    const code = String(
      Math.floor(100000 + Math.random() * 900000)
    );
    const data = existing.exists
      ? existing.data()!
      : {};
    const windowStart =
      data.windowStart &&
      now - data.windowStart < SEND_WINDOW_MS
        ? data.windowStart
        : now;
    const sendsInWindow =
      data.windowStart &&
      now - data.windowStart < SEND_WINDOW_MS
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
      const msg = String(
        infobipErr?.message || infobipErr
      );
      const isRejection = /rejeté/i.test(msg);
      await logOtpServerAttempt(db, {
        step: isRejection
          ? 'infobip_rejected'
          : 'infobip_http_error',
        phoneE164,
        httpStatusToClient: 500,
        errorMessage: msg,
        durationMs: Date.now() - startedAt,
      });
      throw infobipErr;
    }
    console.log(
      '[otp/send] SMS envoyé via Infobip:',
      JSON.stringify(result)
    );
    await logOtpServerAttempt(db, {
      step: 'infobip_success',
      phoneE164,
      httpStatusToClient: 200,
      infobipStatus:
        result?.messages?.[0]?.status?.name ?? null,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { success: true },
      {
        headers: CORS_HEADERS,
      }
    );
  } catch (error: any) {
    console.error('[otp/send] Erreur:', error);
    if (dbForLog) {
      await logOtpServerAttempt(dbForLog, {
        step: 'unexpected_error',
        phoneE164: phoneE164ForLog,
        httpStatusToClient: 500,
        errorMessage:
          error?.message || String(error),
        durationMs: Date.now() - startedAt,
      });
    }
    return NextResponse.json(
      {
        error:
          error?.message || 'Erreur serveur',
      },
      {
        status: 500,
        headers: CORS_HEADERS,
      }
    );
  }
}