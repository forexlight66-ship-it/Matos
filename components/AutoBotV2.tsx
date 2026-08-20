'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type WindowSize = 5 | 10 | 25 | 50 | 100 | 200;
type Duration = 1 | 5 | 10;
type Strategy = 'PAR_IMPAR' | 'ACIMA_ABAIXO' | 'RISE_FALL' | 'COMBINADA' | 'HIBRIDA';
type Contract = 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'RISE' | 'FALL';
type Signal = { contract: Contract; label: string; strength: number; barrier?: number };
type Option<T extends string | number> = { value: T; label: string };

const SYMBOLS: Record<string, string> = {
  R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index',
  R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index',
  '1HZ10V': 'Volatility 10 (1s) Index', '1HZ25V': 'Volatility 25 (1s) Index',
  '1HZ50V': 'Volatility 50 (1s) Index', '1HZ75V': 'Volatility 75 (1s) Index',
  '1HZ100V': 'Volatility 100 (1s) Index'
};
const CONTRACT_TYPES: Record<Contract, string> = {
  EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER: 'DIGITOVER', UNDER: 'DIGITUNDER', RISE: 'CALL', FALL: 'PUT'
};
const WINDOW_OPTIONS: Option<WindowSize>[] = [5, 10, 25, 50, 100, 200].map(v => ({ value: v as WindowSize, label: `${v} ticks` }));
const DURATION_OPTIONS: Option<Duration>[] = [1, 5, 10].map(v => ({ value: v as Duration, label: `${v} tick${v > 1 ? 's' : ''}` }));
const STRATEGY_OPTIONS: Option<Strategy>[] = [
  { value: 'HIBRIDA', label: 'Híbrida — Soros + Acima/Abaixo + Under 8' },
  { value: 'PAR_IMPAR', label: 'Par / Ímpar' },
  { value: 'ACIMA_ABAIXO', label: 'Acima 4 / Abaixo 5' },
  { value: 'RISE_FALL', label: 'Subir / Descer' },
  { value: 'COMBINADA', label: 'Combinada' },
];
const USD_TO_MZN = 68;

function lastDigit(v: number | string | null | undefined) {
  if (v == null) return null;
  const s = String(v).replace(/\D/g, '');
  return s ? Number(s.slice(-1)) : null;
}
function stats(values: number[]) {
  const digits = values.map(lastDigit).filter((x): x is number => x !== null);
  const n = digits.length || 1;
  const even = digits.filter(d => d % 2 === 0).length / n * 100;
  const over = digits.filter(d => d > 4).length / n * 100;
  let rise = 0, fall = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) rise++;
    else if (values[i] < values[i - 1]) fall++;
  }
  const trendN = Math.max(1, rise + fall);
  return { even, odd: 100 - even, over, under: 100 - over, rise: rise / trendN * 100, fall: fall / trendN * 100 };
}
function repeatedParity(values: number[]) {
  const digits = values.map(lastDigit).filter((x): x is number => x !== null);
  if (digits.length < 4) return null;
  const tail = digits.slice(-4);
  if (tail.every(d => d % 2 === 0)) return 'even';
  if (tail.every(d => d % 2 !== 0)) return 'odd';
  return null;
}
function normalSignal(values: number[], strategy: Strategy): Signal | null {
  if (values.length < 2) return null;
  const s = stats(values), threshold = 55;
  const parity: Signal | null = s.even >= threshold ? { contract: 'EVEN', label: 'PAR', strength: s.even } : s.odd >= threshold ? { contract: 'ODD', label: 'ÍMPAR', strength: s.odd } : null;
  const overUnder: Signal | null = s.over >= threshold ? { contract: 'OVER', label: 'ACIMA 4', strength: s.over, barrier: 4 } : s.under >= threshold ? { contract: 'UNDER', label: 'ABAIXO 5', strength: s.under, barrier: 5 } : null;
  const trend: Signal | null = s.rise >= threshold ? { contract: 'RISE', label: 'SUBIR', strength: s.rise } : s.fall >= threshold ? { contract: 'FALL', label: 'DESCER', strength: s.fall } : null;
  if (strategy === 'PAR_IMPAR') return parity;
  if (strategy === 'ACIMA_ABAIXO') return overUnder;
  if (strategy === 'RISE_FALL') return trend;
  return parity && overUnder && trend ? { contract: parity.contract, label: `${parity.label} + ${overUnder.label} + ${trend.label}`, strength: Math.round((parity.strength + overUnder.strength + trend.strength) / 3) } : parity || overUnder || trend;
}
function hybridBaseSignal(values: number[]): Signal | null {
  if (values.length < 2) return null;
  const s = stats(values);
  if (repeatedParity(values)) {
    return s.over >= s.under ? { contract: 'OVER', label: 'ACIMA 4 · sequência detectada', strength: s.over, barrier: 4 } : { contract: 'UNDER', label: 'ABAIXO 5 · sequência detectada', strength: s.under, barrier: 5 };
  }
  return s.even >= s.odd ? { contract: 'EVEN', label: 'PAR · ciclo Soros', strength: s.even } : { contract: 'ODD', label: 'ÍMPAR · ciclo Soros', strength: s.odd };
}
function mzn(usd: number, currency = 'USD') {
  const value = currency === 'MZN' ? usd : usd * USD_TO_MZN;
  return `${value.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}
function signedMzn(usd: number, currency = 'USD') { return `${usd >= 0 ? '+' : ''}${mzn(usd, currency)}`; }

function Dropdown<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: Option<T>[]; onChange: (v: T) => void }) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.value === value);
  return <div className="drop-wrap">
    {label && <div className="field-label">{label}</div>}
    <button className={`drop-button ${open ? 'open' : ''}`} onClick={() => setOpen(v => !v)} type="button">
      <span>{selected?.label ?? String(value)}</span><span className="chev">⌄</span>
    </button>
    {open && <div className="drop-menu">{options.map(o => <button key={String(o.value)} type="button" className={o.value === value ? 'selected' : ''} onClick={() => { onChange(o.value); setOpen(false); }}><span>{o.label}</span>{o.value === value && <span>✓</span>}</button>)}</div>}
  </div>;
}

export default function AutoBotV2() {
  const [symbol, setSymbol] = useState('R_100');
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [windowSize, setWindowSize] = useState<WindowSize>(5);
  const [strategy, setStrategy] = useState<Strategy>('HIBRIDA');
  const [stake, setStake] = useState(1.5);
  const [duration, setDuration] = useState<Duration>(1);
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [cycle, setCycle] = useState(0);
  const [sig, setSig] = useState<Signal | null>(null);
  const [target, setTarget] = useState(1000);
  const [toast, setToast] = useState<{ kind: 'win' | 'loss' | 'goal'; title: string; value: number; detail?: string } | null>(null);
  const [sorosLevel, setSorosLevel] = useState(0);
  const [sorosStake, setSorosStake] = useState(1.5);
  const [martingaleSafety, setMartingaleSafety] = useState(false);
  const [manualStopReason, setManualStopReason] = useState('');
  const [selectedDigit, setSelectedDigit] = useState(5);
  const lastEpoch = useRef<number | null>(null);
  const requested = useRef(false);
  const lastClosed = useRef<number | null>(null);
  const seenClosed = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { tick, balance, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, error, profitTransactions, contractClosedSeq } = useDeriv(accountType);

  const show = (x: { kind: 'win' | 'loss' | 'goal'; title: string; value: number; detail?: string }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(x);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => { if (isConnected) subscribeTicks(symbol); }, [isConnected, symbol, subscribeTicks]);
  useEffect(() => {
    if (!tick?.epoch || tick.epoch === lastEpoch.current) return;
    lastEpoch.current = tick.epoch;
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;
    setTicks(prev => {
      const next = [...prev, quote];
      if (next.length >= windowSize) {
        const nextSignal = martingaleSafety && strategy === 'HIBRIDA'
          ? { contract: 'UNDER' as const, label: 'UNDER 8 · segurança Martingale', strength: 80, barrier: 8 }
          : strategy === 'HIBRIDA' ? hybridBaseSignal(next.slice(-windowSize)) : normalSignal(next.slice(-windowSize), strategy);
        setSig(nextSignal); setCycle(0); return [];
      }
      setCycle(next.length); return next;
    });
  }, [tick, windowSize, strategy, martingaleSafety]);

  const latest = profitTransactions[0] || null;
  const latestPnl = Number(latest?.profit_loss || 0);
  const currency = balance?.currency || 'USD';
  const profitUsd = useMemo(() => profitTransactions.reduce((sum, tx) => sum + Number(tx.profit_loss || 0), 0), [profitTransactions]);
  const profitMzn = currency === 'MZN' ? profitUsd : profitUsd * USD_TO_MZN;
  const targetProgress = target > 0 ? Math.min(100, Math.max(0, profitMzn / target * 100)) : 0;
  const currentDigit = lastDigit(tick?.quote);
  const liveStats = useMemo(() => stats(ticks), [ticks]);
  const activeStake = strategy === 'HIBRIDA' ? (martingaleSafety ? stake * 2 : sorosLevel === 1 ? sorosStake : stake) : stake;

  useEffect(() => {
    if (!running || !isAuthorized || !isConnected || requested.current || proposal || buying || activeContractId !== null || !sig) return;
    requested.current = true;
    const contract = sig.contract;
    const type = CONTRACT_TYPES[contract];
    const digitContract = ['EVEN', 'ODD', 'OVER', 'UNDER'].includes(contract);
    const dur = digitContract ? Math.min(10, Math.max(1, duration)) : duration;
    const barrier = contract === 'OVER' ? 4 : contract === 'UNDER' ? (martingaleSafety ? 8 : 5) : undefined;
    const ok = getProposal(symbol, type, Math.max(0.5, activeStake), dur, barrier);
    if (!ok) requested.current = false;
  }, [running, isAuthorized, isConnected, sig, proposal, buying, activeContractId, getProposal, symbol, activeStake, duration, martingaleSafety]);
  useEffect(() => { if (running && proposal && !buying && activeContractId === null) buy(proposal.id, proposal.ask_price); }, [running, proposal, buying, activeContractId, buy]);
  useEffect(() => { if (activeContractId === null && !buying && !proposal) requested.current = false; }, [activeContractId, buying, proposal, contractClosedSeq]);

  const resetAnalysis = () => { setTicks([]); setCycle(0); setSig(null); requested.current = false; };
  const start = () => { if (!isConnected || !isAuthorized) return; setManualStopReason(''); resetAnalysis(); setSorosLevel(0); setSorosStake(stake); setMartingaleSafety(false); setRunning(true); };
  const stop = () => { setRunning(false); requested.current = false; setSig(null); };

  useEffect(() => {
    if (!contractClosedSeq || contractClosedSeq === seenClosed.current) return;
    seenClosed.current = contractClosedSeq;
    const tx = profitTransactions[0];
    if (!tx || tx.contract_id === lastClosed.current) return;
    lastClosed.current = tx.contract_id;
    const p = Number(tx.profit_loss || 0);
    if (strategy === 'HIBRIDA') {
      if (martingaleSafety) {
        setMartingaleSafety(false); setSorosLevel(0);
        if (p < 0) { setRunning(false); setManualStopReason('A primeira entrada Under 8 do Martingale falhou. Robô parado para limitar a exposição.'); }
      } else if (p < 0) {
        setSorosLevel(0); setSorosStake(stake); setMartingaleSafety(true);
      } else if (sorosLevel === 0) {
        setSorosLevel(1); setSorosStake(stake + Math.max(0, p));
      } else {
        setSorosLevel(0); setSorosStake(stake);
      }
    }
    show({ kind: p >= 0 ? 'win' : 'loss', title: p >= 0 ? '✓ Operação vencedora' : '✕ Operação perdida', value: p, detail: `${tx.contract_type || 'Contrato'} · Tick final: ${tx.exit_tick ?? '—'}` });
  }, [contractClosedSeq, profitTransactions, strategy, martingaleSafety, sorosLevel, stake]);
  useEffect(() => {
    if (target > 0 && profitMzn >= target && running) {
      show({ kind: 'goal', title: '🎯 Meta atingida!', value: profitUsd, detail: `Meta: ${target.toLocaleString('pt-MZ', { minimumFractionDigits: 2 })} MT` });
      setRunning(false);
    }
  }, [profitMzn, target, running, profitUsd]);

  const probs = [liveStats.even / 2, liveStats.odd / 2, liveStats.even / 2, liveStats.odd / 2, liveStats.even / 2, liveStats.odd / 2, liveStats.even / 2, liveStats.odd / 2, liveStats.even / 2, liveStats.odd / 2];

  return <div className="robot"><style>{`
    .robot{--bg:#071936;--s1:#0b2144;--s2:#102b57;--s3:#173c73;--line:#285184;--blue:#3d7fff;--white:#f5f7fa;--muted:#93a0bd;--low:#5c6789;--gold:#f5b942;--win:#34d399;--loss:#f87171;max-width:440px;margin:auto;min-height:100%;padding:10px 12px 30px;background:radial-gradient(520px 260px at 50% -10%,rgba(61,127,255,.2),transparent 70%),var(--bg);color:var(--white);font-family:Inter,system-ui,sans-serif}.content{display:flex;flex-direction:column;gap:10px}.balance{display:flex;border:1px solid var(--line);border-radius:15px;background:linear-gradient(180deg,var(--s2),var(--s1));overflow:hidden}.half{flex:1;padding:14px}.half+.half{border-left:1px solid rgba(255,255,255,.06)}.label,.field-label{font-size:9px;color:var(--muted);font-weight:900;letter-spacing:.09em;text-transform:uppercase}.money{font:900 17px ui-monospace,monospace;margin-top:5px}.pos{color:var(--win)!important}.neg{color:var(--loss)!important}.row3{display:grid;grid-template-columns:1fr 1fr;gap:8px}.drop-wrap{position:relative}.drop-button{width:100%;display:flex;justify-content:space-between;align-items:center;gap:8px;border:1px solid var(--line);border-radius:12px;padding:11px 12px;background:#0a1f40;color:var(--white);font-weight:800;font-size:11px;text-align:left;cursor:pointer}.drop-button.open{border-color:#62a9ff;box-shadow:0 0 0 2px rgba(61,127,255,.12)}.chev{color:#78b1ff;font-size:16px;line-height:1}.drop-menu{position:absolute;left:0;right:0;top:calc(100% + 5px);z-index:50;padding:5px;border:1px solid var(--line);border-radius:11px;background:#0b2144;box-shadow:0 18px 35px rgba(0,0,0,.45)}.drop-menu button{width:100%;display:flex;justify-content:space-between;align-items:center;border:0;background:transparent;color:#c8d6ed;border-radius:8px;padding:9px 10px;font-size:10px;text-align:left;cursor:pointer}.drop-menu button:hover,.drop-menu button.selected{background:#173e78;color:#fff}.card{border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,var(--s2),var(--s1));overflow:hidden}.op{padding:12px}.ophead{display:flex;justify-content:space-between;align-items:center;margin-bottom:9px}.optitle{font-size:10px;color:var(--muted);font-weight:900;letter-spacing:.08em;text-transform:uppercase}.opgrid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px}.op-l{font-size:7.5px;color:var(--low);text-transform:uppercase}.op-v{font:800 10px ui-monospace,monospace;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.analysis{display:grid;grid-template-columns:72px minmax(0,1fr) 78px;gap:7px;align-items:center}.side{display:flex;flex-direction:column;gap:5px}.side-title{text-align:center;font-size:7px;color:var(--muted);font-weight:900;letter-spacing:.05em;text-transform:uppercase}.goal{border:1px solid var(--line);border-radius:10px;background:#0a1f40;padding:8px;text-align:center}.goal-title{font-size:7px;color:var(--muted);font-weight:900;text-transform:uppercase}.goal input{width:100%;margin-top:6px;border:1px solid #2b558b;border-radius:7px;background:#071936;color:#fff;padding:6px 2px;text-align:center;font:800 10px ui-monospace,monospace}.bar{height:4px;margin-top:6px;background:#173052;border-radius:4px;overflow:hidden}.bar div{height:100%;background:linear-gradient(90deg,var(--blue),#74b8ff)}.dial-wrap{position:relative;width:238px;height:238px;margin:auto;display:flex;align-items:center;justify-content:center}.dial-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -90deg,#23355f 0deg,#1b2d52 360deg);box-shadow:inset 0 0 0 1px rgba(255,255,255,.06),0 20px 50px -15px rgba(0,0,0,.6)}.digit-node{position:absolute;width:40px;height:40px;border-radius:50%;background:#12213c;border:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;cursor:pointer;transition:.18s ease;left:50%;top:50%}.digit-node .n{font-size:15px;font-weight:700;color:var(--white);line-height:1}.digit-node .p{font-size:7px;color:var(--low);margin-top:1px}.digit-node.active{background:linear-gradient(160deg,var(--blue),#2a5fe0);border-color:transparent;transform:translate(-50%,-50%) scale(1.18)!important;box-shadow:0 0 0 6px rgba(61,127,255,.15),0 8px 20px -4px rgba(61,127,255,.7);z-index:5}.digit-node.active .n,.digit-node.active .p{color:#fff}.dial-center{position:relative;width:98px;height:98px;border-radius:50%;background:radial-gradient(circle at 30% 30%,#23365b,var(--bg));display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 0 30px rgba(61,127,255,.15)}.dial-center .tick-value{font-family:'JetBrains Mono',monospace;font-size:18px;font-weight:700;color:var(--white);letter-spacing:.3px}.dial-center .last{color:var(--gold)}.dial-center .lbl{font-size:8px;color:var(--low);text-transform:uppercase;letter-spacing:.08em;margin-top:3px}.status{text-align:center;color:var(--muted);font-size:10px;margin-top:6px}.status b{color:#fff;font-family:'JetBrains Mono',monospace}.stake{display:flex;align-items:center;justify-content:space-between;border:1px solid var(--line);border-radius:12px;background:#0a1f40;padding:12px}.stake input{width:110px;background:transparent;border:0;outline:0;color:#fff;text-align:right;font:900 17px ui-monospace,monospace}.stake .cur{font:800 10px ui-monospace,monospace;color:var(--muted)}.action{width:100%;border:0;border-radius:14px;padding:15px;background:linear-gradient(135deg,#3f8cff,#245fda);color:#fff;font-weight:900;font-size:14px;box-shadow:0 8px 24px rgba(61,127,255,.25);cursor:pointer}.action.stop{background:linear-gradient(135deg,#f15f6c,#c93d4e)}.action:disabled{opacity:.5;cursor:not-allowed}.history{border:1px solid var(--line);border-radius:13px;background:#0a1f40;padding:10px}.history-head{display:flex;justify-content:space-between}.history-title{font-size:9px;color:var(--muted);font-weight:900;letter-spacing:.08em;text-transform:uppercase}.history-row{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px;margin-top:8px}.history-row div{font-size:8px;color:var(--low)}.history-row b{display:block;color:#fff;font:800 10px ui-monospace,monospace;margin-top:3px}.notice{border:1px solid rgba(61,127,255,.35);border-radius:10px;background:rgba(61,127,255,.08);padding:8px 10px;color:#b8cbe5;font-size:8px;line-height:1.35}.notice strong{color:#fff}.toast{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:1000;width:min(390px,calc(100vw - 28px));padding:13px 15px;border-radius:15px;background:#102a50;border:1px solid #3976bd;box-shadow:0 18px 45px rgba(0,0,0,.5);text-align:center;animation:toastIn .22s ease-out}.toast.win{border-color:rgba(52,211,153,.55)}.toast.loss{border-color:rgba(248,113,113,.55)}.toast.goal{border-color:rgba(61,127,255,.7)}.toast strong{display:block;font-size:13px}.toast .amount{display:block;margin-top:3px;font:900 16px ui-monospace,monospace}.toast .detail{display:block;margin-top:3px;color:#a9bdd8;font-size:9px}@keyframes toastIn{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}.error{color:var(--loss);font-size:8px;text-align:center}.hybrid-note{font-size:8px;color:#9fb4d3;text-align:center}.hybrid-note b{color:#fff}
  `}</style>
  <div className="content">
    <div className="balance"><div className="half"><div className="label">Saldo</div><div className="money">{balance ? mzn(Number(balance.balance), currency) : '— MT'}</div></div><div className="half"><div className="label">Lucro/Perda</div><div className={`money ${profitUsd >= 0 ? 'pos' : 'neg'}`}>{signedMzn(profitUsd, currency)}</div></div></div>
    <div className="row3">
      <Dropdown label="Tipo de conta" value={accountType} options={[{ value: 'demo', label: 'Demo' }, { value: 'real', label: 'Real' }]} onChange={v => { setRunning(false); setAccountType(v as 'demo' | 'real'); resetAnalysis(); }} />
      <Dropdown label="Estratégia" value={strategy} options={STRATEGY_OPTIONS} onChange={v => { setStrategy(v); resetAnalysis(); }} />
    </div>
    <div className="card op"><div className="ophead"><span className="optitle">Última operação fechada</span><span style={{ color: '#718bad', fontSize: 12 }}>—</span></div><div className="opgrid"><div><div className="op-l">Tipo</div><div className="op-v">{latest?.contract_type || '—'}</div></div><div><div className="op-l">Tick final</div><div className="op-v">{latest?.exit_tick ?? '—'}</div></div><div><div className="op-l">Resultado</div><div className={`op-v ${latestPnl >= 0 ? 'pos' : 'neg'}`}>{latest ? signedMzn(latestPnl, currency) : '— MT'}</div></div><div><div className="op-l">Meta</div><div className="op-v">{target.toLocaleString('pt-MZ')} MT</div></div></div></div>
    <div className="analysis">
      <div className="side"><div className="side-title">Ticks análise</div><Dropdown label="" value={windowSize} options={WINDOW_OPTIONS} onChange={v => { setWindowSize(v); resetAnalysis(); }} /></div>
      <div><div className="dial-wrap"><div className="dial-ring" />{[0,1,2,3,4,5,6,7,8,9].map(i => { const angle = (i / 10) * 2 * Math.PI - Math.PI / 2; const radius = 95; const x = radius * Math.cos(angle); const y = radius * Math.sin(angle); return <button key={i} type="button" className={`digit-node ${i === selectedDigit ? 'active' : ''}`} style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }} onClick={() => setSelectedDigit(i)}><span className="n">{i}</span><span className="p">{(probs[i] || 0).toFixed(1)}%</span></button>; })}<div className="dial-center"><div className="tick-value">{tick?.quote != null ? <>{String(Number(tick.quote).toFixed(2)).slice(0, -1)}<span className="last">{currentDigit ?? '—'}</span></> : '—'}</div><div className="lbl">último dígito</div></div></div><div className="status"><b>{cycle}</b> ticks recolhidos · sinal: <b>{sig?.label || 'aguardando'}</b></div></div>
      <div className="side"><div className="side-title">Meta</div><div className="goal"><div className="goal-title">MT hoje</div><input type="number" min="1" value={target} onChange={e => setTarget(Math.max(1, Number(e.target.value) || 0))} /><div className="bar"><div style={{ width: `${targetProgress}%` }} /></div><div style={{ fontSize: 7, color: '#93a0bd', marginTop: 4 }}>{targetProgress.toFixed(0)}%</div></div></div>
    </div>
    <div className="hybrid-note">Híbrida: <b>{martingaleSafety ? 'Under 8 · segurança Martingale' : sorosLevel === 1 ? 'Soros nível 1' : 'Par/Ímpar base'}</b>. Under 8 tem 80% teóricos em distribuição uniforme, não é garantia.</div>
    <div><div className="field-label">Aposta · nível atual</div><div className="stake"><span className="cur">USD</span><input type="number" min="0.50" step="0.01" value={activeStake.toFixed(2)} onChange={e => { const v = Math.max(0.5, Number(e.target.value) || 0.5); setStake(v); if (!sorosLevel) setSorosStake(v); }} disabled={running} /></div></div>
    <Dropdown label="Símbolo" value={symbol} options={Object.entries(SYMBOLS).map(([value, label]) => ({ value, label }))} onChange={v => { setRunning(false); setSymbol(v); resetAnalysis(); }} />
    <Dropdown label="Duração" value={duration} options={DURATION_OPTIONS} onChange={v => setDuration(v)} />
    <button className={`action ${running ? 'stop' : ''}`} onClick={running ? stop : start} disabled={!isConnected || !isAuthorized}>{running ? '⏹ PARAR ROBÔ' : '🤖 INICIAR ROBÔ'} · {running ? (martingaleSafety ? 'Under 8' : sorosLevel === 1 ? 'Soros' : 'Base') : '1 tick'}</button>
    <div className="history"><div className="history-head"><span className="history-title">Resultado / estado</span><span style={{ color: running ? '#34d399' : '#93a0bd', fontSize: 8 }}>{running ? 'ATIVO' : 'PARADO'}</span></div><div className="history-row"><div>Estratégia<b>{strategy === 'HIBRIDA' ? 'Híbrida' : STRATEGY_OPTIONS.find(o => o.value === strategy)?.label.split(' — ')[0]}</b></div><div>Stake<b>{mzn(activeStake, 'USD')}</b></div><div>Resultado<b className={latestPnl >= 0 ? 'pos' : 'neg'}>{latest ? signedMzn(latestPnl, currency) : '— MT'}</b></div><div>Meta<b>{target.toLocaleString('pt-MZ')} MT</b></div></div></div>
    {manualStopReason && <div className="notice"><strong>Proteção:</strong> {manualStopReason}</div>}
    {error && <div className="error">{error}</div>}
    <div className="notice"><strong>Híbrida:</strong> começa em Par/Ímpar, procura 2 acertos seguidos (Soros), detecta 4 dígitos da mesma paridade para mudar a próxima entrada base para Acima/Abaixo e usa <strong>Under 8</strong> apenas na primeira entrada de segurança após uma perda.</div>
  </div>
  {toast && <div className={`toast ${toast.kind}`}><strong>{toast.title}</strong><span className="amount">{signedMzn(toast.value, currency)}</span>{toast.detail && <span className="detail">{toast.detail}</span>}</div>}
  </div>;
}
