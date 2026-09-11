// ============================================================
//   carrier.ts — Détection d'opérateur (Sénégal) pour le ROUTAGE
//   de la vérification d'inscription.
//
//   ⚠️ Ce fichier ne sert plus à choisir un canal SMS générique
//   (l'ancien usage a été retiré, voir section 11 du cahier des
//   charges). Son unique rôle aujourd'hui : décider quelle
//   STRATÉGIE de vérification s'applique à un numéro donné.
//
//     Orange            → Firebase Phone Auth (orangeRegistration.ts)
//     Expresso / Tigo   → Push-first + fallback SMS InfoBip
//                          (registration.ts)
//
//   Préfixes confirmés par le porteur du projet : Orange = 77/78/71,
//   Tigo (Free Sénégal) = 76, Expresso = 70/75. La table reste
//   néanmoins chargée depuis Firestore (config/carrierPrefixes) avec
//   le fallback codé en dur ci-dessous : si un nouveau préfixe MVNO
//   apparaît, corrige la config Firestore sans redéploiement.
// ============================================================
import * as admin from 'firebase-admin';

export type CarrierSN = 'orange' | 'tigo' | 'expresso' | 'unknown';

// Fallback si la config Firestore est absente/inaccessible. Trié du
// préfixe le plus long au plus court : un futur préfixe à 3 chiffres
// (ex: 754/755/756 vus chez un MVNO) doit être testé avant son
// préfixe parent à 2 chiffres.
const DEFAULT_PREFIX_TABLE: Array<{ prefix: string; carrier: CarrierSN }> = [
  { prefix: '77', carrier: 'orange' },
  { prefix: '78', carrier: 'orange' },
  { prefix: '71', carrier: 'orange' },
  { prefix: '76', carrier: 'tigo' },     // Free Sénégal, ex-Tigo
  { prefix: '70', carrier: 'expresso' },
  { prefix: '75', carrier: 'expresso' },
];

let cachedTable: Array<{ prefix: string; carrier: CarrierSN }> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min : évite une lecture Firestore à chaque appel sans figer la config trop longtemps

async function loadPrefixTable(): Promise<Array<{ prefix: string; carrier: CarrierSN }>> {
  const now = Date.now();
  if (cachedTable && now - cachedAt < CACHE_TTL_MS) return cachedTable;

  try {
    const snap = await admin.firestore().collection('config').doc('carrierPrefixes').get();
    const data = snap.data();
    if (data?.table && Array.isArray(data.table) && data.table.length > 0) {
      cachedTable = [...data.table].sort((a, b) => b.prefix.length - a.prefix.length);
      cachedAt = now;
      return cachedTable;
    }
  } catch (err) {
    console.warn('⚠️ config/carrierPrefixes illisible, fallback sur la table par défaut:', err);
  }

  cachedTable = DEFAULT_PREFIX_TABLE;
  cachedAt = now;
  return cachedTable;
}

// Accepte '+221771234567', '00221771234567', '771234567', '77 123 45 67'...
// et renvoie toujours la forme canonique E.164 '+221XXXXXXXXX', ou null si
// la saisie ne correspond pas à un numéro sénégalais à 9 chiffres significatifs.
export function normalizePhoneSN(raw: string): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');

  if (digits.startsWith('+221')) digits = digits.slice(4);
  else if (digits.startsWith('00221')) digits = digits.slice(5);
  else if (digits.startsWith('221') && digits.length > 9) digits = digits.slice(3);
  else if (digits.startsWith('+')) return null; // indicatif étranger non géré ici

  digits = digits.replace(/^0+/, ''); // certains saisissent 077...

  if (!/^7\d{8}$/.test(digits)) return null; // mobile SN = 9 chiffres commençant par 7
  return `+221${digits}`;
}

export async function detectCarrier(phoneE164: string): Promise<CarrierSN> {
  const national = phoneE164.replace('+221', '');
  const table = await loadPrefixTable();
  for (const entry of table) {
    if (national.startsWith(entry.prefix)) return entry.carrier;
  }
  return 'unknown';
}

// ⚠️ Doit produire EXACTEMENT la même chaîne que phoneToEmail() côté
// frontend (src/contexts/AuthContext.tsx : `${phone.replace(/\D/g,'')}@agrimarche.sn`),
// qui s'applique au numéro LOCAL tel que tapé par l'utilisateur (sans
// indicatif +221 — le formulaire n'en demande pas). normalizePhoneSN()
// renvoie lui la forme E.164 complète (+221XXXXXXXXX) ; on retire donc
// l'indicatif ici avant de reconstituer l'email, sous peine de générer
// un email qui ne correspond à aucun compte pour le login/reset.
export function phoneToSyntheticEmail(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '').replace(/^221/, '');
  return `${digits}@agrimarche.sn`;
}
