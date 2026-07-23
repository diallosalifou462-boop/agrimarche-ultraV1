'use client';

// =====================================================
// ⚡ FIX (duplication de listeners) : ce fichier créait auparavant SA
// PROPRE souscription à `onAuthStateChanged`, indépendante de celle
// d'`AuthContext.tsx`. Comme 27 fichiers du projet importent `useAuth`
// depuis ICI, cela créait jusqu'à 27 listeners Auth simultanés (+1 dans
// AuthContext), 27 lectures Firestore concurrentes pour le même
// utilisateur au démarrage, et donc une charge qui contribuait au
// déclenchement des filets de sécurité de 8s observés en pratique.
//
// Toute la logique (signIn, signUp, logout, le filet de sécurité 8s,
// l'enregistrement FCM...) vit maintenant dans `AuthContext.tsx`, monté
// UNE SEULE FOIS à la racine de l'app (voir layout.tsx / AuthProvider).
// Ce fichier ne fait plus que relayer ce contexte, pour ne pas avoir à
// modifier les 27 fichiers qui importent déjà `useAuth` depuis
// `@/hooks/useAuth`.
//
// ⚠️ Si ce fichier lève l'erreur "useAuth must be used within an
// AuthProvider", c'est que `<AuthProvider>` (depuis
// `@/contexts/AuthContext`) n'englobe pas encore ce composant dans
// l'arborescence — vérifier qu'il est bien présent dans le layout racine
// (`src/app/layout.tsx`).
// =====================================================

export { useAuth, phoneToEmail } from '@/contexts/AuthContext';
