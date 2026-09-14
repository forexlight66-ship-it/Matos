// app/layout.tsx

import './globals.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';

export const metadata = {
  title: 'MatosFX Smart Panel',
  description: 'MatosFX Smart Panel',
  manifest: '/manifest.webmanifest',
  themeColor: '#0e0e0e',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MatosFX' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
        <PwaInstallPrompt />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));` }} />
      </body>
    </html>
  );
}
