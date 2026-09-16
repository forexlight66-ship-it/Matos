// app/layout.tsx

import './globals.css';
import './light-default.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import GlobalLanguageSelector from '@/components/GlobalLanguageSelector';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import RiskDisclosure from '@/components/RiskDisclosure';

export const metadata = {
  title: 'MozHyper',
  description: 'MozHyper',
  manifest: '/manifest.webmanifest',
  themeColor: '#f5f7fb',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'MozHyper' },
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        <LanguageProvider>
          <GlobalLanguageSelector />
          {children}
        </LanguageProvider>
        <RiskDisclosure />
        <PwaInstallPrompt />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));` }} />
      </body>
    </html>
  );
}
