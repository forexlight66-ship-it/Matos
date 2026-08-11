// components/DigitsGame.tsx

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

const CONTRACT_TYPES = {
  OVER: 'DIGITOVER',
  UNDER: 'DIGITUNDER',
  MATCH: 'DIGITMATCH',
  DIFFERS: 'DIGITDIFF',
} as const;

type ContractChoice = keyof typeof CONTRACT_TYPES;

const SYMBOLS: Record<string, string> = {
  R_100: 'Volatility 100 Index',
  R_50: 'Volatility 50 Index',
  R_10: 'Volatility 10 Index',
  '1HZ100V': 'Volatility 100 (1s) Index',
};

const PROBS = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10];

export default function DigitsGame() {
  const {
    balance,
    tick,
    proposal,
    buying,
    getProposal,
    buy,
    subscribeTicks,
    isAuthorized,
    isConnected,
    error,
    profitTransactions,
  } = useDeriv();

  const [contractType, setContractType] = useState<ContractChoice>('MATCH');
  const [amount, setAmount] = useState(10);
  const [duration, setDuration] = useState(5);
  const [digit, setDigit] = useState(5);
  const [symbol, setSymbol] = useState('R_100');
  const [menuOpen, setMenuOpen] = useState(false);
  const [predictionOpen, setPredictionOpen] = useState(false);

  useEffect(() => {
    if (isConnected) subscribeTicks(symbol);
  }, [symbol, isConnected, subscribeTicks]);

  useEffect(() => {
    if (isAuthorized && isConnected) {
      getProposal(symbol, CONTRACT_TYPES[contractType], amount, duration, digit);
    }
  }, [contractType, amount, duration, digit, symbol, isAuthorized, isConnected, getProposal]);

  const accountType = balance?.loginid?.startsWith('CR') ? 'REAL' : 'DEMO';
  const balanceText = balance ? `${Number(balance.balance).toFixed(2)} ${balance.currency}` : '—';
  const priceText = tick ? Number(tick.quote).toFixed(2) : '—';
  const lastDigit = tick ? String(tick.quote).replace(/\D/g, '').slice(-1) || '—' : '—';
  const selectedContract = contractType === 'MATCH' ? 'Matches' : contractType === 'DIFFERS' ? 'Differs' : contractType === 'OVER' ? 'Over' : 'Under';

  const totalPnl = useMemo(
    () => profitTransactions.reduce((sum, tx) => sum + Number(tx.profit_loss || 0), 0),
    [profitTransactions]
  );

  const lastOperation = profitTransactions[0];
  const lastPnl = Number(lastOperation?.profit_loss || 0);
  const lastOperationTime = lastOperation
    ? new Date((lastOperation.sell_time || lastOperation.purchase_time) * 1000).toLocaleTimeString()
    : '—';

  const history = profitTransactions.slice(0, 12);

  const placeTrade = () => {
    if (proposal && isAuthorized) buy(proposal.id, proposal.ask_price);
  };

  const setStake = (value: number) => setAmount(value);

  const openCashier = () => {
    window.open('https://app.deriv.com/cashier', '_blank', 'noopener,noreferrer');
  };

  const selectPrediction = (value: ContractChoice) => {
    setContractType(value);
    setPredictionOpen(false);
  };

  const scrollTutorial = () => {
    document.getElementById('tutorial')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="matos-screen">
      <div className="matos-top">
        <div className="brand">
          <div className="avatar">M</div>
          <div className="brand-name">Moz<span>Hyper</span></div>
        </div>
        <button className="logout" onClick={() => { window.location.href = '/api/auth/logout'; }}>Sair</button>
      </div>

      <div className="balance-card">
        <div className="brand">
          <div className="brand-mark">M</div>
          <div>
            <div className="brand-name">Moz<span>Hyper</span></div>
            <div style={{ color: 'var(--t3)', fontSize: 9 }}>DIGITS TRADING</div>
          </div>
        </div>
        <div className="menu-wrap">
          <button className="menu-btn" onClick={() => setMenuOpen(v => !v)}>•••</button>
          {menuOpen && (
            <div className="menu">
              <button onClick={openCashier}>↓ Abrir depósito</button>
              <button onClick={openCashier}>↑ Abrir levantamento</button>
            </div>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <div className="stat-label">Saldo</div>
          <div className="stat-value">{balanceText}</div>
        </div>
        <div className="stat-divider" />
        <div className="stat">
          <div className="stat-label">Lucro/Prejuízo</div>
          <div className={`stat-value ${totalPnl >= 0 ? 'profit' : ''}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
          </div>
        </div>
      </div>

      <div className="control-row">
        <div>
          <div className="control-label">Tipo de Conta</div>
          <div className="control-pill real">{accountType} <span>⟳</span></div>
        </div>
        <div>
          <div className="control-label">Tipo de Previsão</div>
          <div className="control-pill" onClick={() => setPredictionOpen(v => !v)}>
            {selectedContract} <span>⌄</span>
            {predictionOpen && (
              <div className="select-menu" onClick={e => e.stopPropagation()}>
                <button onClick={() => selectPrediction('MATCH')}>Matches</button>
                <button onClick={() => selectPrediction('DIFFERS')}>Differs</button>
                <button onClick={() => selectPrediction('OVER')}>Over</button>
                <button onClick={() => selectPrediction('UNDER')}>Under</button>
              </div>
            )}
          </div>
        </div>
        <div>
          <div className="control-label">Vídeo Aula</div>
          <button className="control-pill video" onClick={scrollTutorial}>▶ <span>ⓘ</span></button>
        </div>
      </div>

      <div className="last-op">
        <div className="last-op-head">
          <span className="history-label" style={{ margin: 0 }}>Última operação fechada</span>
          <span className="last-op-time">{lastOperationTime}</span>
        </div>
        <div className="last-op-grid">
          <div className="last-op-cell"><span>Tipo</span><span>{lastOperation?.contract_type || '—'}</span></div>
          <div className="last-op-cell"><span>Tick Final</span><span>{lastDigit}</span></div>
          <div className="last-op-cell"><span>Preço</span><span>{lastOperation ? Number(lastOperation.buy_price).toFixed(2) : '—'}</span></div>
          <div className="last-op-cell"><span>Resultado</span><span className={lastPnl >= 0 ? 'profit' : ''}>{lastOperation ? `${lastPnl >= 0 ? '+' : ''}${lastPnl.toFixed(2)}` : '—'}</span></div>
        </div>
      </div>

      <div className="dial">
        <div className="dial-ring" />
        {PROBS.map((prob, i) => {
          const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
          const x = 124 + 95 * Math.cos(angle);
          const y = 124 + 95 * Math.sin(angle);
          return (
            <button
              key={i}
              className={`digit ${i === digit ? 'active' : ''}`}
              style={{ left: x, top: y, transform: 'translate(-50%,-50%)' }}
              onClick={() => setDigit(i)}
            >
              <span className="n">{i}</span>
              <span className="p">{prob.toFixed(1)}%</span>
            </button>
          );
        })}
        <div className="dial-center">
          <div className="dial-price">{priceText.slice(0, -1)}<span className="last">{lastDigit}</span></div>
          <div className="dial-label">último dígito</div>
        </div>
      </div>

      <div className="dial-caption">Previsão selecionada: <b>{digit}</b> · toque num número no anel</div>

      <div className="toggle">
        <div className={`toggle-glider ${contractType === 'DIFFERS' ? 'right' : ''}`} />
        <button className={contractType === 'MATCH' ? 'active' : ''} onClick={() => setContractType('MATCH')}>Matches</button>
        <button className={contractType === 'DIFFERS' ? 'active' : ''} onClick={() => setContractType('DIFFERS')}>Differs</button>
      </div>

      <div className="section-label">Aposta <span>saldo: {balance ? Number(balance.balance).toFixed(2) : '—'}</span></div>
      <div className="stake"><span>USD</span>{amount.toFixed(2)}</div>
      <div className="chip-row">
        {[10, 20, 50, 100].map(value => (
          <button key={value} className={`chip ${amount === value ? 'active' : ''}`} onClick={() => setStake(value)}>{value}</button>
        ))}
      </div>

      <div className="section-label">Duração <span>ticks</span></div>
      <div className="duration-row">
        {[1, 5, 10].map(value => (
          <button key={value} className={`duration ${duration === value ? 'active' : ''}`} onClick={() => setDuration(value)}>{value}</button>
        ))}
      </div>

      {error && <div className="error-box">⚠️ {error}</div>}

      <button className="cta" onClick={placeTrade} disabled={!proposal || !isAuthorized || buying}>
        {buying ? '⏳ A comprar...' : '🎯 Colocar previsão'}
        {proposal && <small> · ganho pot. +{Number(proposal.payout - proposal.ask_price).toFixed(2)}</small>}
      </button>

      {!isAuthorized && <div className="error-box" style={{ marginTop: 10, marginBottom: 0 }}>⚠️ Não autorizado. Verifique a sessão Deriv.</div>}

      <div className="history-label">Histórico recente</div>
      <div className="history">
        {history.length === 0 && <span style={{ color: 'var(--t3)', fontSize: 10 }}>Aguardando operações...</span>}
        {history.map(tx => {
          const pnl = Number(tx.profit_loss || 0);
          const code = tx.contract_type === 'DIGITMATCH' ? 'M' : tx.contract_type === 'DIGITDIFF' ? 'D' : tx.contract_type === 'DIGITOVER' ? 'O' : 'U';
          return <div key={tx.contract_id} className={`history-chip ${pnl >= 0 ? 'win' : 'loss'}`}><div>{code}</div><div>{pnl >= 0 ? '✓' : '✕'}</div></div>;
        })}
      </div>

      <div className="market">
        <span>📈</span>
        <span className="market-name">{SYMBOLS[symbol]}</span>
        <span className="live">{isConnected ? 'AO VIVO' : 'OFFLINE'}</span>
      </div>

      <div className="footer-note">Powered by Deriv · Jogue com responsabilidade</div>
    </div>
  );
}
