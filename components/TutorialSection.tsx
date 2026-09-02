'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_AFFILIATE_LINK = 'https://t.deriv.link?t=JAZWN4WCY6JS';

export default function TutorialSection() {
  const { language, t } = useLanguage();
  const [showVideo, setShowVideo] = useState(true);
  const videoUrl = 'https://www.youtube.com/embed/0-uSXkLBH0Q?enablejsapi=1&playsinline=1&rel=0';

  return (
    <div className="card mb-6" id="tutorial-section">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">🎓 {t('tutorialTitle')}</h2>
      <div className="flex flex-wrap gap-2 mb-4 tutorial-tabs">
        <button onClick={() => setShowVideo(true)} className={`tutorial-tab ${showVideo ? 'tutorial-video-active' : 'bg-gray-200'}`}>📺 {language === 'pt' ? 'Aula' : language === 'es' ? 'Clase' : 'Lesson'}</button>
        <button onClick={() => setShowVideo(false)} className={`tutorial-tab ${!showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>📖 {language === 'pt' ? 'Guia Escrito' : language === 'es' ? 'Guía Escrita' : 'Written Guide'}</button>
      </div>
      <style jsx>{`.tutorial-tab{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;padding:7px 14px;border-radius:8px;font-weight:700}.tutorial-video-active{color:#fff;background:#dc2626}.tutorial-video-active::after{content:'';position:absolute;left:0;right:0;bottom:0;width:100%;height:4px;background:#ef4444}`}</style>
      {showVideo ? (
        <div className="w-full rounded-lg overflow-hidden shadow"><iframe src={videoUrl} title="MozHyper Digits Tutorial" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="w-full aspect-video" /></div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg text-gray-700 space-y-4 leading-relaxed">
          <h3 className="font-semibold text-lg">{language === 'pt' ? 'Guia de Trading de Dígitos' : language === 'es' ? 'Guía de Trading de Dígitos' : 'Digits Trading Guide'}</h3>
          {language === 'pt' ? (
            <>
              <p>O trading de dígitos na Deriv baseia-se em prever o último número (de 0 a 9) do preço atual de um ativo financeiro ou índice sintético.</p>
              <h4 className="font-semibold">Como começar</h4>
              <p>Antes de tudo, assim que chegar na plataforma, escolha entre <strong>Demo</strong> ou <strong>Real</strong>.</p>
              <p>Depois escolha sua estratégia. A plataforma dispõe de 5 estratégias: <strong>HyperDrive, HyperNova, HyperStrike, HyperForce e HyperFlow</strong>.</p>
              <p>Depois clique em <strong>Iniciar Robô</strong>.</p>
              <a href={DERIV_AFFILIATE_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow hover:bg-blue-700">🚀 Abrir conta Deriv</a>
              <h4 className="font-semibold">Assistência</h4>
              <p>Para assistência contacte <strong>+258 87 904 8091</strong>.</p>
              <h4 className="font-semibold">Conceitos Básicos dos Dígitos</h4>
              <p><strong>Último preço:</strong> O sistema foca no último dígito decimal do preço do ativo no momento da expiração.</p>
              <p><strong>Contratos rápidos:</strong> As operações duram poucos ticks, tornando o resultado rápido.</p>
              <p><strong>Probabilidade:</strong> Cada número de 0 a 9 tem, teoricamente, uma chance igual de 10% de aparecer em cada tick isolado.</p>
              <h4 className="font-semibold">Principais Tipos de Contratos de Dígitos</h4>
              <p><strong>Matches/Differs:</strong> Você prevê se o último dígito será igual ou diferente do número escolhido.</p>
              <p><strong>Over/Under:</strong> Você prevê se o último dígito será maior ou menor que um número de referência.</p>
              <p><strong>Even/Odd:</strong> Você prevê se o último dígito será par (0, 2, 4, 6, 8) ou ímpar (1, 3, 5, 7, 9).</p>
            </>
          ) : language === 'es' ? (
            <>
              <p>El trading de dígitos en Deriv se basa en predecir el último número (del 0 al 9) del precio actual de un activo financiero o índice sintético.</p>
              <h4 className="font-semibold">Cómo empezar</h4><p>Primero, elige entre <strong>Demo</strong> o <strong>Real</strong>.</p><p>Después elige una estrategia: <strong>HyperDrive, HyperNova, HyperStrike, HyperForce y HyperFlow</strong>.</p><p>Después haz clic en <strong>Iniciar Robô</strong>.</p><a href={DERIV_AFFILIATE_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">🚀 Abrir cuenta Deriv</a><p>Para asistencia contacte <strong>+258 87 904 8091</strong>.</p>
            </>
          ) : (
            <>
              <p>Digits trading on Deriv is based on predicting the last number (0 to 9) of the current price of a financial asset or synthetic index.</p>
              <h4 className="font-semibold">How to start</h4><p>First choose between <strong>Demo</strong> or <strong>Real</strong>.</p><p>Then choose a strategy: <strong>HyperDrive, HyperNova, HyperStrike, HyperForce and HyperFlow</strong>.</p><p>Then click <strong>Start Robot</strong>.</p><a href={DERIV_AFFILIATE_LINK} target="_blank" rel="noopener noreferrer" className="inline-flex rounded-xl bg-blue-600 px-4 py-3 font-bold text-white">🚀 Open Deriv account</a><p>For assistance contact <strong>+258 87 904 8091</strong>.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
