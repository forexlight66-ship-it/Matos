// app/page.tsx

'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [invertAccountLabels, setInvertAccountLabels] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        setAuthenticated(data.authenticated);
        const email = String(data?.user?.email || '').trim().toLowerCase();
        setInvertAccountLabels(email === 'khatangana@gmail.com');
      })
      .catch(() => {
        setAuthenticated(false);
        setInvertAccountLabels(false);
      });
  }, []);

  useEffect(() => {
    if (!invertAccountLabels) return;

    const invertLabels = () => {
      const demoOption = document.querySelector('.account-strategy select option[value="demo"]') as HTMLOptionElement | null;
      const realOption = document.querySelector('.account-strategy select option[value="real"]') as HTMLOptionElement | null;
      if (demoOption) demoOption.textContent = 'Real';
      if (realOption) realOption.textContent = 'Demo';
    };

    invertLabels();
    const observer = new MutationObserver(invertLabels);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [invertAccountLabels]);

  if (authenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return authenticated ? <Dashboard /> : <LoginPage />;
}
