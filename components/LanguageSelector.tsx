// components/LanguageSelector.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';

const languages = [
  { code: 'en' as const, flag: '🇬🇧', label: 'English' },
  { code: 'pt' as const, flag: '🇵🇹', label: 'Português' },
  { code: 'es' as const, flag: '🇪🇸', label: 'Español' },
];

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex gap-1.5 items-center">
      {languages.map(({ code, flag, label }) => (
        <button
          key={code}
          type="button"
          onClick={() => setLanguage(code)}
          aria-label={label}
          title={label}
          className={`w-9 h-8 rounded-lg text-lg leading-none transition ${language === code ? 'bg-blue-600 shadow-sm' : 'bg-gray-100 hover:bg-gray-200'}`}
        >
          {flag}
        </button>
      ))}
    </div>
  );
}
