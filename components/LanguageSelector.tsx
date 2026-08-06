// components/LanguageSelector.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex gap-2 items-center">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 rounded ${language === 'en' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('pt')}
        className={`px-3 py-1 rounded ${language === 'pt' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
      >
        PT
      </button>
      <button
        onClick={() => setLanguage('es')}
        className={`px-3 py-1 rounded ${language === 'es' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
      >
        ES
      </button>
    </div>
  );
}
