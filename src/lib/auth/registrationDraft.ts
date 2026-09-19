// ============================================================
//   registrationDraft.ts — Reprise d'une inscription interrompue.
//
//   Le cas qu'il fallait supprimer : l'utilisateur remplit le
//   formulaire, appuie sur « Envoyer », quitte l'app, appuie plus tard
//   sur la notification qui porte le code. Si le système avait entre
//   temps déchargé l'app, la WebView redémarre à zéro : session perdue,
//   nom, région, quartier perdus. L'utilisateur retombait sur un
//   formulaire vide, et son numéro était déjà réservé côté serveur.
//
//   On garde donc un brouillon sur l'appareil, le temps de la session
//   OTP (10 minutes), pour reprendre exactement où on en était.
//
//   ⚠️ CE QUI N'EST JAMAIS ÉCRIT ICI : le mot de passe. Un mot de passe
//   en clair dans localStorage serait lisible par n'importe quel script
//   de la WebView et survivrait à la fin de l'inscription. Dans le seul
//   cas où l'app a réellement été déchargée, on redemande donc le mot de
//   passe — un champ, celui que l'utilisateur vient de choisir — au lieu
//   de lui faire tout retaper.
// ============================================================

const DRAFT_KEY = 'sunumenef_registration_draft';
/** Durée de vie du brouillon : celle de la session OTP côté serveur + marge. */
const DRAFT_TTL_MS = 10 * 60 * 1000;

export interface RegistrationDraft {
  sessionId: string;
  phone: string;
  name: string;
  region: string;
  departement: string;
  commune: string;
  quartier: string;
  /** Canal réellement utilisé par le serveur pour ce code. */
  channel: 'push' | 'sms';
  savedAt: number;
}

export function saveRegistrationDraft(draft: Omit<RegistrationDraft, 'savedAt'>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // Stockage plein ou bloqué : la reprise après déchargement ne marchera
    // pas, mais l'inscription en cours n'est pas affectée. On n'alerte pas.
  }
}

/** Brouillon encore valide, ou null. Un brouillon périmé est effacé au passage. */
export function readRegistrationDraft(): RegistrationDraft | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as RegistrationDraft;
    if (!draft?.sessionId || !draft?.phone) return null;
    if (Date.now() - (draft.savedAt ?? 0) > DRAFT_TTL_MS) {
      clearRegistrationDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}

export function clearRegistrationDraft(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* rien à faire */
  }
}
