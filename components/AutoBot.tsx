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
  const even10 = pct(a, d => d % 2 === 0);
  const over10 = pct(a, d => d > 4);
  if (even10 >= 60) return { contract: 'EVEN', pct10: Math.round(even10), reason: `PAR · 10T ${Math.round(even10)}%` };
  if (100 - even10 >= 60) return { contract: 'ODD', pct10: Math.round(100 - even10), reason: `ÍMPAR · 10T ${Math.round(100 - even10)}%` };
  if (over10 >= 60) return { contract: 'OVER', pct10: Math.round(over10), reason: `ACIMA 4 · 10T ${Math.round(over10)}%` };
  if (100 - over10 >= 60) return { contract: 'UNDER', pct10: Math.round(100 - over10), reason: `ABAIXO 5 · 10T ${Math.round(100 - over10)}%` };
  return null;
}
function tone(kind: 'win' | 'loss' | 'target') {
  try {
    const C = window.AudioContext || (window as any).webkitAudioContext; if (!C) return;
    const c = new C(), master = c.createGain(); master.gain.value = .42; master.connect(c.destination);
    const notes = kind === 'target' ? [523, 659, 784, 1047] : kind === 'win' ? [659, 784, 988] : [247, 196, 147];
    notes.forEach((f, i) => { const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * .09; o.type = kind === 'loss' ? 'triangle' : 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(.7, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .14); o.connect(g); g.connect(master); o.start(t); o.stop(t + .16); });
    setTimeout(() => c.close(), 700);
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
          <div className="mt5-candle-area">
            <div className={`mt5-wick ${high ? 'blue' : 'red'}`}></div>
            <div className={`mt5-body ${high ? 'blue' : 'red'} ${high ? 'up' : 'down'}`} style={{ height }}></div>
            <div className="mt5-midline"></div>
          </div>
          <b>{i}</b><span className={high ? 'blue-text' : 'red-text'}>{p}%</span>
        </div>;
      })}
    </div>
  </div>;
}

function BotWorker({ symbol, accountType, lossLimitMzn, targetMzn, baseStake, setSharedActivity }: { symbol: string; accountType: 'demo' | 'real'; lossLimitMzn: number; targetMzn: number; baseStake: number; setSharedActivity: (s: string) => void }) {
  const { tick, proposal, buy, buying, getProposal, subscribeTicks, isAuthorized, isConnected, profitTransactions } = useDeriv(accountType);
  const [running, setRunning] = useState(false), [ticks, setTicks] = useState<number[]>([]), [signal, setSignal] = useState<Signal | null>(null), [phase, setPhase] = useState<Phase>('INITIAL'), [started, setStarted] = useState<number | null>(null), [losses, setLosses] = useState(0), [targetPopup, setTargetPopup] = useState(false), [activity, setActivity] = useState<string[]>([]);
  const lastEpoch = useRef<number | null>(null), lastContract = useRef<number | null>(null), requested = useRef(false);

  useEffect(() => { if (isConnected) subscribeTicks(symbol); }, [isConnected, symbol, subscribeTicks]);
  useEffect(() => { if (tick?.epoch && tick.epoch !== lastEpoch.current) { lastEpoch.current = tick.epoch; setTicks(v => [...v.slice(-9), Number(tick.quote)]); } }, [tick]);
  useEffect(() => setSignal(buildSignal(ticks)), [ticks]);
  const sessionProfit = useMemo(() => started ? profitTransactions.filter(x => Number(x.purchase_time) >= started).reduce((s, x) => s + Number(x.profit_loss || 0), 0) : 0, [profitTransactions, started]);
  const phaseMultiplier = phase === 'INITIAL' || phase === 'STOP' ? 1 : PHASE_STAKES[phase];
  const stake = baseStake * phaseMultiplier;
  const add = (s: string) => { const x = `${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${s}`; setActivity(v => [x, ...v].slice(0, 8)); setSharedActivity(`${SYMBOLS[symbol]}: ${s}`); };

  useEffect(() => {
    const tx = profitTransactions[0]; if (!tx?.contract_id || tx.contract_id === lastContract.current || !started || Number(tx.purchase_time) < started) return;
    lastContract.current = tx.contract_id; const p = Number(tx.profit_loss || 0);
    if (p >= 0) { setLosses(0); tone('win'); add(`WIN +${(p * USD_TO_MZN).toFixed(0)} MT`); setPhase(phase === 'INITIAL' ? 'SOROS' : 'INITIAL'); }
    else { const n = losses + 1; setLosses(n); tone('loss'); add(`LOSS ${(p * USD_TO_MZN).toFixed(0)} MT`); if (phase === 'INITIAL' || phase === 'SOROS') setPhase('MG1'); else if (phase === 'MG1') setPhase('MG2'); else if (phase === 'MG2') setPhase('MG3'); else { setPhase('STOP'); setRunning(false); add('STOP LOSS — 3 recuperações'); } }
  }, [profitTransactions, started, phase, losses]);

  useEffect(() => { if (!running) return; if (sessionProfit >= targetMzn / USD_TO_MZN) { setRunning(false); setTargetPopup(true); add(`META +${(sessionProfit * USD_TO_MZN).toFixed(0)} MT`); tone('target'); } else if (sessionProfit <= -lossLimitMzn / USD_TO_MZN) { setRunning(false); setPhase('STOP'); add(`STOP LOSS ${(sessionProfit * USD_TO_MZN).toFixed(0)} MT`); tone('loss'); } }, [running, sessionProfit, targetMzn, lossLimitMzn]);
  useEffect(() => { if (!running || !isAuthorized || !isConnected || buying || proposal || !signal || requested.current) return; requested.current = true; add(`SINAL ${signal.contract} · 10T ${signal.pct10}%`); getProposal(symbol, CONTRACT_TYPES[signal.contract], stake, 1, signal.contract === 'OVER' ? 4 : signal.contract === 'UNDER' ? 5 : 0); }, [running, isAuthorized, isConnected, buying, proposal, signal, symbol, getProposal, stake]);
  useEffect(() => { if (running && proposal && !buying) { buy(proposal.id, proposal.ask_price); requested.current = false; } }, [proposal, running, buying, buy]);

  const start = () => { if (!isAuthorized || !isConnected) return; setStarted(Math.floor(Date.now() / 1000)); setTicks([]); setLosses(0); setPhase('INITIAL'); setTargetPopup(false); setRunning(true); lastContract.current = null; requested.current = false; setActivity([]); add('Robô iniciado'); };
  const stop = () => { setRunning(false); add('Robô parado'); };
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
    <div className="stake-read"><span>Stake actual</span><b>${baseStake.toFixed(2)}</b></div>
    <div className="auto-risk"><label>Stop loss diário <b>{lossLimitMzn.toFixed(0)} MT</b></label><label>Meta diária <b>{targetMzn.toFixed(0)} MT</b></label></div>
    <div className="phase-current"><span>Fase actual</span><b>{phaseLabel}</b></div>
    <div className="auto-section-title">Registo de actividades <small>ao vivo</small></div><div className="auto-log">{activity.length ? activity.map((x, i) => <div key={i}>{x}</div>) : 'Aguardando atividade do robô…'}</div>
  </div>;
}

export default function AutoBot() {
  const [symbol, setSymbol] = useState('R_10');
  const [lossLimitMzn] = useState(2040), [targetMzn] = useState(3400), [stake, setStake] = useState(1), [shared, setShared] = useState(''), [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const changeStake = (d: number) => setStake(v => Math.min(10, Math.max(.35, Math.round((v + d) * 100) / 100)));
  return <div className="auto-bot"><style jsx global>{`
    .auto-bot{padding:14px}.bot-worker{background:var(--s1);border:1px solid rgba(255,255,255,.07);border-radius:18px;padding:12px;margin-bottom:14px;box-shadow:0 12px 30px rgba(0,0,0,.12)}
    .auto-status-card{background:linear-gradient(180deg,#101a30,#0b1120);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:13px;position:relative;overflow:hidden}
    .digit-candle-panel{background:#080d18;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:8px;margin:4px 0 12px}.digit-candle-title{display:flex;justify-content:space-between;color:var(--t2);font-size:8px;margin-bottom:7px;text-transform:uppercase;letter-spacing:.04em}.digit-candle-title small{color:#7f8ba3}.digit-candles{display:grid;grid-template-columns:repeat(10,1fr);gap:2px;height:82px;align-items:stretch}.mt5-candle-wrap{position:relative;display:flex;flex-direction:column;align-items:center;min-width:0}.mt5-candle-area{position:relative;height:61px;width:100%;display:flex;justify-content:center;align-items:center}.mt5-midline{position:absolute;left:0;right:0;top:50%;border-top:1px dashed rgba(255,255,255,.12)}.mt5-wick{position:absolute;width:1px;height:54px;top:3px;border-radius:1px}.mt5-body{position:absolute;width:7px;min-width:4px;border-radius:1px;z-index:2;box-shadow:0 0 5px currentColor}.mt5-body.up{bottom:50%}.mt5-body.down{top:50%}.mt5-wick.blue,.mt5-body.blue{background:#3b82f6;color:#3b82f6}.mt5-wick.red,.mt5-body.red{background:#ef4444;color:#ef4444}.mt5-candle-wrap>b{font-size:8px;color:var(--t1);line-height:9px}.mt5-candle-wrap>span{font:700 7px 'JetBrains Mono';line-height:9px}.blue-text{color:#3b82f6}.red-text{color:#ef4444}
    .auto-status-row{display:flex;align-items:center;justify-content:space-between}.auto-label{font-size:9px;color:var(--t3);text-transform:uppercase}.auto-status{font:700 14px 'Space Grotesk';margin-top:2px}.auto-status.on{color:#34d399}.auto-status.off{color:#f87171}.auto-switch{width:48px;height:28px;border:0;border-radius:20px;background:#39445a;padding:3px;cursor:pointer}.auto-switch span{display:block;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s}.auto-switch.on{background:#34d399}.auto-switch.on span{transform:translateX(20px)}.auto-sub{font-size:8px;color:var(--t3);margin-top:8px}.auto-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin:8px 0}.auto-metrics>div{padding:8px 3px;text-align:center;background:var(--s2);border-radius:9px}.auto-metrics b{display:block;font:800 11px 'JetBrains Mono'}.auto-metrics span{font-size:7px;color:var(--t3)}.up{color:#34d399}.down{color:#f87171}
    .auto-section-title{margin:13px 1px 7px;font:700 11px 'Space Grotesk';color:var(--t2)}.auto-section-title small{float:right;color:var(--t3);font:500 8px Inter}.auto-strategy{display:flex;justify-content:space-between;align-items:center;padding:11px;border-radius:11px;background:var(--s2);border:1px solid rgba(255,255,255,.06)}.auto-strategy strong{font-size:11px}.auto-strategy em{font-style:normal;font-size:8px;color:#34d399}.profit-table{margin-top:7px;overflow:hidden;border-radius:11px;border:1px solid rgba(255,255,255,.07)}.profit-head,.profit-row{display:grid;grid-template-columns:1fr 1fr .7fr;gap:5px;padding:7px 9px;font-size:8px}.profit-head{background:var(--s2);color:var(--t3);text-transform:uppercase;font-weight:800}.profit-row{border-top:1px solid rgba(255,255,255,.05);color:var(--t2)}.profit-row strong{font-family:'JetBrains Mono'}.profit-empty{text-align:center;padding:12px;color:var(--t3);font-size:8px}
    .stake-read,.auto-risk label{padding:9px;background:var(--s2);border-radius:9px;font-size:8px;color:var(--t3)}.stake-read{display:flex;justify-content:space-between;align-items:center}.stake-read b{color:var(--t1);font:800 11px 'JetBrains Mono'}.auto-risk{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:7px}.auto-risk b{display:block;margin-top:3px;color:var(--t1);font-size:10px}.phase-current{margin-top:7px;padding:10px;border-radius:10px;background:linear-gradient(90deg,#18243b,#101827);display:flex;justify-content:space-between;gap:8px;font-size:8px;color:var(--t3)}.phase-current b{color:#f2a93b;font-size:9px}.auto-log{padding:9px;border-radius:10px;background:#070a12;color:var(--t2);font:8px 'JetBrains Mono';line-height:1.6}.target-popup{position:fixed;z-index:1000;left:50%;top:18px;transform:translateX(-50%);width:min(330px,calc(100vw - 28px));padding:12px;border-radius:13px;background:#102b27;border:1px solid #34d39988;box-shadow:0 15px 40px #0008}.target-popup span{margin-left:8px;color:#34d399;font-weight:800}.target-popup button{float:right;border:0;background:none;color:#fff;font-size:18px}.account-toggle{display:flex;gap:5px;margin:7px 0}.account-toggle button{flex:1;padding:8px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:var(--s2);color:var(--t2);font-size:9px}.account-toggle button.active{color:#fff;background:#2563eb}.symbol-select{width:100%;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:var(--s2);color:var(--t1);font-size:10px;margin-top:7px}.stake-control{display:flex;align-items:center;justify-content:center;gap:12px;padding:10px;background:var(--s2);border-radius:11px;margin-top:7px}.stake-control button{width:30px;height:30px;border:0;border-radius:8px;background:var(--s3);color:var(--t1);font-size:20px;cursor:pointer}.stake-control b{min-width:64px;text-align:center;font:800 13px 'JetBrains Mono'}
  `}</style>
    <div className="auto-section-title">Robô de dígitos <small>1 índice por vez</small></div>
    <select className="symbol-select" value={symbol} onChange={e => setSymbol(e.target.value)}>{SYMBOL_OPTIONS.map(s => <option key={s} value={s}>{SYMBOLS[s]}</option>)}</select>
    <div className="account-toggle"><button className={accountType === 'demo' ? 'active' : ''} onClick={() => setAccountType('demo')}>Conta Demo</button><button className={accountType === 'real' ? 'active' : ''} onClick={() => setAccountType('real')}>Conta Real</button></div>
    <div className="auto-section-title">Gestão de risco <small>MT</small></div>
    <div className="stake-control"><span style={{ fontSize: 9, color: 'var(--t3)' }}>Stake</span><button onClick={() => changeStake(-.1)}>−</button><b>${stake.toFixed(2)}</b><button onClick={() => changeStake(.1)}>+</button></div>
    <BotWorker key={`${accountType}-${symbol}`} symbol={symbol} accountType={accountType} lossLimitMzn={lossLimitMzn} targetMzn={targetMzn} baseStake={stake} setSharedActivity={setShared} />
    {shared && <div className="auto-log" style={{ marginTop: 4 }}>Última actividade: {shared}</div>}
  </div>;
}
