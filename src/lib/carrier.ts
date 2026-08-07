/**
 * Détection de l'opérateur sénégalais à partir du numéro de téléphone.
 *
 * Préfixes (source : répartition Sonatel/Orange, Free (ex-Tigo/Yas),
 * Expresso — à ajuster si l'ARTP réattribue des plages) :
 *   - Orange   : 77, 78
 *   - Free     : 76
 *   - Expresso : 70, 75
 *
 * Pourquoi c'est important : Firebase Phone Auth (SMS envoyés par Google)
 * délivre de façon fiable sur Orange au Sénégal, mais échoue très
 * régulièrement sur Free et Expresso. On route donc ces deux derniers
 * vers un système OTP maison (Africa's Talking), et on garde Firebase
 * uniquement pour Orange.
 */

export type Carrier = 'orange' | 'free' | 'expresso' | 'unknown';

/** Retire tout sauf les chiffres, puis retire l'indicatif 221 s'il est présent. */
function localDigits(phone: string): string {
  let digits = phone.replace(/\D/g, '');
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
