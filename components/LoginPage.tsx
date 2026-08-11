// components/LoginPage.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSelector from './LanguageSelector';

const DERIV_SIGNUP_URL = 'https://track.deriv.com/_xhgntjGPYQ7xidYl18iLj2Nd7ZgqdRLk/1/';

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

        <div className="mt-5 text-center">
          <p className="text-sm text-gray-500">Don't have a Deriv account?</p>
          <a
            href={DERIV_SIGNUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-2 text-sm font-semibold text-green-600 hover:text-green-700 hover:underline"
          >
            Create a Deriv account
          </a>
        </div>

        <p className="text-xs text-gray-400 mt-4 text-center">{t('loginDisclaimer')}</p>
      </div>
    </div>
  );
}
