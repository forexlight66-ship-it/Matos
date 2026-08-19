'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type Contract = 'EVEN' | 'ODD' | 'OVER' | 'UNDER';
const CONTRACT_TYPES: Record<Contract, string> = { EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER: 'DIGITOVER', UNDER: 'DIGITUNDER' };
const SYMBOLS: Record<string, string> = {
  R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index', R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index',
  '1HZ10V': 'Volatility 10 (1s) Index', '1HZ25V': 'Volatility 25 (1s) Index', '1HZ50V': 'Volatility 50 (1s) Index', '1HZ75V': 'Volatility 75 (1s) Index', '1HZ100V': 'Volatility 100 (1s) Index'
};
const SYMBOL_OPTIONS = ['R_10','R_25','R_50','R_75','R_100','1HZ10V','1HZ25V','1HZ50V','1HZ75V','1HZ100V'];
const USD_TO_MZN = 68;
const PHASE_STAKES = { INITIAL: 1, SOROS: 1.95, MG1: 2, MG2: 4.1, MG3: 8.4 } as const;
const ENTRY_BASELINE_PCT = 11;
const STRENGTH_TRIGGER_PCT = 60;
type Phase = keyof typeof PHASE_STAKES | 'STOP';
type Signal = { contract: Contract; pct10: number; reason: string };

function digit(v: number | string | undefined | null) {
  if (v == null) return null;
  const s = String(v).replace(/\D/g, '');
  return s ? Number(s.slice(-1)) : null;
}
function pct(ticks: number[], predicate: (d: number) => boolean) {
  const a = ticks.map(digit).filter((x): x is number => x !== null);
  return a.length ? a.filter(predicate).length / a.length * 100 : 0;
}
function buildSignal(ticks: number[]): Signal | null {
  if (ticks.length < 10) return null;
  const a = ticks.slice(-10);
  const even = pct(a, d => d % 2 === 0);
  const over = pct(a, d => d > 4);
  if (even >= STRENGTH_TRIGGER_PCT && even >= ENTRY_BASELINE_PCT) return { contract: 'EVEN', pct10: Math.round(even), reason: `PAR · 10T ${Math.round(even)}%` };
  if (100 - even >= STRENGTH_TRIGGER_PCT && 100 - even >= ENTRY_BASELINE_PCT) return { contract: 'ODD', pct10: Math.round(100 - even), reason: `ÍMPAR · 10T ${Math.round(100 - even)}%` };
  if (over >= STRENGTH_TRIGGER_PCT && over >= ENTRY_BASELINE_PCT) return { contract: 'OVER', pct10: Math.round(over), reason: `ACIMA 4 · 10T ${Math.round(over)}%` };
  if (100 - over >= STRENGTH_TRIGGER_PCT && 100 - over >= ENTRY_BASELINE_PCT) return { contract: 'UNDER', pct10: Math.round(100 - over), reason: `ABAIXO 5 · 10T ${Math.round(100 - over)}%` };
  return null;
}

let audioCtx: AudioContext | null = null;
function tone(kind: 'win' | 'loss' | 'target') {
  try {
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return;
    audioCtx ??= new C();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const master = audioCtx.createGain(); master.gain.value = .48; master.connect(audioCtx.destination);
    const notes = kind === 'target' ? [523, 659, 784, 1047, 1319] : kind === 'win' ? [659, 784, 988] : [247, 196, 147];
    notes.forEach((f, i) => {
      const o = audioCtx!.createOscillator(), g = audioCtx!.createGain(), t = audioCtx!.currentTime + i * .085;
      o.type = kind === 'loss' ? 'triangle' : 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.8, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .16);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + .18);
    });
    window.setTimeout(() => master.disconnect(), 700);
  } catch {}
}

function DigitCandles({ ticks }: { ticks: number[] }) {
  const dist = Array.from({ length: 10 }, (_, i) => ticks.length ? Math.round(pct(ticks.slice(-10), d => d === i)) : 0);
  return <div className="digit-candle-panel">
    <div className="digit-candle-title"><span>Dígitos · últimos 10 ticks</span><small>MT5</small></div>
    <div className="digit-candles">
      {dist.map((p, i) => {
        const high = p >= 10;
        const height = Math.max(4, Math.min(48, Math.round(p * .48)));
        return <div className="mt5-candle-wrap" key={i} title={`Dígito ${i}: ${p}%`}>
          <div className="mt5-candle-area"><div className={`mt5-wick ${high ? 'blue' : 'red'}`}></div><div className={`mt5-body ${high ? 'blue' : 'red'} ${high ? 'up' : 'down'}`} style={{ height }}></div><div className="mt5-midline"></div></div>
          <b>{i}</b><span className={high ? 'blue-text' : 'red-text'}>{p}%</span>
        </div>;
      })}
    </div>
  </div>;
}

function BotWorker({ symbol, accountType, lossLimitMzn, targetMzn, baseStake, setSharedActivity }: { symbol: string; accountType: 'demo' | 'real'; lossLimitMzn: number; targetMzn: number; baseStake: number; setSharedActivity: (s: string) => void }) {
  const { tick, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, profitTransactions, contractClosedSeq } = useDeriv(accountType);
  const [running, setRunning] = useState(false), [ticks, setTicks] = useState<number[]>([]), [signal, setSignal] = useState<Signal | null>(null), [phase, setPhase] = useState<Phase>('INITIAL'), [started, setStarted] = useState<number | null>(null), [losses, setLosses] = useState(0), [targetPopup, setTargetPopup] = useState(false), [activity, setActivity] = useState<string[]>([]), [lastClosedSeq, setLastClosedSeq] = useState(0);
  const lastEpoch = useRef<number | null>(null);
  const lastTradeTickEpoch = useRef<number | null>(null);
  const lastContract = useRef<number | null>(null);
  const requested = useRef(false);
  const proposalRequestedAt = useRef<number | null>(null);

  useEffect(() => { if (isConnected) subscribeTicks(symbol); }, [isConnected, symbol, subscribeTicks]);
  useEffect(() => {
    if (!tick?.epoch || tick.epoch === lastEpoch.current) return;
    lastEpoch.current = tick.epoch;
    setTicks(v => [...v.slice(-9), Number(tick.quote)]);
  }, [tick]);
  useEffect(() => setSignal(buildSignal(ticks)), [ticks]);

  const sessionProfit = useMemo(() => started ? profitTransactions.filter(x => Number(x.purchase_time) >= started).reduce((s, x) => s + Number(x.profit_loss || 0), 0) : 0, [profitTransactions, started]);
  const phaseMultiplier = phase === 'INITIAL' || phase === 'STOP' ? 1 : PHASE_STAKES[phase];
  const stake = baseStake * phaseMultiplier;
  const add = (s: string) => { const x = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${s}`; setActivity(v => [x, ...v].slice(0, 8)); setSharedActivity(`${SYMBOLS[symbol]}: ${s}`); };

  // Unlock the next analysis only from the explicit contract-closed event.
  useEffect(() => {
    if (!started || contractClosedSeq === lastClosedSeq) return;
    setLastClosedSeq(contractClosedSeq);
    requested.current = false;
    proposalRequestedAt.current = null;
    add('Contrato fechado · nova análise desbloqueada');
  }, [contractClosedSeq, started, lastClosedSeq]);

  useEffect(() => {
    const tx = profitTransactions[0];
    if (!tx?.contract_id || tx.contract_id === lastContract.current || !started || Number(tx.purchase_time) < started) return;
    lastContract.current = tx.contract_id;
    const p = Number(tx.profit_loss || 0);
    if (p >= 0) {
      setLosses(0); tone('win'); add(`WIN +${(p * USD_TO_MZN).toFixed(0)} MT`);
      setPhase(prev => prev === 'INITIAL' ? 'SOROS' : 'INITIAL');
    } else {
      const n = losses + 1; setLosses(n); tone('loss'); add(`LOSS ${(p * USD_TO_MZN).toFixed(0)} MT`);
      if (phase === 'INITIAL' || phase === 'SOROS') setPhase('MG1');
      else if (phase === 'MG1') setPhase('MG2');
      else if (phase === 'MG2') setPhase('MG3');
      else { setPhase('STOP'); setRunning(false); add('STOP LOSS — 3 recuperações'); }
    }
  }, [profitTransactions, started, phase, losses]);

  useEffect(() => {
    if (!running) return;
    if (sessionProfit >= targetMzn / USD_TO_MZN) { setRunning(false); requested.current = false; setTargetPopup(true); add(`META +${(sessionProfit * USD_TO_MZN).toFixed(0)} MT`); tone('target'); }
    else if (sessionProfit <= -lossLimitMzn / USD_TO_MZN) { setRunning(false); requested.current = false; setPhase('STOP'); add(`STOP LOSS ${(sessionProfit * USD_TO_MZN).toFixed(0)} MT`); tone('loss'); }
  }, [running, sessionProfit, targetMzn, lossLimitMzn]);

  // A proposal request may time out, but an open contract must never be unlocked by this timer.
  useEffect(() => {
    if (!running || !requested.current || !proposalRequestedAt.current) return;
    const timer = window.setInterval(() => {
      if (proposalRequestedAt.current && Date.now() - proposalRequestedAt.current > 7000 && !proposal && !buying && activeContractId === null) {
        requested.current = false;
        proposalRequestedAt.current = null;
        add('Timeout da proposta · repetir análise');
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [running, proposal, buying, activeContractId]);

  // Main state machine: one request at a time, and no new request while a contract is open.
  useEffect(() => {
    if (!running || !isAuthorized || !isConnected || buying || proposal || activeContractId !== null || !signal || requested.current) return;
    const epoch = Number(tick?.epoch);
    if (!epoch || (lastTradeTickEpoch.current !== null && epoch <= lastTradeTickEpoch.current)) return;
    requested.current = true;
    proposalRequestedAt.current = Date.now();
    lastTradeTickEpoch.current = epoch;
    add(`SINAL ${signal.contract} · 10T ${signal.pct10}%`);
    const sent = getProposal(symbol, CONTRACT_TYPES[signal.contract], stake, 1, signal.contract === 'OVER' ? 4 : signal.contract === 'UNDER' ? 5 : 0);
    if (!sent) { requested.current = false; proposalRequestedAt.current = null; }
  }, [running, isAuthorized, isConnected, buying, proposal, activeContractId, signal, symbol, getProposal, stake, tick?.epoch]);

  useEffect(() => {
    if (!running || !proposal || buying || activeContractId !== null) return;
    buy(proposal.id, proposal.ask_price);
    // Keep requested=true until Deriv confirms the buy and then until the contract closes.
    // This prevents a second proposal from being requested in the gap between buy() and buy confirmation.
    proposalRequestedAt.current = null;
  }, [proposal, running, buying, activeContractId, buy]);

  const start = () => {
    if (!isAuthorized || !isConnected) return;
    setStarted(Math.floor(Date.now() / 1000)); setTicks([]); setLosses(0); setPhase('INITIAL'); setTargetPopup(false); setRunning(true); lastContract.current = null; lastTradeTickEpoch.current = null; requested.current = false; proposalRequestedAt.current = null; setLastClosedSeq(contractClosedSeq); setActivity([]); add('Robô iniciado');
  };
  const stop = () => { setRunning(false); requested.current = false; proposalRequestedAt.current = null; add('Robô parado'); };
  const phaseLabel = phase === 'STOP' ? 'STOP LOSS' : phase === 'INITIAL' ? `Inicial · $${baseStake.toFixed(2)}` : phase === 'SOROS' ? `Soros N2 · $${stake.toFixed(2)}` : `Martingale ${phase.replace('MG', '')} · $${stake.toFixed(2)}`;
  const signalName = signal ? signal.contract === 'EVEN' ? 'PAR' : signal.contract === 'ODD' ? 'ÍMPAR' : signal.contract === 'OVER' ? 'ACIMA 4' : 'ABAIXO 5' : 'Aguardando sinal';

  return <div className="bot-worker">
    {targetPopup && <div className="target-popup"><b>🎯 Meta atingida</b><span>+{(sessionProfit * USD_TO_MZN).toFixed(0)} MT</span><button onClick={() => setTargetPopup(false)}>×</button></div>}
    <div className="auto-status-card">
      <DigitCandles ticks={ticks} />
      <div className="auto-status-row"><div><div className="auto-label">{SYMBOLS[symbol]}</div><div className={`auto-status ${running ? 'on' : 'off'}`}>{running ? 'Em execução' : 'Parado'}</div></div><button className={`auto-switch ${running ? 'on' : ''}`} onClick={running ? stop : start}><span /></button></div>
      <div className="auto-sub">Análise: últimos 10 ticks · {isConnected ? 'Ligado à Deriv' : 'A ligar'} · {accountType === 'real' ? 'Conta Real' : 'Conta Demo'}</div>
    </div>
    <div className="auto-metrics"><div><b>{ticks.length}/10</b><span>Ticks</span></div><div><b>{signal ? `${signal.pct10}%` : '—'}</b><span>Força 10T</span></div><div><b className={sessionProfit >= 0 ? 'up' : 'down'}>{sessionProfit >= 0 ? '+' : ''}{(sessionProfit * USD_TO_MZN).toFixed(0)} MT</b><span>Resultado</span></div><div><b>{losses} L</b><span>Perdas</span></div></div>
    <div className="auto-section-title">Estratégia <small>{signal ? signal.reason : 'Aguardando sinal'}</small></div>
    <div className="auto-strategy"><strong>{signalName}</strong><em>{signal ? 'SINAL' : 'AGUARDAR'}</em></div>
    <div className="profit-table"><div className="profit-head"><span>Hora</span><span>Resultado</span><span>MT</span></div>{profitTransactions.slice(0, 6).map((x: any) => <div className="profit-row" key={x.contract_id}><span>{new Date(Number(x.sell_time || x.purchase_time) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span>{Number(x.profit_loss) >= 0 ? 'WIN' : 'LOSS'}</span><strong className={Number(x.profit_loss) >= 0 ? 'up' : 'down'}>{Number(x.profit_loss) >= 0 ? '+' : ''}{(Number(x.profit_loss) * USD_TO_MZN).toFixed(0)}</strong></div>)}{!profitTransactions.length && <div className="profit-empty">Sem operações ainda</div>}</div>
    <div className="auto-section-title">Gestão de risco <small>MT</small></div>
    <div className="stake-read"><span>Stake actual</span><div><button onClick={() => setSharedActivity('Stake configurado no painel de gestão')}>−</button><b>${baseStake.toFixed(2)}</b><button onClick={() => setSharedActivity('Stake configurado no painel de gestão')}>+</button></div></div>
    <div className="auto-risk"><label>Stop loss diário <b>{lossLimitMzn.toFixed(0)} MT</b></label><label>Meta diária <b>{targetMzn.toFixed(0)} MT</b></label></div>
    <div className="phase-current"><span>Fase actual</span><b>{phaseLabel}</b></div>
    <div className="auto-section-title">Registo de actividades <small>ao vivo</small></div><div className="auto-log">{activity.length ? activity.map((x, i) => <div key={i}>{x}</div>) : 'Aguardando atividade do robô…'}</div>
    <div className="auto-symbols"><label>Índice</label><select value={symbol} onChange={e => { setRunning(false); requested.current = false; setTicks([]); setSignal(null); setSymbol(e.target.value); }}><option value="1HZ100V">Volatility 100 (1s) Index</option>{SYMBOL_OPTIONS.filter(s => s !== '1HZ100V').map(s => <option key={s} value={s}>{SYMBOLS[s]}</option>)}</select></div>
  </div>;
}

export default function AutoBot() {
  const [symbol, setSymbol] = useState('1HZ100V');
  const [lossLimitMzn] = useState(2040), [targetMzn] = useState(3400), [stake, setStake] = useState(1), [shared, setShared] = useState(''), [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const changeStake = (d: number) => setStake(v => Math.min(10, Math.max(.35, Math.round((v + d) * 100) / 100)));
  return <div className="auto-bot"><style jsx global>{`
    .auto-bot{padding:14px}.bot-worker{background:var(--s1);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:12px;margin-bottom:14px;box-shadow:0 12px 30px rgba(0,0,0,.12)}
    .auto-status-card{background:linear-gradient(180deg,#101a30,#0b1120);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:13px;position:relative;overflow:hidden}
    .digit-candle-panel{background:#080d18;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:8px;margin:4px 0 12px}.digit-candle-title{display:flex;justify-content:space-between;color:var(--t2);font-size:8px;margin-bottom:7px;text-transform:uppercase;letter-spacing:.04em}.digit-candle-title small{color:#7f8ba3}.digit-candles{display:grid;grid-template-columns:repeat(10,1fr);gap:5px}.mt5-candle-wrap{text-align:center;min-width:0}.mt5-candle-area{height:54px;position:relative;display:flex;align-items:center;justify-content:center}.mt5-wick{width:1px;height:46px;position:absolute;opacity:.8}.mt5-body{width:8px;border-radius:1px;position:absolute;min-height:4px}.mt5-body.up{bottom:4px}.mt5-body.down{top:4px}.mt5-midline{position:absolute;left:0;right:0;top:27px;border-top:1px dashed #26324b}.blue{background:#3b82f6}.red{background:#ef4b5b}.blue-text{color:#3b82f6}.red-text{color:#ef4b5b}.mt5-candle-wrap b{display:block;font:700 9px 'IBM Plex Mono';color:var(--t1)}.mt5-candle-wrap span{display:block;font:8px 'IBM Plex Mono';margin-top:2px}.auto-status-row{display:flex;align-items:center;justify-content:space-between}.auto-label{font-size:9px;color:var(--t3);text-transform:uppercase}.auto-status{font:700 15px 'Space Grotesk'}.auto-status.on{color:#2fd480}.auto-status.off{color:#8a93ac}.auto-switch{width:52px;height:30px;border:0;border-radius:20px;background:#343c50;position:relative;cursor:pointer}.auto-switch.on{background:#2fd480}.auto-switch span{position:absolute;top:3px;left:3px;width:24px;height:24px;background:#fff;border-radius:50%;transition:.2s}.auto-switch.on span{left:25px}.auto-sub{font-size:9px;color:var(--t3);margin-top:8px}.auto-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:10px 0}.auto-metrics>div,.auto-risk,.phase-current,.stake-read,.auto-strategy,.profit-table,.auto-log,.auto-symbols{background:var(--s2);border:1px solid rgba(255,255,255,.06);border-radius:12px}.auto-metrics>div{padding:8px 4px;text-align:center}.auto-metrics b{display:block;font:700 12px 'IBM Plex Mono';color:var(--t1)}.auto-metrics span{display:block;font-size:8px;color:var(--t3);margin-top:3px}.up{color:#2fd480!important}.down{color:#f0495a!important}.auto-section-title{display:flex;justify-content:space-between;align-items:center;color:var(--t2);font:700 11px 'Space Grotesk';text-transform:uppercase;letter-spacing:.05em;margin:13px 2px 7px}.auto-section-title small{font:500 8px 'Inter';color:var(--t3);text-transform:none;letter-spacing:0}.auto-strategy{padding:12px;display:flex;justify-content:space-between;align-items:center}.auto-strategy strong{font:700 14px 'Space Grotesk';color:var(--t1)}.auto-strategy em{font:700 8px 'IBM Plex Mono';color:#3b82f6;font-style:normal}.profit-table{overflow:hidden}.profit-head,.profit-row{display:grid;grid-template-columns:1fr 1fr .8fr;gap:4px;padding:8px 10px;font-size:9px}.profit-head{color:var(--t3);background:rgba(255,255,255,.025)}.profit-row{color:var(--t2);border-top:1px solid rgba(255,255,255,.04)}.profit-row strong{text-align:right}.profit-row span:nth-child(2){text-align:center}.profit-empty{padding:12px;text-align:center;font-size:9px;color:var(--t3)}.stake-read{padding:10px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:var(--t2)}.stake-read>div{display:flex;align-items:center;gap:8px}.stake-read button{width:24px;height:24px;border:0;border-radius:7px;background:var(--s3);color:var(--t1);font-weight:800}.stake-read b{color:var(--t1)}.auto-risk{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;margin-top:7px}.auto-risk label{font-size:9px;color:var(--t3)}.auto-risk b{display:block;color:var(--t1);font:700 12px 'IBM Plex Mono';margin-top:3px}.phase-current{padding:10px;margin-top:7px;display:flex;justify-content:space-between;font-size:9px;color:var(--t3)}.phase-current b{color:var(--t1)}.auto-log{padding:9px;max-height:145px;overflow:auto;font:9px 'IBM Plex Mono';color:var(--t2)}.auto-log div{padding:5px 0;border-bottom:1px dashed rgba(255,255,255,.05)}.auto-symbols{padding:10px;margin-top:9px;display:flex;justify-content:space-between;align-items:center}.auto-symbols label{font-size:9px;color:var(--t3)}.auto-symbols select{background:var(--s3);border:1px solid rgba(255,255,255,.08);color:var(--t1);border-radius:7px;padding:7px;font-size:9px;max-width:70%}.target-popup{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:200;width:min(330px,calc(100vw - 30px));padding:14px;border-radius:14px;background:var(--s2);border:1px solid #2fd48066;box-shadow:0 18px 40px #0007;display:flex;align-items:center;gap:10px}.target-popup b{color:#2fd480;font-size:11px}.target-popup span{font:700 13px 'IBM Plex Mono';color:var(--t1)}.target-popup button{margin-left:auto;background:transparent;border:0;color:var(--t2);font-size:20px}
  `}</style>
    <div className="bot-settings"><label>Conta</label><button className={accountType==='demo'?'active':''} onClick={()=>setAccountType('demo')}>Demo</button><button className={accountType==='real'?'active':''} onClick={()=>setAccountType('real')}>Real</button><label>Stake</label><button onClick={()=>changeStake(-.25)}>−</button><b>${stake.toFixed(2)}</b><button onClick={()=>changeStake(.25)}>+</button></div>
    <BotWorker symbol={symbol} accountType={accountType} lossLimitMzn={lossLimitMzn} targetMzn={targetMzn} baseStake={stake} setSharedActivity={setShared} />
    {shared && <div className="shared-activity">{shared}</div>}
  </div>;
}
