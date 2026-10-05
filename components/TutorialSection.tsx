'use client';

import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_AFFILIATE_LINK = 'https://t.deriv.link?t=JAZWN4WCY6JS';

// Temporary: the English lesson intentionally uses the same video URL.
// Replace VIDEO_URL_EN later with the English lesson URL.
const VIDEO_URL_PT = 'https://www.youtube.com/embed/0-uSXkLBH0Q?enablejsapi=1&playsinline=1&rel=0';
const VIDEO_URL_EN = VIDEO_URL_PT;

export default function TutorialSection() {
  const { language, t } = useLanguage();
  const isEnglish = language === 'en';
  const videoUrl = isEnglish ? VIDEO_URL_EN : VIDEO_URL_PT;
  const lessonLabel = isEnglish ? '📺 Aula English' : '📺 Aula português';

  return (
    <div className="card mb-6" id="tutorial-section">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        🎓 {t('tutorialTitle')}
      </h2>

      <div className="mb-4">
        <span className="tutorial-lesson-label">{lessonLabel}</span>
      </div>

      <style jsx>{`
        .tutorial-lesson-label{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          min-height:36px;
          padding:7px 14px;
          border-radius:8px;
          font-weight:700;
          color:#fff;
          background:#dc2626;
          box-sizing:border-box;
        }
      `}</style>

      <div className="w-full rounded-lg overflow-hidden shadow">
        <iframe
          src={videoUrl}
          title={isEnglish ? 'Digits Tutorial - English' : 'Como negociar Dígitos - Aula português'}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="w-full aspect-video"
        />
      </div>

      <div className="mt-4">
        <a
          href={DERIV_AFFILIATE_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow hover:bg-blue-700"
        >
          🚀 {isEnglish ? 'Open Deriv account' : 'Abrir conta Deriv'}
        </a>
      </div>
    </div>
  );
}
