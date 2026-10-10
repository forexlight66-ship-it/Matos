'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';
import { criarGestorStake } from '@/lib/gestorStakeSorosMartingaleDinamico';
import { createSonicStakeManager } from '@/lib/sonicStakeManager';
import { isRecoveryStrategy, initialBarrierState, nextBarrierState, type BarrierState } from '@/lib/hyperRecoveryStrategies';
import { FALLBACK_RATES, getCountryCurrency, getCurrencyMeta } from '@/lib/country-currency';
import PaymentAgentCashier from '@/components/PaymentAgentCashier';
import { isPaymentAgentCurrencyAllowed } from '@/lib/paymentAgent';

type Contract='EVEN'|'ODD'|'OVER'|'UNDER'|'RISE'|'FALL'|'DIFFER'|'MATCH0';
type Strategy='PAR_IMPAR'|'ACIMA5_BAIXO4'|'RISE_FALL'|'DIFERENTE'|'MATCH0'|'HYPERLITE'|'HYPERGUARD'|'HYPERSHIELD'|'HYPERBREAK'|'HYPERSWAP'|'HYPERCOVER';
const MT=64;
type Currency=string;
const CURRENCY_RATES:Record<string,number>={...FALLBACK_RATES};
const CURRENCY_LABELS:Record<string,string>=Object.fromEntries(Object.keys(CURRENCY_RATES).map(c=>[c,getCurrencyMeta(c).symbol]));
const normalizeCurrency=(value:unknown,fallback:Currency='USD'):Currency=>{const c=String(value??'').trim().toUpperCase();return c in CURRENCY_RATES?c as Currency:fallback};
const IA_PAYOUT=0.95;
const IA_MAX_MARTINGALE=11;
const IA_RISK_STAKE=0.75;
const IA_MIN_STAKE=0.35;
const SYMBOLS:Record<string,string>={R_10:'Volatility 10 Index',R_25:'Volatility 25 Index',R_50:'Volatility 50 Index',R_75:'Volatility 75 Index',R_100:'Volatility 100 Index','1HZ10V':'Volatility 10 (1s)','1HZ25V':'Volatility 25 (1s)','1HZ50V':'Volatility 50 (1s)','1HZ75V':'Volatility 75 (1s)','1HZ100V':'Volatility 100 (1s)'};
const TYPES:Record<Contract,string>={EVEN:'DIGITEVEN',ODD:'DIGITODD',OVER:'DIGITOVER',UNDER:'DIGITUNDER',RISE:'CALL',FALL:'PUT',DIFFER:'DIGITDIFF',MATCH0:'DIGITMATCH'};
const decimalPlaces=(pipSize:number)=>{if(!Number.isFinite(pipSize)||pipSize<=0)return 0;return Math.max(0,Math.min(10,Math.round(-Math.log10(pipSize))))};
const digit=(v:number|string|null|undefined,pipSize?:number)=>{if(v==null)return null;let s=String(v).trim();if(pipSize&&Number.isFinite(pipSize)&&pipSize>0&&typeof v==='number'){const places=decimalPlaces(pipSize);s=v.toFixed(places)}const chars=s.match(/\d/g);return chars?.length?Number(chars[chars.length-1]):null};
function stats(v:number[],pipSize?:number){const d=v.map(x=>digit(x,pipSize)).filter((x):x is number=>x!==null),n=d.length||1,even=d.filter(x=>x%2===0).length/n*100,above5=d.filter(x=>x>5).length/n*100,below4=d.filter(x=>x<4).length/n*100,diff=d.filter(x=>x!==0).length/n*100,match0=d.filter(x=>x===0).length/n*100;let up=0,down=0;for(let i=1;i<v.length;i++){if(v[i]>v[i-1])up++;else if(v[i]<v[i-1])down++}const m=Math.max(1,up+down);return{even,odd:100-even,above5,below4,diff,match0,rise:up/m*100,fall:down/m*100,probs:Array.from({length:10},(_,x)=>d.filter(y=>y===x).length/n*100)}}
function signalQuality(v:number[],s:string,label?:string,pipSize?:number){
  const d=v.map(x=>digit(x,pipSize)).filter((x):x is number=>x!==null);
  const r=d.slice(-5);
  if(r.length<5)return {allowed:false,penalty:0,reason:'a aguardar 5 ticks completos'};
  let penalty=0;
  const reasons:string[]=[];
  const count=(fn:(n:number)=>boolean)=>r.filter(fn).length;
  const add=(points:number,reason:string)=>{
    penalty=Math.min(60,penalty+points);
    if(!reasons.includes(reason))reasons.push(reason);
  };
  const concentrated=(n:number)=>count(x=>x===n);

  if(s==='ACIMA5_BAIXO4'&&label==='ABAIXO 4'){
    const threes=concentrated(3);
    const lower=count(n=>n>=0&&n<=2);
    const upperDanger=count(n=>n===8||n===9);
    if(upperDanger>0)add(30,'8/9 apareceu no bloco recente');
    if(threes>=3)add(30,'3 excessivamente concentrado');
    else if(threes>=2&&lower===0)add(30,'3 repetido sem aparecer 0–2');
    else if(threes>=2)add(15,'concentração no 3');
  }else if(s==='ACIMA5_BAIXO4'&&label==='ACIMA 5'){
    const sixes=concentrated(6);
    const higher=count(n=>n>=7&&n<=9);
    const lowerDanger=count(n=>n===0||n===4||n===5);
    if(lowerDanger>0)add(30,'0/4/5 apareceu no bloco recente');
    if(sixes>=3)add(30,'6 excessivamente concentrado');
    else if(sixes>=2&&higher===0)add(30,'6 repetido sem aparecer 7–9');
    else if(sixes>=2)add(15,'concentração no 6');
  }else if(s==='PAR_IMPAR'||s==='HYPERLITE'){
    const maxCount=Math.max(...Array.from({length:10},(_,n)=>concentrated(n)));
    if(maxCount>=4)add(30,'um dígito domina 4/5 ticks');
    else if(maxCount>=3)add(15,'concentração elevada num único dígito');
  }else if(s==='DIFERENTE'||s==='HYPERSWAP'){
    const zeros=concentrated(0);
    if(zeros>=3)add(30,'0 excessivamente concentrado contra DIFERENTE');
    else if(zeros>=2)add(15,'concentração no 0');
  }else if(s==='HYPERGUARD'){
    const ones=concentrated(1);
    if(ones>=3)add(30,'1 excessivamente concentrado');
    else if(ones>=2)add(15,'concentração no 1');
  }else if(s==='HYPERSHIELD'){
    const fives=concentrated(5);
    const blockedDigits=count(n=>n===0||n===3||n===4);
    if(blockedDigits>0)add(30,'0/3/4 apareceu no bloco recente — entrada bloqueada');
    if(fives>=3)add(30,'5 excessivamente concentrado');
    else if(fives>=2)add(15,'concentração no 5');
  }else if(s==='HYPERBREAK'){
    const sevens=concentrated(7);
    const blockedDigits=count(n=>n===0||n===8);
    if(blockedDigits>0)add(30,'0/8 apareceu no bloco recente — entrada bloqueada');
    if(sevens>=3)add(30,'7 excessivamente concentrado');
    else if(sevens>=2)add(15,'concentração no 7');
  }else if(s==='RISE_FALL'){
    // Rise/Fall depends on price continuity, not on the last digit going up/down.
    const prices=v.slice(-9).map(Number);
    let up=0,down=0;
    for(let k=1;k<prices.length;k++){
      if(prices[k]>prices[k-1])up++;
      else if(prices[k]<prices[k-1])down++;
    }
    const wanted=label==='SUBIR'?up:down;
    if(wanted<=1)add(30,'movimento sem continuidade; possível movimento isolado');
    else if(wanted===2)add(15,'continuidade fraca do movimento');
  }
  return {allowed:penalty<25,penalty,reason:reasons.join('; ')};
}
function makeExitSpotSignal(values:number[],s:Strategy,pipSize?:number,applyQualityFilter=true){
 // AI Analyst entry confirmation: 28 closed Exit Spots split into four chronological blocks of 7.
 // Exit Spots mode only: use the dedicated 20% trigger and detect an emerging move.
 if(values.length<28)return null;
 const windowValues=values.slice(-28);
 const blocks=Array.from({length:4},(_,i)=>windowValues.slice(i*7,(i+1)*7));
 const overall=makeSignal(windowValues,s,pipSize,false,20);
 const blockSignals=blocks.map(block=>makeSignal(block,s,pipSize,false,20,7));
 const recent=blockSignals[3];
 if(!overall||!recent||overall.contract!==recent.contract)return null;
 if(Number(overall.strength)<20||Number(recent.strength)<20)return null;
 const agreeingBlocks=blockSignals.filter(signal=>signal?.contract===overall.contract).length;
 const priorStrengths=blockSignals.slice(0,3).map(signal=>signal?.contract===overall.contract?Number(signal.strength):0);
 const recentStrength=Number(recent.strength);
 const previousStrength=priorStrengths[2]||0;
 const earlyRise=recentStrength>=20&&recentStrength>previousStrength&&recentStrength>=priorStrengths[0]&&recentStrength>=priorStrengths[1];
 // Required rule: the full window, latest block, and at least 3 of 4 blocks agree.
 if(agreeingBlocks<3)return null;
 const candidate={...recent,strength:Math.min(Number(overall.strength),recentStrength),overallExitSpotStrength:Number(overall.strength),recentExitSpotStrength:recentStrength,exitSpotBlocks:4,agreeingExitSpotBlocks:agreeingBlocks,earlyRise};
 if(!applyQualityFilter)return candidate;
 const quality=signalQuality(windowValues.slice(-7),s,candidate.label,pipSize);
 return quality.allowed?{...candidate,qualityPenalty:quality.penalty}:null;
}
function makeHyperCoverExitSignal(values:number[],pipSize?:number){
 const usable=values.filter(value=>Number.isFinite(Number(value))).slice(-28);
 if(usable.length<9)return null;
 const sample=usable;
 const blocks=sample.length>=28?Array.from({length:4},(_,i)=>sample.slice(i*7,(i+1)*7)):[sample];
 const scoreDirection=(items:number[],kind:'OVER1'|'UNDER8')=>{
  const ds=items.map(value=>digit(value,pipSize)).filter((n):n is number=>n!==null);
  if(!ds.length)return 0;
  return ds.filter(n=>kind==='OVER1'?n>1:n<8).length/ds.length*100;
 };
 const directions=[
  {kind:'OVER1' as const,contract:'OVER' as Contract,contractType:'DIGITOVER' as const,barrier:1,label:'ACIMA 1 — OVER 1',baseline:80},
  {kind:'UNDER8' as const,contract:'UNDER' as Contract,contractType:'DIGITUNDER' as const,barrier:8,label:'ABAIXO 8 — UNDER 8',baseline:80}
 ].map(item=>{
  const overall=scoreDirection(sample,item.kind);
  const blockScores=blocks.map(block=>scoreDirection(block,item.kind));
  const recent=blockScores[blockScores.length-1]??overall;
  const averageEdge=blockScores.reduce((sum,score)=>sum+(score-item.baseline),0)/Math.max(1,blockScores.length);
  const overallEdge=overall-item.baseline;
  const recentEdge=recent-item.baseline;
  const score=Math.max(0,Math.min(100,50+overallEdge*0.35+recentEdge*0.4+averageEdge*0.25));
  const supportiveBlocks=blockScores.filter(value=>value>=item.baseline).length;
  return {...item,overall,recent,blockScores,overallEdge,recentEdge,averageEdge,supportiveBlocks,score,strength:overall};
 }).sort((a,b)=>b.score-a.score||b.recentEdge-a.recentEdge||b.overallEdge-a.overallEdge);
 const best=directions[0],second=directions[1];
 if(!best||!Number.isFinite(best.score))return null;
 return {...best,secondScore:second?.score??0,exitSpotBlocks:blocks.length};
}
function makeSignal(v:number[],s:Strategy,pipSize?:number,applyQualityFilter=true,threshold=65,minSamples=9){
 if(v.length<minSamples)return null;
 const x=stats(v,pipSize),t=threshold;
 // Use a plain string alias to avoid TypeScript narrowing Strategy to MATCH0
 // after the recovery-strategy type guard.
 const strategyName:string=String(s);
 // Signal Quality Filter é exclusivo do AI Analyst. No modo manual, mantém-se
 // a regra base do bot sem os filtros adicionais de concentração/continuidade.
 const pick=(candidate:any)=>{if(!applyQualityFilter)return candidate;const q=signalQuality(v,s,candidate.label,pipSize);return q.allowed?{...candidate,qualityPenalty:q.penalty}:null};
 // Recovery strategies are evaluated against their active barrier by makeBarrierSignal.
 if(strategyName==='HYPERLITE')return x.even>=t?pick({contract:'EVEN' as Contract,label:'PAR',strength:x.even}):null;
 if(strategyName==='PAR_IMPAR'){
  const candidates=[
   {contract:'EVEN' as Contract,label:'PAR',strength:x.even},
   {contract:'ODD' as Contract,label:'ÍMPAR',strength:x.odd}
  ].filter(candidate=>candidate.strength>=t).sort((a,b)=>b.strength-a.strength);
  return candidates.length?pick(candidates[0]):null;
 }
 if(strategyName==='ACIMA5_BAIXO4'){
  const candidates=[
   {contract:'OVER' as Contract,label:'ACIMA 5',strength:x.above5},
   {contract:'UNDER' as Contract,label:'ABAIXO 4',strength:x.below4}
  ].filter(candidate=>candidate.strength>=t).sort((a,b)=>b.strength-a.strength);
  return candidates.length?pick(candidates[0]):null;
 }
 if(strategyName==='RISE_FALL'){
  const candidates=[
   {contract:'RISE' as Contract,label:'SUBIR',strength:x.rise},
   {contract:'FALL' as Contract,label:'DESCER',strength:x.fall}
  ].filter(candidate=>candidate.strength>=t).sort((a,b)=>b.strength-a.strength);
  return candidates.length?pick(candidates[0]):null;
 }
 if(strategyName==='DIFERENTE'||strategyName==='HYPERSWAP')return x.diff>=t?pick({contract:'DIFFER' as Contract,label:'DIFERENTE DE 0',strength:x.diff}):null;
 if(strategyName==='HYPERGUARD')return x.diff>=t?pick({contract:'OVER' as Contract,label:'ACIMA 0',strength:x.diff}):null;
 if(strategyName==='HYPERSHIELD'){
  const above4=x.probs.slice(5).reduce((a,b)=>a+b,0);
  return above4>=t?pick({contract:'OVER' as Contract,label:'ACIMA 4',strength:above4}):null;
 }
 if(strategyName==='HYPERBREAK'){
  const below8=x.probs.slice(0,8).reduce((a,b)=>a+b,0);
  return below8>=t?pick({contract:'UNDER' as Contract,label:'ABAIXO 8',strength:below8}):null;
 }
 if(strategyName==='HYPERCOVER'){
  const ds=v.map(value=>digit(value,pipSize)).filter((n):n is number=>n!==null);
  const candidates=[
   {contract:'OVER' as Contract,label:'ACIMA 1',strength:ds.filter(n=>n>1).length/Math.max(1,ds.length)*100},
   {contract:'UNDER' as Contract,label:'ABAIXO 8',strength:ds.filter(n=>n<8).length/Math.max(1,ds.length)*100}
  ].filter(candidate=>candidate.strength>=t).sort((a,b)=>b.strength-a.strength);
  return candidates.length?pick(candidates[0]):null;
 }
 const zeroIsDominant=x.match0>=t&&x.match0>Math.max(...x.probs.slice(1));
 return zeroIsDominant?pick({contract:'MATCH0' as Contract,label:'MATCH 0',strength:x.match0}):null;
}
const money=(u:number,currency:Currency)=>{const v=u*(CURRENCY_RATES[currency]||1);return `${v>=0?'+':''}${v.toFixed(2)} ${CURRENCY_LABELS[currency]||currency}`};function confirmAnalyzerRecent(values:number[],strategy:string,label:string,pipSize?:number){if(values.length<5)return false;const raw=values.slice(-5);const recent=raw.map(v=>digit(v,pipSize)).filter((n):n is number=>n!==null);if(recent.length<5)return false;if(strategy==='HyperDrive')return label==='ÍMPAR'?recent.filter(n=>n%2!==0).length>=4:recent.filter(n=>n%2===0).length>=4;if(strategy==='HyperStrike')return label==='ACIMA 5'?recent.filter(n=>n>5).length>=4:recent.filter(n=>n<4).length>=4;if(strategy==='HyperForce'){let up=0,down=0;for(let i=1;i<raw.length;i++){if(raw[i]>raw[i-1])up++;else if(raw[i]<raw[i-1])down++}return label==='SUBIR'?up===4:down===4}if(strategy==='HyperNova')return recent.filter(n=>n!==0).length>=4;if(strategy==='Hyperlite')return recent.filter(n=>n%2===0).length>=4;if(strategy==='HyperGuard')return recent.filter(n=>n>0).length>=4;if(strategy==='HyperShield')return recent.filter(n=>n>4).length>=4;if(strategy==='HyperBreak')return recent.filter(n=>n<8).length>=4;if(strategy==='HyperSwap')return recent.filter(n=>n!==0).length>=4;return false}
function makeBarrierSignal(values:number[],state:BarrierState|null|undefined,pipSize?:number,threshold=65,minSamples=9){
 if(!state||values.length<minSamples)return null;
 const sample=values.slice(-minSamples);
 const digits=sample.map(value=>digit(value,pipSize)).filter((value):value is number=>value!==null);
 if(digits.length<minSamples)return null;
 const barrier=Number(state.barrier);
 const hit=(n:number)=>state.contractType==='DIGITOVER'?n>barrier:state.contractType==='DIGITUNDER'?n<barrier:n!==barrier;
 const strength=digits.filter(hit).length/digits.length*100;
 if(strength<threshold)return null;
 const contract:Contract=state.contractType==='DIGITOVER'?'OVER':state.contractType==='DIGITUNDER'?'UNDER':'DIFFER';
 const label=state.contractType==='DIGITOVER'?('ACIMA '+barrier):state.contractType==='DIGITUNDER'?('ABAIXO '+barrier):('DIFERENTE DE '+barrier);
 return {contract,label,strength,barrier,contractType:state.contractType};
}
function confirmBarrierRecent(values:number[],state:BarrierState|null|undefined,pipSize?:number){
 return Boolean(makeBarrierSignal(values,state,pipSize,80,5));
}
function makeExitSpotBarrierSignal(values:number[],state:BarrierState|null|undefined,pipSize?:number){
 if(values.length<28||!state)return null;
 const sample=values.slice(-28);
 const blocks=Array.from({length:4},(_,i)=>sample.slice(i*7,(i+1)*7));
 const overall=makeBarrierSignal(sample,state,pipSize,20,28);
 const blockSignals=blocks.map(block=>makeBarrierSignal(block,state,pipSize,20,7));
 const recent=blockSignals[3];
 if(!overall||!recent)return null;
 const agreeingBlocks=blockSignals.filter(signal=>signal?.contract===overall.contract).length;
 if(agreeingBlocks<3)return null;
 return {...recent,strength:Math.min(Number(overall.strength),Number(recent.strength)),overallExitSpotStrength:Number(overall.strength),recentExitSpotStrength:Number(recent.strength),exitSpotBlocks:4,agreeingExitSpotBlocks:agreeingBlocks};
}
function analyzeExitSpots28(values:number[],pipSize?:number){
 if(values.length<28)return null;
 const bots:{strategy:string;bot:Strategy}[]=[
  {strategy:'HyperDrive',bot:'PAR_IMPAR'},
  {strategy:'HyperStrike',bot:'ACIMA5_BAIXO4'},
  {strategy:'HyperForce',bot:'RISE_FALL'},
  {strategy:'HyperNova',bot:'DIFERENTE'},
  {strategy:'Hyperlite',bot:'HYPERLITE'},
  {strategy:'HyperGuard',bot:'HYPERGUARD'},
  {strategy:'HyperShield',bot:'HYPERSHIELD'},
  {strategy:'HyperBreak',bot:'HYPERBREAK'},
  {strategy:'HyperSwap',bot:'HYPERSWAP'}
 ];
 const candidates:any[]=[];
 for(const item of bots){
  const signal=makeExitSpotSignal(values,item.bot,pipSize,false);
  if(!signal)continue;
  const baseline=item.bot==='ACIMA5_BAIXO4'?40:
   item.bot==='DIFERENTE'||item.bot==='HYPERSWAP'||item.bot==='HYPERGUARD'?90:
   item.bot==='HYPERBREAK'?80:
   item.bot==='HYPERSHIELD'?50:
   item.bot==='RISE_FALL'||item.bot==='PAR_IMPAR'||item.bot==='HYPERLITE'?50:50;
  const overall=Number(signal.overallExitSpotStrength)||Number(signal.strength)||0;
  const recent=Number(signal.recentExitSpotStrength)||Number(signal.strength)||0;
  const agreement=Number(signal.agreeingExitSpotBlocks)||0;
  const edge=overall-baseline;
  const recentEdge=recent-baseline;
  const score=aiClamp(50+edge*0.55+recentEdge*0.85+Math.max(0,agreement-2)*6+(signal.earlyRise?4:0));
  candidates.push({...signal,strategy:item.strategy,score,confidenceBand:confidenceBand(score),noTrade:false,qualityBlocked:false,exitSpotMode:true});
 }
 if(!candidates.length)return null;
 candidates.sort((a,b)=>Number(b.score)-Number(a.score));
 return candidates[0];
}
type AnalyzerCandidate = {
 strategy:string; label:string; contract:Contract; strength:number; confidence:number; stability:number;
 trend:number; acceleration:number; consistency:number; score:number; risk:number; direction:string;
 regimeChange:boolean; recentStrength:number; olderStrength:number; phase:string; earlyMomentum?:boolean; qualityPenalty?:number; qualityBlocked?:boolean; qualityReason?:string;
};
function aiClamp(n:number,min=0,max=100){return Math.max(min,Math.min(max,n))}
function confidenceBand(score:number){if(score>=90)return 'Muito forte';if(score>=80)return 'Forte';if(score>=70)return 'Moderado';if(score>=60)return 'Fraco';return 'Não operar'}
function phaseOf(score:number,recent:number,older:number,trend:number,acceleration:number,consistency:number){
 // A percentage that is still moderate can be an early entry when the signal is clearly accelerating.
 if(trend>=68&&acceleration>=6&&recent>=45&&recent>older+6&&consistency>=40)return 'EMERGENTE';
 if(score>=78&&recent>=70&&trend>=55)return 'FORTE';
 if(score>=68&&recent>=60&&trend>=52)return 'CONFIRMADA';
 if(trend<42||acceleration<=-8)return 'ENFRAQUECENDO';
 if(score>=60&&recent>=older-8)return 'ENFRAQUECENDO';
 return 'FORA DA FASE';
}
function weightedMean(values:number[]){const weights=values.length===3?[0.15,0.25,0.60]:[0.08,0.12,0.15,0.25,0.40];return values.reduce((sum,v,i)=>sum+v*weights[i],0)}
function weightedStability(values:number[],mean:number){
 const weights=values.length===3?[0.15,0.25,0.60]:[0.08,0.12,0.15,0.25,0.40];
 const variance=values.reduce((sum,v,i)=>sum+weights[i]*Math.pow(v-mean,2),0);
 return aiClamp(100-Math.sqrt(variance)*170);
}
function analyzeStrategies100(v:number[],pipSize?:number){
 if(v.length<25)return null;
 const rawPrices=v.slice(-25);
 const all=rawPrices.map(n=>digit(n,pipSize)).filter((n):n is number=>n!==null);
 if(all.length<25)return null;

 const windows=Array.from({length:5},(_,i)=>all.slice(i*5,(i+1)*5));
 const priceWindows=Array.from({length:5},(_,i)=>rawPrices.slice(i*5,(i+1)*5));
 // HyperForce compara os preços reais de exit_spot, não os últimos dígitos.
 const riseFall=priceWindows.map(prices=>{
  let up=0,down=0;
  for(let i=1;i<prices.length;i++){if(prices[i]>prices[i-1])up++;else if(prices[i]<prices[i-1])down++}
  return {up:up/4,down:down/4};
 });
 const digitSeries=(predicate:(n:number)=>boolean)=>windows.map(d=>d.filter(predicate).length/5);
 const inputs=[
  {strategy:'HyperDrive',label:'PAR',contract:'EVEN' as Contract,direction:'PAR',series:digitSeries(n=>n%2===0),base:.5},
  {strategy:'HyperDrive',label:'ÍMPAR',contract:'ODD' as Contract,direction:'ÍMPAR',series:digitSeries(n=>n%2!==0),base:.5},
  {strategy:'HyperStrike',label:'ACIMA 5',contract:'OVER' as Contract,direction:'ACIMA 5',series:digitSeries(n=>n>5),base:.4},
  {strategy:'HyperStrike',label:'ABAIXO 4',contract:'UNDER' as Contract,direction:'ABAIXO 4',series:digitSeries(n=>n<4),base:.4},
  {strategy:'HyperForce',label:'SUBIR',contract:'RISE' as Contract,direction:'SUBIR',series:riseFall.map(x=>x.up),base:.5},
  {strategy:'HyperForce',label:'DESCER',contract:'FALL' as Contract,direction:'DESCER',series:riseFall.map(x=>x.down),base:.5},
  {strategy:'HyperNova',label:'DIFERENTE DE 0',contract:'DIFFER' as Contract,direction:'DIFERENTE DE 0',series:digitSeries(n=>n!==0),base:.9},
  {strategy:'Hyperlite',label:'PAR',contract:'EVEN' as Contract,direction:'PAR',series:digitSeries(n=>n%2===0),base:.5},
  {strategy:'HyperGuard',label:'ACIMA 0',contract:'OVER' as Contract,direction:'ACIMA 0',series:digitSeries(n=>n>0),base:.9},
  {strategy:'HyperShield',label:'ACIMA 4',contract:'OVER' as Contract,direction:'ACIMA 4',series:digitSeries(n=>n>4),base:.5},
  {strategy:'HyperBreak',label:'ABAIXO 8',contract:'UNDER' as Contract,direction:'ABAIXO 8',series:digitSeries(n=>n<8),base:.8},
  {strategy:'HyperSwap',label:'DIFERENTE DE 0',contract:'DIFFER' as Contract,direction:'DIFERENTE DE 0',series:digitSeries(n=>n!==0),base:.9}
 ];
 const candidates:AnalyzerCandidate[]=inputs.map(x=>{
  const weighted=weightedMean(x.series);
  const olderMean=(x.series[0]+x.series[1]+x.series[2]+x.series[3])/4;
  const recent=x.series[4];
  const stability=weightedStability(x.series,weighted);
  const consistency=x.series.filter(n=>n>=x.base).length/5*100;
  const edge=(weighted-x.base)*100;
  const strength=aiClamp(50+edge*1.05);
  const confidence=aiClamp(50+edge*1.30);
  const trend=aiClamp(50+(recent-olderMean)*180);
  const previousRecent=x.series[3];
  const acceleration=aiClamp((recent-previousRecent)*220);
  const phaseScore=(strength+confidence+stability)/3;
  const phase=phaseOf(phaseScore,recent*100,olderMean*100,trend,acceleration,consistency);
  const earlyMomentum=trend>=68&&acceleration>=6&&recent>=45&&recent>olderMean*100+6&&consistency>=40;

  // HyperStrike ABAIXO 4 recebe proteção dinâmica quando o sinal recente perde força.
  // A direção não é removida: ela só perde prioridade enquanto os últimos blocos mostram
  // enfraquecimento, evitando entradas repetidas em uma fase ruim.
  const isHyperStrikeBelow4=x.strategy==='HyperStrike'&&x.label==='ABAIXO 4';
  const weakRecentPenalty=isHyperStrikeBelow4
    ? Math.min(30,
        (recent<0.60?Math.round((0.60-recent)*100):0)*0.45+
        (acceleration<0?Math.min(10,Math.round(Math.abs(acceleration)*0.45)):0)+
        (consistency<40?8:0)+
        (recent<olderMean-0.08?6:0))
    : 0;
  const quality=signalQuality(v.slice(-25),ANALYZER_STRATEGY_TO_BOT[x.strategy]||x.strategy,x.label,pipSize);
  const score=aiClamp(strength*.28+confidence*.24+stability*.18+consistency*.15+trend*.15-Math.max(0,50-stability)*.15+(earlyMomentum?6:0)-weakRecentPenalty-quality.penalty);
  return{
   strategy:x.strategy,label:x.label,contract:x.contract,strength,confidence,stability,trend,acceleration,consistency,score,
   risk:aiClamp(100-stability+weakRecentPenalty+quality.penalty),direction:x.direction,regimeChange:recent-olderMean>=0.20||earlyMomentum,
   recentStrength:recent*100,olderStrength:olderMean*100,phase,earlyMomentum,qualityPenalty:quality.penalty,qualityBlocked:!quality.allowed,qualityReason:quality.reason
  };
 });

 // Choose direction independently inside each bot.
 const byBot=new Map<string,AnalyzerCandidate>();
 for(const candidate of candidates){
  const current=byBot.get(candidate.strategy);
  if(!current||candidate.score>current.score)byBot.set(candidate.strategy,candidate);
 }
 const ranked=[...byBot.values()].sort((a,b)=>b.score-a.score);
 const best=ranked[0],second=ranked[1];
 if(!best)return null;
 const advantage=second?best.score-second.score:100;
 const recentLead=second?best.recentStrength-second.recentStrength:0;
 const regimeChange=Boolean(best.regimeChange)||(recentLead>=18&&best.recentStrength>=75);
 const earlyEntry=best.phase==='EMERGENTE'&&Boolean(best.earlyMomentum)&&best.score>=55&&best.confidence>=52&&best.stability>=35;
 const protectedBelow4=best.strategy==='HyperStrike'&&best.label==='ABAIXO 4'&&best.recentStrength<60&&best.acceleration<0;
 const noTrade=(best.qualityBlocked||(!earlyEntry&&(best.score<65||best.confidence<60||best.stability<45||best.phase==='FORA DA FASE'||protectedBelow4)));
 return{
  ...best,rankings:ranked,secondStrategy:second?.strategy??null,secondScore:second?.score??0,
  advantage,regimeChange,earlyEntry,noTrade,confidenceBand:confidenceBand(best.score)
 };
}
const localDateValue=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};const ANALYZER_COLORS:Record<string,string>={HyperDrive:'#3D7FFF',HyperStrike:'#F5B942',HyperForce:'#8B5CF6',HyperNova:'#FF444F',Hyperlite:'#EC4899',HyperGuard:'#34D399',HyperShield:'#14B8A6',HyperBreak:'#F97316',HyperSwap:'#A855F7',Hypercover:'#0EA5E9'};const ANALYZER_STRATEGY_TO_BOT:Record<string,Strategy>={HyperDrive:'PAR_IMPAR',HyperStrike:'ACIMA5_BAIXO4',HyperForce:'RISE_FALL',HyperNova:'DIFERENTE',Hyperlite:'HYPERLITE',HyperGuard:'HYPERGUARD',HyperShield:'HYPERSHIELD',HyperBreak:'HYPERBREAK',HyperSwap:'HYPERSWAP',Hypercover:'HYPERCOVER'};const STRATEGY_BOT_NAMES:Record<Strategy,string>={PAR_IMPAR:'HyperDrive',ACIMA5_BAIXO4:'HyperStrike',RISE_FALL:'HyperForce',DIFERENTE:'HyperNova',MATCH0:'HyperFlow',HYPERLITE:'Hyperlite',HYPERGUARD:'HyperGuard',HYPERSHIELD:'HyperShield',HYPERBREAK:'HyperBreak',HYPERSWAP:'HyperSwap',HYPERCOVER:'Hypercover'};let lastAnalyzerAlertAt=0;
function analyzerAlertSound(){try{const nowMs=Date.now();if(nowMs-lastAnalyzerAlertAt<1500)return;lastAnalyzerAlertAt=nowMs;const C=window.AudioContext||(window as any).webkitAudioContext,c=new C();if(c.state==='suspended')c.resume();const now=c.currentTime,master=c.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.16,now+.02);master.gain.exponentialRampToValueAtTime(.0001,now+.52);master.connect(c.destination);[880,1174,1568].forEach((freq,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,now+i*.12);g.gain.exponentialRampToValueAtTime(.2,now+i*.12+.02);g.gain.exponentialRampToValueAtTime(.0001,now+i*.12+.17);o.connect(g);g.connect(master);o.start(now+i*.12);o.stop(now+i*.12+.2)});setTimeout(()=>c.close(),750)}catch{}}
function sound(kind:'win'|'loss'|'target'){try{const C=window.AudioContext||(window as any).webkitAudioContext,c=new C();if(c.state==='suspended')c.resume();const now=c.currentTime;if(kind==='win'){const master=c.createGain();master.gain.setValueAtTime(.0001,now);master.gain.exponentialRampToValueAtTime(.16,now+.025);master.gain.exponentialRampToValueAtTime(.0001,now+1.05);master.connect(c.destination);const notes=[659.25,783.99,987.77,1318.51];notes.forEach((freq,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(freq,now+i*.12);o.frequency.exponentialRampToValueAtTime(freq*1.015,now+i*.12+.18);g.gain.setValueAtTime(.0001,now+i*.12);g.gain.exponentialRampToValueAtTime(.22,now+i*.12+.025);g.gain.exponentialRampToValueAtTime(.0001,now+i*.12+.32);o.connect(g);g.connect(master);o.start(now+i*.12);o.stop(now+i*.12+.34)});const sparkle=c.createOscillator(),sg=c.createGain();sparkle.type='triangle';sparkle.frequency.setValueAtTime(1760,now+.48);sparkle.frequency.exponentialRampToValueAtTime(2640,now+.82);sg.gain.setValueAtTime(.0001,now+.48);sg.gain.exponentialRampToValueAtTime(.09,now+.52);sg.gain.exponentialRampToValueAtTime(.0001,now+.9);sparkle.connect(sg);sg.connect(master);sparkle.start(now+.48);sparkle.stop(now+.92);setTimeout(()=>c.close(),1300)}else{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=kind==='loss'?180:1040;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.12,now+.02);g.gain.exponentialRampToValueAtTime(.0001,now+.35);o.connect(g);g.connect(c.destination);o.start(now);o.stop(now+.4);setTimeout(()=>c.close(),500)}}catch{}}
function TrashIcon({ size = 15, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v6M14 11v6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}
function WalletIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.8" />
      <path d="M4.5 8h15" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12.5h10" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
function WhatsAppIcon({ size = 17, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke={color} strokeWidth="1.8" />
      <path d="M8.1 7.8c.3-.35.7-.42 1.05-.16l1.1.82c.3.23.4.63.22.97l-.42.8c.64 1.2 1.58 2.15 2.8 2.8l.8-.42c.34-.18.74-.08.97.22l.82 1.1c.26.35.19.75-.16 1.05l-.58.5c-.5.43-1.2.6-1.82.43-1.56-.43-3.08-1.35-4.37-2.64s-2.21-2.81-2.64-4.37c-.17-.62 0-1.32.43-1.82l.5-.58z" fill={color} />
    </svg>
  );
}
export default function AutoBotV4(){
 const { t, language }=useLanguage();
 const[userName,setUserName]=useState(''),[onlineUsers,setOnlineUsers]=useState(0),[symbol,setSymbol]=useState('1HZ100V'),[account,setAccount]=useState<'demo'|'real'>('demo'),[stake,setStake]=useState(IA_RISK_STAKE),[strategy,setStrategy]=useState<Strategy>('PAR_IMPAR'),[tickWindow,setTickWindow]=useState(9),[running,setRunning]=useState(false),[ticks,setTicks]=useState<number[]>([]),[tickPipSize,setTickPipSize]=useState<number|undefined>(undefined),[signalNow,setSignalNow]=useState<any>(null),[target,setTarget]=useState(33),[lossLimit,setLossLimit]=useState(62.50),[metas,setMetas]=useState(false),[mozHyperCourse,setMozHyperCourse]=useState(false),[courseSection,setCourseSection]=useState<'home'|'risk'|'course'>('home'),[riskBalance,setRiskBalance]=useState(200),[riskPercent,setRiskPercent]=useState(2),[riskTrades,setRiskTrades]=useState(10),[maxMartingale,setMaxMartingale]=useState(11),[theme,setTheme]=useState<'dark'|'light'>('light'),[menu,setMenu]=useState(false),[notice,setNotice]=useState<string|null>(null),[currency,setCurrency]=useState<Currency>('USD'),[stakeManagerVersion,setStakeManagerVersion]=useState(0),[lastDigitSeen,setLastDigitSeen]=useState<number|null>(null),[digitView,setDigitView]=useState<'bars'|'chart'>('bars'),[historyOpen,setHistoryOpen]=useState(false),[historyDate,setHistoryDate]=useState(localDateValue),[dailyHistoryArchive,setDailyHistoryArchive]=useState<any[]>([]),[manualPanelOpen,setManualPanelOpen]=useState(false),[manualStatus,setManualStatus]=useState(''),[manualAboveBarrier,setManualAboveBarrier]=useState('5'),[manualBelowBarrier,setManualBelowBarrier]=useState('4'),[manualStake,setManualStake]=useState(0.75);
 const [iaPower,setIaPower]=useState(true),[sonic,setSonic]=useState(false),[soundEnabled,setSoundEnabled]=useState(true),[courseCode,setCourseCode]=useState(''),[courseUnlocked,setCourseUnlocked]=useState(false),[courseUnlocking,setCourseUnlocking]=useState(false),[smartAnalyzer,setSmartAnalyzer]=useState(false),[exitSpotsMode,setExitSpotsMode]=useState(false),[exitSpotsAutoEnabled,setExitSpotsAutoEnabled]=useState(true),[exitSpotsMonitorStatus,setExitSpotsMonitorStatus]=useState('A aguardar os primeiros 28 Exit Spots fechados.'),[aiAnalystActive,setAiAnalystActive]=useState(false),[aiAnalystExpiresAt,setAiAnalystExpiresAt]=useState<string|null>(null),[quickRecoverRevision,setQuickRecoverRevision]=useState(0),[smartAdvice,setSmartAdvice]=useState<any>(null),[analyzerNotice,setAnalyzerNotice]=useState<string|null>(null),[analyzerHistory,setAnalyzerHistory]=useState<any[]>([]),[analyzerNoticeColor,setAnalyzerNoticeColor]=useState('#3D7FFF');
 const [currencyOptions,setCurrencyOptions]=useState<Currency[]>(['USD']); const [cashierOpen,setCashierOpen]=useState(false),[cashierAction,setCashierAction]=useState<'deposit'|'withdraw'|'ai_analyst'|'course'|null>(null),[supportOpen,setSupportOpen]=useState(false);
 const lastEpoch=useRef<number|null>(null),requested=useRef(false),stopped=useRef(false),botArmedRef=useRef(false),lastRequestedClose=useRef(0),requestStartedAt=useRef(0),lastActivityAt=useRef(Date.now()),lastProcessedStakeResult=useRef<number|string|null>(null),lastProcessedSonicResult=useRef<number|string|null>(null),processedStakeContractsRef=useRef(new Set<number>()),processedSonicContractsRef=useRef(new Set<number>()),pendingRiskStakeRef=useRef<number|null>(null),stakeReadyRef=useRef(true),riskAwaitingContractRef=useRef<number|null>(null),iaRecoveryQuotePendingRef=useRef(false),lastAdvisorKeyRef=useRef(''),totalTickCountRef=useRef(0),lastAnalyzerEvalTickRef=useRef(0),analyzerStableKeyRef=useRef<string|null>(null),analyzerStableCountRef=useRef(0),analyzerLastSwitchTickRef=useRef(-1000),analyzerLastSwitchAtRef=useRef(0),analyzerNoticeTimerRef=useRef<number|null>(null),analyzerDecisionHistoryRef=useRef<any[]>([]),historyRef=useRef<HTMLDivElement|null>(null),lastProcessedRecoveryContractRef=useRef<number|null>(null),pendingAnalyzerStrategyRef=useRef<Strategy|null>(null),analyzerConfirmedRef=useRef(false),analyzerConfirmedStrategyRef=useRef<Strategy|null>(null),hypercoverAlternationRef=useRef<{forceNextDirection:boolean;contractType:'DIGITUNDER'|'DIGITOVER';barrier:number;lastDirection:'DIGITUNDER'|'DIGITOVER'|null}>({forceNextDirection:false,contractType:'DIGITUNDER',barrier:8,lastDirection:null}),quickRecoverRef=useRef<{active:boolean;deficit:number;consecutive:number;contractType:'DIGITUNDER'|'DIGITOVER';barrier:number;forceNextDirection:boolean;pendingKind:'exit'|'recovery'|null;contracts:Map<number,'exit'|'recovery'>;directions:Map<number,'DIGITUNDER'|'DIGITOVER'>}>({active:false,deficit:0,consecutive:0,contractType:'DIGITUNDER',barrier:8,forceNextDirection:false,pendingKind:null,contracts:new Map(),directions:new Map()}),quickRecoverQuoteTargetRef=useRef<number|null>(null),quickRecoverPausedForBalanceRef=useRef(false);
 useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const requestedAction = params.get('paymentAgent');
  if (requestedAction !== 'withdraw' && requestedAction !== 'deposit') return;
  setCashierAction(requestedAction as 'deposit'|'withdraw');
  params.delete('paymentAgent');
  const nextQuery = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (nextQuery ? '?' + nextQuery : '') + window.location.hash);
 }, []);
 const barrierStateRef=useRef<BarrierState|null>(null);const manualTradeRef=useRef<{contractType:'DIGITOVER'|'DIGITUNDER';barrier:number;stake:number}|null>(null);const manualPowerBalanceRef=useRef<{balance:number;currency:string}>({balance:0,currency:'USD'});
 const gestorRef=useRef(criarGestorStake({stakeBase:IA_RISK_STAKE,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale}));
 const lastPayoutRatioRef=useRef(IA_PAYOUT);
 const sonicRef=useRef(createSonicStakeManager({baseStake:IA_RISK_STAKE,payout:IA_PAYOUT,maxLevel:maxMartingale}));
 const processClosedTradeImmediately=useCallback((closed:any)=>{
  const isManualTrade=String(closed?.bot||'').toLowerCase().startsWith('manual');
  if((!running&&!smartAnalyzer&&!isManualTrade)||!closed?.contract_id)return;
  const id=Number(closed.contract_id);
  const result=Number(closed.profit_loss);
  if(!Number.isFinite(id)||id<=0||!Number.isFinite(result))return;

  const quick=quickRecoverRef.current;const tradeKind=quick.contracts.get(id);const closedDirection=quick.directions.get(id);if(tradeKind)quick.contracts.delete(id);if(closedDirection)quick.directions.delete(id);
  const isHypercoverTrade=String(closed?.bot||'').trim().toLowerCase()==='hypercover';
  if(isHypercoverTrade&&result<0){const closedType=String(closed?.contract_type||'').toUpperCase();const actualDirection=closedType==='DIGITOVER'?'DIGITOVER':closedType==='DIGITUNDER'?'DIGITUNDER':hypercoverAlternationRef.current.lastDirection||'DIGITUNDER';const nextDirection=actualDirection==='DIGITOVER'?'DIGITUNDER':'DIGITOVER';hypercoverAlternationRef.current={...hypercoverAlternationRef.current,forceNextDirection:true,contractType:nextDirection,barrier:nextDirection==='DIGITOVER'?1:8,lastDirection:actualDirection};quick.contractType=nextDirection;quick.barrier=nextDirection==='DIGITOVER'?1:8;quick.forceNextDirection=true;setQuickRecoverRevision(v=>v+1);setNotice('HYPERCOVER perdeu ('+(actualDirection==='DIGITOVER'?'OVER 1':'UNDER 8')+'). Próxima operação obrigatoriamente '+(nextDirection==='DIGITOVER'?'OVER 1':'UNDER 8')+', independentemente das estatísticas.');}
  if(tradeKind==='exit'||tradeKind==='recovery'){
   quickRecoverQuoteTargetRef.current=null;quickRecoverPausedForBalanceRef.current=false;setQuickRecoverRevision(v=>v+1);
   if(result<0){quick.deficit=Number((quick.deficit+Math.abs(result)).toFixed(2));quick.consecutive++;
    if(!quick.active&&tradeKind==='exit'&&quick.consecutive>=3){quick.active=true;if(isHypercoverTrade&&result<0){quick.forceNextDirection=true;quick.contractType=hypercoverAlternationRef.current.contractType;quick.barrier=hypercoverAlternationRef.current.barrier;}else{quick.forceNextDirection=false;quick.contractType='DIGITUNDER';quick.barrier=8;}pendingAnalyzerStrategyRef.current=null;requested.current=false;requestStartedAt.current=0;setNotice('QUICK RECOVER ATIVO — 3 perdas consecutivas; Hypercover continua a recuperação; défice $'+quick.deficit.toFixed(2)+'.');}
    else if(quick.active&&tradeKind==='recovery'){const lostDirection=closedDirection||quick.contractType;quick.contractType=lostDirection==='DIGITOVER'?'DIGITUNDER':'DIGITOVER';quick.barrier=quick.contractType==='DIGITOVER'?1:8;quick.forceNextDirection=true;setNotice('HYPERCOVER: '+(lostDirection==='DIGITOVER'?'OVER 1':'UNDER 8')+' perdeu. Próxima operação obrigatoriamente '+(quick.contractType==='DIGITOVER'?'OVER 1':'UNDER 8')+', independentemente das estatísticas. Défice total $'+quick.deficit.toFixed(2)+'.');}
    else if(quick.active)setNotice('QUICK RECOVER continua — défice $'+quick.deficit.toFixed(2)+'.');
   }else if(result>0){quick.consecutive=0;quick.deficit=Number(Math.max(0,quick.deficit-result).toFixed(2));if(quick.active&&quick.deficit<=0.01){quick.active=false;quick.deficit=0;quick.consecutive=0;quick.forceNextDirection=false;setNotice('QUICK RECOVER concluído — défice recuperado. A regressar à análise normal.');}else if(quick.active)setNotice('QUICK RECOVER continua — falta recuperar $'+quick.deficit.toFixed(2)+'.');}
  }
  const fallbackStake=iaPower?gestorRef.current.proximoStake():sonic?sonicRef.current.getStake():stake;
  const executedStake=Math.max(0.35,Number(closed.buy_price)>0?Number(closed.buy_price):Number(pendingRiskStakeRef.current)||Number(fallbackStake)||0.35);
  const closedPayout=Number(closed.payout);
  const payoutRatio=executedStake>0&&Number.isFinite(closedPayout)&&closedPayout>executedStake
    ?(closedPayout-executedStake)/executedStake
    :lastPayoutRatioRef.current;

  if(Number.isFinite(payoutRatio)&&payoutRatio>0){
   lastPayoutRatioRef.current=payoutRatio;
  }

  if(iaPower&&!processedStakeContractsRef.current.has(id)){
   processedStakeContractsRef.current.add(id);
   lastProcessedStakeResult.current=id;
   gestorRef.current.atualizarPayout(lastPayoutRatioRef.current);
   gestorRef.current.registrarResultado(result,executedStake);
   if(isManualTrade){
    const nextManualStake=gestorRef.current.proximoStake();
    const manualContext=manualPowerBalanceRef.current;
    const available=Number(manualContext.balance);
    const affordable=Number.isFinite(available)&&available>0?Math.min(nextManualStake,available):nextManualStake;
    const suggested=Number(Math.max(0.35,affordable).toFixed(2));
    setManualStake(suggested);
    setManualStatus(`${result<0?'IA POWER: perda registada':'IA POWER: resultado registado'} · próxima stake ${suggested.toFixed(2)} ${manualContext.currency}.`);
   }
   stakeReadyRef.current=true;
   try{
    localStorage.setItem(
     `mozhyper-risk-state-v3:${account}:${symbol}:${stake.toFixed(2)}:ia`,
     JSON.stringify({mode:'ia',state:gestorRef.current.getEstado(),savedAt:Date.now()})
    );
   }catch{}
   setStakeManagerVersion(v=>v+1);
   if(result>0&&soundEnabled)sound('win');
  }

  if(sonic&&!processedSonicContractsRef.current.has(id)){
   processedSonicContractsRef.current.add(id);
   lastProcessedSonicResult.current=id;
   sonicRef.current.atualizarPayout(lastPayoutRatioRef.current);
   sonicRef.current.recordResult(result,executedStake);
   stakeReadyRef.current=true;
   try{
    localStorage.setItem(
     `mozhyper-risk-state-v3:${account}:${symbol}:${stake.toFixed(2)}:sonic`,
     JSON.stringify({mode:'sonic',state:sonicRef.current.getState(),savedAt:Date.now()})
    );
   }catch{}
   setStakeManagerVersion(v=>v+1);
   if(result>0&&soundEnabled)sound('win');
  }

  if(isRecoveryStrategy(strategy)&&id!==lastProcessedRecoveryContractRef.current){
   lastProcessedRecoveryContractRef.current=id;
   const currentStats=stats(ticks,tickPipSize);
   if(barrierStateRef.current)barrierStateRef.current=nextBarrierState(strategy,barrierStateRef.current,result>0,currentStats.probs);
  }
  if(id===riskAwaitingContractRef.current)riskAwaitingContractRef.current=null;
  if((iaPower||sonic)&&Number.isFinite(Number(pendingRiskStakeRef.current)))pendingRiskStakeRef.current=null;
  if(iaPower||sonic)stakeReadyRef.current=true;
 },[running,iaPower,sonic,soundEnabled,strategy,ticks,tickPipSize,account,symbol,stake,setManualStake,setManualStatus]);
 const noteQuickRecoverContractBought=useCallback((contractId:number)=>{const quick=quickRecoverRef.current;const kind=quick.pendingKind;if(!kind)return;quick.contracts.set(Number(contractId),kind);if(kind==='recovery'){quick.directions.set(Number(contractId),quick.contractType);quick.forceNextDirection=false;}quick.pendingKind=null;},[]);
 const noteQuickRecoverBuyRejected=useCallback(()=>{quickRecoverRef.current.pendingKind=null;quickRecoverQuoteTargetRef.current=null;quickRecoverPausedForBalanceRef.current=false;setQuickRecoverRevision(v=>v+1)},[]);
 const{tick,balance,proposal,buy,buying,activeContractId,getProposal,clearProposal,subscribeTicks,isAuthorized,isConnected,error,profitTransactions,soros,setSorosStake,setSorosEnabled,contractClosedSeq,lastClosedTransaction,contractStage,fetchProfitTable,getTicksHistory,resetTradingSession}=useDeriv(account,processClosedTradeImmediately,noteQuickRecoverContractBought,noteQuickRecoverBuyRejected);useEffect(()=>{manualPowerBalanceRef.current={balance:Number(balance?.balance)||0,currency:String(balance?.currency||'USD')};},[balance?.balance,balance?.currency]);
 const manualFeedback=(message:string)=>{setManualStatus(message);setNotice(message)};
 const submitManualTrade=(contractType:'DIGITOVER'|'DIGITUNDER',barrier:number)=>{
  if(running||smartAnalyzer){manualFeedback(language==='en'?'Stop the robot before manual trading.':language==='es'?'Detén el robot antes de operar manualmente.':'Pare o robô antes de operar manualmente.');return}
  if(!isConnected||!isAuthorized){manualFeedback(language==='en'?'Connect and authenticate with Deriv first.':language==='es'?'Conéctate y autentícate con Deriv primero.':'Ligue e autentique a Deriv primeiro.');return}
  if(activeContractId!==null||buying||manualTradeRef.current){manualFeedback(language==='en'?'Wait for the current operation to finish.':language==='es'?'Espera a que termine la operación actual.':'Aguarde a operação actual terminar.');return}
  if(!tickDataReady){manualFeedback(language==='en'?'Waiting for digit-bar data. Please wait for the bars to load.':language==='es'?'Esperando los datos de las barras. Espera a que carguen.':'A aguardar os dados das barras. Espere que as barras carreguem.');return}
  const amount=Number(manualStake),available=Number(balance?.balance);
  if(!Number.isFinite(amount)||amount<0.35){manualFeedback(language==='en'?'Minimum stake is 0.35 in the Deriv account currency.':language==='es'?'La apuesta mínima es 0.35 en la moneda de la cuenta Deriv.':'A stake mínima é 0,35 na moeda da conta Deriv.');return}
  if(!Number.isFinite(available)||available<=0||amount>available){manualFeedback(language==='en'?'Stake exceeds the available balance.':language==='es'?'La apuesta supera el saldo disponible.':'A stake ultrapassa o saldo disponível.');return}
  manualTradeRef.current={contractType,barrier,stake:amount};
  const sent=getProposal(symbol,contractType,amount,1,barrier,false);
  if(!sent){manualTradeRef.current=null;manualFeedback(language==='en'?'Could not request the Deriv proposal. Check the connection and try again.':language==='es'?'No se pudo solicitar la propuesta de Deriv. Comprueba la conexión e inténtalo de nuevo.':'Não foi possível pedir a proposta à Deriv. Verifique a ligação e tente novamente.');return}
  manualFeedback((language==='en'?'Requesting quote for stake ':language==='es'?'Solicitando cotización para apuesta ':'A solicitar proposta para stake ')+amount.toFixed(2)+' '+String(balance?.currency||'USD')+'…');
 };
 useEffect(()=>{
  const order=manualTradeRef.current;
  if(!order)return;
  if(proposal?.id&&!buying){
   if(!isConnected||!isAuthorized||activeContractId!==null){manualTradeRef.current=null;clearProposal();manualFeedback(language==='en'?'Manual trade cancelled: connection or contract state changed.':language==='es'?'Operación manual cancelada: cambió la conexión o el contrato.':'Operação manual cancelada: a ligação ou o estado do contrato mudou.');return}
   // useDeriv only publishes a proposal whose req_id matches the most recent
   // request. Some Deriv proposal responses omit or normalize contract_type,
   // so do not cancel a correctly correlated quote based on that response field.
   // The requested direction is the one captured in manualTradeRef.
   manualTradeRef.current=null;
   const label=order.contractType==='DIGITOVER'?'Manual Acima '+order.barrier:'Manual Abaixo '+order.barrier;
   if(buy(proposal.id,Number(proposal.ask_price),label,order.barrier)){
    manualFeedback((language==='en'?'Manual trade sent: ':language==='es'?'Operación manual enviada: ':'Operação manual enviada: ')+label+' · stake '+order.stake.toFixed(2)+' '+String(balance?.currency||'USD'));
   }else{
    clearProposal();
    manualFeedback(language==='en'?'Deriv did not accept the buy request. Check if another contract is open and try again.':language==='es'?'Deriv no aceptó la compra. Comprueba si hay otro contrato abierto e inténtalo de nuevo.':'A Deriv não aceitou o pedido de compra. Verifique se existe outra operação aberta e tente novamente.');
   }
   return;
  }
  if(error){manualTradeRef.current=null;clearProposal();manualFeedback((language==='en'?'Deriv rejected the manual quote: ':language==='es'?'Deriv rechazó la cotización manual: ':'A Deriv rejeitou a proposta manual: ')+error);return}
  if(!proposal||!proposal.id||buying)return;
  // Proposal handling is completed above; do not process the same manual order twice.
 },[proposal,buying,activeContractId,isConnected,isAuthorized,error,buy,clearProposal,language,balance?.currency]);
 const resetAppStateForNewUser=useCallback((userKey:string)=>{
  const normalized=String(userKey||'').trim().toLowerCase();
  if(!normalized)return;
  try{
   const previous=localStorage.getItem('mozhyper-active-user-v1');
   if(previous===normalized)return;
   // Never carry another user's trading/risk state into this session.
   for(let i=localStorage.length-1;i>=0;i--){
    const key=localStorage.key(i)||'';
    if(
      key.startsWith('mozhyper-stake-state-v2:')||
      key.startsWith('mozhyper-risk-state-v3:')
    ) localStorage.removeItem(key);
   }
   localStorage.setItem('mozhyper-active-user-v1',normalized);
  }catch{}
  stopped.current=true;
  botArmedRef.current=false;
  requested.current=false;
  requestStartedAt.current=0;
  riskAwaitingContractRef.current=null;
  pendingRiskStakeRef.current=null;
  stakeReadyRef.current=true;
  lastProcessedStakeResult.current=null;
  lastProcessedSonicResult.current=null;
  lastProcessedRecoveryContractRef.current=null;
  processedStakeContractsRef.current.clear();
  processedSonicContractsRef.current.clear();
  pendingAnalyzerStrategyRef.current=null;
  setRunning(false);
  setTicks([]);
  setSignalNow(null);
  setLastDigitSeen(null);
  setTickPipSize(undefined);
  setDailyHistoryArchive([]);
  setHistoryOpen(false);
  setSmartAdvice(null);
  setAnalyzerNotice(null);
  setStakeManagerVersion(v=>v+1);
  gestorRef.current=criarGestorStake({stakeBase:stake,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale});
  sonicRef.current=createSonicStakeManager({baseStake:stake,payout:IA_PAYOUT,maxLevel:maxMartingale});
  resetTradingSession();
 },[resetTradingSession,stake,maxMartingale]);
 useEffect(()=>{
  let cancelled=false;
  fetch('/api/auth/me',{cache:'no-store'})
   .then(r=>r.ok?r.json():null)
   .then(data=>{
    if(cancelled)return;
    const user=data?.user;
    const identity=String(user?.id??user?.email??'').trim().toLowerCase();
    if(identity)resetAppStateForNewUser(identity);
   })
   .catch(()=>{});
  return()=>{cancelled=true};
 },[resetAppStateForNewUser]);
 useEffect(()=>{
  if(!proposal||!proposal.ask_price)return;
  const ratio=(proposal.payout-proposal.ask_price)/proposal.ask_price;
  if(Number.isFinite(ratio)&&ratio>0){
   lastPayoutRatioRef.current=ratio;
   sonicRef.current.atualizarPayout(ratio);
   gestorRef.current.atualizarPayout(ratio);
  }
 },[proposal]);
 useEffect(()=>{if((!running&&!smartAnalyzer)||!lastClosedTransaction?.contract_id)return;processClosedTradeImmediately(lastClosedTransaction)},[running,smartAnalyzer,lastClosedTransaction,processClosedTradeImmediately]);
 const statsWindow=200;const analysisExitValues=useMemo(()=>profitTransactions.filter(tx=>Boolean(tx.sell_time)&&tx.exit_spot!=null&&String(tx.exit_spot).trim()!==''&&Number.isFinite(Number(tx.exit_spot))).slice(0,600).reverse().map(tx=>Number(tx.exit_spot)),[profitTransactions]);const exitSpotReady=analysisExitValues.length>=28;const botAnalysisValues=useMemo(()=>ticks,[ticks]);const aiAnalysisValues=useMemo(()=>ticks.slice(-25),[ticks]);const chartUsesExitSpots=analysisExitValues.length>=28;const chartSourceValues=useMemo(()=>chartUsesExitSpots?analysisExitValues:ticks,[chartUsesExitSpots,analysisExitValues,ticks]);const analyze100Ticks=useMemo(()=>analyzeStrategies100(aiAnalysisValues,tickPipSize),[aiAnalysisValues,tickPipSize]);const selectedTickValues=useMemo(()=>chartSourceValues.slice(-tickWindow),[chartSourceValues,tickWindow]);const selectedTickDigits=useMemo(()=>selectedTickValues.map(v=>digit(v,tickPipSize)).filter((d):d is number=>d!==null),[selectedTickValues,tickPipSize]);const st=useMemo(()=>stats(selectedTickValues,tickPipSize),[selectedTickValues,tickPipSize]);const tickDataReady=selectedTickValues.length>=(chartUsesExitSpots?Math.min(9,tickWindow):tickWindow)&&selectedTickDigits.length>=(chartUsesExitSpots?Math.min(9,tickWindow):tickWindow)&&(chartUsesExitSpots||(Boolean(tick?.epoch)&&Date.now()/1000-Number(tick?.epoch)<4));const latest=profitTransactions[0];const chartExitDigit=useMemo(()=>{if(!latest?.sell_time||latest.exit_spot==null)return null;return digit(latest.exit_spot,tickPipSize)},[latest,tickPipSize]);const displayedExitDigit=chartUsesExitSpots?chartExitDigit:lastDigitSeen;const pnl=useMemo(()=>profitTransactions.reduce((a,x)=>a+Number(x.profit_loss||0),0),[profitTransactions]),closedOperations=profitTransactions.length,iaState=useMemo(()=>gestorRef.current.getEstado(),[stakeManagerVersion]),sonicState=useMemo(()=>sonicRef.current.getState(),[stakeManagerVersion]);
 const dailyTransactions=useMemo(()=>{const parts=historyDate.split('-').map(Number);if(parts.length!==3||parts.some(n=>!Number.isFinite(n)))return [];const [year,month,day]=parts;return dailyHistoryArchive.filter(x=>{const raw=Number(x.sell_time??x.purchase_time);if(!Number.isFinite(raw)||raw<=0)return false;const d=new Date(raw*1000);return d.getFullYear()===year&&d.getMonth()+1===month&&d.getDate()===day})},[dailyHistoryArchive,historyDate]);const dailyPnl=useMemo(()=>dailyTransactions.reduce((a,x)=>a+Number(x.profit_loss||0),0),[dailyTransactions]);const dailyWins=useMemo(()=>dailyTransactions.filter(x=>Number(x.profit_loss||0)>0).length,[dailyTransactions]);const dailyLosses=useMemo(()=>dailyTransactions.filter(x=>Number(x.profit_loss||0)<0).length,[dailyTransactions]);const dailyByBot=useMemo(()=>{const groups=new Map<string,{count:number;wins:number;losses:number;pnl:number}>();for(const x of dailyTransactions){const bot=String((x as any).bot||'Bot não identificado');const prev=groups.get(bot)||{count:0,wins:0,losses:0,pnl:0};const p=Number(x.profit_loss||0);prev.count+=1;if(p>0)prev.wins+=1;else if(p<0)prev.losses+=1;prev.pnl+=p;groups.set(bot,prev)}return Array.from(groups.entries()).sort((a,b)=>b[1].pnl-a[1].pnl)},[dailyTransactions]);useEffect(()=>{try{const key=`mozhyper-daily-history-v1:${account}`;const raw=localStorage.getItem(key);const stored=raw?JSON.parse(raw):[];if(Array.isArray(stored))setDailyHistoryArchive(stored)}catch{}},[account]); useEffect(()=>{let lastDate=localDateValue();const timer=window.setInterval(()=>{const today=localDateValue();if(today!==lastDate){lastDate=today;setHistoryDate(today);}},30000);return()=>window.clearInterval(timer)},[]);useEffect(()=>{if(!profitTransactions.length)return;const key=`mozhyper-daily-history-v1:${account}`;setDailyHistoryArchive(prev=>{const byId=new Map<number,any>();for(const x of prev){const id=Number(x.contract_id);if(Number.isFinite(id)&&id>0)byId.set(id,x)}for(const x of profitTransactions){const id=Number(x.contract_id);if(!Number.isFinite(id)||id<=0)continue;byId.set(id,{...byId.get(id),...x})}const next=Array.from(byId.values()).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time)).slice(0,2000);try{localStorage.setItem(key,JSON.stringify(next))}catch{}return next})},[profitTransactions,account]);const greeting=useMemo(()=>{const h=new Date().getHours();if(language==='pt')return h>=0&&h<6?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';if(language==='es')return h>=0&&h<6?'Buenas madrugadas':h<12?'Buenos días':h<18?'Buenas tardes':'Buenas noches';return h>=0&&h<6?'Good early morning':h<12?'Good morning':h<18?'Good afternoon':'Good evening'},[language]); useEffect(()=>{document.body.classList.toggle('light',theme==='light');return()=>{document.body.classList.remove('light')}},[theme]); useEffect(()=>{fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{const name=String(data?.user?.name||'').trim();if(name)setUserName(name)}).catch(()=>{})},[]); useEffect(()=>{let alive=true;const heartbeat=()=>{fetch('/api/online',{method:'POST',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(alive)setOnlineUsers(Number(data?.online)||0)}).catch(()=>{})};heartbeat();const id=window.setInterval(heartbeat,20000);return()=>{alive=false;clearInterval(id)}},[]);
 useEffect(()=>{try{const saved=localStorage.getItem('mozhyper-sound-enabled');if(saved!==null)setSoundEnabled(saved!=='false')}catch{}},[]); useEffect(()=>{let alive=true;const load=async()=>{try{const auth=await fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null);let country=String(auth?.user?.country||'').trim().toUpperCase();let ipData:any=null;if(!country){ipData=await fetch('https://ipapi.co/json/',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);country=String(ipData?.country_code||'').trim().toUpperCase();if(/^[A-Z]{2}$/.test(country)&&auth?.platformAuthenticated){fetch('/api/auth/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country})}).catch(()=>{})}}const registeredCurrency=country?getCountryCurrency(country):'';const isAllCurrenciesUser=String(auth?.user?.email||'').trim().toLowerCase()==='khatangana@gmail.com';const apiCurrency=normalizeCurrency(ipData?.currency||'', 'USD');let native=registeredCurrency||apiCurrency;let rate=FALLBACK_RATES[native]||1;if(ipData?.currency===native&&Number(ipData?.currency_rate)>0)rate=Number(ipData.currency_rate);if(!ipData||!country){const currencyData=await fetch('/api/currency',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);if(!native||native==='USD'){native=normalizeCurrency(currencyData?.currency,'USD');}if(native!=='USD'&&FALLBACK_RATES[native])rate=FALLBACK_RATES[native]}if(!alive)return;CURRENCY_RATES[native]=rate;CURRENCY_LABELS[native]=getCurrencyMeta(native).symbol;setCurrencyOptions(isAllCurrenciesUser?Object.keys(CURRENCY_RATES):Array.from(new Set([native,'USD'])));setCurrency(native)}catch{if(alive)setCurrencyOptions(['USD'])}};load();return()=>{alive=false}},[]); useEffect(()=>{if(!menu)return;const onPointerDown=(e:PointerEvent)=>{const el=e.target as HTMLElement;if(!el.closest('.menu-trigger')&&!el.closest('.menu-popover'))setMenu(false)};document.addEventListener('pointerdown',onPointerDown);return()=>document.removeEventListener('pointerdown',onPointerDown)},[menu]); useEffect(()=>{if(!historyOpen)return;const onPointerDown=(e:PointerEvent)=>{const target=e.target as Node|null;if(historyRef.current&&!historyRef.current.contains(target))setHistoryOpen(false)};document.addEventListener('pointerdown',onPointerDown);return()=>document.removeEventListener('pointerdown',onPointerDown)},[historyOpen]);
 useEffect(()=>{if(isConnected)subscribeTicks(symbol)},[isConnected,symbol,subscribeTicks]);
 useEffect(()=>{if(!tick?.epoch||tick.epoch===lastEpoch.current)return;lastEpoch.current=tick.epoch;totalTickCountRef.current+=1;lastActivityAt.current=Date.now();const q=Number(tick.quote);if(!Number.isFinite(q))return;if(Number.isFinite((tick as any).pip_size)&&Number((tick as any).pip_size)>0)setTickPipSize(Number((tick as any).pip_size));const pipSize=Number((tick as any).pip_size)>0?Number((tick as any).pip_size):tickPipSize;setLastDigitSeen(digit(q,pipSize));setTicks(prev=>[...prev,q].slice(-statsWindow))},[tick,tickPipSize]);
 useEffect(()=>{if(!iaPower&&!sonic)setSorosStake(stake)},[stake,iaPower,sonic,setSorosStake]);
 useEffect(()=>{setSorosEnabled(!iaPower&&!sonic)},[iaPower,sonic,setSorosEnabled]);
 useEffect(()=>{if(!running){gestorRef.current=criarGestorStake({stakeBase:stake,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale});sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});setStakeManagerVersion(v=>v+1)}},[stake,maxMartingale,running]);
 useEffect(()=>{setSignalNow(null);requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null},[tickWindow,strategy]); useEffect(()=>{setTicks([]);setSignalNow(null);setTickPipSize(undefined);setLastDigitSeen(null);requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();totalTickCountRef.current=0;lastAnalyzerEvalTickRef.current=0;analyzerLastSwitchTickRef.current=-1000;analyzerDecisionHistoryRef.current=[];analyzerLastSwitchAtRef.current=0;analyzerConfirmedRef.current=false;analyzerConfirmedStrategyRef.current=null;barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null},[symbol]);
 useEffect(()=>{if((!running&&!smartAnalyzer)||!isConnected)return;const id=window.setInterval(()=>fetchProfitTable({limit:500,offset:0,sort:'DESC'}),5000);return()=>clearInterval(id)},[running,smartAnalyzer,isConnected,fetchProfitTable]);
 useEffect(()=>{if(!running&&!smartAnalyzer)return;const id=window.setInterval(()=>{if(requested.current&&requestStartedAt.current>0&&!proposal&&!buying&&activeContractId===null&&Date.now()-requestStartedAt.current>5000){requested.current=false;requestStartedAt.current=0;if(!(iaPower||sonic)||riskAwaitingContractRef.current===null)stakeReadyRef.current=true}if(signalNow&&!proposal&&!buying&&activeContractId===null&&riskAwaitingContractRef.current===null&&Date.now()-lastActivityAt.current>5500){requested.current=false;requestStartedAt.current=0;if(!(iaPower||sonic))stakeReadyRef.current=true;subscribeTicks(symbol);lastActivityAt.current=Date.now()-4500}},1000);return()=>clearInterval(id)},[running,smartAnalyzer,proposal,buying,activeContractId,signalNow,symbol,subscribeTicks,latest,iaPower,sonic]);
 useEffect(()=>{
  if(!botArmedRef.current||(!running&&!smartAnalyzer)||stopped.current)return;
  // Bot normal: 9 ticks ao vivo com gatilho de 65%.
  // AI Analyst normal: 25 ticks ao vivo (5 blocos de 5), gatilho de 65%.
  // Os 28 Exit Spots e o gatilho de 20% são uma modalidade separada e não podem
  // bloquear o AI Analyst normal quando não há histórico suficiente de operações.
  const quickRecover=quickRecoverRef.current.active;
  const forceHypercover=!quickRecover&&hypercoverAlternationRef.current.forceNextDirection;
  if(quickRecover&&quickRecoverPausedForBalanceRef.current){const required=quickRecoverQuoteTargetRef.current;if(required!==null&&Number(balance?.balance)>=required)quickRecoverPausedForBalanceRef.current=false;else return;}
  if(!forceHypercover&&(quickRecover?(analysisExitValues.length<9&&aiAnalysisValues.length<9):(smartAnalyzer?(exitSpotsMode?analysisExitValues.length<28:aiAnalysisValues.length<25):botAnalysisValues.length<9)))return;
  let analystStrategy:Strategy|null=null;
  if(smartAnalyzer&&!quickRecover&&!forceHypercover){
   if(!smartAdvice||(!exitSpotsMode&&smartAdvice.noTrade))return;
   analystStrategy=ANALYZER_STRATEGY_TO_BOT[smartAdvice.strategy]||null;
   if(!analystStrategy||strategy!==analystStrategy)return;
  }
  if(!quickRecover&&!forceHypercover&&pendingAnalyzerStrategyRef.current&&pendingAnalyzerStrategyRef.current!==strategy)return;
  if(proposal||buying||activeContractId!==null||!isAuthorized||!isConnected)return;
  let freshSignal:any=null;
  if(quickRecover){const quick=quickRecoverRef.current;const cover=quick.forceNextDirection?{contract:quick.contractType==='DIGITOVER'?'OVER' as Contract:'UNDER' as Contract,contractType:quick.contractType,barrier:quick.barrier,label:quick.contractType==='DIGITOVER'?'ACIMA 1':'ABAIXO 8',strength:100,score:100}:makeHyperCoverExitSignal(analysisExitValues.length>=9?analysisExitValues:aiAnalysisValues,tickPipSize);if(!cover)return;quick.contractType=cover.contractType;quick.barrier=cover.barrier;freshSignal={contract:cover.contract,label:'QUICK RECOVER HYPERCOVER '+cover.label,strength:cover.strength,score:cover.score,barrier:cover.barrier,contractType:cover.contractType,quickRecover:true};}else if(forceHypercover){const forced=hypercoverAlternationRef.current;freshSignal={contract:forced.contractType==='DIGITOVER'?'OVER':'UNDER',label:forced.contractType==='DIGITOVER'?'ACIMA 1':'ABAIXO 8',strength:100,score:100,barrier:forced.barrier,contractType:forced.contractType,forcedHypercover:true};}else if(smartAnalyzer){
   if(exitSpotsMode){
    const exitSignal=analystStrategy?(isRecoveryStrategy(analystStrategy)?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current,tickPipSize):makeExitSpotSignal(analysisExitValues,analystStrategy,tickPipSize,false)):null;
    if(exitSignal)freshSignal=exitSignal;
   }else if(analystStrategy&&isRecoveryStrategy(analystStrategy)){
    const state=barrierStateRef.current||initialBarrierState(analystStrategy);
    const tickSignal=makeBarrierSignal(aiAnalysisValues,state,tickPipSize,65,25);
    const recentConfirmed=confirmBarrierRecent(aiAnalysisValues.slice(-5),state,tickPipSize);
    if(tickSignal&&recentConfirmed)freshSignal=tickSignal;
   }else{
    const tickSignal=analystStrategy?makeSignal(aiAnalysisValues,analystStrategy,tickPipSize,false,65,25):null;
    const recentConfirmed=confirmAnalyzerRecent(aiAnalysisValues,String(smartAdvice.strategy),String(smartAdvice.label),tickPipSize);
    if(tickSignal&&tickSignal.contract===smartAdvice.contract&&recentConfirmed){
     freshSignal={...tickSignal,label:String(smartAdvice.label),strength:Number(tickSignal.strength)||0};
    }
   }
  }else if(isRecoveryStrategy(strategy)){
   freshSignal=makeBarrierSignal(ticks.slice(-9),barrierStateRef.current,tickPipSize,65,9);
  }else{
   freshSignal=makeSignal(ticks.slice(-9),strategy,tickPipSize,false,65,9);
  }
  if(!freshSignal)return;
  if(requested.current)return;
  if((iaPower||sonic)&&(riskAwaitingContractRef.current!==null||!stakeReadyRef.current))return;
  stakeReadyRef.current=false;
  requested.current=true;
  requestStartedAt.current=Date.now();
  lastActivityAt.current=Date.now();
  let contractTypeStr:string,barrier:number;
  const strategyName:string=String(strategy);
  if(freshSignal?.quickRecover||freshSignal?.forcedHypercover){const forced=quickRecoverRef.current.active?quickRecoverRef.current:hypercoverAlternationRef.current;contractTypeStr=forced.contractType;barrier=forced.barrier;}else if(isRecoveryStrategy(strategy)&&barrierStateRef.current){
   contractTypeStr=barrierStateRef.current.contractType;
   barrier=barrierStateRef.current.barrier;
  } else {
   const c:Contract=freshSignal.contract as Contract;
   barrier=isRecoveryStrategy(strategy)?(barrierStateRef.current?.barrier??4):
    strategyName==='HYPERGUARD'?0:strategyName==='HYPERSHIELD'?4:strategyName==='HYPERBREAK'?8:strategyName==='HYPERCOVER'?(c==='OVER'?1:8):
    c==='DIFFER'?0:c==='MATCH0'?0:c==='OVER'?5:c==='UNDER'?4:0;
   contractTypeStr=TYPES[c];
  }
  // Sonic é a fonte de verdade da stake quando está ativo.
  // O Soros interno do Sonic controla a repetição da mesma stake vencedora.
  const rawAmount=iaPower?gestorRef.current.proximoStake():(sonic?sonicRef.current.getStake():(Number(soros.stake)>0?soros.stake:stake));
  const availableBalance=Number(balance?.balance);
  const maxStakeByBalance=Math.floor(availableBalance*100)/100;
  if(!Number.isFinite(availableBalance)||availableBalance<=0||maxStakeByBalance<0.35){
   requested.current=false;
   requestStartedAt.current=0;
   stakeReadyRef.current=true;
   return;
  }
  const iaState=iaPower?gestorRef.current.getEstado():null;
  const iaRecovery=iaPower?Boolean(iaState?.emMartingale||Number(iaState?.deficitRecuperacao||0)>0.01):false;
  const sonicRecovery=sonic?Boolean(sonicRef.current.getState().inMartingale||Number(sonicRef.current.getState().recoveryDeficit||0)>0.01):false;
  const recoveryActive=iaRecovery||sonicRecovery;

  // Em IA POWER, o payout de recuperação deve ser o payout REAL
  // da proposta do HyperShield, não o payout padrão/stale de 0.95.
  // Fazemos uma cotação-semente primeiro; quando a proposta chegar,
  // o efeito de [proposal] recalcula a stake para recuperar o défice.
  const quickState=quickRecoverRef.current;
  // Quick Recover começa com uma cotação-semente mínima. A stake de recuperação
  // só é calculada depois de ler o payout REAL do contrato ACIMA 0/ABAIXO 9.
  const desiredStake=Math.max(0.35,Number(rawAmount)||0.35);
  let amount=quickState.active?0.35:Math.max(0.35,Math.min(desiredStake,maxStakeByBalance));
  const applySoros=!iaPower&&!sonic&&!quickState.active;

  // IA POWER / HyperShield: a primeira proposta serve apenas para
  // descobrir o payout REAL. Ela não pode ser comprada enquanto
  // a stake de recuperação ainda estiver a ser recalculada.
  if(iaPower&&iaRecovery&&!quickState.active){amount=0.35;iaRecoveryQuotePendingRef.current=true;}else{iaRecoveryQuotePendingRef.current=false;}

  if(iaPower||sonic)pendingRiskStakeRef.current=Number(amount.toFixed(2));
  if(!getProposal(symbol,contractTypeStr,amount,1,barrier,applySoros)){
   if(iaPower||sonic)pendingRiskStakeRef.current=null;
   requested.current=false;
   requestStartedAt.current=0;
   stakeReadyRef.current=true;
  }
 },[running,smartAnalyzer,exitSpotsMode,smartAdvice,analysisExitValues,botAnalysisValues,aiAnalysisValues,ticks,exitSpotReady,tickWindow,tickPipSize,proposal,buying,activeContractId,isAuthorized,isConnected,getProposal,symbol,soros.stake,stake,iaPower,sonic,stakeManagerVersion,balance?.balance,strategy,quickRecoverRevision]); useEffect(()=>{
  if(!iaPower||!botArmedRef.current||(!running&&!smartAnalyzer)||stopped.current||!proposal||buying||activeContractId!==null||!isAuthorized||!isConnected||!iaRecoveryQuotePendingRef.current)return;
  const state=gestorRef.current.getEstado();
  const deficit=Number(state.deficitRecuperacao||0);
  if(deficit<=0.01){
   iaRecoveryQuotePendingRef.current=false;
   return;
  }
  const ask=Number(proposal.ask_price);
  const payout=Number(proposal.payout);
  const realRatio=ask>0&&Number.isFinite(payout)&&payout>ask?(payout-ask)/ask:0;
  if(!(realRatio>0))return;

  gestorRef.current.atualizarPayout(realRatio);
  const exactRecovery=Math.max(0.35,Math.ceil((deficit/realRatio)*100-1e-9)/100);
  const availableBalance=Number(balance?.balance);
  const maxStakeByBalance=Math.floor(availableBalance*100)/100;
  const amount=Math.max(0.35,Math.min(exactRecovery,maxStakeByBalance));
  const quotedStake=Math.max(0.35,Number(ask.toFixed(2)));

  if(Math.abs(quotedStake-amount)>0.005){
   pendingRiskStakeRef.current=Number(amount.toFixed(2));
   requested.current=true;
   requestStartedAt.current=Date.now();
   const bs=barrierStateRef.current;
   const type=bs?.contractType??'DIGITOVER';
   const b=bs?.barrier??4;
   if(!getProposal(symbol,type,amount,1,b,false)){
    requested.current=false;
    requestStartedAt.current=0;
   }
   return;
  }

  pendingRiskStakeRef.current=Number(amount.toFixed(2));
  iaRecoveryQuotePendingRef.current=false;
 },[iaPower,running,smartAnalyzer,proposal,buying,activeContractId,isAuthorized,isConnected,balance?.balance,getProposal,symbol]); useEffect(()=>{
   if(!botArmedRef.current||(!running&&!smartAnalyzer)||stopped.current||!proposal||buying||activeContractId!==null||!isAuthorized||!isConnected)return;
   if(iaPower&&iaRecoveryQuotePendingRef.current)return;
   if(!quickRecoverRef.current.active&&pendingAnalyzerStrategyRef.current&&pendingAnalyzerStrategyRef.current!==strategy)return;

   const cancelUnqualifiedEntry=(message:string)=>{
    setNotice(message);
    // Uma cotação não pode ficar presa quando o sinal muda durante a resposta.
    // Invalidamos também o req_id para ignorar respostas atrasadas da Deriv.
    clearProposal();
    requested.current=false;
    requestStartedAt.current=0;
    pendingRiskStakeRef.current=null;
    iaRecoveryQuotePendingRef.current=false;
    stakeReadyRef.current=true;
   };

   // Quick Recover reads the payout for its exact OVER 1 / UNDER 8 contract.
   // It never uses a payout ratio left over from the previous strategy.
   if(quickRecoverRef.current.active){
    const quick=quickRecoverRef.current;
    const ask=Number(proposal.ask_price);
    const payout=Number(proposal.payout);
    const deficit=Number(quick.deficit);
    const ratio=ask>0&&Number.isFinite(payout)&&payout>ask?(payout-ask)/ask:0;
    if(!(ratio>0&&deficit>0.01)){
     quickRecoverQuoteTargetRef.current=Math.max(0,Number(balance?.balance)||0)+0.01;
     quickRecoverPausedForBalanceRef.current=true;
     setNotice('QUICK RECOVER pausado: não foi possível calcular um payout válido. Confirme a ligação e reinicie o robô.');
     clearProposal();requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;return;
    }
    const requiredStake=Math.max(0.35,Math.ceil((deficit/ratio)*100-1e-9)/100);
    const availableBalance=Math.floor((Number(balance?.balance)||0)*100)/100;
    const targetStake=quickRecoverQuoteTargetRef.current;
    const targetQuoteMatches=targetStake!==null&&Math.abs(ask-targetStake)<0.005;
    const payoutCoversDeficit=payout-ask>=deficit-0.005;
    if(!(targetQuoteMatches&&payoutCoversDeficit)){
     let nextStake=requiredStake;
     if(targetQuoteMatches&&!payoutCoversDeficit)nextStake=Math.max(requiredStake,Math.ceil((ask+0.01)*100)/100);
     quickRecoverQuoteTargetRef.current=nextStake;
     if(nextStake>availableBalance+0.005){
      quickRecoverPausedForBalanceRef.current=true;
      setNotice('QUICK RECOVER pausado: saldo insuficiente para cobrir todo o défice numa única operação.');
      clearProposal();requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;return;
     }
     quickRecoverPausedForBalanceRef.current=false;
     requested.current=true;requestStartedAt.current=Date.now();
     if(!getProposal(symbol,quick.contractType,nextStake,1,quick.barrier,false)){
      quickRecoverQuoteTargetRef.current=null;requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;
      setNotice('QUICK RECOVER: falhou a cotação da stake de recuperação.');
     }
     return;
    }
    quickRecoverQuoteTargetRef.current=null;quickRecoverPausedForBalanceRef.current=false;
   }

   // Last-moment validation rechecks the exact data window for the active mode.
   {
   const cancelUnqualifiedEntry=(message:string)=>{
     setNotice(message);
     clearProposal();
     requested.current=false;
     requestStartedAt.current=0;
     pendingRiskStakeRef.current=null;
     iaRecoveryQuotePendingRef.current=false;
     stakeReadyRef.current=true;
    };
    let validationSignal:any=null;
    let advice:any=null;
    const forceHypercover=hypercoverAlternationRef.current.forceNextDirection&&!quickRecoverRef.current.active;
    if(forceHypercover){const forced=hypercoverAlternationRef.current;validationSignal={contract:forced.contractType==='DIGITOVER'?'OVER':'UNDER',label:forced.contractType==='DIGITOVER'?'HYPERCOVER OVER 1':'HYPERCOVER UNDER 8',strength:100,barrier:forced.barrier,contractType:forced.contractType,forcedHypercover:true};}
    else if(smartAnalyzer||quickRecoverRef.current.active){
     advice=smartAdvice;
     const mapped=advice?ANALYZER_STRATEGY_TO_BOT[String(advice.strategy)]||String(advice.strategy):'';
     if(!quickRecoverRef.current.active&&!forceHypercover&&(!advice||(!exitSpotsMode&&advice.noTrade)||mapped!==strategy)){
      cancelUnqualifiedEntry('Sinal mudou antes da compra; a aguardar uma nova análise.');
      return;
     }
     if(quickRecoverRef.current.active){validationSignal={contract:quickRecoverRef.current.contractType==='DIGITUNDER'?'UNDER':'OVER',label:quickRecoverRef.current.contractType==='DIGITUNDER'?'HYPERCOVER UNDER 8':'HYPERCOVER OVER 1',strength:100,barrier:quickRecoverRef.current.barrier,contractType:quickRecoverRef.current.contractType,quickRecover:true};}else if(exitSpotsMode){
      validationSignal=isRecoveryStrategy(strategy)
       ?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current,tickPipSize)
       :makeExitSpotSignal(analysisExitValues,strategy,tickPipSize,false);
     }else if(isRecoveryStrategy(strategy)){
      const state=barrierStateRef.current||initialBarrierState(strategy);
      validationSignal=makeBarrierSignal(aiAnalysisValues,state,tickPipSize,65,25);
      if(!confirmBarrierRecent(aiAnalysisValues.slice(-5),state,tickPipSize))validationSignal=null;
     }else{
      validationSignal=makeSignal(aiAnalysisValues,strategy,tickPipSize,false,65,25);
      if(!confirmAnalyzerRecent(aiAnalysisValues,String(advice.strategy),String(advice.label),tickPipSize))validationSignal=null;
      if(validationSignal&&validationSignal.contract!==advice.contract)validationSignal=null;
     }
     if(exitSpotsMode&&validationSignal&&!isRecoveryStrategy(strategy)&&validationSignal.contract!==advice.contract)validationSignal=null;
    }else if(isRecoveryStrategy(strategy)){
     validationSignal=makeBarrierSignal(ticks.slice(-9),barrierStateRef.current,tickPipSize,65,9);
    }else{
     validationSignal=makeSignal(ticks.slice(-9),strategy,tickPipSize,false,65,9);
    }
    if(!validationSignal){
     cancelUnqualifiedEntry(smartAnalyzer?(exitSpotsMode?'Exit Spots: o sinal já não cumpre 20% nos 28 resultados e nos blocos.':'AI Analyst: falta o gatilho de 65% e a confirmação dos últimos 5 ticks.'):'Robô normal: falta o gatilho de 65% nos últimos 9 ticks.');
     return;
    }
    const expectedContract=validationSignal.contract as Contract|null;
    const proposalType=String((proposal as any).contract_type||'').toUpperCase();
    if(!quickRecoverRef.current.active&&!isRecoveryStrategy(strategy)&&proposalType&&expectedContract&&proposalType!==TYPES[expectedContract]){
     cancelUnqualifiedEntry('Entrada cancelada: o contrato cotado já não corresponde ao sinal mais recente.');
     return;
    }
   }

   const botName=(quickRecoverRef.current.active||hypercoverAlternationRef.current.forceNextDirection)?'Hypercover':STRATEGY_BOT_NAMES[strategy];quickRecoverRef.current.pendingKind=quickRecoverRef.current.active?'recovery':((running&&!smartAnalyzer)||(smartAnalyzer&&exitSpotsMode)?'exit':null);
   const forcedHypercoverBuy=hypercoverAlternationRef.current.forceNextDirection&&botName==='Hypercover';
    const bought=buy(proposal.id,Number(proposal.ask_price),botName,(quickRecoverRef.current.active||forcedHypercoverBuy)?(quickRecoverRef.current.active?quickRecoverRef.current.barrier:hypercoverAlternationRef.current.barrier):(proposal.barrier!=null&&Number.isFinite(Number(proposal.barrier))?Number(proposal.barrier):undefined));
    if(bought&&botName==='Hypercover'&&(contractTypeStr==='DIGITOVER'||contractTypeStr==='DIGITUNDER')){hypercoverAlternationRef.current.lastDirection=contractTypeStr as 'DIGITOVER'|'DIGITUNDER';if(forcedHypercoverBuy)hypercoverAlternationRef.current.forceNextDirection=false;}
    if(!bought){quickRecoverRef.current.pendingKind=null;
    setNotice('Falha ao enviar a operação para a Deriv.');
    requested.current=false;
    requestStartedAt.current=0;
    stakeReadyRef.current=true;
   }
  },[proposal,buying,activeContractId,running,smartAnalyzer,exitSpotsMode,smartAdvice,botAnalysisValues,aiAnalysisValues,analysisExitValues,ticks,exitSpotReady,tickWindow,tickPipSize,isAuthorized,isConnected,strategy,buy,iaPower,setSmartAdvice,clearProposal,getProposal,symbol,balance?.balance,quickRecoverRevision]); useEffect(()=>{
   if(activeContractId!==null){if(quickRecoverRef.current.pendingKind){quickRecoverRef.current.contracts.set(Number(activeContractId),quickRecoverRef.current.pendingKind);quickRecoverRef.current.pendingKind=null;}
    riskAwaitingContractRef.current=activeContractId;
    stakeReadyRef.current=false;
    requested.current=false;
    requestStartedAt.current=0;
    lastActivityAt.current=Date.now();
    return;
   }

   // Quando o contrato fecha, activeContractId volta a null.
   // É obrigatório libertar o bloqueio de risco; caso contrário o bot
   // acredita que ainda existe uma operação aberta e para para sempre.
   if(riskAwaitingContractRef.current!==null){
    riskAwaitingContractRef.current=null;
    stakeReadyRef.current=true;
    requested.current=false;
    requestStartedAt.current=0;
    lastActivityAt.current=Date.now();
   }
  },[activeContractId]); useEffect(()=>{
 if(!smartAnalyzer){
  setSmartAdvice(null);setAnalyzerHistory([]);lastAdvisorKeyRef.current='';lastAnalyzerEvalTickRef.current=0;
  analyzerLastSwitchTickRef.current=-1000;analyzerLastSwitchAtRef.current=0;pendingAnalyzerStrategyRef.current=null;
  setAnalyzerNotice(null);analyzerDecisionHistoryRef.current=[];return;
 }
 if(exitSpotsMode)return;
 if(aiAnalysisValues.length<25){
  setSmartAdvice(null);setAnalyzerNoticeColor('#64748b');setAnalyzerNotice('A recolher 25 resultados ao vivo...');
  pendingAnalyzerStrategyRef.current=null;return;
 }
 if(!analyze100Ticks)return;
 const analyzerDataVersion=totalTickCountRef.current;
 if(lastAnalyzerEvalTickRef.current>0&&analyzerDataVersion-lastAnalyzerEvalTickRef.current<3)return;
 lastAnalyzerEvalTickRef.current=analyzerDataVersion;

 const result:any=analyze100Ticks;
 const rankings:any[]=Array.isArray(result.rankings)?result.rankings:[result];
 const actionable:any[]=[];
 for(const candidate of rankings){
  const bot=ANALYZER_STRATEGY_TO_BOT[String(candidate.strategy)] as Strategy|undefined;
  if(!bot)continue;
  if(isRecoveryStrategy(bot)){
   const barrier=bot===strategy&&barrierStateRef.current?barrierStateRef.current:initialBarrierState(bot);
   const signal=makeBarrierSignal(aiAnalysisValues,barrier,tickPipSize,65,25);
   const recentConfirmed=confirmBarrierRecent(aiAnalysisValues.slice(-5),barrier,tickPipSize);
   if(signal&&recentConfirmed)actionable.push({...candidate,contract:signal.contract,label:signal.label,strength:signal.strength,entrySignalStrength:signal.strength,noTrade:false,qualityBlocked:false});
  }else{
   const signal=makeSignal(aiAnalysisValues,bot,tickPipSize,false,65,25);
   const recentConfirmed=confirmAnalyzerRecent(aiAnalysisValues,String(candidate.strategy),String(candidate.label),tickPipSize);
   if(signal&&signal.contract===candidate.contract&&recentConfirmed){
    actionable.push({...candidate,contract:signal.contract,strength:signal.strength,entrySignalStrength:signal.strength,noTrade:false,qualityBlocked:false});
   }
  }
 }
 if(!actionable.length){
  pendingAnalyzerStrategyRef.current=null;
  setSmartAdvice({...result,rankings,noTrade:true,qualityBlocked:false});
  setAnalyzerNoticeColor('#64748b');
  setAnalyzerNotice('AGUARDA — gatilho 65% na janela de 25 ticks e confirmação nos últimos 5');
  return;
 }
 actionable.sort((a,b)=>Number(b.score)-Number(a.score));
 const currentActionable=actionable.find(candidate=>ANALYZER_STRATEGY_TO_BOT[String(candidate.strategy)]===strategy);
 const bestActionable=actionable[0];
 const cooldownActive=analyzerDataVersion-analyzerLastSwitchTickRef.current<3;
 const selected=currentActionable&&(Number(currentActionable.score)>=Number(bestActionable.score)-7||cooldownActive)?currentActionable:bestActionable;
 const nextBot=ANALYZER_STRATEGY_TO_BOT[String(selected.strategy)] as Strategy|undefined;
 if(!nextBot)return;
 if(strategy!==nextBot){
  pendingAnalyzerStrategyRef.current=nextBot;
  setStrategy(nextBot);
  analyzerLastSwitchTickRef.current=analyzerDataVersion;
  analyzerLastSwitchAtRef.current=Date.now();
  setAnalyzerNoticeColor(ANALYZER_COLORS[String(selected.strategy)]||'#3D7FFF');
  setAnalyzerNotice('TROCA PARA '+String(selected.strategy)+' — sinal 65% confirmado');
  analyzerAlertSound();
 }else{
  pendingAnalyzerStrategyRef.current=null;
  setAnalyzerNoticeColor(ANALYZER_COLORS[String(selected.strategy)]||'#3D7FFF');
  setAnalyzerNotice('MANTÉM '+String(selected.strategy)+' — 25 ticks + confirmação dos últimos 5');
 }
 const normalized={...selected,rankings,noTrade:false,qualityBlocked:false,currentScore:Number(selected.score)||0,confidenceBand:confidenceBand(Number(selected.score)||0)};
 setSmartAdvice(normalized);
 const entry={time:new Date().toLocaleTimeString(),rankings:actionable.slice(0,3).map((x:any)=>({strategy:x.strategy,label:x.label,score:Math.round(Number(x.score)||0)})),strategy:selected.strategy,label:selected.label,score:Math.round(Number(selected.score)||0),action:strategy===nextBot?'MANTÉM':'TROCA PARA '+String(selected.strategy)};
 analyzerDecisionHistoryRef.current=[entry,...analyzerDecisionHistoryRef.current].slice(0,8);
 setAnalyzerHistory(analyzerDecisionHistoryRef.current);
},[smartAnalyzer,exitSpotsMode,analyze100Ticks,aiAnalysisValues,tickPipSize,strategy]);
useEffect(()=>{
 if(!smartAnalyzer||!exitSpotsAutoEnabled){
  if(!exitSpotsAutoEnabled&&exitSpotsMode)setExitSpotsMode(false);
  return;
 }
 const exitSpotCount=analysisExitValues.length;
 if(exitSpotCount<28){
  setExitSpotsMonitorStatus('A recolher '+exitSpotCount+'/28 Exit Spots fechados; AI Analyst normal continua ativo.');
  if(exitSpotsMode){
   setExitSpotsMode(false);
   setSmartAdvice(null);
   setAnalyzerNoticeColor('#64748b');
   setAnalyzerNotice('Modo Exit Spots: são necessários 28 Exit Spots fechados. A regressar ao AI Analyst normal.');
   pendingAnalyzerStrategyRef.current=null;
  }
  return;
 }

 // If currently trading from Exit Spots, revalidate the actual current strategy
 // and its current barrier, not an unrelated alternative signal.
 if(exitSpotsMode){
  const activeSignal=isRecoveryStrategy(strategy)
   ?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current||initialBarrierState(strategy),tickPipSize)
   :makeExitSpotSignal(analysisExitValues,strategy,tickPipSize,false);
  if(!activeSignal){
   setExitSpotsMode(false);
   setSmartAdvice(null);
   setAnalyzerNoticeColor('#64748b');
   setAnalyzerNotice('Modo Exit Spots: o sinal do contrato atual não atinge 20% em pelo menos 3 dos 4 blocos.');
   setExitSpotsMonitorStatus('Modo Exit Spots: o sinal do contrato atual não atinge 20% em pelo menos 3 dos 4 blocos. AI Analyst normal ativo; a monitorar até o sinal voltar.');
   pendingAnalyzerStrategyRef.current=null;
   return;
  }
  const blocks=Number(activeSignal.agreeingExitSpotBlocks)||0;
  setExitSpotsMonitorStatus('Exit Spots ativo: sinal válido em '+blocks+'/4 blocos; gatilho 20%.');
  // Keep the selected direction current as the rolling 28-result window changes.
  setSmartAdvice((previous:any)=>{
   if(!previous||ANALYZER_STRATEGY_TO_BOT[String(previous.strategy)]!==strategy)return previous;
   return {...previous,contract:activeSignal.contract,label:activeSignal.label,strength:Number(activeSignal.strength)||0,noTrade:false,qualityBlocked:false,exitSpotMode:true,overallExitSpotStrength:Number(activeSignal.overallExitSpotStrength)||Number(activeSignal.strength)||0,recentExitSpotStrength:Number(activeSignal.recentExitSpotStrength)||Number(activeSignal.strength)||0,agreeingExitSpotBlocks:blocks};
  });
  return;
 }

 // In normal mode, keep watching Exit Spots in the background. Switch only
 // when one strategy has a valid 28-result signal and at least 3/4 blocks agree.
 const candidate:any=analyzeExitSpots28(analysisExitValues,tickPipSize);
 if(!candidate){
  setExitSpotsMonitorStatus((previous:string)=>previous.startsWith('Modo Exit Spots: o sinal do contrato atual não atinge 20% em pelo menos 3 dos 4 blocos.')
   ?previous
   :'28 Exit Spots disponíveis; a monitorar em segundo plano por um sinal de 20% com concordância em 3/4 blocos.');
  return;
 }
 const candidateBot=ANALYZER_STRATEGY_TO_BOT[String(candidate.strategy)] as Strategy|undefined;
 if(!candidateBot){
  setExitSpotsMonitorStatus('A monitorar Exit Spots; ainda não existe uma estratégia elegível.');
  return;
 }
 let selected:any=candidate;
 if(isRecoveryStrategy(candidateBot)){
  const barrier=candidateBot===strategy&&barrierStateRef.current?barrierStateRef.current:initialBarrierState(candidateBot);
  const barrierSignal=makeExitSpotBarrierSignal(analysisExitValues,barrier,tickPipSize);
  if(!barrierSignal){
   setExitSpotsMonitorStatus('A monitorar Exit Spots; o contrato de recuperação ainda não cumpre 20% em 3/4 blocos.');
   return;
  }
  selected={...candidate,contract:barrierSignal.contract,label:barrierSignal.label,strength:barrierSignal.strength,overallExitSpotStrength:barrierSignal.overallExitSpotStrength,recentExitSpotStrength:barrierSignal.recentExitSpotStrength,agreeingExitSpotBlocks:barrierSignal.agreeingExitSpotBlocks};
 }
 // Do not switch the underlying strategy in the middle of a live contract/proposal.
 if(activeContractId!==null||proposal||buying){
  setExitSpotsMonitorStatus('Sinal Exit Spots disponível; a aguardar que a operação atual termine para migrar com segurança.');
  return;
 }
 if(candidateBot!==strategy&&isRecoveryStrategy(candidateBot)){
  // The candidate was qualified against its initial barrier; start that strategy
  // with the same barrier while the strategy-change effect synchronizes UI state.
  barrierStateRef.current=initialBarrierState(candidateBot);
 }
 if(strategy!==candidateBot){
  pendingAnalyzerStrategyRef.current=candidateBot;
  setStrategy(candidateBot);
  analyzerLastSwitchTickRef.current=totalTickCountRef.current;
  setAnalyzerNoticeColor(ANALYZER_COLORS[String(candidate.strategy)]||'#3D7FFF');
  setAnalyzerNotice('SINAL EXIT SPOTS DETETADO — a migrar para '+String(candidate.strategy)+' · gatilho 20%');
  analyzerAlertSound();
 }else{
  pendingAnalyzerStrategyRef.current=null;
  setAnalyzerNoticeColor(ANALYZER_COLORS[String(candidate.strategy)]||'#3D7FFF');
  setAnalyzerNotice('SINAL EXIT SPOTS DETETADO — '+String(candidate.strategy)+' · gatilho 20%');
 }
 setSmartAdvice({...selected,noTrade:false,qualityBlocked:false,currentScore:Number(selected.score)||0,confidenceBand:confidenceBand(Number(selected.score)||0),exitSpotMode:true});
 setExitSpotsMode(true);
 setExitSpotsMonitorStatus('Exit Spots ativo: sinal válido em '+(Number(selected.agreeingExitSpotBlocks)||0)+'/4 blocos; gatilho 20%.');
 const entry={time:new Date().toLocaleTimeString(),rankings:[{strategy:selected.strategy,label:selected.label,score:Math.round(Number(selected.score)||0)}],strategy:selected.strategy,label:selected.label,score:Math.round(Number(selected.score)||0),action:'ENTRA EM EXIT SPOTS'};
 analyzerDecisionHistoryRef.current=[entry,...analyzerDecisionHistoryRef.current].slice(0,8);
 setAnalyzerHistory(analyzerDecisionHistoryRef.current);
},[smartAnalyzer,exitSpotsAutoEnabled,exitSpotsMode,analysisExitValues,tickPipSize,strategy,activeContractId,proposal,buying]);

  useEffect(()=>{if(!running||stopped.current)return;const accountCurrency=normalizeCurrency(balance?.currency,currency);const targetInAccountCurrency=Number(target)*CURRENCY_RATES[accountCurrency];const lossLimitInAccountCurrency=Number(lossLimit)*CURRENCY_RATES[accountCurrency];if(pnl>=targetInAccountCurrency){stopped.current=true;requested.current=false;requestStartedAt.current=0;setRunning(false);setNotice(`🎯 ${t('goalReached')}: ${money(pnl,accountCurrency)}`);sound('target')}else if(pnl<=-lossLimitInAccountCurrency){if(quickRecoverRef.current.active){setNotice(`QUICK RECOVER continua apesar do limite de perda: défice por recuperar ${quickRecoverRef.current.deficit.toFixed(2)}. O limite de perda será reavaliado quando a recuperação terminar.`);return;}stopped.current=true;requested.current=false;requestStartedAt.current=0;setRunning(false);setNotice(`🛑 ${t('lossGoal')}: ${money(pnl,accountCurrency)}`);sound('loss')}},[pnl,target,lossLimit,currency,balance?.currency,running,smartAnalyzer,t]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),5000);return()=>clearTimeout(timer)},[notice]);
 const togglePower=(enabled:boolean)=>{if(running)return;setIaPower(enabled);setSonic(false);sonicRef.current.reset();setSorosEnabled(!enabled);setStakeManagerVersion(v=>v+1)};
 const toggleSonic=(enabled:boolean)=>{if(running)return;setSonic(enabled);setIaPower(false);sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});setSorosEnabled(!enabled);setStakeManagerVersion(v=>v+1)};
 const start=()=>{iaRecoveryQuotePendingRef.current=false;const availableBalance=Number(balance?.balance);if(!isConnected||!isAuthorized||!Number.isFinite(availableBalance)||availableBalance<=0)return false;quickRecoverQuoteTargetRef.current=null;quickRecoverPausedForBalanceRef.current=false;quickRecoverRef.current.pendingKind=null;setQuickRecoverRevision(v=>v+1);botArmedRef.current=true;setSorosEnabled(!iaPower&&!sonic);const cappedInitialStake=Math.min(Math.max(0.35,Number(stake)||0.35),availableBalance);gestorRef.current=criarGestorStake({stakeBase:cappedInitialStake,payout:lastPayoutRatioRef.current,maxNiveisMartingale:maxMartingale});const sonicBaseStake=Math.min(Math.max(0.35,Number(stake)||0.35),availableBalance);sonicRef.current=createSonicStakeManager({baseStake:sonicBaseStake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});processedStakeContractsRef.current.clear();processedSonicContractsRef.current.clear();pendingRiskStakeRef.current=null;for(const tx of profitTransactions){const id=Number(tx.contract_id);if(!Number.isFinite(id)||id<=0)continue;processedStakeContractsRef.current.add(id);processedSonicContractsRef.current.add(id);}lastProcessedStakeResult.current=latest?.contract_id??null;lastProcessedSonicResult.current=latest?.contract_id??null;stakeReadyRef.current=true;stopped.current=false;requested.current=false;requestStartedAt.current=0;lastRequestedClose.current=contractClosedSeq;lastActivityAt.current=Date.now();totalTickCountRef.current=0;lastAnalyzerEvalTickRef.current=0;analyzerStableKeyRef.current=null;analyzerStableCountRef.current=0;analyzerLastSwitchTickRef.current=-1000;setTicks([]);setSignalNow(null);setRunning(true);return true};
 const stop=()=>{saveStakeState();iaRecoveryQuotePendingRef.current=false;botArmedRef.current=false;stopped.current=true;requested.current=false;requestStartedAt.current=0;riskAwaitingContractRef.current=null;stakeReadyRef.current=true;setRunning(false);setSignalNow(null)}; const refreshAiAnalystAccess=useCallback(async()=>{try{const response=await fetch('/api/ai-analyst/access',{cache:'no-store'});const data=await response.json().catch(()=>null);setAiAnalystActive(Boolean(data?.active));setAiAnalystExpiresAt(data?.expiresAt?String(data.expiresAt):null);return Boolean(data?.active)}catch{setAiAnalystActive(false);setAiAnalystExpiresAt(null);return false}},[]);
 useEffect(()=>{void refreshAiAnalystAccess()},[refreshAiAnalystAccess]);
 const toggleAnalyzer=useCallback((enabled:boolean)=>{if(enabled){if(!aiAnalystActive){setCashierAction('ai_analyst');setNotice('AI Analyst: assinatura mensal de 250 MT / $3 USD.');return}setExitSpotsMode(false);if(running){setSmartAnalyzer(true);return}if(start()){setRunning(false);setSmartAnalyzer(true)}else{setNotice(!isConnected?'A ligar ao Deriv...':!isAuthorized?'Autenticação Deriv necessária':'Saldo indisponível para iniciar o Analyst.')}}else{setExitSpotsMode(false);setSmartAnalyzer(false);if(!running)stop()}},[aiAnalystActive,running,isConnected,isAuthorized,start,stop]);
 const logout=()=>{stop();try{for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith('mozhyper-stake-state-v2:')||k?.startsWith('mozhyper-risk-state-v3:')||k?.startsWith('mozhyper-daily-history-v1:')||k==='mozhyper-active-user-v1')localStorage.removeItem(k)}}catch{}resetTradingSession();setMenu(false);window.location.assign('/api/auth/logout')};
 const iaStateStorageKey=`mozhyper-risk-state-v3:${account}:${symbol}:${stake.toFixed(2)}:ia`;
 const sonicStateStorageKey=`mozhyper-risk-state-v3:${account}:${symbol}:${stake.toFixed(2)}:sonic`;
 const saveStakeState=()=>{try{if(iaPower){localStorage.setItem(iaStateStorageKey,JSON.stringify({mode:'ia',state:gestorRef.current.getEstado(),savedAt:Date.now()}))}else if(sonic){localStorage.setItem(sonicStateStorageKey,JSON.stringify({mode:'sonic',state:sonicRef.current.getState(),savedAt:Date.now()}))}}catch{}};
 const restoreStakeState=()=>{try{const key=iaPower?iaStateStorageKey:sonic?sonicStateStorageKey:'';if(!key)return;const raw=localStorage.getItem(key);if(!raw)return;const saved=JSON.parse(raw);if(iaPower&&saved?.mode==='ia'&&saved?.state){gestorRef.current.restaurarEstado(saved.state)}else if(sonic&&saved?.mode==='sonic'&&saved?.state){sonicRef.current.restore(saved.state)}setStakeManagerVersion(v=>v+1)}catch{}};
 const clearHistoryAndStartNewCycle=()=>{
  if(running)return;
  stopped.current=false;
  requested.current=false;
  requestStartedAt.current=0;
  stakeReadyRef.current=true;
  lastProcessedStakeResult.current=null;
  lastProcessedSonicResult.current=null;
  processedStakeContractsRef.current.clear();
  processedSonicContractsRef.current.clear();
  pendingRiskStakeRef.current=null;
  lastRequestedClose.current=contractClosedSeq;
  gestorRef.current=criarGestorStake({stakeBase:stake,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale});
  sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});
  barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null;
  try{localStorage.removeItem(iaStateStorageKey);localStorage.removeItem(sonicStateStorageKey)}catch{}
  setTicks([]);
  setSignalNow(null);
  setLastDigitSeen(null);
  setStakeManagerVersion(v=>v+1);
  resetTradingSession();
  setNotice('Histórico e prejuízo limpos — novo ciclo iniciado');
 };
 useEffect(()=>{if(!running)restoreStakeState()},[account,symbol,maxMartingale,running]);
 useEffect(()=>{if(!running)return;const id=window.setInterval(()=>{if(Date.now()-lastActivityAt.current<=8000)return;if(riskAwaitingContractRef.current===null){requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;subscribeTicks(symbol);lastActivityAt.current=Date.now()}else{fetchProfitTable({limit:50,offset:0,sort:'DESC'});lastActivityAt.current=Date.now()}},4000);return()=>clearInterval(id)},[running,symbol,subscribeTicks,fetchProfitTable]);
 useEffect(()=>{const handleOutsideWalletClick=(event:MouseEvent)=>{const target=event.target as Node|null;if(target && (target as Element).closest?.('.cashier-wrap'))return;setCashierOpen(false)};document.addEventListener('mousedown',handleOutsideWalletClick);return()=>document.removeEventListener('mousedown',handleOutsideWalletClick)},[]);
 const light=theme==='dark'?false:true;
 return <div className="mx-auto w-full max-w-[1400px] p-3 md:p-5" style={{color:light?'#0f172a':'#f8fafc'}}>{analyzerNotice&&<div className="fixed left-1/2 top-0 z-[300] w-[min(88vw,420px)] -translate-x-1/2 rounded-xl bg-white px-3 py-2 text-center text-[10px] font-black shadow-2xl md:top-1 md:px-4 md:py-2.5 md:text-[11px]" style={{color:analyzerNoticeColor,border:'2px solid '+analyzerNoticeColor,boxShadow:'0 8px 24px -10px '+analyzerNoticeColor}}>{analyzerNotice}</div>}<style>{`body{background:var(--bg,#07111f);color:var(--text,#f8fafc);transition:background .2s,color .2s}.av4{background:${light?'#f8fafc':'#071936'};border:1px solid #facc15;border-radius:18px;padding:clamp(12px,2vw,24px)}.av4 .card{background:${light?'#fff':'#0d2347'};border:1px solid ${light?'#d5deea':'#294b78'};border-radius:14px}.av4 .balance-card,.av4 .menu-trigger{background:transparent;border:0;border-radius:0}.av4 .profit-card{background:${light?'#fff':'#0d2347'};border:1px solid #facc15;border-radius:14px}.av4 .account-strategy{display:grid;grid-template-columns:1fr 1fr;background:${light?'#fff':'#0d2347'};border:1px solid #facc15;border-radius:14px;overflow:hidden}.av4 .account-strategy>label{border:0;border-radius:0}.av4 .account-strategy>label+label{border-left:1px solid #facc15}.av4 .muted{color:${light?'#64748b':'#94a3c1'}}.av4 select,.av4 input{color:${light?'#0f172a':'#f8fafc'}}.av4 .hist{display:flex;gap:6px;overflow-x:auto}.av4 .trade{min-width:88px;padding:6px;border-radius:9px;border:1px solid ${light?'#d5deea':'#334e78'}}.av4 .notice{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:200;min-width:min(92vw,360px);padding:13px 16px;border-radius:14px;background:#0f2345;color:#fff;border:1px solid #3b82f6;box-shadow:0 14px 35px rgba(0,0,0,.35);text-align:center;font-weight:800;font-size:13px}.av4 .modal-backdrop{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px}.av4 .modal{width:min(94vw,380px);background:${light?'#fff':'#0d2347'};border:1px solid ${light?'#d5deea':'#294b78'};border-radius:16px;padding:18px}.header-actions{display:flex;align-items:center;gap:12px;position:relative}.cashier-wrap{position:static}.cashier-menu{position:absolute;right:0;left:auto;top:42px;z-index:300;width:min(94vw,390px);box-sizing:border-box;padding:16px 10px 14px;border:1px solid #293241;background:#171c24;color:#fff;border-radius:0 0 18px 18px;box-shadow:0 18px 40px -16px rgba(0,0,0,.65);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.cashier-menu button{min-width:0;border:0;background:transparent;color:#fff;padding:0 2px;text-align:center;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:7px;white-space:nowrap;transition:background .15s}.cashier-menu button:hover{background:rgba(255,255,255,.06)}.cashier-menu .cashier-icon{width:56px;height:56px;border:2px solid #e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:300;line-height:1;box-sizing:border-box}.cashier-menu .cashier-icon.deposit{background:#ff4654;border-color:#ff4654}.cashier-menu .cashier-icon.transfer{font-size:28px}.cashier-menu .cashier-icon.withdraw{font-size:31px}@media(max-width:480px){.cashier-menu{right:0;width:min(94vw,370px);padding:15px 7px 13px}.cashier-menu .cashier-icon{width:54px;height:54px}.cashier-menu button{font-size:12.5px;gap:6px}}.icon-btn{width:auto;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer}.icon-btn:hover{background:transparent}.whatsapp-header{width:auto;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:#25D366;display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;line-height:0}.whatsapp-header:hover{background:transparent;color:#20bd5a}.whatsapp-header svg{width:20px;height:20px;display:block}.menu-trigger{width:auto;height:auto;padding:0;border:0;background:transparent;color:var(--text);font-size:22px;line-height:1;cursor:pointer}.menu-trigger:hover{background:transparent}.menu-popover{position:absolute;right:0;top:32px;z-index:80;width:160px;padding:6px;border:1px solid #294b78;background:#071936;border-radius:8px;box-shadow:0 18px 35px -12px #000}.menu-popover button{background:transparent;border:0;color:#fff}.ia-power{display:flex;align-items:center;justify-content:space-between;gap:12px}.ia-toggle{width:48px;height:28px;border:0;border-radius:999px;padding:3px;cursor:pointer;transition:.2s;background:#ff444f}.ia-toggle.on{background:#25D366}.ia-toggle span{display:block;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s;transform:translateX(0)}.ia-toggle.on span{transform:translateX(20px)}.ia-badge{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.closed-operations-label,.closed-operations-count{color:${light?'#64748b':'#94a3b8'}!important}.digits-title{font-size:11px;font-weight:900;text-transform:uppercase}.last-digit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:900}`}</style><div className="av4">
 <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><img src="/icon.svg?v=2" width="40" height="40" className="rounded-xl object-cover" alt="MozHyper" /><div><b className="text-lg">Moz<span className="text-blue-500">Hyper</span></b><div className="text-[9px] uppercase muted">Negocia mais rápido</div></div></div><div className="header-actions"><div className="cashier-wrap"><button type="button" className="icon-btn" onClick={()=>setCashierOpen(v=>!v)} aria-label="Payment Agent" title="Payment Agent"><WalletIcon size={20} color={light?'#53627a':'#fff'} /></button>{cashierOpen&&<div className="cashier-menu"><button type="button" onClick={()=>{setCashierOpen(false);if(isPaymentAgentCurrencyAllowed(currency)){setCashierAction('deposit')}else{window.location.assign('https://deriv.com/')}}}><span className="cashier-icon deposit">＋</span><span>{t('deposit')}</span></button><button type="button" onClick={()=>{setCashierOpen(false);if(isPaymentAgentCurrencyAllowed(currency)){setCashierAction('withdraw')}else{window.location.assign('https://deriv.com/')}}}><span className="cashier-icon withdraw">−</span><span>{t('withdraw')}</span></button></div>}<PaymentAgentCashier open={cashierAction!==null && (cashierAction==='ai_analyst' || cashierAction==='course' || isPaymentAgentCurrencyAllowed(currency))} action={cashierAction} currency={currency} light={light} onClose={()=>{setCashierAction(null);void refreshAiAnalystAccess()}} onNotice={setNotice}/></div><a className="whatsapp-header" href="https://whatsapp.com/channel/0029Vb7xMatF1YlUQlYhH81t" target="_blank" rel="noopener" aria-label="Canal de suporte no WhatsApp" title="Canal de suporte no WhatsApp"><WhatsAppIcon size={20} color="#25d366" /></a><button className="icon-btn" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="Alternar tema" title="Alternar tema claro/escuro">{theme==='dark'?'☀️':'🌙'}</button><button className="menu-trigger" onClick={()=>setMenu(!menu)} aria-label="Abrir menu">⋯</button>{menu&&<div className="menu-popover">{userName&&<div className="px-2 pb-2 pt-1 text-[11px] font-bold leading-5" style={{color:'#25D366'}}><div>{greeting}, {userName}</div><div className="mt-2 flex items-center gap-1 text-[10px] font-bold" style={{color:'#25D366'}}><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>{203+onlineUsers} online</div></div>}<div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase text-slate-400">Moeda</div><select className="w-full rounded-lg bg-slate-800 p-2 text-xs font-bold text-white" value={currency} onChange={e=>setCurrency(e.target.value as Currency)}>{currencyOptions.map(c=><option key={c} value={c}>{CURRENCY_LABELS[c]||getCurrencyMeta(c).symbol}</option>)}</select><button className="mt-1 w-full p-2 text-left text-xs" onClick={()=>{setMetas(true);setMenu(false)}}>{t('meta')}</button><button className="w-full p-2 text-left text-xs" onClick={()=>{setMenu(false);setCourseSection('course');setMozHyperCourse(true);void fetch('/api/course/access',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>setCourseUnlocked(Boolean(data?.active))).catch(()=>undefined)}}>📚 {t('completeCourse')}</button><button className="w-full p-2 text-left text-xs" onClick={()=>{setTheme(theme==='dark'?'light':'dark');setMenu(false)}}>{t('theme')}</button><button className="w-full p-2 text-left text-xs font-semibold" onClick={()=>{setSupportOpen(true);setMenu(false)}}>MozHyper Support</button><button className="w-full p-2 text-left text-xs text-red-400" onClick={logout}>{t('logout')}</button></div>}</div></div>
 {supportOpen&&<div className="modal-backdrop" onClick={()=>setSupportOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>{t('supportTitle')}</b><button type="button" onClick={()=>setSupportOpen(false)}>✕</button></div><div className="mt-2 text-[10px] muted">{t('supportChoose')}</div><div className="mt-4 grid gap-3"><a href="https://wa.me/258879084091" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-500 p-3 text-center text-sm font-bold text-white no-underline">WhatsApp</a><a href="https://t.me/Matosfx1" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-blue-500 p-3 text-center text-sm font-bold text-white no-underline">Telegram</a></div></div></div>}<div className="mt-3 grid grid-cols-2 gap-3"><div className="balance-card p-4"><div className="text-[10px] uppercase muted">{t('balance')}</div><b className="text-lg" style={{color:light?'#0f172a':'#fff'}}>{balance&&Number.isFinite(Number(balance.balance))?`${(Number(balance.balance)*CURRENCY_RATES[currency]).toFixed(2)} ${CURRENCY_LABELS[currency]}`:'—'}</b></div><div className="profit-card p-4"><div className="text-[10px] uppercase muted">{t('profitLoss')}</div><b className={`text-lg ${pnl>=0?'text-emerald-500':'text-red-500'}`}>{money(pnl,currency)}</b><div className="mt-1 text-[10px] font-bold muted"><span className="closed-operations-label">{t('closedOperations')}:</span> <span className="closed-operations-count">{closedOperations}</span></div></div></div>
 <div className="account-strategy mt-3"><label className="p-3 text-xs">{t('account')}<select className="mt-1 w-full bg-transparent font-bold" value={account} onChange={e=>setAccount(e.target.value as 'demo'|'real')} disabled={running||smartAnalyzer}><option value="demo">{t('demo')}</option><option value="real">{t('real')}</option></select></label><label className="p-3 text-xs">{t('strategy')}<select className="mt-1 w-full bg-transparent font-bold" value={strategy} onChange={e=>{if(running||smartAnalyzer)return;botArmedRef.current=false;stopped.current=true;requested.current=false;requestStartedAt.current=0;setSignalNow(null);setStrategy(e.target.value as Strategy)}} disabled={running||smartAnalyzer}><option value="PAR_IMPAR">HyperDrive</option><option value="ACIMA5_BAIXO4">HyperStrike</option><option value="RISE_FALL">HyperForce</option><option value="DIFERENTE">HyperNova</option><option value="MATCH0">HyperFlow</option><option value="HYPERLITE">Hyperlite</option><option value="HYPERGUARD">HyperGuard</option><option value="HYPERSHIELD">HyperShield</option><option value="HYPERBREAK">HyperBreak</option><option value="HYPERSWAP">HyperSwap</option><option value="HYPERCOVER">Hypercover</option></select></label></div>
 <div className="card mt-3 p-3"><div className="flex items-center justify-between gap-2"><div className="shrink-0"><div className="digits-title">{t('digitLabel')}: <span className="last-digit" style={{color:'#ff444f'}}>{displayedExitDigit??'—'}</span></div></div><div className="min-w-0 flex-1 px-2 text-center"><span className="text-[9px] font-black uppercase tracking-[0.08em]" style={{color:!running?'#64748b':contractStage==='aberto'?'#64748b':contractStage==='fechado'?'var(--win)':'#ff444f'}}>{!running?t('stopped'):contractStage==='aberto'?t('contractOpen'):contractStage==='fechado'?t('contractClosedStage'):t('contractClosing')}</span></div><div className="flex shrink-0 items-center gap-1"><button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold" onClick={()=>setDigitView(v=>v==='bars'?'chart':'bars')} title={digitView==='bars'?'Ver Exit Spots':'Ver barras de dígitos'} aria-label={digitView==='bars'?'Ver Exit Spots':'Ver barras de dígitos'}>{digitView==='bars'?'⌁':'▥'}</button><select className="rounded-lg bg-transparent px-2 py-1 text-xs font-bold" value={tickWindow} onChange={e=>setTickWindow(Number(e.target.value))} disabled={running}>{[5,9,10,25,50,100,200].map(n=><option key={n} value={n}>{n} ticks</option>)}</select></div></div>{digitView==='bars'?<><div className="mt-1 text-[9px] font-bold muted">TICKS AO VIVO · ÚLTIMOS {tickWindow}</div><div className="digits-bars mt-1 grid h-[86px] md:h-[100px] grid-cols-10 items-end gap-1">{(()=>{const values=ticks.slice(-tickWindow),probs=stats(values,tickPipSize).probs,hasData=values.length>0&&probs.some(p=>p>0),shown=hasData?probs:Array.from({length:10},()=>0),maxP=Math.max(...shown,1),minPositive=Math.min(...shown.filter(p=>p>0).concat([101]));return shown.map((p,i)=>{const isMax=p===maxP&&p>0,isMin=p>0&&p===minPositive,barColor=isMax?'bg-emerald-500':isMin?'bg-red-500':'bg-slate-300',percentColor=isMax?'text-emerald-600':isMin?'text-red-500':'muted',barHeight=p>0?Math.max(5,Math.round((p/100)*48)):2;return <div key={i} className="relative flex h-full flex-col items-center text-center"><div className={`absolute inset-x-0 top-0 text-[8px] font-bold ${percentColor}`}>{Math.round(p)}%</div><div className="absolute inset-x-0 bottom-[16px] flex items-end justify-center"><div className={`mx-auto rounded-sm ${barColor}`} style={{height:`${barHeight}px`,width:'8px'}}/></div><div className="absolute inset-x-0 bottom-0 text-[8px] muted">{i}</div></div>})})()}</div></>:<div className="mt-3 -mx-3 rounded-xl border p-3" style={{background:light?'#f8fafc':'#020617',borderColor:light?'#cbd5e1':'#334155'}} aria-label="Gráfico de Exit Spots">
 <div className="mb-2 flex items-center justify-between gap-2 text-[8px] font-bold" style={{color:light?'#475569':'#94a3b8'}}>
  <span>EXIT SPOT · PREÇO FINAL REAL · ÚLTIMOS 28</span>
  <span>{Math.min(analysisExitValues.length,28)}/28 resultados</span>
 </div>
 <div className="digits-bars mt-1 grid h-[86px] md:h-[100px] grid-cols-10 items-end gap-1">
  {(()=>{const values=analysisExitValues.slice(-28),rawProbs=stats(values,tickPipSize).probs,hasData=values.length>0&&rawProbs.some(p=>p>0),maxRaw=Math.max(...rawProbs,0),probs=hasData&&maxRaw>0?rawProbs.map(p=>p/maxRaw*100):Array.from({length:10},()=>0),maxP=Math.max(...probs,1),minPositive=Math.min(...probs.filter(p=>p>0).concat([101]));return probs.map((p,i)=>{const isMax=p===maxP&&p>0,isMin=p>0&&p===minPositive,barColor=isMax?'bg-emerald-500':isMin?'bg-red-500':'bg-slate-300',percentColor=isMax?'text-emerald-600':isMin?'text-red-500':'muted',barHeight=p>0?Math.max(5,Math.round((p/100)*48)):2,isExitDigit=chartExitDigit===i&&analysisExitValues.length>0;return <div key={i} title={isExitDigit?'Dígito final real do contrato (exit_spot): '+chartExitDigit:undefined} className="relative flex h-full flex-col items-center text-center"><div className={`absolute inset-x-0 top-0 text-[8px] font-bold ${percentColor}`}>{Math.round(p)}%</div><div className="absolute inset-x-0 bottom-[16px] flex items-end justify-center"><div className={`mx-auto rounded-sm ${barColor}`} style={{height:`${barHeight}px`,width:'8px'}}/></div><div className={`absolute inset-x-0 bottom-0 text-[8px] ${isExitDigit?'font-black text-blue-600':'muted'}`}>{i}{isExitDigit?' E':''}</div></div>})})()}
 </div>
 {analysisExitValues.length===0&&<div className="mt-1 text-[9px] muted">Aguardando contratos encerrados com exit_spot real.</div>}
</div>}</div>

 <div ref={historyRef} className="card relative mt-2 p-2" style={{borderColor:'#facc15'}}><div className="flex items-center justify-between gap-2"><b className="text-[10px] uppercase muted">{t('recentHistory')}</b><div className="flex items-center gap-2"><span className={`mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${smartAnalyzer?(exitSpotsMode?'bg-blue-500':'bg-emerald-500'):'bg-slate-400'}`} title={smartAnalyzer?(exitSpotsMode?'AI Analyst · Exit Spots':'AI Analyst · normal'):'AI Analyst desligado'} aria-label={smartAnalyzer?(exitSpotsMode?'AI Analyst Exit Spots ativo':'AI Analyst normal ativo'):'AI Analyst desligado'}/><button type="button" onClick={()=>setSoundEnabled(v=>{const next=!v;try{localStorage.setItem('mozhyper-sound-enabled',String(next))}catch{};return next})} className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-300/50 text-slate-500" title={soundEnabled?'Desligar som':'Ligar som'} aria-label={soundEnabled?'Desligar som':'Ligar som'}>{soundEnabled?'🔊':'🔇'}</button><button type="button" onClick={clearHistoryAndStartNewCycle} disabled={running} className="flex h-6 w-6 items-center justify-center rounded-lg border border-red-500/70 text-red-500 disabled:cursor-not-allowed disabled:opacity-40" title="Limpar histórico e começar novo ciclo" aria-label="Limpar histórico e começar novo ciclo"><TrashIcon size={14} /></button><button type="button" onClick={()=>setHistoryOpen(v=>!v)} className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-300/50 text-slate-500" aria-label={t('dailyHistory')} title={t('dailyHistory')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" className={historyOpen?'rotate-180':''}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div></div>{historyOpen&&<div className="absolute right-3 top-14 z-[120] w-[min(92vw,360px)] max-h-[78vh] overflow-y-auto rounded-2xl border border-slate-300/40 bg-white p-4 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white"><div className="flex items-center justify-between gap-3"><b className="text-xs uppercase tracking-wide">{t('dailyHistory')}</b><button type="button" onClick={()=>setHistoryOpen(false)} className="text-base muted" aria-label={t('close')}>✕</button></div><div className="mt-3"><label className="block text-[10px] font-bold uppercase muted">{t('selectDate')}</label><div className="mt-2 flex items-center gap-2"><input type="date" value={historyDate} onChange={e=>setHistoryDate(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300/60 bg-transparent px-3 py-2 text-xs font-bold" /><button type="button" onClick={()=>setHistoryDate(localDateValue())} className="shrink-0 rounded-xl border border-blue-500/40 px-3 py-2 text-[10px] font-black text-blue-500">{t('today')}</button></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-slate-300/40 p-3"><div className="text-[9px] font-bold uppercase muted">{t('totalProfitLoss')}</div><div className={dailyPnl>=0?'mt-1 text-base font-black text-emerald-500':'mt-1 text-base font-black text-red-500'}>{money(dailyPnl,currency)}</div></div><div className="rounded-xl border border-slate-300/40 p-3"><div className="text-[9px] font-bold uppercase muted">{t('closedOperations')}</div><div className="mt-1 text-base font-black">{dailyTransactions.length}</div><div className="mt-1 text-[9px] font-bold"><span className="text-emerald-500">{t('win')} {dailyWins}</span><span className="mx-1 muted">/</span><span className="text-red-500">{t('loss')} {dailyLosses}</span></div></div></div><div className="mt-4"><div className="mb-2 text-[10px] font-bold uppercase muted">{t('resultsByBot')}</div>{dailyByBot.length?dailyByBot.map(([bot,g])=><div key={bot} className="mb-2 rounded-xl border border-slate-300/40 p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs">{bot}</b><b className={g.pnl>=0?'text-xs text-emerald-500':'text-xs text-red-500'}>{money(g.pnl,currency)}</b></div><div className="mt-1 text-[9px] muted">{g.count} · <span className="text-emerald-500">{t('win')} {g.wins}</span> · <span className="text-red-500">{t('loss')} {g.losses}</span></div></div>):<div className="rounded-xl border border-dashed border-slate-300/40 p-3 text-[10px] muted">{t('noTransactions')}</div>}</div><button type="button" onClick={()=>setHistoryOpen(false)} className="mt-3 w-full rounded-xl border border-slate-300/40 p-2.5 text-[10px] font-bold">{t('close')}</button></div>}<div className="hist mt-2">{profitTransactions.slice(0,12).map(x=>{const p=Number(x.profit_loss||0);return <div className="trade" key={x.contract_id}><div className={`mx-auto mb-1 h-5 w-2 rounded-sm ${p>=0?'bg-blue-500':'bg-red-500'}`}></div><b className={p>=0?'text-emerald-500':'text-red-500'}>{p>=0?t('win'):t('loss')}</b><div className="mt-0.5 max-w-full truncate text-[8px] font-semibold leading-tight muted">{(()=>{const botNames:Record<string,string>={ACIMA5_BAIXO4:'HyperStrike',PAR_IMPAR:'HyperDrive',RISE_FALL:'HyperForce',DIFERENTE:'HyperNova',HYPERLITE:'Hyperlite',HYPERGUARD:'HyperGuard',HYPERSHIELD:'HyperShield',HYPERBREAK:'HyperBreak',HYPERSWAP:'HyperSwap'};return botNames[String(x.bot||'')]||String(x.bot||'Estratégia')})()}</div>{String(x.bot||'').startsWith('Manual')&&<div className="mt-0.5 text-[8px] leading-tight muted">{String(x.contract_type||'').toUpperCase()} · {language==='en'?'barrier':'barreira'} {x.barrier??'—'} · {language==='en'?'exit digit':'dígito final'} {x.exit_spot!=null?digit(x.exit_spot,tickPipSize)??'—':'—'}</div>}<div className="font-mono text-[11px] leading-tight">{money(p,currency)}</div></div>})}{!profitTransactions.length&&<div className="p-3 text-xs muted">{t('noTransactions')}</div>}</div></div>
 <button className={`mt-3 w-full rounded-xl p-4 font-bold text-white ${running?'bg-red-600':'bg-blue-600'}`} disabled={!isConnected||!isAuthorized} onClick={running?stop:start}>{running?`■ ${t('stop')}`:`▶ ${t('start')}`}</button>
 <div className="card mt-3 p-4" style={{borderColor:'#facc15'}}><div className="text-[10px] uppercase muted">{t('riskManagement')}</div><div className="mt-3 flex items-center justify-between"><button className={`h-9 w-9 rounded-lg ${light?"bg-slate-300 text-slate-700":"bg-slate-950 text-white"}`} disabled={running||smartAnalyzer} onClick={()=>setStake(x=>Math.max(IA_MIN_STAKE,Number((x-.1).toFixed(2))))}>−</button><b className="font-mono text-xl">${stake.toFixed(2)}</b><button className={`h-9 w-9 rounded-lg ${light?"bg-slate-300 text-slate-700":"bg-slate-950 text-white"}`} disabled={running||smartAnalyzer} onClick={()=>setStake(x=>Number((x+.1).toFixed(2)))}>+</button></div></div>
 <div className="mt-2">
  <button type="button" className="w-full rounded-xl border p-2 text-left text-xs font-black" style={{borderColor:'#3b82f6',background:light?'#eff6ff':'#0d2347',color:light?'#1d4ed8':'#bfdbfe'}} onClick={()=>setManualPanelOpen(v=>!v)} aria-expanded={manualPanelOpen}>
   <span className="flex items-center justify-between gap-2"><span>Manual</span><span>{manualPanelOpen?'−':'＋'}</span></span>
  </button>
  {manualPanelOpen&&<div className="card mt-1 p-1.5" style={{borderColor:'#3b82f6'}}>
   <div className="mb-1 flex items-center justify-between gap-2"><b className="text-[10px] uppercase">{language==='en'?'Manual trading':language==='es'?'Operación manual':'Operação manual'}</b><span className="text-[9px] muted">{SYMBOLS[symbol]}</span></div>
   <label className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold">{language==='en'?'Stake':language==='es'?'Apuesta':'Stake'} ({String(balance?.currency||'USD')})
    <input type="number" min="0.35" max={Number.isFinite(Number(balance?.balance))?Number(balance?.balance):undefined} step="0.01" inputMode="decimal" value={manualStake} onChange={e=>setManualStake(e.target.value===''?0:Number(e.target.value))} disabled={running||smartAnalyzer||buying||activeContractId!==null} className="w-24 rounded-lg border border-slate-300/60 bg-transparent px-2 py-1.5 text-sm font-black"/>
   </label>
   <div className="grid grid-cols-2 gap-1.5">
    <div className="min-w-0 rounded-lg border p-1.5" style={{borderColor:light?'#86efac':'#166534'}}>
     <div className="text-[10px] font-black text-emerald-600">{language==='en'?'ABOVE':language==='es'?'POR ENCIMA':'ACIMA DE'}</div>
     <label className="mt-1 block text-[9px] muted">{language==='en'?'Number (0–8)':language==='es'?'Número (0–8)':'Número (0–8)'}
      <input type="number" inputMode="numeric" min="0" max="8" step="1" value={manualAboveBarrier} onChange={e=>setManualAboveBarrier(e.target.value)} onBlur={()=>setManualAboveBarrier(String(Math.min(8,Math.max(0,Math.floor(Number(manualAboveBarrier)||0)))))} disabled={running||smartAnalyzer||buying||activeContractId!==null} className="mt-1 w-full rounded-lg border border-slate-300/60 bg-transparent px-2 py-1 text-base font-black"/>
     </label>
     <div className="mt-1 text-[9px] muted">{language==='en'?'Block frequency':language==='es'?'Frecuencia del bloque':'Frequência no bloco'}: <b>{tickDataReady?Math.round(selectedTickDigits.filter(d=>d>Number(manualAboveBarrier||0)).length/Math.max(1,selectedTickDigits.length)*100)+'%':'—'}</b></div>
     <button type="button" className="mt-1.5 min-h-9 w-full rounded-lg bg-emerald-600 px-1 py-2 text-[10px] font-black text-white disabled:opacity-50" disabled={!isConnected||!isAuthorized||running||smartAnalyzer||buying||activeContractId!==null} onClick={()=>submitManualTrade('DIGITOVER',Math.min(8,Math.max(0,Math.floor(Number(manualAboveBarrier)||0))))}>{language==='en'?'BET ABOVE':language==='es'?'APOSTAR ARRIBA':'APOSTAR ACIMA'} {manualAboveBarrier}</button>
    </div>
    <div className="min-w-0 rounded-lg border p-2" style={{borderColor:light?'#fca5a5':'#991b1b'}}>
     <div className="text-[10px] font-black text-red-500">{language==='en'?'BELOW':language==='es'?'POR DEBAJO':'ABAIXO DE'}</div>
     <label className="mt-1 block text-[9px] muted">{language==='en'?'Number (1–9)':language==='es'?'Número (1–9)':'Número (1–9)'}
      <input type="number" inputMode="numeric" min="1" max="9" step="1" value={manualBelowBarrier} onChange={e=>setManualBelowBarrier(e.target.value)} onBlur={()=>setManualBelowBarrier(String(Math.min(9,Math.max(1,Math.floor(Number(manualBelowBarrier)||1)))))} disabled={running||smartAnalyzer||buying||activeContractId!==null} className="mt-1 w-full rounded-lg border border-slate-300/60 bg-transparent px-2 py-1.5 text-base font-black"/>
     </label>
     <div className="mt-1 text-[9px] muted">{language==='en'?'Block frequency':language==='es'?'Frecuencia del bloque':'Frequência no bloco'}: <b>{tickDataReady?Math.round(selectedTickDigits.filter(d=>d<Number(manualBelowBarrier||1)).length/Math.max(1,selectedTickDigits.length)*100)+'%':'—'}</b></div>
     <button type="button" className="mt-2 min-h-10 w-full rounded-lg bg-red-600 px-1 py-2 text-[10px] font-black text-white disabled:opacity-50" disabled={!isConnected||!isAuthorized||running||smartAnalyzer||buying||activeContractId!==null} onClick={()=>submitManualTrade('DIGITUNDER',Math.min(9,Math.max(1,Math.floor(Number(manualBelowBarrier)||1))))}>{language==='en'?'BET BELOW':language==='es'?'APOSTAR ABAJO':'APOSTAR ABAIXO'} {manualBelowBarrier}</button>
    </div>
   </div>
   {manualStatus&&<div aria-live="polite" className="mt-2 rounded-lg border border-blue-400/40 bg-blue-500/10 p-2 text-[10px] font-semibold break-words">{manualStatus}</div>}
  </div>}
 </div>
 <label className="card mt-3 block p-4 text-xs">{t('symbol')}<select className="mt-1 w-full bg-transparent font-bold" value={symbol} onChange={e=>setSymbol(e.target.value)} disabled={running||smartAnalyzer}>{Object.entries(SYMBOLS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <div className="card ia-power mt-3 p-4"><div><div className="ia-badge" style={{color:iaPower?'#25D366':(light?'#475569':'#94a3b8')}}>IA POWER</div></div><button className={`ia-toggle ${iaPower?'on':''}`} type="button" onClick={()=>togglePower(!iaPower)} disabled={running||smartAnalyzer} aria-label="Ativar ou desativar IA Power" title={running?'Pare o robô para alterar IA Power':'Alternar IA Power'}><span/></button></div>
 <div className="card ia-power mt-3 p-4"><div><div className="ia-badge" style={{color:sonic?'#25D366':(light?'#475569':'#94a3b8')}}>SONIC</div></div><button className={`ia-toggle ${sonic?'on':''}`} type="button" onClick={()=>toggleSonic(!sonic)} disabled={running||smartAnalyzer} aria-label="Ativar ou desativar Sonic" title={running?'Pare o robô para alterar Sonic':'Alternar SONIC'}><span/></button></div>
 {smartAnalyzer&&<><div className="card mt-3 p-4" style={{borderColor:smartAdvice?.earlyEntry?'#22c55e':smartAnalyzer?'#22c55e':'#cbd5e1'}}>
  <div className="flex items-center justify-between gap-2">
    <div>
      <div className="text-[10px] font-black uppercase tracking-wide">AI ANALYST</div>
      <div className="mt-1 text-[9px] muted">25 ticks ao vivo · 5 blocos de 5 · detecção de subida antecipada</div>
    </div>
    {smartAdvice&&<div className="text-right">
      <div className="text-lg font-black">{Math.round(Number(smartAdvice.score)||0)}/100</div>
      <div className="text-[8px] font-bold muted">{smartAdvice.confidenceBand||'—'}</div>
    </div>}
  </div>
  <label className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-300/30 p-2 text-[10px] font-bold"><span>Alternância automática · AI Analyst normal ↔ Exit Spots (28 resultados / 4 blocos de 7 · gatilho 20%)</span><input type="checkbox" checked={exitSpotsAutoEnabled} onChange={e=>{const enabled=e.target.checked;setExitSpotsAutoEnabled(enabled);setExitSpotsMode(false);setExitSpotsMonitorStatus(enabled?(analysisExitValues.length<28?'A recolher '+analysisExitValues.length+'/28 Exit Spots fechados; AI Analyst normal continua ativo.':'A monitorar os Exit Spots em segundo plano.'):'Alternância automática desligada; AI Analyst normal mantém-se ativo.')}} disabled={!smartAnalyzer} aria-label="Ativar alternância automática entre AI Analyst normal e Exit Spots" /></label>
  <div className="mt-1 rounded-lg border border-slate-300/20 p-2 text-[9px] muted"><b>Modo ativo:</b> {exitSpotsMode?'AI Analyst Exit Spots':'AI Analyst normal'}<br/>{exitSpotsAutoEnabled?exitSpotsMonitorStatus:'Alternância automática desligada.'}</div>
  {smartAnalyzer&&smartAdvice&&<div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">BOT</div><b className="text-[10px]">{smartAdvice.strategy}</b></div><div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">SINAL</div><b className="text-[10px]">{smartAdvice.label}</b></div></div>}

</div></>}<div className="card ia-power mt-3 p-4"><div><div className="ia-badge" style={{color:smartAnalyzer?'#25D366':(light?'#475569':'#94a3b8')}} >{t('analyzer100Ticks')}</div></div><button className={`ia-toggle ${smartAnalyzer?'on':''}`} type="button" onClick={()=>toggleAnalyzer(!smartAnalyzer)} aria-label={t('analyzer100Ticks')} title={smartAnalyzer?'Desligar AI Analyst':'Ligar AI Analyst — inicia automaticamente'}><span/></button></div>
 <div className="mt-2 flex justify-between text-[9px] muted"><span>{SYMBOLS[symbol]}</span><span>{isConnected&&isAuthorized?t('connected'):t('disconnected')}</span></div>
 {error&&<div className="mt-2 rounded-xl border border-red-800 bg-red-950 p-3 text-xs text-red-300">{error}</div>}
 {mozHyperCourse&&<div className="modal-backdrop" onClick={()=>setMozHyperCourse(false)}><div className="modal" style={{width:'min(94vw,560px)',maxHeight:'88vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>📚 {t('completeCourse')}</b><button onClick={()=>setMozHyperCourse(false)}>✕</button></div>{courseSection==='home'?<div className="mt-5 grid gap-3 sm:grid-cols-2"><button className="rounded-xl border border-blue-400/50 p-5 text-left" onClick={()=>setCourseSection('risk')}><div className="text-2xl">📊</div><b>{t('riskSheet')}</b><div className="mt-1 text-[10px] muted">{t('riskSheetDesc')}</div></button><button className="rounded-xl border border-emerald-400/50 p-5 text-left" onClick={()=>setCourseSection('course')}><div className="text-2xl">🎓</div><b>{t('course')}</b><div className="mt-1 text-[10px] muted">{t('courseDesc')}</div></button></div>:courseSection==='risk'?<div className="mt-4"><button className="text-xs font-bold text-blue-500" onClick={()=>setCourseSection('home')}>← {t('back')}</button><h3 className="mt-3 font-black">{t('riskSheetTitle')}</h3><div className="mt-3 grid gap-3"><label className="text-xs">{t('riskBalance')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="0" value={riskBalance} onChange={e=>setRiskBalance(Math.max(0,Number(e.target.value)))}/></label><label className="text-xs">{t('riskPerTrade')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="0" max="100" step="0.1" value={riskPercent} onChange={e=>setRiskPercent(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><label className="text-xs">{t('numberTrades')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="1" value={riskTrades} onChange={e=>setRiskTrades(Math.max(1,Math.floor(Number(e.target.value)||1)))}/></label></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-300/30 p-3"><div className="text-[9px] muted">{t('riskPerOperation')}</div><b>{(riskBalance*riskPercent/100).toFixed(2)}</b></div><div className="rounded-xl border border-slate-300/30 p-3"><div className="text-[9px] muted">{t('estimatedExposure')}</div><b>{(riskBalance*riskPercent/100*riskTrades).toFixed(2)}</b></div></div><div className="mt-3 rounded-xl border border-red-400/50 p-3 text-[10px] text-red-500">{t('riskWarning')}</div></div>:<div className="mt-4"><button className="text-xs font-bold text-blue-500" onClick={()=>setCourseSection('home')}>← {t('back')}</button><h3 className="mt-3 font-black">🎓 {t('courseMozHyper')}</h3>{!courseUnlocked?<div className="mt-4 rounded-xl border border-blue-400/50 p-4"><b className="text-sm">🔐 {t('accessCourse')}</b><div className="mt-1 text-[10px] muted">{t('accessDesc')}</div><input className="mt-3 w-full rounded-lg border border-slate-300/40 bg-transparent p-3 font-mono text-sm" placeholder="MozHyper-XXXXXXXX" value={courseCode} onChange={e=>setCourseCode(e.target.value)} autoComplete="off"/><button className="mt-2 w-full rounded-lg bg-blue-600 p-3 text-xs font-bold text-white disabled:opacity-50" disabled={courseUnlocking||!courseCode.trim()} onClick={async()=>{setCourseUnlocking(true);try{const r=await fetch('/api/course/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:courseCode})});const data=await r.json().catch(()=>null);if(data?.courseUnlocked){setCourseUnlocked(true);setNotice(t('unlockedNotice'))}else{setNotice(data?.error||t('invalidPassword'))}}catch{setNotice(t('validationError'))}finally{setCourseUnlocking(false)}}}>{courseUnlocking?t('validating'):t('validate')}</button><button className="mt-2 w-full rounded-lg border border-slate-300/30 p-3 text-xs font-bold" onClick={()=>{setMozHyperCourse(false);setCashierAction('course')}}>{`${t('buyCourse')} — ${currency === 'MZN' ? '999 MZN' : '15 USDT'}`}</button></div>:<><div className="mt-3 rounded-xl border border-emerald-400/50 p-4"><b className="text-sm text-emerald-500">✅ {t('unlocked')}</b><div className="mt-1 text-[10px] muted">{t('sessionAccess')}</div></div><div className="mt-3 grid gap-2">{[t('module1'),t('module2'),t('module3'),t('module4'),t('module5'),t('module6'),t('module7')].map(m=><div key={m} className="rounded-xl border border-slate-300/30 p-3"><b className="text-xs">{m}</b><div className="mt-1 text-[9px] muted">{t('courseContent')}</div></div>)}</div></>}</div>}</div></div>}{metas&&<div className="modal-backdrop" onClick={()=>setMetas(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>{t('meta')}</b><button onClick={()=>setMetas(false)}>✕</button></div><label className="mt-4 block text-xs">{t('profit')} (US$)<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" step="0.01" min="0" value={target} onChange={e=>setTarget(Math.max(0,Number(e.target.value)))}/></label><label className="mt-3 block text-xs">{t('lossGoal')} (US$)<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" step="0.01" min="0" value={lossLimit} onChange={e=>setLossLimit(Math.max(0,Number(e.target.value)))}/></label><label className="mt-3 block text-xs">{t('maxMartingale')}<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="1" max="20" step="1" value={maxMartingale} onChange={e=>setMaxMartingale(Math.min(20,Math.max(1,Math.floor(Number(e.target.value)||1))))}/><div className="mt-1 text-[9px] muted">{t('maxMartingaleHelp')}</div></label><button className="mt-4 w-full rounded-lg bg-blue-600 p-3 font-bold text-white" onClick={()=>setMetas(false)}>{t('save')}</button></div></div>}
 </div></div>
}