// src/lib/adminConfig.ts

// 🔐 Liste des emails admin (toi et d'autres si besoin)
export const ADMIN_EMAILS = [
  'support@agrimarche.com',     // ← TON EMAIL ADMIN
  'admin@agrimarche.sn',
];

// Vérifier si un email est admin
export const isAdminEmail = (email: string | null | undefined): boolean => {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
};