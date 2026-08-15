'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TutorialSection() {
  const { language, t } = useLanguage();
  const [showVideo, setShowVideo] = useState(true);
  const videoUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ?enablejsapi=1&playsinline=1&rel=0';

  const setVideoVolume = (event: React.SyntheticEvent<HTMLIFrameElement>) => {
    try { event.currentTarget.contentWindow?.postMessage(JSON.stringify({ event:'command', func:'setVolume', args:[100] }), '*'); } catch {}
  };

  return (
    <div className="card mb-6" id="tutorial-section">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">🎓 {t('tutorialTitle')}</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setShowVideo(true)} className={`px-3 py-1 rounded font-bold ${showVideo ? 'tutorial-video-active' : 'bg-gray-200'}`}>📺 {t('videoTutorial')}</button>
        <button onClick={() => setShowVideo(false)} className={`px-3 py-1 rounded ${!showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>📖 {language === 'pt' ? 'Guia Escrito' : language === 'es' ? 'Guía Escrita' : 'Written Guide'}</button>
      </div>
      <style jsx>{`.tutorial-video-active{position:relative;display:inline-flex;align-items:center;justify-content:center;color:#fff;background:#dc2626;overflow:hidden;min-width:120px}.tutorial-video-active::after{content:'';position:absolute;left:0;right:0;bottom:0;height:4px;background:#ef4444}`}</style>
      {showVideo ? (
        <div className="w-full rounded-lg overflow-hidden shadow">
          <iframe src={videoUrl} title="MozHyper Digits Tutorial" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen onLoad={setVideoVolume} className="w-full aspect-video" />
          <div className="text-xs mt-2 opacity-70">🔊 Volume: 100% — use the player control to adjust.</div>
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg text-gray-700 space-y-4 leading-relaxed">
          <h3 className="font-semibold text-lg">{language === 'pt' ? 'Guia de Trading de Dígitos' : language === 'es' ? 'Guía de Trading de Dígitos' : 'Digits Trading Guide'}</h3>
          <p>{language === 'pt' ? 'O trading de dígitos na Deriv baseia-se em prever o último número (0 a 9) do preço no momento da expiração.' : language === 'es' ? 'El trading de dígitos en Deriv consiste en predecir el último número (0 a 9) del precio al vencimiento.' : 'Digits trading on Deriv is based on predicting the final number (0 to 9) of the price at expiry.'}</p>
          <h4 className="font-semibold">{language === 'pt' ? 'Conceitos Básicos' : language === 'es' ? 'Conceptos Básicos' : 'Basic Concepts'}</h4>
          <p>{language === 'pt' ? 'Cada operação dura poucos ticks e o resultado é determinado pelo preço final.' : language === 'es' ? 'Cada operación dura pocos ticks y el resultado se determina por el precio final.' : 'Each trade lasts a few ticks and the result is determined by the final price.'}</p>
          <p><strong>{language === 'pt' ? 'Igual/Diferente:' : language === 'es' ? 'Igual/Diferente:' : 'Match/Differs:'}</strong> {language === 'pt' ? 'preveja se o último dígito será igual ou diferente do escolhido.' : language === 'es' ? 'predice si el último dígito será igual o diferente al elegido.' : 'predict whether the final digit will match or differ from your chosen digit.'}</p>
        </div>
      )}
    </div>
  );
}
