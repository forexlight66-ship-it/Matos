// app/layout.tsx

import './globals.css';
import { LanguageProvider } from '@/contexts/LanguageContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <main className="container mx-auto px-4 py-8 max-w-6xl">
            {children}
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
