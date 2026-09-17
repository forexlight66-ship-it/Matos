'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';
import LoadingScreen from '@/components/LoadingScreen';

export default function Home() {
  const [status, setStatus] = useState<{ authenticated: boolean; platformAuthenticated: boolean; user: { name?: string } | null } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => setStatus({ authenticated: data.authenticated, platformAuthenticated: data.platformAuthenticated, user: data.user }))
      .catch(() => setStatus({ authenticated: false, platformAuthenticated: false, user: null }));
  }, []);

  useEffect(() => {
    if (!status?.authenticated) return;
    const timer = window.setTimeout(() => {
      const strategySelect = document.querySelector<HTMLSelectElement>('.account-strategy select');
      if (!strategySelect) return;
      strategySelect.value = 'ACIMA5_BAIXO4';
      strategySelect.dispatchEvent(new Event('change', { bubbles: true }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [status?.authenticated]);

  if (status === null) return <LoadingScreen />;

  return status.authenticated ? <Dashboard /> : (
    <LoginPage
      initialPlatformReady={status.platformAuthenticated}
      initialUserName={status.user?.name || ''}
    />
  );
}
