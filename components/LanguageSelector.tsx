// components/LanguageSelector.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';

const options = [
  { code: 'en' as const, flag: '🇬🇧', label: 'English' },
  { code: 'pt' as const, flag: '🇵🇹', label: 'Português' },
  { code: 'es' as const, flag: '🇪🇸', label: 'Español' },
];

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex gap-1.5 items-center" aria-label="Language selector">
      {options.map(option => (
        <button
          key={option.code}
          onClick={() => setLanguage(option.code)}
          aria-label={option.label}
          title={option.label}
          className={`px-2.5 py-1.5 rounded ${language === option.code ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
        >
          <span aria-hidden="true" className="text-base leading-none">{option.flag}</span>
        </button>
      ))}
    </div>
  );
}
