import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { NotificationProvider } from '@/components/NotificationProvider';
// Remove: import AndroidBackHandler from '@/components/AndroidBackHandler';

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
            {/* Remove: <AndroidBackHandler /> */}
            {children}
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}