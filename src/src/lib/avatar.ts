// ─── Avatar : initiale + couleur déterministe ─────────────
// L'initiale vient du NOM affiché (profile.displayName / user.displayName),
// pas de l'email : les comptes créés via le flow OTP Free/Yas/Expresso ont
// un email synthétique (numéro@agrimarche.sn), qui commence par un chiffre
// et affichait donc "?" à la place d'une vraie initiale.

const AVATAR_COLORS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16',
  '#22C55E', '#10B981', '#14B8A6', '#06B6D4', '#0EA5E9',
  '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF',
  '#EC4899', '#F43F5E',
];

export function getAvatarInitial(name?: string | null): string {
  return name?.trim().charAt(0).toUpperCase() || '?';
}

export function getAvatarColor(initial: string): string {
  return /[A-Z]/.test(initial)
    ? AVATAR_COLORS[(initial.charCodeAt(0) - 65) % AVATAR_COLORS.length]
    : '#6B7280';
}
