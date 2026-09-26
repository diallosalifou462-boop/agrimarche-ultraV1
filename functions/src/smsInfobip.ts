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

  // ⚠️ FIX (26/09) : texte 100 % GSM-7. Le « ë »/« ñ » de « Sunu Mëñëf »
  // n'existent PAS dans l'alphabet GSM 03.38 : leur seule présence
  // basculait tout le SMS en Unicode (UCS-2, 70 caractères max par
  // segment) → message découpé en 2 SMS, donc facturé 2 fois. Seuls des
  // caractères du jeu de base GSM-7 sont gardés ici : « é » (de
  // « réinitialisation ») en fait partie, comme è, ù, ì, ò, à, É — mais
  // PAS ë, ñ, ê, â ni le « ç » minuscule. Toute modification de ce texte
  // doit respecter cette règle.
  // ⚠️ FIX (26/09) : validityPeriod (en minutes) = durée de vie du code.
  // Sans ça, un SMS bloqué chez l'opérateur (téléphone éteint, réseau
  // saturé) pouvait être livré des heures plus tard, avec un code déjà
  // expiré qui ne fait que semer la confusion.
  const body = {
    messages: [
      {
        destinations: [{ to: phoneE164.replace('+', '') }],
        from: INFOBIP_SENDER,
        text: `Votre code de ${purpose} Sunu Menef : ${code}. Valable 5 min.`,
        validityPeriod: 5,
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
    // ⚠️ FIX (26/09) : un TIMEOUT n'est pas un échec certain — la requête
    // a pu atteindre Infobip, et le SMS partir quand même (juste en
    // retard). On le signale donc avec une erreur DISTINCTE
    // (SMS_SEND_TIMEOUT) pour que l'appelant puisse garder la session
    // utilisable au lieu de la déclarer morte alors que le code arrive
    // quelques secondes plus tard sur le téléphone.
    if (err?.name === 'TimeoutError') {
      console.error('⏱️ Timeout (8s) envoi SMS InfoBip — le SMS a pu partir quand même.');
      throw new Error('SMS_SEND_TIMEOUT');
    }
    console.error(`❌ Échec réseau envoi SMS InfoBip: ${err?.message || err}`);
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

  // ⚠️ FIX (26/09) : un HTTP 200 ne veut PAS dire « SMS accepté ». Infobip
  // répond 200 même quand il REJETTE le message (numéro invalide, crédit
  // épuisé, expéditeur non autorisé…) : le refus n'apparaît que dans
  // messages[0].status (groupName 'REJECTED', groupId 5). Avant, ces refus
  // étaient comptés comme des envois réussis — l'utilisateur attendait un
  // code qui ne partirait jamais. On ne journalise que le nom/la
  // description du statut, jamais `code`.
  // Lecture du corps « sûre » : si le JSON est illisible (ou si sa lecture
  // expire), on ne peut rien conclure — on garde le comportement
  // historique (HTTP 200 = envoyé) plutôt que d'annoncer un faux échec.
  let payload: any = null;
  try {
    payload = await res.json();
  } catch (err: any) {
    console.warn(`⚠️ Réponse InfoBip illisible (HTTP ${res.status}), envoi considéré comme accepté: ${err?.message || err}`);
    return;
  }
  const status = payload?.messages?.[0]?.status;
  if (status?.groupName === 'REJECTED' || status?.groupId === 5) {
    console.error(
      `❌ SMS InfoBip REJETÉ (statut ${status?.name ?? '?'}): ${status?.description ?? 'sans description'}`,
    );
    throw new Error('SMS_SEND_FAILED');
  }
}
