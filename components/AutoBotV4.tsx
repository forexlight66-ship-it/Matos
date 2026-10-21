'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDeriv } from '@/hooks/useDeriv';
import { useLanguage } from '@/contexts/LanguageContext';
import { criarGestorStake } from '@/lib/gestorStakeSorosMartingaleDinamico';
import { createSonicStakeManager } from '@/lib/sonicStakeManager';
import { isRecoveryStrategy, initialBarrierState, nextBarrierState, type BarrierState } from '@/lib/hyperRecoveryStrategies';
import { FALLBACK_RATES, getCountryCurrency, getCurrencyMeta } from '@/lib/country-currency';
import PaymentAgentCashier from '@/components/PaymentAgentCashier';
import SignalsFree, { SignalsLogo } from '@/components/SignalsFree';
import { isPaymentAgentCurrencyAllowed } from '@/lib/paymentAgent';

type Contract='EVEN'|'ODD'|'OVER'|'UNDER'|'RISE'|'FALL'|'DIFFER'|'MATCH0'|'MATCH9';
type Strategy='PAR_IMPAR'|'ACIMA5_BAIXO4'|'RISE_FALL'|'DIFERENTE'|'MATCH0'|'HYPERLITE'|'HYPERGUARD'|'HYPERSHIELD'|'HYPERBREAK'|'HYPERSWAP'|'HYPERCOVER'|'HYPERFLOWS';
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
const TYPES:Record<Contract,string>={EVEN:'DIGITEVEN',ODD:'DIGITODD',OVER:'DIGITOVER',UNDER:'DIGITUNDER',RISE:'CALL',FALL:'PUT',DIFFER:'DIGITDIFF',MATCH0:'DIGITMATCH',MATCH9:'DIGITMATCH'};
const payoutContractKey=(contractType:unknown,barrier?:unknown)=>`${String(contractType||'').toUpperCase()}:${['DIGITOVER','DIGITUNDER'].includes(String(contractType||'').toUpperCase())&&Number.isFinite(Number(barrier))?Number(barrier):'-'}`;
const estimateNetPayoutRatio=(contractType:unknown,barrier?:unknown):number|null=>{
 const type=String(contractType||'').toUpperCase();
 if(type==='DIGITEVEN'||type==='DIGITODD')return 0.90;
 if(type==='DIGITDIFF')return 0.057;
 if(type==='DIGITMATCH')return 8.5;
 if(type==='DIGITOVER'||type==='DIGITUNDER'){
  const b=Number(barrier);if(!Number.isFinite(b)||b<0||b>9)return null;
  const winningDigits=type==='DIGITOVER'?9-b:b+1;
  const probability=winningDigits/10;
  const ratio=0.95/probability-1;
  return Number.isFinite(ratio)&&ratio>0?ratio:null;
 }
 // Rise/Fall has no fallback estimate: caller uses the last observed session payout.
 return null;
};
const decimalPlaces=(pipSize:number)=>{if(!Number.isFinite(pipSize)||pipSize<=0)return 0;return Math.max(0,Math.min(10,Math.round(-Math.log10(pipSize))))};
// Deriv tick-stream pip_size is a decimal-place count (for example 5), not a price increment. Convert it to the actual increment before calculating the last digit.
const normalizeTickPipSize=(value:unknown):number|undefined=>{const raw=Number(value);if(!Number.isFinite(raw)||raw<0)return undefined;if(Number.isInteger(raw)&&raw<=10)return Math.pow(10,-raw);return raw};

function digit(v:number|string|null|undefined,pipSize?:number){
 if(v==null)return null;
 const raw=String(v).trim();
 if(!raw)return null;
 // Use the exact decimal representation supplied by Deriv; do not convert a
 // quoted price to Number before extracting its final displayed digit.
 const match=raw.match(/^[+-]?\d+(?:\.(\d+))?$/);
 if(!match)return null;
 const decimals=match[1]??'';
 const places=pipSize!=null&&Number.isFinite(pipSize)&&pipSize>0?decimalPlaces(pipSize):decimals.length;
 const normalized=pipSize!=null&&Number.isFinite(pipSize)&&pipSize>0?Number(raw).toFixed(places):raw;
 const digits=normalized.match(/\d/g);
 return digits?.length?Number(digits[digits.length-1]):null;
 }
function stats(v:number[],pipSize?:number){const d=v.map(x=>digit(x,pipSize)).filter((x):x is number=>x!==null),n=d.length||1,even=d.filter(x=>x%2===0).length/n*100,above5=d.filter(x=>x>5).length/n*100,below4=d.filter(x=>x<4).length/n*100,diff=d.filter(x=>x!==0).length/n*100,match0=d.filter(x=>x===0).length/n*100;let up=0,down=0;for(let i=1;i<v.length;i++){if(v[i]>v[i-1])up++;else if(v[i]<v[i-1])down++}const m=Math.max(1,up+down);return{even,odd:100-even,above5,below4,diff,match0,rise:up/m*100,fall:down/m*100,probs:Array.from({length:10},(_,x)=>d.filter(y=>y===x).length/n*100)}}
type HyperFlowWindow = { key:string; digits:number[]; zeroPercent:number };
type HyperFlowDigitRank = { digit:number; score:number; frequency:number; recentFrequency:number; trend:number; acceleration:number; momentumScore:number; selectionScore:number; earlyRise:boolean };
type HyperFlowRankResult = HyperFlowDigitRank & { ranking:HyperFlowDigitRank[] };
function rankHyperFlowMatchDigit(snapshots:HyperFlowWindow[],currentValues:number[],pipSize?:number,momentumValues:number[]=currentValues,momentumTickWindow=25):HyperFlowRankResult|null{
 const currentDigits=currentValues.slice(-9).map(value=>digit(value,pipSize)).filter((n):n is number=>n!==null);
 const windows=snapshots.map(item=>item.digits).filter(items=>items.length>0).map(items=>items.slice());
 if(currentDigits.length&&(!windows.length||windows[windows.length-1].join(',')!==currentDigits.join(',')))windows.push(currentDigits);
 if(!windows.length)return null;
 const weighted=Array(10).fill(0) as number[];
 let totalWeight=0;
 windows.forEach((items,index)=>{
  const weight=0.65+0.35*((index+1)/windows.length);
  totalWeight+=weight;
  for(let d=1;d<=9;d++)weighted[d]+=items.filter(value=>value===d).length/Math.max(1,items.length)*100*weight;
 });
 // Normal bot = 9 ticks (3 blocks x 3); AI Analyst = 25 ticks (5 blocks x 5).
 const windowSize=momentumTickWindow===9?9:momentumTickWindow===28?28:25;
 const blockSize=windowSize===9?3:windowSize===28?7:5;
 const blockCount=windowSize/blockSize;
 const recent=momentumValues.slice(-windowSize).map(value=>digit(value,pipSize)).filter((n):n is number=>n!==null);
 const blocks=recent.length>=windowSize?Array.from({length:blockCount},(_,i)=>recent.slice(i*blockSize,(i+1)*blockSize)):[];
 const rate=(items:number[],d:number)=>items.length?items.filter(value=>value===d).length/items.length*100:0;
 const clamp=(n:number)=>Math.max(0,Math.min(100,n));
 const ranked:HyperFlowDigitRank[]=Array.from({length:9},(_,i)=>i+1).map(d=>{
  const frequency=Number((weighted[d]/Math.max(0.0001,totalWeight)).toFixed(2));
  const recentFrequency=Number(rate(recent,d).toFixed(2));
  const blockRates=blocks.map(block=>rate(block,d));
  const last=blockRates[blockCount-1]??recentFrequency, previous=blockRates[blockCount-2]??last;
  const olderValues=blockRates.slice(0,Math.max(0,blockCount-1));
  const older=olderValues.length?olderValues.reduce((sum,v)=>sum+v,0)/olderValues.length:last;
  const trend=blocks.length===blockCount?Number((last-older).toFixed(2)):0;
  const acceleration=blocks.length===blockCount?Number((last-previous).toFixed(2)):0;
  // HyperFlow must detect a digit gaining momentum before its total frequency becomes high.
  // Score the direction and acceleration of the last blocks much more than accumulated frequency.
  // This lets an emerging digit compete even while its overall frequency is still 0–9%.
  const momentumScore=blocks.length===blockCount
   ?Number(clamp(50+trend*0.75+acceleration*1.25).toFixed(2))
   :50;
  const recentRise=blocks.length===blockCount&&last>previous;
  const risingAcrossBlocks=blocks.length===blockCount&&last>older&&acceleration>=0;
  const earlyRise=Boolean(recentRise&&risingAcrossBlocks);
  const selectionScore=Number((
    momentumScore*0.55+
    clamp(50+Math.max(-50,Math.min(50,trend))*0.5)*0.25+
    clamp(50+Math.max(-50,Math.min(50,acceleration))*0.5)*0.15+
    Math.min(100,frequency)*0.03+
    Math.min(100,recentFrequency)*0.02+
    (earlyRise?8:0)
  ).toFixed(2));
  return {digit:d,score:frequency,frequency,recentFrequency,trend,acceleration,momentumScore,selectionScore,earlyRise};
 }).sort((a,b)=>b.selectionScore-a.selectionScore||b.momentumScore-a.momentumScore||b.frequency-a.frequency||a.digit-b.digit);
 return ranked.length?{...ranked[0],ranking:ranked}:null;
}
function rankHyperFlowsAlternativeDigit(values:number[],pipSize?:number):number|null{
 const digits=values.slice(-10).map(value=>digit(value,pipSize)).filter((n):n is number=>n!==null);
 if(!digits.length)return null;
 const recent=digits.slice(-5);
 const ranked=Array.from({length:9},(_,candidate)=>candidate).map(candidate=>{
  const count=digits.filter(value=>value===candidate).length;
  const recentCount=recent.filter(value=>value===candidate).length;
  const lastIndex=digits.lastIndexOf(candidate);
  const recency=lastIndex<0?0:(lastIndex+1)/digits.length;
  const score=count/digits.length*0.65+recentCount/Math.max(1,recent.length)*0.25+recency*0.10;
  return {digit:candidate,count,recentCount,lastIndex,score};
 }).sort((a,b)=>b.score-a.score||b.count-a.count||b.recentCount-a.recentCount||b.lastIndex-a.lastIndex||a.digit-b.digit);
 return ranked[0]?.digit??null;
}
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
 // Keep 3/4 block agreement for ordinary bots. HyperFlow MATCH 0 has a 10% baseline, so 3/4 blocks each reaching 20% makes migration exceptionally rare; require 2/4 blocks while keeping the overall and latest-block 20% trigger.
 const requiredAgreeingBlocks=s==='MATCH0'?2:3;
 if(agreeingBlocks<requiredAgreeingBlocks)return null;
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
   {contract:'OVER' as Contract,label:'ACIMA 0',strength:ds.filter(n=>n>0).length/Math.max(1,ds.length)*100},
   {contract:'UNDER' as Contract,label:'ABAIXO 9',strength:ds.filter(n=>n<9).length/Math.max(1,ds.length)*100}
  ].filter(candidate=>candidate.strength>=t).sort((a,b)=>b.strength-a.strength);
  return candidates.length?pick(candidates[0]):null;
 }
 // HyperFlow (MATCH 0): dedicated 22% trigger, independent of the generic 65% threshold.
 // On the normal 9-tick window, two zeros give about 22.2% and can satisfy the trigger.
 // Do not require zero to be the most frequent digit, which could block entries.
 const zeroTrigger=threshold>=65?22:threshold;
 const zeroIsDominant=x.match0>=zeroTrigger;
 return zeroIsDominant?pick({contract:'MATCH0' as Contract,label:'MATCH 0',strength:x.match0}):null;
}

function strategyMomentumCandidates(values:number[],s:Strategy,pipSize?:number):{contract:Contract;label:string;strength:number}[]{
 const x=stats(values,pipSize);
 const digits=values.map(value=>digit(value,pipSize)).filter((value):value is number=>value!==null);
 const candidates:( {contract:Contract;label:string;strength:number} )[]=[];
 const add=(contract:Contract,label:string,strength:number)=>candidates.push({contract,label,strength:Number.isFinite(strength)?strength:0});
 const name=String(s);
 if(name==='HYPERLITE')add('EVEN','PAR',x.even);
 else if(name==='PAR_IMPAR'){add('EVEN','PAR',x.even);add('ODD','ÍMPAR',x.odd)}
 else if(name==='ACIMA5_BAIXO4'){add('OVER','ACIMA 5',x.above5);add('UNDER','ABAIXO 4',x.below4)}
 else if(name==='RISE_FALL'){add('RISE','SUBIR',x.rise);add('FALL','DESCER',x.fall)}
 else if(name==='DIFERENTE'||name==='HYPERSWAP')add('DIFFER','DIFERENTE DE 0',x.diff);
 else if(name==='HYPERGUARD')add('OVER','ACIMA 0',x.diff);
 else if(name==='HYPERSHIELD')add('OVER','ACIMA 4',x.probs.slice(5).reduce((sum,value)=>sum+value,0));
 else if(name==='HYPERBREAK')add('UNDER','ABAIXO 8',x.probs.slice(0,8).reduce((sum,value)=>sum+value,0));
 else if(name==='HYPERCOVER'){
  const denominator=Math.max(1,digits.length);
  add('OVER','ACIMA 0',digits.filter(value=>value>0).length/denominator*100);
  add('UNDER','ABAIXO 9',digits.filter(value=>value<9).length/denominator*100);
 }
 return candidates;
}
// Start Robô Normal conserva a janela oficial de 9 ticks e o gatilho normal de 65%.
// Só quando o gatilho normal ainda não existe aceita uma tendência antecipada,
// confirmada pela evolução do MESMO contrato em três blocos cronológicos de 3 ticks.
function makeNormalMomentumSignal9(values:number[],s:Strategy,pipSize?:number,threshold=65,minSamples=10){
 const standard=makeSignal(values,s,pipSize,false,threshold,minSamples);
 if(standard)return standard;
 if(values.length<minSamples||String(s)==='MATCH0'||isRecoveryStrategy(s))return null;
 const sample=values.slice(-minSamples);
 const blockSize=Math.ceil(minSamples/2);
 const blocks=[sample.slice(0,blockSize),sample.slice(blockSize)];
 if(blocks.some(block=>block.length===0))return null;
 const fullCandidates=strategyMomentumCandidates(sample,s,pipSize);
 const blockCandidates=blocks.map(block=>strategyMomentumCandidates(block,s,pipSize));
 const recent=blockCandidates[1];
 const previous=blockCandidates[0];
 const emerging=fullCandidates.map(candidate=>{
  const older=previous.find(item=>item.contract===candidate.contract)?.strength??0;
  const latest=recent.find(item=>item.contract===candidate.contract)?.strength??0;
  const trend=latest-older;
  // Normal analysis now uses the latest 10 ticks (two blocks of five).
  // Keep the normal 65% rule first; early momentum only qualifies with a strong
  // recent block and a positive increase compared with the previous block.
  if(candidate.strength<40||latest<60||trend<20)return null;
  return {...candidate,earlyMomentum:true,momentumWindow:minSamples,recentStrength:latest,trend,acceleration:trend,olderStrength:older};
 }).filter((candidate):candidate is NonNullable<typeof candidate>=>candidate!==null);
 if(!emerging.length)return null;
 emerging.sort((a,b)=>(b.trend+b.acceleration*0.75)-(a.trend+a.acceleration*0.75)||b.recentStrength-a.recentStrength||b.strength-a.strength);
 return {...emerging[0],strength:emerging[0].strength};
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
  // HyperFlow participates in Exit Spots mode using the same dedicated MATCH 0 trigger.
  {strategy:'HyperFlow',bot:'MATCH0'},
  {strategy:'Hyperlite',bot:'HYPERLITE'},
  {strategy:'HyperGuard',bot:'HYPERGUARD'},
  {strategy:'HyperShield',bot:'HYPERSHIELD'},
  {strategy:'HyperBreak',bot:'HYPERBREAK'},
  {strategy:'HyperSwap',bot:'HYPERSWAP'}
 ];
 const candidates:any[]=[];
 for(const item of bots){
  const signal=makeExitSpotSignal(values,item.bot,pipSize,true);
  if(!signal)continue;
  const baseline=item.bot==='ACIMA5_BAIXO4'?40:
   item.bot==='MATCH0'?10:
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
  const acceleration=Math.max(-100,Math.min(100,(recent-previousRecent)*220));
  const phaseScore=(strength+confidence+stability)/3;
  const phase=phaseOf(phaseScore,recent*100,olderMean*100,trend,acceleration,consistency);
  const earlyMomentum=trend>=68&&acceleration>=6&&recent>=0.45&&recent>olderMean+0.06&&consistency>=40;

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
  // AI Analyst normal: no quality/concentration filter; retain 25 ticks in five blocks and early-rise scoring.
  const score=aiClamp(strength*.28+confidence*.24+stability*.18+consistency*.15+trend*.15-Math.max(0,50-stability)*.15+(earlyMomentum?6:0)-weakRecentPenalty);
  return{
   strategy:x.strategy,label:x.label,contract:x.contract,strength,confidence,stability,trend,acceleration,consistency,score,
   risk:aiClamp(100-stability+weakRecentPenalty),direction:x.direction,regimeChange:recent-olderMean>=0.20||earlyMomentum,
   recentStrength:recent*100,olderStrength:olderMean*100,phase,earlyMomentum,qualityPenalty:0,qualityBlocked:false,qualityReason:''
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
 const noTrade=best.score<65;
 return{
  ...best,rankings:ranked,secondStrategy:second?.strategy??null,secondScore:second?.score??0,
  advantage,regimeChange,earlyEntry,noTrade,confidenceBand:confidenceBand(best.score)
 };
}
type BotSuccessEstimates=Partial<Record<Strategy,number>>;
function estimateSeriesScore(series:number[],base:number){
 if(series.length<5)return 0;
 const weighted=weightedMean(series);
 const olderMean=(series[0]+series[1]+series[2]+series[3])/4;
 const recent=series[4];
 const stability=weightedStability(series,weighted);
 const consistency=series.filter(n=>n>=base).length/5*100;
 const edge=(weighted-base)*100;
 const strength=aiClamp(50+edge*1.05);
 const confidence=aiClamp(50+edge*1.30);
 const trend=aiClamp(50+(recent-olderMean)*180);
 const acceleration=Math.max(-100,Math.min(100,(recent-series[3])*220));
 const earlyMomentum=trend>=68&&acceleration>=6&&recent>=0.45&&recent>olderMean+0.06&&consistency>=40;
 return aiClamp(strength*0.28+confidence*0.24+stability*0.18+consistency*0.15+trend*0.15-Math.max(0,50-stability)*0.15+(earlyMomentum?6:0));
}
function estimateBotSuccessScores(values:number[],pipSize?:number):BotSuccessEstimates{
 const sample=values.slice(-25);
 if(sample.length<25)return {};
 const digits=sample.map(value=>digit(value,pipSize)).filter((n):n is number=>n!==null);
 if(digits.length<25)return {};
 const ai=analyzeStrategies100(sample,pipSize);
 const nameToId:Record<string,Strategy>={HyperDrive:'PAR_IMPAR',HyperStrike:'ACIMA5_BAIXO4',HyperForce:'RISE_FALL',HyperNova:'DIFERENTE',Hyperlite:'HYPERLITE',HyperGuard:'HYPERGUARD',HyperShield:'HYPERSHIELD',HyperBreak:'HYPERBREAK',HyperSwap:'HYPERSWAP'};
 const estimates:BotSuccessEstimates={};
 for(const candidate of ai?.rankings??[]){
  const id=nameToId[candidate.strategy];
  if(id)estimates[id]=Math.round(aiClamp(candidate.score));
 }
 const blocks=Array.from({length:5},(_,i)=>digits.slice(i*5,(i+1)*5));
 const digitSeries=(predicate:(n:number)=>boolean)=>blocks.map(block=>block.filter(predicate).length/Math.max(1,block.length));
 estimates.MATCH0=Math.round(estimateSeriesScore(digitSeries(n=>n===0),0.1));
 const over1=estimateSeriesScore(digitSeries(n=>n>1),0.8);
 const under8=estimateSeriesScore(digitSeries(n=>n<8),0.8);
 estimates.HYPERCOVER=Math.round(Math.max(over1,under8));
 return estimates;
}
const localDateValue=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};const ANALYZER_COLORS:Record<string,string>={HyperDrive:'#3D7FFF',HyperStrike:'#F5B942',HyperForce:'#8B5CF6',HyperNova:'#FF444F',HyperFlow:'#22D3EE',Hyperlite:'#EC4899',HyperGuard:'#34D399',HyperShield:'#14B8A6',HyperBreak:'#F97316',HyperSwap:'#A855F7',Hypercover:'#0EA5E9',HyperFlows:'#06B6D4'};const ANALYZER_STRATEGY_TO_BOT:Record<string,Strategy>={HyperDrive:'PAR_IMPAR',HyperStrike:'ACIMA5_BAIXO4',HyperForce:'RISE_FALL',HyperNova:'DIFERENTE',HyperFlow:'MATCH0',Hyperlite:'HYPERLITE',HyperGuard:'HYPERGUARD',HyperShield:'HYPERSHIELD',HyperBreak:'HYPERBREAK',HyperSwap:'HYPERSWAP',Hypercover:'HYPERCOVER'};const STRATEGY_BOT_NAMES:Record<Strategy,string>={PAR_IMPAR:'HyperDrive',ACIMA5_BAIXO4:'HyperStrike',RISE_FALL:'HyperForce',DIFERENTE:'HyperNova',MATCH0:'HyperFlow',HYPERLITE:'Hyperlite',HYPERGUARD:'HyperGuard',HYPERSHIELD:'HyperShield',HYPERBREAK:'HyperBreak',HYPERSWAP:'HyperSwap',HYPERCOVER:'Hypercover',HYPERFLOWS:'HyperFlows'};const BOT_PICKER_OPTIONS:{id:Strategy;name:string;color:string}[]=[
 {id:'PAR_IMPAR',name:'HyperDrive',color:'#4F8BFF'},
 {id:'ACIMA5_BAIXO4',name:'HyperStrike',color:'#FB923C'},
 {id:'RISE_FALL',name:'HyperForce',color:'#34D399'},
 {id:'DIFERENTE',name:'HyperNova',color:'#A78BFA'},
 {id:'MATCH0',name:'HyperBeen',color:'#22D3EE'},
 {id:'HYPERFLOWS',name:'HyperFlows',color:'#06B6D4'},
 {id:'HYPERLITE',name:'Hyperlite',color:'#A3E635'},
 {id:'HYPERGUARD',name:'HyperGuard',color:'#2DD4BF'},
 {id:'HYPERSHIELD',name:'HyperShield',color:'#14B8A6'},
 {id:'HYPERBREAK',name:'HyperBreak',color:'#F97316'},
 {id:'HYPERSWAP',name:'HyperSwap',color:'#A855F7'},
 {id:'HYPERCOVER',name:'Hypercover',color:'#0EA5E9'}
];

let lastAnalyzerAlertAt=0;
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
 const { t, language, setLanguage }=useLanguage();
 const[userName,setUserName]=useState(''),[onlineUsers,setOnlineUsers]=useState(0),[symbol,setSymbol]=useState('1HZ100V'),[account,setAccount]=useState<'demo'|'real'>('demo'),[stake,setStake]=useState(IA_RISK_STAKE),[strategy,setStrategy]=useState<Strategy>('PAR_IMPAR'),[tickWindow,setTickWindow]=useState(10),[running,setRunning]=useState(false),[ticks,setTicks]=useState<number[]>([]),[tickPipSize,setTickPipSize]=useState<number|undefined>(undefined),[signalNow,setSignalNow]=useState<any>(null),[target,setTarget]=useState(10),[lossLimit,setLossLimit]=useState(62.50),[metas,setMetas]=useState(false),[mozHyperCourse,setMozHyperCourse]=useState(false),[courseSection,setCourseSection]=useState<'home'|'risk'|'course'>('home'),[riskBalance,setRiskBalance]=useState(200),[riskPercent,setRiskPercent]=useState(2),[riskTrades,setRiskTrades]=useState(10),[maxMartingale,setMaxMartingale]=useState(11),[theme,setTheme]=useState<'dark'|'light'>('light'),[menu,setMenu]=useState(false),[botPickerOpen,setBotPickerOpen]=useState(false),[notice,setNotice]=useState<string|null>(null),[botActivity,setBotActivity]=useState<'collectingTicks'|'waitingExitSpots'|'waitingRobotSignal'|'waitingAnalystSignal'|'requestingProposal'|'sendingDirectBuy'|'waitingBuyConfirmation'|'reconcilingBot'|'reconnectingDeriv'|'analyzing'>('analyzing'),[currency,setCurrency]=useState<Currency>('USD'),[stakeManagerVersion,setStakeManagerVersion]=useState(0),[lastDigitSeen,setLastDigitSeen]=useState<number|null>(null),[digitView,setDigitView]=useState<'bars'|'chart'>('bars'),[historyOpen,setHistoryOpen]=useState(false),[historyDate,setHistoryDate]=useState(localDateValue),[dailyHistoryArchive,setDailyHistoryArchive]=useState<any[]>([]),[manualPanelOpen,setManualPanelOpen]=useState(false),[manualStatus,setManualStatus]=useState(''),[manualAboveBarrier,setManualAboveBarrier]=useState('5'),[manualBelowBarrier,setManualBelowBarrier]=useState('4');
 const [iaPower,setIaPower]=useState(true),[sonic,setSonic]=useState(false),[soundEnabled,setSoundEnabled]=useState(true),[courseCode,setCourseCode]=useState(''),[courseUnlocked,setCourseUnlocked]=useState(false),[courseUnlocking,setCourseUnlocking]=useState(false),[smartAnalyzer,setSmartAnalyzer]=useState(false),[exitSpotsMode,setExitSpotsMode]=useState(false),[exitSpotsAutoEnabled,setExitSpotsAutoEnabled]=useState(true),[exitSpotsMonitorStatus,setExitSpotsMonitorStatus]=useState('A aguardar os primeiros 28 Exit Spots fechados.'),[aiAnalystActive,setAiAnalystActive]=useState(false),[aiAnalystExpiresAt,setAiAnalystExpiresAt]=useState<string|null>(null),[hypercoverRevision,setHypercoverRevision]=useState(0),[smartAdvice,setSmartAdvice]=useState<any>(null),[analyzerNotice,setAnalyzerNotice]=useState<string|null>(null),[analyzerHistory,setAnalyzerHistory]=useState<any[]>([]),[analyzerNoticeColor,setAnalyzerNoticeColor]=useState('#3D7FFF');
 const [currencyOptions,setCurrencyOptions]=useState<Currency[]>(['USD']); const [paymentAgentCurrency,setPaymentAgentCurrency]=useState(''); const [clientCountry,setClientCountry]=useState(''); const [cashierOpen,setCashierOpen]=useState(false),[cashierAction,setCashierAction]=useState<'deposit'|'withdraw'|'ai_analyst'|'course'|null>(null),[supportOpen,setSupportOpen]=useState(false);
  const [clientCountryReady,setClientCountryReady]=useState(false),[signalsModalOpen,setSignalsModalOpen]=useState(false);
 useEffect(()=>{if(strategy==='MATCH0'&&!running&&!smartAnalyzer&&symbol!=='R_25'){setSymbol('R_25');}},[strategy,running,smartAnalyzer,symbol]);
 const lastEpoch=useRef<number|null>(null),requested=useRef(false),stopped=useRef(false),botArmedRef=useRef(false),activeContractIdForRiskRef=useRef<number|null>(null),recoveryBalancePauseRef=useRef<number|null>(null),lastRequestedClose=useRef(0),requestStartedAt=useRef(0),riskLockStartedAt=useRef(0),lastActivityAt=useRef(Date.now()),lastProcessedStakeResult=useRef<number|string|null>(null),lastProcessedSonicResult=useRef<number|string|null>(null),processedStakeContractsRef=useRef(new Set<number>()),processedSonicContractsRef=useRef(new Set<number>()),pendingRiskStakeRef=useRef<number|null>(null),stakeReadyRef=useRef(true),riskAwaitingContractRef=useRef<number|null>(null),iaRecoveryQuotePendingRef=useRef(false),lastAdvisorKeyRef=useRef(''),totalTickCountRef=useRef(0),lastAnalyzerEvalTickRef=useRef(0),analyzerStableKeyRef=useRef<string|null>(null),analyzerStableCountRef=useRef(0),analyzerLastSwitchTickRef=useRef(-1000),analyzerLastSwitchAtRef=useRef(0),analyzerNoticeTimerRef=useRef<number|null>(null),analyzerDecisionHistoryRef=useRef<any[]>([]),historyRef=useRef<HTMLDivElement|null>(null),lastProcessedRecoveryContractRef=useRef<number|null>(null),processedClosedTradeIdsRef=useRef(new Set<number>()),pendingAnalyzerStrategyRef=useRef<Strategy|null>(null),pendingAutoEntryRef=useRef<{signal:any;strategy:Strategy;symbol:string;requestedAt:number;smartAnalyzer:boolean;exitSpotsMode:boolean}|null>(null),analyzerConfirmedRef=useRef(false),analyzerConfirmedStrategyRef=useRef<Strategy|null>(null),hypercoverAlternationRef=useRef<{forceNextDirection:boolean;contractType:'DIGITUNDER'|'DIGITOVER';barrier:number;lastDirection:'DIGITUNDER'|'DIGITOVER'|null;lossStreak:number;pauseTicksRemaining:number}>({forceNextDirection:false,contractType:'DIGITUNDER',barrier:8,lastDirection:null,lossStreak:0,pauseTicksRemaining:0}),requestedHypercoverContractRef=useRef<{contractType:'DIGITUNDER'|'DIGITOVER';barrier:number}|null>(null);
 const pipSizeBySymbolRef=useRef(new Map<string,number>());
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
 const payoutRatiosByContractRef=useRef<Record<string,number>>({});
 const payoutRatioForContract=(contractType:unknown,barrier?:unknown)=>{
  const key=payoutContractKey(contractType,barrier);
  const observed=payoutRatiosByContractRef.current[key];
  if(Number.isFinite(observed)&&observed>0)return observed;
  return estimateNetPayoutRatio(contractType,barrier)??(Number(lastPayoutRatioRef.current)>0?Number(lastPayoutRatioRef.current):IA_PAYOUT);
 };
 const sonicRef=useRef(createSonicStakeManager({baseStake:IA_RISK_STAKE,payout:IA_PAYOUT,maxLevel:maxMartingale}));
 const hyperFlowObservationTicksRef=useRef<number[]>([]);
 const hyperFlowWatchRef=useRef<{active:boolean;symbol:string;snapshots:HyperFlowWindow[];provisionalDigit?:number;provisionalEarlyRise?:boolean;lastProgressNoticeAt?:number}>({active:false,symbol:'',snapshots:[]});
 const hyperFlowTargetDigitRef=useRef<number>(0);
 const hyperFlowNextDigitRef=useRef<HyperFlowRankResult|null>(null);
 const hyperFlowRetryNormalAfterLossRef=useRef(false);
 const hyperFlowRecoveryActiveRef=useRef(false);
 const hyperFlowOverZeroModeRef=useRef(false);
 const hyperFlowRecoveryBuyPendingRef=useRef(false);
 const hyperFlowRecoveryQuoteStageRef=useRef<'base'|'stake'|null>(null);
 const hyperFlowRecoveryQuoteAttemptsRef=useRef(0);
 const hyperFlowRecoveryQuoteReadyRef=useRef(false);
 const hyperFlowRecoveryQuoteTargetRef=useRef<number|null>(null);
 const hyperFlowLastEntryTickRef=useRef<{symbol:string;epoch:number}|null>(null);
  const hyperFlowNormalSignalDisarmedRef=useRef(false);
 const hyperFlowsAnalysisActiveRef=useRef(false);
 const hyperFlowsNextDigitRef=useRef<number|null>(null);
 const hyperFlowsRecoveryModeRef=useRef(false);
 const hyperFlowsConsecutiveLossesRef=useRef(0);
 const hyperFlowsDeficitRef=useRef(0);
 const hyperFlowsLastTradeModeRef=useRef<'MATCH9'|'ALTERNATE'|'UNDER9'|null>(null);
 const hyperFlowsLastEntryTickRef=useRef<{symbol:string;epoch:number}|null>(null);
 const [hyperFlowFallbackRevision,setHyperFlowFallbackRevision]=useState(0);
 const processClosedTradeImmediately=useCallback((closed:any)=>{
  // Release the recovery-only mutex on the authoritative HyperFlow close event,
  // even if the user stopped the bot before the close callback was processed.
  const rawClosedBotLabel=String(closed?.bot||'').trim();
  const rawClosedBotName=rawClosedBotLabel.toLowerCase();
  const closedContractType=String(closed?.contract_type||'').trim().toUpperCase();
  const closedBarrier=Number(closed?.barrier);
  const unknownClosedBot=!rawClosedBotLabel||/^(estrat[eé]gia|strategy|unknown|bot não identificado)$/i.test(rawClosedBotLabel);
  const looksLikeHyperFlowContract=(closedBarrier===0&&closedContractType==='DIGITMATCH')||(closedBarrier===0&&closedContractType==='DIGITOVER'&&strategy==='MATCH0');
  const looksLikeHyperFlowsContract=strategy==='HYPERFLOWS'&&((closedContractType==='DIGITMATCH'&&closedBarrier>=0&&closedBarrier<=9)||(closedContractType==='DIGITUNDER'&&closedBarrier===9));
  const knownHyperFlowLabel=rawClosedBotName==='hyperflow'||/^hyperflow(?:\s+|$)/i.test(rawClosedBotLabel);
  const knownHyperFlowsLabel=rawClosedBotName==='hyperflows'||/^hyperflows(?:\s+|$)/i.test(rawClosedBotLabel);
  // Match the current HyperFlows entry mode against the close event. Early close
  // notifications may omit contract_type/barrier, so use the tracked mode if the
  // available fields do not contradict it.
  const trackedHyperFlowsMode=hyperFlowsLastTradeModeRef.current;
  const trackedHyperFlowsContractMatches=trackedHyperFlowsMode==='UNDER9'
   ?(!closedContractType||closedContractType==='DIGITUNDER')&&(!Number.isFinite(closedBarrier)||closeBarrier===9)
   :trackedHyperFlowsMode==='MATCH9'
    ?(!closedContractType||closedContractType==='DIGITMATCH')&&(!Number.isFinite(closedBarrier)||closeBarrier===9)
    :trackedHyperFlowsMode==='ALTERNATE'
     ?(!closedContractType||closedContractType==='DIGITMATCH')&&(!Number.isFinite(closedBarrier)||(closedBarrier>=0&&closedBarrier<=8))
     :false;
  const looksLikeTrackedHyperFlowsClose=strategy==='HYPERFLOWS'&&trackedHyperFlowsMode!==null&&trackedHyperFlowsContractMatches&&(knownHyperFlowLabel||knownHyperFlowsLabel||unknownClosedBot);
  const identifiedClosedBotName=(knownHyperFlowsLabel||(strategy==='HYPERFLOWS'&&knownHyperFlowLabel&&(looksLikeHyperFlowsContract||looksLikeTrackedHyperFlowsClose))||(unknownClosedBot&&(looksLikeHyperFlowsContract||looksLikeTrackedHyperFlowsClose)))?'hyperflows':(knownHyperFlowLabel||(unknownClosedBot&&(looksLikeHyperFlowContract||(strategy==='MATCH0'&&String(closed?.contract_type||'').trim().toUpperCase()==='DIGITMATCH'))))?'hyperflow':rawClosedBotName;
  if(identifiedClosedBotName==='hyperflow'){hyperFlowRecoveryBuyPendingRef.current=false;if(strategy==='MATCH0'&&!hyperFlowOverZeroModeRef.current)hyperFlowNormalSignalDisarmedRef.current=false;}
  const isManualTrade=String(closed?.bot||'').toLowerCase().startsWith('manual');
   if((!running&&!smartAnalyzer&&!isManualTrade)||!closed?.contract_id)return;
   const id=Number(closed.contract_id);
   const result=Number(closed.profit_loss);
   if(!Number.isFinite(id)||id<=0||!Number.isFinite(result))return;
   const isHypercoverTrade=String(closed?.bot||'').trim().toLowerCase()==='hypercover';
   const closedType=String(closed?.contract_type||'').toUpperCase();
   const closeStatus=String(closed?.status||'').trim().toLowerCase();
   const statusOutcome=closeStatus==='won'?true:closeStatus==='lost'?false:null;
   const tradeSymbol=String(closed?.symbol||symbol||'');
   const tradePipSize=pipSizeBySymbolRef.current.get(tradeSymbol)||(tradeSymbol===symbol?tickPipSize:undefined);
   const exitDigitSource=closed?.exit_spot!=null?'exit_spot':'exit_tick';const exitQuote=closed?.exit_spot??closed?.exit_tick;const exitDigit=exitQuote!=null&&Number.isFinite(Number(tradePipSize))&&Number(tradePipSize)>0?digit(exitQuote,tradePipSize):null;
   const rawCloseBarrier=closed?.barrier;
   // Never invent Hypercover barriers for an unrelated Digit Over/Under trade.
   const closeBarrier=rawCloseBarrier!=null&&Number.isFinite(Number(rawCloseBarrier))?Number(rawCloseBarrier):(isHypercoverTrade?(closedType==='DIGITOVER'?1:closedType==='DIGITUNDER'?8:NaN):NaN);
   const exitOutcome=exitDigit!==null&&Number.isInteger(exitDigit)&&exitDigit>=0&&exitDigit<=9&&Number.isFinite(closeBarrier)
    ?(closedType==='DIGITOVER'?exitDigit>closeBarrier:closedType==='DIGITUNDER'?exitDigit<closeBarrier:null)
    :null;
   // Deriv's explicit contract status and financial P/L remain authoritative.
   const hypercoverWon=isHypercoverTrade?(statusOutcome??exitOutcome??(result>0)):(result>0);
   const digitContract=closedType==='DIGITOVER'||closedType==='DIGITUNDER';
   const digitOutcomeMismatch=Boolean(digitContract&&statusOutcome!==null&&exitOutcome!==null&&statusOutcome!==exitOutcome);
   const financialStatusMismatch=Boolean(statusOutcome!==null&&((statusOutcome&&result< -0.001)||(!statusOutcome&&result>0.001)));
   if(isHypercoverTrade||digitContract)console.info(isHypercoverTrade?'[Hypercover close audit]':'[Deriv Digit close audit]',{contract_id:id,symbol:tradeSymbol,contract_type:closedType,barrier:Number.isFinite(closeBarrier)?closeBarrier:null,exit_tick:closed.exit_tick??null,exit_spot:closed.exit_spot??null,exit_digit_source:exitDigitSource,pip_size:tradePipSize??null,exit_digit:exitDigit,status:closeStatus||null,exit_outcome:exitOutcome,profit_loss:result,digit_outcome_mismatch:digitOutcomeMismatch,financial_status_mismatch:financialStatusMismatch,alternation_outcome:hypercoverWon?'won':'lost'});
   if(processedClosedTradeIdsRef.current.has(id))return;processedClosedTradeIdsRef.current.add(id);
   if(digitOutcomeMismatch&&(running||smartAnalyzer)&&!isManualTrade){
    // A diferença no último dígito calculado localmente não prova que a Deriv
    // reportou um resultado financeiro errado. O resultado oficial da Deriv
    // continua a ser a autoridade; registamos a auditoria sem parar o robô.
    console.warn('[Trading audit] Local exit-digit check differs from Deriv contract status; keeping Deriv result authoritative.',{contract_id:id,symbol:tradeSymbol,contract_type:closedType,barrier:Number.isFinite(closeBarrier)?closeBarrier:null,exit_spot:closed.exit_spot??null,exit_tick:closed.exit_tick??null,exit_digit:exitDigit,status:closeStatus||null,profit_loss:result});
   }
   if(financialStatusMismatch&&(running||smartAnalyzer)&&!isManualTrade){
    console.error('[Trading safety stop] Official contract status conflicts with financial P/L',{contract_id:id,symbol:tradeSymbol,contract_type:closedType,status:closeStatus||null,profit_loss:result});
    stopped.current=true;botArmedRef.current=false;requested.current=false;requestStartedAt.current=0;
    pendingAnalyzerStrategyRef.current=null;setRunning(false);setSmartAnalyzer(false);setExitSpotsMode(false);setSignalNow(null);
    setNotice('BLOQUEIO DE SEGURANÇA: o estado oficial da Deriv contradiz o lucro/prejuízo do contrato. O robô foi pausado para proteger o saldo.');
   }
   const closedBotName=identifiedClosedBotName||String(closed?.bot||'').trim().toLowerCase();
   const isHyperFlowTrade=closedBotName==='hyperflow';
   const hyperFlowWon=statusOutcome??(result>0);
   const hyperFlowLost=statusOutcome===false||(statusOutcome===null&&result<0);
   if(isHyperFlowTrade&&(hyperFlowWon||hyperFlowLost)){
    // HyperFlow: uma primeira perda no MATCH 0 gera mais uma tentativa normal.
    // A recuperação usa ACIMA 0 com stake fixa de $15 e duração de 1 tick.
    // Qualquer resultado de ACIMA 0 devolve o bot ao MATCH 0. Sem recuperação de défice.
    const wasAboveZero=hyperFlowOverZeroModeRef.current;
    hyperFlowRecoveryActiveRef.current=false;
    if(wasAboveZero){
     // ACIMA 0 terminou (ganho ou perda): voltar imediatamente ao HyperFlow normal.
     hyperFlowOverZeroModeRef.current=false;
     hyperFlowRetryNormalAfterLossRef.current=false;
    }else if(hyperFlowLost){
     hyperFlowOverZeroModeRef.current=hyperFlowRetryNormalAfterLossRef.current;
      hyperFlowRetryNormalAfterLossRef.current=!hyperFlowRetryNormalAfterLossRef.current;
      if(hyperFlowOverZeroModeRef.current)hyperFlowRetryNormalAfterLossRef.current=false;
    }else{
     hyperFlowRetryNormalAfterLossRef.current=false;
     hyperFlowOverZeroModeRef.current=false;
    }
    hyperFlowNormalSignalDisarmedRef.current=false;
    hyperFlowNextDigitRef.current=null;
    hyperFlowTargetDigitRef.current=0;
    hyperFlowWatchRef.current={active:false,symbol:tradeSymbol,snapshots:[]};
    hyperFlowRecoveryQuoteStageRef.current=null;
    hyperFlowRecoveryQuoteAttemptsRef.current=0;
    hyperFlowRecoveryQuoteReadyRef.current=false;
    hyperFlowRecoveryQuoteTargetRef.current=null;
    hyperFlowRecoveryBuyPendingRef.current=false;
    setHyperFlowFallbackRevision(v=>v+1);
    const nextMode=hyperFlowOverZeroModeRef.current?'ABOVE_0':'NORMAL_MATCH_0';
    const nextNotice=wasAboveZero
     ?'HYPERFLOW ACIMA 0 concluído (1 tick). Próxima operação: HyperFlow normal — MATCH 0.'
     :hyperFlowOverZeroModeRef.current
      ?'HYPERFLOW normal perdeu. Próxima operação: ACIMA 0 durante 1 tick, stake fixa $15.'
      :hyperFlowLost
       ?'HYPERFLOW normal perdeu uma vez. Vai tentar novamente com HyperFlow normal — MATCH 0.'
       :'HYPERFLOW normal ganhou. Mantém HyperFlow normal — MATCH 0.';
    setNotice(nextNotice);
    console.info('[HyperFlow retry then Above 0 fallback]',{symbol:tradeSymbol,closedProfitLoss:result,outcome:hyperFlowWon?'won':'lost',previousMode:wasAboveZero?'ABOVE_0':'NORMAL_MATCH_0',nextMode,duration:hyperFlowOverZeroModeRef.current?1:1,retryNormalArmed:hyperFlowRetryNormalAfterLossRef.current,above0Stake:15,deficitRecovery:false});
   }
   const isHyperFlowsTrade=closedBotName==='hyperflows';
   if(isHyperFlowsTrade&&(hyperFlowWon||hyperFlowLost)){
    const savedMode=hyperFlowsLastTradeModeRef.current;
    const hasReliableHyperFlowsContract=(closedType==='DIGITUNDER'||closedType==='DIGITMATCH')&&Number.isFinite(closeBarrier);
    const closedBotLabelLower=String(closed?.bot||'').trim().toLowerCase();
    const explicitlyLabeledB9=/\b(?:hyperflow\s*b9|under\s*9|under9)\b/i.test(closedBotLabelLower);
    // Deriv contract metadata and the explicit B9/UNDER 9 label take priority over stale mode refs.
    const wasUnder9=explicitlyLabeledB9||(hasReliableHyperFlowsContract?(closedType==='DIGITUNDER'&&closeBarrier===9):savedMode==='UNDER9');
    const wasMainMatch9=!wasUnder9&&(hasReliableHyperFlowsContract?(closedType==='DIGITMATCH'&&closeBarrier===9):savedMode==='MATCH9');
    const wasAlternate=!wasUnder9&&!wasMainMatch9&&(hasReliableHyperFlowsContract?(closedType==='DIGITMATCH'&&closeBarrier>=0&&closeBarrier<=8):savedMode==='ALTERNATE');
    hyperFlowsLastTradeModeRef.current=null;
    if(wasUnder9){
     if(hyperFlowLost){
      // A B9/UNDER 9 loss is never added to deficit and must terminate recovery immediately.
      // Clear the stale deficit as well so it cannot size a later stake from this recovery cycle.
      hyperFlowsDeficitRef.current=0;
      hyperFlowsConsecutiveLossesRef.current=0;
      hyperFlowsRecoveryModeRef.current=false;
      hyperFlowsNextDigitRef.current=null;
      // Resume normal MATCH 9 immediately; the configured risk manager calculates the next stake.
      hyperFlowsAnalysisActiveRef.current=true;
      setNotice('HyperFlows B9 / UNDER 9 perdeu. Recuperação encerrada; a retomar HyperFlows normal MATCH 9 com stake da gestão de risco configurada.');
     }else{
      const paidIn=Number(closed?.buy_price);
      if(Number.isFinite(paidIn)&&paidIn>0&&result>0)payoutRatiosByContractRef.current[payoutContractKey('DIGITUNDER',9)]=Math.max(0.001,result/paidIn);
      hyperFlowsDeficitRef.current=Number(Math.max(0,hyperFlowsDeficitRef.current-Math.max(0,result)).toFixed(2));
      hyperFlowsConsecutiveLossesRef.current=0;
      hyperFlowsNextDigitRef.current=null;
      if(hyperFlowsDeficitRef.current>0.01){
       hyperFlowsRecoveryModeRef.current=true;
       setNotice('HyperFlows: UNDER 9 ganhou, mas ainda falta recuperar '+hyperFlowsDeficitRef.current.toFixed(2)+'. A próxima operação continuará com UNDER 9 por 10 ticks.');
      }else{
       hyperFlowsRecoveryModeRef.current=false;
       hyperFlowsDeficitRef.current=0;
       setNotice('HyperFlows: défice totalmente recuperado. A estratégia normal MATCH 9 foi retomada.');
      }
     }
    }else if(hyperFlowLost){
     hyperFlowsDeficitRef.current=Number((Math.max(0,hyperFlowsDeficitRef.current)+Math.abs(Math.min(0,result))).toFixed(2));
     // The consecutive-loss counter is capped at 5; the fifth loss switches to recovery.
     hyperFlowsConsecutiveLossesRef.current=Math.min(5,Math.max(0,hyperFlowsConsecutiveLossesRef.current)+1);
     if(hyperFlowsConsecutiveLossesRef.current>=5){
      hyperFlowsRecoveryModeRef.current=true;
      hyperFlowsNextDigitRef.current=null;
      setNotice('HyperFlows: 5 perdas consecutivas. A ativar recuperação UNDER 9 por 10 ticks; défice '+hyperFlowsDeficitRef.current.toFixed(2)+'.');
     }else if(wasMainMatch9){
      const alternative=rankHyperFlowsAlternativeDigit(hyperFlowObservationTicksRef.current.slice(-10),tradePipSize);
      hyperFlowsNextDigitRef.current=alternative??0;
      setNotice('HyperFlows: MATCH 9 perdeu. Próxima entrada: MATCH '+String(hyperFlowsNextDigitRef.current)+' (dígito alternativo mais forte na análise).');
     }else{
      hyperFlowsNextDigitRef.current=null;
      setNotice('HyperFlows: operação alternativa perdeu. A regressar à análise normal de MATCH 9 ('+hyperFlowsConsecutiveLossesRef.current+'/5 perdas consecutivas).');
     }
    }else{
     hyperFlowsConsecutiveLossesRef.current=0;
     hyperFlowsDeficitRef.current=Number(Math.max(0,hyperFlowsDeficitRef.current-Math.max(0,result)).toFixed(2));
     hyperFlowsNextDigitRef.current=null;
     hyperFlowsRecoveryModeRef.current=false;
     if(wasAlternate)setNotice('HyperFlows: MATCH '+String(Number.isFinite(closeBarrier)?closeBarrier:'alternativo')+' ganhou. A regressar à estratégia normal MATCH 9.');
     else setNotice('HyperFlows: MATCH 9 ganhou. A estratégia normal continua ativa.');
    }
    console.info('[HyperFlows recovery state]',{mode:wasUnder9?'UNDER9':wasAlternate?'ALTERNATE':'MATCH9',outcome:hyperFlowWon?'won':'lost',consecutiveLosses:hyperFlowsConsecutiveLossesRef.current,deficit:hyperFlowsDeficitRef.current,recoveryActive:hyperFlowsRecoveryModeRef.current,nextDigit:hyperFlowsNextDigitRef.current});
   }
   if(isHypercoverTrade&&!hypercoverWon){
    const actualDirection=closedType==='DIGITOVER'?'DIGITOVER':closedType==='DIGITUNDER'?'DIGITUNDER':hypercoverAlternationRef.current.lastDirection||'DIGITUNDER';
    const nextDirection=actualDirection==='DIGITOVER'?'DIGITUNDER':'DIGITOVER';
    const nextBarrier=nextDirection==='DIGITOVER'?1:8;
    const nextLossStreak=hypercoverAlternationRef.current.lossStreak+1;
    const shouldPause=nextLossStreak>=3;
    hypercoverAlternationRef.current={...hypercoverAlternationRef.current,forceNextDirection:true,contractType:nextDirection,barrier:nextBarrier,lastDirection:actualDirection,lossStreak:shouldPause?0:nextLossStreak,pauseTicksRemaining:shouldPause?30:hypercoverAlternationRef.current.pauseTicksRemaining};
    setHypercoverRevision(v=>v+1);
    setNotice(shouldPause?'HYPERCOVER: 3 perdas consecutivas. Pausa de 30 ticks; depois retoma com '+(nextDirection==='DIGITOVER'?'OVER 1':'UNDER 8')+'.':'HYPERCOVER perdeu ('+(actualDirection==='DIGITOVER'?'OVER 1':'UNDER 8')+'). Próxima operação obrigatoriamente '+(nextDirection==='DIGITOVER'?'OVER 1':'UNDER 8')+', independentemente das estatísticas.');
   }else if(isHypercoverTrade&&hypercoverWon){
    hypercoverAlternationRef.current.lossStreak=0;
   }
   const fallbackStake=(strategy==='MATCH0'||strategy==='HYPERFLOWS')?stake:(iaPower?gestorRef.current.proximoStake():sonic?sonicRef.current.getStake():stake);
  const executedStake=Math.max(0.35,Number(closed.buy_price)>0?Number(closed.buy_price):Number(pendingRiskStakeRef.current)||Number(fallbackStake)||0.35);
  const closedPayout=Number(closed.payout);
  const payoutRatio=executedStake>0&&Number.isFinite(closedPayout)&&closedPayout>executedStake
    ?(closedPayout-executedStake)/executedStake
    :lastPayoutRatioRef.current;

  if(Number.isFinite(payoutRatio)&&payoutRatio>0){
   lastPayoutRatioRef.current=payoutRatio;
   const closedType=String(closed.contract_type||'').toUpperCase();
   const closedBarrier=closed.barrier;
   payoutRatiosByContractRef.current[payoutContractKey(closedType,closedBarrier)]=payoutRatio;
  }

  if(iaPower&&!isHyperFlowTrade&&!isHyperFlowsTrade&&!processedStakeContractsRef.current.has(id)){
   processedStakeContractsRef.current.add(id);
   lastProcessedStakeResult.current=id;
   gestorRef.current.atualizarPayout(lastPayoutRatioRef.current);
   gestorRef.current.registrarResultado(result,executedStake);
   if(isManualTrade){
    const nextManualStake=Number(Math.max(0.35,gestorRef.current.proximoStake()).toFixed(2));
    const manualContext=manualPowerBalanceRef.current;
    const available=Number(manualContext.balance);
    const deficit=Number(gestorRef.current.getEstado().deficitRecuperacao||0);
    // Never cap a recovery stake to the available balance: that would turn a
    // full-deficit recovery into a partial one and falsely suggest recovery.
    if(deficit>0.01&&(!Number.isFinite(available)||nextManualStake>available+0.005)){
     setManualStatus(`RECUPERAÇÃO MANUAL PAUSADA — défice ${deficit.toFixed(2)} ${manualContext.currency}; stake integral necessária ${nextManualStake.toFixed(2)} ${manualContext.currency}; saldo disponível ${Math.max(0,Number.isFinite(available)?available:0).toFixed(2)} ${manualContext.currency}. Não foi enviada nenhuma operação.`);
    }else{
     setManualStatus(`${result<0?'IA POWER: perda registada':'IA POWER: resultado registado'} · ${deficit>0.01?'stake integral de recuperação':'próxima stake'} ${nextManualStake.toFixed(2)} ${manualContext.currency}.`);
    }
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

  if(sonic&&!isHyperFlowTrade&&!isHyperFlowsTrade&&!processedSonicContractsRef.current.has(id)){
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
  const trackedActiveId=activeContractIdForRiskRef.current;
  const closeMatchesActive=trackedActiveId===null||trackedActiveId===id;
  if(closeMatchesActive){
   // A closed trade may arrive through profit_table without a corresponding
   // activeContractId transition (for example, after a lost buy acknowledgement).
   // Clear stale risk locks even when the stored risk-awaiting ID is different.
   riskAwaitingContractRef.current=null;stakeReadyRef.current=true;riskLockStartedAt.current=0;
   pendingRiskStakeRef.current=null;iaRecoveryQuotePendingRef.current=false;
   requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();
   console.warn('[Bot lifecycle] Closed trade released entry locks',{contract_id:id,trackedActiveId,account,strategy});
  }else{
   console.warn('[Bot lifecycle] Processed a closed trade without clearing a different active contract lock',{closedContractId:id,trackedActiveId});
  }
 },[running,smartAnalyzer,iaPower,sonic,soundEnabled,strategy,ticks,tickPipSize,account,symbol,stake,maxMartingale,setManualStatus]);
 const{tick,balance,proposal,buy,buyDirect,buying,activeContractId,trackedContractId,getProposal,clearProposal,subscribeTicks,isAuthorized,isConnected,error,profitTransactions,soros,setSorosStake,setSorosEnabled,contractClosedSeq,lastClosedTransaction,contractStage,fetchProfitTable,getTicksHistory,resetTradingSession}=useDeriv(account,processClosedTradeImmediately);activeContractIdForRiskRef.current=trackedContractId;
 // Dynamic symbol selector: periodically compares fresh 25-tick samples for every supported
 // volatility index and chooses the strongest recent setup for the currently selected bot.
 // It only changes symbols while no contract/buy is active, and requires a clear score lead
 // to avoid rapid symbol oscillation. This is a statistical selector, not a profit guarantee.
 const symbolSelectionLockRef=useRef(false);
 const symbolScoreForBot=(values:number[],bot:Strategy)=>{
  if(values.length<25)return -Infinity;
  const all=stats(values.slice(-25)),recent=stats(values.slice(-9));
  let full=0,short=0,baseline=50;
  if(bot==='MATCH0'){full=all.match0;short=recent.match0;baseline=10;}
  else if(bot==='PAR_IMPAR'||bot==='HYPERLITE'){full=Math.max(all.even,all.odd);short=Math.max(recent.even,recent.odd);baseline=50;}
  else if(bot==='ACIMA5_BAIXO4'){full=Math.max(all.above5,all.below4);short=Math.max(recent.above5,recent.below4);baseline=40;}
  else if(bot==='RISE_FALL'){full=Math.max(all.rise,all.fall);short=Math.max(recent.rise,recent.fall);baseline=50;}
  else if(bot==='DIFERENTE'||bot==='HYPERSWAP'){full=all.diff;short=recent.diff;baseline=90;}
  else if(bot==='HYPERGUARD'){full=all.diff;short=recent.diff;baseline=90;}
  else if(bot==='HYPERSHIELD'){full=all.probs.slice(5).reduce((a,b)=>a+b,0);short=recent.probs.slice(5).reduce((a,b)=>a+b,0);baseline=50;}
  else if(bot==='HYPERBREAK'){full=all.probs.slice(0,8).reduce((a,b)=>a+b,0);short=recent.probs.slice(0,8).reduce((a,b)=>a+b,0);baseline=80;}
  else if(bot==='HYPERCOVER'){full=Math.max(100-all.probs[0],100-all.probs[9]);short=Math.max(100-recent.probs[0],100-recent.probs[9]);baseline=80;}
  // HyperFlow MATCH 0 needs a symbol with emerging zero activity, not a 65% signal.
  // Score it directly from both 25-tick frequency and the latest 9 ticks, allowing
  // a modest increase in zero frequency to change the preferred symbol early.
  if(bot==='MATCH0'&&hyperFlowOverZeroModeRef.current){
   const fullAboveZero=100-all.match0;
   const recentAboveZero=100-recent.match0;
   return 50+(fullAboveZero-90)*0.35+(recentAboveZero-90)*0.65;
  }
  if(bot==='MATCH0'){
   const fullZero=all.match0;
   const recentZero=recent.match0;
   const priorZero=stats(values.slice(-18,-9)).match0;
   const acceleration=recentZero-priorZero;
   const hasTrigger=recentZero>=22;
   return 50+fullZero*0.35+recentZero*0.65+acceleration*0.25+(hasTrigger?8:0);
  }
  const edge=(full-baseline)*0.45+(short-baseline)*0.55;
  const validSignal=makeSignal(values.slice(-25),bot,undefined,false,65,9);
  return 50+edge+(validSignal?8:0);
 };
 useEffect(()=>{
  // Fixar o símbolo durante qualquer sessão ativa do robô. A seleção dinâmica
  // só pode ocorrer antes de Start; nunca durante negociação/análise ativa.
  if(running||smartAnalyzer||stopped.current||!isConnected||!isAuthorized)return;
  let cancelled=false;
  const scan=async()=>{
   if(symbolSelectionLockRef.current)return;
   symbolSelectionLockRef.current=true;
   try{
    const candidates=Object.keys(SYMBOLS);
    const ranked:{symbol:string;score:number}[]=[];
    for(const candidate of candidates){
     if(cancelled)break;
     try{
      const values=await getTicksHistory(candidate,25);
      const score=symbolScoreForBot(values,strategy);
      if(Number.isFinite(score))ranked.push({symbol:candidate,score});
     }catch(err){console.debug('[Dynamic symbol selector] History unavailable',{symbol:candidate,error:String(err)});}
     await new Promise(resolve=>window.setTimeout(resolve,120));
    }
    if(cancelled||ranked.length===0)return;
    ranked.sort((a,b)=>b.score-a.score);
    const best=ranked[0],current=ranked.find(item=>item.symbol===symbol);
    // Switch only for a meaningful lead; if the current symbol has no fresh sample,
    // use the best available one. Never change the underlying symbol mid-contract.
    const clearLead=!current||best.symbol===symbol||best.score>=current.score+4;
    if(best.symbol!==symbol&&clearLead&&activeContractId===null&&trackedContractId===null&&!buying){
     console.info('[Dynamic symbol selector] Selected best current symbol',{bot:STRATEGY_BOT_NAMES[strategy]||strategy,previousSymbol:symbol,nextSymbol:best.symbol,bestScore:Number(best.score.toFixed(2)),currentScore:current?Number(current.score.toFixed(2)):null,samples:ranked.length});
     setSymbol(best.symbol);
     setNotice('Símbolo dinâmico: '+(SYMBOLS[best.symbol]||best.symbol)+' selecionado para '+(STRATEGY_BOT_NAMES[strategy]||strategy)+'.');
    }
   }finally{symbolSelectionLockRef.current=false;}
  };
  void scan();
  const timer=window.setInterval(()=>{void scan()},45000);
  return()=>{cancelled=true;window.clearInterval(timer)};
 },[running,smartAnalyzer,strategy,symbol,isConnected,isAuthorized,activeContractId,trackedContractId,buying,getTicksHistory]);

 useEffect(()=>{
  if(contractClosedSeq===lastRequestedClose.current)return;
  lastRequestedClose.current=contractClosedSeq;
  if(activeContractId!==null||trackedContractId!==null||proposal||buying)return;
  requested.current=false;
  requestStartedAt.current=0;
  if(!iaPower&&!sonic){
   stakeReadyRef.current=true;
   riskLockStartedAt.current=0;
   pendingRiskStakeRef.current=null;
   riskAwaitingContractRef.current=null;
  }
  lastActivityAt.current=Date.now();
  if(running&&!stopped.current){
   setBotActivity('waitingRobotSignal');
   subscribeTicks(symbol);
  }
 },[contractClosedSeq,activeContractId,trackedContractId,proposal,buying,iaPower,sonic,running,subscribeTicks,symbol]);useEffect(()=>{manualPowerBalanceRef.current={balance:Number(balance?.balance)||0,currency:String(balance?.currency||'USD')};},[balance?.balance,balance?.currency]);
 const manualFeedback=(message:string)=>{setManualStatus(message);setNotice(message)};
 const submitManualTrade=(contractType:'DIGITOVER'|'DIGITUNDER',barrier:number)=>{
  if(running||smartAnalyzer){manualFeedback(language==='en'?'Stop the robot before manual trading.':language==='es'?'Detén el robot antes de operar manualmente.':'Pare o robô antes de operar manualmente.');return}
  if(!isConnected||!isAuthorized){manualFeedback(language==='en'?'Connect and authenticate with Deriv first.':language==='es'?'Conéctate y autentícate con Deriv primero.':'Ligue e autentique a Deriv primeiro.');return}
  if(activeContractId!==null||buying||manualTradeRef.current){manualFeedback(language==='en'?'Wait for the current operation to finish.':language==='es'?'Espera a que termine la operación actual.':'Aguarde a operação actual terminar.');return}
  if(!tickDataReady){manualFeedback(language==='en'?'Waiting for digit-bar data. Please wait for the bars to load.':language==='es'?'Esperando los datos de las barras. Espera a que carguen.':'A aguardar os dados das barras. Espere que as barras carreguem.');return}
  let amount=Number(stake);const available=Number(balance?.balance);
  if(iaPower){
   const riskState=gestorRef.current.getEstado();
   const deficit=Number(riskState.deficitRecuperacao||0);
   if(deficit>0.01){
    // While a deficit exists, manual trading must use the manager's full
    // recovery stake, regardless of a smaller value entered in the stake box.
    amount=Number(Math.max(0.35,gestorRef.current.proximoStake()).toFixed(2));
    if(!Number.isFinite(available)||available<=0||amount>available+0.005){
     const currency=String(balance?.currency||'USD');
     manualFeedback(`RECUPERAÇÃO MANUAL PAUSADA — défice ${deficit.toFixed(2)} ${currency}; stake integral necessária ${amount.toFixed(2)} ${currency}; saldo disponível ${Math.max(0,Number.isFinite(available)?available:0).toFixed(2)} ${currency}. Não foi enviada nenhuma operação.`);
     return;
    }
   }
  }
  if(!Number.isFinite(amount)||amount<0.35){manualFeedback(language==='en'?'Minimum stake is 0.35 in the Deriv account currency.':language==='es'?'La apuesta mínima es 0.35 in the Deriv account currency.':'A stake mínima é 0,35 na moeda da conta Deriv.');return}
  if(!Number.isFinite(available)||available<=0||amount>available+0.005){manualFeedback(language==='en'?'Stake exceeds the available balance.':language==='es'?'La apuesta supera el saldo disponible.':'A stake ultrapassa o saldo disponível.');return}
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
   const proposalType=String(proposal.contract_type||proposal.requested_contract_type||'').toUpperCase();
   const proposalBarrier=proposal.barrier??proposal.requested_barrier;
   payoutRatiosByContractRef.current[payoutContractKey(proposalType,proposalBarrier)]=ratio;
   lastPayoutRatioRef.current=ratio;
   sonicRef.current.atualizarPayout(ratio);
   gestorRef.current.atualizarPayout(ratio);
  }
 },[proposal]);
 useEffect(()=>{if((!running&&!smartAnalyzer)||!lastClosedTransaction?.contract_id)return;processClosedTradeImmediately(lastClosedTransaction)},[running,smartAnalyzer,lastClosedTransaction,processClosedTradeImmediately]);
 const statsWindow=200;
 // Usa exit_spot prioritariamente e exit_tick como fallback. Considera apenas
 // operações fechadas do símbolo fixado na sessão; nunca mistura símbolos.
 const normalRobotActive=running&&!smartAnalyzer;
 const analysisExitValues=useMemo(()=>{
  // O Robô Normal não recolhe nem analisa Exit Spots: decide entradas apenas com ticks ao vivo.
  // A análise por Exit Spots continua disponível para AI Analyst/Exit Spots sem alterações.
  if(normalRobotActive)return [];
  return profitTransactions
   .filter(tx=>tx.symbol===symbol&&Boolean(tx.sell_time))
   .map(tx=>({time:Number(tx.sell_time),value:tx.exit_spot??tx.exit_tick}))
   .filter(item=>item.value!=null&&String(item.value).trim()!==''&&Number.isFinite(Number(item.value))&&Number(item.time)>0)
   .sort((a,b)=>b.time-a.time)
   .slice(0,600).reverse().map(item=>Number(item.value));
 },[profitTransactions,symbol,normalRobotActive]);const exitSpotReady=analysisExitValues.length>=28;const botAnalysisValues=useMemo(()=>ticks,[ticks]);const aiAnalysisValues=useMemo(()=>ticks.slice(-25),[ticks]);const chartUsesExitSpots=analysisExitValues.length>=28;const chartSourceValues=useMemo(()=>chartUsesExitSpots?analysisExitValues:ticks,[chartUsesExitSpots,analysisExitValues,ticks]);const analyze100Ticks=useMemo(()=>analyzeStrategies100(aiAnalysisValues,tickPipSize),[aiAnalysisValues,tickPipSize]);const selectedTickValues=useMemo(()=>chartSourceValues.slice(-tickWindow),[chartSourceValues,tickWindow]);const selectedTickDigits=useMemo(()=>selectedTickValues.map(v=>digit(v,tickPipSize)).filter((d):d is number=>d!==null),[selectedTickValues,tickPipSize]);const st=useMemo(()=>stats(selectedTickValues,tickPipSize),[selectedTickValues,tickPipSize]);const tickDataReady=selectedTickValues.length>=(chartUsesExitSpots?Math.min(9,tickWindow):tickWindow)&&selectedTickDigits.length>=(chartUsesExitSpots?Math.min(9,tickWindow):tickWindow)&&(chartUsesExitSpots||(Boolean(tick?.epoch)&&Date.now()/1000-Number(tick?.epoch)<4));const latest=profitTransactions[0];const chartExitDigit=useMemo(()=>{if(!latest?.sell_time||latest.exit_spot==null)return null;const latestPip=latest.symbol?pipSizeBySymbolRef.current.get(latest.symbol)??(latest.symbol===symbol?tickPipSize:undefined):undefined;return Number.isFinite(Number(latestPip))&&Number(latestPip)>0?digit(latest.exit_spot,latestPip):null},[latest,tickPipSize,symbol]);const displayedExitDigit=chartUsesExitSpots?chartExitDigit:lastDigitSeen;const pnl=useMemo(()=>profitTransactions.reduce((a,x)=>a+Number(x.profit_loss||0),0),[profitTransactions]),closedOperations=profitTransactions.length,iaState=useMemo(()=>gestorRef.current.getEstado(),[stakeManagerVersion]),sonicState=useMemo(()=>sonicRef.current.getState(),[stakeManagerVersion]);
 const dailyTransactions=useMemo(()=>{const parts=historyDate.split('-').map(Number);if(parts.length!==3||parts.some(n=>!Number.isFinite(n)))return [];const [year,month,day]=parts;return dailyHistoryArchive.filter(x=>{const raw=Number(x.sell_time??x.purchase_time);if(!Number.isFinite(raw)||raw<=0)return false;const d=new Date(raw*1000);return d.getFullYear()===year&&d.getMonth()+1===month&&d.getDate()===day})},[dailyHistoryArchive,historyDate]);const dailyPnl=useMemo(()=>dailyTransactions.reduce((a,x)=>a+Number(x.profit_loss||0),0),[dailyTransactions]);const dailyWins=useMemo(()=>dailyTransactions.filter(x=>Number(x.profit_loss||0)>0).length,[dailyTransactions]);const dailyLosses=useMemo(()=>dailyTransactions.filter(x=>Number(x.profit_loss||0)<0).length,[dailyTransactions]);const dailyByBot=useMemo(()=>{const groups=new Map<string,{count:number;wins:number;losses:number;pnl:number}>();for(const x of dailyTransactions){const bot=String((x as any).bot||'Bot não identificado');const prev=groups.get(bot)||{count:0,wins:0,losses:0,pnl:0};const p=Number(x.profit_loss||0);prev.count+=1;if(p>0)prev.wins+=1;else if(p<0)prev.losses+=1;prev.pnl+=p;groups.set(bot,prev)}return Array.from(groups.entries()).sort((a,b)=>b[1].pnl-a[1].pnl)},[dailyTransactions]);useEffect(()=>{try{const key=`mozhyper-daily-history-v1:${account}`;const raw=localStorage.getItem(key);const stored=raw?JSON.parse(raw):[];if(Array.isArray(stored))setDailyHistoryArchive(stored)}catch{}},[account]); useEffect(()=>{let lastDate=localDateValue();const timer=window.setInterval(()=>{const today=localDateValue();if(today!==lastDate){lastDate=today;setHistoryDate(today);}},30000);return()=>window.clearInterval(timer)},[]);useEffect(()=>{if(!profitTransactions.length)return;const key=`mozhyper-daily-history-v1:${account}`;setDailyHistoryArchive(prev=>{const byId=new Map<number,any>();for(const x of prev){const id=Number(x.contract_id);if(Number.isFinite(id)&&id>0)byId.set(id,x)}for(const x of profitTransactions){const id=Number(x.contract_id);if(!Number.isFinite(id)||id<=0)continue;byId.set(id,{...byId.get(id),...x})}const next=Array.from(byId.values()).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time)).slice(0,2000);try{localStorage.setItem(key,JSON.stringify(next))}catch{}return next})},[profitTransactions,account]);const greeting=useMemo(()=>{const h=new Date().getHours();if(language==='pt')return h>=0&&h<6?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';if(language==='es')return h>=0&&h<6?'Buenas madrugadas':h<12?'Buenos días':h<18?'Buenas tardes':'Buenas noches';return h>=0&&h<6?'Good early morning':h<12?'Good morning':h<18?'Good afternoon':'Good evening'},[language]); useEffect(()=>{document.body.classList.toggle('light',theme==='light');return()=>{document.body.classList.remove('light')}},[theme]); useEffect(()=>{fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{const name=String(data?.user?.name||'').trim();if(name)setUserName(name)}).catch(()=>{})},[]); useEffect(()=>{let alive=true;const heartbeat=()=>{fetch('/api/online',{method:'POST',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(alive)setOnlineUsers(Number(data?.online)||0)}).catch(()=>{})};heartbeat();const id=window.setInterval(heartbeat,20000);return()=>{alive=false;clearInterval(id)}},[]);
 useEffect(()=>{try{const saved=localStorage.getItem('mozhyper-sound-enabled');if(saved!==null)setSoundEnabled(saved!=='false')}catch{}},[]);
 useEffect(()=>{
   let alive=true;
   const load=async()=>{
     try{
       const auth=await fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null);
       const geo=await fetch('/api/currency',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
       let country=String(auth?.user?.country||geo?.country||'').trim().toUpperCase();
       if(!/^[A-Z]{2}$/.test(country)) country='';
       let ipData:any=null;
       if(!country){
         ipData=await fetch('https://ipapi.co/json/',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
         country=String(ipData?.country_code||'').trim().toUpperCase();
         if(!/^[A-Z]{2}$/.test(country)) country='';
       }
       if(country && !auth?.user?.country && auth?.platformAuthenticated){
         const savedResponse=await fetch('/api/auth/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country})});
         if(!savedResponse.ok) throw new Error('Não foi possível guardar o país do cliente.');
         const savedCountry=await savedResponse.json().catch(()=>null);
         country=String(savedCountry?.country||country).trim().toUpperCase();
         if(!/^[A-Z]{2}$/.test(country)) country='';
       }
       const registeredCurrency=country?getCountryCurrency(country):'';
       const apiCurrency=normalizeCurrency(geo?.currency||ipData?.currency||'', 'USD');
       let native=registeredCurrency||apiCurrency;
       let rate=Number(geo?.currency===native?geo?.rate:0)>0?Number(geo.rate):(Number(ipData?.currency_rate)>0&&ipData?.currency===native?Number(ipData.currency_rate):(FALLBACK_RATES[native]||1));
       if(!alive)return;
       setClientCountry(country);
       setClientCountryReady(/^[A-Z]{2}$/.test(country));
       setPaymentAgentCurrency(country==='MZ'||country==='ZA'?'MZN':'');
       const isAllCurrenciesUser=String(auth?.user?.email||'').trim().toLowerCase()==='khatangana@gmail.com';
       if(native!=='USD'&&FALLBACK_RATES[native]&&!Number.isFinite(rate))rate=FALLBACK_RATES[native];
       CURRENCY_RATES[native]=rate;
       CURRENCY_LABELS[native]=getCurrencyMeta(native).symbol;
       setCurrencyOptions(isAllCurrenciesUser?Object.keys(CURRENCY_RATES):Array.from(new Set(['USD',native])));
       setCurrency('USD');
     }catch(error){
       console.error('[MozHyper] client country detection failed:',error);
       if(alive){setClientCountry('');setClientCountryReady(false);setPaymentAgentCurrency('');setCurrencyOptions(['USD']);}
     }
   };
   void load();
   return()=>{alive=false};
 },[]);
 useEffect(()=>{if(!menu)return;const onPointerDown=(e:PointerEvent)=>{const el=e.target as HTMLElement;if(!el.closest('.menu-trigger')&&!el.closest('.menu-popover'))setMenu(false)};document.addEventListener('pointerdown',onPointerDown);return()=>document.removeEventListener('pointerdown',onPointerDown)},[menu]);
 useEffect(()=>{if(!historyOpen)return;const onPointerDown=(e:PointerEvent)=>{const target=e.target as Node|null;if(historyRef.current&&!historyRef.current.contains(target))setHistoryOpen(false)};document.addEventListener('pointerdown',onPointerDown);return()=>document.removeEventListener('pointerdown',onPointerDown)},[historyOpen]);
 useEffect(()=>{if(isConnected)subscribeTicks(symbol)},[isConnected,symbol,subscribeTicks]);
 useEffect(()=>{
  hyperFlowObservationTicksRef.current=[];
  hyperFlowWatchRef.current={active:false,symbol,snapshots:[]};
  hyperFlowTargetDigitRef.current=0;
  hyperFlowNextDigitRef.current=null;
 },[symbol]);
 useEffect(()=>{
  if(running||smartAnalyzer)return;
  hyperFlowWatchRef.current={active:false,symbol,snapshots:[]};
  hyperFlowTargetDigitRef.current=0;
  hyperFlowNextDigitRef.current=null;
 },[running,smartAnalyzer,symbol]);
 useEffect(()=>{
  if(strategy==='MATCH0')return;
  hyperFlowWatchRef.current={active:false,symbol,snapshots:[]};
 },[strategy,symbol]);
 useEffect(()=>{if(!tick?.epoch||tick.epoch===lastEpoch.current)return;lastEpoch.current=tick.epoch;totalTickCountRef.current+=1;lastActivityAt.current=Date.now();const q=Number(tick.quote);if(!Number.isFinite(q))return;const tickSymbol=String((tick as any).symbol||symbol);const rawPipSize=normalizeTickPipSize((tick as any).pip_size);if(rawPipSize!==undefined){pipSizeBySymbolRef.current.set(tickSymbol,rawPipSize);if(tickSymbol===symbol)setTickPipSize(rawPipSize)}const pipSize=rawPipSize!==undefined?rawPipSize:(pipSizeBySymbolRef.current.get(tickSymbol)||(tickSymbol===symbol?tickPipSize:undefined));if(hypercoverAlternationRef.current.pauseTicksRemaining>0){hypercoverAlternationRef.current.pauseTicksRemaining=Math.max(0,hypercoverAlternationRef.current.pauseTicksRemaining-1);if(hypercoverAlternationRef.current.pauseTicksRemaining===0)setNotice('HYPERCOVER: pausa de 30 ticks concluída. A alternância OVER 1 / UNDER 8 foi retomada.')}const hyperFlowHistory=[...hyperFlowObservationTicksRef.current,q].slice(-200);
 hyperFlowObservationTicksRef.current=hyperFlowHistory;
 setLastDigitSeen(digit(q,pipSize));setTicks(prev=>[...prev,q].slice(-statsWindow))},[tick,tickPipSize,strategy,running,smartAnalyzer,symbol,hyperFlowFallbackRevision]);
 useEffect(()=>{if(!iaPower&&!sonic&&!smartAnalyzer)setSorosStake(stake)},[stake,iaPower,sonic,smartAnalyzer,setSorosStake]);
 useEffect(()=>{setSorosEnabled(false);setSorosStake(stake)},[iaPower,sonic,smartAnalyzer,stake,setSorosEnabled,setSorosStake]);
 useEffect(()=>{if(!running){gestorRef.current=criarGestorStake({stakeBase:stake,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale});sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});setStakeManagerVersion(v=>v+1)}},[stake,maxMartingale,running]);
 useEffect(()=>{setSignalNow(null);requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();hyperFlowNormalSignalDisarmedRef.current=false;if(strategy==='HYPERFLOWS'){hyperFlowsAnalysisActiveRef.current=false;hyperFlowsNextDigitRef.current=null;hyperFlowsRecoveryModeRef.current=false;hyperFlowsConsecutiveLossesRef.current=0;hyperFlowsDeficitRef.current=0;hyperFlowsLastTradeModeRef.current=null;hyperFlowsLastEntryTickRef.current=null;}barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null},[tickWindow,strategy]); useEffect(()=>{setTicks([]);setSignalNow(null);setTickPipSize(undefined);setLastDigitSeen(null);requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();hyperFlowNormalSignalDisarmedRef.current=false;if(strategy==='HYPERFLOWS'){hyperFlowsAnalysisActiveRef.current=false;hyperFlowsNextDigitRef.current=null;hyperFlowsRecoveryModeRef.current=false;hyperFlowsConsecutiveLossesRef.current=0;hyperFlowsDeficitRef.current=0;hyperFlowsLastTradeModeRef.current=null;hyperFlowsLastEntryTickRef.current=null;}totalTickCountRef.current=0;lastAnalyzerEvalTickRef.current=0;analyzerLastSwitchTickRef.current=-1000;analyzerDecisionHistoryRef.current=[];analyzerLastSwitchAtRef.current=0;analyzerConfirmedRef.current=false;analyzerConfirmedStrategyRef.current=null;barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null},[symbol]);
 useEffect(()=>{if((!running&&!smartAnalyzer)||!isConnected)return;const id=window.setInterval(()=>fetchProfitTable({limit:500,offset:0,sort:'DESC'}),5000);return()=>clearInterval(id)},[running,smartAnalyzer,isConnected,fetchProfitTable]);
 useEffect(()=>{if(!running&&!smartAnalyzer)return;const id=window.setInterval(()=>{if(requested.current&&!proposal&&!buying&&activeContractId===null&&trackedContractId===null&&(requestStartedAt.current<=0||Date.now()-requestStartedAt.current>5000)){console.warn('[Bot watchdog] Solicitação sem proposta, compra ou contrato ativo durante 5s; a libertar bloqueios.',{riskAwaitingContractId:riskAwaitingContractRef.current,iaPower,sonic});requested.current=false;requestStartedAt.current=0;clearProposal();if(riskAwaitingContractRef.current!==null)riskAwaitingContractRef.current=null;stakeReadyRef.current=true;riskLockStartedAt.current=0;pendingRiskStakeRef.current=null;iaRecoveryQuotePendingRef.current=false;pendingAutoEntryRef.current=null;hyperFlowRecoveryQuoteStageRef.current=null;hyperFlowRecoveryQuoteAttemptsRef.current=0;hyperFlowRecoveryQuoteReadyRef.current=false;hyperFlowRecoveryQuoteTargetRef.current=null;clearProposal();setBotActivity('reconcilingBot');lastActivityAt.current=Date.now()}if((iaPower||sonic)&&(riskAwaitingContractRef.current!==null||!stakeReadyRef.current)&&riskLockStartedAt.current>0&&activeContractId===null&&trackedContractId===null&&!proposal&&!buying&&!requested.current&&Date.now()-riskLockStartedAt.current>20000){console.error('[Bot watchdog] Stale risk lock with no active contract for 20s; releasing it.',{riskAwaitingContractId:riskAwaitingContractRef.current,stakeReady:stakeReadyRef.current,ageMs:Date.now()-riskLockStartedAt.current});riskAwaitingContractRef.current=null;stakeReadyRef.current=true;riskLockStartedAt.current=0;pendingRiskStakeRef.current=null;iaRecoveryQuotePendingRef.current=false;setBotActivity('waitingRobotSignal');setNotice('Bloqueio de risco desatualizado detectado sem contrato ativo. O ciclo foi libertado e a análise será retomada.');lastActivityAt.current=Date.now()}if(signalNow&&!proposal&&!buying&&activeContractId===null&&riskAwaitingContractRef.current===null&&Date.now()-lastActivityAt.current>5500){requested.current=false;requestStartedAt.current=0;if(!(iaPower||sonic))stakeReadyRef.current=true;subscribeTicks(symbol);lastActivityAt.current=Date.now()-4500}},1000);return()=>clearInterval(id)},[running,smartAnalyzer,proposal,buying,activeContractId,trackedContractId,signalNow,symbol,subscribeTicks,latest,iaPower,sonic,clearProposal]);
 useEffect(()=>{
  if(!botArmedRef.current||(!running&&!smartAnalyzer)||stopped.current)return;
  // A recuperação integral não deve ser reavaliada nem gerar avisos a cada tick
  // enquanto o saldo continua abaixo da stake calculada. Retomar só depois de
  // verificar novamente o saldo e recalcular o payout/deficit.
  if(recoveryBalancePauseRef.current!==null){
   const pausedBalance=Number(balance?.balance);
   if(!Number.isFinite(pausedBalance)||pausedBalance+0.005<recoveryBalancePauseRef.current){setBotActivity('waitingRobotSignal');return;}
   recoveryBalancePauseRef.current=null;
   setNotice('Saldo atualizado. A validar novamente a cotação e o défice antes de retomar a recuperação.');
  }
  // Bot normal: últimos 9 ticks ao vivo com gatilho de 65%.
  // AI Analyst normal: 25 ticks ao vivo (5 blocos de 5), gatilho de 65%.
  // Os 28 Exit Spots e o gatilho de 20% são uma modalidade separada e não podem
  // bloquear o AI Analyst normal quando não há histórico suficiente de operações.
    if(hypercoverAlternationRef.current.pauseTicksRemaining>0&&(strategy==='HYPERCOVER'||smartAnalyzer||hypercoverAlternationRef.current.forceNextDirection)){setBotActivity('waitingRobotSignal');return;}
  const forceHypercover=hypercoverAlternationRef.current.forceNextDirection;
  const hyperFlowFallbackActive=strategy==='MATCH0'&&hyperFlowOverZeroModeRef.current;
  if(!forceHypercover&&!hyperFlowFallbackActive&&(exitSpotsMode?analysisExitValues.length<28:(smartAnalyzer?aiAnalysisValues.length<25:botAnalysisValues.length<9))){setBotActivity(exitSpotsMode?'waitingExitSpots':'collectingTicks');return;}
  let analystStrategy:Strategy|null=null;
  if(smartAnalyzer&&!forceHypercover&&!exitSpotsMode&&!hyperFlowFallbackActive&&strategy!=='HYPERFLOWS'){
   if(!smartAdvice||smartAdvice.noTrade){setBotActivity('waitingAnalystSignal');return;}
   analystStrategy=ANALYZER_STRATEGY_TO_BOT[smartAdvice.strategy]||null;
   if(!analystStrategy||strategy!==analystStrategy){setBotActivity('waitingAnalystSignal');return;}
  }
  if(!forceHypercover&&!hyperFlowFallbackActive&&strategy!=='HYPERFLOWS'&&pendingAnalyzerStrategyRef.current&&pendingAnalyzerStrategyRef.current!==strategy){setBotActivity('waitingAnalystSignal');return;}
  if(proposal||buying||activeContractId!==null||trackedContractId!==null||!isAuthorized||!isConnected){setBotActivity(!isConnected||!isAuthorized?'reconnectingDeriv':(buying?'waitingBuyConfirmation':'reconcilingBot'));return;}
  let freshSignal:any=null;
  if(forceHypercover){const forced=hypercoverAlternationRef.current;freshSignal={contract:forced.contractType==='DIGITOVER'?'OVER':'UNDER',label:forced.contractType==='DIGITOVER'?'ACIMA 1':'ABAIXO 8',strength:100,score:100,barrier:forced.barrier,contractType:forced.contractType,forcedHypercover:true};}else if(hyperFlowFallbackActive){
   if(hyperFlowOverZeroModeRef.current){
    freshSignal={contract:'OVER' as Contract,label:'ACIMA 0',strength:90,score:90,barrier:0,contractType:'DIGITOVER',hyperFlowOverZero:true};
   }
  }else if(strategy==='HYPERFLOWS'){
   const latest10=hyperFlowObservationTicksRef.current.slice(-10).map(value=>digit(value,tickPipSize)).filter((value):value is number=>value!==null);
   if(latest10.length===10&&!hyperFlowsAnalysisActiveRef.current&&latest10.filter(value=>value===0).length>=1){
    hyperFlowsAnalysisActiveRef.current=true;
    console.info('[HyperFlows analysis activated]',{symbol,latest10,zeroPercent:latest10.filter(value=>value===0).length*10});
    setNotice('HyperFlows: dígito 0 atingiu 10% nos últimos 10 ticks. Análise de força dos dígitos 0–8 ativada.');
   }
   if(hyperFlowsRecoveryModeRef.current){
    freshSignal={contract:'UNDER' as Contract,label:'UNDER 9 — RECUPERAÇÃO',strength:100,score:100,barrier:9,contractType:'DIGITUNDER',hyperFlowsRecovery:true};
   }else if(hyperFlowsNextDigitRef.current!==null){
    freshSignal={contract:'MATCH9' as Contract,label:'MATCH '+hyperFlowsNextDigitRef.current+' — ALTERNATIVO',strength:90,score:90,barrier:hyperFlowsNextDigitRef.current,contractType:'DIGITMATCH',hyperFlowsAlternate:true};
   }else if(hyperFlowsAnalysisActiveRef.current&&latest10.length===10){
    const latest9=latest10.slice(-9);
    const zeroPercent=latest9.filter(value=>value===0).length/9*100;
    if(zeroPercent>=22)freshSignal={contract:'MATCH9' as Contract,label:'MATCH 9',strength:Math.round(zeroPercent),score:Math.round(zeroPercent),barrier:9,contractType:'DIGITMATCH',hyperFlowsMain:true};
   }
  }else if(exitSpotsMode){
   const exitSignal=isRecoveryStrategy(strategy)?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current||initialBarrierState(strategy),tickPipSize):makeExitSpotSignal(analysisExitValues,strategy,tickPipSize,true);
   if(exitSignal)freshSignal=exitSignal;
  }else if(smartAnalyzer){
   if(analystStrategy&&isRecoveryStrategy(analystStrategy)){
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
   freshSignal=makeBarrierSignal(ticks.slice(-10),barrierStateRef.current,tickPipSize,65,10);
  }else{
   freshSignal=makeNormalMomentumSignal9(ticks.slice(-10),strategy,tickPipSize,65,10);
  }
  if(!freshSignal){if(strategy==='MATCH0'&&!hyperFlowOverZeroModeRef.current)hyperFlowNormalSignalDisarmedRef.current=false;setBotActivity('waitingRobotSignal');return;}
  if(strategy==='MATCH0'&&!hyperFlowOverZeroModeRef.current&&hyperFlowNormalSignalDisarmedRef.current){setBotActivity('waitingRobotSignal');return;}
  const hyperFlowTickEpoch=Number(tick?.epoch);
  if(strategy==='MATCH0'&&Number.isFinite(hyperFlowTickEpoch)){
   const lastEntry=hyperFlowLastEntryTickRef.current;
   if(lastEntry&&lastEntry.symbol===symbol&&lastEntry.epoch===hyperFlowTickEpoch){
    setBotActivity('waitingRobotSignal');
    return;
   }
  }
  if(strategy==='HYPERFLOWS'&&Number.isFinite(hyperFlowTickEpoch)){
   const lastEntry=hyperFlowsLastEntryTickRef.current;
   if(lastEntry&&lastEntry.symbol===symbol&&lastEntry.epoch===hyperFlowTickEpoch){setBotActivity('waitingRobotSignal');return;}
  }
  if(requested.current){setBotActivity(proposal?'requestingProposal':'reconcilingBot');return;}
  if(strategy!=='MATCH0'&&(iaPower||sonic)&&(riskAwaitingContractRef.current!==null||!stakeReadyRef.current)){setBotActivity('reconcilingBot');return;}
  // Until a validated buy is actually sent, keep the state recoverable.
  // Do not display SENDINGDIRECTBUY while computing the stake or exiting a guard.
  setBotActivity('reconcilingBot');
  stakeReadyRef.current=false;riskLockStartedAt.current=Date.now();
  if(strategy==='MATCH0'&&Number.isFinite(hyperFlowTickEpoch))hyperFlowLastEntryTickRef.current={symbol,epoch:hyperFlowTickEpoch};
  if(strategy==='HYPERFLOWS'&&Number.isFinite(hyperFlowTickEpoch))hyperFlowsLastEntryTickRef.current={symbol,epoch:hyperFlowTickEpoch};
  requested.current=true;
  requestStartedAt.current=Date.now();
  lastActivityAt.current=Date.now();
  let contractTypeStr:string,barrier:number;
  const strategyName:string=String(strategy);
  if(freshSignal?.forcedHypercover){const forced=hypercoverAlternationRef.current;contractTypeStr=forced.contractType;barrier=forced.barrier;}else if(isRecoveryStrategy(strategy)&&barrierStateRef.current){
   contractTypeStr=barrierStateRef.current.contractType;
   barrier=barrierStateRef.current.barrier;
  } else {
   const c:Contract=freshSignal.contract as Contract;
   barrier=strategyName==='HYPERFLOWS'?Number(freshSignal?.barrier??9):strategyName==='MATCH0'&&hyperFlowOverZeroModeRef.current?0:
    isRecoveryStrategy(strategy)?(barrierStateRef.current?.barrier??4):
    strategyName==='HYPERGUARD'?0:strategyName==='HYPERSHIELD'?4:strategyName==='HYPERBREAK'?8:strategyName==='HYPERCOVER'?(c==='OVER'?1:8):
    c==='DIFFER'?0:c==='MATCH0'?0:c==='OVER'?5:c==='UNDER'?4:0;
   contractTypeStr=TYPES[c];
  }
  if(strategyName==='MATCH0')hyperFlowTargetDigitRef.current=barrier;
  // Sonic é a fonte de verdade da stake quando está ativo.
  // O Soros interno do Sonic controla a repetição da mesma stake vencedora.
  // HyperFlow uses the configured normal stake and bypasses IA Power/Sonic recovery sizing.
  const rawAmount=(strategy==='MATCH0'||strategy==='HYPERFLOWS')?stake:(iaPower?gestorRef.current.proximoStake():(sonic?sonicRef.current.getStake():stake));
  const availableBalance=Number(balance?.balance);
  const maxStakeByBalance=Math.floor(availableBalance*100)/100;
  if(!Number.isFinite(availableBalance)||availableBalance<=0||maxStakeByBalance<0.35){
   console.warn('[Bot entry blocked: balance unavailable or below minimum]',{account,balance:balance?.balance,currency:balance?.currency,minimumStake:0.35,strategy});
   requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;pendingRiskStakeRef.current=null;
   setBotActivity('reconcilingBot');lastActivityAt.current=Date.now();
   setNotice('Operação aguardada: saldo indisponível ou inferior à stake mínima de 0,35. O robô voltará a tentar quando o saldo estiver válido.');
   return;
  }
  const iaState=iaPower?gestorRef.current.getEstado():null;
  const iaRecovery=strategy!=='MATCH0'&&strategy!=='HYPERFLOWS'&&iaPower?Boolean(iaState?.emMartingale||Number(iaState?.deficitRecuperacao||0)>0.01):false;
  const sonicRecovery=strategy!=='MATCH0'&&strategy!=='HYPERFLOWS'&&sonic?Boolean(sonicRef.current.getState().inMartingale||Number(sonicRef.current.getState().recoveryDeficit||0)>0.01):false;
  const recoveryActive=iaRecovery||sonicRecovery;

  // Em IA POWER, o payout de recuperação deve ser o payout REAL
  // da proposta do HyperShield, não o payout padrão/stale de 0.95.
  // Fazemos uma cotação-semente primeiro; quando a proposta chegar,
  // o efeito de [proposal] recalcula a stake para recuperar o défice.
    const desiredStake=Math.max(0.35,Number(rawAmount)||0.35);
  // Sonic recovery must be one full-deficit operation. Never silently cap it to the available balance.
  if(sonicRecovery&&desiredStake>maxStakeByBalance+0.005){
   recoveryBalancePauseRef.current=desiredStake;
   console.warn('[Bot entry blocked: Sonic recovery exceeds balance]',{account,balance:availableBalance,desiredStake,maxStakeByBalance,strategy});
   pendingRiskStakeRef.current=null;requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;
   setBotActivity('waitingRobotSignal');lastActivityAt.current=Date.now();
   setNotice('SONIC pausado: saldo insuficiente para recuperar todo o défice numa única operação. A recuperação não será reduzida nem executada parcialmente.');
   return;
  }
  let amount=Math.max(0.35,Math.min(desiredStake,maxStakeByBalance));
  // Direct buys skip proposal requests. Recovery uses the latest observed real
  // payout ratio; if the balance cannot cover the estimated full recovery, pause.
  const recoveryRatio=Math.max(0.01,payoutRatioForContract(contractTypeStr,barrier));
  if(iaPower&&iaRecovery){
   const deficit=Number(iaState?.deficitRecuperacao||0);
   const recoveryStake=Math.max(0.35,Math.ceil((Math.max(0,deficit)/recoveryRatio)*100-1e-9)/100);
   if(recoveryStake>maxStakeByBalance+0.005){
    recoveryBalancePauseRef.current=recoveryStake;
    console.warn('[Bot entry blocked: recovery exceeds balance]',{account,balance:availableBalance,deficit,recoveryRatio,recoveryStake,maxStakeByBalance,strategy});
    requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;pendingRiskStakeRef.current=null;
    setBotActivity('waitingRobotSignal');lastActivityAt.current=Date.now();
    setNotice('Recuperação pausada: o saldo não cobre a stake estimada para recuperar todo o défice numa única operação.');
    return;
   }
   amount=recoveryStake;
  }
  // HyperFlow ACIMA 0 has a fixed $15 stake and one-tick duration; it never sizes
  // the stake from accumulated losses. Do not place the trade if balance is insufficient.
  if(strategyName==='MATCH0'&&hyperFlowOverZeroModeRef.current){
   if(maxStakeByBalance<15){
    requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;pendingRiskStakeRef.current=null;
    setBotActivity('waitingRobotSignal');lastActivityAt.current=Date.now();
    setNotice('HyperFlow ACIMA 0 aguardado: é necessário saldo disponível de pelo menos $15. Não será acumulado nem recuperado qualquer défice.');
    return;
   }
   amount=15;
  }

  if(strategyName==='HYPERFLOWS'&&hyperFlowsRecoveryModeRef.current){
   const deficit=Math.max(0,Number(hyperFlowsDeficitRef.current)||0);
   const observedRatio=payoutRatiosByContractRef.current[payoutContractKey('DIGITUNDER',9)];
   // UNDER 9 wins on digits 0–8. Until the real net payout is observed, use a conservative 5% estimate.
   const recoveryRatio=Number.isFinite(observedRatio)&&observedRatio>0?observedRatio:0.05;
   const recoveryStake=Math.max(0.35,Math.ceil((deficit/recoveryRatio)*100-1e-9)/100);
   if(!Number.isFinite(availableBalance)||recoveryStake>maxStakeByBalance+0.005){
    recoveryBalancePauseRef.current=recoveryStake;
    requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;pendingRiskStakeRef.current=null;
    setBotActivity('waitingRobotSignal');lastActivityAt.current=Date.now();
    setNotice('HyperFlows: recuperação UNDER 9 pausada. Stake estimada '+recoveryStake.toFixed(2)+' para cobrir o défice de '+deficit.toFixed(2)+', mas o saldo disponível é '+Math.max(0,availableBalance).toFixed(2)+'. Nenhuma compra foi enviada.');
    console.warn('[HyperFlows UNDER 9 recovery blocked: insufficient total balance]',{symbol,deficit,recoveryRatio,recoveryStake,availableBalance});
    return;
   }
   amount=recoveryStake;
   console.info('[HyperFlows UNDER 9 recovery stake]',{symbol,deficit,recoveryRatio,recoveryStake,availableBalance,durationTicks:10});
  }

  iaRecoveryQuotePendingRef.current=false;

  if(strategy!=='MATCH0'&&(iaPower||sonic))pendingRiskStakeRef.current=Number(amount.toFixed(2)); else if(strategy==='MATCH0')pendingRiskStakeRef.current=null;
  if(strategyName==='HYPERCOVER'||hypercoverAlternationRef.current.forceNextDirection){requestedHypercoverContractRef.current={contractType:contractTypeStr as 'DIGITOVER'|'DIGITUNDER',barrier};}else requestedHypercoverContractRef.current=null;
  const botName=hypercoverAlternationRef.current.forceNextDirection?'Hypercover':STRATEGY_BOT_NAMES[strategy];
  if(botName==='Hypercover'){
   const expectedType=contractTypeStr==='DIGITOVER'?'DIGITOVER':contractTypeStr==='DIGITUNDER'?'DIGITUNDER':'';
   const expectedBarrier=expectedType==='DIGITOVER'?1:expectedType==='DIGITUNDER'?8:NaN;
   if(!expectedType||barrier!==expectedBarrier){
    requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;
    setBotActivity('waitingRobotSignal');lastActivityAt.current=Date.now();
    console.warn('[Hypercover entry blocked: invalid contract/barrier]',{contractTypeStr,barrier,expectedType,expectedBarrier});
    setNotice('Hypercover: compra directa cancelada; só são permitidos OVER 1 e UNDER 8.');
    return;
   }
   requestedHypercoverContractRef.current={contractType:expectedType as 'DIGITOVER'|'DIGITUNDER',barrier:expectedBarrier};
  }else requestedHypercoverContractRef.current=null;
  const isHyperFlowRecoveryTrade=strategyName==='MATCH0'&&hyperFlowOverZeroModeRef.current;
  const isHyperFlowsRecoveryTrade=strategyName==='HYPERFLOWS'&&hyperFlowsRecoveryModeRef.current&&Boolean(freshSignal?.hyperFlowsRecovery);
  const hyperFlowsTradeMode:'MATCH9'|'ALTERNATE'|'UNDER9'|null=strategyName!=='HYPERFLOWS'?null:(isHyperFlowsRecoveryTrade?'UNDER9':freshSignal?.hyperFlowsAlternate?'ALTERNATE':'MATCH9');
  if(strategyName==='MATCH0'&&!isHyperFlowRecoveryTrade)hyperFlowNormalSignalDisarmedRef.current=true;
  if(isHyperFlowRecoveryTrade&&hyperFlowRecoveryBuyPendingRef.current){
   // The hook's synchronous buy lock and active-contract refs are authoritative.
   // If neither an acknowledged/pending buy nor an active contract exists, this
   // component-only flag is stale (for example, close metadata had no bot name).
   const hyperFlowPurchaseStillTracked=Boolean(buying||proposal||activeContractId!==null||trackedContractId!==null);
   if(hyperFlowPurchaseStillTracked){
    requested.current=false;
    requestStartedAt.current=0;
    setBotActivity('waitingBuyConfirmation');
    lastActivityAt.current=Date.now();
    return;
   }
   console.warn('[HyperFlow ACIMA 0 stale entry lock cleared]',{symbol,reason:'no pending buy or active contract remains'});
   hyperFlowRecoveryBuyPendingRef.current=false;
  }
  pendingAutoEntryRef.current=null;
  // SENDINGDIRECTBUY now only covers the actual buy invocation.
  setBotActivity('sendingDirectBuy');
  let sent=false;
  try{
   const contractDuration=isHyperFlowsRecoveryTrade?10:1;
   if(isHyperFlowRecoveryTrade)hyperFlowRecoveryBuyPendingRef.current=true;
   if(hyperFlowsTradeMode)hyperFlowsLastTradeModeRef.current=hyperFlowsTradeMode;
   sent=buyDirect({symbol,contractType:isHyperFlowsRecoveryTrade?'DIGITUNDER':isHyperFlowRecoveryTrade?'DIGITOVER':contractTypeStr,amount,duration:contractDuration,barrier:isHyperFlowsRecoveryTrade?9:isHyperFlowRecoveryTrade?0:barrier,currency:String(balance?.currency||'USD')},amount,botName,isHyperFlowsRecoveryTrade?9:isHyperFlowRecoveryTrade?0:barrier);
  }catch(buyError){
   if(hyperFlowsTradeMode&&hyperFlowsLastTradeModeRef.current===hyperFlowsTradeMode)hyperFlowsLastTradeModeRef.current=null;
   if(isHyperFlowRecoveryTrade)hyperFlowRecoveryBuyPendingRef.current=false;
   if(strategyName==='MATCH0'&&!isHyperFlowRecoveryTrade)hyperFlowNormalSignalDisarmedRef.current=false;
   console.error('[Bot direct buy exception]',buyError,{account,strategy,symbol,contractTypeStr,barrier,amount});
   if(iaPower||sonic)pendingRiskStakeRef.current=null;
   requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;
   setBotActivity('reconcilingBot');lastActivityAt.current=Date.now();
   setNotice('Compra não enviada por erro interno. O robô libertou o bloqueio e continuará a analisar.');
   return;
  }
  if(sent&&hyperFlowsTradeMode==='ALTERNATE')hyperFlowsNextDigitRef.current=null;
  if(!sent){
   if(hyperFlowsTradeMode&&hyperFlowsLastTradeModeRef.current===hyperFlowsTradeMode)hyperFlowsLastTradeModeRef.current=null;
   if(isHyperFlowRecoveryTrade)hyperFlowRecoveryBuyPendingRef.current=false;
   if(strategyName==='MATCH0'&&!isHyperFlowRecoveryTrade)hyperFlowNormalSignalDisarmedRef.current=false;
   console.warn('[Bot direct buy returned false]',{account,strategy,symbol,contractType:isHyperFlowRecoveryTrade?'DIGITOVER':contractTypeStr,barrier:isHyperFlowRecoveryTrade?0:barrier,amount,availableBalance,buying,activeContractId,botName,at:new Date().toISOString()});
   setBotActivity('reconcilingBot');
   if(iaPower||sonic)pendingRiskStakeRef.current=null;
   // The hook logs whether this was a duplicate/in-flight request or a socket refusal.
   // Release only this local attempt; the active-contract lifecycle owns any open trade.
   requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;riskLockStartedAt.current=0;
   lastActivityAt.current=Date.now();
   setNotice('A compra não foi enviada. O motivo ficou registado para diagnóstico; o robô está a reconciliar o estado da conta.');
   return;
  }
  if(botName==='Hypercover'){
   hypercoverAlternationRef.current.lastDirection=contractTypeStr as 'DIGITOVER'|'DIGITUNDER';
   if(hypercoverAlternationRef.current.forceNextDirection)hypercoverAlternationRef.current.forceNextDirection=false;
   requestedHypercoverContractRef.current=null;
  }
  setBotActivity('waitingBuyConfirmation');
 },[running,smartAnalyzer,exitSpotsMode,smartAdvice,analysisExitValues,botAnalysisValues,aiAnalysisValues,ticks,tick,exitSpotReady,tickWindow,tickPipSize,proposal,buying,activeContractId,trackedContractId,isAuthorized,isConnected,getProposal,clearProposal,buyDirect,symbol,soros.stake,stake,iaPower,sonic,stakeManagerVersion,balance?.balance,strategy,hypercoverRevision,hyperFlowFallbackRevision]); useEffect(()=>{
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
   clearProposal();
   if(!getProposal(symbol,type,amount,1,b,false)){
    requested.current=false;
    requestStartedAt.current=0;
   }
   return;
  }

  pendingRiskStakeRef.current=Number(amount.toFixed(2));
  iaRecoveryQuotePendingRef.current=false;
 },[iaPower,running,smartAnalyzer,proposal,buying,activeContractId,isAuthorized,isConnected,balance?.balance,getProposal,clearProposal,symbol]); useEffect(()=>{
   if(!botArmedRef.current||(!running&&!smartAnalyzer)||stopped.current||!proposal||buying||activeContractId!==null||!isAuthorized||!isConnected)return;
   if(iaPower&&iaRecoveryQuotePendingRef.current)return;
   if(pendingAnalyzerStrategyRef.current&&pendingAnalyzerStrategyRef.current!==strategy&&!(strategy==='MATCH0'&&hyperFlowOverZeroModeRef.current))return;

   const cancelUnqualifiedEntry=(message:string)=>{
    pendingAutoEntryRef.current=null;
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

   // Last-moment validation rechecks the exact data window for the active mode.
   {
   const cancelUnqualifiedEntry=(message:string)=>{
     pendingAutoEntryRef.current=null;
     setBotActivity('waitingRobotSignal');
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
    if(hypercoverAlternationRef.current.pauseTicksRemaining>0&&(strategy==='HYPERCOVER'||smartAnalyzer||hypercoverAlternationRef.current.forceNextDirection)){clearProposal();requested.current=false;requestStartedAt.current=0;return;}
    const forceHypercover=hypercoverAlternationRef.current.forceNextDirection;
    if(forceHypercover){const forced=hypercoverAlternationRef.current;validationSignal={contract:forced.contractType==='DIGITOVER'?'OVER':'UNDER',label:forced.contractType==='DIGITOVER'?'HYPERCOVER OVER 1':'HYPERCOVER UNDER 8',strength:100,barrier:forced.barrier,contractType:forced.contractType,forcedHypercover:true};}
    else if(strategy==='HYPERFLOWS'){
     const latest10=hyperFlowObservationTicksRef.current.slice(-10).map(value=>digit(value,tickPipSize)).filter((value):value is number=>value!==null);
     if(latest10.length===10&&!hyperFlowsAnalysisActiveRef.current&&latest10.filter(value=>value===0).length>=1)hyperFlowsAnalysisActiveRef.current=true;
     if(hyperFlowsRecoveryModeRef.current){
      validationSignal={contract:'UNDER' as Contract,label:'UNDER 9 — RECUPERAÇÃO',strength:100,barrier:9,contractType:'DIGITUNDER',hyperFlowsRecovery:true};
     }else if(hyperFlowsNextDigitRef.current!==null){
      validationSignal={contract:'MATCH9' as Contract,label:'MATCH '+hyperFlowsNextDigitRef.current+' — ALTERNATIVO',strength:90,barrier:hyperFlowsNextDigitRef.current,contractType:'DIGITMATCH',hyperFlowsAlternate:true};
     }else if(hyperFlowsAnalysisActiveRef.current&&latest10.length===10&&latest10.slice(-9).filter(value=>value===0).length/9*100>=22){
      validationSignal={contract:'MATCH9' as Contract,label:'MATCH 9',strength:22,barrier:9,contractType:'DIGITMATCH',hyperFlowsMain:true};
     }
    }
    else if(exitSpotsMode){
     validationSignal=isRecoveryStrategy(strategy)
      ?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current||initialBarrierState(strategy),tickPipSize)
      :makeExitSpotSignal(analysisExitValues,strategy,tickPipSize,true);
    }
    else if(smartAnalyzer){
     advice=smartAdvice;
     const mapped=advice?ANALYZER_STRATEGY_TO_BOT[String(advice.strategy)]||String(advice.strategy):'';
     const pendingQuote=pendingAutoEntryRef.current;const hasMatchingPendingQuote=Boolean(pendingQuote&&pendingQuote.strategy===strategy&&pendingQuote.symbol===symbol&&pendingQuote.smartAnalyzer&&!pendingQuote.exitSpotsMode&&Date.now()-pendingQuote.requestedAt<=10000);if(!forceHypercover&&(!advice||(!exitSpotsMode&&advice.noTrade&&!hasMatchingPendingQuote)||mapped!==strategy)){
      cancelUnqualifiedEntry('Sinal mudou antes da compra; a aguardar uma nova análise.');
      return;
     }
     else if(exitSpotsMode){
      validationSignal=isRecoveryStrategy(strategy)
       ?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current,tickPipSize)
       :makeExitSpotSignal(analysisExitValues,strategy,tickPipSize,true);
     }else if(isRecoveryStrategy(strategy)){
      const pending=pendingAutoEntryRef.current;
      if(pending&&pending.strategy===strategy&&pending.symbol===symbol&&pending.smartAnalyzer&&!pending.exitSpotsMode&&Date.now()-pending.requestedAt<=10000){
       validationSignal=pending.signal;
      }else{
       const state=barrierStateRef.current||initialBarrierState(strategy);
       validationSignal=makeBarrierSignal(aiAnalysisValues,state,tickPipSize,65,25);
       if(!confirmBarrierRecent(aiAnalysisValues.slice(-5),state,tickPipSize))validationSignal=null;
      }
     }else{
      const pending=pendingAutoEntryRef.current;
      if(pending&&pending.strategy===strategy&&pending.symbol===symbol&&pending.smartAnalyzer&&!pending.exitSpotsMode&&Date.now()-pending.requestedAt<=10000){
       validationSignal=pending.signal;
       if(validationSignal&&validationSignal.contract!==advice.contract)validationSignal=null;
      }else{
       validationSignal=makeSignal(aiAnalysisValues,strategy,tickPipSize,false,65,25);
       if(!confirmAnalyzerRecent(aiAnalysisValues,String(advice.strategy),String(advice.label),tickPipSize))validationSignal=null;
       if(validationSignal&&validationSignal.contract!==advice.contract)validationSignal=null;
      }
     }
     if(exitSpotsMode&&validationSignal&&!isRecoveryStrategy(strategy)&&validationSignal.contract!==advice.contract)validationSignal=null;
    }else{
     const pending=pendingAutoEntryRef.current;
     const pendingMatches=pending&&pending.strategy===strategy&&pending.symbol===symbol&&!pending.smartAnalyzer&&Date.now()-pending.requestedAt<=10000;
     if(pendingMatches){
      validationSignal=pending.signal;
     }else if(isRecoveryStrategy(strategy)){
      validationSignal=makeBarrierSignal(ticks.slice(-10),barrierStateRef.current,tickPipSize,65,10);
     }else{
      validationSignal=makeNormalMomentumSignal9(ticks.slice(-10),strategy,tickPipSize,65,10);
     }
    }
    if(strategy==='MATCH0'&&hyperFlowOverZeroModeRef.current){
     validationSignal={contract:'OVER' as Contract,label:'ACIMA 0',strength:90,barrier:0,contractType:'DIGITOVER',hyperFlowOverZero:true};
    }
    if(!validationSignal){
     cancelUnqualifiedEntry(smartAnalyzer?(exitSpotsMode?'Exit Spots: o sinal já não cumpre 20% nos 28 resultados e nos blocos.':'AI Analyst: falta o gatilho de 65% e a confirmação dos últimos 5 ticks.'):'Robô normal: sem gatilho de 65% ou tendência antecipada confirmada nos últimos 9 ticks.');
     return;
    }
    const expectedContract=validationSignal.contract as Contract|null;
    const proposalType=String((proposal as any).requested_contract_type||(proposal as any).contract_type||'').toUpperCase();
    if(!isRecoveryStrategy(strategy)&&proposalType&&expectedContract&&proposalType!==TYPES[expectedContract]){
     cancelUnqualifiedEntry('Entrada cancelada: o contrato cotado já não corresponde ao sinal mais recente.');
     return;
    }
   }

   const botName=hypercoverAlternationRef.current.forceNextDirection?'Hypercover':STRATEGY_BOT_NAMES[strategy];
   const forcedHypercoverBuy=hypercoverAlternationRef.current.forceNextDirection&&botName==='Hypercover';
   let hypercoverBarrierToRecord:number|undefined;
   if(botName==='Hypercover'){
    const requestContract=requestedHypercoverContractRef.current;
    const intendedType=requestContract?.contractType??'';
    const expectedBarrier=requestContract?.barrier??NaN;
    const requiredBarrier=intendedType==='DIGITOVER'?1:intendedType==='DIGITUNDER'?8:NaN;
    const requestedQuoteType=String((proposal as any).requested_contract_type||(proposal as any).contract_type||'').toUpperCase();
    const requestedQuoteBarrier=Number((proposal as any).requested_barrier);
    const quotedBarrier=Number.isFinite(requestedQuoteBarrier)?requestedQuoteBarrier:Number((proposal as any).barrier);
    const typeMismatch=requestedQuoteType!==intendedType;
    const barrierMismatch=!Number.isFinite(quotedBarrier)||quotedBarrier!==requiredBarrier;
    if(!requestContract||!Number.isFinite(requiredBarrier)||expectedBarrier!==requiredBarrier||typeMismatch||barrierMismatch){
     setNotice('Hypercover: operação cancelada. A cotação não corresponde exactamente a OVER 1 ou UNDER 8.');
     clearProposal();requested.current=false;requestStartedAt.current=0;stakeReadyRef.current=true;requestedHypercoverContractRef.current=null;
     return;
    }
    hypercoverBarrierToRecord=expectedBarrier;
   }
    const isHyperFlowRecoveryProposalTrade=strategy==='MATCH0'&&hyperFlowOverZeroModeRef.current&&hyperFlowRecoveryQuoteReadyRef.current;
    if(isHyperFlowRecoveryProposalTrade)hyperFlowRecoveryBuyPendingRef.current=true;
    const bought=buy(proposal.id,Number(proposal.ask_price),botName,botName==='Hypercover'?hypercoverBarrierToRecord:(proposal.barrier!=null&&Number.isFinite(Number(proposal.barrier))?Number(proposal.barrier):(Number.isFinite(Number((proposal as any).requested_barrier))?Number((proposal as any).requested_barrier):undefined)));
    if(bought){pendingAutoEntryRef.current=null;if(botName==='Hypercover')requestedHypercoverContractRef.current=null;if(isHyperFlowRecoveryProposalTrade)hyperFlowRecoveryQuoteReadyRef.current=false;}
    const boughtDirection=String((proposal as any).contract_type||(proposal as any).requested_contract_type||'').toUpperCase();if(bought&&botName==='Hypercover'&&(boughtDirection==='DIGITOVER'||boughtDirection==='DIGITUNDER')){hypercoverAlternationRef.current.lastDirection=boughtDirection as 'DIGITOVER'|'DIGITUNDER';if(forcedHypercoverBuy)hypercoverAlternationRef.current.forceNextDirection=false;}
    if(!bought){
    pendingAutoEntryRef.current=null;
    if(isHyperFlowRecoveryProposalTrade){hyperFlowRecoveryBuyPendingRef.current=false;hyperFlowRecoveryQuoteReadyRef.current=false;hyperFlowRecoveryQuoteStageRef.current=null;hyperFlowRecoveryQuoteAttemptsRef.current=0;hyperFlowRecoveryQuoteTargetRef.current=null;}
    clearProposal();
    setNotice('Falha ao enviar a operação para a Deriv.');
    requested.current=false;
    requestStartedAt.current=0;
    stakeReadyRef.current=true;riskLockStartedAt.current=0;
   }
  },[proposal,buying,activeContractId,running,smartAnalyzer,exitSpotsMode,smartAdvice,botAnalysisValues,aiAnalysisValues,analysisExitValues,ticks,exitSpotReady,tickWindow,tickPipSize,isAuthorized,isConnected,strategy,buy,iaPower,setSmartAdvice,clearProposal,getProposal,symbol,balance?.balance,hypercoverRevision]); useEffect(()=>{
   if(activeContractId!==null){
    riskAwaitingContractRef.current=activeContractId;
    stakeReadyRef.current=false;riskLockStartedAt.current=Date.now();
    requested.current=false;
    requestStartedAt.current=0;
    lastActivityAt.current=Date.now();
    return;
   }

   // Quando o contrato fecha, activeContractId volta a null.
   // É obrigatório libertar o bloqueio de risco; caso contrário o bot
   // acredita que ainda existe uma operação aberta e para para sempre.
   if(riskAwaitingContractRef.current!==null||!stakeReadyRef.current){
    riskAwaitingContractRef.current=null;
    stakeReadyRef.current=true;riskLockStartedAt.current=0;
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
 if(strategy==='MATCH0'&&hyperFlowOverZeroModeRef.current)return;
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
  // Never let the entry-confirmation step erase a block decided by the analyst.
  const candidateScore=Number(candidate.score)||0;
  const candidateConfidence=Number(candidate.confidence)||0;
  const candidateStability=Number(candidate.stability)||0;
  const candidatePhase=String(candidate.phase||'');
  const allowedEmerging=candidatePhase==='EMERGENTE'&&candidate.earlyMomentum===true&&candidateScore>=55&&candidateConfidence>=52&&candidateStability>=35;
  // AI Analyst normal uses only the 65% trigger; no quality, concentration, phase, stability, or last-5-tick filter.
  if(candidate.noTrade===true||candidateScore<65)continue;
  const currentQuality={allowed:true,penalty:0,reason:''};
  if(isRecoveryStrategy(bot)){
   const barrier=bot===strategy&&barrierStateRef.current?barrierStateRef.current:initialBarrierState(bot);
   const signal=makeBarrierSignal(aiAnalysisValues,barrier,tickPipSize,65,25);
   if(signal)actionable.push({...candidate,contract:signal.contract,label:signal.label,strength:signal.strength,entrySignalStrength:signal.strength,noTrade:false,qualityBlocked:false,qualityPenalty:0,qualityReason:''});
  }else{
   const signal=makeSignal(aiAnalysisValues,bot,tickPipSize,false,65,25);
   if(signal&&signal.contract===candidate.contract){
    actionable.push({...candidate,contract:signal.contract,strength:signal.strength,entrySignalStrength:signal.strength,noTrade:false,qualityBlocked:false,qualityPenalty:0,qualityReason:''});
   }
  }
 }
 if(!actionable.length){
  pendingAnalyzerStrategyRef.current=null;
  setSmartAdvice({...result,rankings,noTrade:true,qualityBlocked:false});
  setAnalyzerNoticeColor('#64748b');
  setAnalyzerNotice('A aguardar sinal');
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
 // Exit Spots alternation is exclusive to AI Analyst; normal robot uses live ticks.
 if(running&&!smartAnalyzer){
  if(exitSpotsMode)setExitSpotsMode(false);
  setExitSpotsMonitorStatus('Robô normal ativo: análise por ticks ao vivo; Exit Spots desativado.');
  return;
 }
 if((!running&&!smartAnalyzer)||!exitSpotsAutoEnabled){
  if(!exitSpotsAutoEnabled&&exitSpotsMode)setExitSpotsMode(false);
  return;
 }
 const exitSpotCount=analysisExitValues.length;
 if(exitSpotCount<28){
  // Não alterar a fonte de análise até terminar uma operação/compra pendente.
  const modeChangeBlocked=activeContractId!==null||trackedContractId!==null||proposal!==null||buying;
  if(exitSpotsMode&&modeChangeBlocked){
   setExitSpotsMonitorStatus('A aguardar fecho da operação antes de alterar o modo Exit Spots.');
   return;
  }
  setExitSpotsMonitorStatus('A recolher '+exitSpotCount+'/28 Exit Spots fechados; o robô continua no modo normal.');
  if(exitSpotsMode){
   setExitSpotsMode(false);
   if(smartAnalyzer)setSmartAdvice(null);
   setAnalyzerNoticeColor('#64748b');
   setAnalyzerNotice('São necessários 28 Exit Spots fechados. A regressar ao modo normal.');
   pendingAnalyzerStrategyRef.current=null;
  }
  return;
 }
 const activeSignal=isRecoveryStrategy(strategy)
  ?makeExitSpotBarrierSignal(analysisExitValues,barrierStateRef.current||initialBarrierState(strategy),tickPipSize)
  :makeExitSpotSignal(analysisExitValues,strategy,tickPipSize,true);
 if(exitSpotsMode){
  if(!activeSignal){
   if(activeContractId!==null||trackedContractId!==null||proposal!==null||buying){
    setExitSpotsMonitorStatus('Sinal Exit Spots temporariamente indisponível; a manter o modo até fechar a operação em curso.');
    return;
   }
   setExitSpotsMode(false);
   if(smartAnalyzer)setSmartAdvice(null);
   setAnalyzerNoticeColor('#64748b');
   setAnalyzerNotice('Exit Spots: o sinal deste bot já não cumpre 20% em pelo menos 3 dos 4 blocos. A regressar ao modo normal.');
   setExitSpotsMonitorStatus('Sinal Exit Spots indisponível para '+String(strategy)+'. Modo normal ativo; a monitorar até o sinal voltar.');
   pendingAnalyzerStrategyRef.current=null;
   return;
  }
  const blocks=Number(activeSignal.agreeingExitSpotBlocks)||0;
  setExitSpotsMonitorStatus('Exit Spots ativo para '+String(strategy)+': sinal válido em '+blocks+'/4 blocos; gatilho 20%.');
  if(smartAnalyzer)setSmartAdvice((previous:any)=>({...previous,strategy:previous?.strategy||strategy,contract:activeSignal.contract,label:activeSignal.label,strength:Number(activeSignal.strength)||0,noTrade:false,qualityBlocked:false,exitSpotMode:true,overallExitSpotStrength:Number(activeSignal.overallExitSpotStrength)||Number(activeSignal.strength)||0,recentExitSpotStrength:Number(activeSignal.recentExitSpotStrength)||Number(activeSignal.strength)||0,agreeingExitSpotBlocks:blocks}));
  return;
 }
 if(!activeSignal){
  setExitSpotsMonitorStatus('28 Exit Spots disponíveis; a aguardar um sinal de 20% em 3/4 blocos para o bot '+String(strategy)+'.');
  return;
 }
 // Never switch data sources in the middle of a contract or pending purchase.
 if(activeContractId!==null||trackedContractId!==null||proposal||buying){
  setExitSpotsMonitorStatus('Sinal Exit Spots disponível para '+String(strategy)+'; a aguardar o fecho da operação atual para migrar.');
  return;
 }
 setExitSpotsMode(true);
 setAnalyzerNoticeColor(ANALYZER_COLORS[String(strategy)]||'#3D7FFF');
 setAnalyzerNotice('28 EXIT SPOTS COMPLETOS — '+String(strategy)+' migrou automaticamente para Exit Spots Trading · gatilho 20%');
 setExitSpotsMonitorStatus('Exit Spots ativo para '+String(strategy)+': sinal válido em '+(Number(activeSignal.agreeingExitSpotBlocks)||0)+'/4 blocos; gatilho 20%.');
 if(smartAnalyzer)setSmartAdvice((previous:any)=>({...previous,strategy:previous?.strategy||strategy,contract:activeSignal.contract,label:activeSignal.label,strength:Number(activeSignal.strength)||0,noTrade:false,qualityBlocked:false,currentScore:Number(previous?.score)||Number(activeSignal.strength)||0,exitSpotMode:true,overallExitSpotStrength:Number(activeSignal.overallExitSpotStrength)||Number(activeSignal.strength)||0,recentExitSpotStrength:Number(activeSignal.recentExitSpotStrength)||Number(activeSignal.strength)||0,agreeingExitSpotBlocks:Number(activeSignal.agreeingExitSpotBlocks)||0}));
 const entry={time:new Date().toLocaleTimeString(),rankings:[{strategy,label:activeSignal.label,score:Math.round(Number(activeSignal.strength)||0)}],strategy,label:activeSignal.label,score:Math.round(Number(activeSignal.strength)||0),action:'MIGRA PARA EXIT SPOTS'};
 analyzerDecisionHistoryRef.current=[entry,...analyzerDecisionHistoryRef.current].slice(0,8);
 setAnalyzerHistory(analyzerDecisionHistoryRef.current);
},[running,smartAnalyzer,exitSpotsAutoEnabled,exitSpotsMode,analysisExitValues,tickPipSize,strategy,activeContractId,trackedContractId,proposal,buying]);

  useEffect(()=>{if(!running||stopped.current)return;const accountCurrency=normalizeCurrency(balance?.currency,currency);const targetInAccountCurrency=Number(target)*CURRENCY_RATES[accountCurrency];const lossLimitInAccountCurrency=Number(lossLimit)*CURRENCY_RATES[accountCurrency];if(pnl>=targetInAccountCurrency){stopped.current=true;requested.current=false;requestStartedAt.current=0;setRunning(false);setNotice(`🎯 ${t('goalReached')}: ${money(pnl,accountCurrency)}`);sound('target')}else if(strategy!=='MATCH0'&&pnl<=-lossLimitInAccountCurrency){stopped.current=true;requested.current=false;requestStartedAt.current=0;setRunning(false);setNotice(`🛑 ${t('lossGoal')}: ${money(pnl,accountCurrency)}`);sound('loss')}},[pnl,target,lossLimit,currency,balance?.currency,running,smartAnalyzer,strategy,t]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),5000);return()=>clearTimeout(timer)},[notice]);
 const togglePower=(enabled:boolean)=>{if(running)return;setIaPower(enabled);setSonic(false);sonicRef.current.reset();setSorosEnabled(false);setStakeManagerVersion(v=>v+1)};
 const toggleSonic=(enabled:boolean)=>{if(running)return;setSonic(enabled);setIaPower(false);sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});setSorosEnabled(false);setStakeManagerVersion(v=>v+1)};
 const start=()=>{pendingAutoEntryRef.current=null;iaRecoveryQuotePendingRef.current=false;setExitSpotsMode(false);hyperFlowNormalSignalDisarmedRef.current=false;if(strategy==='HYPERFLOWS'){hyperFlowsAnalysisActiveRef.current=false;hyperFlowsNextDigitRef.current=null;hyperFlowsRecoveryModeRef.current=false;hyperFlowsConsecutiveLossesRef.current=0;hyperFlowsDeficitRef.current=0;hyperFlowsLastTradeModeRef.current=null;hyperFlowsLastEntryTickRef.current=null;}if(strategy==='MATCH0'){hyperFlowOverZeroModeRef.current=false;hyperFlowRetryNormalAfterLossRef.current=false;hyperFlowRecoveryActiveRef.current=false;hyperFlowRecoveryBuyPendingRef.current=false;hyperFlowRecoveryQuoteStageRef.current=null;hyperFlowRecoveryQuoteAttemptsRef.current=0;hyperFlowRecoveryQuoteReadyRef.current=false;hyperFlowRecoveryQuoteTargetRef.current=null;hyperFlowTargetDigitRef.current=0;hyperFlowNextDigitRef.current=null;hyperFlowWatchRef.current={active:false,symbol,snapshots:[]};}recoveryBalancePauseRef.current=null;const availableBalance=Number(balance?.balance);if(!isConnected||!isAuthorized||!Number.isFinite(availableBalance)||availableBalance<=0)return false;setHypercoverRevision(v=>v+1);botArmedRef.current=true;setSorosEnabled(false);const cappedInitialStake=Math.min(Math.max(0.35,Number(stake)||0.35),availableBalance);gestorRef.current=criarGestorStake({stakeBase:cappedInitialStake,payout:lastPayoutRatioRef.current,maxNiveisMartingale:maxMartingale});const sonicBaseStake=Math.min(Math.max(0.35,Number(stake)||0.35),availableBalance);sonicRef.current=createSonicStakeManager({baseStake:sonicBaseStake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});processedStakeContractsRef.current.clear();processedSonicContractsRef.current.clear();pendingRiskStakeRef.current=null;for(const tx of profitTransactions){const id=Number(tx.contract_id);if(!Number.isFinite(id)||id<=0)continue;processedStakeContractsRef.current.add(id);processedSonicContractsRef.current.add(id);}lastProcessedStakeResult.current=latest?.contract_id??null;lastProcessedSonicResult.current=latest?.contract_id??null;stakeReadyRef.current=true;riskLockStartedAt.current=0;stopped.current=false;requested.current=false;requestStartedAt.current=0;lastRequestedClose.current=contractClosedSeq;lastActivityAt.current=Date.now();totalTickCountRef.current=0;lastAnalyzerEvalTickRef.current=0;analyzerStableKeyRef.current=null;analyzerStableCountRef.current=0;analyzerLastSwitchTickRef.current=-1000;setTicks([]);setSignalNow(null);setBotActivity('collectingTicks');setRunning(true);return true};
 const stop=()=>{saveStakeState();hyperFlowNormalSignalDisarmedRef.current=false;pendingAutoEntryRef.current=null;iaRecoveryQuotePendingRef.current=false;hyperFlowRecoveryQuoteStageRef.current=null;hyperFlowRecoveryQuoteAttemptsRef.current=0;hyperFlowRecoveryQuoteReadyRef.current=false;hyperFlowRecoveryQuoteTargetRef.current=null;clearProposal();botArmedRef.current=false;stopped.current=true;requested.current=false;requestStartedAt.current=0;riskAwaitingContractRef.current=null;stakeReadyRef.current=true;riskLockStartedAt.current=0;setRunning(false);setSignalNow(null)}; const refreshAiAnalystAccess=useCallback(async()=>{try{const response=await fetch('/api/ai-analyst/access',{cache:'no-store'});const data=await response.json().catch(()=>null);setAiAnalystActive(Boolean(data?.active));setAiAnalystExpiresAt(data?.expiresAt?String(data.expiresAt):null);return Boolean(data?.active)}catch{setAiAnalystActive(false);setAiAnalystExpiresAt(null);return false}},[]);
 useEffect(()=>{void refreshAiAnalystAccess()},[refreshAiAnalystAccess]);
 const toggleAnalyzer=useCallback((enabled:boolean)=>{if(enabled){if(!aiAnalystActive){if(!clientCountryReady){setNotice(language==='en'?'Identifying your country. Please try again in a moment.':'A identificar o país do cliente. Aguarde um momento e tente novamente.');return}setCashierAction('ai_analyst');setNotice(clientCountry==='MZ'?(language==='en'?'AI Analyst subscription: 250 MZN for 30 days.':'AI Analyst: assinatura de 250 MZN por 30 dias.'):(language==='en'?'AI Analyst subscription: 3 USDT for 30 days.':'AI Analyst: assinatura de 3 USDT por 30 dias.'));return}setSorosEnabled(false);setExitSpotsMode(false);if(running){setSmartAnalyzer(true);return}if(start()){setRunning(false);setSmartAnalyzer(true)}else{setNotice(!isConnected?'A ligar ao Deriv...':!isAuthorized?'Autenticação Deriv necessária':'Saldo indisponível para iniciar o Analyst.')}}else{setExitSpotsMode(false);setSmartAnalyzer(false);setSorosEnabled(false);if(!running)stop()}},[aiAnalystActive,clientCountryReady,language,running,isConnected,isAuthorized,start,stop,setSorosEnabled,iaPower,sonic]);
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
 const botProbabilityEstimates=useMemo(()=>estimateBotSuccessScores(ticks,tickPipSize),[ticks,tickPipSize]);
  const exitSpotsTradingActive=exitSpotsAutoEnabled&&exitSpotsMode&&analysisExitValues.length>=28;
  return <div className="mx-auto w-full max-w-[1400px] p-3 md:p-5" style={{color:light?'#0f172a':'#f8fafc'}}>{analyzerNotice&&<div className="fixed left-1/2 top-0 z-[300] w-[min(88vw,420px)] -translate-x-1/2 rounded-xl bg-white px-3 py-2 text-center text-[10px] font-black shadow-2xl md:top-1 md:px-4 md:py-2.5 md:text-[11px]" style={{color:analyzerNoticeColor,border:'2px solid '+analyzerNoticeColor,boxShadow:'0 8px 24px -10px '+analyzerNoticeColor}}>{analyzerNotice}</div>}<style>{`body{background:var(--bg,#07111f);color:var(--text,#f8fafc);transition:background .2s,color .2s}.av4{background:${light?'#f8fafc':'#071936'};border:1px solid #facc15;border-radius:18px;padding:clamp(12px,2vw,24px)}.av4 .card{background:${light?'#fff':'#0d2347'};border:1px solid ${light?'#d5deea':'#294b78'};border-radius:14px}.av4 .balance-card,.av4 .menu-trigger{background:transparent;border:0;border-radius:0}.av4 .profit-card{background:${light?'#fff':'#0d2347'};border:1px solid #facc15;border-radius:14px}.av4 .account-strategy{display:grid;grid-template-columns:1fr 1fr;background:${light?'#fff':'#0d2347'};border:1px solid #facc15;border-radius:14px;overflow:hidden}.av4 .account-strategy>label{border:0;border-radius:0}.av4 .account-strategy>label+label{border-left:1px solid #facc15}.av4 .muted{color:${light?'#64748b':'#94a3c1'}}.av4 select,.av4 input{color:${light?'#0f172a':'#f8fafc'}}.av4 .hist{display:flex;gap:4px;overflow-x:auto}.av4 .trade{min-width:88px;padding:4px;border-radius:9px;border:1px solid ${light?'#d5deea':'#334e78'}}.av4 .notice{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:200;min-width:min(92vw,360px);padding:13px 16px;border-radius:14px;background:#0f2345;color:#fff;border:1px solid #3b82f6;box-shadow:0 14px 35px rgba(0,0,0,.35);text-align:center;font-weight:800;font-size:13px}.av4 .modal-backdrop{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px}.av4 .modal{width:min(94vw,380px);background:${light?'#fff':'#0d2347'};border:1px solid ${light?'#d5deea':'#294b78'};border-radius:16px;padding:18px}.header-actions{display:flex;align-items:center;gap:12px;position:relative}.cashier-wrap{position:static}.cashier-menu{position:absolute;right:0;left:auto;top:42px;z-index:300;width:min(94vw,390px);box-sizing:border-box;padding:16px 10px 14px;border:1px solid #293241;background:#171c24;color:#fff;border-radius:0 0 18px 18px;box-shadow:0 18px 40px -16px rgba(0,0,0,.65);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.cashier-menu button{min-width:0;border:0;background:transparent;color:#fff;padding:0 2px;text-align:center;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:7px;white-space:nowrap;transition:background .15s}.cashier-menu button:hover{background:rgba(255,255,255,.06)}.cashier-menu .cashier-icon{width:56px;height:56px;border:2px solid #e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:300;line-height:1;box-sizing:border-box}.cashier-menu .cashier-icon.deposit{background:#ff4654;border-color:#ff4654}.cashier-menu .cashier-icon.transfer{font-size:28px}.cashier-menu .cashier-icon.withdraw{font-size:31px}@media(max-width:480px){.cashier-menu{right:0;width:min(94vw,370px);padding:15px 7px 13px}.cashier-menu .cashier-icon{width:54px;height:54px}.cashier-menu button{font-size:12.5px;gap:6px}}.icon-btn{width:auto;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer}.icon-btn:hover{background:transparent}.whatsapp-header{width:auto;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:#25D366;display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;line-height:0}.whatsapp-header:hover{background:transparent;color:#20bd5a}.whatsapp-header svg{width:20px;height:20px;display:block}.menu-trigger{width:auto;height:auto;padding:0;border:0;background:transparent;color:var(--text);font-size:22px;line-height:1;cursor:pointer}.menu-trigger:hover{background:transparent}.menu-popover{position:absolute;right:0;top:32px;z-index:80;width:160px;padding:6px;border:1px solid #294b78;background:#071936;border-radius:8px;box-shadow:0 18px 35px -12px #000}.menu-popover button{background:transparent;border:0;color:#fff}.ia-power{display:flex;align-items:center;justify-content:space-between;gap:12px}.ia-toggle{width:48px;height:28px;border:0;border-radius:999px;padding:3px;cursor:pointer;transition:.2s;background:#ff444f}.ia-toggle.on{background:#25D366}.ia-toggle span{display:block;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s;transform:translateX(0)}.ia-toggle.on span{transform:translateX(20px)}.ia-badge{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.closed-operations-label,.closed-operations-count{color:${light?'#64748b':'#94a3b8'}!important}.digits-title{font-size:11px;font-weight:900;text-transform:uppercase}.last-digit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:900}`}</style><div className="av4">
 <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><img src="/icon.svg?v=2" width="40" height="40" className="rounded-xl object-cover" alt="MozHyper" /><div><b className="text-lg">Moz<span className="text-blue-500">Hyper</span></b><div className="text-[9px] uppercase muted">Negocia mais rápido</div></div></div><div className="header-actions"><div className="cashier-wrap"><button type="button" className="icon-btn" onClick={()=>setCashierOpen(v=>!v)} aria-label="Payment Agent" title="Payment Agent"><WalletIcon size={20} color={light?'#53627a':'#fff'} /></button>{cashierOpen&&<div className="cashier-menu"><button type="button" onClick={()=>{setCashierOpen(false);if(paymentAgentCurrency&&isPaymentAgentCurrencyAllowed(paymentAgentCurrency)){setCashierAction('deposit')}else{window.location.assign('https://deriv.com/')}}}><span className="cashier-icon deposit">＋</span><span>{t('deposit')}</span></button><button type="button" onClick={()=>{setCashierOpen(false);if(paymentAgentCurrency&&isPaymentAgentCurrencyAllowed(paymentAgentCurrency)){setCashierAction('withdraw')}else{window.location.assign('https://deriv.com/')}}}><span className="cashier-icon withdraw">−</span><span>{t('withdraw')}</span></button></div>}<PaymentAgentCashier eligibleClient={clientCountry==='MZ'} open={cashierAction!==null && (cashierAction==='ai_analyst' || cashierAction==='course' || Boolean(paymentAgentCurrency&&isPaymentAgentCurrencyAllowed(paymentAgentCurrency)))} action={cashierAction} currency={currency} agentCurrency={paymentAgentCurrency} light={light} onClose={()=>{setCashierAction(null);void refreshAiAnalystAccess()}} onNotice={setNotice}/></div><a className="whatsapp-header" href="https://whatsapp.com/channel/0029Vb7xMatF1YlUQlYhH81t" target="_blank" rel="noopener" aria-label="Canal de suporte no WhatsApp" title="Canal de suporte no WhatsApp"><WhatsAppIcon size={20} color="#25d366" /></a><button className="icon-btn" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="Alternar tema" title="Alternar tema claro/escuro">{theme==='dark'?'☀️':'🌙'}</button><button className="menu-trigger" onClick={()=>setMenu(!menu)} aria-label="Abrir menu">⋯</button>{menu&&<div className="menu-popover">{userName&&<div className="px-2 pb-2 pt-1 text-[11px] font-bold leading-5" style={{color:'#25D366'}}><div>{greeting}, {userName}</div><div className="mt-2 flex items-center gap-1 text-[10px] font-bold" style={{color:'#25D366'}}><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>{203+onlineUsers} online</div></div>}<div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase text-slate-400">Moeda</div><select className="w-full rounded-lg bg-slate-800 p-2 text-xs font-bold text-white" value={currency} onChange={e=>setCurrency(e.target.value as Currency)}>{currencyOptions.map(c=><option key={c} value={c}>{CURRENCY_LABELS[c]||getCurrencyMeta(c).symbol}</option>)}</select><div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase text-slate-400">{t('language')}</div><select aria-label={t('language')} className="w-full rounded-lg bg-slate-800 p-2 text-xs font-bold text-white" value={language==='en'?'en':'pt'} onChange={e=>setLanguage(e.target.value as 'en'|'pt')}><option value="pt">Português</option><option value="en">English</option></select><button className="mt-1 w-full p-2 text-left text-xs" onClick={()=>{setMetas(true);setMenu(false)}}>{t('meta')}</button><button className="w-full p-2 text-left text-xs" onClick={()=>{setMenu(false);setCourseSection('course');setMozHyperCourse(true);void fetch('/api/course/access',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>setCourseUnlocked(Boolean(data?.active))).catch(()=>undefined)}}>📚 {t('completeCourse')}</button><button className="w-full p-2 text-left text-xs" onClick={()=>{setTheme(theme==='dark'?'light':'dark');setMenu(false)}}>{t('theme')}</button><button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-left" onClick={()=>{setMenu(false);setSignalsModalOpen(true)}}><span style={{display:'inline-flex',width:28,height:28,borderRadius:6,overflow:'hidden',flexShrink:0}}><SignalsLogo size={28}/></span><span className="text-xs font-semibold" style={{color:'#fff'}}>{language==='en'?'Signals — Free Forex':'Signals — Forex grátis'}</span></button><button type="button" className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-xs font-semibold" onClick={()=>{setMenu(false);window.open('https://www.forexfactory.com/calendar','_blank','noopener,noreferrer')}}><span style={{display:'inline-flex',width:28,height:28,alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>📅</span><span>{language==='en'?'Forex Calendar — News':'Calendário Forex — Notícias'}</span></button><button className="w-full p-2 text-left text-xs font-semibold" onClick={()=>{setSupportOpen(true);setMenu(false)}}>{language==='en'?'MozHyper Support':'Suporte MozHyper'}</button><button className="w-full p-2 text-left text-xs text-red-400" onClick={logout}>{t('logout')}</button></div>}</div></div>
 {signalsModalOpen&&<SignalsFree light={light} open={signalsModalOpen} onClose={()=>setSignalsModalOpen(false)}/>}{supportOpen&&<div className="modal-backdrop" onClick={()=>setSupportOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>{t('supportTitle')}</b><button type="button" onClick={()=>setSupportOpen(false)}>✕</button></div><div className="mt-2 text-[10px] muted">{t('supportChoose')}</div><div className="mt-4 grid gap-3"><a href="https://wa.me/258879084091" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-500 p-3 text-center text-sm font-bold text-white no-underline">WhatsApp</a><a href="https://t.me/Matosfx1" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-blue-500 p-3 text-center text-sm font-bold text-white no-underline">Telegram</a></div></div></div>}<div className="mt-3 grid grid-cols-2 gap-3"><div className="balance-card p-4"><div className="text-[10px] uppercase muted">{t('balance')}</div><b className="text-lg" style={{color:light?'#0f172a':'#fff'}}>{balance&&Number.isFinite(Number(balance.balance))?`${(Number(balance.balance)*CURRENCY_RATES[currency]).toFixed(2)} ${CURRENCY_LABELS[currency]}`:'—'}</b></div><div className="profit-card p-4"><div className="text-[10px] uppercase muted">{t('profitLoss')}</div><b className={`text-lg ${pnl>=0?'text-emerald-500':'text-red-500'}`}>{money(pnl,currency)}</b><div className="mt-1 text-[10px] font-bold muted"><span className="closed-operations-label">{t('closedOperations')}:</span> <span className="closed-operations-count">{closedOperations}</span></div></div></div>
 <div className="account-strategy mt-3"><label className="p-3 text-xs">{t('account')}<select className="mt-1 w-full bg-transparent font-bold" value={account} onChange={e=>setAccount(e.target.value as 'demo'|'real')} disabled={running||smartAnalyzer}><option value="demo">{t('demo')}</option><option value="real">{t('real')}</option></select></label><div className="p-3 text-xs"><div>{t('strategy')}</div><button type="button" className="mt-1 flex w-full items-center gap-2 rounded-xl border border-slate-300/30 bg-slate-900/5 p-2 text-left disabled:opacity-50" onClick={()=>setBotPickerOpen(true)} disabled={running||smartAnalyzer} aria-label="Escolher bot"><span className="min-w-0 flex-1"><b className="block text-sm">{(BOT_PICKER_OPTIONS.find(x=>x.id===strategy)||BOT_PICKER_OPTIONS[0]).name}</b></span><span className="text-lg text-slate-400">⌄</span></button></div></div>
 {botPickerOpen&&<div className="fixed inset-0 z-[260] flex items-end justify-center bg-[#020617]/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={()=>setBotPickerOpen(false)}><div className="w-full max-w-xl overflow-hidden rounded-t-[30px] border border-[#283757] bg-[#111a30] text-white shadow-2xl sm:rounded-[30px]" style={{maxHeight:'88vh'}} onClick={e=>e.stopPropagation()}><div className="flex justify-center pt-3 sm:hidden"><div className="h-1.5 w-14 rounded-full bg-slate-600"/></div><div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4 sm:px-6 sm:pt-6"><div><h2 className="text-xl font-black tracking-tight sm:text-2xl">Escolhe o teu bot</h2></div><button type="button" className="shrink-0 rounded-full bg-[#1d2945] px-4 py-2 text-xs font-bold text-slate-300 hover:bg-[#273858]" onClick={()=>setBotPickerOpen(false)}>Fechar</button></div><div className="overflow-y-auto px-3 pb-5 sm:px-5" style={{maxHeight:'calc(88vh - 100px)'}}>{BOT_PICKER_OPTIONS.map(bot=>{const probability=botProbabilityEstimates[bot.id];return <button key={bot.id} type="button" aria-pressed={bot.id===strategy} className="mb-2 flex w-full items-center gap-3 rounded-2xl border p-2 text-left transition" style={{background:bot.id===strategy?'#1c2a4b':'#17223c',borderColor:bot.id===strategy?'#4f8bff':'#263453',boxShadow:bot.id===strategy?'0 0 0 2px rgba(79,139,255,.10)':'none'}} onClick={()=>{if(running||smartAnalyzer)return;botArmedRef.current=false;stopped.current=true;requested.current=false;requestStartedAt.current=0;setSignalNow(null);setStrategy(bot.id);if(bot.id==='HYPERFLOWS')setSymbol('R_25');setBotPickerOpen(false)}}><span className="min-w-0 flex-1"><b className="block text-sm font-black">{bot.name}</b></span><span className="flex w-[62px] shrink-0 flex-col items-end gap-1"><b className="text-sm font-black">{probability==null?'—':`${probability}%`}</b><span className="h-1.5 w-full overflow-hidden rounded-full bg-[#2c395b]"><span className="block h-full rounded-full" style={{width:(probability??0)+'%',background:bot.color}}/></span></span>{bot.id===strategy&&<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-xs font-black text-white">✓</span>}</button>})}</div></div></div>}
 <div className="card mt-3 p-3"><div className="flex items-center justify-between gap-2"><div className="shrink-0"><div className="digits-title">{t('digitLabel')}: <span className="last-digit" style={{color:'#ff444f'}}>{displayedExitDigit??'—'}</span></div></div><div className="min-w-0 flex-1 px-2 text-center"><span className="text-[9px] font-black uppercase tracking-[0.08em]" style={{color:!running?'#64748b':contractStage==='fechado'?'var(--win)':(botActivity==='reconnectingDeriv'||botActivity==='reconcilingBot'?'#ff444f':'#64748b')}}>{!running?t('stopped'):contractStage==='aberto'?t('contractOpen'):contractStage==='fechado'?t('contractClosedStage'):t(botActivity)}</span></div><div className="flex shrink-0 items-center gap-1"><button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold" onClick={()=>setDigitView(v=>v==='bars'?'chart':'bars')} title={digitView==='bars'?'Ver Exit Spots':'Ver barras de dígitos'} aria-label={digitView==='bars'?'Ver Exit Spots':'Ver barras de dígitos'}>{digitView==='bars'?'⌁':'▥'}</button><select className="rounded-lg bg-transparent px-2 py-1 text-xs font-bold" value={tickWindow} onChange={e=>setTickWindow(Number(e.target.value))} disabled={running}>{[5,9,10,25,50,100,200].map(n=><option key={n} value={n}>{n} ticks</option>)}</select></div></div>{digitView==='bars'?<><div className="digits-bars mt-1 grid h-[160px] md:h-[176px] grid-cols-10 items-end gap-1">{(()=>{const values=ticks.slice(-tickWindow),probs=stats(values,tickPipSize).probs,hasData=values.length>0&&probs.some(p=>p>0),shown=hasData?probs:Array.from({length:10},()=>0),maxP=Math.max(...shown,1),minPositive=Math.min(...shown.filter(p=>p>0).concat([101]));return shown.map((p,i)=>{const isMax=p===maxP&&p>0,isMin=p>0&&p===minPositive,barColor=isMax?'bg-emerald-500':isMin?'bg-red-500':'bg-slate-300',percentColor=isMax?'text-emerald-600':isMin?'text-red-500':'muted',barHeight=p>0?Math.max(5,Math.round((p/100)*100)):2;return <div key={i} className="relative flex h-full flex-col items-center text-center"><div className={`absolute inset-x-0 top-0 text-[8px] font-bold ${percentColor}`}>{p>0?Math.max(1,Math.round(p)):0}%</div><div className="absolute inset-x-0 bottom-[16px] flex items-end justify-center"><div className={`mx-auto rounded-sm ${barColor}`} style={{height:`${barHeight}px`,width:'8px'}}/></div><div className="absolute inset-x-0 bottom-0 flex h-[14px] items-center justify-center text-[8px] muted">{i}</div></div>})})()}</div></>:<div className="mt-3 -mx-3 rounded-xl border p-3" style={{background:light?'#f8fafc':'#020617',borderColor:light?'#cbd5e1':'#334155'}} aria-label="Gráfico de Exit Spots">
 <div className="digits-bars mt-1 grid h-[160px] md:h-[176px] grid-cols-10 items-end gap-1">
  {(()=>{const values=analysisExitValues.slice(-28),rawProbs=stats(values,tickPipSize).probs,hasData=values.length>0&&rawProbs.some(p=>p>0),maxRaw=Math.max(...rawProbs,0),probs=hasData&&maxRaw>0?rawProbs.map(p=>p/maxRaw*100):Array.from({length:10},()=>0),maxP=Math.max(...probs,1),minPositive=Math.min(...probs.filter(p=>p>0).concat([101]));return probs.map((p,i)=>{const isMax=p===maxP&&p>0,isMin=p>0&&p===minPositive,barColor=isMax?'bg-emerald-500':isMin?'bg-red-500':'bg-slate-300',percentColor=isMax?'text-emerald-600':isMin?'text-red-500':'muted',barHeight=p>0?Math.max(5,Math.round((p/100)*100)):2,isExitDigit=chartExitDigit===i&&analysisExitValues.length>0;return <div key={i} title={isExitDigit?'Dígito final real do contrato (exit_spot): '+chartExitDigit:undefined} className="relative flex h-full flex-col items-center text-center"><div className={`absolute inset-x-0 top-0 text-[8px] font-bold ${percentColor}`}>{p>0?Math.max(1,Math.round(p)):0}%</div><div className="absolute inset-x-0 bottom-[16px] flex items-end justify-center"><div className={`mx-auto rounded-sm ${barColor}`} style={{height:`${barHeight}px`,width:'8px'}}/></div><div className={`absolute inset-x-0 bottom-0 flex h-[14px] items-center justify-center text-[8px] ${isExitDigit?'font-black text-blue-600':'muted'}`}>{i}{isExitDigit?' E':''}</div></div>})})()}
 </div>

</div>}</div>

 <div ref={historyRef} className="card relative mt-1 p-1.5" style={{borderColor:'#facc15'}}><div className="flex items-center justify-between gap-2"><b className="text-[10px] uppercase muted">{t('recentHistory')}</b><div className="flex items-center gap-2"><span className={`mr-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${exitSpotsTradingActive?'bg-red-500':(smartAnalyzer||running)?(exitSpotsMode?'bg-blue-500':smartAnalyzer?'bg-emerald-500':'bg-slate-400'):'bg-slate-400'}`} title={exitSpotsTradingActive?'Exit Spots Trading ativo · 28 resultados fechados':exitSpotsMode?'Modo Exit Spots ativo':smartAnalyzer?(exitSpotsAutoEnabled?'AI Analyst normal · a monitorar Exit Spots':'AI Analyst normal'):running?'Robô normal · análise ao vivo por ticks; Exit Spots desativado':'Robô/AI Analyst desligado'} aria-label={exitSpotsTradingActive?'Exit Spots Trading ativo com 28 resultados fechados':exitSpotsMode?'Modo Exit Spots ativo':smartAnalyzer?(exitSpotsAutoEnabled?'AI Analyst normal a monitorar Exit Spots':'AI Analyst normal'):running?'Robô normal a monitorar Exit Spots':'Robô e AI Analyst desligados'}/>{exitSpotsAutoEnabled&&smartAnalyzer&&<span className="max-w-[84px] truncate text-[8px] font-bold muted" title={exitSpotsMonitorStatus}>{exitSpotsTradingActive?'EXIT SPOTS':analysisExitValues.length<28?('EXIT '+analysisExitValues.length+'/28'):(language==='en'?'EXIT SIGNAL?':'EXIT A ANALISAR')}</span>}<button type="button" onClick={()=>setSoundEnabled(v=>{const next=!v;try{localStorage.setItem('mozhyper-sound-enabled',String(next))}catch{};return next})} className="flex h-5 w-5 items-center justify-center rounded-lg border border-slate-300/50 text-slate-500" title={soundEnabled?'Desligar som':'Ligar som'} aria-label={soundEnabled?'Desligar som':'Ligar som'}>{soundEnabled?'🔊':'🔇'}</button><button type="button" onClick={clearHistoryAndStartNewCycle} disabled={running} className="flex h-6 w-6 items-center justify-center rounded-lg border border-red-500/70 text-red-500 disabled:cursor-not-allowed disabled:opacity-40" title="Limpar histórico e começar novo ciclo" aria-label="Limpar histórico e começar novo ciclo"><TrashIcon size={14} /></button><button type="button" onClick={()=>setHistoryOpen(v=>!v)} className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-300/50 text-slate-500" aria-label={t('dailyHistory')} title={t('dailyHistory')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" className={historyOpen?'rotate-180':''}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div></div>{historyOpen&&<div className="absolute right-3 top-14 z-[120] w-[min(92vw,360px)] max-h-[78vh] overflow-y-auto rounded-2xl border border-slate-300/40 bg-white p-4 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white"><div className="flex items-center justify-between gap-3"><b className="text-xs uppercase tracking-wide">{t('dailyHistory')}</b><button type="button" onClick={()=>setHistoryOpen(false)} className="text-base muted" aria-label={t('close')}>✕</button></div><div className="mt-3"><label className="block text-[10px] font-bold uppercase muted">{t('selectDate')}</label><div className="mt-2 flex items-center gap-2"><input type="date" value={historyDate} onChange={e=>setHistoryDate(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300/60 bg-transparent px-3 py-2 text-xs font-bold" /><button type="button" onClick={()=>setHistoryDate(localDateValue())} className="shrink-0 rounded-xl border border-blue-500/40 px-3 py-2 text-[10px] font-black text-blue-500">{t('today')}</button></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-slate-300/40 p-3"><div className="text-[9px] font-bold uppercase muted">{t('totalProfitLoss')}</div><div className={dailyPnl>=0?'mt-1 text-base font-black text-emerald-500':'mt-1 text-base font-black text-red-500'}>{money(dailyPnl,currency)}</div></div><div className="rounded-xl border border-slate-300/40 p-3"><div className="text-[9px] font-bold uppercase muted">{t('closedOperations')}</div><div className="mt-1 text-base font-black">{dailyTransactions.length}</div><div className="mt-1 text-[9px] font-bold"><span className="text-emerald-500">{t('win')} {dailyWins}</span><span className="mx-1 muted">/</span><span className="text-red-500">{t('loss')} {dailyLosses}</span></div></div></div><div className="mt-4"><div className="mb-2 text-[10px] font-bold uppercase muted">{t('resultsByBot')}</div>{dailyByBot.length?dailyByBot.map(([bot,g])=><div key={bot} className="mb-2 rounded-xl border border-slate-300/40 p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs">{bot}</b><b className={g.pnl>=0?'text-xs text-emerald-500':'text-xs text-red-500'}>{money(g.pnl,currency)}</b></div><div className="mt-1 text-[9px] muted">{g.count} · <span className="text-emerald-500">{t('win')} {g.wins}</span> · <span className="text-red-500">{t('loss')} {g.losses}</span></div></div>):<div className="rounded-xl border border-dashed border-slate-300/40 p-3 text-[10px] muted">{t('noTransactions')}</div>}</div><button type="button" onClick={()=>setHistoryOpen(false)} className="mt-3 w-full rounded-xl border border-slate-300/40 p-2.5 text-[10px] font-bold">{t('close')}</button></div>}<div className="hist mt-1">{profitTransactions.slice(0,12).map(x=>{const p=Number(x.profit_loss||0);return <div className="trade" key={x.contract_id}><div className={`mx-auto mb-0.5 h-4 w-2 rounded-sm ${p>=0?'bg-blue-500':'bg-red-500'}`}></div><b className={p>=0?'text-emerald-500':'text-red-500'}>{p>=0?t('win'):t('loss')}</b><div className="mt-0.5 max-w-full truncate text-[8px] font-semibold leading-tight muted">{(()=>{const botNames:Record<string,string>={ACIMA5_BAIXO4:'HyperStrike',PAR_IMPAR:'HyperDrive',RISE_FALL:'HyperForce',DIFERENTE:'HyperNova',HYPERLITE:'Hyperlite',HYPERGUARD:'HyperGuard',HYPERSHIELD:'HyperShield',HYPERBREAK:'HyperBreak',HYPERSWAP:'HyperSwap',HYPERCOVER:'Hypercover',Hypercover:'Hypercover'};const rawStoredBot=String(x.bot||'').trim();const storedType=String(x.contract_type||'').toUpperCase();const storedBarrier=Number(x.barrier);const unknownBot=!rawStoredBot||/^(estrat[eé]gia|strategy|unknown|bot não identificado)$/i.test(rawStoredBot);if(unknownBot&&x.barrier!=null&&Number.isFinite(storedBarrier)&&storedBarrier===0&&(storedType==='DIGITOVER'||storedType==='DIGITMATCH'))return 'HyperFlow B0';const storedBot=unknownBot?'':rawStoredBot;const displayBot=storedBot||'Bot não identificado';const shownBot=displayBot==='HyperDrive'&&(storedType==='DIGITOVER'||storedType==='DIGITUNDER')?'Histórico legado · bot a confirmar':(botNames[displayBot]||displayBot);if((displayBot.toLowerCase()==='hyperflow'||displayBot.toLowerCase()==='hyperflows')&&x.barrier!=null&&Number.isInteger(storedBarrier)&&((storedType==='DIGITMATCH'&&storedBarrier>=1&&storedBarrier<=9)||(storedType==='DIGITOVER'&&(storedBarrier===0||storedBarrier===1))||(storedType==='DIGITUNDER'&&storedBarrier===9)))return 'HyperFlow B'+storedBarrier;return shownBot})()}</div>{(()=>{const rawType=String(x.contract_type||'').toUpperCase(),isManual=String(x.bot||'').startsWith('Manual');const isOver=rawType==='DIGITOVER',isUnder=rawType==='DIGITUNDER';if(!isManual||(!isOver&&!isUnder))return null;const barrier=Number(x.barrier),hasBarrier=x.barrier!=null&&Number.isFinite(barrier),direction=isOver?(language==='en'?'Above':language==='es'?'Por encima de':'Acima de'):(language==='en'?'Below':language==='es'?'Por debajo de':'Abaixo de'),shownBarrier=hasBarrier?barrier:'—',finalPrice=x.exit_spot??x.exit_tick,historyPipSize=x.symbol?(pipSizeBySymbolRef.current.get(String(x.symbol))??(x.symbol===symbol?tickPipSize:undefined)):undefined,finalDigit=finalPrice!=null&&Number.isFinite(Number(historyPipSize))&&Number(historyPipSize)>0?digit(finalPrice,historyPipSize):null;return <div className="mt-0.5 max-w-full whitespace-normal break-words text-[8px] font-bold leading-[1.15] text-red-500">{direction} {shownBarrier} · {language==='en'?'last digit':language==='es'?'último dígito':'último dígito'}: {finalDigit??'—'}</div>})()}<div className="font-mono text-[11px] leading-tight">{money(p,currency)}</div></div>})}{!profitTransactions.length&&<div className="p-3 text-xs muted">{t('noTransactions')}</div>}</div></div>
 <button className={`mt-3 w-full rounded-xl p-4 font-bold text-white ${running?'bg-red-600':'bg-blue-600'}`} disabled={!isConnected||!isAuthorized} onClick={running?stop:start}>{running?`■ ${t('stop')}`:`▶ ${t('start')}`}</button>
 <div className="card mt-3 p-4" style={{borderColor:'#facc15'}}><div className="text-[10px] uppercase muted">{t('riskManagement')}</div><div className="mt-3 flex items-center justify-between"><button className={`h-9 w-9 rounded-lg ${light?"bg-slate-300 text-slate-700":"bg-slate-950 text-white"}`} disabled={running||smartAnalyzer} onClick={()=>setStake(x=>Math.max(IA_MIN_STAKE,Number((x-.1).toFixed(2))))}>−</button><b className="font-mono text-xl">${stake.toFixed(2)}</b><button className={`h-9 w-9 rounded-lg ${light?"bg-slate-300 text-slate-700":"bg-slate-950 text-white"}`} disabled={running||smartAnalyzer} onClick={()=>setStake(x=>Number((x+.1).toFixed(2)))}>+</button></div></div>
 <div className="mt-2">
  <button type="button" className="w-full rounded-xl border p-2 text-left text-xs font-black" style={{borderColor:'#3b82f6',background:light?'#eff6ff':'#0d2347',color:light?'#1d4ed8':'#bfdbfe'}} onClick={()=>setManualPanelOpen(v=>!v)} aria-expanded={manualPanelOpen}>
   <span className="flex items-center justify-between gap-2"><span>Manual</span><span>{manualPanelOpen?'−':'＋'}</span></span>
  </button>
  {manualPanelOpen&&<div className="card mt-1 p-1.5" style={{borderColor:'#3b82f6'}}>
   <div className="mb-1 flex items-center justify-between gap-2"><b className="text-[10px] uppercase">{language==='en'?'Manual trading':language==='es'?'Operación manual':'Operação manual'}</b><span className="text-[9px] muted">{SYMBOLS[symbol]}</span></div>
   <div className="grid grid-cols-2 gap-1.5">
    <div className="min-w-0 flex flex-col rounded-lg border p-2" style={{borderColor:light?'#86efac':'#166534'}}>
     <div className="text-[10px] font-black text-emerald-600">{language==='en'?'ABOVE':language==='es'?'POR ENCIMA':'ACIMA DE'}</div>
     <label className="mt-1 block text-[9px] muted">{language==='en'?'Number (0–8)':language==='es'?'Número (0–8)':'Número (0–8)'}
      <input type="number" inputMode="numeric" min="0" max="8" step="1" value={manualAboveBarrier} onChange={e=>setManualAboveBarrier(e.target.value)} onBlur={()=>setManualAboveBarrier(String(Math.min(8,Math.max(0,Math.floor(Number(manualAboveBarrier)||0)))))} disabled={running||smartAnalyzer||buying||activeContractId!==null} className="mt-1 w-full rounded-lg border border-slate-300/60 bg-transparent px-2 py-1 text-base font-black"/>
     </label>
     <div className="mt-1 text-[9px] muted">{language==='en'?'Block frequency':language==='es'?'Frecuencia del bloque':'Frequência no bloco'}: <b>{tickDataReady?Math.round(selectedTickDigits.filter(d=>d>Number(manualAboveBarrier||0)).length/Math.max(1,selectedTickDigits.length)*100)+'%':'—'}</b></div>
     <button type="button" className="mt-auto min-h-10 w-full rounded-lg bg-emerald-600 px-1 py-2 text-[10px] font-black text-white disabled:opacity-50" disabled={!isConnected||!isAuthorized||running||smartAnalyzer||buying||activeContractId!==null} onClick={()=>submitManualTrade('DIGITOVER',Math.min(8,Math.max(0,Math.floor(Number(manualAboveBarrier)||0))))}>{language==='en'?'BET ABOVE':language==='es'?'APOSTAR ARRIBA':'APOSTAR ACIMA'} {manualAboveBarrier}</button>
    </div>
    <div className="min-w-0 flex flex-col rounded-lg border p-2" style={{borderColor:light?'#fca5a5':'#991b1b'}}>
     <div className="text-[10px] font-black text-red-500">{language==='en'?'BELOW':language==='es'?'POR DEBAJO':'ABAIXO DE'}</div>
     <label className="mt-1 block text-[9px] muted">{language==='en'?'Number (1–9)':language==='es'?'Número (1–9)':'Número (1–9)'}
      <input type="number" inputMode="numeric" min="1" max="9" step="1" value={manualBelowBarrier} onChange={e=>setManualBelowBarrier(e.target.value)} onBlur={()=>setManualBelowBarrier(String(Math.min(9,Math.max(1,Math.floor(Number(manualBelowBarrier)||1)))))} disabled={running||smartAnalyzer||buying||activeContractId!==null} className="mt-1 w-full rounded-lg border border-slate-300/60 bg-transparent px-2 py-1.5 text-base font-black"/>
     </label>
     <div className="mt-1 text-[9px] muted">{language==='en'?'Block frequency':language==='es'?'Frecuencia del bloque':'Frequência no bloco'}: <b>{tickDataReady?Math.round(selectedTickDigits.filter(d=>d<Number(manualBelowBarrier||1)).length/Math.max(1,selectedTickDigits.length)*100)+'%':'—'}</b></div>
     <button type="button" className="mt-auto min-h-10 w-full rounded-lg bg-red-600 px-1 py-2 text-[10px] font-black text-white disabled:opacity-50" disabled={!isConnected||!isAuthorized||running||smartAnalyzer||buying||activeContractId!==null} onClick={()=>submitManualTrade('DIGITUNDER',Math.min(9,Math.max(1,Math.floor(Number(manualBelowBarrier)||1))))}>{language==='en'?'BET BELOW':language==='es'?'APOSTAR ABAJO':'APOSTAR ABAIXO'} {manualBelowBarrier}</button>
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
 {mozHyperCourse&&<div className="modal-backdrop" onClick={()=>setMozHyperCourse(false)}><div className="modal" style={{width:'min(94vw,560px)',maxHeight:'88vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>📚 {t('completeCourse')}</b><button onClick={()=>setMozHyperCourse(false)}>✕</button></div>{courseSection==='home'?<div className="mt-5 grid gap-3 sm:grid-cols-2"><button className="rounded-xl border border-blue-400/50 p-5 text-left" onClick={()=>setCourseSection('risk')}><div className="text-2xl">📊</div><b>{t('riskSheet')}</b><div className="mt-1 text-[10px] muted">{t('riskSheetDesc')}</div></button><button className="rounded-xl border border-emerald-400/50 p-5 text-left" onClick={()=>setCourseSection('course')}><div className="text-2xl">🎓</div><b>{t('course')}</b><div className="mt-1 text-[10px] muted">{t('courseDesc')}</div></button></div>:courseSection==='risk'?<div className="mt-4"><button className="text-xs font-bold text-blue-500" onClick={()=>setCourseSection('home')}>← {t('back')}</button><h3 className="mt-3 font-black">{t('riskSheetTitle')}</h3><div className="mt-3 grid gap-3"><label className="text-xs">{t('riskBalance')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="0" value={riskBalance} onChange={e=>setRiskBalance(Math.max(0,Number(e.target.value)))}/></label><label className="text-xs">{t('riskPerTrade')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="0" max="100" step="0.1" value={riskPercent} onChange={e=>setRiskPercent(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><label className="text-xs">{t('numberTrades')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="1" value={riskTrades} onChange={e=>setRiskTrades(Math.max(1,Math.floor(Number(e.target.value)||1)))}/></label></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-300/30 p-3"><div className="text-[9px] muted">{t('riskPerOperation')}</div><b>{(riskBalance*riskPercent/100).toFixed(2)}</b></div><div className="rounded-xl border border-slate-300/30 p-3"><div className="text-[9px] muted">{t('estimatedExposure')}</div><b>{(riskBalance*riskPercent/100*riskTrades).toFixed(2)}</b></div></div><div className="mt-3 rounded-xl border border-red-400/50 p-3 text-[10px] text-red-500">{t('riskWarning')}</div></div>:<div className="mt-4"><button className="text-xs font-bold text-blue-500" onClick={()=>setCourseSection('home')}>← {t('back')}</button><h3 className="mt-3 font-black">🎓 {t('courseMozHyper')}</h3>{!courseUnlocked?<div className="mt-4 rounded-xl border border-blue-400/50 p-4"><b className="text-sm">🔐 {t('accessCourse')}</b><div className="mt-1 text-[10px] muted">{t('accessDesc')}</div><input className="mt-3 w-full rounded-lg border border-slate-300/40 bg-transparent p-3 font-mono text-sm" placeholder="MozHyper-XXXXXXXX" value={courseCode} onChange={e=>setCourseCode(e.target.value)} autoComplete="off"/><button className="mt-2 w-full rounded-lg bg-blue-600 p-3 text-xs font-bold text-white disabled:opacity-50" disabled={courseUnlocking||!courseCode.trim()} onClick={async()=>{setCourseUnlocking(true);try{const r=await fetch('/api/course/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:courseCode})});const data=await r.json().catch(()=>null);if(data?.courseUnlocked){setCourseUnlocked(true);setNotice(t('unlockedNotice'))}else{setNotice(data?.error||t('invalidPassword'))}}catch{setNotice(t('validationError'))}finally{setCourseUnlocking(false)}}}>{courseUnlocking?t('validating'):t('validate')}</button><button className="mt-2 w-full rounded-lg border border-slate-300/30 p-3 text-xs font-bold" disabled={!clientCountryReady} onClick={()=>{if(!clientCountryReady){setNotice(language==='en'?'Identifying your country. Please wait a moment.':'A identificar o país. Aguarde um momento.');return;}setMozHyperCourse(false);setCashierAction('course')}}>{`${t('buyCourse')} — ${!clientCountryReady?(language==='en'?'Checking…':'A identificar…'):clientCountry === 'MZ' ? '999 MZN' : '15 USDT'}`}</button></div>:<><div className="mt-3 rounded-xl border border-emerald-400/50 p-4"><b className="text-sm text-emerald-500">✅ {t('unlocked')}</b><div className="mt-1 text-[10px] muted">{t('sessionAccess')}</div></div><div className="mt-3 grid gap-2">{[t('module1'),t('module2'),t('module3'),t('module4'),t('module5'),t('module6'),t('module7')].map(m=><div key={m} className="rounded-xl border border-slate-300/30 p-3"><b className="text-xs">{m}</b><div className="mt-1 text-[9px] muted">{t('courseContent')}</div></div>)}</div></>}</div>}</div></div>}{metas&&<div className="modal-backdrop" onClick={()=>setMetas(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>{t('meta')}</b><button onClick={()=>setMetas(false)}>✕</button></div><label className="mt-4 block text-xs">{t('profit')} (US$)<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" step="0.01" min="0" value={target} onChange={e=>setTarget(Math.max(0,Number(e.target.value)))}/></label><label className="mt-3 block text-xs">{t('lossGoal')} (US$)<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" step="0.01" min="0" value={lossLimit} onChange={e=>setLossLimit(Math.max(0,Number(e.target.value)))}/></label><label className="mt-3 block text-xs">{t('maxMartingale')}<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="1" max="20" step="1" value={maxMartingale} onChange={e=>setMaxMartingale(Math.min(20,Math.max(1,Math.floor(Number(e.target.value)||1))))}/><div className="mt-1 text-[9px] muted">{t('maxMartingaleHelp')}</div></label><button className="mt-4 w-full rounded-lg bg-blue-600 p-3 font-bold text-white" onClick={()=>setMetas(false)}>{t('save')}</button></div></div>}
 </div></div>
}