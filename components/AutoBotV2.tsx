'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type WindowSize = 5 | 10 | 25 | 50 | 100 | 200;
type Duration = 1 | 5 | 10;
type Strategy = 'PAR_IMPAR' | 'ACIMA_ABAIXO' | 'RISE_FALL' | 'PAR_ACIMA' | 'PAR_RISE' | 'ACIMA_RISE' | 'COMBINADA';
type Contract = 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'RISE' | 'FALL';
type Signal = { contract: Contract; label: string; strength: number };

const MT_PER_USD = 68;
const CONTRACT_TYPES: Record<Contract, string> = {
  EVEN: 'DIGITEVEN', ODD: 'DIGITODD', OVER: 'DIGITOVER', UNDER: 'DIGITUNDER', RISE: 'CALL', FALL: 'PUT',
};
const SYMBOLS: Record<string, string> = {
  R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_50: 'Volatility 50 Index',
  R_75: 'Volatility 75 Index', R_100: 'Volatility 100 Index', '1HZ10V': 'Volatility 10 (1s)',
  '1HZ25V': 'Volatility 25 (1s)', '1HZ50V': 'Volatility 50 (1s)', '1HZ75V': 'Volatility 75 (1s)',
  '1HZ100V': 'Volatility 100 (1s)',
};
const STRATEGIES: { id: Strategy; label: string }[] = [
  { id: 'PAR_IMPAR', label: 'Par / Ímpar' }, { id: 'ACIMA_ABAIXO', label: 'Acima 4 / Abaixo 5' },
  { id: 'RISE_FALL', label: 'Subir / Descer' }, { id: 'PAR_ACIMA', label: 'Par + Acima' },
  { id: 'PAR_RISE', label: 'Par + Subir' }, { id: 'ACIMA_RISE', label: 'Acima + Subir' },
  { id: 'COMBINADA', label: 'Combinada' },
];

function lastDigit(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, '');
  return digits ? Number(digits.slice(-1)) : null;
}

function getStats(values: number[]) {
  const digits = values.map(lastDigit).filter((v): v is number => v !== null);
  const n = digits.length || 1;
  const even = digits.filter(d => d % 2 === 0).length / n * 100;
  const over = digits.filter(d => d > 4).length / n * 100;
  let rises = 0, falls = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) rises++;
    else if (values[i] < values[i - 1]) falls++;
  }
  const totalMoves = Math.max(1, rises + falls);
  const probs = Array.from({ length: 10 }, (_, d) => digits.filter(x => x === d).length / n * 100);
  return { even, odd: 100 - even, over, under: 100 - over, rise: rises / totalMoves * 100, fall: falls / totalMoves * 100, probs };
}

function makeSignal(values: number[], strategy: Strategy): Signal | null {
  if (values.length < 2) return null;
  const s = getStats(values);
  const threshold = 60;
  const parity = s.even >= threshold ? { contract: 'EVEN' as const, label: 'PAR', strength: s.even } : s.odd >= threshold ? { contract: 'ODD' as const, label: 'ÍMPAR', strength: s.odd } : null;
  const over = s.over >= threshold ? { contract: 'OVER' as const, label: 'ACIMA 4', strength: s.over } : s.under >= threshold ? { contract: 'UNDER' as const, label: 'ABAIXO 5', strength: s.under } : null;
  const direction = s.rise >= threshold ? { contract: 'RISE' as const, label: 'SUBIR', strength: s.rise } : s.fall >= threshold ? { contract: 'FALL' as const, label: 'DESCER', strength: s.fall } : null;
  if (strategy === 'PAR_IMPAR') return parity;
  if (strategy === 'ACIMA_ABAIXO') return over;
  if (strategy === 'RISE_FALL') return direction;
  if (strategy === 'PAR_ACIMA') return parity && over ? { ...parity, label: `${parity.label} + ${over.label}`, strength: (parity.strength + over.strength) / 2 } : null;
  if (strategy === 'PAR_RISE') return parity && direction ? { ...parity, label: `${parity.label} + ${direction.label}`, strength: (parity.strength + direction.strength) / 2 } : null;
  if (strategy === 'ACIMA_RISE') return over && direction ? { ...over, label: `${over.label} + ${direction.label}`, strength: (over.strength + direction.strength) / 2 } : null;
  return parity && over && direction ? { ...parity, label: `${parity.label} + ${over.label} + ${direction.label}`, strength: (parity.strength + over.strength + direction.strength) / 3 } : null;
}

const mt = (usd: number) => `${usd >= 0 ? '+' : ''}${(usd * MT_PER_USD).toFixed(2)} MT`;
const mtAbs = (usd: number) => `${(usd * MT_PER_USD).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;

export default function AutoBotV2() {
  const [selectedSymbol, setSelectedSymbol] = useState('1HZ100V');
  const [accountType, setAccountType] = useState<'demo' | 'real'>('demo');
  const [windowSize, setWindowSize] = useState<WindowSize>(5);
  const [strategy, setStrategy] = useState<Strategy>('PAR_IMPAR');
  const [stake, setStake] = useState(1.5);
  const [duration, setDuration] = useState<Duration>(1);
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [cycle, setCycle] = useState(0);
  const [signal, setSignal] = useState<Signal | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [dailyTarget, setDailyTarget] = useState(680);
  const [notification, setNotification] = useState<string | null>(null);

  const lastEpoch = useRef<number | null>(null);
  const requested = useRef(false);
  const targetReached = useRef(false);
  const lastNotifiedContract = useRef<number | null>(null);

  const { tick, balance, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, error, profitTransactions, contractClosedSeq, soros, resetSoros, setSorosEnabled } = useDeriv(accountType);

  useEffect(() => {
    if (isConnected) subscribeTicks(selectedSymbol);
  }, [isConnected, selectedSymbol, subscribeTicks]);

  useEffect(() => {
    if (!tick?.epoch || tick.epoch === lastEpoch.current) return;
    lastEpoch.current = tick.epoch;
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;
    setTicks(prev => {
      const next = [...prev, quote];
      if (next.length >= windowSize) {
        const nextSignal = makeSignal(next.slice(-windowSize), strategy);
        setSignal(nextSignal);
        setLog(prevLog => [
          `${new Date().toLocaleTimeString()} · ${nextSignal ? `SINAL ${nextSignal.label} ${Math.round(nextSignal.strength)}%` : 'SEM SINAL'} · ${windowSize}T`,
          ...prevLog,
        ].slice(0, 10));
        setCycle(0);
        return [];
      }
      setCycle(next.length);
      return next;
    });
  }, [tick, windowSize, strategy]);

  useEffect(() => {
    if (!running || !isAuthorized || !isConnected || requested.current || proposal || buying || activeContractId !== null || !signal) return;
    requested.current = true;
    const type = CONTRACT_TYPES[signal.contract];
    const digitContract = ['EVEN', 'ODD', 'OVER', 'UNDER'].includes(signal.contract);
    const safeDuration = digitContract ? Math.min(10, Math.max(1, duration)) : duration;
    const barrier = signal.contract === 'OVER' ? 4 : signal.contract === 'UNDER' ? 5 : 0;
    if (!getProposal(selectedSymbol, type, Math.max(0.5, stake), safeDuration, barrier)) requested.current = false;
  }, [running, isAuthorized, isConnected, signal, proposal, buying, activeContractId, getProposal, selectedSymbol, stake, duration]);

  useEffect(() => {
    if (running && proposal && !buying && activeContractId === null) buy(proposal.id, proposal.ask_price);
  }, [running, proposal, buying, activeContractId, buy]);

  useEffect(() => {
    if (activeContractId === null && !buying && !proposal) requested.current = false;
  }, [activeContractId, buying, proposal, contractClosedSeq]);

  const sessionProfit = useMemo(() => (profitTransactions || []).reduce((sum, tx) => sum + Number(tx.profit_loss || 0), 0), [profitTransactions]);
  const latestOperation = profitTransactions?.[0] ?? null;
  const latestResult = latestOperation ? Number(latestOperation.profit_loss || 0) : 0;
  const currentStats = useMemo(() => getStats(ticks), [ticks]);
  const currentDigit = lastDigit(tick?.quote);
  const progress = dailyTarget > 0 ? Math.max(0, Math.min(100, sessionProfit * MT_PER_USD / dailyTarget * 100)) : 0;
  // Soros UI connected v1: the hook is the single source of truth for stake progression.
  const sorosEntry = soros.enabled ? soros.stake : stake;
  const sorosStepLabel = soros.level + 1;

  useEffect(() => {
    if (!running || targetReached.current || dailyTarget <= 0) return;
    if (sessionProfit * MT_PER_USD >= dailyTarget) {
      targetReached.current = true;
      requested.current = false;
      setRunning(false);
      setSignal(null);
      setNotification(`Meta atingida: ${mt(sessionProfit)}. Robô parado.`);
    }
  }, [sessionProfit, dailyTarget, running]);

  useEffect(() => {
    const id = latestOperation?.contract_id;
    if (!id || id === lastNotifiedContract.current) return;
    lastNotifiedContract.current = id;
    if (latestOperation.sell_time) setNotification(`Operação fechada: ${mt(latestResult)}`);
  }, [latestOperation, latestResult]);

  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(null), 3000);
    return () => window.clearTimeout(timer);
  }, [notification]);

  const resetAnalysis = () => {
    setTicks([]);
    setCycle(0);
    setSignal(null);
    requested.current = false;
  };

  const start = () => {
    if (!isConnected || !isAuthorized) return;
    targetReached.current = false;
    resetAnalysis();
    setLog([]);
    setNotification(null);
    setRunning(true);
  };

  const stop = () => {
    setRunning(false);
    requested.current = false;
    setSignal(null);
  };

  const tickText = tick?.quote != null ? String(tick.quote) : '—';

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[430px] flex-col gap-3 bg-slate-950 p-4 text-slate-100">
      {notification && <div className="fixed left-1/2 top-4 z-50 w-[calc(100%-28px)] max-w-[390px] -translate-x-1/2 rounded-xl border border-blue-500 bg-slate-900 p-3 text-center text-sm shadow-xl">{notification}</div>}

      {/* Soros UI connected v1 */}
      <div className="rounded-xl border border-emerald-800 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold">Soros · 3 passos</div>
            <div className="mt-1 text-[10px] text-slate-400">Passo {sorosStepLabel}/3 · Entrada atual US$ {sorosEntry.toFixed(2)}</div>
          </div>
          <button
            className={`rounded-lg border px-3 py-2 text-[10px] font-bold ${soros.enabled ? 'border-emerald-600 text-emerald-400' : 'border-slate-600 text-slate-400'}`}
            onClick={() => { setSorosEnabled(!soros.enabled); if (!soros.enabled) resetSoros(); }}
            disabled={running}
          >{soros.enabled ? 'ATIVO' : 'DESLIGADO'}</button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[9px] text-slate-400">
          <div className="rounded-lg bg-slate-950 p-2"><div className="text-slate-500">Entrada</div><b className="text-slate-200">US$ {sorosEntry.toFixed(2)}</b></div>
          <div className="rounded-lg bg-slate-950 p-2"><div className="text-slate-500">Lucro acumulado</div><b className="text-emerald-400">US$ {soros.accumulatedProfit.toFixed(2)}</b></div>
          <div className="rounded-lg bg-slate-950 p-2"><div className="text-slate-500">Estado</div><b className={soros.blocked ? 'text-red-400' : 'text-slate-200'}>{soros.blocked ? 'PARADO' : 'PRONTO'}</b></div>
        </div>
        {soros.blocked && <div className="mt-2 rounded-lg border border-red-900 bg-red-950/30 p-2 text-[9px] text-red-300">Perda no Passo 1: o Soros está parado. Desative e ative novamente para iniciar novo ciclo.</div>}
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-900">
        <div className="p-4"><div className="text-[10px] uppercase text-slate-500">Saldo</div><div className="mt-1 font-mono font-bold">{balance ? mtAbs(Number(balance.balance)) : '—'}</div></div>
        <div className="border-l border-slate-700 p-4"><div className="text-[10px] uppercase text-slate-500">Lucro/Perda</div><div className={`mt-1 font-mono font-bold ${sessionProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{mt(sessionProfit)}</div></div>
      </div>

      <div className="grid grid-cols-[1fr_1fr_52px] gap-2">
        <label className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs"><span className="block text-[10px] uppercase text-slate-500">Conta</span><select className="mt-1 w-full bg-transparent font-bold outline-none" value={accountType} onChange={e => { setAccountType(e.target.value as 'demo' | 'real'); resetAnalysis(); }} disabled={running}><option value="demo">Demo</option><option value="real">Real</option></select></label>
        <label className="rounded-xl border border-slate-700 bg-slate-900 p-3 text-xs"><span className="block text-[10px] uppercase text-slate-500">Estratégia</span><select className="mt-1 w-full bg-transparent font-bold outline-none" value={strategy} onChange={e => { setStrategy(e.target.value as Strategy); resetAnalysis(); }} disabled={running}>{STRATEGIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <button className="rounded-xl border border-blue-700 bg-blue-700 font-bold" onClick={running ? stop : start} disabled={!isConnected || !isAuthorized}>{running ? '■' : '▶'}</button>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-[10px] uppercase text-slate-500">Análise</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <label className="text-center text-xs"><span className="block text-[9px] text-slate-500">Ticks</span><select className="bg-transparent font-bold" value={windowSize} onChange={e => { setWindowSize(Number(e.target.value) as WindowSize); resetAnalysis(); }} disabled={running}>{[5, 10, 25, 50, 100, 200].map(n => <option key={n} value={n}>{n}</option>)}</select></label>
          <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full border-4 border-blue-700 bg-slate-950"><div className="font-mono text-xl font-bold">{tickText}</div><div className="text-[9px] uppercase text-slate-500">Último Dígito</div><div className="mt-1 text-[9px] text-slate-500">{currentDigit ?? '—'}</div></div>
          <label className="text-center text-xs"><span className="block text-[9px] text-slate-500">Meta</span><input className="mt-1 w-16 bg-transparent text-center font-bold outline-none" type="number" min="1" value={dailyTarget} onChange={e => setDailyTarget(Math.max(1, Number(e.target.value) || 1))} /><span className="block text-[9px] text-slate-500">MT</span></label>
        </div>
        <div className="mt-2 text-center text-[10px] text-slate-400">{Math.max(0, windowSize - cycle)} ticks restantes</div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-400"><span>Par {currentStats.even.toFixed(0)}%</span><span>Acima {currentStats.over.toFixed(0)}%</span><span>Subir {currentStats.rise.toFixed(0)}%</span></div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] uppercase text-slate-500">Aposta</div><div className="mt-2 flex items-center justify-between"><span className="font-mono text-xs text-slate-500">USD</span><input className="w-24 bg-transparent text-right font-mono text-xl font-bold outline-none" type="number" min="0.5" step="0.1" value={stake} onChange={e => setStake(Math.max(0.5, Number(e.target.value) || 0.5))} disabled={running} /></div></div>

      <button className={`w-full rounded-xl p-4 font-bold ${running ? 'bg-red-600' : 'bg-blue-600'}`} onClick={running ? stop : start} disabled={!isConnected || !isAuthorized}>{running ? '■ PARAR ROBÔ' : '🤖 INICIAR ROBÔ'}</button>
      <div className="flex justify-between text-[10px] text-slate-500"><span>{isConnected && isAuthorized ? '● Conectado à Deriv' : '○ A ligar à Deriv…'}</span><strong className={running ? 'text-emerald-400' : ''}>{running ? 'ROBÔ ATIVO' : 'ROBÔ PARADO'}</strong></div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] uppercase text-slate-500">Sinal atual</div><div className="mt-2 flex justify-between rounded-lg border border-slate-700 p-3"><strong>{signal?.label || 'Aguardando próximo ciclo'}</strong><span className="text-blue-400">{signal ? `${Math.round(signal.strength)}%` : '—'}</span></div></div>

      <label className="rounded-xl border border-slate-700 bg-slate-900 p-4 text-xs"><span className="block text-[10px] uppercase text-slate-500">Símbolo</span><select className="mt-1 w-full bg-transparent font-bold outline-none" value={selectedSymbol} onChange={e => { setSelectedSymbol(e.target.value); resetAnalysis(); }} disabled={running}>{Object.entries(SYMBOLS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>

      <div><div className="text-[10px] uppercase text-slate-500">Duração</div><div className="mt-2 flex gap-2">{([1, 5, 10] as Duration[]).map(n => <button key={n} className={`flex-1 rounded-lg border p-2 text-sm ${duration === n ? 'border-blue-500 bg-blue-600' : 'border-slate-700 bg-slate-900'}`} onClick={() => setDuration(n)} disabled={running}>{n} tick{n > 1 ? 's' : ''}</button>)}</div></div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] uppercase text-slate-500">Meta diária</div><div className="mt-1 text-sm">{mt(sessionProfit)} / {dailyTarget} MT</div><div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-800"><div className="h-full bg-blue-500" style={{ width: `${progress}%` }} /></div></div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] uppercase text-slate-500">Última operação</div><div className="mt-2 text-xs text-slate-300">{latestOperation ? `${latestOperation.contract_type || 'Contrato'} · Tick ${latestOperation.exit_tick ?? '—'} · ${mt(latestResult)}` : 'Nenhuma operação fechada.'}</div></div>

      {log.length > 0 && <div className="rounded-xl border border-slate-700 bg-slate-900 p-4"><div className="text-[10px] uppercase text-slate-500">Análise do robô</div><div className="mt-2 space-y-1 text-[10px] text-slate-400">{log.slice(0, 5).map((item, i) => <div key={`${item}-${i}`}>{item}</div>)}</div></div>}
      {error && <div className="rounded-xl border border-red-800 bg-red-950 p-4 text-xs text-red-300">{error}</div>}
      <div className="py-3 text-center text-[9px] text-slate-600">Powered by MozHyper · Negocie com responsabilidade</div>
    </div>
  );
}
