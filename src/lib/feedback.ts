// ============================================================
//   feedback.ts — Retour haptique (vibration) sur les moments clés.
//
//   Sert à rendre l'enchaînement « code reçu → compte créé → catalogue »
//   perceptible sans rien lire : une petite vibration à la réception du
//   code, une plus franche à la réussite. Sur un téléphone posé sur la
//   table, c'est ce qui fait lever les yeux au bon moment.
//
//   ⚠️ AUCUN import de @capacitor/haptics ici, volontairement. Le plugin
//   n'est pas installé dans ce projet, et un `import('@capacitor/haptics')`
//   — même enveloppé dans un .catch() — casserait `npm run build` : le
//   bundler résout les spécificateurs de modules à la COMPILATION, bien
//   avant que le catch puisse servir à quoi que ce soit.
//   On lit donc le registre de plugins que Capacitor expose déjà sur
//   window.Capacitor.Plugins. Conséquences :
//     - plugin absent (cas actuel)  → repli navigator.vibrate (Android) ;
//     - `npm i @capacitor/haptics` + npx cap sync un jour → ce fichier
//       s'en sert automatiquement, sans une ligne à changer ;
//     - iOS sans le plugin → pas de vibration (navigator.vibrate n'existe
//       pas sur WebKit). Ce n'est pas une panne, juste l'absence d'un
//       agrément.
//
//   Entièrement best-effort et silencieux : ce fichier ne doit jamais
//   pouvoir faire échouer un parcours.
// ============================================================

type Strength = 'light' | 'medium' | 'success' | 'warning';

// Repli web : ignoré par WebKit et par les navigateurs sans geste
// utilisateur récent — d'où le try/catch.
const WEB_PATTERNS: Record<Strength, number | number[]> = {
  light: 12,
  medium: 25,
  success: [18, 60, 40],
  warning: [30, 80, 30],
};

/** Plugin Haptics s'il a été enregistré par Capacitor, sinon null. */
function nativeHaptics(): any | null {
  if (typeof window === 'undefined') return null;
  const cap = (window as any).Capacitor;
  if (!cap?.isNativePlatform?.()) return null;
  return cap?.Plugins?.Haptics ?? null;
}

export async function haptic(strength: Strength = 'light'): Promise<void> {
  if (typeof window === 'undefined') return;

  const plugin = nativeHaptics();
  if (plugin) {
    try {
      // Les valeurs attendues sont des chaînes ('SUCCESS', 'LIGHT'…) :
      // on les passe littéralement plutôt que via les enums du paquet,
      // qui ne sont justement pas importables ici.
      if (strength === 'success' && typeof plugin.notification === 'function') {
        await plugin.notification({ type: 'SUCCESS' });
        return;
      }
      if (strength === 'warning' && typeof plugin.notification === 'function') {
        await plugin.notification({ type: 'WARNING' });
        return;
      }
      if (typeof plugin.impact === 'function') {
        await plugin.impact({ style: strength === 'medium' ? 'MEDIUM' : 'LIGHT' });
        return;
      }
    } catch {
      // On tente quand même le repli web ci-dessous.
    }
  }

  try {
    (navigator as any)?.vibrate?.(WEB_PATTERNS[strength]);
  } catch {
    /* rien à faire */
  }
}
