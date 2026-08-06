// app/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return authenticated ? <Dashboard /> : <LoginPage />;
}
