import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/components/NotificationProvider';
import OfflineBanner from '@/components/OfflineBanner';

export const metadata: Metadata = {
  title: 'AgriMarché - Votre marché agricole',
  description: 'Achetez et vendez des produits agricoles frais au Sénégal',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AuthProvider>
          <NotificationProvider>
            {children}
            <OfflineBanner />
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

