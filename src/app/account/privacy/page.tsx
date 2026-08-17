'use client';

import { useEffect, useState, type ComponentType } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/firebase';
import {
  ArrowLeft, ShieldCheck, PackageSearch, CalendarClock,
  Loader2, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react';
import {
  setPersonalizedNotificationsEnabled,
  setNotificationPreference,
  type NotificationCategory,
} from '@/lib/interests/trackInterest';

// ═══════════════════════════════════════════════════════════════════════
// Compte > Confidentialité
// ═══════════════════════════════════════════════════════════════════════
// Seul écran qui expose à l'utilisateur les toggles déjà supportés côté
// données depuis un moment (trackInterest.ts, trackActivity.ts,
// passesPersonalizationGate côté Cloud Functions) mais jusqu'ici sans
// aucune UI pour les actionner — ce qui les rendait inertes en pratique :
// personne ne peut désactiver un champ qu'aucun écran n'affiche.
//
// Deux niveaux, cohérents avec ce que le backend sait déjà lire :
//   1. Interrupteur général (personalizedNotificationsEnabled) — en le
//      coupant, on purge aussi l'historique déjà collecté (voir
//      setPersonalizedNotificationsEnabled), pas seulement le flag.
//   2. Préférences fines par catégorie (notificationPreferences.restock /
//      .digest) — seulement utiles (et affichées actives) si le général
//      est activé ; les couper n'efface rien, juste "silence ce type-là".
//
// Écoute en temps réel (onSnapshot) plutôt qu'un simple fetch : si
// l'utilisateur a deux onglets ouverts ou vient de désactiver depuis un
// autre appareil, cet écran reste synchrone avec l'état réel en base.
export default function PrivacySettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [personalizationEnabled, setPersonalizationEnabled] = useState<boolean | null>(null);
  const [preferences, setPreferences] = useState<Record<NotificationCategory, boolean>>({
    restock: true,
    digest: true,
  });
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedPulse, setSavedPulse] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push('/auth/login');
  }, [authLoading, user, router]);

  // ── Sync temps réel du profil ────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(
      doc(db, 'users', user.uid),
      (snap) => {
        const data = snap.data() ?? {};
        // Champ absent = opt-in par défaut, cohérent avec la lecture faite
        // côté trackInterest.ts / index.ts (silence total uniquement si
        // explicitement === false quelque part dans la chaîne).
        setPersonalizationEnabled(data.personalizedNotificationsEnabled !== false);
        setPreferences({
          restock: data.notificationPreferences?.restock !== false,
          digest: data.notificationPreferences?.digest !== false,
        });
        setProfileLoading(false);
      },
      (err) => {
        console.error('[PrivacySettings] Erreur lecture profil:', err);
        setError('Impossible de charger vos préférences pour le moment.');
        setProfileLoading(false);
      }
    );
    return () => unsub();
  }, [user]);

  const flashSaved = () => {
    setSavedPulse(true);
    setTimeout(() => setSavedPulse(false), 1800);
  };

  const handleToggleGlobal = async () => {
    if (!user || personalizationEnabled === null) return;
    const next = !personalizationEnabled;
    setError(null);
    setSavingKey('global');
    setPersonalizationEnabled(next); // optimiste — onSnapshot corrigera si l'écriture échoue
    try {
      await setPersonalizedNotificationsEnabled(user.uid, next);
      flashSaved();
    } catch (err) {
      console.error('[PrivacySettings] Échec toggle global:', err);
      setPersonalizationEnabled(!next); // rollback
      setError("La modification n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleCategory = async (category: NotificationCategory) => {
    if (!user || !personalizationEnabled) return;
    const next = !preferences[category];
    setError(null);
    setSavingKey(category);
    setPreferences((prev) => ({ ...prev, [category]: next }));
    try {
      await setNotificationPreference(user.uid, category, next);
      flashSaved();
    } catch (err) {
      console.error(`[PrivacySettings] Échec toggle ${category}:`, err);
      setPreferences((prev) => ({ ...prev, [category]: !next })); // rollback
      setError("La modification n'a pas pu être enregistrée. Réessayez.");
    } finally {
      setSavingKey(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#f0faf4] flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-emerald-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f0faf4]" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* HERO */}
      <div className="relative bg-gradient-to-br from-emerald-600 via-green-600 to-teal-500 pt-14 pb-16 px-5 overflow-hidden">
        <div className="absolute -top-10 -right-10 w-52 h-52 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <button
          onClick={() => router.push('/account')}
          className="relative inline-flex items-center gap-2 text-white/80 hover:text-white transition mb-4"
        >
          <ArrowLeft size={18} />
          <span className="text-sm font-semibold">Retour au compte</span>
        </button>
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-black leading-tight">Confidentialité</h1>
            <p className="text-white/70 text-xs mt-0.5">Contrôlez ce qu'AgriMarché personnalise pour vous</p>
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div className="px-4 -mt-8 relative z-10 pb-12 space-y-4">

        {error && (
          <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-2xl">
            <AlertTriangle size={16} className="shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
        )}

        {savedPulse && (
          <div className="flex items-center gap-3 bg-emerald-600 text-white px-4 py-3 rounded-2xl shadow-lg shadow-emerald-200">
            <CheckCircle2 size={18} className="shrink-0" />
            <span className="text-sm font-semibold">Préférence enregistrée ✦</span>
          </div>
        )}

        {/* INTERRUPTEUR GÉNÉRAL */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 py-5 flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-gray-800">Notifications personnalisées</h2>
              <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                Basées sur vos recherches et vos horaires d'activité dans l'app (alertes de retour en stock,
                résumé hebdomadaire, envoi hors de vos heures de silence habituelles).
              </p>
              {personalizationEnabled === false && (
                <p className="text-xs text-amber-600 font-semibold mt-2 flex items-center gap-1.5">
                  <AlertTriangle size={12} />
                  Désactivé — votre historique de recherche a été effacé
                </p>
              )}
            </div>
            {profileLoading ? (
              <div className="w-12 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <Loader2 size={13} className="animate-spin text-gray-400" />
              </div>
            ) : (
              <ToggleSwitch
                checked={!!personalizationEnabled}
                onChange={handleToggleGlobal}
                disabled={savingKey === 'global'}
              />
            )}
          </div>
        </div>

        {/* PRÉFÉRENCES PAR CATÉGORIE */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <div className="px-5 pt-5 pb-1">
            <h2 className="text-sm font-bold text-gray-700 uppercase tracking-widest">Par type de notification</h2>
            {!personalizationEnabled && !profileLoading && (
              <p className="text-[11px] text-gray-400 mt-1">Activez le réglage ci-dessus pour ajuster ces options.</p>
            )}
          </div>

          <div className="px-5 pb-5 pt-3 space-y-2">
            <CategoryRow
              icon={PackageSearch}
              title="Retour en stock"
              description="Un produit que vous cherchiez redevient disponible"
              checked={preferences.restock}
              onChange={() => handleToggleCategory('restock')}
              disabled={!personalizationEnabled || savingKey === 'restock' || profileLoading}
            />
            <CategoryRow
              icon={CalendarClock}
              title="Résumé hebdomadaire"
              description="Chaque lundi, une sélection basée sur vos intérêts récents"
              checked={preferences.digest}
              onChange={() => handleToggleCategory('digest')}
              disabled={!personalizationEnabled || savingKey === 'digest' || profileLoading}
            />
          </div>
        </div>

        {/* INFO / LIEN VERS LA POLITIQUE COMPLÈTE */}
        <div className="bg-white rounded-2xl shadow-sm px-5 py-4">
          <p className="text-xs text-gray-500 leading-relaxed">
            Désactiver un réglage l'applique immédiatement : les notifications concernées s'arrêtent au prochain
            envoi. Désactiver l'interrupteur général efface aussi votre historique de recherche déjà enregistré —
            ce n'est pas juste une case cochée, c'est un vrai effacement.
          </p>
          <Link
            href="/privacy"
            className="inline-flex items-center gap-1.5 text-emerald-600 text-xs font-semibold mt-3"
          >
            Lire la politique de confidentialité complète <ExternalLink size={12} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-emerald-600' : 'bg-gray-200'
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function CategoryRow({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
  disabled,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 rounded-xl px-3 py-3 transition ${disabled ? 'opacity-50' : 'bg-gray-50'}`}>
      <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0 shadow-sm">
        <Icon size={16} className="text-emerald-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">{description}</p>
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}
