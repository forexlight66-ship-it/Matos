// components/LoginPage.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSelector from './LanguageSelector';

export default function LoginPage() {
  const { t } = useLanguage();

  const handleLogin = () => {
    window.location.href = '/api/auth/login';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">{t('title')}</h1>
          <LanguageSelector />
        </div>
        <div className="text-center mb-8">
          <p className="text-gray-600">{t('loginSubtitle')}</p>
        </div>
        <button
          onClick={handleLogin}
          className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg shadow-md transition duration-200"
        >
          🔐 {t('loginWithDeriv')}
        </button>
        <p className="text-xs text-gray-400 mt-4 text-center">{t('loginDisclaimer')}</p>
      </div>
    </div>
  );
}
