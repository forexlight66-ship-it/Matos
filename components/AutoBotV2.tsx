'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type WindowSize = 5 | 10 | 25 | 100;
type Duration = 1 | 5 | 10;
type Strategy = 'PAR_IMPAR' | 'ACIMA_ABAIXO' | 'RISE_FALL' | 'PAR_ACIMA' | 'PAR_RISE' | 'ACIMA_RISE' | 'COMBINADA';
type Signal = { contract: 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'RISE' | 'FALL'; label: string; strength: number };

const CONTRACT_TYPES: Record<Signal['contract'], string> = { EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER: 'DIGITOVER', UNDER: 'DIGITUNDER', RISE: 'CALL', FALL: 'PUT' };
const SYMBOLS: Record<string, string> = { R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index', R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index', '1HZ10V': 'Volatility 10 (1s) Index', '1HZ25V': 'Volatility 25 (1s) Index', '1HZ50V': 'Volatility 50 (1s) Index', '1HZ75V': 'Volatility 75 (1s) Index', '1HZ100V': 'Volatility 100 (1s) Index' };
const SYMBOL_OPTIONS = Object.keys(SYMBOLS);
const STRATEGIES: { id: Strategy; label: string; icon: string }[] = [
  { id: 'PAR_IMPAR', label: 'Par / Ímpar', icon: '⚖' },
  { id: 'ACIMA_ABAIXO', label: 'Acima 4 / Abaixo 5', icon: '↕' },
  { id: 'RISE_FALL', label: 'Subir / Descer', icon: '↕' },
  { id: 'PAR_ACIMA', label: 'Par + Acima', icon: '◈' },
  { id: 'PAR_RISE', label: 'Par + Subir', icon: '↗' },
  { id: 'COMBINADA', label: 'Combinada', icon: '✣' },
];

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
function money(value: number, currency: string) { return `${value >= 0 ? '+' : ''}${value.toFixed(2)} ${currency}`; }

export default function AutoBotV2() {
  const [selectedSymbol, setSelectedSymbol] = useState('R_100');
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [windowSize, setWindowSize] = useState<WindowSize>(10);
  const [strategy, setStrategy] = useState<Strategy>('PAR_IMPAR');
  const [stake, setStake] = useState(1.5);
  const [duration, setDuration] = useState<Duration>(1);
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [cycle, setCycle] = useState(0);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dailyTarget, setDailyTarget] = useState(100);
  const lastEpoch = useRef<number | null>(null);
  const requested = useRef(false);
  const { tick, balance, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, error, profitTransactions, contractClosedSeq } = useDeriv(accountType);

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
  useEffect(() => { if (activeContractId === null && !buying && !proposal) requested.current = false; }, [activeContractId, buying, proposal, contractClosedSeq]);

  const currentStats = useMemo(() => stats(ticks), [ticks]);
  const currentDigit = lastDigit(tick?.quote);
  const latestOperation = profitTransactions?.[0] ?? null;
  const sessionProfit = useMemo(() => (profitTransactions || []).reduce((sum, tx) => sum + Number(tx.profit_loss || 0), 0), [profitTransactions]);
  const currency = balance?.currency || 'USD';
  const progress = dailyTarget > 0 ? Math.max(0, Math.min(100, (sessionProfit / dailyTarget) * 100)) : 0;
  const latestResult = latestOperation ? Number(latestOperation.profit_loss || 0) : 0;
  const resetAnalysis = () => { setTicks([]); setCycle(0); setSignal(null); requested.current = false; };
  const chooseStrategy = (value: Strategy) => { if (running) return; setStrategy(value); resetAnalysis(); };
  const start = () => { if (!isConnected || !isAuthorized) return; resetAnalysis(); setLog([]); setRunning(true); };
  const stop = () => { setRunning(false); requested.current = false; setSignal(null); };

  return (
    <div className="robot-page">
      <style>{`
        .robot-page{--rbg0:#080b10;--rbg1:#0e131b;--rbg2:#141b26;--rbg3:#1a2230;--rline:#232c3a;--rgold:#e0b455;--rgold2:#c9973f;--rblue:#3f8cf0;--rem:#28e0a0;--rcoral:#ff6b5e;--rhi:#f3f5f8;--rmid:#9aa5b5;--rlow:#5c6779;max-width:430px;margin:0 auto;min-height:100%;padding:0 14px 28px;background:radial-gradient(600px 300px at 50% -5%,rgba(224,180,85,.06),transparent 70%),var(--rbg0);color:var(--rhi);font-family:Inter,system-ui,sans-serif}
        .rh{display:flex;align-items:center;justify-content:space-between;padding:16px 4px 12px}.brand{display:flex;align-items:center;gap:10px}.brand-mark{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#f0cc7a,#c9973f);color:#1a1408;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:16px}.brand-name{font-weight:800;font-size:17px}.brand-name span{color:var(--rgold)}.tabs{display:flex;background:var(--rbg1);border:1px solid var(--rline);border-radius:11px;padding:3px;gap:2px}.tabs span{padding:7px 10px;border-radius:8px;color:var(--rlow);font-size:11px;font-weight:800}.tabs .active{background:var(--rbg3);color:var(--rgold)}
        .risk{border:1px solid rgba(224,180,85,.45);background:rgba(224,180,85,.06);color:#eacb82;border-radius:10px;padding:9px 11px;font-size:9px;line-height:1.4;margin-bottom:12px}.risk b{color:#f2d37f}
        .card{border:1px solid var(--rline);border-radius:15px;background:linear-gradient(180deg,var(--rbg2),var(--rbg1));overflow:hidden}.balance{display:flex}.bal-half{flex:1;padding:14px 15px}.bal-half+.bal-half{border-left:1px solid var(--rline)}.lbl{font-size:9px;letter-spacing:.11em;text-transform:uppercase;color:var(--rlow);font-weight:800}.bal{font-family:ui-monospace,SFMono-Regular,monospace;font-size:18px;font-weight:800;margin-top:6px}.bal.pos{color:var(--rem)}.content{display:flex;flex-direction:column;gap:11px}
        .row3{display:grid;grid-template-columns:1fr 1fr 52px;gap:8px}.chip{min-width:0;border:1px solid var(--rline);border-radius:12px;padding:10px 11px;background:var(--rbg1)}.chip.demo{background:linear-gradient(135deg,#173029,#10241f);border-color:rgba(40,224,160,.25)}.chip.demo .chip-val{color:var(--rem)}.chip-val{margin-top:4px;font-size:12px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pause{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#3a2020,#2a1616);border-color:rgba(255,107,94,.3);font-size:18px;color:var(--rcoral);cursor:pointer}.pause.running{background:linear-gradient(135deg,#183b31,#123027);border-color:rgba(40,224,160,.3);color:var(--rem)}
        .op{padding:13px 14px}.op-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.op-grid{display:grid;grid-template-columns:1fr 1fr 1.2fr 1fr;gap:6px}.op-l{font-size:8px;color:var(--rlow);text-transform:uppercase;letter-spacing:.06em}.op-v{font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;font-weight:700;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.op-v.dim{color:var(--rlow)}.op-v.pos{color:var(--rem)}.op-v.neg{color:var(--rcoral)}
        .strategy-wrap{padding:13px}.strategy-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.strategy-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.strategy{min-height:48px;border:1px solid var(--rline);border-radius:10px;background:var(--rbg1);color:var(--rmid);padding:7px 5px;font-size:10px;font-weight:800;cursor:pointer}.strategy .ico{display:block;font-size:15px;margin-bottom:2px;color:var(--rgold)}.strategy.on{border-color:var(--rblue);background:linear-gradient(180deg,#1c3155,#14243e);color:#fff;box-shadow:0 0 14px rgba(63,140,240,.14)}.strategy.on .ico{color:#72b0ff}
        .wheel-wrap{display:flex;flex-direction:column;align-items:center;padding:5px 0 2px}.wheel{position:relative;width:min(350px,calc(100vw - 42px));aspect-ratio:1}.wheel-ring{position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle at 50% 50%,#1b2b4a 0%,#17243b 54%,#101925 100%);border:1px solid #2b3b58;box-shadow:inset 0 0 30px rgba(0,0,0,.35),0 10px 30px rgba(0,0,0,.2)}.wheel-center{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:40%;height:40%;border-radius:50%;background:radial-gradient(circle at 40% 35%,#1c2a42,#080b10 82%);border:1px solid #29364b;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 24px rgba(0,0,0,.5)}.wheel-digit{font-family:ui-monospace,SFMono-Regular,monospace;font-size:42px;font-weight:800;color:var(--rgold);line-height:1}.wheel-lbl{font-size:8px;letter-spacing:.1em;color:var(--rlow);text-transform:uppercase;margin-top:5px}.bubble{position:absolute;left:50%;top:50%;width:55px;height:55px;border-radius:50%;background:linear-gradient(180deg,#1a2537,#0f1621);border:1px solid #243148;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:ui-monospace,SFMono-Regular,monospace;transition:.2s}.bubble .n{font-size:16px;font-weight:800}.bubble .p{font-size:7px;color:var(--rlow);margin-top:1px}.bubble.current{background:linear-gradient(180deg,#4a9af5,var(--rblue));border-color:#72b5ff;box-shadow:0 0 20px rgba(63,140,240,.55)}.bubble.current .n,.bubble.current .p{color:#07172c}.ticks-left{margin-top:9px;color:var(--rmid);font-size:12px}.ticks-left b{font-family:ui-monospace,SFMono-Regular,monospace;color:var(--rhi);font-size:14px}
        .stake{padding:0 1px}.stake-box{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--rline);border-radius:13px;padding:13px 14px;background:var(--rbg1);margin-top:7px}.stake-cur{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;color:var(--rlow)}.stake-input{width:100px;text-align:right;border:0;background:transparent;outline:0;color:var(--rhi);font-family:ui-monospace,SFMono-Regular,monospace;font-size:20px;font-weight:800}
        .symbol{padding:13px 14px;display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:800}.select{width:100%;background:transparent;border:0;outline:0;color:var(--rhi);font-weight:800;font-size:13px}.select option{background:#111823;color:#fff}.duration{display:flex;gap:8px;margin-top:7px}.duration button{flex:1;padding:12px 4px;border-radius:11px;border:1px solid var(--rline);background:var(--rbg1);color:var(--rmid);font-family:ui-monospace,SFMono-Regular,monospace;font-size:12px;font-weight:800;cursor:pointer}.duration button.on{background:linear-gradient(135deg,#3a6fc9,var(--rblue));color:#fff;border-color:#5a9af5}.duration button:disabled,.strategy:disabled{opacity:.55;cursor:not-allowed}
        .action{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;border:0;border-radius:15px;padding:15px 10px;background:linear-gradient(135deg,#f0cc7a,var(--rgold2));box-shadow:0 7px 24px rgba(224,180,85,.22);color:#1a1408;font-weight:900;font-size:14px;cursor:pointer}.action.stop{background:linear-gradient(135deg,#ff786b,#d94c43);box-shadow:0 7px 24px rgba(255,107,94,.18)}.action:disabled{opacity:.55;cursor:not-allowed}.status{display:flex;justify-content:space-between;align-items:center;margin-top:7px;font-size:10px;color:var(--rlow)}.status strong{color:var(--rem)}
        .signal{padding:12px 13px}.signal-box{margin-top:7px;display:flex;align-items:center;justify-content:space-between;background:#0e1622;border:1px solid #243148;border-radius:11px;padding:10px 11px}.signal-main{font-weight:900;font-size:13px}.signal-pct{font-family:ui-monospace,SFMono-Regular,monospace;color:var(--rblue);font-weight:900}.stats-line{font-size:9px;color:var(--rlow);margin-top:6px;line-height:1.5}.progress{height:6px;border-radius:8px;background:#202938;overflow:hidden;margin-top:8px}.progress>div{height:100%;background:linear-gradient(90deg,var(--rblue),#70b4ff);border-radius:8px}.target-row{display:flex;justify-content:space-between;align-items:center;margin-top:7px}.target-input{width:72px;background:transparent;border:0;border-bottom:1px solid var(--rline);color:var(--rhi);font-family:ui-monospace,SFMono-Regular,monospace;text-align:right;outline:0;font-size:11px}
        .history{padding:13px 14px}.history-list{margin-top:8px;display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto}.hist{display:grid;grid-template-columns:52px 1fr auto;gap:7px;align-items:center;border-bottom:1px solid var(--rline);padding:7px 0;font-size:9px}.hist:last-child{border-bottom:0}.hist-time,.hist-type{color:var(--rmid)}.hist-result.pos{color:var(--rem)}.hist-result.neg{color:var(--rcoral)}.empty{padding:18px;text-align:center;color:var(--rlow);font-size:11px}.footer{text-align:center;padding:15px 0 0;color:var(--rlow);font-family:ui-monospace,SFMono-Regular,monospace;font-size:8.5px;letter-spacing:.1em;text-transform:uppercase}.footer span{color:var(--rgold)}
        @media(max-width:360px){.robot-page{padding:0 10px 24px}.row3{grid-template-columns:1fr 1fr 46px}.wheel{width:min(320px,calc(100vw - 30px))}.bubble{width:49px;height:49px}.bubble .n{font-size:14px}.op-grid{grid-template-columns:1fr 1fr}.op-grid>div:nth-child(3),.op-grid>div:nth-child(4){margin-top:5px}}
      `}</style>
      <header className="rh"><div className="brand"><div className="brand-mark">M</div><div className="brand-name">Moz<span>Hyper</span></div></div><div className="tabs"><span>Manual</span><span className="active">🤖 Robô</span></div></header>
      <div className="content">
        <div className="risk">⚠ <b>Aviso de Risco:</b> A negociação envolve riscos. Você pode perder parte ou todo o seu capital. Não é investimento.</div>
        <div className="card balance"><div className="bal-half"><div className="lbl">Saldo</div><div className="bal">{balance ? `${Number(balance.balance).toLocaleString('pt-PT',{minimumFractionDigits:2,maximumFractionDigits:2})} ${currency}` : '—'}</div></div><div className="bal-half"><div className="lbl">Lucro/Perda</div><div className={`bal ${sessionProfit >= 0 ? 'pos' : ''}`}>{money(sessionProfit,currency)}</div></div></div>
        <div className="row3"><div className="chip demo"><div className="lbl">Tipo de Conta</div><div className="chip-val">{accountType === 'demo' ? 'Demo' : 'Real'} ▾</div></div><div className="chip"><div className="lbl">Estratégia</div><div className="chip-val">{STRATEGIES.find(s => s.id === strategy)?.label || 'Par / Ímpar'} ▾</div></div><button className={`chip pause ${running ? 'running' : ''}`} onClick={running ? stop : start} aria-label={running ? 'Parar robô' : 'Iniciar robô'}>{running ? '■' : '▶'}</button></div>
        <div className="card op"><div className="op-head"><span className="lbl">Última Operação Fechada</span><span className="lbl">{latestOperation ? '●' : '—'}</span></div><div className="op-grid"><div><div className="op-l">Tipo</div><div className="op-v">{latestOperation?.contract_type || '—'}</div></div><div><div className="op-l">Tick Final</div><div className="op-v">{latestOperation?.exit_tick ?? '—'}</div></div><div><div className="op-l">Preço</div><div className="op-v dim">{latestOperation ? `${Number(latestOperation.buy_price || 0).toFixed(2)} ${currency}` : '—'}</div></div><div><div className="op-l">Resultado</div><div className={`op-v ${latestResult >= 0 ? 'pos' : 'neg'}`}>{latestOperation ? money(latestResult,currency) : '—'}</div></div></div></div>
        <div className="card strategy-wrap"><div className="strategy-head"><span className="lbl">Estratégias do Robô</span><span className="lbl">{signal ? `${Math.round(signal.strength)}%` : 'AUTO'}</span></div><div className="strategy-grid">{STRATEGIES.map(item => <button key={item.id} className={`strategy ${strategy === item.id ? 'on' : ''}`} onClick={() => chooseStrategy(item.id)} disabled={running}><span className="ico">{item.icon}</span>{item.label}</button>)}</div></div>
        <div className="wheel-wrap"><div className="wheel"><div className="wheel-ring"/><div className="wheel-center"><div className="wheel-digit">{currentDigit ?? '—'}</div><div className="wheel-lbl">Último Dígito</div></div>{[0,1,2,3,4,5,6,7,8,9].map(i => { const angle=(36*i)*Math.PI/180; const x=42*Math.sin(angle); const y=-42*Math.cos(angle); return <div key={i} className={`bubble ${currentDigit===i?'current':''}`} style={{transform:`translate(calc(-50% + ${x}%), calc(-50% + ${y}%))`}}><div className="n">{i}</div><div className="p">10.0%</div></div>; })}</div><div className="ticks-left"><b>{Math.max(0,windowSize-cycle)}</b> tick{Math.max(0,windowSize-cycle)===1?'':'s'} restante{Math.max(0,windowSize-cycle)===1?'':'s'}</div></div>
        <div className="stake"><div className="lbl" style={{display:'flex',justifyContent:'space-between'}}><span>Aposta</span><span>mínimo: 0.50 USD</span></div><div className="stake-box"><span className="stake-cur">USD</span><input className="stake-input" type="number" min="0.5" step="0.1" value={stake} onChange={e=>setStake(Math.max(.5,Number(e.target.value)||.5))} disabled={running}/></div></div>
        <button className={`action ${running?'stop':''}`} onClick={running?stop:start} disabled={!isConnected || !isAuthorized}>{running?'■  PARAR ROBÔ':'🤖  INICIAR ROBÔ'}{sessionProfit!==0&&<><span style={{opacity:.45}}>·</span><span>{money(sessionProfit,currency)} hoje</span></>}</button><div className="status"><span>{isConnected&&isAuthorized?'● Conectado à Deriv':'○ A ligar à Deriv…'}</span><strong>{running?'ROBÔ ATIVO':'ROBÔ PARADO'}</strong></div>
        <div className="card signal"><div className="lbl">Sinal Atual</div><div className="signal-box"><span className="signal-main">{signal?signal.label:'Aguardando próximo ciclo'}</span><span className="signal-pct">{signal?`${Math.round(signal.strength)}%`:'—'}</span></div><div className="stats-line">Par {Math.round(currentStats.even)}% · Ímpar {Math.round(currentStats.odd)}% · Acima {Math.round(currentStats.over)}% · Abaixo {Math.round(currentStats.under)}% · Subir {Math.round(currentStats.rise)}% · Descer {Math.round(currentStats.fall)}%</div></div>
        <div className="card symbol"><select className="select" value={selectedSymbol} onChange={e=>{setSelectedSymbol(e.target.value);resetAnalysis();}} disabled={running}>{SYMBOL_OPTIONS.map(s=><option key={s} value={s}>{SYMBOLS[s]}</option>)}</select><span style={{color:'var(--rgold)'}}>▾</span></div>
        <div><div className="lbl">Duração <span style={{float:'right',fontWeight:500,textTransform:'none',letterSpacing:0}}>ticks</span></div><div className="duration">{([1,5,10] as Duration[]).map(n=><button key={n} className={duration===n?'on':''} onClick={()=>setDuration(n)} disabled={running}>{n} tick{n>1?'s':''}</button>)}</div></div>
        <div className="card signal"><div className="lbl">Meta Diária</div><div className="target-row"><span style={{fontSize:11,color:'var(--rmid)'}}>{sessionProfit.toFixed(2)} / </span><input className="target-input" type="number" min="1" value={dailyTarget} onChange={e=>setDailyTarget(Math.max(1,Number(e.target.value)||1))}/><span style={{fontSize:10,color:'var(--rlow)',marginLeft:3}}>{currency}</span></div><div className="progress"><div style={{width:`${progress}%`}}/></div><div className="status"><span>{progress.toFixed(0)}% concluído</span><span>{profitTransactions.length} operações</span></div></div>
        <div className="card history"><div className="op-head"><span className="lbl">Histórico Recente</span><span className="lbl">{profitTransactions.length?'VER ÚLTIMOS':'AGUARDANDO TICK…'}</span></div><div className="history-list">{profitTransactions.length?profitTransactions.slice(0,8).map(tx=>{const pl=Number(tx.profit_loss||0);return <div className="hist" key={tx.contract_id}><span className="hist-time">{new Date(Number(tx.sell_time||tx.purchase_time)*1000).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span><span className="hist-type">{tx.contract_type||'Contrato'} · {tx.exit_tick??'—'}</span><span className={`hist-result ${pl>=0?'pos':'neg'}`}>{money(pl,currency)}</span></div>; }):<div className="empty">Nenhuma operação fechada nesta sessão.</div>}</div></div>
        {log.length>0&&<div className="card history"><div className="lbl">Análise do Robô</div><div className="history-list">{log.slice(0,5).map((item,i)=><div className="hist" key={`${item}-${i}`}><span className="hist-time">{item.slice(0,8)}</span><span className="hist-type">{item.slice(11)}</span><span>✓</span></div>)}</div></div>}
        {error&&<div className="risk"><b>Erro:</b> {error}</div>}
        <div className="footer">Powered by <span>MozHyper</span> · Negocie com responsabilidade</div>
      </div>
    </div>
  );
}
