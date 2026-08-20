'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type WindowSize = 5 | 10 | 25 | 100;
type Strategy = 'PAR_IMPAR' | 'ACIMA_ABAIXO' | 'RISE_FALL' | 'PAR_ACIMA' | 'PAR_RISE' | 'ACIMA_RISE' | 'COMBINADA';
type Signal = { contract: 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'RISE' | 'FALL'; label: string; strength: number };

const CONTRACT_TYPES: Record<Signal['contract'], string> = { EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER: 'DIGITOVER', UNDER: 'DIGITUNDER', RISE: 'CALL', FALL: 'PUT' };
const SYMBOLS: Record<string, string> = { R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index', R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index', '1HZ10V': 'Volatility 10 (1s) Index', '1HZ25V': 'Volatility 25 (1s) Index', '1HZ50V': 'Volatility 50 (1s) Index', '1HZ75V': 'Volatility 75 (1s) Index', '1HZ100V': 'Volatility 100 (1s) Index' };
const SYMBOL_OPTIONS = Object.keys(SYMBOLS);

function lastDigit(v: number | string | null | undefined) { if (v == null) return null; const s = String(v).replace(/\D/g, ''); return s ? Number(s.slice(-1)) : null; }
function stats(values: number[]) {
  const digits = values.map(lastDigit).filter((v): v is number => v !== null); const n = digits.length || 1;
  const even = digits.filter(d => d % 2 === 0).length / n * 100; const over = digits.filter(d => d > 4).length / n * 100;
  let rises = 0, falls = 0; for (let i = 1; i < values.length; i++) { if (values[i] > values[i - 1]) rises++; else if (values[i] < values[i - 1]) falls++; }
  const directionalN = Math.max(1, rises + falls);
  return { even, odd: 100 - even, over, under: 100 - over, rise: rises / directionalN * 100, fall: falls / directionalN * 100 };
}
function makeSignal(values: number[], strategy: Strategy): Signal | null {
  if (values.length < 2) return null; const s = stats(values); const threshold = 60;
  const parity = s.even >= threshold ? { contract: 'EVEN' as const, label: 'PAR', strength: s.even } : s.odd >= threshold ? { contract: 'ODD' as const, label: 'ÍMPAR', strength: s.odd } : null;
  const overUnder = s.over >= threshold ? { contract: 'OVER' as const, label: 'ACIMA 4', strength: s.over } : s.under >= threshold ? { contract: 'UNDER' as const, label: 'ABAIXO 5', strength: s.under } : null;
  const direction = s.rise >= threshold ? { contract: 'RISE' as const, label: 'SUBIR', strength: s.rise } : s.fall >= threshold ? { contract: 'FALL' as const, label: 'DESCER', strength: s.fall } : null;
  if (strategy === 'PAR_IMPAR') return parity;
  if (strategy === 'ACIMA_ABAIXO') return overUnder;
  if (strategy === 'RISE_FALL') return direction;
  if (strategy === 'PAR_ACIMA') return parity && overUnder ? { ...parity, label: `${parity.label} + ${overUnder.label}`, strength: Math.round((parity.strength + overUnder.strength) / 2) } : null;
  if (strategy === 'PAR_RISE') return parity && direction ? { ...parity, label: `${parity.label} + ${direction.label}`, strength: Math.round((parity.strength + direction.strength) / 2) } : null;
  if (strategy === 'ACIMA_RISE') return overUnder && direction ? { ...overUnder, label: `${overUnder.label} + ${direction.label}`, strength: Math.round((overUnder.strength + direction.strength) / 2) } : null;
  return parity && overUnder && direction ? { ...parity, label: `${parity.label} + ${overUnder.label} + ${direction.label}`, strength: Math.round((parity.strength + overUnder.strength + direction.strength) / 3) } : null;
}

export default function AutoBotV2() {
  const [selectedSymbol, setSelectedSymbol] = useState('R_100');
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [windowSize, setWindowSize] = useState<WindowSize>(10);
  const [strategy, setStrategy] = useState<Strategy>('PAR_IMPAR');
  const [stake, setStake] = useState(1);
  const [duration, setDuration] = useState<1 | 5 | 10>(1);
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [cycle, setCycle] = useState(0);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const lastEpoch = useRef<number | null>(null);
  const requested = useRef(false);
  const { tick, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, error } = useDeriv(accountType);

  useEffect(() => { if (isConnected) subscribeTicks(selectedSymbol); }, [isConnected, selectedSymbol, subscribeTicks]);
  useEffect(() => {
    if (!tick?.epoch || tick.epoch === lastEpoch.current) return;
    lastEpoch.current = tick.epoch;
    const quote = Number(tick.quote); if (!Number.isFinite(quote)) return;
    setTicks(prev => {
      const next = [...prev, quote];
      if (next.length >= windowSize) {
        const s = makeSignal(next.slice(-windowSize), strategy);
        setSignal(s);
        setLog(v => [`${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${s ? `SINAL ${s.label} ${Math.round(s.strength)}%` : 'SEM SINAL'} · ${windowSize}T`, ...v].slice(0, 10));
        setCycle(0); return [];
      }
      setCycle(next.length); return next;
    });
  }, [tick, windowSize, strategy]);
  useEffect(() => {
    if (!running || !isAuthorized || !isConnected || requested.current || proposal || buying || activeContractId !== null || !signal) return;
    requested.current = true;
    const contract = signal.contract; const type = CONTRACT_TYPES[contract];
    const isDigit = contract === 'EVEN' || contract === 'ODD' || contract === 'OVER' || contract === 'UNDER';
    const safeDuration = isDigit ? Math.min(10, Math.max(1, duration)) : duration;
    const barrier = contract === 'OVER' ? 4 : contract === 'UNDER' ? 5 : 0;
    const ok = getProposal(selectedSymbol, type, Math.max(0.5, stake), safeDuration, barrier);
    if (!ok) requested.current = false;
  }, [running, isAuthorized, isConnected, signal, proposal, buying, activeContractId, getProposal, selectedSymbol, stake, duration]);
  useEffect(() => { if (running && proposal && !buying && activeContractId === null) buy(proposal.id, proposal.ask_price); }, [running, proposal, buying, activeContractId, buy]);
  useEffect(() => { if (activeContractId === null && !buying && !proposal) requested.current = false; }, [activeContractId, buying, proposal]);

  const currentStats = useMemo(() => stats(ticks), [ticks]);
  const resetAnalysis = () => { setTicks([]); setCycle(0); setSignal(null); requested.current = false; };
  const start = () => { if (!isConnected || !isAuthorized) return; resetAnalysis(); setLog([]); setRunning(true); };
  const stop = () => { setRunning(false); requested.current = false; setSignal(null); };
  const strategyName = (s: Strategy) => ({ PAR_IMPAR: 'Par / Ímpar', ACIMA_ABAIXO: 'Acima 4 / Abaixo 5', RISE_FALL: 'Subir / Descer', PAR_ACIMA: 'Par + Acima/Abaixo', PAR_RISE: 'Par/Ímpar + Subir/Descer', ACIMA_RISE: 'Acima/Abaixo + Subir/Descer', COMBINADA: 'Paridade + Dígito + Direção' }[s]);

  return <div className="bot-worker">
    <style>{`
      .bot-worker{padding:10px 12px 16px}.bot-card{background:var(--s2);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;margin-bottom:9px;box-shadow:0 5px 18px rgba(0,0,0,.06)}
      .bot-label{font-size:9px;color:var(--t3);font-weight:900;text-transform:uppercase;letter-spacing:.08em;margin-bottom:5px}.bot-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.bot-field{min-width:0}.bot-select,.bot-input{width:100%;height:40px;background:var(--s1);border:1px solid rgba(255,255,255,.08);color:var(--t1);border-radius:10px;padding:0 10px;font-size:12px;font-weight:800;outline:none}.bot-input{text-align:center}.bot-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.bot-buttons.four{grid-template-columns:repeat(4,1fr)}.bot-option{height:38px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:var(--s1);color:var(--t1);font-size:11px;font-weight:900;cursor:pointer}.bot-option.active{background:var(--blue);color:#fff;border-color:var(--blue);box-shadow:0 7px 16px rgba(45,105,230,.25)}.bot-contracts{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.bot-contract{min-height:42px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:var(--s1);color:var(--t1);font-size:11px;font-weight:900;cursor:pointer;padding:6px}.bot-contract.active{background:var(--blue);color:#fff;border-color:var(--blue)}.bot-cycle{font-size:24px;font-weight:900;color:var(--blue);text-align:center;margin:4px 0}.bot-bar{height:6px;background:var(--s3);border-radius:8px;overflow:hidden}.bot-fill{height:100%;background:var(--blue);transition:width .1s linear}.bot-signal{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 11px;border-radius:11px;background:var(--s1);font-size:12px;font-weight:900}.bot-start{width:100%;height:45px;border:0;border-radius:11px;background:var(--blue);color:#fff;font-weight:900;font-size:13px;cursor:pointer;box-shadow:0 9px 20px rgba(45,105,230,.25)}.bot-start.stop{background:#b52c3a}.bot-log{font-size:10px;color:var(--t2);line-height:1.7;max-height:80px;overflow:auto}.bot-muted{display:block;color:var(--t3);font-size:9px;line-height:1.45;margin-top:6px}
      @media(max-width:360px){.bot-row{grid-template-columns:1fr}.bot-contracts{grid-template-columns:repeat(3,1fr)}.bot-contract{font-size:10px}.bot-buttons.four{grid-template-columns:repeat(2,1fr)}}
    `}</style>

    <div className="bot-card">
      <div className="bot-row">
        <div className="bot-field"><div className="bot-label">Mercado</div><select className="bot-select" value={selectedSymbol} onChange={e => { setSelectedSymbol(e.target.value); resetAnalysis(); }} disabled={running}>{SYMBOL_OPTIONS.map(s => <option key={s} value={s}>{SYMBOLS[s]}</option>)}</select></div>
        <div className="bot-field"><div className="bot-label">Conta</div><select className="bot-select" value={accountType} onChange={e => setAccountType(e.target.value as 'demo' | 'real')} disabled={running}><option value="demo">Demo</option><option value="real">Real</option></select></div>
      </div>
    </div>

    <div className="bot-card">
      <div className="bot-label">Estratégia</div>
      <div className="bot-contracts">
        <button className="bot-contract" onClick={() => { setStrategy('PAR_IMPAR'); resetAnalysis(); }} disabled={running}>PAR / ÍMPAR</button>
        <button className="bot-contract" onClick={() => { setStrategy('ACIMA_ABAIXO'); resetAnalysis(); }} disabled={running}>ACIMA 4 / ABAIXO 5</button>
        <button className="bot-contract" onClick={() => { setStrategy('RISE_FALL'); resetAnalysis(); }} disabled={running}>SUBIR / DESCER</button>
        <button className="bot-contract" onClick={() => { setStrategy('PAR_ACIMA'); resetAnalysis(); }} disabled={running}>PAR + ACIMA</button>
        <button className="bot-contract" onClick={() => { setStrategy('PAR_RISE'); resetAnalysis(); }} disabled={running}>PAR + SUBIR</button>
        <button className="bot-contract" onClick={() => { setStrategy('COMBINADA'); resetAnalysis(); }} disabled={running}>COMBINADA</button>
      </div>
      <span className="bot-muted">O tipo de contrato usado pela análise manual agora fica integrado às estratégias do Robô.</span>
    </div>

    <div className="bot-card">
      <div className="bot-label">Duração de ticks</div>
      <div className="bot-buttons">
        {[1,5,10].map(n => <button key={n} className={`bot-option ${duration===n?'active':''}`} onClick={() => setDuration(n as 1|5|10)} disabled={running}>{n} tick{n>1?'s':''}</button>)}
      </div>
    </div>

    <div className="bot-card">
      <div className="bot-row">
        <div className="bot-field"><div className="bot-label">Valor USD</div><input className="bot-input" type="number" min="0.5" step="0.1" value={stake} onChange={e => setStake(Number(e.target.value))} disabled={running}/></div>
        <div className="bot-field"><div className="bot-label">Análise</div><div className="bot-buttons four">{([5,10,25,100] as WindowSize[]).map(n => <button key={n} className={`bot-option ${windowSize===n?'active':''}`} onClick={() => { setWindowSize(n); resetAnalysis(); }} disabled={running}>{n}T</button>)}</div></div>
      </div>
      <div className="bot-bar" style={{marginTop:10}}><div className="bot-fill" style={{width:`${Math.min(100,cycle/windowSize*100)}%`}}/></div>
      <div className="bot-cycle">{cycle}/{windowSize}</div>
    </div>

    <div className="bot-card">
      <div className="bot-label">Sinal atual</div>
      <div className="bot-signal"><span>{signal ? signal.label : 'Aguardando próximo ciclo'}</span><span>{signal ? `${Math.round(signal.strength)}%` : strategyName(strategy)}</span></div>
      <span className="bot-muted">Par {Math.round(currentStats.even)}% · Ímpar {Math.round(currentStats.odd)}% · Acima {Math.round(currentStats.over)}% · Abaixo {Math.round(currentStats.under)}%</span>
    </div>

    <button className={`bot-start ${running?'stop':''}`} onClick={running?stop:start}>{running?'PARAR ROBÔ':'INICIAR ROBÔ'}</button>

    <div className="bot-card" style={{marginTop:9}}><div className="bot-label">Estado</div><div style={{fontSize:10,color:'var(--t2)'}}>{isConnected?'🟢 WebSocket ligado':'🟠 A ligar'} · {error || (running?'Robô em execução':'Robô parado')}</div></div>
    <div className="bot-card"><div className="bot-label">Histórico recente</div><div className="bot-log">{log.length?log.map((x,i)=><div key={i}>{x}</div>):'Ainda sem ciclos completos.'}</div></div>
  </div>;
}
