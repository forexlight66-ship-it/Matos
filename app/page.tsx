'use client';

import { useEffect, useState } from 'react';
import Dashboard from '@/components/Dashboard';
import LoginPage from '@/components/LoginPage';
import LoadingScreen from '@/components/LoadingScreen';
import LandingPage from '@/components/LandingPage';

export default function Home() {
  const [status, setStatus] = useState<{ authenticated: boolean; platformAuthenticated: boolean; user: { name?: string } | null } | null>(null);
  const [authError, setAuthError] = useState('');
  const [authMode, setAuthMode] = useState<'register' | 'login' | null>(null);
  const [authMode, setAuthMode] = useState<'register' | 'login' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedMode = params.get('authview');
    if (requestedMode === 'login' || requestedMode === 'register') setAuthMode(requestedMode);
    const reason = params.get('auth_error');
    if (reason) {
      setAuthError(reason.slice(0, 220));
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

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

  if (status.authenticated) return <Dashboard />;
  if (authMode === null) return <LandingPage onChoose={(mode) => { setAuthMode(mode); window.history.replaceState({}, document.title, window.location.pathname + '?authview=' + mode); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />;
  return (
    <LoginPage
      initialPlatformReady={status.platformAuthenticated}
      initialUserName={status.user?.name || ''}
      initialAuthError={authError}
    />
  );
}
