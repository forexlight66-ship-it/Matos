// app/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';
import ProfessionalLoader from '@/components/ProfessionalLoader';

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loadSession = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store', credentials: 'same-origin' });
        const data = await res.json();
        if (!cancelled) setAuthenticated(Boolean(data.authenticated));
      } catch {
        if (!cancelled) setAuthenticated(false);
      }
    };
    loadSession();
    return () => { cancelled = true; };
  }, []);

  if (authenticated === null) {
    return <ProfessionalLoader stage="auth" />;
  }

  return authenticated ? <Dashboard /> : <LoginPage />;
}
