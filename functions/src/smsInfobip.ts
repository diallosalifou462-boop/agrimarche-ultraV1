// ============================================================
//   smsInfobip.ts — Canal de secours UNIQUEMENT pour Expresso et
//   Tigo, et UNIQUEMENT quand aucun push token n'est disponible
//   pour la session d'inscription en cours.
//
//   ⚠️ Ne jamais appeler ce module pour Orange (Orange passe par
//   Firebase Phone Auth, voir orangeRegistration.ts) ni comme
//   fallback "le push a échoué à être livré" — uniquement "aucun
//   token push n'existe pour cette session" (utilisateur ayant
//   refusé les notifications, ou token indisponible au moment de
//   l'inscription).
// ============================================================
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL; // ex: https://xxxxx.api.infobip.com
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
const INFOBIP_SENDER = process.env.INFOBIP_SENDER ?? 'AgriMarche';

export async function sendOtpSmsInfobip(
  phoneE164: string,
  code: string,
  purpose: 'confirmation' | 'connexion' | 'réinitialisation' = 'confirmation',
): Promise<void> {
  if (!INFOBIP_BASE_URL || !INFOBIP_API_KEY) {
    throw new Error('Configuration InfoBip manquante (INFOBIP_BASE_URL / INFOBIP_API_KEY).');
  }

  const body = {
    messages: [
      {
        destinations: [{ to: phoneE164.replace('+', '') }],
        from: INFOBIP_SENDER,
        text: `Votre code de ${purpose} AgriMarché est : ${code}. Ce code expire dans 5 minutes.`,
      },
    ],
  };

  // ⚠️ Timeout explicite : sans ça, une API InfoBip qui traîne bloque la
  // fonction jusqu'au timeout global de la Cloud Function (60s par
  // défaut), gaspillant du temps facturé et retardant inutilement la
  // réponse à l'utilisateur pour une erreur qu'on aurait pu détecter
  // bien plus tôt. 8s est largement suffisant pour un appel SMS ; le
  // rate-limiting empêche de toute façon un utilisateur de spammer les
  // retries.
  let res: Response;
  try {
    res = await fetch(`${INFOBIP_BASE_URL}/sms/2/text/advanced`, {
      method: 'POST',
      headers: {
        Authorization: `App ${INFOBIP_API_KEY}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err: any) {
    const reason = err?.name === 'TimeoutError' ? 'timeout (8s)' : err?.message || err;
    console.error(`❌ Échec réseau envoi SMS InfoBip: ${reason}`);
    throw new Error('SMS_SEND_FAILED');
  }

  if (!res.ok) {
    // ⚠️ Ne jamais inclure `code` dans ce log — seul le statut HTTP et
    // le texte d'erreur InfoBip (qui ne contient pas le code) sont
    // journalisés (section 4 : le code ne doit jamais apparaître dans
    // les logs serveur).
    const errText = await res.text().catch(() => '');
    console.error(`❌ Échec envoi SMS InfoBip (status ${res.status}): ${errText}`);
    throw new Error('SMS_SEND_FAILED');
  }
}
