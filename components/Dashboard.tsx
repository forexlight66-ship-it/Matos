// components/Dashboard.tsx

'use client';

import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';
import ProfitTable from './ProfitTable';
import DigitsGame from './DigitsGame';
import TutorialSection from './TutorialSection';
import LanguageSelector from './LanguageSelector';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const { balance, tick, isConnected, isAuthorized, error } = useDeriv();
  const { t } = useLanguage();
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  if (!authenticated) {
    return null;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">{t('title')}</h1>
        <div className="flex items-center gap-4">
          <LanguageSelector />
          <button
            onClick={() => window.location.href = '/api/auth/logout'}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
          >
            {t('logout')}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {t('error')}: {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card">
          <h3 className="font-semibold text-gray-500">{t('connection')}</h3>
          <p className="text-lg">
            {isConnected ? '🟢' : '🔴'} {isConnected ? t('connected') : t('disconnected')}
          </p>
          <p>
            {isAuthorized ? '✅' : '❌'} {isAuthorized ? t('authorized') : t('notAuthorized')}
          </p>
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-500">{t('balance')}</h3>
          {balance ? (
            <p className="text-2xl font-bold text-green-600">
              {balance.balance} {balance.currency}
            </p>
          ) : (
            <p className="text-gray-400">{t('waitingBalance')}</p>
          )}
        </div>
        <div className="card">
          <h3 className="font-semibold text-gray-500">{t('lastTick')}</h3>
          {tick ? (
            <>
              <p className="text-sm text-gray-600">{tick.symbol}</p>
              <p className="text-2xl font-bold">{tick.quote}</p>
              <p className="text-xs text-gray-400">
                {new Date(tick.epoch * 1000).toLocaleTimeString()}
              </p>
            </>
          ) : (
            <p className="text-gray-400">{t('waitingTick')}</p>
          )}
        </div>
      </div>

      <TutorialSection />
      <DigitsGame />
      <ProfitTable />
    </div>
  );
}
