// =====================================================================
// Messages d'erreur en français pour l'utilisateur
// ---------------------------------------------------------------------
// Toute erreur affichée à l'écran (setError, toast, alert…) doit passer
// par `messageErreur(err, repli)`. Le détail technique (code Firebase,
// message anglais, stack) part uniquement dans la console : l'utilisateur
// ne voit jamais « auth/network-request-failed / FirebaseError ».
//
// Ordre de résolution :
//   1. Code d'erreur connu (Auth, Firestore, Storage, Functions, SMS…)
//   2. Message déjà rédigé en français par notre code ou nos API
//      (RegistrationActionError, DeliveryCodeError, HttpsError, json.error)
//   3. Erreur réseau reconnue dans le message (Failed to fetch, offline…)
//   4. Message de repli fourni par l'appelant (ou générique)
// =====================================================================

const RESEAU = 'Connexion internet instable. Vérifiez votre réseau puis réessayez.';
const TROP_DE_TENTATIVES = 'Trop de tentatives. Patientez quelques minutes avant de réessayer.';
const SESSION_EXPIREE = 'Votre session a expiré. Reconnectez-vous puis réessayez.';
const INDISPONIBLE = 'Service momentanément indisponible. Réessayez dans un instant.';
const ACCES_REFUSE = "Vous n'avez pas l'autorisation d'effectuer cette action.";

export const MESSAGES_ERREUR: Record<string, string> = {
  // ─── Firebase Auth : réseau / limites ──────────────────────────────
  'auth/network-request-failed': RESEAU,
  'auth/timeout': RESEAU,
  'auth/web-storage-unsupported': "Votre navigateur bloque l'enregistrement de la session. Désactivez la navigation privée puis réessayez.",
  'auth/too-many-requests': TROP_DE_TENTATIVES,
  'auth/quota-exceeded': 'Service SMS momentanément saturé. Réessayez plus tard.',
  'auth/internal-error': 'Une erreur est survenue. Réessayez dans un instant.',
  'auth/app-not-authorized': INDISPONIBLE,
  'auth/operation-not-allowed': 'Ce mode de connexion n’est pas disponible pour le moment.',

  // ─── Firebase Auth : code SMS ──────────────────────────────────────
  'auth/invalid-verification-code': 'Code incorrect. Vérifiez les 6 chiffres reçus par SMS.',
  'auth/missing-verification-code': 'Saisissez le code à 6 chiffres reçu par SMS.',
  'auth/code-expired': 'Ce code a expiré. Demandez un nouveau code.',
  'auth/session-expired': 'Ce code a expiré. Demandez un nouveau code.',
  'auth/invalid-verification-id': 'Session expirée. Demandez un nouveau code.',
  'auth/missing-verification-id': 'Session expirée. Demandez un nouveau code.',
  'auth/invalid-phone-number': 'Numéro de téléphone invalide. Vérifiez le numéro saisi.',
  'auth/missing-phone-number': 'Saisissez votre numéro de téléphone.',
  'auth/captcha-check-failed': 'La vérification de sécurité a échoué. Réessayez.',
  'auth/invalid-app-credential': 'La vérification de sécurité a échoué. Réessayez.',
  'auth/missing-app-credential': 'La vérification de sécurité a échoué. Réessayez.',
  'auth/recaptcha-not-enabled': INDISPONIBLE,
  'auth/unverified-email': 'Votre adresse e-mail n’est pas encore vérifiée.',

  // ─── Firebase Auth : identifiants / compte ─────────────────────────
  'auth/invalid-credential': 'Numéro ou mot de passe incorrect.',
  'auth/invalid-login-credentials': 'Numéro ou mot de passe incorrect.',
  'auth/wrong-password': 'Numéro ou mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte trouvé pour ce numéro. Inscrivez-vous d’abord.',
  'auth/user-disabled': 'Ce compte a été désactivé. Contactez le support.',
  'auth/user-mismatch': 'Ce code ne correspond pas au compte connecté.',
  'auth/invalid-email': 'Adresse e-mail invalide.',
  'auth/missing-password': 'Saisissez votre mot de passe.',
  'auth/weak-password': 'Mot de passe trop faible : utilisez au moins 6 caractères.',
  'auth/email-already-in-use': 'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».',
  'auth/phone-number-already-exists': 'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».',
  'auth/credential-already-in-use': 'Ce numéro est déjà relié à un autre compte.',
  'auth/provider-already-linked': 'Ce numéro est déjà inscrit. Connectez-vous ou utilisez « mot de passe oublié ».',
  'auth/account-exists-with-different-credential': 'Un compte existe déjà avec ce numéro. Connectez-vous avec votre mot de passe.',
  'auth/requires-recent-login': 'Pour votre sécurité, reconfirmez votre identité (nouveau code) puis réessayez.',
  'auth/user-token-expired': SESSION_EXPIREE,
  'auth/invalid-user-token': SESSION_EXPIREE,
  'auth/id-token-expired': SESSION_EXPIREE,
  'auth/invalid-custom-token': 'Session expirée. Demandez un nouveau code.',
  'auth/custom-token-mismatch': 'Session expirée. Demandez un nouveau code.',
  'auth/no-current-user': SESSION_EXPIREE,
  'auth/popup-closed-by-user': 'Connexion annulée.',
  'auth/cancelled-popup-request': 'Connexion annulée.',
  'auth/popup-blocked': 'La fenêtre de connexion a été bloquée. Autorisez les pop-ups puis réessayez.',
  'auth/argument-error': 'Informations incomplètes. Vérifiez les champs puis réessayez.',

  // ─── Firestore (codes sans préfixe, ou « firestore/… ») ────────────
  'permission-denied': ACCES_REFUSE,
  'unauthenticated': SESSION_EXPIREE,
  'unavailable': RESEAU,
  'deadline-exceeded': RESEAU,
  'not-found': "L'élément demandé est introuvable. Il a peut-être été supprimé.",
  'already-exists': 'Cet élément existe déjà.',
  'resource-exhausted': TROP_DE_TENTATIVES,
  'failed-precondition': "Cette action n'est plus possible : les informations ont changé entre-temps. Actualisez la page.",
  'aborted': "L'opération a été interrompue. Réessayez.",
  'cancelled': "L'opération a été annulée.",
  'invalid-argument': 'Informations invalides. Vérifiez les champs puis réessayez.',
  'out-of-range': 'Valeur hors limites. Vérifiez les champs saisis.',
  'data-loss': 'Une erreur est survenue lors de l’enregistrement. Réessayez.',
  'internal': 'Une erreur est survenue. Réessayez dans un instant.',
  'unimplemented': 'Cette fonctionnalité n’est pas encore disponible.',
  'unknown': 'Une erreur inattendue est survenue. Réessayez.',

  // ─── Firebase Storage (photos) ─────────────────────────────────────
  'storage/unauthorized': "Vous n'avez pas l'autorisation d'envoyer cette photo.",
  'storage/unauthenticated': SESSION_EXPIREE,
  'storage/canceled': "L'envoi de la photo a été annulé.",
  'storage/quota-exceeded': "Espace de stockage plein. Réessayez plus tard.",
  'storage/retry-limit-exceeded': "L'envoi de la photo a pris trop de temps. Vérifiez votre connexion puis réessayez.",
  'storage/object-not-found': 'Photo introuvable.',
  'storage/invalid-checksum': 'La photo a été abîmée pendant l’envoi. Réessayez.',
  'storage/server-file-wrong-size': 'La photo a été abîmée pendant l’envoi. Réessayez.',
  'storage/unknown': "L'envoi de la photo a échoué. Réessayez.",

  // ─── Géolocalisation (codes numériques du navigateur) ──────────────
  'geo/1': "Accès à votre position refusé. Autorisez la localisation dans les réglages.",
  'geo/2': 'Position introuvable. Activez le GPS puis réessayez.',
  'geo/3': 'La recherche de votre position a pris trop de temps. Réessayez.',
};

// Codes Cloud Functions : « functions/xxx » → même message que Firestore « xxx »
function normaliserCode(code: string): string {
  const c = code.trim();
  if (c.startsWith('functions/')) return c.slice('functions/'.length);
  if (c.startsWith('firestore/')) return c.slice('firestore/'.length);
  return c;
}

const RE_RESEAU =
  /network|failed to fetch|load failed|fetch failed|offline|internet|timed? ?out|timeout|ECONN|ENOTFOUND|ETIMEDOUT|connexion.*(interrompue|perdue)|NSURLErrorDomain|-1009|-1001|-1005/i;

// Signes qu'un message est technique (anglais, SDK, stack) et ne doit pas
// être montré tel quel.
const RE_TECHNIQUE =
  /firebase|firestore|\b[a-z]+\/[a-z-]+\b|error\s*\(|exception|undefined|null|\bat\s+\S+\s*\(|TypeError|SyntaxError|JSON|status code|\bHTTP\b|\[object/i;

// Mots très courants en français : un message qui en contient et qui n'a
// pas l'air technique a été rédigé par nous (API, Cloud Function, classes
// d'erreur maison) — on le garde.
const RE_FRANCAIS =
  /[éèêëàâùûçôîï]|\b(le|la|les|de|du|des|un|une|votre|vos|vous|est|pas|ce|cette|déjà|réessayez|impossible|merci|numéro|commande|compte)\b/i;

function estMessageFrancaisLisible(msg: string): boolean {
  const m = msg.trim();
  if (m.length < 4 || m.length > 300) return false;
  if (RE_TECHNIQUE.test(m)) return false;
  return RE_FRANCAIS.test(m);
}

function extraireCode(err: any): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  if (typeof err.code === 'string' && err.code) return err.code;
  // Plugins Capacitor : parfois { errorCode } ou { data: { code } }
  if (typeof err.errorCode === 'string') return err.errorCode;
  if (typeof err.data?.code === 'string') return err.data.code;
  return undefined;
}

function extraireCodeDepuisMessage(msg: string): string | undefined {
  // « Firebase: Error (auth/network-request-failed). »
  const m = msg.match(/\(((?:auth|storage|functions|firestore)\/[a-z0-9-]+)\)/i);
  return m?.[1]?.toLowerCase();
}

/**
 * Traduit n'importe quelle erreur en message clair, en français.
 * @param err     l'erreur attrapée (FirebaseError, Error, Response JSON, string…)
 * @param repli   message à afficher si l'erreur n'est pas reconnue
 */
export function messageErreur(
  err: unknown,
  repli = 'Une erreur est survenue. Réessayez.',
): string {
  const e: any = err;

  // 1. Code d'erreur connu
  const brut = extraireCode(e);
  if (brut) {
    const code = normaliserCode(brut);
    // Une Cloud Function (HttpsError) renvoie souvent un message déjà en
    // français, plus précis que la traduction générique du code.
    if (brut.startsWith('functions/') && typeof e?.message === 'string' && estMessageFrancaisLisible(e.message)) {
      return e.message.trim();
    }
    if (MESSAGES_ERREUR[brut]) return MESSAGES_ERREUR[brut];
    if (MESSAGES_ERREUR[code]) return MESSAGES_ERREUR[code];
  }
  if (typeof e?.code === 'number' && MESSAGES_ERREUR[`geo/${e.code}`] && 'PERMISSION_DENIED' in (e ?? {})) {
    return MESSAGES_ERREUR[`geo/${e.code}`];
  }

  const message: string =
    typeof e === 'string' ? e
    : typeof e?.message === 'string' ? e.message
    : typeof e?.error === 'string' ? e.error          // réponse JSON { error: '...' }
    : '';

  if (message) {
    const codeDansMessage = extraireCodeDepuisMessage(message);
    if (codeDansMessage && MESSAGES_ERREUR[codeDansMessage]) return MESSAGES_ERREUR[codeDansMessage];

    // 2. Message déjà écrit en français par notre code / nos API
    if (estMessageFrancaisLisible(message)) return message.trim();

    // 3. Erreur réseau reconnue
    if (RE_RESEAU.test(message)) return RESEAU;
  }

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return RESEAU;

  // 4. Repli — le détail technique reste disponible pour le débogage
  if (err !== undefined && err !== null) {
    console.error('[messageErreur] erreur non traduite :', brut ?? '', message || err);
  }
  return repli;
}

/** Vrai si l'erreur est un problème de connexion (utile pour réessayer). */
export function estErreurReseau(err: unknown): boolean {
  const e: any = err;
  const code = normaliserCode(extraireCode(e) ?? '');
  if (code === 'auth/network-request-failed' || code === 'unavailable' || code === 'deadline-exceeded' || code === 'auth/timeout') return true;
  const msg = typeof e === 'string' ? e : e?.message ?? '';
  return RE_RESEAU.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false);
}
