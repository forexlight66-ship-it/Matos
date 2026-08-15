'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TutorialSection() {
  const { language, t } = useLanguage();
  const [showVideo, setShowVideo] = useState(true);
  const videoUrl = 'https://www.youtube.com/embed/0C7Dc0BljDM?enablejsapi=1&playsinline=1&rel=0';

  return (
    <div className="card mb-6" id="tutorial-section">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">🎓 {t('tutorialTitle')}</h2>
      <div className="flex flex-wrap gap-2 mb-4 tutorial-tabs">
        <button onClick={() => setShowVideo(true)} className={`tutorial-tab ${showVideo ? 'tutorial-video-active' : 'bg-gray-200'}`}>📺 {language === 'pt' ? 'Aula' : language === 'es' ? 'Clase' : 'Lesson'}</button>
        <button onClick={() => setShowVideo(false)} className={`tutorial-tab ${!showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>📖 {language === 'pt' ? 'Guia Escrito' : language === 'es' ? 'Guía Escrita' : 'Written Guide'}</button>
      </div>
      <style jsx>{`
        .tutorial-tab{position:relative;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;padding:7px 14px;border-radius:8px;font-weight:700}
        .tutorial-video-active{color:#fff;background:#dc2626}
        .tutorial-video-active::after{content:'';position:absolute;left:0;right:0;bottom:0;width:100%;height:4px;background:#ef4444}
      `}</style>
      {showVideo ? (
        <div className="w-full rounded-lg overflow-hidden shadow">
          <iframe src={videoUrl} title="MozHyper Digits Tutorial" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="w-full aspect-video" />
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg text-gray-700 space-y-4 leading-relaxed">
          <h3 className="font-semibold text-lg">{language === 'pt' ? 'Guia de Trading de Dígitos' : language === 'es' ? 'Guía de Trading de Dígitos' : 'Digits Trading Guide'}</h3>

          {language === 'pt' ? (
            <>
              <p>O trading de dígitos na Deriv baseia-se em prever o último número (de 0 a 9) do preço atual de um ativo financeiro ou índice sintético.</p>
              <p>Você escolhe contratos rápidos como Combina/Diferere, Acima/Abaixo ou Par/Ímpar, arriscando com base na probabilidade matemática de cada dígito final.</p>
              <h4 className="font-semibold">Conceitos Básicos dos Dígitos</h4>
              <p><strong>Último preço:</strong> O sistema foca estritamente no último dígito decimal do preço do ativo no momento da expiração.</p>
              <p><strong>Contratos rápidos:</strong> As operações duram poucos ticks (variações de preço), tornando o resultado instantâneo.</p>
              <p><strong>Probabilidade fixa:</strong> Cada número de 0 a 9 tem, teoricamente, uma chance igual de 10% de aparecer em cada tick isolado.</p>
              <h4 className="font-semibold">Principais Tipos de Contratos de Dígitos</h4>
              <p><strong>Matches/Differs (Combina/Diferere):</strong> Você prevê se o último dígito será exatamente igual (Matches) ou diferente (Differs) do número que você escolheu.</p>
              <p><strong>Over/Under (Acima/Abaixo):</strong> Você aposta se o último dígito será maior ou menor do que um número de referência (ex: acima de 4 ou abaixo de 6).</p>
              <p><strong>Even/Odd (Par/Ímpar):</strong> Você tenta adivinhar se o último dígito gerado será um número par (0, 2, 4, 6, 8) ou ímpar (1, 3, 5, 7, 9).</p>
            </>
          ) : language === 'es' ? (
            <>
              <p>El trading de dígitos en Deriv se basa en predecir el último número (del 0 al 9) del precio actual de un activo financiero o índice sintético.</p>
              <p>Puedes elegir contratos rápidos como Matches/Differs, Over/Under o Even/Odd, asumiendo el riesgo según la probabilidad matemática de cada dígito final.</p>
              <h4 className="font-semibold">Conceptos Básicos de los Dígitos</h4>
              <p><strong>Último precio:</strong> El sistema se centra estrictamente en el último dígito decimal del precio del activo en el momento del vencimiento.</p>
              <p><strong>Contratos rápidos:</strong> Las operaciones duran pocos ticks, haciendo que el resultado sea rápido.</p>
              <p><strong>Probabilidad fija:</strong> Cada número del 0 al 9 tiene, teóricamente, una probabilidad igual del 10% de aparecer en cada tick aislado.</p>
              <h4 className="font-semibold">Principales Tipos de Contratos de Dígitos</h4>
              <p><strong>Matches/Differs:</strong> Predices si el último dígito será exactamente igual o diferente al número elegido.</p>
              <p><strong>Over/Under:</strong> Predices si el último dígito será mayor o menor que un número de referencia.</p>
              <p><strong>Even/Odd:</strong> Predices si el último dígito será par (0, 2, 4, 6, 8) o impar (1, 3, 5, 7, 9).</p>
            </>
          ) : (
            <>
              <p>Digits trading on Deriv is based on predicting the last number (0 to 9) of the current price of a financial asset or synthetic index.</p>
              <p>You choose quick contracts such as Matches/Differs, Over/Under or Even/Odd, taking risk based on the mathematical probability of each final digit.</p>
              <h4 className="font-semibold">Basic Digit Concepts</h4>
              <p><strong>Last price:</strong> The system focuses strictly on the last decimal digit of the asset price at expiry.</p>
              <p><strong>Quick contracts:</strong> Trades last only a few ticks, making the result fast.</p>
              <p><strong>Fixed probability:</strong> Each number from 0 to 9 theoretically has an equal 10% chance of appearing on any isolated tick.</p>
              <h4 className="font-semibold">Main Digit Contract Types</h4>
              <p><strong>Matches/Differs:</strong> Predict whether the last digit will exactly match or differ from your chosen number.</p>
              <p><strong>Over/Under:</strong> Predict whether the last digit will be higher or lower than a reference number.</p>
              <p><strong>Even/Odd:</strong> Predict whether the final digit will be even (0, 2, 4, 6, 8) or odd (1, 3, 5, 7, 9).</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
