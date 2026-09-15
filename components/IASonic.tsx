'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

const MIN_STAKE = 0.35;
const MAX_BASE_STAKE = 10;
const MAX_LEVEL = 20;
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

const STAKES = [MIN_STAKE, 0.5, 1.0, ...Array.from({ length: 18 }, (_, i) => Number((1.5 + i * 0.5).toFixed(2)))];

function nearestStake(value: number) {
  return STAKES.reduce((best, item) => Math.abs(item - value) < Math.abs(best - value) ? item : best, STAKES[0]);
}

function lastDigit(value: number, pipSize?: number) {
  if (!Number.isFinite(value)) return null;
  const decimals = pipSize && pipSize > 0 ? Math.max(0, Math.min(10, Math.round(-Math.log10(pipSize)))) : 2;
  const text = value.toFixed(decimals);
  const digits = text.match(/\d/g);
  return digits?.length ? Number(digits[digits.length - 1]) : null;
}

function evenStrength(values: number[], pipSize?: number) {
  const digits = values.map(v => lastDigit(v, pipSize)).filter((v): v is number => v !== null);
  if (!digits.length) return 0;
  return digits.filter(d => d % 2 === 0).length / digits.length * 100;
}

function lockOtherBots(enabled: boolean) {
  if (typeof window === 'undefined') return;
  localStorage.setItem('matos-ia-sonic-enabled', enabled ? '1' : '0');
  window.dispatchEvent(new CustomEvent('matos:ia-sonic-toggle', { detail: { enabled } }));

  const root = document.querySelector('.av4') as HTMLElement | null;
  if (!root) return;

  const power = root.querySelector('.ia-toggle') as HTMLButtonElement | null;
  if (enabled && power && power.classList.contains('on')) power.click();
  if (power) power.disabled = enabled;

  const buttons = Array.from(root.querySelectorAll('button')) as HTMLButtonElement[];
  const mainButton = buttons.find(button => button.className.includes('w-full') && (button.className.includes('bg-blue-600') || button.className.includes('bg-red-600')));
  if (enabled && mainButton && mainButton.className.includes('bg-red-600')) mainButton.click();
  if (mainButton) {
    if (enabled) {
      mainButton.disabled = true;
      mainButton.dataset.sonicLocked = '1';
    } else if (mainButton.dataset.sonicLocked === '1') {
      mainButton.disabled = false;
      delete mainButton.dataset.sonicLocked;
    }
  }
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
  const [notice, setNotice] = useState('Aguardando 5 ticks');

  const requested = useRef(false);
  const lastEpoch = useRef<number | null>(null);
  const lastContract = useRef<number | null>(null);
  const previousLatestId = useRef<number | null>(null);

  const { tick, balance, proposal, buy, buying, activeContractId, getProposal, subscribeTicks, isAuthorized, isConnected, profitTransactions, setSorosEnabled } = useDeriv(account);

  const currentStake = useMemo(
    () => Number((baseStake * Math.pow(2, Math.min(level, MAX_LEVEL))).toFixed(2)),
    [baseStake, level]
  );

  useEffect(() => {
    setSorosEnabled(false);
  }, [setSorosEnabled]);

  useEffect(() => {
    if (!isConnected) return;
    subscribeTicks(symbol);
  }, [isConnected, symbol, subscribeTicks]);

  useEffect(() => {
    if (!enabled || !tick?.epoch || tick.epoch === lastEpoch.current) return;
    lastEpoch.current = tick.epoch;

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
      if (strength >= SIGNAL_THRESHOLD) {
        setNotice(`PAR ${strength.toFixed(0)}% · pronto para entrada`);
      } else {
        setNotice(`PAR ${strength.toFixed(0)}% · aguardando ${SIGNAL_THRESHOLD}%`);
      }
      return next;
    });
  }, [enabled, tick, pipSize]);

  useEffect(() => {
    if (!enabled || !signalStrength || signalStrength < SIGNAL_THRESHOLD) return;
    if (!isAuthorized || !isConnected || requested.current || proposal || buying || activeContractId !== null) return;

    const amount = currentStake;
    requested.current = true;
    if (!getProposal(symbol, CONTRACT_TYPE, amount, 1, 0, false)) {
      requested.current = false;
    }
  }, [enabled, signalStrength, isAuthorized, isConnected, requested, proposal, buying, activeContractId, getProposal, symbol, currentStake]);

  useEffect(() => {
    if (!enabled || !proposal || buying || activeContractId !== null) return;
    requested.current = false;
    buy(proposal.id, proposal.ask_price);
    setTicks([]);
    setSignalStrength(0);
    setNotice('Operação PAR aberta');
  }, [enabled, proposal, buying, activeContractId, buy]);

  useEffect(() => {
    const latest = profitTransactions[0];
    if (!enabled || !latest?.contract_id || !latest.sell_time) return;
    if (latest.contract_id === previousLatestId.current) return;

    previousLatestId.current = latest.contract_id;
    if (latest.contract_id === lastContract.current) return;
    lastContract.current = latest.contract_id;

    const profit = Number(latest.profit_loss || 0);
    if (profit < 0) {
      const nextLevel = Math.min(MAX_LEVEL, level + 1);
      setLevel(nextLevel);
      setNotice(`LOSS · nível ${nextLevel}/${MAX_LEVEL} · próxima $${Number((baseStake * Math.pow(2, nextLevel)).toFixed(2)).toFixed(2)}`);
    } else {
      setLevel(0);
      setNotice(`WIN · reset para $${baseStake.toFixed(2)}`);
    }

    requested.current = false;
    setTicks([]);
    setSignalStrength(0);
  }, [enabled, profitTransactions, level, baseStake]);

  const toggle = () => {
    const next = !enabled;
    if (next) {
      if (!isConnected || !isAuthorized) return;
      const saved = Number(localStorage.getItem('izitrader_stake') || MIN_STAKE);
      const normalized = nearestStake(Math.min(MAX_BASE_STAKE, Math.max(MIN_STAKE, Number.isFinite(saved) ? saved : MIN_STAKE)));
      setBaseStake(normalized);
      setLevel(0);
      setTicks([]);
      setSignalStrength(0);
      setNotice('IA Sonic ON · IA Power e Soros OFF');
      previousLatestId.current = profitTransactions[0]?.contract_id ?? null;
      lastContract.current = profitTransactions[0]?.contract_id ?? null;
      setSorosEnabled(false);
    } else {
      requested.current = false;
      setTicks([]);
      setSignalStrength(0);
      setNotice('IA Sonic OFF');
    }
    setEnabled(next);
    lockOtherBots(next);
  };

  useEffect(() => {
    lockOtherBots(enabled);
    return () => lockOtherBots(false);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const observer = new MutationObserver(() => lockOtherBots(true));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'disabled'] });
    return () => observer.disconnect();
  }, [enabled]);

  const setBase = (value: number) => {
    const normalized = nearestStake(Math.min(MAX_BASE_STAKE, Math.max(MIN_STAKE, value)));
    setBaseStake(normalized);
    localStorage.setItem('izitrader_stake', String(normalized));
    setLevel(0);
  };

  return (
    <div className="ia-sonic-wrap">
      <style>{`
        .ia-sonic-wrap{width:380px;max-width:calc(100vw - 20px);margin:14px auto 0;font-family:Inter,system-ui,sans-serif;color:#fff}
        .ia-sonic-card{background:#101418;border:1px solid #27303a;border-radius:12px;padding:12px;box-shadow:0 12px 30px rgba(0,0,0,.16)}
        .ia-sonic-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .ia-sonic-title{font-size:13px;font-weight:900;letter-spacing:.04em}
        .ia-sonic-sub{font-size:8px;color:#8d98a7;margin-top:3px}
        .ia-sonic-toggle{width:48px;height:26px;border:0;border-radius:999px;padding:3px;background:#374151;cursor:pointer;transition:.2s}
        .ia-sonic-toggle.on{background:#22c55e}.ia-sonic-toggle i{display:block;width:20px;height:20px;border-radius:50%;background:#fff;transition:.2s}.ia-sonic-toggle.on i{transform:translateX(22px)}
        .ia-sonic-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.ia-sonic-box{background:#161c22;border-radius:9px;padding:8px}.ia-sonic-label{font-size:8px;color:#7f8b9a;font-weight:800;text-transform:uppercase}.ia-sonic-value{display:block;margin-top:4px;font-size:16px;font-weight:900}.ia-sonic-select,.ia-sonic-input{width:100%;margin-top:5px;box-sizing:border-box;background:#11171d;color:#fff;border:1px solid #2b3440;border-radius:7px;padding:8px;font-size:10px;outline:none}.ia-sonic-signal{margin-top:9px;padding:11px;border-radius:9px;background:#161c22;text-align:center;font-weight:900;font-size:12px}.ia-sonic-green{color:#22c55e}.ia-sonic-muted{color:#94a3b8}.ia-sonic-warning{color:#f59e0b}.ia-sonic-foot{margin-top:7px;font-size:8px;color:#6f7b89;text-align:center}
      `}</style>
      <div className="ia-sonic-card">
        <div className="ia-sonic-top">
          <div>
            <div className="ia-sonic-title">⚡ IA SONIC</div>
            <div className="ia-sonic-sub">Somente PAR · 5 ticks · gatilho 65% · Martingale até nível 20</div>
          </div>
          <button className={`ia-sonic-toggle ${enabled ? 'on' : ''}`} type="button" onClick={toggle} aria-label="Ativar ou desativar IA Sonic">
            <i />
          </button>
        </div>

        <div className="ia-sonic-grid">
          <label className="ia-sonic-box"><span className="ia-sonic-label">Conta</span><select className="ia-sonic-select" value={account} onChange={e => setAccount(e.target.value as 'demo' | 'real')} disabled={enabled}><option value="demo">Demo</option><option value="real">Real</option></select></label>
          <label className="ia-sonic-box"><span className="ia-sonic-label">Índice</span><select className="ia-sonic-select" value={symbol} onChange={e => setSymbol(e.target.value)} disabled={enabled}>{Object.entries(SYMBOLS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        </div>

        <div className="ia-sonic-grid">
          <label className="ia-sonic-box"><span className="ia-sonic-label">Stake base</span><input className="ia-sonic-input" type="number" min={MIN_STAKE} max={MAX_BASE_STAKE} step="0.01" value={baseStake} onChange={e => setBase(Number(e.target.value) || MIN_STAKE)} onBlur={() => setBase(baseStake)} disabled={enabled} /></label>
          <div className="ia-sonic-box"><span className="ia-sonic-label">Próxima aposta</span><b className="ia-sonic-value">${currentStake.toFixed(2)}</b></div>
        </div>

        <div className="ia-sonic-signal">{enabled ? notice : 'IA Sonic desligada'}</div>

        <div className="ia-sonic-grid">
          <div className="ia-sonic-box"><span className="ia-sonic-label">Nível</span><b className="ia-sonic-value">{level}/{MAX_LEVEL}</b></div>
          <div className="ia-sonic-box"><span className="ia-sonic-label">Saldo</span><b className="ia-sonic-value">{balance ? `${Number(balance.balance).toFixed(2)} ${balance.currency}` : '—'}</b></div>
        </div>

        <div className="ia-sonic-foot">{enabled ? <span className="ia-sonic-green">● IA Power OFF · Soros original OFF · Sonic ON</span> : <span className="ia-sonic-muted">● Sonic OFF</span>}</div>
      </div>
    </div>
  );
}
