'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';

type Contract = 'EVEN' | 'ODD' | 'OVER' | 'UNDER';
const CONTRACT_TYPES: Record<Contract,string> = { EVEN:'DIGITEVEN', ODD:'DIGITODD', OVER:'DIGITOVER', UNDER:'DIGITUNDER' };
const SYMBOLS: Record<string,string> = {
  '1HZ100V':'Volatility 100 (1s) Index', R_100:'Volatility 100 Index', R_50:'Volatility 50 Index',
  R_75:'Volatility 75 Index', '1HZ50V':'Volatility 50 (1s) Index'
};
const USD_TO_MZN = 68;
const INITIAL_STAKE_USD = 1.00;
const SOROS_STAKE_USD = 1.95;
const MG1_USD = 2.00;
const MG2_USD = 4.10;
const MG3_USD = 8.40;

type Signal = { name:string; contract:Contract; barrier:number; pct100:number; pct20:number; hit:number; reason:string };

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
let audioCtx: AudioContext|null = null;
let audioMaster: GainNode|null = null;
function playTone(kind:'win'|'loss'|'target'){
  try{
    const AC=window.AudioContext||(window as AudioWindow).webkitAudioContext; if(!AC)return;
    if(!audioCtx) audioCtx=new AC();
    if(audioCtx.state==='suspended') void audioCtx.resume();
    if(!audioMaster){audioMaster=audioCtx.createGain();audioMaster.gain.value=0.9;audioMaster.connect(audioCtx.destination)}
    const notes=kind==='target'?[523,659,784,1047]:kind==='win'?[659,784,988]:[247,196,147];
    const now=audioCtx.currentTime;
    notes.forEach((freq,i)=>{const o=audioCtx!.createOscillator();const g=audioCtx!.createGain();o.type=kind==='loss'?'triangle':'sine';o.frequency.value=freq;const t=now+i*.09;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(kind==='target'?.34:.25,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+.14);o.connect(g);g.connect(audioMaster!);o.start(t);o.stop(t+.16)});
  }catch{}
}

function digit(value:number|string|undefined|null){
  if(value===undefined||value===null)return null;
  const s=String(value).replace(/\D/g,''); return s?Number(s.slice(-1)):null;
}
function pctFor(ticks:number[], predicate:(d:number)=>boolean){
  const valid=ticks.map(digit).filter((d):d is number=>d!==null); if(!valid.length)return 0;
  return valid.filter(predicate).length/valid.length*100;
}
function buildSignal(ticks:number[]):Signal|null{
  if(ticks.length<20)return null;
  const w100=ticks.slice(-100), w20=ticks.slice(-20);
  const even100=pctFor(w100,d=>d%2===0), even20=pctFor(w20,d=>d%2===0);
  const over100=pctFor(w100,d=>d>4), over20=pctFor(w20,d=>d>4);
  const evenDir=even100>=50?'EVEN':'ODD';
  const microEvenDir=even20>=50?'EVEN':'ODD';
  const overDir=over100>=50?'OVER':'UNDER';
  const microOverDir=over20>=50?'OVER':'UNDER';
  if(evenDir===microEvenDir && Math.max(even100,100-even100)>=55 && Math.max(even20,100-even20)>=55){
    const hit=Math.round((evenDir==='EVEN'?Math.min(even100,even20):Math.min(100-even100,100-even20)));
    return {name:'Cruzamento de Médias de Ticks — Par/Ímpar',contract:evenDir,pct100:Math.round(evenDir==='EVEN'?even100:100-even100),pct20:Math.round(evenDir==='EVEN'?even20:100-even20),hit,barrier:0,reason:`100 ticks ${Math.round(evenDir==='EVEN'?even100:100-even100)}% · 20 ticks ${Math.round(evenDir==='EVEN'?even20:100-even20)}%`};
  }
  if(overDir===microOverDir && Math.max(over100,100-over100)>=55 && Math.max(over20,100-over20)>=55){
    const hit=Math.round(overDir==='OVER'?Math.min(over100,over20):Math.min(100-over100,100-over20));
    return {name:'Cruzamento de Médias de Ticks — Over/Under',contract:overDir,pct100:Math.round(overDir==='OVER'?over100:100-over100),pct20:Math.round(overDir==='OVER'?over20:100-over20),hit,barrier:overDir==='OVER'?4:5,reason:`100 ticks ${Math.round(overDir==='OVER'?over100:100-over100)}% · 20 ticks ${Math.round(overDir==='OVER'?over20:100-over20)}%`};
  }
  return null;
}

export default function AutoBot(){
  const [accountType,setAccountType]=useState<'demo'|'real'>('demo');
  const {balance,tick,proposal,buy,buying,getProposal,subscribeTicks,isAuthorized,isConnected,error,profitTransactions}=useDeriv(accountType);
  const [symbol,setSymbol]=useState('1HZ100V');
  const [running,setRunning]=useState(false);
  const [ticks,setTicks]=useState<number[]>([]);
  const [signal,setSignal]=useState<Signal|null>(null);
  const [lossLimitMzn,setLossLimitMzn]=useState(2040);
  const [targetMzn,setTargetMzn]=useState(3400);
  const [sessionPnl,setSessionPnl]=useState(0);
  const [startedAt,setStartedAt]=useState<number|null>(null);
  const [lossStreak,setLossStreak]=useState(0);
  const [phase,setPhase]=useState<'INITIAL'|'SOROS'|'MG1'|'MG2'|'MG3'|'STOP'>('INITIAL');
  const [targetPopup,setTargetPopup]=useState(false);
  const [targetAmount,setTargetAmount]=useState(0);
  const [activity,setActivity]=useState<string[]>([]);
  const lastTick=useRef<number|null>(null);
  const lastContract=useRef<number|null>(null);
  const lastRequested=useRef(false);

  const targetUsd=targetMzn/USD_TO_MZN;
  const lossLimitUsd=lossLimitMzn/USD_TO_MZN;
  const stakeUsd=phase==='SOROS'?SOROS_STAKE_USD:phase==='MG1'?MG1_USD:phase==='MG2'?MG2_USD:phase==='MG3'?MG3_USD:INITIAL_STAKE_USD;

  useEffect(()=>{if(isConnected)subscribeTicks(symbol)},[isConnected,symbol,subscribeTicks]);
  useEffect(()=>{if(!tick?.epoch||lastTick.current===tick.epoch)return;lastTick.current=tick.epoch;setTicks(v=>[...v.slice(-99),Number(tick.quote)])},[tick]);
  useEffect(()=>{const s=buildSignal(ticks);setSignal(s)},[ticks]);

  const sessionProfit=useMemo(()=>{
    if(!startedAt)return 0;
    return profitTransactions.filter(tx=>Number(tx.purchase_time)>=startedAt).reduce((sum,tx)=>sum+Number(tx.profit_loss??0),0);
  },[profitTransactions,startedAt]);
  useEffect(()=>setSessionPnl(sessionProfit),[sessionProfit]);

  const addActivity=(text:string)=>setActivity(v=>[`${new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · ${text}`,...v].slice(0,12));

  useEffect(()=>{
    if(!isAuthorized||!isConnected||buying||!profitTransactions.length)return;
    const tx=profitTransactions[0]; if(tx.contract_id===lastContract.current)return;
    if(startedAt&&Number(tx.purchase_time)<startedAt)return;
    lastContract.current=tx.contract_id;
    const pnl=Number(tx.profit_loss??0);
    if(pnl>=0){
      setLossStreak(0); playTone('win'); addActivity(`WIN +${(pnl*USD_TO_MZN).toFixed(0)} MT`);
      if(phase==='INITIAL') setPhase('SOROS'); else if(phase==='SOROS') setPhase('INITIAL'); else setPhase('INITIAL');
    }else{
      const nextLoss=lossStreak+1; setLossStreak(nextLoss); playTone('loss'); addActivity(`LOSS ${(pnl*USD_TO_MZN).toFixed(0)} MT`);
      if(phase==='INITIAL'||phase==='SOROS') setPhase('MG1');
      else if(phase==='MG1') setPhase('MG2');
      else if(phase==='MG2') setPhase('MG3');
      else if(phase==='MG3'){setPhase('STOP');setRunning(false);addActivity('STOP LOSS — 3 recuperações perdidas')}
    }
  },[profitTransactions,isAuthorized,isConnected,buying,startedAt,phase,lossStreak]);

  useEffect(()=>{
    if(!running)return;
    if(sessionProfit>=targetUsd){setRunning(false);setTargetAmount(sessionProfit);setTargetPopup(true);addActivity(`META ATINGIDA +${(sessionProfit*USD_TO_MZN).toFixed(0)} MT`);playTone('target');return}
    if(sessionProfit<=-lossLimitUsd){setRunning(false);setPhase('STOP');addActivity(`STOP LOSS ${(sessionProfit*USD_TO_MZN).toFixed(0)} MT`);playTone('loss')}
  },[running,sessionProfit,targetUsd,lossLimitUsd]);

  useEffect(()=>{
    if(!running||!isAuthorized||!isConnected||buying||proposal||!signal||lastRequested.current)return;
    lastRequested.current=true;
    addActivity(`Sinal: ${signal.contract==='EVEN'?'PAR':signal.contract==='ODD'?'ÍMPAR':signal.contract==='OVER'?'ACIMA':'ABAIXO'} · 100T ${signal.pct100}% / 20T ${signal.pct20}%`);
    getProposal(symbol,CONTRACT_TYPES[signal.contract],stakeUsd,1,signal.barrier);
  },[running,isAuthorized,isConnected,buying,proposal,signal,symbol,getProposal,stakeUsd]);

  useEffect(()=>{
    if(!running||!proposal||buying)return;
    buy(proposal.id,proposal.ask_price); lastRequested.current=false;
  },[proposal,running,buying,buy]);
  useEffect(()=>{if(!proposal)lastRequested.current=false},[proposal]);

  const start=()=>{
    if(!isAuthorized||!isConnected)return;
    setStartedAt(Math.floor(Date.now()/1000));setSessionPnl(0);setLossStreak(0);setPhase('INITIAL');setTargetPopup(false);setRunning(true);lastContract.current=null;lastRequested.current=false;setActivity([]);addActivity('Robô iniciado — filtro 100T + 20T');
  };
  const stop=()=>{setRunning(false);addActivity('Robô parado pelo utilizador')};
  const balanceMzn=balance?Number(balance.balance)*USD_TO_MZN:0;
  const phaseLabel={INITIAL:'Soros Nível 1 — $1.00',SOROS:'Soros Nível 2 — $1.95',MG1:'Martingale 1 — $2.00',MG2:'Martingale 2 — $4.10',MG3:'Martingale 3 — $8.40',STOP:'STOP LOSS'}[phase];
  const history=profitTransactions.slice(0,10);

  return <div className="auto-bot">
    {targetPopup&&<div className="target-popup" role="alert"><div className="target-icon">✓</div><div><strong>Meta atingida</strong><span>Atingiu sua meta de +{targetAmount.toFixed(2)} USD · +{(targetAmount*USD_TO_MZN).toFixed(0)} MT</span></div><button onClick={()=>setTargetPopup(false)}>×</button></div>}
    <div className="auto-status-card">
      <div className="luxury-bot-icon"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="43"/><path d="M25 66V48M40 66V36M55 66V51M70 66V27"/><path d="M21 73H75"/></svg></div>
      <div className="auto-status-row"><div><div className="auto-label">ESTADO DO ROBÔ</div><div className={`auto-status ${running?'on':'off'}`}>{running?'Em execução':'Parado'}</div></div><button className={`auto-switch ${running?'on':''}`} onClick={running?stop:start}><span/></button></div>
      <div className="auto-sub">{isConnected?'Ligado à Deriv':'A ligar à Deriv'} · {accountType==='real'?'Conta Real':'Conta Demo'} · Saldo {balanceMzn.toFixed(0)} MT</div>
    </div>

    <div className="auto-metrics"><div><b>{ticks.length}/100</b><span>Ticks</span></div><div><b>{signal?`${signal.hit}%`:'—'}</b><span>Confiança</span></div><div><b className={sessionPnl>=0?'up':'down'}>{sessionPnl>=0?'+':''}{(sessionPnl*USD_TO_MZN).toFixed(0)} MT</b><span>Resultado</span></div><div><b>{lossStreak} L</b><span>Perdas</span></div></div>

    <div className="auto-section-title">Estratégia <small>micro-tendência</small></div>
    <div className="auto-strategy"><div><strong>{signal?.name||'Aguardando concordância'}</strong><span>{signal?.reason||'O robô só entra quando os últimos 100 ticks e 20 ticks apontam na mesma direção.'}</span></div><em>{signal?'SINAL':'AGUARDAR'}</em></div>
    <div className="microtrend-card"><div><span>100 TICKS</span><b>{signal?`${signal.pct100}%`:'—'}</b></div><div className="micro-arrow">↔</div><div><span>20 TICKS</span><b>{signal?`${signal.pct20}%`:'—'}</b></div></div>

    <div className="auto-section-title">Registo de actividades <small>ao vivo</small></div>
    <div className="auto-log activity-log">{activity.length?activity.map((x,i)=><div key={i}>{x}</div>):<div>Aguardando atividade do robô…</div>}</div>

    <div className="auto-section-title">Gestão de risco <small>em MT</small></div>
    <div className="auto-risk">
      <label>Stop loss diário <input type="number" min="68" step="68" value={lossLimitMzn} onChange={e=>setLossLimitMzn(Math.max(68,Number(e.target.value)||2040))}/> MT</label>
      <label>Meta diária <input type="number" min="68" step="68" value={targetMzn} onChange={e=>setTargetMzn(Math.max(68,Number(e.target.value)||3400))}/> MT</label>
    </div>

    <div className="risk-sequence"><div className="risk-seq-title">Plano Soros + Martingale</div>
      <div className="risk-seq-row"><b>Soros Nível 1</b><span>$1.00</span><small>Win → $1.95 · Loss → MG1</small></div>
      <div className="risk-seq-row"><b>Soros Nível 2</b><span>$1.95</span><small>Win → reseta $1.00 · Loss → MG1</small></div>
      <div className="risk-seq-row"><b>Martingale 1</b><span>$2.00</span><small>Win → reseta · Loss → MG2</small></div>
      <div className="risk-seq-row"><b>Martingale 2</b><span>$4.10</span><small>Win → reseta · Loss → MG3</small></div>
      <div className="risk-seq-row"><b>Martingale 3</b><span>$8.40</span><small>Última recuperação → STOP</small></div>
      <div className="risk-current">Fase atual: <strong>{phaseLabel}</strong> · Entrada <strong>${stakeUsd.toFixed(2)}</strong></div>
    </div>

    <div className="auto-section-title">Profit table <small>histórico</small></div>
    <div className="profit-table"><div className="profit-head"><span>Hora</span><span>Resultado</span><span>MT</span></div>{history.length?history.map((tx:any,i:number)=>{const p=Number(tx.profit_loss??0);return <div className="profit-row" key={tx.contract_id||i}><span>{new Date(Number(tx.purchase_time||0)*1000).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</span><span>{p>=0?'WIN':'LOSS'}</span><strong className={p>=0?'up':'down'}>{p>=0?'+':''}{(p*USD_TO_MZN).toFixed(0)}</strong></div>}):<div className="profit-empty">Sem operações nesta sessão.</div>}</div>

    <div className="auto-controls"><label>Tipo de conta<select value={accountType} onChange={e=>setAccountType(e.target.value as 'demo'|'real')}><option value="demo">Demo</option><option value="real">Real</option></select></label><label>Symbol<select value={symbol} onChange={e=>setSymbol(e.target.value)}>{Object.entries(SYMBOLS).map(([v,n])=><option key={v} value={v}>{n}</option>)}</select></label></div>
    {error&&<div className="auto-error">{error}</div>}
    <button className={`auto-cta ${running?'stop':''}`} onClick={running?stop:start}>{running?'Parar robô':'Iniciar robô'}</button>
    <div className="auto-note">Matches e Differs não são utilizados. Entrada apenas com concordância 100T + 20T.</div>
  </div>;
}
