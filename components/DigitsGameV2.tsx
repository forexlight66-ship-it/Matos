'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';

const CONTRACT_TYPES={OVER:'DIGITOVER',UNDER:'DIGITUNDER',MATCH:'DIGITMATCH',DIFFERS:'DIGITDIFF'} as const;
type ContractChoice=keyof typeof CONTRACT_TYPES;
const SYMBOLS:Record<string,string>={R_100:'Volatility 100 Index',R_50:'Volatility 50 Index',R_10:'Volatility 10 Index',R_25:'Volatility 25 Index',R_75:'Volatility 75 Index','1HZ100V':'Volatility 100 (1s) Index','1HZ50V':'Volatility 50 (1s) Index'};
const PROBS=[10,10,10,10,10,10,10,10,10,10];
const MIN_STAKE=.50;

type Theme='dark'|'light';
function sound(kind:'tick'|'buy'|'win'|'loss'){
 if(typeof window==='undefined')return;
 try{const AC=window.AudioContext||(window as any).webkitAudioContext;if(!AC)return;const ctx=new AC();const notes=kind==='win'?[660,880,1046]:kind==='loss'?[440,330,220]:kind==='buy'?[520,760]:[620];const now=ctx.currentTime;notes.forEach((f,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=kind==='loss'?'sawtooth':'sine';o.frequency.value=f;g.gain.setValueAtTime(.0001,now+i*.08);g.gain.exponentialRampToValueAtTime(kind==='tick'?.03:.065,now+i*.08+.01);g.gain.exponentialRampToValueAtTime(.0001,now+i*.08+.11);o.connect(g);g.connect(ctx.destination);o.start(now+i*.08);o.stop(now+i*.08+.12)});setTimeout(()=>ctx.close().catch(()=>{}),500)}catch{}
}

export default function DigitsGameV2(){
 const {t,language,setLanguage}=useLanguage();
 const {balance,tick,proposal,buying,getProposal,buy,subscribeTicks,isAuthorized,isConnected,error,profitTransactions}=useDeriv();
 const [contractType,setContractType]=useState<ContractChoice>('MATCH');
 const [amount,setAmount]=useState(MIN_STAKE); const [amountText,setAmountText]=useState('0.50');
 const [symbol,setSymbol]=useState('R_100'); const [symbolOpen,setSymbolOpen]=useState(false); const [digit,setDigit]=useState(5);
 const [menuOpen,setMenuOpen]=useState(false); const [predictionOpen,setPredictionOpen]=useState(false); const [countdown,setCountdown]=useState(5); const [tradeActive,setTradeActive]=useState(false);
 const [theme,setTheme]=useState<Theme>(()=>typeof window!=='undefined'&&localStorage.getItem('mozhyper-theme')==='light'?'light':'dark');
 const [popup,setPopup]=useState<{id:number;pnl:number}|null>(null);
 const lastTick=useRef<number|null>(null); const lastClosed=useRef<number|null>(null);
 useEffect(()=>{document.documentElement.dataset.theme=theme;localStorage.setItem('mozhyper-theme',theme)},[theme]);
 useEffect(()=>{if(isConnected)subscribeTicks(symbol)},[symbol,isConnected,subscribeTicks]);
 useEffect(()=>{if(isAuthorized&&isConnected&&!tradeActive)getProposal(symbol,CONTRACT_TYPES[contractType],Math.max(MIN_STAKE,amount),5,digit)},[contractType,amount,digit,symbol,isAuthorized,isConnected,tradeActive,getProposal]);
 useEffect(()=>{if(!tradeActive||!tick?.epoch||lastTick.current===tick.epoch)return;lastTick.current=tick.epoch;sound('tick');setCountdown(c=>c>1?c-1:5)},[tick,tradeActive]);
 useEffect(()=>{const tx=profitTransactions[0];const id=tx?.contract_id??null;if(id&&id!==lastClosed.current){lastClosed.current=id;setTradeActive(false);setCountdown(5);const pnl=Number(tx.profit_loss||0);setPopup({id,pnl});sound(pnl>=0?'win':'loss');setTimeout(()=>setPopup(p=>p?.id===id?null:p),3500)}},[profitTransactions]);
 useEffect(()=>{if(error&&tradeActive&&!buying){setTradeActive(false);setCountdown(5)}},[error,tradeActive,buying]);
 const balanceText=balance?`${Number(balance.balance).toFixed(2)} ${balance.currency}`:'—';
 const lastDigit=tick?String(tick.quote).replace(/\D/g,'').slice(-1)||'—':'—';
 const totalPnl=useMemo(()=>profitTransactions.reduce((s,tx)=>s+Number(tx.profit_loss||0),0),[profitTransactions]);
 const last=profitTransactions[0]; const lastPnl=Number(last?.profit_loss||0); const history=profitTransactions.slice(0,12);
 const lastTime=last?new Date((last.sell_time||last.purchase_time)*1000).toLocaleTimeString():'—';
 const labels:Record<ContractChoice,string>=language==='pt'?{MATCH:'Igual',DIFFERS:'Diferente',OVER:'Acima',UNDER:'Abaixo'}:language==='es'?{MATCH:'Igual',DIFFERS:'Diferente',OVER:'Superior',UNDER:'Inferior'}:{MATCH:'Matches',DIFFERS:'Differs',OVER:'Over',UNDER:'Under'};
 const place=()=>{if(!proposal||!isAuthorized||buying||tradeActive||Number(proposal.ask_price)<MIN_STAKE)return;setTradeActive(true);setCountdown(5);lastTick.current=tick?.epoch??null;sound('buy');buy(proposal.id,proposal.ask_price)};
 const stake=(v:string)=>{setAmountText(v);const n=Number(v.replace(',','.'));if(Number.isFinite(n)&&n>=MIN_STAKE)setAmount(n)};
 const normalize=()=>{const n=Number(amountText.replace(',','.'));const safe=Number.isFinite(n)?Math.max(MIN_STAKE,n):MIN_STAKE;setAmount(safe);setAmountText(safe.toFixed(2))};
 const logout=()=>window.location.assign('/api/auth/logout'); const cashier=()=>window.open('https://app.deriv.com/cashier','_blank','noopener,noreferrer');
 const selectSymbol=(s:string)=>{setSymbol(s);setSymbolOpen(false);setTradeActive(false);setCountdown(5)};
 const predictionLabel=labels[contractType];
 return <div className="matos-screen">
  <style jsx global>{`
   :root[data-theme='light']{--bg:#f3f6fb;--s1:#fff;--s2:#e9eef7;--s3:#dce5f5;--t1:#111827;--t2:#526174;--t3:#78869a}
   .settings-menu{width:205px;padding:8px}.menu-title{padding:7px 8px 5px;color:var(--t3);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.menu-langs,.theme-toggle{display:flex;gap:5px;padding:0 2px 7px}.menu-langs button,.theme-toggle button{flex:1!important;text-align:center!important;padding:8px 4px!important;background:var(--s1)!important;color:var(--t2)!important}.menu-langs button.active,.theme-toggle button.active{background:var(--blue)!important;color:#fff!important}.menu-sep{height:1px;background:rgba(128,128,128,.18);margin:4px 0}.result-popup{position:fixed;z-index:100;left:50%;top:18px;transform:translateX(-50%);min-width:220px;padding:13px 18px;border-radius:15px;text-align:center;background:var(--s2);border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 45px rgba(0,0,0,.35);animation:resultIn .22s ease}.result-popup.win{border-color:rgba(52,211,153,.45)}.result-popup.loss{border-color:rgba(248,113,113,.45)}.result-popup-title{font:700 11px Inter;color:var(--t2);margin-bottom:4px}.result-popup-value{font:800 20px 'JetBrains Mono'}.result-popup.win .result-popup-value{color:var(--win)}.result-popup.loss .result-popup-value{color:var(--loss)}@keyframes resultIn{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}
  `}</style>
  {popup&&<div className={`result-popup ${popup.pnl>=0?'win':'loss'}`}><div className="result-popup-title">{popup.pnl>=0?'✓':'✕'} {language==='pt'?'Contrato fechado':language==='es'?'Contrato cerrado':'Contract closed'}</div><div className="result-popup-value">{popup.pnl>=0?'+':''}{popup.pnl.toFixed(2)} USD</div></div>}
  <div className="matos-top"><div className="brand"><div className="avatar">M</div><div className="brand-name">Moz<span>Hyper</span></div></div><div className="top-actions"><div className="menu-wrap"><button className="menu-btn" aria-label="Menu" onClick={()=>setMenuOpen(v=>!v)}>•••</button>{menuOpen&&<div className="menu settings-menu">
    <div className="menu-title">{language==='pt'?'Idioma':language==='es'?'Idioma':'Language'}</div><div className="menu-langs"><button className={language==='en'?'active':''} onClick={()=>{setLanguage('en');setMenuOpen(false)}}>EN</button><button className={language==='pt'?'active':''} onClick={()=>{setLanguage('pt');setMenuOpen(false)}}>PT</button><button className={language==='es'?'active':''} onClick={()=>{setLanguage('es');setMenuOpen(false)}}>ES</button></div>
    <div className="menu-title">{language==='pt'?'Tema':language==='es'?'Tema':'Theme'}</div><div className="theme-toggle"><button className={theme==='dark'?'active':''} onClick={()=>setTheme('dark')}>🌙 Dark</button><button className={theme==='light'?'active':''} onClick={()=>setTheme('light')}>☀️ Light</button></div><div className="menu-sep"/>
    <button onClick={()=>{cashier();setMenuOpen(false)}}>↓ {language==='pt'?'Depositar':'Deposit'}</button><button onClick={()=>{cashier();setMenuOpen(false)}}>↑ {language==='pt'?'Levantar':'Withdraw'}</button>
  </div>}</div><button className="logout" onClick={logout}>{t('logout')}</button></div></div>
  <div className="stats"><div className="stat"><div className="stat-label">{t('balance')}</div><div className="stat-value">{balanceText}</div></div><div className="stat-divider"/><div className="stat"><div className="stat-label">{t('profitLoss')}</div><div className={`stat-value ${totalPnl>=0?'profit':'loss-value'}`}>{totalPnl>=0?'+':''}{totalPnl.toFixed(2)} <small>USD</small></div></div></div>
  <div className="control-row"><div><div className="control-label">{language==='pt'?'Tipo de Conta':language==='es'?'Tipo de Cuenta':'Account Type'}</div><div className="control-pill real">{balance?.loginid?.startsWith('CR')?'REAL':'DEMO'} <span>⟳</span></div></div><div><div className="control-label">{language==='pt'?'Tipo de Previsão':language==='es'?'Tipo de Predicción':'Prediction Type'}</div><div className="control-pill" onClick={()=>setPredictionOpen(v=>!v)}>{predictionLabel} <span>⌄</span>{predictionOpen&&<div className="select-menu" onClick={e=>e.stopPropagation()}>{(Object.keys(CONTRACT_TYPES) as ContractChoice[]).map(k=><button key={k} onClick={()=>{setContractType(k);setPredictionOpen(false)}}>{labels[k]}</button>)}</div>}</div></div><div><div className="control-label">{language==='pt'?'Vídeo Aula':language==='es'?'Video':'Tutorial'}</div><button className="control-pill video" onClick={()=>document.getElementById('tutorial')?.scrollIntoView({behavior:'smooth'})}>▶ <span>ⓘ</span></button></div></div>
  <div className="last-op"><div className="last-op-head"><span className="history-label" style={{margin:0}}>{language==='pt'?'Última operação fechada':language==='es'?'Última operación cerrada':'Last closed operation'}</span><span className="last-op-time">{lastTime}</span></div><div className="last-op-grid"><div className="last-op-cell"><span>{t('type')}</span><span>{last?.contract_type||'—'}</span></div><div className="last-op-cell"><span>{language==='pt'?'Tick Final':language==='es'?'Tick Final':'Final Tick'}</span><span>{last?.exit_tick??'—'}</span></div><div className="last-op-cell"><span>{language==='pt'?'Preço':language==='es'?'Precio':'Price'}</span><span>{last?Number(last.buy_price).toFixed(2):'—'}</span></div><div className="last-op-cell"><span>{language==='pt'?'Resultado':language==='es'?'Resultado':'Result'}</span><span className={lastPnl>=0?'profit':'loss-value'}>{last?`${lastPnl>=0?'+':''}${lastPnl.toFixed(2)}`:'—'}</span></div></div></div>
  <div className="dial"><div className="dial-ring"/>{PROBS.map((p,i)=>{const a=i/10*Math.PI*2-Math.PI/2,r=103,x=124+r*Math.cos(a),y=124+r*Math.sin(a);return <button key={i} className={`digit ${i===digit?'active':''}`} style={{left:x,top:y}} onClick={()=>setDigit(i)}><span className="n">{i}</span><span className="p">{p.toFixed(1)}%</span></button>})}<div className="dial-center"><div className="dial-last-digit">{lastDigit}</div><div className="dial-label">{language==='pt'||language==='es'?'último dígito':'last digit'}</div></div></div>
  <div className="countdown" aria-live="polite">{countdown}</div>
  <div className="history-label">{language==='pt'?'Histórico recente':language==='es'?'Historial reciente':'Recent history'}</div><div className="history">{history.length===0&&<span style={{color:'var(--t3)',fontSize:10}}>{t('waitingTick')}</span>}{history.map(tx=>{const pnl=Number(tx.profit_loss||0);return <div key={tx.contract_id} className={`history-chip ${pnl>=0?'win':'loss'}`}><div>{pnl>=0?'+':''}{pnl.toFixed(2)}</div><div>{tx.contract_type==='DIGITMATCH'?labels.MATCH:tx.contract_type==='DIGITDIFF'?labels.DIFFERS:tx.contract_type==='DIGITOVER'?labels.OVER:labels.UNDER}</div></div>})}</div>
  <div className="market-controls"><div className="section-label">{t('symbol')}</div><div className="symbol-select-wrap"><button className="symbol-select" onClick={()=>setSymbolOpen(v=>!v)}>{SYMBOLS[symbol]} <span>⌄</span></button>{symbolOpen&&<div className="symbol-menu">{Object.entries(SYMBOLS).map(([v,l])=><button key={v} onClick={()=>selectSymbol(v)}>{l}</button>)}</div>}</div><div className="section-label duration-label">{language==='pt'?'Duração':language==='es'?'Duración':'Duration'} <span>ticks</span></div><div className="duration-row"><div className="duration active">5 ticks</div></div></div>
  <div className="section-label">{language==='pt'?'Aposta':language==='es'?'Apuesta':'Stake'} <span>mínimo: $0.50</span></div><div className="stake-input-wrap"><span>USD</span><input inputMode="decimal" type="text" value={amountText} onChange={e=>stake(e.target.value)} onBlur={normalize} aria-label="Stake"/></div>
  {error&&<div className="error-box">⚠️ {error}</div>}<button className="cta" onClick={place} disabled={!proposal||!isAuthorized||buying||tradeActive}>{buying?`⏳ ${t('buying')}`:language==='pt'?'🎯 Colocar previsão':language==='es'?'🎯 Colocar predicción':'🎯 Place prediction'}{proposal&&<small> · +{Number(proposal.payout-proposal.ask_price).toFixed(2)} USD</small>}</button>{!isAuthorized&&<div className="error-box" style={{marginTop:10,marginBottom:0}}>{t('unauthorizedWarning')}</div>}
  <div className="footer-note">Powered by Deriv · {language==='pt'?'Jogue com responsabilidade':language==='es'?'Juega responsablemente':'Play responsibly'}</div>
 </div>;
}
