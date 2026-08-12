'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';

const CONTRACT_TYPES = { OVER: 'DIGITOVER', UNDER: 'DIGITUNDER', MATCH: 'DIGITMATCH', DIFFERS: 'DIGITDIFF' } as const;
type ContractChoice = keyof typeof CONTRACT_TYPES;
const SYMBOLS: Record<string, string> = { R_100: 'Volatility 100 Index', R_50: 'Volatility 50 Index', R_10: 'Volatility 10 Index', R_25: 'Volatility 25 Index', R_75: 'Volatility 75 Index', '1HZ100V': 'Volatility 100 (1s) Index', '1HZ50V': 'Volatility 50 (1s) Index' };
const PROBS = [10,10,10,10,10,10,10,10,10,10];
const MIN_STAKE = 0.50;

export default function DigitsGame() {
  const { t, language } = useLanguage();
  const { balance, tick, proposal, buying, getProposal, buy, subscribeTicks, isAuthorized, isConnected, error, profitTransactions } = useDeriv();
  const [contractType, setContractType] = useState<ContractChoice>('MATCH');
  const [amount, setAmount] = useState(MIN_STAKE);
  const [amountText, setAmountText] = useState(MIN_STAKE.toFixed(2));
  const [symbol, setSymbol] = useState('R_100');
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [digit, setDigit] = useState(5);
  const [menuOpen, setMenuOpen] = useState(false);
  const [predictionOpen, setPredictionOpen] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [tradeActive, setTradeActive] = useState(false);
  const lastTickEpoch = useRef<number | null>(null);
  const lastClosedContract = useRef<number | null>(null);

  useEffect(() => { if (isConnected) subscribeTicks(symbol); }, [symbol, isConnected, subscribeTicks]);
  useEffect(() => { if (isAuthorized && isConnected && !tradeActive) getProposal(symbol, CONTRACT_TYPES[contractType], Math.max(MIN_STAKE, amount), 5, digit); }, [contractType, amount, digit, symbol, isAuthorized, isConnected, tradeActive, getProposal]);
  useEffect(() => { if (!tradeActive || !tick?.epoch || lastTickEpoch.current === tick.epoch) return; lastTickEpoch.current = tick.epoch; setCountdown(current => current > 1 ? current - 1 : 1); }, [tick, tradeActive]);
  useEffect(() => { const latestId = profitTransactions[0]?.contract_id ?? null; if (latestId && latestId !== lastClosedContract.current) { lastClosedContract.current = latestId; setTradeActive(false); setCountdown(5); } }, [profitTransactions]);

  const balanceText = balance ? `${Number(balance.balance).toFixed(2)} ${balance.currency}` : '—';
  const lastDigit = tick ? String(tick.quote).replace(/\D/g, '').slice(-1) || '—' : '—';
  const totalPnl = useMemo(() => profitTransactions.reduce((sum, tx) => sum + Number(tx.profit_loss || 0), 0), [profitTransactions]);
  const lastOperation = profitTransactions[0];
  const lastPnl = Number(lastOperation?.profit_loss || 0);
  const lastOperationTime = lastOperation ? new Date((lastOperation.sell_time || lastOperation.purchase_time) * 1000).toLocaleTimeString() : '—';
  const history = profitTransactions.slice(0, 12);
  const predictionLabels: Record<ContractChoice, string> = language === 'pt' ? { MATCH:'Igual', DIFFERS:'Diferente', OVER:'Acima', UNDER:'Abaixo' } : language === 'es' ? { MATCH:'Igual', DIFFERS:'Diferente', OVER:'Superior', UNDER:'Inferior' } : { MATCH:'Matches', DIFFERS:'Differs', OVER:'Over', UNDER:'Under' };

  const placeTrade = () => { if (proposal && isAuthorized && !buying && Number(proposal.ask_price) >= MIN_STAKE) { setTradeActive(true); setCountdown(5); lastTickEpoch.current = tick?.epoch ?? null; buy(proposal.id, proposal.ask_price); } };
  const handleStakeChange = (value: string) => { setAmountText(value); const parsed = Number(value.replace(',', '.')); if (Number.isFinite(parsed) && parsed >= MIN_STAKE) setAmount(parsed); };
  const normalizeStake = () => { const parsed = Number(amountText.replace(',', '.')); const safe = Number.isFinite(parsed) ? Math.max(MIN_STAKE, parsed) : MIN_STAKE; setAmount(safe); setAmountText(safe.toFixed(2)); };
  const openCashier = () => window.open('https://app.deriv.com/cashier', '_blank', 'noopener,noreferrer');
  const selectPrediction = (value: ContractChoice) => { setContractType(value); setPredictionOpen(false); };
  const selectSymbol = (value: string) => { setSymbol(value); setSymbolOpen(false); setTradeActive(false); setCountdown(5); };
  const scrollTutorial = () => document.getElementById('tutorial')?.scrollIntoView({ behavior:'smooth' });

  return <div className="matos-screen">
    <div className="matos-top">
      <div className="brand"><div className="avatar">M</div><div className="brand-name">Moz<span>Hyper</span></div></div>
      <div className="top-actions"><div className="menu-wrap"><button className="menu-btn" aria-label="Depósito e levantamento" onClick={() => setMenuOpen(v=>!v)}>•••</button>{menuOpen && <div className="menu"><button onClick={()=>{openCashier();setMenuOpen(false)}}>↓ Depositar</button><button onClick={()=>{openCashier();setMenuOpen(false)}}>↑ Levantar</button></div>}</div><button className="logout" onClick={()=>{window.location.href='/api/auth/logout'}}>{t('logout')}</button></div>
    </div>

    <div className="stats"><div className="stat"><div className="stat-label">{t('balance')}</div><div className="stat-value">{balanceText}</div></div><div className="stat-divider"/><div className="stat"><div className="stat-label">{t('profitLoss')}</div><div className={`stat-value ${totalPnl >= 0 ? 'profit' : 'loss-value'}`}>{totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)} <small>USD</small></div></div></div>

    <div className="control-row">
      <div><div className="control-label">{language==='pt'?'Tipo de Conta':language==='es'?'Tipo de Cuenta':'Account Type'}</div><div className="control-pill real">{balance?.loginid?.startsWith('CR')?'REAL':'DEMO'} <span>⟳</span></div></div>
      <div><div className="control-label">{language==='pt'?'Tipo de Previsão':language==='es'?'Tipo de Predicción':'Prediction Type'}</div><div className="control-pill" onClick={()=>setPredictionOpen(v=>!v)}>{predictionLabels[contractType]} <span>⌄</span>{predictionOpen&&<div className="select-menu" onClick={e=>e.stopPropagation()}>{(Object.keys(CONTRACT_TYPES) as ContractChoice[]).map(type=><button key={type} onClick={()=>selectPrediction(type)}>{predictionLabels[type]}</button>)}</div>}</div></div>
      <div><div className="control-label">{language==='pt'?'Vídeo Aula':language==='es'?'Video':'Tutorial'}</div><button className="control-pill video" onClick={scrollTutorial}>▶ <span>ⓘ</span></button></div>
    </div>

    <div className="last-op"><div className="last-op-head"><span className="history-label" style={{margin:0}}>{language==='pt'?'Última operação fechada':language==='es'?'Última operación cerrada':'Last closed operation'}</span><span className="last-op-time">{lastOperationTime}</span></div><div className="last-op-grid"><div className="last-op-cell"><span>{t('type')}</span><span>{lastOperation?.contract_type||'—'}</span></div><div className="last-op-cell"><span>{language==='pt'?'Tick Final':language==='es'?'Tick Final':'Final Tick'}</span><span>{lastOperation?lastDigit:'—'}</span></div><div className="last-op-cell"><span>{language==='pt'?'Preço':language==='es'?'Precio':'Price'}</span><span>{lastOperation?Number(lastOperation.buy_price).toFixed(2):'—'}</span></div><div className="last-op-cell"><span>{language==='pt'?'Resultado':language==='es'?'Resultado':'Result'}</span><span className={lastPnl>=0?'profit':'loss-value'}>{lastOperation?`${lastPnl>=0?'+':''}${lastPnl.toFixed(2)}`:'—'}</span></div></div></div>

    <div className="dial"><div className="dial-ring"/>{PROBS.map((prob,i)=>{const angle=(i/10)*Math.PI*2-Math.PI/2;const radius=101;const x=124+radius*Math.cos(angle);const y=124+radius*Math.sin(angle);return <button key={i} className={`digit ${i===digit?'active':''}`} style={{left:x,top:y}} onClick={()=>setDigit(i)}><span className="n">{i}</span><span className="p">{prob.toFixed(1)}%</span></button>})}<div className="dial-center"><div className="dial-last-digit">{lastDigit}</div><div className="dial-label">{language==='pt'||language==='es'?'último dígito':'last digit'}</div></div></div>

    <div className="countdown">{countdown}</div>

    <div className="market-controls"><div className="section-label">{t('symbol')}</div><div className="symbol-select-wrap"><button className="symbol-select" onClick={()=>setSymbolOpen(v=>!v)}>{SYMBOLS[symbol]} <span>⌄</span></button>{symbolOpen&&<div className="symbol-menu">{Object.entries(SYMBOLS).map(([value,label])=><button key={value} onClick={()=>selectSymbol(value)}>{label}</button>)}</div>}</div><div className="section-label duration-label">{language==='pt'?'Duração':language==='es'?'Duración':'Duration'} <span>ticks</span></div><div className="duration-row"><div className="duration active">5 ticks</div></div></div>

    <div className="section-label">{language==='pt'?'Aposta':language==='es'?'Apuesta':'Stake'} <span>mínimo: $0.50</span></div><div className="stake-input-wrap"><span>USD</span><input inputMode="decimal" type="text" value={amountText} onChange={e=>handleStakeChange(e.target.value)} onBlur={normalizeStake} aria-label="Stake"/></div>

    {error&&<div className="error-box">⚠️ {error}</div>}<button className="cta" onClick={placeTrade} disabled={!proposal||!isAuthorized||buying||tradeActive}>{buying?`⏳ ${t('buying')}`:language==='pt'?'🎯 Colocar previsão':language==='es'?'🎯 Colocar predicción':'🎯 Place prediction'}{proposal&&<small> · +{Number(proposal.payout-proposal.ask_price).toFixed(2)} USD</small>}</button>
    {!isAuthorized&&<div className="error-box" style={{marginTop:10,marginBottom:0}}>{t('unauthorizedWarning')}</div>}

    <div className="history-label">{language==='pt'?'Histórico recente':language==='es'?'Historial reciente':'Recent history'}</div><div className="history">{history.length===0&&<span style={{color:'var(--t3)',fontSize:10}}>{t('waitingTick')}</span>}{history.map(tx=>{const pnl=Number(tx.profit_loss||0);return <div key={tx.contract_id} className={`history-chip ${pnl>=0?'win':'loss'}`}><div>{pnl>=0?'+':''}{pnl.toFixed(2)}</div><div>{tx.contract_type==='DIGITMATCH'?predictionLabels.MATCH:tx.contract_type==='DIGITDIFF'?predictionLabels.DIFFERS:tx.contract_type==='DIGITOVER'?predictionLabels.OVER:predictionLabels.UNDER}</div></div>})}</div>
    <div className="market"><span>📈</span><span className="market-name">{SYMBOLS[symbol]}</span><span className="live">{isConnected?(language==='pt'?'AO VIVO':'LIVE'):'OFFLINE'}</span></div><div className="footer-note">Powered by Deriv · {language==='pt'?'Jogue com responsabilidade':language==='es'?'Juega responsablemente':'Play responsibly'}</div>
  </div>;
}
