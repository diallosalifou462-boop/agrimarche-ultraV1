// ============================================================
//   errorMessages.ts — Traduction des codes d'erreur techniques en
//   messages affichables (français). Le code technique (ex:
//   PHONE_ALREADY_USED) reste toujours renvoyé en parallèle dans
//   HttpsError.message, pour que le frontend puisse aussi faire sa
//   propre logique (désactiver un bouton, rediriger...) sans
//   dépendre du texte affiché.
// ============================================================
const MESSAGES: Record<string, string> = {
  INVALID_PHONE: 'Ce numéro ne semble pas valide. Vérifie le format et réessaie.',
  PHONE_ALREADY_USED: 'Ce numéro est déjà associé à un compte AgriMarché.',
  ORANGE_USE_FIREBASE_AUTH: 'Pour un numéro Orange, la vérification se fait par SMS classique.',
  REGISTRATION_IN_PROGRESS: 'Une inscription est déjà en cours avec ce numéro sur un autre appareil.',
  TOO_MANY_REQUESTS: 'Trop de tentatives. Réessaie dans quelques minutes.',
  PUSH_SEND_FAILED: "L'envoi de la notification a échoué. Vérifie ta connexion et réessaie.",
  SMS_SEND_FAILED: "L'envoi du SMS a échoué. Réessaie dans un instant.",
  SESSION_NOT_FOUND: 'Session expirée. Recommence ton inscription.',
  SESSION_NOT_ACTIVE: "Cette session n'est plus active. Recommence ton inscription.",
  CODE_EXPIRED: 'Ce code a expiré. Demande un nouveau code.',
  TOO_MANY_ATTEMPTS: 'Trop de tentatives incorrectes. Demande un nouveau code.',
  VERIFICATION_IN_PROGRESS: 'Vérification déjà en cours. Patiente quelques secondes.',
  ACCOUNT_CREATION_FAILED: 'La création du compte a échoué. Réessaie dans un instant.',
  AUTH_REQUIRED: 'Authentification requise.',
  PHONE_NOT_VERIFIED: "Le numéro n'a pas pu être vérifié.",
  ADMIN_ONLY: 'Accès réservé aux administrateurs.',
  PASSWORD_REQUIRED: 'Choisis un mot de passe (6 caractères minimum).',
  ACCOUNT_NOT_FOUND: "Aucun compte n'est associé à ce numéro.",
};

// INVALID_CODE porte un suffixe dynamique (tentatives restantes), géré
// séparément plutôt que dans la table statique ci-dessus.
export function localizeError(code: string): string {
  if (code.startsWith('INVALID_CODE:')) {
    const remaining = code.split(':')[1] ?? '?';
    return `Code incorrect. Il te reste ${remaining} tentative(s).`;
  }
  return MESSAGES[code] ?? 'Une erreur est survenue. Réessaie.';
}
