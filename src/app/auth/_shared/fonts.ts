// src/app/auth/_shared/fonts.ts
//
// Paire typographique dédiée à l'écran de connexion / mot de passe oublié
// — distincte du reste de l'app (qui reste en sans-serif système) pour
// donner à la "porte d'entrée" d'AgriMarché une identité propre : un
// serif chaleureux pour les titres (registre "carnet de marché", pas
// SaaS générique), un grotesque discret pour tout le reste.
import { Fraunces, Work_Sans } from 'next/font/google';

export const displayFont = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const uiFont = Work_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});
