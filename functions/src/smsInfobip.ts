// ============================================================
//   smsInfobip.ts — Canal UNIQUE d'envoi de code (OTP) pour Expresso
//   et Tigo/Free, pour les trois parcours qui en ont besoin :
//   inscription (registration.ts), connexion 2ᵉ facteur (loginOtp.ts)
//   et mot de passe oublié (passwordReset.ts).
//
//   ⚠️ Ne jamais appeler ce module pour Orange (Orange passe par
//   Firebase Phone Auth, voir orangeRegistration.ts). Le push (FCM) a
//   été entièrement abandonné le 20/09 — voir otpChannel.ts — ce
//   module est donc désormais le SEUL canal d'envoi, plus un simple
//   filet de secours.
// ============================================================
const INFOBIP_API_KEY = process.env.INFOBIP_API_KEY;
const INFOBIP_SENDER = process.env.INFOBIP_SENDER ?? 'SunuMenef';

// ⚠️ PANNE OBSERVÉE (19/09) : le secret INFOBIP_BASE_URL était enregistré
// sans le schéma (« jr9env.api.infobip.com » au lieu de « https://... »).
// fetch() échoue alors immédiatement avec « Failed to parse URL », AVANT
// tout appel réseau réel — invisible depuis la console Infobip, qui ne voit
// jamais la requête. Conséquence concrète : le repli SMS (censé rattraper
// un push qui n'arrive pas) échouait lui aussi, sans qu'aucun code ne
// parte par aucun canal. On normalise donc ici une fois pour toutes,
// plutôt que de dépendre d'une valeur de secret bien formée : le SMS est
// le dernier filet, coûte de l'argent réel, et ne doit plus jamais casser
// pour un simple préfixe manquant.
function normalizedInfobipBaseUrl(): string | undefined {
  const raw = process.env.INFOBIP_BASE_URL?.trim();
  if (!raw) return undefined;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/+$/, ''); // pas de "/" final, sinon URL doublée avec le chemin ci-dessous
}

export async function sendOtpSmsInfobip(
  phoneE164: string,
  code: string,
  purpose: 'confirmation' | 'connexion' | 'réinitialisation' = 'confirmation',
): Promise<void> {
  const baseUrl = normalizedInfobipBaseUrl();
  if (!baseUrl || !INFOBIP_API_KEY) {
    // ⚠️ AJOUT (21/09) : cette branche ne journalisait rien avant de lancer
    // l'erreur — impossible de savoir, depuis les logs, si le problème
    // venait d'ici ou d'un vrai échec réseau/InfoBip plus bas. On journalise
    // sans jamais exposer la valeur du secret lui-même (juste sa présence).
    console.error(
      `❌ Configuration InfoBip manquante pour cette fonction — INFOBIP_BASE_URL: ${baseUrl ? 'présent' : 'MANQUANT'}, INFOBIP_API_KEY: ${INFOBIP_API_KEY ? 'présent' : 'MANQUANT'}.`,
    );
    throw new Error('Configuration InfoBip manquante (INFOBIP_BASE_URL / INFOBIP_API_KEY).');
  }

  const body = {
    messages: [
      {
        destinations: [{ to: phoneE164.replace('+', '') }],
        from: INFOBIP_SENDER,
        text: `Votre code de ${purpose} Sunu Mëñëf est : ${code}. Ce code expire dans 5 minutes.`,
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
    res = await fetch(`${baseUrl}/sms/2/text/advanced`, {
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
