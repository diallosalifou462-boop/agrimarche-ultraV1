import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';

// ═══════════════════════════════════════════════════════════════════════
// trackActivityTick — enregistre à quelle heure (UTC) un utilisateur est
// actif dans l'app, pour permettre au backend (index.ts / Cloud Functions,
// voir resolveQuietHours) de personnaliser SA fenêtre de silence plutôt
// que d'appliquer la même plage 22h-7h à tout le monde.
// ═══════════════════════════════════════════════════════════════════════
// Stocké sur users/{uid}.activityHistogram : tableau de 24 entiers,
// index = heure UTC (0-23), valeur = nombre de fois où l'utilisateur a été
// vu actif à cette heure. Le backend compare les sommes glissantes de 8h
// pour trouver sa plage la moins active — voir inferQuietHoursFromHistogram
// dans le fichier Cloud Functions.
//
// Même philosophie de consentement que trackInterest.ts : si l'utilisateur
// a désactivé la personnalisation (personalizedNotificationsEnabled ===
// false), on n'enregistre RIEN. Et comme pour les intérêts, désactiver
// purge aussi l'historique déjà collecté (voir setPersonalizedNotificationsEnabled
// dans trackInterest.ts, mis à jour pour effacer activityHistogram aussi).
//
// ⚠️ Lecture-puis-écriture (pas de transaction ni FieldValue.increment) :
// même arbitrage que trackInterest — un utilisateur ne déclenche pas 2
// ticks à la milliseconde près (throttlé à 1/heure/appareil ci-dessous),
// la race condition théorique est sans conséquence réelle sur un
// histogramme dont on ne regarde que les proportions.
const HOURS_IN_DAY = 24;
const THROTTLE_MS = 55 * 60 * 1000; // ~1 écriture Firestore max / heure / appareil
const DECAY_THRESHOLD = 2000; // total cumulé au-delà duquel on redémarre à moitié

// Le throttle vit en localStorage (par device), pas en mémoire du process
// React : sans ça, un remount de composant ou une navigation redéclenche
// un tick immédiat, ce qui viderait le sens du throttle.
function storageKey(userId: string): string {
  return `agrimarche_activity_tick_${userId}`;
}

export async function trackActivityTick(userId: string | undefined | null): Promise<void> {
  if (!userId || typeof window === 'undefined') return;

  try {
    const key = storageKey(userId);
    const lastTickMs = Number(window.localStorage.getItem(key) ?? 0);
    const nowMs = Date.now();
    if (nowMs - lastTickMs < THROTTLE_MS) return;

    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef).catch(() => null);

    // Même garde-fou de consentement que trackInterest — voir ce fichier
    // pour le raisonnement complet (opt-out explicite requis, sinon actif
    // par défaut, en attendant l'écran de préférences dédié).
    if (snap?.data()?.personalizedNotificationsEnabled === false) return;

    const existingRaw = snap?.data()?.activityHistogram;
    const existing: number[] =
      Array.isArray(existingRaw) && existingRaw.length === HOURS_IN_DAY
        ? existingRaw
        : new Array(HOURS_IN_DAY).fill(0);

    const hour = new Date().getUTCHours();
    const updated = [...existing];
    updated[hour] = (updated[hour] ?? 0) + 1;

    // Décroissance périodique : sans elle, un compte utilisé pendant des
    // mois finirait avec un histogramme dominé par un passé lointain
    // plutôt que le rythme de vie ACTUEL de la personne (ex: un
    // utilisateur qui a changé de fuseau ou de rythme de travail). Une
    // fois le total au-delà du seuil, on divise tout par 2 (arrondi) —
    // conserve les proportions, réduit le poids de l'historique ancien.
    const total = updated.reduce((sum, v) => sum + v, 0);
    const normalized = total > DECAY_THRESHOLD ? updated.map((v) => Math.floor(v / 2)) : updated;

    await setDoc(userRef, { activityHistogram: normalized }, { merge: true });
    window.localStorage.setItem(key, String(nowMs));
  } catch (err) {
    // Best-effort — un point d'activité non enregistré ne doit jamais
    // gêner l'utilisateur ni faire planter le reste de l'app.
    console.warn('[trackActivityTick] échec silencieux:', err);
  }
}
