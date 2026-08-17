import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import { normalizeKeyword, extractKeywords } from './normalizeKeyword';

// ═══════════════════════════════════════════════════════════════════════
// trackInterest — enregistre qu'un utilisateur a cherché ou consulté
// quelque chose, pour permettre les notifications personnalisées de
// restock (trigger temps réel côté serveur) et le digest hebdomadaire.
// ═══════════════════════════════════════════════════════════════════════
// Stocké sur users/{uid}, deux champs :
//   - interestKeywords: string[]   → array-contains queryable (matching
//     restock en temps réel), fenêtre glissante des 40 plus récents.
//   - interestDetails: { [kw]: { count, lastSeenAt, source } } → sert au
//     classement du digest hebdo (les intérêts les plus forts d'abord).
//
// ⚠️ Lecture-puis-écriture (pas de transaction) : un utilisateur ne fait
// pas 2 recherches à la milliseconde près, la race condition théorique
// (perte d'un des deux points si écrits en concurrence) est acceptable
// pour ce cas d'usage — bien moins critique qu'un paiement ou un stock.
const MAX_KEYWORDS = 40;

export async function trackInterest(
  userId: string | undefined | null,
  rawText: string,
  source: 'search' | 'view'
): Promise<void> {
  if (!userId || !rawText || rawText.trim().length < 2) return;

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef).catch(() => null);

    // ⚠️ Consentement : si l'utilisateur a explicitement désactivé la
    // personnalisation (paramètre à ajouter côté écran "Compte" —
    // personalizedNotificationsEnabled === false), on n'enregistre RIEN.
    // Par défaut (champ absent), le tracking est actif : le push lui-même
    // nécessite déjà une permission OS distincte, ce qui constitue un
    // premier filtre de consentement, mais ce n'est PAS un consentement
    // RGPD explicite au sens strict — un écran de paramètres dédié avec ce
    // toggle reste à construire côté UI, ce champ ne fait qu'être respecté
    // une fois qu'il existe quelque part.
    if (snap?.data()?.personalizedNotificationsEnabled === false) return;

    const keywords = extractKeywords(rawText);
    if (keywords.length === 0) return;

    const existing = (snap?.data()?.interestKeywords as string[] | undefined) ?? [];
    const existingDetails = (snap?.data()?.interestDetails as Record<string, any> | undefined) ?? {};

    const now = Timestamp.now();
    const details: Record<string, any> = { ...existingDetails };
    for (const kw of keywords) {
      const prev = details[kw];
      details[kw] = {
        count: (prev?.count ?? 0) + 1,
        lastSeenAt: now,
        source, // dernière source ayant touché ce mot-clé
      };
    }

    // Fenêtre glissante : les nouveaux mots-clés poussent les plus anciens
    // hors du tableau au-delà de MAX_KEYWORDS, pour ne jamais laisser
    // l'array grossir indéfiniment sur un profil très actif.
    const merged = [...existing.filter((k) => !keywords.includes(k)), ...keywords];
    const capped = merged.slice(-MAX_KEYWORDS);

    await setDoc(
      userRef,
      { interestKeywords: capped, interestDetails: details, hasInterests: true },
      { merge: true }
    );
  } catch (err) {
    // Best-effort — un intérêt non enregistré ne doit jamais gêner
    // l'utilisateur en train de chercher ou de consulter un produit.
    console.warn('[trackInterest] échec silencieux:', err);
  }
}

export { normalizeKeyword };

// À appeler depuis un futur écran "Compte > Confidentialité". Si l'utilisateur
// désactive, on purge aussi l'historique déjà collecté plutôt que de le
// laisser trainer en base avec juste un flag — un vrai "désactiver" doit
// aussi être un vrai "oublier", pas seulement un interrupteur cosmétique.
// (activityHistogram inclus depuis l'ajout du tracking d'activité horaire,
// voir trackActivity.ts — même logique de consentement, même purge.)
export async function setPersonalizedNotificationsEnabled(
  userId: string,
  enabled: boolean
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await setDoc(
    userRef,
    enabled
      ? { personalizedNotificationsEnabled: true }
      : {
          personalizedNotificationsEnabled: false,
          interestKeywords: [],
          interestDetails: {},
          hasInterests: false,
          activityHistogram: [],
        },
    { merge: true }
  );
}

// Préférence fine par catégorie — lue côté serveur par
// passesPersonalizationGate (index.ts / Cloud Functions) sur
// userData.notificationPreferences.{category}. Contrairement à
// setPersonalizedNotificationsEnabled (interrupteur général qui purge tout
// l'historique), ceci ne fait que couper UN type de notification sans
// toucher au reste — ex: garder les alertes de retour en stock mais couper
// le résumé hebdomadaire. setDoc avec merge:true fusionne en profondeur
// dans la map existante, donc écrire { restock: false } ne touche pas une
// éventuelle valeur déjà présente pour { digest: ... }.
export type NotificationCategory = 'restock' | 'digest';
export async function setNotificationPreference(
  userId: string,
  category: NotificationCategory,
  enabled: boolean
): Promise<void> {
  const userRef = doc(db, 'users', userId);
  await setDoc(
    userRef,
    { notificationPreferences: { [category]: enabled } },
    { merge: true }
  );
}
