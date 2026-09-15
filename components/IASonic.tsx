'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

const MIN_STAKE = 0.35;
const MAX_LEVEL = 20;
const MAX_BASE_STAKE = 10;
const SIGNAL_TICKS = 5;
const SIGNAL_THRESHOLD = 65;
const CONTRACT_TYPE = 'DIGITEVEN';

const SYMBOLS: Record<string, string> = {
  R_10: 'Volatility 10 Index',
  R_25: 'Volatility 25 Index',
  R_50: 'Volatility 50 Index',
  R_75: 'Volatility 75 Index',
  R_100: 'Volatility 100 Index',
  '1HZ10V': 'Volatility 10 (1s)',
  '1HZ25V': 'Volatility 25 (1s)',
  '1HZ50V': 'Volatility 50 (1s)',
  '1HZ75V': 'Volatility 75 (1s)',
  '1HZ100V': 'Volatility 100 (1s)',
};

function lastDigit(value: number, pipSize?: number) {
  if (!Number.isFinite(value)) return null;
  const decimals = pipSize && pipSize > 0
    ? Math.max(0, Math.min(10, Math.round(-Math.log10(pipSize))))
    : 2;
  const digits = value.toFixed(decimals).match(/\d/g);
  return digits?.length ? Number(digits[digits.length - 1]) : null;
}

function evenStrength(values: number[], pipSize?: number) {
  const digits = values
    .map(v => lastDigit(v, pipSize))
    .filter((v): v is number => v !== null);
  if (!digits.length) return 0;
  return (digits.filter(d => d % 2 === 0).length / digits.length) * 100;
}

function takeControlOfCoreBot(sonicOn: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('matos-ia-sonic-enabled', sonicOn ? '1' : '0');
  window.dispatchEvent(new CustomEvent('matos:ia-sonic-toggle', { detail: { enabled: sonicOn } }));

  if (!sonicOn) return;

  const root = document.querySelector('.av4') as HTMLElement | null;
  if (!root) return;

  const power = root.querySelector('.ia-toggle') as HTMLButtonElement | null;
  if (power?.classList.contains('on')) power.click();

  const mainButton = Array.from(root.querySelectorAll('button'))
    .find(button => button.className.includes('w-full') && button.className.includes('bg-red-600')) as HTMLButtonElement | undefined;
  if (mainButton) mainButton.click();
}

export default function IASonic() {
  const [enabled, setEnabled] = useState(false);
  const [symbol, setSymbol] = useState('1HZ100V');
  const [account, setAccount] = useState<'demo' | 'real'>('demo');
  const [baseStake, setBaseStake] = useState(MIN_STAKE);
  const [level, setLevel] = useState(0);
  const [ticks, setTicks] = useState<number[]>([]);
  const [pipSize, setPipSize] = useState<number | undefined>();
  const [signalStrength, setSignalStrength] = useState(0);
  const [status, setStatus] = useState('Desligado');
  const [notice, setNotice] = useState('Aguardando');

  const epochRef = useRef<number | null>(null);
  const requestedRef = useRef(false);
  const lastContractRef = useRef<number | null>(null);
  const lastProcessedRef = useRef<number | null>(null);

  const {
    tick,
    balance,
    proposal,
    buy,
    buying,
    activeContractId,
    getProposal,
    subscribeTicks,
    isAuthorized,
    isConnected,
    profitTransactions,
    setSorosEnabled,
  } = useDeriv(account);

  const stake = useMemo(
    () => Number((baseStake * Math.pow(2, Math.min(level, MAX_LEVEL))).toFixed(2)),
    [baseStake, level]
  );

  useEffect(() => {
    setSorosEnabled(false);
  }, [setSorosEnabled]);

  useEffect(() => {
    if (isConnected) subscribeTicks(symbol);
  }, [isConnected, symbol, subscribeTicks]);

  useEffect(() => {
    if (!enabled || !tick?.epoch || tick.epoch === epochRef.current) return;
    epochRef.current = tick.epoch;

    const quote = Number(tick.quote);
    if (!Number.isFinite(quote)) return;

    const incomingPip = Number((tick as any).pip_size);
    const effectivePip = incomingPip > 0 ? incomingPip : pipSize;
    if (incomingPip > 0) setPipSize(incomingPip);

    setTicks(previous => {
      const next = [...previous, quote].slice(-SIGNAL_TICKS);
      if (next.length < SIGNAL_TICKS) {
        setNotice(`Analisando ${next.length}/${SIGNAL_TICKS} ticks`);
        return next;
      }

      const strength = evenStrength(next, effectivePip);
      setSignalStrength(strength);
      setNotice(
        strength >= SIGNAL_THRESHOLD
          ? `PAR ${strength.toFixed(0)}% · entrada preparada`
          : `PAR ${strength.toFixed(0)}% · aguardando ${SIGNAL_THRESHOLD}%`
      );
      return next;
    });
  }, [enabled, tick, pipSize]);

  useEffect(() => {
    if (!enabled || signalStrength < SIGNAL_THRESHOLD) return;
    if (!isAuthorized || !isConnected || requestedRef.current || proposal || buying || activeContractId !== null) return;

    requestedRef.current = true;
    if (!getProposal(symbol, CONTRACT_TYPE, stake, 1, 0, false)) {
      requestedRef.current = false;
    }
  }, [enabled, signalStrength, isAuthorized, isConnected, proposal, buying, activeContractId, getProposal, symbol, stake]);

  useEffect(() => {
    if (!enabled || !proposal || buying || activeContractId !== null) return;
    requestedRef.current = false;
    buy(proposal.id, proposal.ask_price);
    setTicks([]);
    setSignalStrength(0);
    setNotice(`PAR aberto · $${stake.toFixed(2)}`);
  }, [enabled, proposal, buying, activeContractId, buy, stake]);

  useEffect(() => {
    const latest = profitTransactions[0];
    if (!enabled || !latest?.contract_id || !latest.sell_time) return;
    if (latest.contract_id === lastProcessedRef.current) return;
    lastProcessedRef.current = latest.contract_id;

    if (latest.contract_id === lastContractRef.current) return;
    lastContractRef.current = latest.contract_id;

    const profit = Number(latest.profit_loss || 0);
    requestedRef.current = false;
    setTicks([]);
    setSignalStrength(0);

    if (profit < 0) {
      const nextLevel = Math.min(MAX_LEVEL, level + 1);
      setLevel(nextLevel);
      setNotice(`LOSS · nível ${nextLevel}/${MAX_LEVEL} · próxima $${Number((baseStake * Math.pow(2, nextLevel)).toFixed(2)).toFixed(2)}`);
    } else {
      setLevel(0);
      setNotice(`WIN · reset para $${baseStake.toFixed(2)}`);
    }
  }, [enabled, profitTransactions, level, baseStake]);

  const toggle = () => {
    const next = !enabled;
    if (next) {
      if (!isConnected || !isAuthorized) return;
      const saved = Number(localStorage.getItem('izitrader_stake') || MIN_STAKE);
      const normalized = Math.min(MAX_BASE_STAKE, Math.max(MIN_STAKE, Number.isFinite(saved) ? saved : MIN_STAKE));
      setBaseStake(Number(normalized.toFixed(2)));
      setLevel(0);
      setTicks([]);
      setSignalStrength(0);
      setStatus('IA Sonic ON');
      setNotice('IA Power OFF · Soros original OFF · Sonic ativo');
      lastProcessedRef.current = profitTransactions[0]?.contract_id ?? null;
      lastContractRef.current = profitTransactions[0]?.contract_id ?? null;
      setSorosEnabled(false);
      takeControlOfCoreBot(true);
    } else {
      requestedRef.current = false;
      setTicks([]);
      setSignalStrength(0);
      setStatus('IA Sonic OFF');
      setNotice('Sonic desligado');
      takeControlOfCoreBot(false);
    }
    setEnabled(next);
  };

  useEffect(() => () => {
    localStorage.setItem('matos-ia-sonic-enabled', '0');
  }, []);

  return (
    <div className="ia-sonic-wrap">
      <style>{`
        .ia-sonic-wrap{width:380px;max-width:calc(100vw - 20px);margin:14px auto 0;font-family:Inter,system-ui,sans-serif;color:#fff}
        .ia-sonic-card{background:#101418;border:1px solid #27303a;border-radius:12px;padding:12px;box-shadow:0 12px 30px rgba(0,0,0,.16)}
        .ia-sonic-top{display:flex;align-items:center;justify-content:space-between;gap:10px}.ia-sonic-title{font-size:13px;font-weight:900;letter-spacing:.04em}.ia-sonic-sub{font-size:8px;color:#8d98a7;margin-top:3px}
        .ia-sonic-toggle{width:48px;height:26px;border:0;border-radius:999px;padding:3px;background:#374151;cursor:pointer;transition:.2s}.ia-sonic-toggle.on{background:#22c55e}.ia-sonic-toggle i{display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}.ia-sonic-toggle.on i{transform:translateX(22px)}
        .ia-sonic-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.ia-sonic-box{background:#161c22;border-radius:9px;padding:8px}.ia-sonic-label{font-size:8px;color:#7f8b9a;font-weight:800;text-transform:uppercase}.ia-sonic-value{display:block;margin-top:4px;font-size:16px;font-weight:900}.ia-sonic-select,.ia-sonic-input{width:100%;margin-top:5px;box-sizing:border-box;background:#11171d;color:#fff;border:1px solid #2b3440;border-radius:7px;padding:8px;font-size:10px;outline:none}.ia-sonic-signal{margin-top:9px;padding:11px;border-radius:9px;background:#161c22;text-align:center;font-weight:900;font-size:11px}.ia-sonic-green{color:#22c55e}.ia-sonic-red{color:#f87171}.ia-sonic-foot{margin-top:7px;font-size:8px;color:#6f7b89;text-align:center}
      `}</style>
      <div className="ia-sonic-card">
        <div className="ia-sonic-top">
          <div>
            <div className="ia-sonic-title">⚡ IA SONIC</div>
            <div className="ia-sonic-sub">Hyperlite · somente PAR · 5 ticks · gatilho 65% · x2 até nível 20</div>
          </div>
          <button className={`ia-sonic-toggle ${enabled ? 'on' : ''}`} type="button" onClick={toggle} aria-label="Ativar ou desativar IA Sonic"><i /></button>
        </div>

        <div className="ia-sonic-grid">
          <label className="ia-sonic-box"><span className="ia-sonic-label">Conta</span><select className="ia-sonic-select" value={account} onChange={e=>setAccount(e.target.value as 'demo'|'real')} disabled={enabled}><option value="demo">Demo</option><option value="real">Real</option></select></label>
          <label className="ia-sonic-box"><span className="ia-sonic-label">Índice</span><select className="ia-sonic-select" value={symbol} onChange={e=>setSymbol(e.target.value)} disabled={enabled}>{Object.entries(SYMBOLS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        </div>

        <div className="ia-sonic-grid">
          <label className="ia-sonic-box"><span className="ia-sonic-label">Stake base</span><input className="ia-sonic-input" type="number" min={MIN_STAKE} max={MAX_BASE_STAKE} step="0.01" value={baseStake} onChange={e=>setBaseStake(Math.max(MIN_STAKE,Math.min(MAX_BASE_STAKE,Number(e.target.value)||MIN_STAKE)))} onBlur={()=>localStorage.setItem('izitrader_stake',String(baseStake))} disabled={enabled}/></label>
          <div className="ia-sonic-box"><span className="ia-sonic-label">Próxima aposta</span><b className="ia-sonic-value">${stake.toFixed(2)}</b></div>
        </div>

        <div className="ia-sonic-signal">{notice}</div>
        <div className="ia-sonic-grid">
          <div className="ia-sonic-box"><span className="ia-sonic-label">Modo</span><b className="ia-sonic-value">{status}</b></div>
          <div className="ia-sonic-box"><span className="ia-sonic-label">Nível</span><b className="ia-sonic-value">{level}/{MAX_LEVEL}</b></div>
        </div>
        <div className="ia-sonic-grid">
          <div className="ia-sonic-box"><span className="ia-sonic-label">Força PAR</span><b className="ia-sonic-value">{signalStrength.toFixed(0)}%</b></div>
          <div className="ia-sonic-box"><span className="ia-sonic-label">Saldo</span><b className="ia-sonic-value">{balance ? `${Number(balance.balance).toFixed(2)} ${balance.currency}` : '—'}</b></div>
        </div>
        <div className="ia-sonic-foot">{enabled ? <span className="ia-sonic-green">● IA Power OFF · Soros original OFF · Sonic exclusivo</span> : <span className="ia-sonic-red">● Sonic OFF</span>}</div>
      </div>
    </div>
  );
}
