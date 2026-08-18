'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type Contract = 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'MATCH';
const CONTRACT_TYPES: Record<Contract,string> = { EVEN:'DIGITEVEN', ODD:'DIGITODD', OVER:'DIGITOVER', UNDER:'DIGITUNDER', MATCH:'DIGITMATCH' };
const SYMBOLS: Record<string,string> = { R_100:'Volatility 100 Index', R_50:'Volatility 50 Index', R_75:'Volatility 75 Index', '1HZ100V':'Volatility 100 (1s) Index', '1HZ50V':'Volatility 50 (1s) Index' };
const USD_TO_MZN = 68;
const MIN_STAKE = 1.5;

type Strategy = { name:string; risk:string; contract:Contract; barrier:number; hit:number; reason:string };

function lastDigit(value:number|string|undefined|null){
  if(value===undefined||value===null)return null;
  const digits=String(value).replace(/\D/g,'');
  return digits?Number(digits.slice(-1)):null;
}

function strategyFromTicks(ticks:number[]):Strategy|null{
  if(ticks.length<20)return null;
  const counts=Array(10).fill(0) as number[];
  ticks.slice(-100).forEach(v=>{const d=lastDigit(v);if(d!==null)counts[d]++});
  const total=counts.reduce((a,b)=>a+b,0); if(!total)return null;
  const even=counts.filter((_,i)=>i%2===0).reduce((a,b)=>a+b,0)/total;
  const over4=counts.slice(5).reduce((a,b)=>a+b,0)/total;
  const under5=counts.slice(0,5).reduce((a,b)=>a+b,0)/total;
  const top=counts.map((n,i)=>({n,i})).sort((a,b)=>b.n-a.n)[0];
  if(Math.max(even,1-even)>=0.56)return even>=.5
    ?{name:'Sniper Par/Ímpar',risk:'BAIXO',contract:'EVEN',barrier:0,hit:Math.round(even*100),reason:`Paridade ${Math.round(even*100)}%`}
    :{name:'Sniper Par/Ímpar',risk:'BAIXO',contract:'ODD',barrier:0,hit:Math.round((1-even)*100),reason:`Ímpar ${Math.round((1-even)*100)}%`};
  if(Math.max(over4,under5)>=0.56)return over4>=.5
    ?{name:'Momentum Over/Under',risk:'MÉDIO',contract:'OVER',barrier:4,hit:Math.round(over4*100),reason:`Acima de 4: ${Math.round(over4*100)}%`}
    :{name:'Momentum Over/Under',risk:'MÉDIO',contract:'UNDER',barrier:5,hit:Math.round(under5*100),reason:`Abaixo de 5: ${Math.round(under5*100)}%`};
  return {name:'Padrão IA Matches',risk:'ALTO',contract:'MATCH',barrier:top.i,hit:Math.round(top.n/total*100),reason:`Dígito ${top.i}: ${Math.round(top.n/total*100)}%`};
}

function playTone(kind:'win'|'loss'|'target'){
  try{
    const AudioCtx=window.AudioContext||(window as any).webkitAudioContext;
    const ctx=new AudioCtx();
    const now=ctx.currentTime;
    const notes=kind==='target'?[660,880,1046]:kind==='win'?[660,880]:[220,165];
    notes.forEach((freq,i)=>{
      const osc=ctx.createOscillator(); const gain=ctx.createGain();
      osc.type=kind==='loss'?'sawtooth':'sine'; osc.frequency.value=freq;
      gain.gain.setValueAtTime(0.0001,now+i*.11);
      gain.gain.exponentialRampToValueAtTime(kind==='target'?0.18:0.12,now+i*.11+.025);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+i*.11+.16);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(now+i*.11); osc.stop(now+i*.11+.18);
    });
    window.setTimeout(()=>ctx.close().catch(()=>{}),600);
  }catch{}
}

export default function AutoBot(){
  const [accountType,setAccountType]=useState<'demo'|'real'>('demo');
  const {balance,tick,proposal,buy,buying,getProposal,subscribeTicks,isAuthorized,isConnected,error,profitTransactions}=useDeriv(accountType);
  const [symbol,setSymbol]=useState('R_100');
  const [stake,setStake]=useState(1.5);
  const [running,setRunning]=useState(false);
  const [martingale,setMartingale]=useState(false);
  const [soros,setSoros]=useState(false);
  const [sorosLevel,setSorosLevel]=useState(3);
  const [sorosStep,setSorosStep]=useState(1);
  const [sorosProfit,setSorosProfit]=useState(0);
  const [stopAfterLosses,setStopAfterLosses]=useState(true);
  const [lossLimit,setLossLimit]=useState(30);
  const [target,setTarget]=useState(50);
  const [startedAt,setStartedAt]=useState<number|null>(null);
  const [ticks,setTicks]=useState<number[]>([]);
  const [strategy,setStrategy]=useState<Strategy|null>(null);
  const [lastAction,setLastAction]=useState('Aguardando dados suficientes');
  const [lossStreak,setLossStreak]=useState(0);
  const [sessionPnl,setSessionPnl]=useState(0);
  const [lastClosed,setLastClosed]=useState<number|null>(null);
  const [targetPopup,setTargetPopup]=useState(false);
  const [targetAmount,setTargetAmount]=useState(0);
  const lastTickRef=useRef<number|null>(null);
  const lastTradeRef=useRef<number|null>(null);
  const stakeRef=useRef(stake);
  const sorosLevelRef=useRef(0);

  useEffect(()=>{stakeRef.current=stake},[stake]);
  useEffect(()=>{if(isConnected)subscribeTicks(symbol)},[isConnected,symbol,subscribeTicks]);
  useEffect(()=>{if(!tick?.epoch||lastTickRef.current===tick.epoch)return;lastTickRef.current=tick.epoch;setTicks(prev=>[...prev.slice(-99),tick.quote])},[tick]);

  const sessionProfit=useMemo(()=>{
    if(!startedAt)return 0;
    return profitTransactions.filter(tx=>Number(tx.purchase_time)>=startedAt).reduce((s,tx)=>s+Number(tx.profit_loss??0),0);
  },[profitTransactions,startedAt]);

  useEffect(()=>setSessionPnl(sessionProfit),[sessionProfit]);

  useEffect(()=>{
    if(!running)return;
    if(sessionProfit>=target){
      setRunning(false); setLastAction(`🎯 Meta atingida: +${sessionProfit.toFixed(2)} USD`);
      setTargetAmount(sessionProfit); setTargetPopup(true); playTone('target');
      return;
    }
    if(sessionProfit<=-lossLimit){setRunning(false);setLastAction(`Stop loss atingido: ${sessionProfit.toFixed(2)} USD`);playTone('loss')}
  },[sessionProfit,target,lossLimit,running]);

  useEffect(()=>{
    if(!isAuthorized||!isConnected||buying||profitTransactions.length===0)return;
    const tx=profitTransactions[0];
    if(tx.contract_id===lastClosed)return;
    const txTime=Number(tx.purchase_time||0);
    if(startedAt&&txTime<startedAt)return;
    setLastClosed(tx.contract_id);
    const pnl=Number(tx.profit_loss??0);
    const projected=sessionPnl+pnl;
    if(pnl<0){
      setLossStreak(s=>s+1); setSorosProfit(0); sorosLevelRef.current=0;
      if(martingale)stakeRef.current=Math.min(stakeRef.current*2,Math.max(stake,lossLimit));
      playTone('loss');
    }else if(pnl>0){
      setLossStreak(0); playTone('win');
      if(soros){
        const nextLevel=sorosLevelRef.current+1;
        if(nextLevel<=sorosLevel){sorosLevelRef.current=nextLevel;setSorosProfit(p=>p+pnl);stakeRef.current=Math.max(MIN_STAKE,stakeRef.current+pnl*sorosStep)}
        else {sorosLevelRef.current=0;setSorosProfit(0);stakeRef.current=stake}
      }else stakeRef.current=stake;
    }
    if(running&&projected>=target){
      setSessionPnl(projected);setRunning(false);setLastAction(`🎯 Meta atingida: +${projected.toFixed(2)} USD`);setTargetAmount(projected);setTargetPopup(true);playTone('target');
    }else if(running&&projected<=-lossLimit){setSessionPnl(projected);setRunning(false);setLastAction(`Stop loss atingido: ${projected.toFixed(2)} USD`);playTone('loss')}
  },[profitTransactions,isAuthorized,isConnected,buying,lastClosed,startedAt,martingale,stake,lossLimit,running,sessionPnl,target,soros,sorosLevel,sorosStep]);

  useEffect(()=>{
    if(!running||!isAuthorized||!isConnected||buying||proposal)return;
    const next=strategyFromTicks(ticks); if(next)setStrategy(next);
    if(!next){setLastAction('Aguardando pelo menos 20 ticks');return}
    if(sessionPnl>=target||sessionPnl<=-lossLimit){setRunning(false);return}
    if(stopAfterLosses&&lossStreak>=3){setRunning(false);setLastAction('Robô parado após 3 perdas seguidas');return}
    getProposal(symbol,CONTRACT_TYPES[next.contract],Math.max(MIN_STAKE,stakeRef.current),1,next.barrier);
  },[running,isAuthorized,isConnected,buying,proposal,ticks,lossStreak,stopAfterLosses,symbol,getProposal,sessionPnl,target,lossLimit]);

  useEffect(()=>{
    if(!running||!proposal||buying||lastTradeRef.current===-1)return;
    const next=strategy||strategyFromTicks(ticks); if(!next)return;
    lastTradeRef.current=-1; setLastAction(`${next.name}: ${next.reason}`); buy(proposal.id,proposal.ask_price);
  },[proposal,running,buying,strategy,ticks,buy]);

  useEffect(()=>{if(!running)return;const active=profitTransactions[0];if(active&&active.contract_id===lastClosed&&lastTradeRef.current===-1)lastTradeRef.current=active.contract_id},[profitTransactions,running,lastClosed]);

  const start=()=>{
    if(!isAuthorized||!isConnected)return;
    setStartedAt(Math.floor(Date.now()/1000));setSessionPnl(0);setLossStreak(0);setLastClosed(null);setTargetPopup(false);lastTradeRef.current=null;stakeRef.current=stake;sorosLevelRef.current=0;setSorosProfit(0);setRunning(true);setLastAction('Robô iniciado — analisando mercado');
  };
  const stop=()=>{setRunning(false);setLastAction('Robô parado pelo utilizador')};
  const pnlMzn=sessionPnl*USD_TO_MZN;
  const balanceMzn=balance?Number(balance.balance)*USD_TO_MZN:0;
  const history=profitTransactions.slice(0,12);

  return <div className="auto-bot">
    {targetPopup&&<div className="target-popup" role="alert"><div className="target-icon">✓</div><div><strong>Meta atingida</strong><span>Atingiu sua meta de +{targetAmount.toFixed(2)} USD</span></div><button onClick={()=>setTargetPopup(false)}>×</button></div>}
    <div className="auto-status-card">
      <div className="luxury-bot-icon"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43"/><path d="M28 65V47M43 65V35M58 65V51M73 65V28"/><path d="M24 72H77"/></svg></div>
      <div className="auto-status-row"><div><div className="auto-label">ESTADO DO ROBÔ</div><div className={`auto-status ${running?'on':'off'}`}>{running?'Em execução':'Parado'}</div></div><button className={`auto-switch ${running?'on':''}`} onClick={running?stop:start}><span /></button></div>
      <div className="auto-sub">{isConnected?'Ligado à Deriv':'A ligar à Deriv'} · {accountType==='real'?'Conta Real':'Conta Demo'}</div>
    </div>

    <div className="auto-metrics"><div><b>{ticks.length}/100</b><span>Ticks</span></div><div><b>{strategy?.hit?`${strategy.hit}%`:'—'}</b><span>Confiança</span></div><div><b className={sessionPnl>=0?'up':'down'}>{sessionPnl>=0?'+':''}{pnlMzn.toFixed(0)} MT</b><span>Resultado</span></div><div><b>{lossStreak} L</b><span>Sequência</span></div></div>

    <div className="auto-section-title">Estratégia <small>automática</small></div>
    <div className="auto-strategy"><div><strong>{strategy?.name||'Análise automática'}</strong><span>{strategy?.reason||'O robô analisa os últimos 100 ticks disponíveis.'}</span></div><em className={strategy?.risk==='ALTO'?'high':strategy?.risk==='MÉDIO'?'mid':''}>{strategy?.risk||'AGUARDAR'}</em></div>

    <div className="auto-section-title">Gestão de risco</div>
    <div className="auto-risk">
      <label>Aposta por operação <input type="number" min={MIN_STAKE} step="0.1" value={stake} onChange={e=>setStake(Math.max(MIN_STAKE,Number(e.target.value)||MIN_STAKE))}/> USD</label>
      <label>Stop loss diário <input type="number" min="1" step="1" value={lossLimit} onChange={e=>setLossLimit(Math.max(1,Number(e.target.value)||30))}/> USD</label>
      <label>Meta de lucro diária <input type="number" min="1" step="1" value={target} onChange={e=>setTarget(Math.max(1,Number(e.target.value)||50))}/> USD</label>
      <div className="auto-option"><span>Martingale após perda<small>Duplica a próxima aposta</small></span><button className={`mini-switch ${martingale?'on':''}`} onClick={()=>setMartingale(v=>!v)}><i /></button></div>
      <div className="auto-option"><span>Soros após ganho<small>Reinveste o lucro na próxima operação</small></span><button className={`mini-switch ${soros?'on':''}`} onClick={()=>setSoros(v=>!v)}><i /></button></div>
      {soros&&<div className="soros-row"><label>Níveis <select value={sorosLevel} onChange={e=>setSorosLevel(Number(e.target.value))}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="5">5</option></select></label><span>Lucro Soros: +{(sorosProfit*USD_TO_MZN).toFixed(0)} MT</span></div>}
      <div className="auto-option"><span>Parar após 3 perdas<small>Proteção da sessão</small></span><button className={`mini-switch ${stopAfterLosses?'on':''}`} onClick={()=>setStopAfterLosses(v=>!v)}><i /></button></div>
    </div>

    <div className="auto-controls"><label>Tipo de conta<select value={accountType} onChange={e=>setAccountType(e.target.value as 'demo'|'real')}><option value="demo">Demo</option><option value="real">Real</option></select></label><label>Symbol<select value={symbol} onChange={e=>setSymbol(e.target.value)}>{Object.entries(SYMBOLS).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></div>

    <div className="auto-section-title activity-title">Registo de actividade <small>{history.length} operações</small></div>
    <div className="profit-table"><div className="profit-head"><span>Resultado</span><span>Contrato</span><span>Hora</span></div>{history.length?history.map(tx=>{const p=Number(tx.profit_loss??0);return <div className="profit-row" key={tx.contract_id}><strong className={p>=0?'up':'down'}>{p>=0?'+':''}{(p*USD_TO_MZN).toFixed(0)} MT</strong><span>{tx.contract_type.replace('DIGIT','')}</span><span>{new Date(Number(tx.sell_time??tx.purchase_time)*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span></div>}):<div className="profit-empty">Ainda não há operações fechadas nesta sessão.</div>}</div>

    <div className="auto-log"><span className="live-dot" />{lastAction}</div>
    {error&&<div className="auto-error">⚠ {error}</div>}
    <button className={`auto-cta ${running?'stop':''}`} onClick={running?stop:start}>{running?'■ Parar robô':'▶ Iniciar robô'}</button>
    <div className="auto-note">Saldo: {balanceMzn.toFixed(2)} MT · Resultado: {pnlMzn.toFixed(2)} MT</div>
  </div>;
}
