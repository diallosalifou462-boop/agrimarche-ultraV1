import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
// ✅ FIX : le vrai CartProvider utilisé par toute l'app (7 fichiers via
// useCart()) est dans @/hooks/useCart, pas @/contexts/CartContext (ce
// dernier n'est importé nulle part — code mort, laissé par un refactor
// antérieur). Pareil pour les notifications : @/components/NotificationProvider
// est le vrai, @/contexts/NotificationContext est mort aussi.
import { CartProvider } from '@/hooks/useCart';
import { NotificationProvider } from '@/components/NotificationProvider';
import OfflineBanner from '@/components/OfflineBanner';

// ✅ FIX CRITIQUE : ce fichier (src/app/layout.tsx) est le layout RACINE de
// toute l'app Next.js — il DOIT contenir <html>/<body> (obligatoire en App
// Router) et englober tout le monde avec les Providers React nécessaires.
//
// Avant : ce fichier contenait par erreur le contenu du sidebar
// dashboard/seller/layout.tsx (copié-collé au mauvais endroit). Résultat :
// ni <html>/<body>, ni <AuthProvider> nulle part dans toute l'app — ce qui
// faisait planter (au build ET en prod) toutes les pages qui utilisent
// useAuth() depuis @/contexts/AuthContext (admin/*, main/ai-assistant/*,
// dashboard/seller/layout.tsx) avec l'erreur
// "useAuth must be used within an AuthProvider".
//
// Le vrai contenu du sidebar vendeur est toujours intact dans
// src/app/dashboard/seller/layout.tsx — rien à changer là-bas.

export const metadata: Metadata = {
  title: 'AgriMarché Sénégal',
  description: 'La marketplace agricole du Sénégal',
};

// ⚠️ FIX : sans `viewportFit: 'cover'` (balise <meta name="viewport"
// content="viewport-fit=cover">), `env(safe-area-inset-top/bottom)` renvoie
// toujours 0 sur iOS — impossible pour n'importe quelle page de se décaler
// sous l'encoche/la barre de statut. C'est ce qui causait le chevauchement
// entre l'heure système et le contenu de l'app tout en haut de chaque page.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <AuthProvider>
          <CartProvider>
            <NotificationProvider>
              <OfflineBanner />
              {children}
            </NotificationProvider>
          </CartProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
