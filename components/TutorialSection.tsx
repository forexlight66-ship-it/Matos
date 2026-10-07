'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_AFFILIATE_LINK = 'https://t.deriv.link?t=JAZWN4WCY6JS';

const VIDEO_URL_PT = 'https://www.youtube.com/embed/0-uSXkLBH0Q?enablejsapi=1&playsinline=1&rel=0';
const VIDEO_URL_PT_MZN = 'https://www.youtube.com/embed/JiDzX1Mu09k?enablejsapi=1&playsinline=1&rel=0';
const VIDEO_URL_EN = 'https://www.youtube.com/embed/E4ripWokAPo?enablejsapi=1&playsinline=1&rel=0';

export default function TutorialSection() {
  const { language, t } = useLanguage();
  const [currency, setCurrency] = useState('USD');
  const isPortuguese = language === 'pt';

  useEffect(() => {
    let alive = true;
    const loadCurrency = async () => {
      try {
        const response = await fetch('/api/currency', { cache: 'no-store' });
        const data = response.ok ? await response.json() : null;
        const code = String(data?.currency || localStorage.getItem('mozhyper-currency') || 'USD').toUpperCase();
        if (alive) {
          setCurrency(code);
          try { localStorage.setItem('mozhyper-currency', code); } catch {}
        }
      } catch {
        const code = String(localStorage.getItem('mozhyper-currency') || 'USD').toUpperCase();
        if (alive) setCurrency(code);
      }
    };
    void loadCurrency();
    return () => { alive = false; };
  }, []);

  const isMzn = currency === 'MZN';
  const videoUrl = isPortuguese ? (isMzn ? VIDEO_URL_PT_MZN : VIDEO_URL_PT) : VIDEO_URL_EN;
  const videoLabel = isPortuguese ? '📺 Aula português' : '📺 Aula English';
  const videoTitle = isPortuguese ? 'Aula em português' : 'English lesson';

  return (
    <div className="card mb-6" id="tutorial-section">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">🎓 {t('tutorialTitle')}</h2>
      <div className="mb-4">
        <span className="inline-flex items-center rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white">
          {videoLabel}
        </span>
      </div>
      <div className="w-full rounded-lg overflow-hidden shadow">
        <iframe
          src={videoUrl}
          title={videoTitle}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="w-full aspect-video"
        />
      </div>
      <div className="mt-3">
        <a
          href={DERIV_AFFILIATE_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow hover:bg-blue-700"
        >
          🚀 {isPortuguese ? 'Abrir conta Deriv' : 'Open Deriv account'}
        </a>
      </div>
    </div>
  );
}
