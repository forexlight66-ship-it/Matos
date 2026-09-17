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

  if (status === null) return <LoadingScreen />;

  return status.authenticated ? <Dashboard /> : (
    <LoginPage
      initialPlatformReady={status.platformAuthenticated}
      initialUserName={status.user?.name || ''}
    />
  );
}
