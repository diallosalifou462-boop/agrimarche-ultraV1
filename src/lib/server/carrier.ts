/**
 * Détection de l'opérateur sénégalais à partir du numéro de téléphone.
 *
 * Préfixes (source : répartition Sonatel/Orange, Free — rebrandé "Yas" —,
 * Expresso — à ajuster si l'ARTP réattribue des plages) :
 *   - Orange   : 77, 78
 *   - Free/Yas : 76
 *   - Expresso : 70, 75
 *
 * Pourquoi c'est important : Firebase Phone Auth (SMS envoyés par Google)
 * délivre de façon fiable sur Orange au Sénégal, mais échoue très
 * régulièrement sur Free/Yas et Expresso. On route donc ces deux derniers
 * vers notre propre backend OTP (génération + vérification du code côté
 * serveur), qui envoie le SMS via Infobip — voir
 * src/app/api/otp/send/route.ts — et on garde Firebase Phone Auth pour
 * Orange (et tout préfixe non reconnu, par défaut).
 */

export type Carrier = 'orange' | 'free' | 'expresso' | 'unknown';

/** Retire tout sauf les chiffres, puis retire l'indicatif 221 s'il est présent. */
function localDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  // ⚠️ FIX (26/09) : « 00221 76… » (format international) donnait le préfixe
  // « 00 » → opérateur inconnu → routé vers Firebase (Orange) au lieu
  // d'Infobip pour un numéro Free/Expresso.
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('221')) digits = digits.slice(3);
  return digits;
}

export function detectCarrier(phone: string): Carrier {
  const digits = localDigits(phone);
  const prefix2 = digits.slice(0, 2);

  if (prefix2 === '77' || prefix2 === '78') return 'orange';
  if (prefix2 === '76') return 'free';
  if (prefix2 === '70' || prefix2 === '75') return 'expresso';
  return 'unknown';
}

/** true si Firebase Phone Auth (SMS Google) est fiable pour ce numéro. */
export function useFirebasePhoneAuth(phone: string): boolean {
  return detectCarrier(phone) === 'orange';
}
