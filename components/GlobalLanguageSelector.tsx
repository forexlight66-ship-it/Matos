'use client';

import { useLanguage } from '@/contexts/LanguageContext';

type Lang = 'en' | 'pt' | 'es';

const options: Array<{ code: Lang; flag: string; label: string }> = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'pt', flag: '🇵🇹', label: 'Português' },
  { code: 'es', flag: '🇪🇸', label: 'Español' },
];

export default function GlobalLanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <div
      aria-label="Language selector"
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 700,
        display: 'flex',
        gap: 4,
        padding: 4,
        borderRadius: 10,
        background: 'rgba(255,255,255,.94)',
        border: '1px solid #dbe3ed',
        boxShadow: '0 8px 24px rgba(31,41,55,.12)',
        backdropFilter: 'blur(8px)',
      }}
    >
      {options.map((item) => (
        <button
          key={item.code}
          type="button"
          title={item.label}
          aria-label={item.label}
          aria-pressed={language === item.code}
          onClick={() => setLanguage(item.code)}
          style={{
            width: 34,
            height: 30,
            border: 0,
            borderRadius: 7,
            cursor: 'pointer',
            fontSize: 17,
            lineHeight: 1,
            background: language === item.code ? '#2563eb' : 'transparent',
            boxShadow: language === item.code ? '0 2px 8px rgba(37,99,235,.25)' : 'none',
          }}
        >
          {item.flag}
        </button>
      ))}
    </div>
  );
}
