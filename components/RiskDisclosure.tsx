'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const RISK_URL = 'https://deriv.com/pt/terms-and-conditions/risk-disclosure';
const RISK_ACK = 'mozhyper-risk-ack-v1';

export default function RiskDisclosure() {
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });
        const data = await res.json().catch(() => null);
        const authenticated = Boolean(data?.authenticated);
        const acknowledged = localStorage.getItem(RISK_ACK) === '1';
        if (!cancelled) {
          setReady(true);
          setOpen(authenticated && !acknowledged);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  const copy = language === 'pt' ? {
    title:'Aviso de Risco',
    lead:'A negociação envolve risco elevado. Leia e compreenda estas informações antes de utilizar a plataforma.',
    points:[
      'Pode perder todo o dinheiro investido. Nunca negocie com dinheiro que não possa suportar perder.',
      'Em Opções Digitais, uma operação pode resultar na perda de 100% da aposta inicial.',
      'Resultados passados, históricos, sinais e desempenho apresentado não garantem resultados futuros.',
      'MOZHYPER é uma ferramenta tecnológica de análise e execução e não presta aconselhamento financeiro ou recomendações personalizadas.',
      'As operações estão sujeitas às condições da Deriv, incluindo preços, execução, disponibilidade e possíveis falhas técnicas ou de comunicação.'
    ],
    acknowledge:'Li e compreendi',source:'Fonte: Divulgação de Risco da Deriv. Última atualização: 10/09/2026.',more:'Consultar divulgação oficial'
  } : language === 'es' ? {
    title:'Aviso de Riesgo',
    lead:'Operar implica un riesgo elevado. Lee y comprende esta información antes de utilizar la plataforma.',
    points:[
      'Puedes perder todo el dinero invertido. Nunca operes con dinero que no puedas permitirte perder.',
      'En Opciones Digitales, una operación puede resultar en la pérdida del 100% de la apuesta inicial.',
      'Los resultados pasados, históricos, señales y rendimiento mostrado no garantizan resultados futuros.',
      'MOZHYPER es una herramienta tecnológica de análisis y ejecución y no proporciona asesoramiento financiero ni recomendaciones personalizadas.',
      'Las operaciones están sujetas a las condiciones de Deriv, incluidos precios, ejecución, disponibilidad y posibles fallos técnicos o de comunicación.'
    ],
    acknowledge:'He leído y comprendido',source:'Fuente: Divulgación de Riesgo de Deriv. Última actualización: 10/09/2026.',more:'Consultar divulgación oficial'
  } : {
    title:'Risk Disclosure',
    lead:'Trading involves significant risk. Read and understand this information before using the platform.',
    points:[
      'You may lose all money invested. Never trade with money you cannot afford to lose.',
      'For Digital Options, a trade may result in a loss of 100% of the initial stake.',
      'Past results, history, signals and displayed performance do not guarantee future results.',
      'MOZHYPER is a technology tool for analysis and execution and does not provide financial advice or personalised recommendations.',
      "Trading is subject to Deriv's conditions, including pricing, execution, availability and possible technical or communication failures."
    ],
    acknowledge:'I have read and understood',source:'Source: Deriv Risk Disclosure. Last updated: 10/09/2026.',more:'View official disclosure'
  };

  const acknowledge = () => {
    try { localStorage.setItem(RISK_ACK, '1'); } catch {}
    setOpen(false);
  };

  if (!ready || !open) return null;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="risk-title" style={{position:'fixed',inset:0,zIndex:500,background:'rgba(0,0,0,.72)',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <div style={{width:'min(100%,560px)',maxHeight:'min(92vh,780px)',overflow:'auto',border:'1px solid #334155',borderRadius:16,background:'#0f172a',color:'#f8fafc',boxShadow:'0 24px 80px rgba(0,0,0,.5)',padding:20}}>
        <div style={{color:'#facc15',fontSize:10,fontWeight:800,textTransform:'uppercase',letterSpacing:'.08em'}}>MOZHYPER</div>
        <h2 id="risk-title" style={{margin:'6px 0',fontSize:22,lineHeight:1.2}}>{copy.title}</h2>
        <p style={{margin:0,color:'#cbd5e1',fontSize:12,lineHeight:1.55}}>{copy.lead}</p>
        <div style={{marginTop:16,display:'grid',gap:10}}>
          {copy.points.map((point,index)=>(
            <div key={index} style={{display:'grid',gridTemplateColumns:'22px 1fr',gap:8,alignItems:'start',padding:11,borderRadius:10,background:'#172033',border:'1px solid #26354d'}}>
              <div style={{width:22,height:22,borderRadius:7,display:'flex',alignItems:'center',justifyContent:'center',background:'#24324a',color:'#facc15',fontSize:10,fontWeight:900}}>{index+1}</div>
              <p style={{margin:0,color:'#dbe4ef',fontSize:11,lineHeight:1.55}}>{point}</p>
            </div>
          ))}
        </div>
        <div style={{marginTop:14,paddingTop:14,borderTop:'1px solid #26354d'}}>
          <p style={{margin:0,color:'#64748b',fontSize:9.5,lineHeight:1.5}}>{copy.source}</p>
          <a href={RISK_URL} target="_blank" rel="noopener noreferrer" style={{display:'inline-block',marginTop:7,color:'#60a5fa',fontSize:10,fontWeight:700,textDecoration:'none'}}>{copy.more} →</a>
        </div>
        <button type="button" onClick={acknowledge} style={{marginTop:16,width:'100%',border:0,borderRadius:10,padding:'12px 14px',background:'#2563eb',color:'#fff',fontSize:11,fontWeight:800,cursor:'pointer'}}>{copy.acknowledge}</button>
      </div>
    </div>
  );
}
