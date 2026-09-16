'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';

export default function Home() {
  const [status, setStatus] = useState<{ authenticated: boolean; platformAuthenticated: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setStatus({ authenticated: data.authenticated, platformAuthenticated: data.platformAuthenticated }))
      .catch(() => setStatus({ authenticated: false, platformAuthenticated: false }));
  }, []);

  if (status === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return status.authenticated ? <Dashboard /> : <LoginPage initialPlatformReady={status.platformAuthenticated} />;
}
