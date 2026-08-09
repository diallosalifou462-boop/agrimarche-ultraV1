import { NextRequest, NextResponse } from 'next/server';

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
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
    } else if (digits.startsWith('0') && digits.length === 10) {
      digits = '+221' + digits.slice(1);
    } else {
      digits = '+' + digits;
    }
  }

  return /^\+\d{8,15}$/.test(digits) ? digits : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { to, message } = body;

    if (!to || !message) {
      return NextResponse.json(
        { error: 'Paramètres manquants' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    // ⚠️ Bascule Infobip : remplace Africa's Talking (ne couvrait pas
    // correctement le Sénégal). Mêmes variables d'environnement que
    // /api/otp/send et /api/notifications/send — un seul compte Infobip
    // pour tous les usages SMS (OTP, confirmations de commande/livraison,
    // broadcasts admin).
    const infobipBaseUrl = process.env.INFOBIP_BASE_URL;
    const infobipApiKey = process.env.INFOBIP_API_KEY;
    const senderName = process.env.INFOBIP_SENDER || 'AgriMarche';

    console.log('==============================');
    console.log('INFOBIP_BASE_URL:', infobipBaseUrl || 'NON DEFINI');
    console.log('INFOBIP_API_KEY:', infobipApiKey ? 'TROUVEE' : 'MANQUANTE');
    console.log('INFOBIP_SENDER:', senderName);
    console.log('==============================');

    if (!infobipBaseUrl || !infobipApiKey) {
      return NextResponse.json(
        {
          error:
            'INFOBIP_BASE_URL ou INFOBIP_API_KEY manquant dans .env.local',
        },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    const phone = toE164Senegal(String(to));

    if (!phone) {
      return NextResponse.json(
        { error: 'Numéro invalide' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const smsResponse = await fetch(`https://${infobipBaseUrl}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${infobipApiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        messages: [{
          from: senderName,
          destinations: [{ to: phone.replace(/^\+/, '') }],
          text: String(message),
        }],
      }),
    });

    const result = await smsResponse.json().catch(() => null);

    console.log('SMS RESULT:', JSON.stringify(result, null, 2));

    if (!smsResponse.ok) {
      return NextResponse.json(
        { error: `Échec envoi SMS Infobip (${smsResponse.status}): ${JSON.stringify(result)}` },
        { status: 500, headers: CORS_HEADERS }
      );
    }

    // ⚠️ FIX : même correctif que otp/send — PENDING_ACCEPTED (groupe
    // "PENDING") est la réponse normale d'un envoi réussi, pas un rejet.
    // Seul le groupe "REJECTED" signale un échec.
    const msgStatus = result?.messages?.[0]?.status;
    const sent = msgStatus?.groupName !== 'REJECTED';

    return NextResponse.json({
      success: sent,
      result,
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('SMS ERROR:', error);

    return NextResponse.json(
      {
        error: error?.message || 'Erreur serveur',
      },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
