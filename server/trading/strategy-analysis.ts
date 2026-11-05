import 'server-only';
import { isRecoveryStrategy, type BarrierState } from '../../lib/hyperRecoveryStrategies';

export type Contract = 'EVEN'|'ODD'|'OVER'|'UNDER'|'RISE'|'FALL'|'DIFFER'|'MATCH0'|'MATCH9';
export type Strategy = 'PAR_IMPAR'|'ACIMA5_BAIXO4'|'RISE_FALL'|'DIFERENTE'|'MATCH0'|'HYPERLITE'|'HYPERGUARD'|'HYPERSHIELD'|'HYPERBREAK'|'HYPERSWAP'|'HYPERCOVER'|'HYPERFLOWS';
type HyperFlowWindow = { key:string; digits:number[]; zeroPercent:number };
type HyperFlowDigitRank = { digit:number; score:number; frequency:number; recentFrequency:number; trend:number; acceleration:number; momentumScore:number; selectionScore:number; earlyRise:boolean };
type HyperFlowRankResult = HyperFlowDigitRank & { ranking:HyperFlowDigitRank[] };
type AnalyzerCandidate = {
 strategy:string; label:string; contract:Contract; strength:number; confidence:number; stability:number;
 trend:number; acceleration:number; consistency:number; score:number; risk:number; direction:string;
 regimeChange:boolean; recentStrength:number; olderStrength:number; phase:string; earlyMomentum?:boolean; qualityPenalty?:number; qualityBlocked?:boolean; qualityReason?:string;
};
type BotSuccessEstimates = Partial<Record<Strategy,number>>;
const IA_MIN_STAKE=0.35;

const decimalPlaces=(pipSize:number)=>{if(!Number.isFinite(pipSize)||pipSize<=0)return 0;return Math.max(0,Math.min(10,Math.round(-Math.log10(pipSize))))};
// Deriv tick-stream pip_size is a decimal-place count (for example 5), not a price increment. Convert it to the actual increment before calculating the last digit.
const normalizeTickPipSize=(value:unknown):number|undefined=>{const raw=Number(value);if(!Number.isFinite(raw)||raw<0)return undefined;if(Number.isInteger(raw)&&raw<=10)return Math.pow(10,-raw);return raw};

export function digit(v:number|string|null|undefined,pipSize?:number){
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
export function stats(v:number[],pipSize?:number){const d=v.map(x=>digit(x,pipSize)).filter((x):x is number=>x!==null),n=d.length||1,even=d.filter(x=>x%2===0).length/n*100,above5=d.filter(x=>x>5).length/n*100,below4=d.filter(x=>x<4).length/n*100,diff=d.filter(x=>x!==0).length/n*100,match0=d.filter(x=>x===0).length/n*100;let up=0,down=0;for(let i=1;i<v.length;i++){if(v[i]>v[i-1])up++;else if(v[i]<v[i-1])down++}const m=Math.max(1,up+down);return{even,odd:100-even,above5,below4,diff,match0,rise:up/m*100,fall:down/m*100,probs:Array.from({length:10},(_,x)=>d.filter(y=>y===x).length/n*100)}}
export function rankHyperFlowMatchDigit(snapshots:HyperFlowWindow[],currentValues:number[],pipSize?:number,momentumValues:number[]=currentValues,momentumTickWindow=25):HyperFlowRankResult|null{
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
export function rankHyperFlowsAlternativeDigit(values:number[],pipSize?:number):number|null{
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
export function signalQuality(v:number[],s:string,label?:string,pipSize?:number){
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
export function makeExitSpotSignal(values:number[],s:Strategy,pipSize?:number,applyQualityFilter=true){
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
export function makeHyperCoverExitSignal(values:number[],pipSize?:number){
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
export function makeSignal(v:number[],s:Strategy,pipSize?:number,applyQualityFilter=true,threshold=65,minSamples=9){
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

export function strategyMomentumCandidates(values:number[],s:Strategy,pipSize?:number):{contract:Contract;label:string;strength:number}[]{
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
export function makeNormalMomentumSignal9(values:number[],s:Strategy,pipSize?:number,threshold=65,minSamples=10){
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
export function makeBarrierSignal(values:number[],state:BarrierState|null|undefined,pipSize?:number,threshold=65,minSamples=9){
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
export function confirmBarrierRecent(values:number[],state:BarrierState|null|undefined,pipSize?:number){
 return Boolean(makeBarrierSignal(values,state,pipSize,80,5));
}
export function makeExitSpotBarrierSignal(values:number[],state:BarrierState|null|undefined,pipSize?:number){
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
export function analyzeExitSpots28(values:number[],pipSize?:number){
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
export function analyzeStrategies100(v:number[],pipSize?:number){
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
export function estimateBotSuccessScores(values:number[],pipSize?:number):BotSuccessEstimates{
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
