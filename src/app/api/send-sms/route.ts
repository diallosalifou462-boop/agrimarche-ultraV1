import { NextRequest, NextResponse } from 'next/server';

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
        { status: 400 }
      );
    }

    const username = process.env.AFRICASTALKING_USERNAME;
    const apiKey = process.env.AFRICASTALKING_API_KEY;
    const senderId = process.env.AFRICASTALKING_SENDER_ID;

    console.log('==============================');
    console.log('AFRICASTALKING_USERNAME:', username);
    console.log(
      'AFRICASTALKING_API_KEY:',
      apiKey ? 'TROUVEE' : 'MANQUANTE'
    );
    console.log(
      'AFRICASTALKING_SENDER_ID:',
      senderId || 'NON DEFINI'
    );
    console.log('==============================');

    if (!username || !apiKey) {
      return NextResponse.json(
        {
          error:
            'AFRICASTALKING_USERNAME ou AFRICASTALKING_API_KEY manquant dans .env.local',
        },
        { status: 500 }
      );
    }

    const phone = toE164Senegal(String(to));

    if (!phone) {
      return NextResponse.json(
        { error: 'Numéro invalide' },
        { status: 400 }
      );
    }

    const AfricasTalking = require('africastalking')({
      username,
      apiKey,
    });

    const sms = AfricasTalking.SMS;

    const options: any = {
      to: [phone],
      message: String(message),
    };

    if (senderId) {
      options.from = senderId;
    }

    const result = await sms.send(options);

    console.log('SMS RESULT:', JSON.stringify(result, null, 2));

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('SMS ERROR:', error);

    return NextResponse.json(
      {
        error: error?.message || 'Erreur serveur',
      },
      { status: 500 }
    );
  }
}
