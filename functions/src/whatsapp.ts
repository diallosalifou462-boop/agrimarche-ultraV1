// functions/src/whatsapp.ts
const WHATSAPP_API_VERSION = 'v21.0';

interface SendOtpParams {
  to: string; // numéro E.164 SANS le "+" (ex: 221771234567)
  code: string;
  templateName: string;
  languageCode: string;
}

// ⚠️ Variables d'environnement attendues (functions:config ou .env selon ta version de firebase-functions) :
//    WHATSAPP_PHONE_NUMBER_ID  → l'ID du numéro dans WhatsApp Manager
//    WHATSAPP_ACCESS_TOKEN     → token permanent (System User) ou temporaire pour les tests
export async function sendWhatsAppOtp({
  to,
  code,
  templateName,
  languageCode,
}: SendOtpParams): Promise<void> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error(
      "WHATSAPP_PHONE_NUMBER_ID ou WHATSAPP_ACCESS_TOKEN manquant dans les variables d'environnement"
    );
  }

  const url = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: [
        {
          type: 'body',
          parameters: [{ type: 'text', text: code }],
        },
        // ⚠️ Le template "Authentication" standard de Meta inclut un bouton
        //    "Copier le code". Si ton template n'a PAS de bouton, supprime
        //    ce bloc "button" entièrement (sinon l'envoi sera rejeté).
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: code }],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Échec envoi WhatsApp (${res.status}): ${errText}`);
  }
}
