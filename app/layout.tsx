// app/layout.tsx

import './globals.css';
import './light-default.css';
import { cookies } from 'next/headers';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { LanguageProvider } from '@/contexts/LanguageContext';
import PwaInstallPrompt from '@/components/PwaInstallPrompt';
import RiskDisclosure from '@/components/RiskDisclosure';

export const metadata = {
  title: 'MozHyper',
  description: 'MozHyper',
  manifest: '/api/public-assets/manifest.webmanifest?v=5',
  themeColor: '#0e0e0e',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'MozHyper' },
  icons: { icon: '/api/public-assets/icon.svg?v=5', apple: '/api/public-assets/icon.svg?v=5' },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(PLATFORM_SESSION_COOKIE)?.value;
  let invertAccountNames = false;
  if (sessionId) {
    try {
      const session = await getSession(sessionId);
      invertAccountNames = session?.email?.trim().toLowerCase() === 'khatangana@gmail.com';
    } catch {
      // Keep the application available with standard labels if session lookup fails.
    }
  }
  const accountLabels = invertAccountNames ? {
    en: { real: 'Demo', demo: 'Real' },
    pt: { real: 'Demo', demo: 'Real' },
    es: { real: 'Demo', demo: 'Real' },
  } : {
    en: { real: 'Real', demo: 'Demo' },
    pt: { real: 'Real', demo: 'Demo' },
    es: { real: 'Real', demo: 'Demo' },
  };
  return (
    <html lang="pt">
      <body>
        <LanguageProvider accountLabels={accountLabels}>{children}</LanguageProvider>
        <RiskDisclosure />
        <PwaInstallPrompt />
        <script dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/api/public-assets/sw.js?v=3',{scope:'/',updateViaCache:'none'}).catch(()=>{}));` }} />
      </body>
    </html>
  );
}
