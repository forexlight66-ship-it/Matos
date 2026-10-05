// app/layout.tsx

import './globals.css';
import './light-default.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import RiskDisclosure from '@/components/RiskDisclosure';

export const metadata = {
  title: 'MozHyper',
  description: 'MozHyper',
  manifest: '/manifest.webmanifest?v=2',
  themeColor: '#0e0e0e',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MozHyper' },
  icons: { icon: '/icon.svg?v=2', apple: '/icon.svg?v=2' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
        <RiskDisclosure />
        <PwaInstallPrompt />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));` }} />
      </body>
    </html>
  );
}
