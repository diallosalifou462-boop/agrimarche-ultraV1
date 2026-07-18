'use client';

// src/hooks/userProfile.ts
//
// Ce fichier n'est importé par aucun autre module du projet (vérifié) —
// l'implémentation réelle et utilisée partout est dans
// src/lib/firebase/userProfile.ts. Il est cependant tout de même
// type-checké au build (tsconfig inclut tout src/), donc on le garde
// comme simple ré-export pour éviter :
//   1. une erreur de build si son import cassait à nouveau,
//   2. une divergence future entre deux copies de la même logique si
//      quelqu'un modifie l'une sans l'autre.

export { ensureUserExists } from '@/lib/firebase/userProfile';
export type { AppUserProfile } from '@/lib/firebase/userProfile';
