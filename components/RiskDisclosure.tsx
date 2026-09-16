'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const RISK_URL = 'https://deriv.com/pt/terms-and-conditions/risk-disclosure';

export default function RiskDisclosure() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);

  const copy = language === 'pt' ? {
    button: 'Aviso de risco',
    title: 'Aviso de Risco',
    lead: 'A negociação envolve risco elevado. Leia estas informações antes de utilizar a plataforma.',
    points: [
      'Pode perder todo o dinheiro investido. Nunca negocie com dinheiro que não possa suportar perder.',
      'As Opções Digitais são contratos de resultado definido. Se a previsão estiver errada na expiração, a perda pode corresponder a 100% da aposta inicial.',
      'Resultados passados, históricos, sinais ou desempenho apresentado na plataforma não garantem resultados futuros.',
      'O Matos/MozHyper é uma ferramenta tecnológica de análise e execução. Não presta aconselhamento financeiro, de investimento ou recomendações personalizadas.',
      'As operações dependem da conta do utilizador e das condições da Deriv, incluindo preços, execução, disponibilidade do serviço e eventuais falhas técnicas ou de comunicação.',
    ],
    acknowledge: 'Li e compreendi',
    source: 'Fonte: Divulgação de Risco da Deriv. Última atualização: 10/09/2026.',
    more: 'Consultar divulgação oficial',
  } : language === 'es' ? {
    button: 'Aviso de riesgo',
    title: 'Aviso de Riesgo',
    lead: 'Operar implica un riesgo elevado. Lee esta información antes de utilizar la plataforma.',
    points: [
      'Puedes perder todo el dinero invertido. Nunca operes con dinero que no puedas permitirte perder.',
      'Las Opciones Digitales son contratos de resultado definido. Si la predicción es incorrecta al vencimiento, la pérdida puede ser del 100% de la apuesta inicial.',
      'Los resultados pasados, históricos, señales o rendimiento mostrado en la plataforma no garantizan resultados futuros.',
      'Matos/MozHyper es una herramienta tecnológica de análisis y ejecución. No proporciona asesoramiento financiero, de inversión ni recomendaciones personalizadas.',
      'Las operaciones dependen de la cuenta del usuario y de las condiciones de Deriv, incluidos precios, ejecución, disponibilidad del servicio y posibles fallos técnicos o de comunicación.',
    ],
    acknowledge: 'He leído y comprendido',
    source: 'Fuente: Divulgación de Riesgo de Deriv. Última actualización: 10/09/2026.',
    more: 'Consultar divulgación oficial',
  } : {
    button: 'Risk disclosure',
    title: 'Risk Disclosure',
    lead: 'Trading involves significant risk. Read this information before using the platform.',
    points: [
      'You may lose all money invested. Never trade with money you cannot afford to lose.',
      'Digital Options are fixed-outcome contracts. If the prediction is wrong at expiry, the loss may equal 100% of the initial stake.',
      'Past results, history, signals or performance shown in the platform do not guarantee future results.',
      'Matos/MozHyper is a technology tool for analysis and execution. It does not provide financial or investment advice or personalised recommendations.',
      "Trading depends on the user's account and Deriv's conditions, including pricing, execution, service availability and possible technical or communication failures.",
    ],
    acknowledge: 'I have read and understood',
    source: 'Source: Deriv Risk Disclosure. Last updated: 10/09/2026.',
    more: 'View official disclosure',
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={copy.button}
        style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 120, border: '1px solid rgba(148,163,184,.35)', background: 'rgba(15,23,42,.92)', color: '#cbd5e1', borderRadius: 999, padding: '7px 11px', fontSize: 10, fontWeight: 700, backdropFilter: 'blur(8px)', cursor: 'pointer' }}
      >
        ⚠ {copy.button}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="risk-title"
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: 'min(100%, 560px)', maxHeight: 'min(90vh, 760px)', overflow: 'auto', border: '1px solid #334155', borderRadius: 16, background: '#0f172a', color: '#f8fafc', boxShadow: '0 24px 80px rgba(0,0,0,.45)', padding: 20 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#facc15', fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>Matos / MozHyper</div>
                <h2 id="risk-title" style={{ margin: '6px 0 6px', fontSize: 22, lineHeight: 1.2 }}>{copy.title}</h2>
                <p style={{ margin: 0, color: '#cbd5e1', fontSize: 12, lineHeight: 1.55 }}>{copy.lead}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ border: 0, background: 'transparent', color: '#94a3b8', fontSize: 22, cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
              {copy.points.map((point, index) => (
                <div key={index} style={{ display: 'grid', gridTemplateColumns: '22px 1fr', gap: 8, alignItems: 'start', padding: 11, borderRadius: 10, background: '#172033', border: '1px solid #26354d' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#24324a', color: '#facc15', fontSize: 10, fontWeight: 900 }}>{index + 1}</div>
                  <p style={{ margin: 0, color: '#dbe4ef', fontSize: 11, lineHeight: 1.55 }}>{point}</p>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #26354d' }}>
              <p style={{ margin: 0, color: '#64748b', fontSize: 9.5, lineHeight: 1.5 }}>{copy.source}</p>
              <a href={RISK_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', marginTop: 7, color: '#60a5fa', fontSize: 10, fontWeight: 700, textDecoration: 'none' }}>{copy.more} →</a>
            </div>

            <button type="button" onClick={() => setOpen(false)} style={{ marginTop: 16, width: '100%', border: 0, borderRadius: 10, padding: '11px 14px', background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>{copy.acknowledge}</button>
          </div>
        </div>
      )}
    </>
  );
}
