'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type WindowSize = 5 | 10 | 25 | 100;
type Strategy = 'PAR_IMPAR' | 'ACIMA_ABAIXO' | 'RISE_FALL' | 'PAR_ACIMA' | 'PAR_RISE' | 'ACIMA_RISE' | 'COMBINADA';
type Signal = { contract: 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'RISE' | 'FALL'; label: string; strength: number };

const CONTRACT_TYPES: Record<Signal['contract'], string> = { EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER: 'DIGITOVER', UNDER: 'DIGITUNDER', RISE: 'CALL', FALL: 'PUT' };
const SYMBOLS: Record<string, string> = {
  R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index', R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index',
  '1HZ10V': 'Volatility 10 (1s) Index', '1HZ25V': 'Volatility 25 (1s) Index', '1HZ50V': 'Volatility 50 (1s) Index', '1HZ75V': 'Volatility 75 (1s) Index', '1HZ100V': 'Volatility 100 (1s) Index',
};
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
  if (strategy === 'PAR_IMPAR') return parity; if (strategy === 'ACIMA_ABAIXO') return overUnder; if (strategy === 'RISE_FALL') return direction;
  if (strategy === 'PAR_ACIMA') return parity && overUnder ? { ...parity, label: `${parity.label} + ${overUnder.label}`, strength: Math.round((parity.strength + overUnder.strength) / 2) } : null;
  if (strategy === 'PAR_RISE') return parity && direction ? { ...parity, label: `${parity.label} + ${direction.label}`, strength: Math.round((parity.strength + direction.strength) / 2) } : null;
  if (strategy === 'ACIMA_RISE') return overUnder && direction ? { ...overUnder, label: `${overUnder.label} + ${direction.label}`, strength: Math.round((overUnder.strength + direction.strength) / 2) } : null;
  return parity && overUnder && direction ? { ...parity, label: `${parity.label} + ${overUnder.label} + ${direction.label}`, strength: Math.round((parity.strength + overUnder.strength + direction.strength) / 3) } : null;
}

export default function AutoBotV2() {
  const [symbol, setSymbol] = useState('R_100'); const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [windowSize, setWindowSize] = useState<WindowSize>(10); const [strategy, setStrategy] = useState<Strategy>('PAR_IMPAR');
  const [stake, setStake] = useState(1); const [duration, setDuration] = useState(1); const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]); const [cycle, setCycle] = useState(0); const [signal, setSignal] = useState<Signal | null>(null); const [log, setLog] = useState<string[]>([]);
  const lastEpoch = useRef<number | null>(null); const requested = useRef(false);
  const { tick, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, error } = useDeriv(accountType);

  useEffect(() => { if (isConnected) subscribeTicks(symbol); }, [isConnected, symbol, subscribeTicks]);
  useEffect(() => {
    if (!tick?.epoch || tick.epoch === lastEpoch.current) return; lastEpoch.current = tick.epoch; const quote = Number(tick.quote); if (!Number.isFinite(quote)) return;
    setTicks(prev => { const next = [...prev, quote]; const count = next.length; setCycle(count >= windowSize ? 0 : count);
      if (count >= windowSize) { const s = makeSignal(next, strategy); setSignal(s); setLog(v => [`${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · ${s ? `SINAL ${s.label} ${Math.round(s.strength)}%` : 'SEM SINAL'} · ${windowSize}T`, ...v].slice(0, 10)); return []; }
      return next; });
  }, [tick, windowSize, strategy]);

  useEffect(() => {
    if (!running || !isAuthorized || !isConnected || requested.current || proposal || buying || activeContractId !== null || !signal) return;
    requested.current = true; setSignal(null);
    const contract = signal.contract; const type = CONTRACT_TYPES[contract]; const isDigit = contract === 'EVEN' || contract === 'ODD' || contract === 'OVER' || contract === 'UNDER';
    const safeDuration = isDigit ? Math.min(10, Math.max(1, duration)) : Math.max(1, duration); const barrier = contract === 'OVER' ? 4 : contract === 'UNDER' ? 5 : 0;
    const ok = getProposal(symbol, type, Math.max(0.5, stake), safeDuration, barrier); if (!ok) requested.current = false;
  }, [running, isAuthorized, isConnected, signal, proposal, buying, activeContractId, getProposal, symbol, stake, duration]);
  useEffect(() => { if (!running || !proposal || buying || activeContractId !== null) return; buy(proposal.id, proposal.ask_price); }, [running, proposal, buying, activeContractId, buy]);
  useEffect(() => { if (activeContractId === null && !buying && !proposal) requested.current = false; }, [activeContractId, buying, proposal]);

  const currentStats = useMemo(() => stats(ticks), [ticks]);
  const start = () => { if (!isConnected || !isAuthorized) return; setTicks([]); setCycle(0); setSignal(null); setLog([]); requested.current = false; setRunning(true); };
  const stop = () => { setRunning(false); requested.current = false; setSignal(null); };

  return <div className="bot-worker" style={{ padding: 12 }}>
    <style>{`.v2-card{background:var(--s2);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:12px;margin-bottom:10px}.v2-row{display:flex;gap:7px;align-items:center}.v2-row>*{flex:1}.v2-label{font-size:10px;color:var(--t3);font-weight:800;text-transform:uppercase;margin-bottom:5px}.v2-select,.v2-input{width:100%;background:var(--s1);border:1px solid rgba(255,255,255,.08);color:var(--t1);border-radius:9px;padding:9px;font-size:12px;font-weight:700}.v2-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.v2-cycle{font-size:28px;font-weight:900;color:var(--blue);text-align:center}.v2-bar{height:7px;background:var(--s3);border-radius:8px;overflow:hidden}.v2-fill{height:100%;background:var(--blue);transition:width .08s linear}.v2-start{width:100%;border:0;border-radius:10px;padding:11px;background:var(--blue);color:#fff;font-weight:900;cursor:pointer}.v2-start.stop{background:#b52c3a}.v2-signal{font-weight:900;font-size:15px}.v2-log{font-size:10px;color:var(--t2);line-height:1.7;max-height:90px;overflow:auto}`}</style>
    <div className="v2-card"><div className="v2-row"><div><div className="v2-label">Mercado</div><select className="v2-select" value={symbol} onChange={e => { setSymbol(e.target.value); setTicks([]); setCycle(0); setSignal(null); }} disabled={running}>{SYMBOL_OPTIONS.map(s => <option key={s} value={s}>{SYMBOLS[s]}</option>)}</select></div><div><div className="v2-label">Conta</div><select className="v2-select" value={accountType} onChange={e => setAccountType(e.target.value as 'demo' | 'real')} disabled={running}><option value="demo">Demo</option><option value="real">Real</option></select></div></div></div>
    <div className="v2-card"><div className="v2-label">Análise por ticks</div><div className="v2-row">{([5,10,25,100] as WindowSize[]).map(n => <button key={n} onClick={() => { setWindowSize(n); setTicks([]); setCycle(0); setSignal(null); }} style={{ padding:'9px 5px', borderRadius:9, border:'1px solid rgba(255,255,255,.08)', background:windowSize===n?'var(--blue)':'var(--s1)', color:windowSize===n?'#fff':'var(--t1)', fontWeight:900, cursor:'pointer' }}>{n}T</button>)}</div><div style={{ marginTop:10 }}><div className="v2-bar"><div className="v2-fill" style={{ width:`${Math.min(100, cycle / windowSize * 100)}%` }} /></div><div className="v2-cycle">{cycle}/{windowSize}</div></div><small style={{ color:'var(--t3)' }}>Ao chegar ao limite, o contador reinicia automaticamente em 0 e começa um novo ciclo.</small></div>
    <div className="v2-card"><div className="v2-label">Estratégia</div><select className="v2-select" value={strategy} onChange={e => { setStrategy(e.target.value as Strategy); setTicks([]); setCycle(0); setSignal(null); }} disabled={running}><option value="PAR_IMPAR">Par / Ímpar</option><option value="ACIMA_ABAIXO">Acima 4 / Abaixo 5</option><option value="RISE_FALL">Subir / Descer</option><option value="PAR_ACIMA">Combinada: Par + Acima/Abaixo</option><option value="PAR_RISE">Combinada: Par/Ímpar + Subir/Descer</option><option value="ACIMA_RISE">Combinada: Acima/Abaixo + Subir/Descer</option><option value="COMBINADA">Combinada: Paridade + Dígito + Direção</option></select><div className="v2-grid" style={{ marginTop:8 }}><div><div className="v2-label">Stake USD</div><input className="v2-input" type="number" min="0.5" step="0.1" value={stake} onChange={e => setStake(Number(e.target.value))} disabled={running} /></div><div><div className="v2-label">Duração</div><input className="v2-input" type="number" min="1" max="100" value={duration} onChange={e => setDuration(Number(e.target.value))} disabled={running} /></div></div><small style={{ color:'var(--t3)', display:'block', marginTop:7 }}>Even/Odd e Over/Under usam no máximo 10 ticks de duração. 25T/100T são janelas de análise.</small></div>
    <div className="v2-card"><div className="v2-label">Sinal atual</div><div className="v2-signal">{signal ? `${signal.label} · ${Math.round(signal.strength)}%` : 'Aguardando fechar o próximo ciclo'}</div><div style={{ color:'var(--t3)',fontSize:10,marginTop:4 }}>Par {Math.round(currentStats.even)}% · Ímpar {Math.round(currentStats.odd)}% · Acima {Math.round(currentStats.over)}% · Abaixo {Math.round(currentStats.under)}%</div></div>
    <button className={`v2-start ${running ? 'stop' : ''}`} onClick={running ? stop : start}>{running ? 'PARAR ROBÔ' : 'INICIAR ROBÔ'}</button>
    <div className="v2-card" style={{ marginTop:10 }}><div className="v2-label">Estado</div><div style={{fontSize:11,color:'var(--t2)'}}>{isConnected ? '🟢 WebSocket ligado' : '🟠 A ligar'} · {error || (running ? 'Robô em execução' : 'Robô parado')}</div></div>
    <div className="v2-card"><div className="v2-label">Últimos ciclos</div><div className="v2-log">{log.length ? log.map((x,i)=><div key={i}>{x}</div>) : 'Ainda sem ciclos completos.'}</div></div>
  </div>;
}
