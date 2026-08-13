'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

export default function TutorialSection() {
  const { language } = useLanguage();
  const [showVideo, setShowVideo] = useState(true);
  const videoUrl = 'https://www.youtube.com/embed/dQw4w9WgXcQ';

  return (
    <div className="card mb-6" id="tutorial-section">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">🎓 {language === 'pt' ? 'Como negociar Dígitos' : 'How to trade Digits'}</h2>
      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setShowVideo(true)} className={`px-3 py-1 rounded ${showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>📺 {language === 'pt' ? 'Vídeo' : 'Video'}</button>
        <button onClick={() => setShowVideo(false)} className={`px-3 py-1 rounded ${!showVideo ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>📖 {language === 'pt' ? 'Guia Escrito' : 'Written Guide'}</button>
      </div>
      {showVideo ? (
        <div className="aspect-w-16 rounded-lg overflow-hidden shadow">
          <iframe src={videoUrl} title="MozHyper Digits Tutorial" allowFullScreen className="w-full h-80 md:h-96" />
        </div>
      ) : (
        <div className="bg-gray-50 p-4 rounded-lg text-gray-700 space-y-4 leading-relaxed">
          <h3 className="font-semibold text-lg">Guia de Trading de Dígitos</h3>
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
        </div>
      )}
    </div>
  );
}
