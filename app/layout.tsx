// app/layout.tsx

import './globals.css';
import './light-default.css';
import { LanguageProvider } from '@/contexts/LanguageContext';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import RiskDisclosure from '@/components/RiskDisclosure';

export const metadata = {
  title: 'MozHyper',
  description: 'MozHyper',
  manifest: '/api/public-assets/manifest.webmanifest?v=3',
  themeColor: '#0e0e0e',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MozHyper' },
  icons: { icon: '/api/public-assets/icon.svg?v=3', apple: '/api/public-assets/icon.svg?v=3' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <body>
        <LanguageProvider>{children}</LanguageProvider>
        <RiskDisclosure />
        <PwaInstallPrompt />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/api/public-assets/sw.js?v=3',{scope:'/',updateViaCache:'none'}).catch(()=>{}));` }} />
      </body>
    </html>
  );
}
