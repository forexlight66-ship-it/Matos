// components/TutorialSection.tsx

'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TutorialSection() {
  const { t } = useLanguage();
  const [showVideo, setShowVideo] = useState(true);

  // Replace with your own video URL
  const videoUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

  return (
    <div className="card mb-6">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        🎓 {t('tutorialTitle')}
      </h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setShowVideo(true)}
          className={`px-3 py-1 rounded ${showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          📺 {t('video')}
        </button>
        <button
          onClick={() => setShowVideo(false)}
          className={`px-3 py-1 rounded ${!showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
        >
          📖 {t('guide')}
        </button>
      </div>

      {showVideo ? (
        <div className="aspect-w-16 rounded-lg overflow-hidden shadow">
          <iframe
            src={videoUrl}
            title={t('tutorialTitle')}
            allowFullScreen
            className="w-full h-80 md:h-96"
          />
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-lg">{t('guideTitle')}</h3>
          <ul className="list-disc list-inside space-y-2 mt-2 text-gray-700">
            <li>{t('step1')}</li>
            <li>{t('step2')}</li>
            <li>{t('step3')}</li>
            <li>{t('step4')}</li>
            <li>{t('step5')}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
