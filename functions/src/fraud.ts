// ============================================================
//   fraud.ts — Signaux de fraude au-delà du simple rate-limiting
//   (qui plafonne un VOLUME, pas un COMPORTEMENT suspect).
//
//   ⚠️ Complément, pas remplacement : configure aussi Firebase App
//   Check côté client (attestation Play Integrity / DeviceCheck)
//   sur les callables registrationStart/resend/verify — c'est la
//   vraie ligne de défense contre un script qui n'utilise pas
//   l'app mobile réelle. Rien ici ne remplace App Check ; ces
//   heuristiques couvrent le trafic qui PASSE App Check mais reste
//   comportementalement anormal (usine à comptes légitimes en
//   apparence, etc.).
//
//   Toute détection ne BLOQUE PAS silencieusement — elle est
//   journalisée (audit + métrique) et, selon la sévérité, peut
//   imposer une vérification supplémentaire côté appelant plutôt
//   que de rejeter net un utilisateur légitime par erreur (éviter
//   les faux positifs qui empêchent un vrai agriculteur de s'inscrire).
// ============================================================
import * as admin from 'firebase-admin';

export interface FraudSignal {
  severity: 'low' | 'medium' | 'high';
  reason: string;
}

// Signal 1 — vélocité anormale par IP : une IP qui initie des
// inscriptions pour de nombreux numéros différents en peu de temps
// est typique d'un script de création de comptes en masse, pas d'un
// usage humain normal (un foyer/cyber-café peut légitimement générer
// 2-3 inscriptions, rarement 10+ en une heure).
export async function checkIpVelocity(ip: string, phone: string): Promise<FraudSignal | null> {
  if (ip === 'unknown') return null; // on ne pénalise pas l'absence d'IP détectable, juste on ne peut pas évaluer ce signal
  const ref = admin.firestore().collection('_fraudIpWindow').doc(ip);
  const now = Date.now();
  const WINDOW_MS = 60 * 60 * 1000;

  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const phones: string[] = withinWindow(data, now, WINDOW_MS) ? (data?.phones ?? []) : [];

    const distinctPhones = new Set([...phones, phone]);
    tx.set(
      ref,
      {
        phones: [...distinctPhones].slice(-50), // borne la taille du doc
        windowStart: withinWindow(data, now, WINDOW_MS) ? data!.windowStart : now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (distinctPhones.size >= 8) return { severity: 'high', reason: `IP a initié ${distinctPhones.size} numéros distincts en moins d'1h` };
    if (distinctPhones.size >= 4) return { severity: 'medium', reason: `IP a initié ${distinctPhones.size} numéros distincts en moins d'1h` };
    return null;
  });
}

function withinWindow(data: any, now: number, windowMs: number): boolean {
  return !!data?.windowStart && now - data.windowStart < windowMs;
}

// Signal 2 — un même push token réutilisé pour de nombreux numéros
// différents est suspect : un vrai appareil physique ne sert
// normalement qu'un seul flux d'inscription actif à la fois.
export async function checkPushTokenReuse(pushToken: string, phone: string): Promise<FraudSignal | null> {
  const ref = admin.firestore().collection('_fraudTokenWindow').doc(pushToken);
  const now = Date.now();
  const WINDOW_MS = 24 * 60 * 60 * 1000;

  return admin.firestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data();
    const phones: string[] = withinWindow(data, now, WINDOW_MS) ? (data?.phones ?? []) : [];
    const distinctPhones = new Set([...phones, phone]);

    tx.set(
      ref,
      {
        phones: [...distinctPhones].slice(-20),
        windowStart: withinWindow(data, now, WINDOW_MS) ? data!.windowStart : now,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (distinctPhones.size >= 5) return { severity: 'high', reason: `Push token réutilisé pour ${distinctPhones.size} numéros distincts en 24h` };
    return null;
  });
}

// Purge quotidienne des fenêtres anti-fraude, symétrique à
// purgeOldRateLimitDocs (rateLimit.ts) — sans ça, _fraudIpWindow et
// _fraudTokenWindow grossissent indéfiniment (un doc par IP/token
// jamais revu depuis, jamais nettoyé). Les fenêtres elles-mêmes ne font
// que 1h/24h, donc tout ce qui n'a pas été touché depuis plusieurs jours
// est certainement obsolète et ne sert plus à rien pour la détection.
async function purgeOldFraudWindowDocs(collectionName: string, olderThanMs: number): Promise<number> {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - olderThanMs);
  const snap = await admin
    .firestore()
    .collection(collectionName)
    .where('updatedAt', '<', cutoff)
    .limit(400)
    .get();
  if (snap.empty) return 0;
  const batch = admin.firestore().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
  return snap.size;
}

export async function purgeOldFraudWindows(olderThanMs: number): Promise<{ ip: number; token: number }> {
  const [ip, token] = await Promise.all([
    purgeOldFraudWindowDocs('_fraudIpWindow', olderThanMs),
    purgeOldFraudWindowDocs('_fraudTokenWindow', olderThanMs),
  ]);
  return { ip, token };
}

// Point d'entrée unique appelé par registrationStart : agrège les
// signaux, ne bloque QUE sur 'high' (les 'medium' sont journalisés
// pour surveillance mais laissent l'utilisateur légitime continuer).
export async function evaluateFraudSignals(
  ip: string,
  phone: string,
  pushToken: string | undefined
): Promise<{ blocked: boolean; signals: FraudSignal[] }> {
  const signals: FraudSignal[] = [];

  const ipSignal = await checkIpVelocity(ip, phone).catch((err) => {
    console.warn('⚠️ checkIpVelocity indisponible:', err);
    return null;
  });
  if (ipSignal) signals.push(ipSignal);

  if (pushToken) {
    const tokenSignal = await checkPushTokenReuse(pushToken, phone).catch((err) => {
      console.warn('⚠️ checkPushTokenReuse indisponible:', err);
      return null;
    });
    if (tokenSignal) signals.push(tokenSignal);
  }

  const blocked = signals.some((s) => s.severity === 'high');
  return { blocked, signals };
}
