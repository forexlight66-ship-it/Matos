'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type Currency = 'USD' | 'MZN';

const MT = 64;
const MIN_STAKE = 0.75;
const TRIGGER = 65;
const DEFAULT_TICKS = 5;

function lastDigit(value: number, pipSize?: number) {
  if (!Number.isFinite(value)) return null;
  let text = String(value);
  if (pipSize && pipSize > 0) {
    const places = Math.max(0, Math.min(10, Math.round(-Math.log10(pipSize))));
    text = value.toFixed(places);
  }
  const digits = text.match(/\d/g);
  return digits?.length ? Number(digits[digits.length - 1]) : null;
}

function evenProbability(values: number[], pipSize?: number) {
  const digits = values
    .map(v => lastDigit(v, pipSize))
    .filter((v): v is number => v !== null);
  if (!digits.length) return 0;
  return (digits.filter(v => v % 2 === 0).length / digits.length) * 100;
}

function money(value: number, currency: Currency) {
  return currency === 'USD'
    ? `${value >= 0 ? '+' : ''}${value.toFixed(2)} $`
    : `${value >= 0 ? '+' : ''}${(value * MT).toFixed(2)} MT`;
}

export default function HyperliteBot() {
  const [symbol, setSymbol] = useState('1HZ100V');
  const [account, setAccount] = useState<'demo' | 'real'>('demo');
  const [stake, setStake] = useState(MIN_STAKE);
  const [tickWindow, setTickWindow] = useState(DEFAULT_TICKS);
  const [running, setRunning] = useState(false);
  const [ticks, setTicks] = useState<number[]>([]);
  const [pipSize, setPipSize] = useState<number | undefined>();
  const [evenChance, setEvenChance] = useState(0);
  const [signal, setSignal] = useState(false);
  const [currency, setCurrency] = useState<Currency>('MZN');
  const [target, setTarget] = useState(23.44);
  const [lossLimit, setLossLimit] = useState(62.50);
  const stopped = useRef(false);
  const lastEpoch = useRef<number | null>(null);
  const requested = useRef(false);
  const lastClosed = useRef<number | null>(null);

  const {
    tick,
    balance,
    proposal,
    buying,
    activeContractId,
    getProposal,
    buy,
    subscribeTicks,
    isAuthorized,
    isConnected,
    profitTransactions,
    contractClosedSeq,
    fetchProfitTable,
    resetTradingSession,
  } = useDeriv(account);

  const pnl = useMemo(
    () => profitTransactions.reduce((sum, tx) => sum + Number(tx.profit_loss || 0), 0),
    [profitTransactions]
  );

  const closedOperations = profitTransactions.length;

  useEffect(() => {
    if (isConnected) subscribeTicks(symbol);
  }, [isConnected, symbol, subscribeTicks]);

  useEffect(() => {
    if (!tick?.epoch || tick.epoch === lastEpoch.current) return;
    lastEpoch.current = tick.epoch;
    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;
    const nextPip = Number((tick as any).pip_size);
    const effectivePip = nextPip > 0 ? nextPip : pipSize;
    if (nextPip > 0) setPipSize(nextPip);

    setTicks(prev => {
      const next = [...prev, quote].slice(-tickWindow);
      const probability = evenProbability(next, effectivePip);
      setEvenChance(probability);
      if (next.length >= tickWindow) {
        setSignal(probability >= TRIGGER);
        return [];
      }
      setSignal(false);
      return next;
    });
  }, [tick, tickWindow, pipSize]);

  useEffect(() => {
    if (!running || !isConnected) return;
    const id = window.setInterval(() => fetchProfitTable({ limit: 500, offset: 0, sort: 'DESC' }), 5000);
    return () => window.clearInterval(id);
  }, [running, isConnected, fetchProfitTable]);

  useEffect(() => {
    if (!running || stopped.current || !signal || proposal || buying || activeContractId !== null) return;
    if (!isAuthorized || !isConnected || requested.current) return;

    requested.current = true;
    const ok = getProposal(symbol, 'DIGITEVEN', stake, 1, 0, false);
    if (!ok) requested.current = false;
  }, [running, signal, proposal, buying, activeContractId, isAuthorized, isConnected, getProposal, symbol, stake]);

  useEffect(() => {
    if (!running || !proposal || buying || activeContractId !== null) return;
    requested.current = false;
    buy(proposal.id, proposal.ask_price);
  }, [running, proposal, buying, activeContractId, buy]);

  useEffect(() => {
    if (!running || stopped.current) return;
    if (pnl >= target || pnl <= -lossLimit) {
      stopped.current = true;
      requested.current = false;
      setRunning(false);
      setSignal(false);
    }
  }, [pnl, target, lossLimit, running]);

  useEffect(() => {
    if (contractClosedSeq !== lastClosed.current) {
      lastClosed.current = contractClosedSeq;
      requested.current = false;
      setSignal(false);
    }
  }, [contractClosedSeq]);

  const start = () => {
    if (!isConnected || !isAuthorized) return;
    resetTradingSession();
    stopped.current = false;
    requested.current = false;
    setTicks([]);
    setEvenChance(0);
    setSignal(false);
    setRunning(true);
  };

  const stop = () => {
    stopped.current = true;
    requested.current = false;
    setRunning(false);
    setSignal(false);
  };

  const balanceText = balance
    ? currency === 'USD'
      ? `${Number(balance.balance).toFixed(2)} $`
      : `${(Number(balance.balance) * MT).toFixed(2)} MT`
    : '—';

  return (
    <section className="hyperlite-card">
      <style jsx>{`
        .hyperlite-card{margin-top:14px;padding:14px;border:1px solid #294b78;border-radius:14px;background:#0d2347;color:#f8fafc}
        .hl-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .hl-brand{display:flex;align-items:center;gap:9px}.hl-logo{width:34px;height:34px;border-radius:9px;background:#2563eb;display:grid;place-items:center;font-weight:900}
        .hl-title{font-size:15px;font-weight:900}.hl-sub{font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
        .nr{color:#facc15;font-weight:900;font-size:9px;letter-spacing:.08em}
        .hl-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.hl-box{padding:10px;border:1px solid #294b78;border-radius:10px;background:#071936}.hl-label{font-size:9px;color:#94a3b8;text-transform:uppercase}.hl-value{margin-top:3px;font-weight:900}
        .even{color:#38bdf8}.positive{color:#34d399}.negative{color:#f87171}
        .hl-controls{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.hl-controls select,.hl-controls input{width:100%;box-sizing:border-box;padding:9px;border-radius:9px;border:1px solid #294b78;background:#071936;color:#f8fafc;font-size:11px}
        .hl-button{width:100%;margin-top:10px;padding:11px;border:0;border-radius:10px;background:#2563eb;color:white;font-weight:900;cursor:pointer}.hl-button.stop{background:#dc2626}.hl-button:disabled{opacity:.5;cursor:not-allowed}
        .hl-foot{display:flex;justify-content:space-between;gap:8px;margin-top:9px;font-size:9px;color:#94a3b8}.hl-foot strong{color:#f8fafc}
        .hl-signal{margin-top:10px;padding:9px;border-radius:9px;text-align:center;font-size:10px;font-weight:900;background:#082f49;color:#38bdf8}
      `}</style>

      <div className="hl-head">
        <div className="hl-brand">
          <div className="hl-logo">H</div>
          <div><div className="hl-title">Hyperlite</div><div className="hl-sub">Estratégia • Números pares</div></div>
        </div>
        <span className="nr">NR</span>
      </div>

      <div className="hl-grid">
        <div className="hl-box"><div className="hl-label">Saldo</div><div className="hl-value">{balanceText}</div></div>
        <div className="hl-box"><div className="hl-label">Lucro / prejuízo</div><div className={`hl-value ${pnl >= 0 ? 'positive' : 'negative'}`}>{money(pnl, currency)}</div></div>
        <div className="hl-box"><div className="hl-label">Probabilidade par</div><div className="hl-value even">{evenChance.toFixed(0)}%</div></div>
        <div className="hl-box"><div className="hl-label">Operações fechadas</div><div className="hl-value">{closedOperations}</div></div>
      </div>

      <div className="hl-controls">
        <select value={account} onChange={e => setAccount(e.target.value as 'demo' | 'real')} disabled={running}>
          <option value="demo">Demo</option><option value="real">Real</option>
        </select>
        <select value={symbol} onChange={e => setSymbol(e.target.value)} disabled={running}>
          <option value="1HZ100V">Volatility 100 (1s)</option><option value="R_100">Volatility 100</option><option value="R_75">Volatility 75</option><option value="R_50">Volatility 50</option>
        </select>
        <select value={tickWindow} onChange={e => setTickWindow(Number(e.target.value))} disabled={running}>
          <option value={5}>5 ticks</option><option value={10}>10 ticks</option><option value={25}>25 ticks</option>
        </select>
        <input type="number" min={MIN_STAKE} step="0.01" value={stake} onChange={e => setStake(Math.max(MIN_STAKE, Number(e.target.value) || MIN_STAKE))} disabled={running} />
        <input type="number" min="0.01" step="0.01" value={target} onChange={e => setTarget(Math.max(0.01, Number(e.target.value) || 0.01))} disabled={running} />
        <input type="number" min="0.01" step="0.01" value={lossLimit} onChange={e => setLossLimit(Math.max(0.01, Number(e.target.value) || 0.01))} disabled={running} />
      </div>

      <div className="hl-signal">{running ? (signal ? `PAR ${evenChance.toFixed(0)}% ≥ ${TRIGGER}% — ENTRADA EVEN` : `AGUARDANDO PAR ≥ ${TRIGGER}%`) : 'BOT PARADO — PRONTO PARA OPERAR APENAS EVEN'}</div>

      <button className={`hl-button ${running ? 'stop' : ''}`} disabled={!isConnected || !isAuthorized} onClick={running ? stop : start}>
        {running ? '■ Parar Hyperlite' : '▶ Iniciar Hyperlite'}
      </button>
      <div className="hl-foot"><span>Stake <strong>${stake.toFixed(2)}</strong></span><span>Gatilho <strong>{TRIGGER}%</strong></span><span>Contrato <strong>DIGITEVEN</strong></span></div>
    </section>
  );
}
