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
type Strategy='PAR_IMPAR'|'ACIMA5_BAIXO4'|'RISE_FALL'|'DIFERENTE'|'MATCH0'|'HYPERLITE'|'HYPERGUARD'|'HYPERSHIELD'|'HYPERBREAK'|'HYPERSWAP';
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
    const prices=v.slice(-5).map(Number);
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
function makeSignal(v:number[],s:Strategy,pipSize?:number){
 if(v.length<5)return null;
 const x=stats(v,pipSize),t=65;
 const pick=(candidate:any)=>{const q=signalQuality(v,s,candidate.label,pipSize);return q.allowed?{...candidate,qualityPenalty:q.penalty}:null};
 if(isRecoveryStrategy(s))return pick({contract:'OVER' as Contract,label:s,strength:100});
 if(s==='HYPERLITE')return x.even>=t?pick({contract:'EVEN' as Contract,label:'PAR',strength:x.even}):null;
 if(s==='PAR_IMPAR'){
  if(x.even>=t){const even=pick({contract:'EVEN' as Contract,label:'PAR',strength:x.even});if(even)return even;}
  return x.odd>=t?pick({contract:'ODD' as Contract,label:'ÍMPAR',strength:x.odd}):null;
 }
 if(s==='ACIMA5_BAIXO4'){
  if(x.above5>=t){const above=pick({contract:'OVER' as Contract,label:'ACIMA 5',strength:x.above5});if(above)return above;}
  return x.below4>=t?pick({contract:'UNDER' as Contract,label:'ABAIXO 4',strength:x.below4}):null;
 }
 if(s==='RISE_FALL'){
  if(x.rise>=t){const rise=pick({contract:'RISE' as Contract,label:'SUBIR',strength:x.rise});if(rise)return rise;}
  return x.fall>=t?pick({contract:'FALL' as Contract,label:'DESCER',strength:x.fall}):null;
 }
 if(s==='DIFERENTE')return x.diff>=t?pick({contract:'DIFFER' as Contract,label:'DIFERENTE DE 0',strength:x.diff}):null;
 const zeroIsDominant=x.match0>=30&&x.match0>Math.max(...x.probs.slice(1));
 return zeroIsDominant?pick({contract:'MATCH0' as Contract,label:'MATCH 0',strength:x.match0}):null;
}
const money=(u:number,currency:Currency)=>{const v=u*(CURRENCY_RATES[currency]||1);return `${v>=0?'+':''}${v.toFixed(2)} ${CURRENCY_LABELS[currency]||currency}`};function confirmAnalyzerRecent(d:number[],strategy:string,label:string){if(d.length<5)return false;const recent=d.slice(-5);if(strategy==='HyperDrive')return recent.filter(n=>n%2===0).length>=4;if(strategy==='HyperStrike')return label==='ACIMA 5'?recent.filter(n=>n>5).length>=4:recent.filter(n=>n<4).length>=4;if(strategy==='HyperForce'){let up=0,down=0;for(let i=1;i<recent.length;i++){if(recent[i]>recent[i-1])up++;else if(recent[i]<recent[i-1])down++}return label==='SUBIR'?up===4:down===4}if(strategy==='HyperNova')return recent.filter(n=>n!==0).length>=4;if(strategy==='Hyperlite')return recent.filter(n=>n%2===0).length>=4;if(strategy==='HyperGuard')return recent.filter(n=>n>0).length>=4;if(strategy==='HyperShield')return recent.filter(n=>n>4).length>=4;if(strategy==='HyperBreak')return recent.filter(n=>n<8).length>=4;return false}
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
function weightedMean(values:number[]){const weights=[0.08,0.12,0.15,0.25,0.40];return values.reduce((sum,v,i)=>sum+v*weights[i],0)}
function weightedStability(values:number[],mean:number){
 const weights=[0.08,0.12,0.15,0.25,0.40];
 const variance=values.reduce((sum,v,i)=>sum+weights[i]*Math.pow(v-mean,2),0);
 return aiClamp(100-Math.sqrt(variance)*170);
}
function analyzeStrategies100(v:number[],pipSize?:number){
 if(v.length<25)return null;
 const all=v.slice(-25).map(n=>digit(n,pipSize)).filter((n):n is number=>n!==null);
 if(all.length<25)return null;

 const windows=Array.from({length:5},(_,i)=>all.slice(i*5,(i+1)*5));
 const riseFall=windows.map(d=>{
  let up=0,down=0;
  for(let i=1;i<d.length;i++){if(d[i]>d[i-1])up++;else if(d[i]<d[i-1])down++}
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
  const quality=signalQuality(all,ANALYZER_STRATEGY_TO_BOT[x.strategy]||x.strategy,x.label,pipSize);
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
const localDateValue=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};const ANALYZER_COLORS:Record<string,string>={HyperDrive:'#3D7FFF',HyperStrike:'#F5B942',HyperForce:'#8B5CF6',HyperNova:'#FF444F',Hyperlite:'#EC4899',HyperGuard:'#34D399',HyperShield:'#14B8A6',HyperBreak:'#F97316',HyperSwap:'#A855F7'};const ANALYZER_STRATEGY_TO_BOT:Record<string,Strategy>={HyperDrive:'PAR_IMPAR',HyperStrike:'ACIMA5_BAIXO4',HyperForce:'RISE_FALL',HyperNova:'DIFERENTE',Hyperlite:'HYPERLITE',HyperGuard:'HYPERGUARD',HyperShield:'HYPERSHIELD',HyperBreak:'HYPERBREAK',HyperSwap:'HYPERSWAP'};const STRATEGY_BOT_NAMES:Record<Strategy,string>={PAR_IMPAR:'HyperDrive',ACIMA5_BAIXO4:'HyperStrike',RISE_FALL:'HyperForce',DIFERENTE:'HyperNova',MATCH0:'HyperFlow',HYPERLITE:'Hyperlite',HYPERGUARD:'HyperGuard',HYPERSHIELD:'HyperShield',HYPERBREAK:'HyperBreak',HYPERSWAP:'HyperSwap'};let lastAnalyzerAlertAt=0;
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
 const[userName,setUserName]=useState(''),[onlineUsers,setOnlineUsers]=useState(0),[symbol,setSymbol]=useState('1HZ100V'),[account,setAccount]=useState<'demo'|'real'>('demo'),[stake,setStake]=useState(IA_RISK_STAKE),[strategy,setStrategy]=useState<Strategy>('PAR_IMPAR'),[tickWindow,setTickWindow]=useState(5),[running,setRunning]=useState(false),[ticks,setTicks]=useState<number[]>([]),[tickPipSize,setTickPipSize]=useState<number|undefined>(undefined),[signalNow,setSignalNow]=useState<any>(null),[target,setTarget]=useState(33),[lossLimit,setLossLimit]=useState(62.50),[metas,setMetas]=useState(false),[mozHyperCourse,setMozHyperCourse]=useState(false),[courseSection,setCourseSection]=useState<'home'|'risk'|'course'>('home'),[riskBalance,setRiskBalance]=useState(200),[riskPercent,setRiskPercent]=useState(2),[riskTrades,setRiskTrades]=useState(10),[maxMartingale,setMaxMartingale]=useState(11),[theme,setTheme]=useState<'dark'|'light'>('light'),[menu,setMenu]=useState(false),[notice,setNotice]=useState<string|null>(null),[currency,setCurrency]=useState<Currency>('USD'),[stakeManagerVersion,setStakeManagerVersion]=useState(0),[lastDigitSeen,setLastDigitSeen]=useState<number|null>(null),[digitView,setDigitView]=useState<'bars'|'chart'>('bars'),[historyOpen,setHistoryOpen]=useState(false),[historyDate,setHistoryDate]=useState(localDateValue),[dailyHistoryArchive,setDailyHistoryArchive]=useState<any[]>([]);
 const [iaPower,setIaPower]=useState(true),[sonic,setSonic]=useState(false),[soundEnabled,setSoundEnabled]=useState(true),[courseCode,setCourseCode]=useState(''),[courseUnlocked,setCourseUnlocked]=useState(false),[courseUnlocking,setCourseUnlocking]=useState(false),[smartAnalyzer,setSmartAnalyzer]=useState(false),[aiAnalystActive,setAiAnalystActive]=useState(false),[aiAnalystExpiresAt,setAiAnalystExpiresAt]=useState<string|null>(null),[smartAdvice,setSmartAdvice]=useState<any>(null),[analyzerNotice,setAnalyzerNotice]=useState<string|null>(null),[analyzerHistory,setAnalyzerHistory]=useState<any[]>([]),[analyzerNoticeColor,setAnalyzerNoticeColor]=useState('#3D7FFF');
 const [currencyOptions,setCurrencyOptions]=useState<Currency[]>(['USD']); const [cashierOpen,setCashierOpen]=useState(false),[cashierAction,setCashierAction]=useState<'deposit'|'withdraw'|'ai_analyst'|'course'|null>(null),[supportOpen,setSupportOpen]=useState(false);
 const lastEpoch=useRef<number|null>(null),requested=useRef(false),stopped=useRef(false),botArmedRef=useRef(false),lastRequestedClose=useRef(0),requestStartedAt=useRef(0),lastActivityAt=useRef(Date.now()),lastProcessedStakeResult=useRef<number|string|null>(null),lastProcessedSonicResult=useRef<number|string|null>(null),processedStakeContractsRef=useRef(new Set<number>()),processedSonicContractsRef=useRef(new Set<number>()),pendingRiskStakeRef=useRef<number|null>(null),stakeReadyRef=useRef(true),riskAwaitingContractRef=useRef<number|null>(null),iaRecoveryQuotePendingRef=useRef(false),lastAdvisorKeyRef=useRef(''),totalTickCountRef=useRef(0),lastAnalyzerEvalTickRef=useRef(0),analyzerStableKeyRef=useRef<string|null>(null),analyzerStableCountRef=useRef(0),analyzerLastSwitchTickRef=useRef(-1000),analyzerLastSwitchAtRef=useRef(0),analyzerNoticeTimerRef=useRef<number|null>(null),analyzerDecisionHistoryRef=useRef<any[]>([]),historyRef=useRef<HTMLDivElement|null>(null),lastProcessedRecoveryContractRef=useRef<number|null>(null),pendingAnalyzerStrategyRef=useRef<Strategy|null>(null),analyzerConfirmedRef=useRef(false),analyzerConfirmedStrategyRef=useRef<Strategy|null>(null);
 useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  const requestedAction = params.get('paymentAgent');
  if (requestedAction !== 'withdraw' && requestedAction !== 'deposit') return;
  setCashierAction(requestedAction as 'deposit'|'withdraw');
  params.delete('paymentAgent');
  const nextQuery = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (nextQuery ? '?' + nextQuery : '') + window.location.hash);
 }, []);
 const barrierStateRef=useRef<BarrierState|null>(null);
 const gestorRef=useRef(criarGestorStake({stakeBase:IA_RISK_STAKE,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale}));
 const lastPayoutRatioRef=useRef(IA_PAYOUT);
 const sonicRef=useRef(createSonicStakeManager({baseStake:IA_RISK_STAKE,payout:IA_PAYOUT,maxLevel:maxMartingale}));
 const processClosedTradeImmediately=useCallback((closed:any)=>{
  if((!running&&!smartAnalyzer)||!closed?.contract_id)return;
  const id=Number(closed.contract_id);
  const result=Number(closed.profit_loss);
  if(!Number.isFinite(id)||id<=0||!Number.isFinite(result))return;

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
 },[running,iaPower,sonic,soundEnabled,strategy,ticks,tickPipSize,account,symbol,stake]);
 const{tick,balance,proposal,buy,buying,activeContractId,getProposal,subscribeTicks,isAuthorized,isConnected,error,profitTransactions,soros,setSorosStake,setSorosEnabled,contractClosedSeq,lastClosedTransaction,contractStage,fetchProfitTable,getTicksHistory,resetTradingSession}=useDeriv(account,processClosedTradeImmediately);
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
 const analyze100Ticks=useMemo(()=>analyzeStrategies100(ticks,tickPipSize),[ticks,tickPipSize]);const statsWindow=25;const st=useMemo(()=>stats(ticks,tickPipSize),[ticks,tickPipSize]);const latest=profitTransactions[0];const chartExitDigit=useMemo(()=>{if(!latest?.sell_time)return null;const raw=latest.exit_tick??latest.exit_spot;return digit(raw,tickPipSize)},[latest,tickPipSize]);const chartDigits=useMemo(()=>{const vals=ticks.slice(-25).map(v=>digit(v,tickPipSize)).filter((d):d is number=>d!==null);return chartExitDigit===null?vals:[...vals,chartExitDigit]},[ticks,tickPipSize,chartExitDigit]);const chartLineDigits=useMemo(()=>{if(lastDigitSeen===null)return chartDigits;const base=chartDigits.slice(0,24);return [...base,lastDigitSeen]},[chartDigits,lastDigitSeen]);const chartPoints=useMemo(()=>{if(!chartLineDigits.length)return '';return chartLineDigits.map((d,i)=>{const y=92-(d/9)*84;return ((i/(Math.max(chartLineDigits.length-1,1)))*100).toFixed(2)+','+y.toFixed(2)}).join(' ')},[chartLineDigits]);const chartLastY=useMemo(()=>{const d=lastDigitSeen;return d==null?50:92-(d/9)*84},[lastDigitSeen]);const pnl=useMemo(()=>profitTransactions.reduce((a,x)=>a+Number(x.profit_loss||0),0),[profitTransactions]),closedOperations=profitTransactions.length,iaState=useMemo(()=>gestorRef.current.getEstado(),[stakeManagerVersion]),sonicState=useMemo(()=>sonicRef.current.getState(),[stakeManagerVersion]);
 const dailyTransactions=useMemo(()=>{const parts=historyDate.split('-').map(Number);if(parts.length!==3||parts.some(n=>!Number.isFinite(n)))return [];const [year,month,day]=parts;return dailyHistoryArchive.filter(x=>{const raw=Number(x.sell_time??x.purchase_time);if(!Number.isFinite(raw)||raw<=0)return false;const d=new Date(raw*1000);return d.getFullYear()===year&&d.getMonth()+1===month&&d.getDate()===day})},[dailyHistoryArchive,historyDate]);const dailyPnl=useMemo(()=>dailyTransactions.reduce((a,x)=>a+Number(x.profit_loss||0),0),[dailyTransactions]);const dailyWins=useMemo(()=>dailyTransactions.filter(x=>Number(x.profit_loss||0)>0).length,[dailyTransactions]);const dailyLosses=useMemo(()=>dailyTransactions.filter(x=>Number(x.profit_loss||0)<0).length,[dailyTransactions]);const dailyByBot=useMemo(()=>{const groups=new Map<string,{count:number;wins:number;losses:number;pnl:number}>();for(const x of dailyTransactions){const bot=String((x as any).bot||'Bot não identificado');const prev=groups.get(bot)||{count:0,wins:0,losses:0,pnl:0};const p=Number(x.profit_loss||0);prev.count+=1;if(p>0)prev.wins+=1;else if(p<0)prev.losses+=1;prev.pnl+=p;groups.set(bot,prev)}return Array.from(groups.entries()).sort((a,b)=>b[1].pnl-a[1].pnl)},[dailyTransactions]);useEffect(()=>{try{const key=`mozhyper-daily-history-v1:${account}`;const raw=localStorage.getItem(key);const stored=raw?JSON.parse(raw):[];if(Array.isArray(stored))setDailyHistoryArchive(stored)}catch{}},[account]); useEffect(()=>{let lastDate=localDateValue();const timer=window.setInterval(()=>{const today=localDateValue();if(today!==lastDate){lastDate=today;setHistoryDate(today);}},30000);return()=>window.clearInterval(timer)},[]);useEffect(()=>{if(!profitTransactions.length)return;const key=`mozhyper-daily-history-v1:${account}`;setDailyHistoryArchive(prev=>{const byId=new Map<number,any>();for(const x of prev){const id=Number(x.contract_id);if(Number.isFinite(id)&&id>0)byId.set(id,x)}for(const x of profitTransactions){const id=Number(x.contract_id);if(!Number.isFinite(id)||id<=0)continue;byId.set(id,{...byId.get(id),...x})}const next=Array.from(byId.values()).sort((a,b)=>Number(b.sell_time??b.purchase_time)-Number(a.sell_time??a.purchase_time)).slice(0,2000);try{localStorage.setItem(key,JSON.stringify(next))}catch{}return next})},[profitTransactions,account]);const greeting=useMemo(()=>{const h=new Date().getHours();if(language==='pt')return h>=0&&h<6?'Boa madrugada':h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';if(language==='es')return h>=0&&h<6?'Buenas madrugadas':h<12?'Buenos días':h<18?'Buenas tardes':'Buenas noches';return h>=0&&h<6?'Good early morning':h<12?'Good morning':h<18?'Good afternoon':'Good evening'},[language]); useEffect(()=>{document.body.classList.toggle('light',theme==='light');return()=>{document.body.classList.remove('light')}},[theme]); useEffect(()=>{fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{const name=String(data?.user?.name||'').trim();if(name)setUserName(name)}).catch(()=>{})},[]); useEffect(()=>{let alive=true;const heartbeat=()=>{fetch('/api/online',{method:'POST',cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>{if(alive)setOnlineUsers(Number(data?.online)||0)}).catch(()=>{})};heartbeat();const id=window.setInterval(heartbeat,20000);return()=>{alive=false;clearInterval(id)}},[]);
 useEffect(()=>{try{const saved=localStorage.getItem('mozhyper-sound-enabled');if(saved!==null)setSoundEnabled(saved!=='false')}catch{}},[]); useEffect(()=>{let alive=true;const load=async()=>{try{const auth=await fetch('/api/auth/me',{cache:'no-store'}).then(r=>r.ok?r.json():null);let country=String(auth?.user?.country||'').trim().toUpperCase();let ipData:any=null;if(!country){ipData=await fetch('https://ipapi.co/json/',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);country=String(ipData?.country_code||'').trim().toUpperCase();if(/^[A-Z]{2}$/.test(country)&&auth?.platformAuthenticated){fetch('/api/auth/country',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country})}).catch(()=>{})}}const registeredCurrency=country?getCountryCurrency(country):'';const isAllCurrenciesUser=String(auth?.user?.email||'').trim().toLowerCase()==='khatangana@gmail.com';const apiCurrency=normalizeCurrency(ipData?.currency||'', 'USD');let native=registeredCurrency||apiCurrency;let rate=FALLBACK_RATES[native]||1;if(ipData?.currency===native&&Number(ipData?.currency_rate)>0)rate=Number(ipData.currency_rate);if(!ipData||!country){const currencyData=await fetch('/api/currency',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);if(!native||native==='USD'){native=normalizeCurrency(currencyData?.currency,'USD');}if(native!=='USD'&&FALLBACK_RATES[native])rate=FALLBACK_RATES[native]}if(!alive)return;CURRENCY_RATES[native]=rate;CURRENCY_LABELS[native]=getCurrencyMeta(native).symbol;setCurrencyOptions(isAllCurrenciesUser?Object.keys(CURRENCY_RATES):Array.from(new Set([native,'USD'])));setCurrency(native)}catch{if(alive)setCurrencyOptions(['USD'])}};load();return()=>{alive=false}},[]); useEffect(()=>{if(!menu)return;const onPointerDown=(e:PointerEvent)=>{const el=e.target as HTMLElement;if(!el.closest('.menu-trigger')&&!el.closest('.menu-popover'))setMenu(false)};document.addEventListener('pointerdown',onPointerDown);return()=>document.removeEventListener('pointerdown',onPointerDown)},[menu]); useEffect(()=>{if(!historyOpen)return;const onPointerDown=(e:PointerEvent)=>{const target=e.target as Node|null;if(historyRef.current&&!historyRef.current.contains(target))setHistoryOpen(false)};document.addEventListener('pointerdown',onPointerDown);return()=>document.removeEventListener('pointerdown',onPointerDown)},[historyOpen]);
 useEffect(()=>{if(isConnected)subscribeTicks(symbol)},[isConnected,symbol,subscribeTicks]);
 useEffect(()=>{if(!tick?.epoch||tick.epoch===lastEpoch.current)return;lastEpoch.current=tick.epoch;totalTickCountRef.current+=1;lastActivityAt.current=Date.now();const q=Number(tick.quote);if(!Number.isFinite(q))return;if(Number.isFinite((tick as any).pip_size)&&Number((tick as any).pip_size)>0)setTickPipSize(Number((tick as any).pip_size));const pipSize=Number((tick as any).pip_size)>0?Number((tick as any).pip_size):tickPipSize;setLastDigitSeen(digit(q,pipSize));setTicks(prev=>{const n=[...prev,q].slice(-statsWindow);if(n.length>=tickWindow)setSignalNow(makeSignal(n.slice(-tickWindow),strategy,pipSize));return n})},[tick,strategy,tickWindow,tickPipSize,activeContractId,buying,proposal]);
 useEffect(()=>{if(!iaPower&&!sonic)setSorosStake(stake)},[stake,iaPower,sonic,setSorosStake]);
 useEffect(()=>{setSorosEnabled(!iaPower&&!sonic)},[iaPower,sonic,setSorosEnabled]);
 useEffect(()=>{if(!running){gestorRef.current=criarGestorStake({stakeBase:stake,payout:IA_PAYOUT,maxNiveisMartingale:maxMartingale});sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});setStakeManagerVersion(v=>v+1)}},[stake,maxMartingale,running]);
 useEffect(()=>{setSignalNow(null);requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null},[tickWindow,strategy]); useEffect(()=>{setTicks([]);setSignalNow(null);setTickPipSize(undefined);setLastDigitSeen(null);requested.current=false;requestStartedAt.current=0;lastActivityAt.current=Date.now();totalTickCountRef.current=0;lastAnalyzerEvalTickRef.current=0;analyzerLastSwitchTickRef.current=-1000;analyzerDecisionHistoryRef.current=[];analyzerLastSwitchAtRef.current=0;analyzerConfirmedRef.current=false;analyzerConfirmedStrategyRef.current=null;barrierStateRef.current=isRecoveryStrategy(strategy)?initialBarrierState(strategy):null},[symbol]);
 useEffect(()=>{if((!running&&!smartAnalyzer)||!isConnected)return;const id=window.setInterval(()=>fetchProfitTable({limit:500,offset:0,sort:'DESC'}),5000);return()=>clearInterval(id)},[running,smartAnalyzer,isConnected,fetchProfitTable]);
 useEffect(()=>{if(!running&&!smartAnalyzer)return;const id=window.setInterval(()=>{if(requested.current&&requestStartedAt.current>0&&!proposal&&!buying&&activeContractId===null&&Date.now()-requestStartedAt.current>5000){requested.current=false;requestStartedAt.current=0;if(!(iaPower||sonic)||riskAwaitingContractRef.current===null)stakeReadyRef.current=true}if(signalNow&&!proposal&&!buying&&activeContractId===null&&riskAwaitingContractRef.current===null&&Date.now()-lastActivityAt.current>5500){requested.current=false;requestStartedAt.current=0;if(!(iaPower||sonic))stakeReadyRef.current=true;subscribeTicks(symbol);lastActivityAt.current=Date.now()-4500}},1000);return()=>clearInterval(id)},[running,smartAnalyzer,proposal,buying,activeContractId,signalNow,symbol,subscribeTicks,latest,iaPower,sonic]);
 useEffect(()=>{
  if(!botArmedRef.current||(!running&&!smartAnalyzer)||stopped.current)return;
  // AI Analyst must finish the 25-tick analysis and select the bot before trading.
  if(smartAnalyzer){
   if(!smartAdvice||smartAdvice.noTrade||smartAdvice.qualityBlocked)return;
   if(Number(smartAdvice.score)<65&&smartAdvice.phase!=='EMERGENTE')return;
   const analystStrategy=ANALYZER_STRATEGY_TO_BOT[smartAdvice.strategy];
   if(!analystStrategy||strategy!==analystStrategy)return;
  }
  if(pendingAnalyzerStrategyRef.current&&pendingAnalyzerStrategyRef.current!==strategy)return;
  if(proposal||buying||activeContractId!==null||!isAuthorized||!isConnected)return;
  const freshSignal=smartAnalyzer&&smartAdvice&&!smartAdvice.noTrade
   ? {contract:smartAdvice.contract as Contract,label:String(smartAdvice.label),strength:Number(smartAdvice.score)||0}
   : isRecoveryStrategy(strategy)
     ? {contract:'OVER' as Contract,label:strategy,strength:100}
     : makeSignal(ticks.slice(-tickWindow),strategy,tickPipSize);
  if(!freshSignal)return;
  if(requested.current)return;
  if((iaPower||sonic)&&(riskAwaitingContractRef.current!==null||!stakeReadyRef.current))return;
  stakeReadyRef.current=false;
  requested.current=true;
  requestStartedAt.current=Date.now();
  lastActivityAt.current=Date.now();
  let contractTypeStr:string,barrier:number;
  if(isRecoveryStrategy(strategy)&&barrierStateRef.current){
   contractTypeStr=barrierStateRef.current.contractType;
   barrier=barrierStateRef.current.barrier;
  } else {
   const c:Contract=freshSignal.contract as Contract;
   barrier=c==='DIFFER'?0:c==='MATCH0'?0:c==='OVER'?5:c==='UNDER'?4:0;
   contractTypeStr=TYPES[c];
  }
  // Sonic é a fonte de verdade da stake quando está ativo.
  // O Soros interno do Sonic controla a repetição da mesma stake vencedora.
  const rawAmount=iaPower?gestorRef.current.proximoStake():(sonic?sonicRef.current.getStake():(Number(soros.stake)>0?soros.stake:stake));
  const availableBalance=Number(balance?.balance);
  const maxStakeByBalance=Math.floor(availableBalance*0.5*100)/100;
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
  const desiredStake=Math.max(0.35,Number(rawAmount)||0.35);
  let amount=Math.max(0.35,Math.min(desiredStake,maxStakeByBalance));
  const applySoros=!iaPower&&!sonic;

  // IA POWER / HyperShield: a primeira proposta serve apenas para
  // descobrir o payout REAL. Ela não pode ser comprada enquanto
  // a stake de recuperação ainda estiver a ser recalculada.
  if(iaPower&&iaRecovery){
   amount=0.35;
   iaRecoveryQuotePendingRef.current=true;
  }else{
   iaRecoveryQuotePendingRef.current=false;
  }

  if(iaPower||sonic)pendingRiskStakeRef.current=Number(amount.toFixed(2));
  if(!getProposal(symbol,contractTypeStr,amount,1,barrier,applySoros)){
   if(iaPower||sonic)pendingRiskStakeRef.current=null;
   requested.current=false;
   requestStartedAt.current=0;
   stakeReadyRef.current=true;
  }
 },[running,ticks,tickWindow,tickPipSize,proposal,buying,activeContractId,isAuthorized,isConnected,getProposal,symbol,soros.stake,stake,iaPower,sonic,stakeManagerVersion,balance?.balance,strategy]); useEffect(()=>{
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
  const maxStakeByBalance=Math.floor(availableBalance*0.5*100)/100;
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
   if(pendingAnalyzerStrategyRef.current&&pendingAnalyzerStrategyRef.current!==strategy)return;

   const cancelUnqualifiedEntry=(message:string)=>{
    setNotice(message);
    requested.current=false;
    requestStartedAt.current=0;
    pendingRiskStakeRef.current=null;
    iaRecoveryQuotePendingRef.current=false;
    stakeReadyRef.current=true;
   };

   // Last-moment validation: the same quality filter protects both AI Analyst
   // and the direct bot mode immediately before the proposal is bought.
   {
    let qualityStrategy:string=strategy;
    let qualityLabel='';
    let expectedContract:Contract|null=null;

    if(smartAnalyzer){
     const advice:any=smartAdvice;
     const mapped=advice?ANALYZER_STRATEGY_TO_BOT[String(advice.strategy)]||String(advice.strategy):'';
     if(!advice||advice.noTrade||advice.qualityBlocked||mapped!==strategy){
      cancelUnqualifiedEntry('Signal Quality Filter: entrada bloqueada — sinal não qualificado');
      if(advice&&!advice.noTrade)setSmartAdvice((prev:any)=>prev?.noTrade?prev:prev?{...prev,noTrade:true}:prev);
      return;
     }
     qualityStrategy=mapped;
     qualityLabel=String(advice.label||'');
     expectedContract=(advice.contract||null) as Contract|null;
    }else if(isRecoveryStrategy(strategy)){
     // Recovery bots also use the same quality filter; their live barrier can differ
     // from the seed contract, so the proposal-type equality check is intentionally skipped.
     qualityStrategy=strategy;
     qualityLabel=strategy;
     expectedContract=null;
    }else{
     const freshSignal=makeSignal(ticks.slice(-tickWindow),strategy,tickPipSize);
     if(!freshSignal){
      cancelUnqualifiedEntry('Signal Quality Filter: aguardando um sinal válido de 5 ticks');
      return;
     }
     qualityLabel=String(freshSignal.label||'');
     expectedContract=(freshSignal.contract||null) as Contract|null;
    }

    const quality=signalQuality(ticks.slice(-25),qualityStrategy,qualityLabel,tickPipSize);
    if(!quality.allowed){
     cancelUnqualifiedEntry('Signal Quality Filter: entrada bloqueada — '+quality.reason);
     if(smartAnalyzer)setSmartAdvice((prev:any)=>prev?{...prev,noTrade:true,qualityBlocked:true,qualityPenalty:quality.penalty,qualityReason:quality.reason}:prev);
     return;
    }

    const proposalType=String((proposal as any).contract_type||'').toUpperCase();
    if(!isRecoveryStrategy(strategy)&&proposalType&&expectedContract&&proposalType!==TYPES[expectedContract]){
     cancelUnqualifiedEntry('Signal Quality Filter: entrada cancelada — o sinal mudou antes da compra');
     return;
    }
   }

   const botName=STRATEGY_BOT_NAMES[strategy];
   if(!buy(proposal.id,Number(proposal.ask_price),botName)){
    setNotice('Falha ao enviar a operação para a Deriv.');
    requested.current=false;
    requestStartedAt.current=0;
    stakeReadyRef.current=true;
   }
  },[proposal,buying,activeContractId,running,smartAnalyzer,smartAdvice,ticks,tickWindow,tickPipSize,isAuthorized,isConnected,strategy,buy,iaPower,setSmartAdvice]); useEffect(()=>{
   if(activeContractId!==null){
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
 if(ticks.length<25){setSmartAdvice(null);setAnalyzerNoticeColor('#64748b');setAnalyzerNotice('A recolher 25 ticks...');return;}
 if(!analyze100Ticks)return;
 // Sliding 25-tick window; re-evaluate every 3 incoming ticks.
 if(lastAnalyzerEvalTickRef.current>0&&totalTickCountRef.current-lastAnalyzerEvalTickRef.current<3)return;
 lastAnalyzerEvalTickRef.current=totalTickCountRef.current;

 const result:any=analyze100Ticks;
 const rankings:any[]=Array.isArray(result.rankings)?result.rankings:[result];
 const currentBotName=STRATEGY_BOT_NAMES[strategy];
 const currentRanking=rankings.find((x:any)=>x.strategy===currentBotName);
 const currentScore=Number(currentRanking?.score)||0;
 const bestScore=Number(result.score)||0;
 const bestBot=ANALYZER_STRATEGY_TO_BOT[result.strategy];
 if(!bestBot)return;

 const switchThreshold=7;
 const cooldownTicks=3;
 const ticksSinceSwitch=totalTickCountRef.current-analyzerLastSwitchTickRef.current;
 const cooldownActive=ticksSinceSwitch<cooldownTicks;
 const currentOutOfPhase=currentRanking?.phase==='FORA DA FASE'||currentScore<60;
 const strongRegimeChange=Boolean(result.regimeChange)&&bestScore>=78&&((bestScore-currentScore)>=10||Number(result.recentStrength)>=80);

 // Analysis and entry are separate. We first decide which candidate is selected,
 // then that candidate supplies the direction used by the entry engine.
 let selected:any=result;
 let action='';

 if(result.noTrade&&(!currentRanking||currentScore<65||currentRanking.qualityBlocked)){
   setSmartAdvice({...result,noTrade:true,currentScore});
   setAnalyzerNoticeColor('#ff444f');
   setAnalyzerNotice('AI Analyst: NO TRADE — fase insuficiente');
   action='NO TRADE';
 }else if(strategy!==bestBot){
   const challengerIsStrong=bestScore>=65&&!result.noTrade;
   const enoughAdvantage=bestScore>=currentScore+switchThreshold;
   const maySwitch=!cooldownActive||strongRegimeChange;
   if(challengerIsStrong&&(currentOutOfPhase||enoughAdvantage)&&maySwitch){
      selected=result;
      pendingAnalyzerStrategyRef.current=bestBot;
      setStrategy(bestBot);
      analyzerLastSwitchTickRef.current=totalTickCountRef.current;
      analyzerLastSwitchAtRef.current=Date.now();
      setAnalyzerNoticeColor(ANALYZER_COLORS[result.strategy]||'#3D7FFF');
      setAnalyzerNotice('TROCA PARA '+result.strategy+' — AI Score '+Math.round(bestScore));
      analyzerAlertSound();
      action='TROCA PARA '+result.strategy;
   }else if(currentRanking&&currentScore>=65){
      selected=currentRanking;
      pendingAnalyzerStrategyRef.current=null;
      setAnalyzerNoticeColor(ANALYZER_COLORS[currentRanking.strategy]||'#3D7FFF');
      setAnalyzerNotice('MANTÉM '+currentRanking.strategy+' — vantagem insuficiente');
      action='MANTÉM '+currentRanking.strategy;
   }else{
      setSmartAdvice({...result,noTrade:true,currentScore});
      setAnalyzerNoticeColor('#64748b');
      setAnalyzerNotice('AGUARDA — nenhum sinal operacional');
      action='AGUARDA';
   }
 }else{
   selected=currentRanking||result;
   pendingAnalyzerStrategyRef.current=null;
   setAnalyzerNoticeColor(ANALYZER_COLORS[selected.strategy]||'#3D7FFF');
   setAnalyzerNotice('MANTÉM '+selected.strategy+' — AI Score '+Math.round(Number(selected.score)||0));
   action='MANTÉM '+selected.strategy;
 }

 if(selected&&!selected.noTrade&&!selected.qualityBlocked){
   setSmartAdvice({
     ...selected,
     rankings,
     noTrade:false,
     currentScore,
     confidenceBand:confidenceBand(Number(selected.score)||0),
     advantage:Number(result.advantage)||0,
     regimeChange:Boolean(result.regimeChange)
   });
 }else if(selected?.qualityBlocked){
   setSmartAdvice({
     ...selected,
     rankings,
     noTrade:true,
     qualityBlocked:true,
     currentScore,
     confidenceBand:confidenceBand(Number(selected.score)||0),
     qualityReason:selected.qualityReason||'baixa qualidade do sinal'
   });
   setAnalyzerNoticeColor('#dc2626');
   setAnalyzerNotice('AI Analyst: SINAL BLOQUEADO — '+String(selected.qualityReason||'baixa qualidade'));
   action='SINAL BLOQUEADO';
 }

 const entry={
   time:new Date().toLocaleTimeString(),
   rankings:rankings.slice(0,3).map((x:any)=>({strategy:x.strategy,label:x.label,score:Math.round(x.score)})),
   strategy:selected?.strategy||result.strategy,
   label:selected?.label||result.label,
   score:Math.round(Number(selected?.score??bestScore)||0),
   confidence:Math.round(Number(selected?.confidence??result.confidence)||0),
   stability:Math.round(Number(selected?.stability??result.stability)||0),
   phase:selected?.phase||result.phase,
   action,
   regimeChange:Boolean(result.regimeChange)
 };
 analyzerDecisionHistoryRef.current=[entry,...analyzerDecisionHistoryRef.current].slice(0,8);
 setAnalyzerHistory(analyzerDecisionHistoryRef.current);
 lastAdvisorKeyRef.current=entry.strategy+'|'+entry.label;
},[smartAnalyzer,analyze100Ticks,ticks.length,strategy]);

  useEffect(()=>{if(!running||stopped.current)return;const accountCurrency=normalizeCurrency(balance?.currency,currency);const targetInAccountCurrency=Number(target)*CURRENCY_RATES[accountCurrency];const lossLimitInAccountCurrency=Number(lossLimit)*CURRENCY_RATES[accountCurrency];if(pnl>=targetInAccountCurrency){stopped.current=true;requested.current=false;requestStartedAt.current=0;setRunning(false);setNotice(`🎯 ${t('goalReached')}: ${money(pnl,accountCurrency)}`);sound('target')}else if(pnl<=-lossLimitInAccountCurrency){stopped.current=true;requested.current=false;requestStartedAt.current=0;setRunning(false);setNotice(`🛑 ${t('lossGoal')}: ${money(pnl,accountCurrency)}`);sound('loss')}},[pnl,target,lossLimit,currency,balance?.currency,running,t]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(null),5000);return()=>clearTimeout(timer)},[notice]);
 const togglePower=(enabled:boolean)=>{if(running)return;setIaPower(enabled);setSonic(false);sonicRef.current.reset();setSorosEnabled(!enabled);setStakeManagerVersion(v=>v+1)};
 const toggleSonic=(enabled:boolean)=>{if(running)return;setSonic(enabled);setIaPower(false);sonicRef.current=createSonicStakeManager({baseStake:stake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});setSorosEnabled(!enabled);setStakeManagerVersion(v=>v+1)};
 const start=()=>{iaRecoveryQuotePendingRef.current=false;const availableBalance=Number(balance?.balance);if(!isConnected||!isAuthorized||!Number.isFinite(availableBalance)||availableBalance<=0)return false;botArmedRef.current=true;setSorosEnabled(!iaPower&&!sonic);const cappedInitialStake=Math.min(Math.max(0.35,Number(stake)||0.35),availableBalance*0.5);gestorRef.current=criarGestorStake({stakeBase:cappedInitialStake,payout:lastPayoutRatioRef.current,maxNiveisMartingale:maxMartingale});const sonicBaseStake=Math.min(Math.max(0.35,Number(stake)||0.35),availableBalance*0.5);sonicRef.current=createSonicStakeManager({baseStake:sonicBaseStake,payout:lastPayoutRatioRef.current,maxLevel:maxMartingale});processedStakeContractsRef.current.clear();processedSonicContractsRef.current.clear();pendingRiskStakeRef.current=null;for(const tx of profitTransactions){const id=Number(tx.contract_id);if(!Number.isFinite(id)||id<=0)continue;processedStakeContractsRef.current.add(id);processedSonicContractsRef.current.add(id);}lastProcessedStakeResult.current=latest?.contract_id??null;lastProcessedSonicResult.current=latest?.contract_id??null;stakeReadyRef.current=true;stopped.current=false;requested.current=false;requestStartedAt.current=0;lastRequestedClose.current=contractClosedSeq;lastActivityAt.current=Date.now();totalTickCountRef.current=0;lastAnalyzerEvalTickRef.current=0;analyzerStableKeyRef.current=null;analyzerStableCountRef.current=0;analyzerLastSwitchTickRef.current=-1000;setTicks([]);setSignalNow(null);setRunning(true);return true};
 const stop=()=>{saveStakeState();iaRecoveryQuotePendingRef.current=false;botArmedRef.current=false;stopped.current=true;requested.current=false;requestStartedAt.current=0;riskAwaitingContractRef.current=null;stakeReadyRef.current=true;setRunning(false);setSignalNow(null)}; const refreshAiAnalystAccess=useCallback(async()=>{try{const response=await fetch('/api/ai-analyst/access',{cache:'no-store'});const data=await response.json().catch(()=>null);setAiAnalystActive(Boolean(data?.active));setAiAnalystExpiresAt(data?.expiresAt?String(data.expiresAt):null);return Boolean(data?.active)}catch{setAiAnalystActive(false);setAiAnalystExpiresAt(null);return false}},[]);
 useEffect(()=>{void refreshAiAnalystAccess()},[refreshAiAnalystAccess]);
 const toggleAnalyzer=useCallback((enabled:boolean)=>{if(enabled){if(!aiAnalystActive){setCashierAction('ai_analyst');setNotice('AI Analyst: assinatura mensal de 250 MT / $3 USD.');return}if(running){setSmartAnalyzer(true);return}if(start()){setRunning(false);setSmartAnalyzer(true)}else{setNotice(!isConnected?'A ligar ao Deriv...':!isAuthorized?'Autenticação Deriv necessária':'Saldo indisponível para iniciar o Analyst.')}}else{setSmartAnalyzer(false);if(!running)stop()}},[aiAnalystActive,running,isConnected,isAuthorized,start,stop]);
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
 return <div className="mx-auto w-full max-w-[1400px] p-3 md:p-5" style={{color:light?'#0f172a':'#f8fafc'}}>{analyzerNotice&&<div className="fixed left-1/2 top-0 z-[300] w-[min(88vw,420px)] -translate-x-1/2 rounded-xl bg-white px-3 py-2 text-center text-[10px] font-black shadow-2xl md:top-1 md:px-4 md:py-2.5 md:text-[11px]" style={{color:analyzerNoticeColor,border:'2px solid '+analyzerNoticeColor,boxShadow:'0 8px 24px -10px '+analyzerNoticeColor}}>{analyzerNotice}</div>}<style>{`body{background:var(--bg,#07111f);color:var(--text,#f8fafc);transition:background .2s,color .2s}.av4{background:${light?'#f8fafc':'#071936'};border:1px solid #facc15;border-radius:18px;padding:clamp(12px,2vw,24px)}.av4 .card{background:${light?'#fff':'#0d2347'};border:1px solid ${light?'#d5deea':'#294b78'};border-radius:14px}.av4 .balance-card,.av4 .menu-trigger{background:transparent;border:0;border-radius:0}.av4 .profit-card{background:${light?'#fff':'#0d2347'};border:1px solid #facc15;border-radius:14px}.av4 .account-strategy{display:grid;grid-template-columns:1fr 1fr;background:${light?'#fff':'#0d2347'};border:1px solid #facc15;border-radius:14px;overflow:hidden}.av4 .account-strategy>label{border:0;border-radius:0}.av4 .account-strategy>label+label{border-left:1px solid #facc15}.av4 .muted{color:${light?'#64748b':'#94a3c1'}}.av4 select,.av4 input{color:${light?'#0f172a':'#f8fafc'}}.av4 .hist{display:flex;gap:8px;overflow-x:auto}.av4 .trade{min-width:110px;padding:9px;border-radius:10px;border:1px solid ${light?'#d5deea':'#334e78'}}.av4 .notice{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:200;min-width:min(92vw,360px);padding:13px 16px;border-radius:14px;background:#0f2345;color:#fff;border:1px solid #3b82f6;box-shadow:0 14px 35px rgba(0,0,0,.35);text-align:center;font-weight:800;font-size:13px}.av4 .modal-backdrop{position:fixed;inset:0;z-index:150;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:18px}.av4 .modal{width:min(94vw,380px);background:${light?'#fff':'#0d2347'};border:1px solid ${light?'#d5deea':'#294b78'};border-radius:16px;padding:18px}.header-actions{display:flex;align-items:center;gap:12px;position:relative}.cashier-wrap{position:static}.cashier-menu{position:absolute;right:0;left:auto;top:42px;z-index:300;width:min(94vw,390px);box-sizing:border-box;padding:16px 10px 14px;border:1px solid #293241;background:#171c24;color:#fff;border-radius:0 0 18px 18px;box-shadow:0 18px 40px -16px rgba(0,0,0,.65);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.cashier-menu button{min-width:0;border:0;background:transparent;color:#fff;padding:0 2px;text-align:center;border-radius:10px;cursor:pointer;font-size:13px;font-weight:500;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:7px;white-space:nowrap;transition:background .15s}.cashier-menu button:hover{background:rgba(255,255,255,.06)}.cashier-menu .cashier-icon{width:56px;height:56px;border:2px solid #e5e7eb;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:31px;font-weight:300;line-height:1;box-sizing:border-box}.cashier-menu .cashier-icon.deposit{background:#ff4654;border-color:#ff4654}.cashier-menu .cashier-icon.transfer{font-size:28px}.cashier-menu .cashier-icon.withdraw{font-size:31px}@media(max-width:480px){.cashier-menu{right:0;width:min(94vw,370px);padding:15px 7px 13px}.cashier-menu .cashier-icon{width:54px;height:54px}.cashier-menu button{font-size:12.5px;gap:6px}}.icon-btn{width:auto;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:var(--text);display:flex;align-items:center;justify-content:center;font-size:16px;cursor:pointer}.icon-btn:hover{background:transparent}.whatsapp-header{width:auto;height:auto;padding:0;border:0;border-radius:0;background:transparent;color:#25D366;display:flex;align-items:center;justify-content:center;cursor:pointer;text-decoration:none;line-height:0}.whatsapp-header:hover{background:transparent;color:#20bd5a}.whatsapp-header svg{width:20px;height:20px;display:block}.menu-trigger{width:auto;height:auto;padding:0;border:0;background:transparent;color:var(--text);font-size:22px;line-height:1;cursor:pointer}.menu-trigger:hover{background:transparent}.menu-popover{position:absolute;right:0;top:32px;z-index:80;width:160px;padding:6px;border:1px solid #294b78;background:#071936;border-radius:8px;box-shadow:0 18px 35px -12px #000}.menu-popover button{background:transparent;border:0;color:#fff}.ia-power{display:flex;align-items:center;justify-content:space-between;gap:12px}.ia-toggle{width:48px;height:28px;border:0;border-radius:999px;padding:3px;cursor:pointer;transition:.2s;background:#ff444f}.ia-toggle.on{background:#25D366}.ia-toggle span{display:block;width:22px;height:22px;border-radius:50%;background:#fff;transition:.2s;transform:translateX(0)}.ia-toggle.on span{transform:translateX(20px)}.ia-badge{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.closed-operations-label,.closed-operations-count{color:${light?'#64748b':'#94a3b8'}!important}.digits-title{font-size:11px;font-weight:900;text-transform:uppercase}.last-digit{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:900}`}</style><div className="av4">
 <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><img src="/icon.svg?v=2" width="40" height="40" className="rounded-xl object-cover" alt="MozHyper" /><div><b className="text-lg">Moz<span className="text-blue-500">Hyper</span></b><div className="text-[9px] uppercase muted">Negocia mais rápido</div></div></div><div className="header-actions"><div className="cashier-wrap"><button type="button" className="icon-btn" onClick={()=>setCashierOpen(v=>!v)} aria-label="Payment Agent" title="Payment Agent"><WalletIcon size={20} color={light?'#53627a':'#fff'} /></button>{cashierOpen&&<div className="cashier-menu"><button type="button" onClick={()=>{setCashierOpen(false);if(isPaymentAgentCurrencyAllowed(currency)){setCashierAction('deposit')}else{window.location.assign('https://deriv.com/')}}}><span className="cashier-icon deposit">＋</span><span>{t('deposit')}</span></button><button type="button" onClick={()=>{setCashierOpen(false);if(isPaymentAgentCurrencyAllowed(currency)){setCashierAction('withdraw')}else{window.location.assign('https://deriv.com/')}}}><span className="cashier-icon withdraw">−</span><span>{t('withdraw')}</span></button></div>}<PaymentAgentCashier open={cashierAction!==null && (cashierAction==='ai_analyst' || cashierAction==='course' || isPaymentAgentCurrencyAllowed(currency))} action={cashierAction} currency={currency} light={light} onClose={()=>{setCashierAction(null);void refreshAiAnalystAccess()}} onNotice={setNotice}/></div><a className="whatsapp-header" href="https://whatsapp.com/channel/0029Vb7xMatF1YlUQlYhH81t" target="_blank" rel="noopener" aria-label="Canal de suporte no WhatsApp" title="Canal de suporte no WhatsApp"><WhatsAppIcon size={20} color="#25d366" /></a><button className="icon-btn" onClick={()=>setTheme(theme==='dark'?'light':'dark')} aria-label="Alternar tema" title="Alternar tema claro/escuro">{theme==='dark'?'☀️':'🌙'}</button><button className="menu-trigger" onClick={()=>setMenu(!menu)} aria-label="Abrir menu">⋯</button>{menu&&<div className="menu-popover">{userName&&<div className="px-2 pb-2 pt-1 text-[11px] font-bold leading-5" style={{color:'#25D366'}}><div>{greeting}, {userName}</div><div className="mt-2 flex items-center gap-1 text-[10px] font-bold" style={{color:'#25D366'}}><span className="inline-block h-2 w-2 rounded-full bg-emerald-500"></span>{203+onlineUsers} online</div></div>}<div className="px-2 pb-1 pt-1 text-[10px] font-bold uppercase text-slate-400">Moeda</div><select className="w-full rounded-lg bg-slate-800 p-2 text-xs font-bold text-white" value={currency} onChange={e=>setCurrency(e.target.value as Currency)}>{currencyOptions.map(c=><option key={c} value={c}>{CURRENCY_LABELS[c]||getCurrencyMeta(c).symbol}</option>)}</select><button className="mt-1 w-full p-2 text-left text-xs" onClick={()=>{setMetas(true);setMenu(false)}}>{t('meta')}</button><button className="w-full p-2 text-left text-xs" onClick={()=>{setMenu(false);setCourseSection('course');setMozHyperCourse(true);void fetch('/api/course/access',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(data=>setCourseUnlocked(Boolean(data?.active))).catch(()=>undefined)}}>📚 {t('completeCourse')}</button><button className="w-full p-2 text-left text-xs" onClick={()=>{setTheme(theme==='dark'?'light':'dark');setMenu(false)}}>{t('theme')}</button><button className="w-full p-2 text-left text-xs font-semibold" onClick={()=>{setSupportOpen(true);setMenu(false)}}>MozHyper Support</button><button className="w-full p-2 text-left text-xs text-red-400" onClick={logout}>{t('logout')}</button></div>}</div></div>
 {supportOpen&&<div className="modal-backdrop" onClick={()=>setSupportOpen(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>{t('supportTitle')}</b><button type="button" onClick={()=>setSupportOpen(false)}>✕</button></div><div className="mt-2 text-[10px] muted">{t('supportChoose')}</div><div className="mt-4 grid gap-3"><a href="https://wa.me/258879084091" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-emerald-500 p-3 text-center text-sm font-bold text-white no-underline">WhatsApp</a><a href="https://t.me/Matosfx1" target="_blank" rel="noopener noreferrer" className="rounded-xl bg-blue-500 p-3 text-center text-sm font-bold text-white no-underline">Telegram</a></div></div></div>}<div className="mt-3 grid grid-cols-2 gap-3"><div className="balance-card p-4"><div className="text-[10px] uppercase muted">{t('balance')}</div><b className="text-lg" style={{color:light?'#0f172a':'#fff'}}>{balance&&Number.isFinite(Number(balance.balance))?`${(Number(balance.balance)*CURRENCY_RATES[currency]).toFixed(2)} ${CURRENCY_LABELS[currency]}`:'—'}</b></div><div className="profit-card p-4"><div className="text-[10px] uppercase muted">{t('profitLoss')}</div><b className={`text-lg ${pnl>=0?'text-emerald-500':'text-red-500'}`}>{money(pnl,currency)}</b><div className="mt-1 text-[10px] font-bold muted"><span className="closed-operations-label">{t('closedOperations')}:</span> <span className="closed-operations-count">{closedOperations}</span></div></div></div>
 <div className="account-strategy mt-3"><label className="p-3 text-xs">{t('account')}<select className="mt-1 w-full bg-transparent font-bold" value={account} onChange={e=>setAccount(e.target.value as 'demo'|'real')} disabled={running||smartAnalyzer}><option value="demo">{t('demo')}</option><option value="real">{t('real')}</option></select></label><label className="p-3 text-xs">{t('strategy')}<select className="mt-1 w-full bg-transparent font-bold" value={strategy} onChange={e=>{if(running||smartAnalyzer)return;botArmedRef.current=false;stopped.current=true;requested.current=false;requestStartedAt.current=0;setSignalNow(null);setStrategy(e.target.value as Strategy)}} disabled={running||smartAnalyzer}><option value="PAR_IMPAR">HyperDrive</option><option value="ACIMA5_BAIXO4">HyperStrike</option><option value="RISE_FALL">HyperForce</option><option value="DIFERENTE">HyperNova</option><option value="MATCH0">HyperFlow</option><option value="HYPERLITE">Hyperlite</option><option value="HYPERGUARD">HyperGuard</option><option value="HYPERSHIELD">HyperShield</option><option value="HYPERBREAK">HyperBreak</option><option value="HYPERSWAP">HyperSwap</option></select></label></div>
 <div className="card mt-3 p-3"><div className="flex items-center justify-between gap-2"><div className="shrink-0"><div className="digits-title">{t('digitLabel')}: <span className="last-digit" style={{color:'#ff444f'}}>{lastDigitSeen??'—'}</span></div></div><div className="min-w-0 flex-1 px-2 text-center"><span className="text-[9px] font-black uppercase tracking-[0.08em]" style={{color:!running?'#64748b':contractStage==='aberto'?'#64748b':contractStage==='fechado'?'var(--win)':'#ff444f'}}>{!running?t('stopped'):contractStage==='aberto'?t('contractOpen'):contractStage==='fechado'?t('contractClosedStage'):t('contractClosing')}</span></div><div className="flex shrink-0 items-center gap-1"><button type="button" className="rounded-lg border border-slate-300 px-2 py-1 text-[11px] font-bold" onClick={()=>setDigitView(v=>v==='bars'?'chart':'bars')} title={digitView==='bars'?'Ver gráfico':'Ver barras'} aria-label={digitView==='bars'?'Ver gráfico':'Ver barras'}>{digitView==='bars'?'⌁':'▥'}</button><select className="rounded-lg bg-transparent px-2 py-1 text-xs font-bold" value={tickWindow} onChange={e=>setTickWindow(Number(e.target.value))} disabled={running}>{[5,10,25,50,100,200].map(n=><option key={n} value={n}>{n} ticks</option>)}</select></div></div>{digitView==='bars'?<div className="digits-bars mt-1 md:mt-2 grid h-[130px] md:h-[142px] grid-cols-10 items-end gap-1">{(()=>{const hasDigitData=st.probs.some(p=>p>0),displayProbs=hasDigitData?st.probs:Array.from({length:10},()=>0),maxP=Math.max(...displayProbs,1),minP=Math.min(...displayProbs);return displayProbs.map((p,i)=>{const positiveProbs=displayProbs.filter(x=>x>0),minPositive=positiveProbs.length?Math.min(...positiveProbs):0,isMax=p===maxP,isMin=p>0&&p===minPositive,relativePercent=maxP>0?Math.round((p/maxP)*100):0;const barColor=isMax?'bg-emerald-500':isMin?'bg-red-500':'bg-slate-300';const percentColor=isMax?'text-emerald-600':isMin?'text-red-500':'muted';const barHeight=Math.max(14,Math.round((relativePercent/100)*116));return <div key={i} className="relative flex h-full flex-col items-center text-center"><div className={`absolute inset-x-0 top-0 text-[8px] font-bold ${percentColor}`}>{relativePercent}%</div><div className="flex min-h-0 flex-1 w-full items-end justify-center pb-4 pt-4"><div className={`mx-auto rounded-sm ${barColor}`} style={{height:`${barHeight}px`,width:'8px'}}/></div><div className="absolute inset-x-0 bottom-0 text-[8px] muted">{i}</div></div>})})()}</div>:<div className="mt-1 md:mt-2 h-[130px] md:h-[142px] -mx-3 w-[calc(100%+1.5rem)] rounded-xl border p-3" style={{background:light?'#f8fafc':'#020617',borderColor:light?'#cbd5e1':'#334155'}}><div className="mb-2 flex items-center justify-between text-[8px] font-bold" style={{color:light?'#475569':'#94a3b8'}}><span>{SYMBOLS[symbol]}</span><span>{tick?.quote??'—'}</span></div><div className="flex h-[104px] min-w-0 gap-1"><div className="relative min-w-0 flex-1"><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full"><line x1="0" y1="25" x2="100" y2="25" stroke={light?'rgba(100,116,139,.25)':'rgba(148,163,184,.16)'} strokeWidth=".6"/><line x1="0" y1="50" x2="100" y2="50" stroke={light?'rgba(100,116,139,.25)':'rgba(148,163,184,.16)'} strokeWidth=".6"/><line x1="0" y1="75" x2="100" y2="75" stroke={light?'rgba(100,116,139,.25)':'rgba(148,163,184,.16)'} strokeWidth=".6"/><polyline points={chartPoints||'0,50 100,50'} fill="none" stroke="#ef4444" strokeWidth="1.5" vectorEffect="non-scaling-stroke"/><circle cx="100" cy={chartLastY} r="2.2" fill="#ef4444" /><circle cx="100" cy={chartLastY} r="1.2" fill={light?'#f8fafc':'#0d2347'} /></svg><div className="pointer-events-none absolute left-full w-10 border-t-2 border-dashed" style={{top:String(chartLastY)+'%',borderColor:'var(--win)'}}></div></div><div className="relative flex h-full w-[36px] shrink-0 items-center justify-center"><div className="pointer-events-none absolute left-0 top-0 bottom-0 w-px" style={{background:light?'rgba(100,116,139,.18)':'rgba(148,163,184,.12)'}}></div><div className="absolute left-0 -translate-x-0 rounded-md px-1.5 py-1 text-[9px] font-black tabular-nums" style={{top:String(chartLastY)+'%',transform:'translateY(-50%)',background:'var(--win)',color:'#052e16',boxShadow:'0 0 8px rgba(52,211,153,.35)'}}>NR {lastDigitSeen??'—'}</div></div><div className="relative h-full w-4 shrink-0 py-[3px] text-[7px] font-bold tabular-nums" style={{color:'#ff444f'}}>{Array.from({length:10},(_,i)=>9-i).map(n=><span key={n} className="absolute right-0 leading-none" style={{top:String(8+(9-n)*(84/9))+'%',transform:'translateY(-50%)'}}>{n}</span>)}</div></div></div>}</div>
 <div ref={historyRef} className="card relative mt-3 p-4" style={{borderColor:'#facc15'}}><div className="flex items-center justify-between gap-2"><b className="text-[10px] uppercase muted">{t('recentHistory')}</b><div className="flex items-center gap-2"><button type="button" onClick={()=>setSoundEnabled(v=>{const next=!v;try{localStorage.setItem('mozhyper-sound-enabled',String(next))}catch{};return next})} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300/50 text-slate-500" title={soundEnabled?'Desligar som':'Ligar som'} aria-label={soundEnabled?'Desligar som':'Ligar som'}>{soundEnabled?'🔊':'🔇'}</button><button type="button" onClick={clearHistoryAndStartNewCycle} disabled={running} className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/70 text-red-500 disabled:cursor-not-allowed disabled:opacity-40" title="Limpar histórico e começar novo ciclo" aria-label="Limpar histórico e começar novo ciclo"><TrashIcon size={14} /></button><button type="button" onClick={()=>setHistoryOpen(v=>!v)} className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-300/50 text-slate-500" aria-label={t('dailyHistory')} title={t('dailyHistory')}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true" className={historyOpen?'rotate-180':''}><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></button></div></div>{historyOpen&&<div className="absolute right-3 top-14 z-[120] w-[min(92vw,360px)] max-h-[78vh] overflow-y-auto rounded-2xl border border-slate-300/40 bg-white p-4 text-slate-900 shadow-2xl dark:bg-slate-900 dark:text-white"><div className="flex items-center justify-between gap-3"><b className="text-xs uppercase tracking-wide">{t('dailyHistory')}</b><button type="button" onClick={()=>setHistoryOpen(false)} className="text-base muted" aria-label={t('close')}>✕</button></div><div className="mt-3"><label className="block text-[10px] font-bold uppercase muted">{t('selectDate')}</label><div className="mt-2 flex items-center gap-2"><input type="date" value={historyDate} onChange={e=>setHistoryDate(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300/60 bg-transparent px-3 py-2 text-xs font-bold" /><button type="button" onClick={()=>setHistoryDate(localDateValue())} className="shrink-0 rounded-xl border border-blue-500/40 px-3 py-2 text-[10px] font-black text-blue-500">{t('today')}</button></div></div><div className="mt-4 grid grid-cols-2 gap-2"><div className="rounded-xl border border-slate-300/40 p-3"><div className="text-[9px] font-bold uppercase muted">{t('totalProfitLoss')}</div><div className={dailyPnl>=0?'mt-1 text-base font-black text-emerald-500':'mt-1 text-base font-black text-red-500'}>{money(dailyPnl,currency)}</div></div><div className="rounded-xl border border-slate-300/40 p-3"><div className="text-[9px] font-bold uppercase muted">{t('closedOperations')}</div><div className="mt-1 text-base font-black">{dailyTransactions.length}</div><div className="mt-1 text-[9px] font-bold"><span className="text-emerald-500">WIN {dailyWins}</span><span className="mx-1 muted">/</span><span className="text-red-500">LOSS {dailyLosses}</span></div></div></div><div className="mt-4"><div className="mb-2 text-[10px] font-bold uppercase muted">{t('resultsByBot')}</div>{dailyByBot.length?dailyByBot.map(([bot,g])=><div key={bot} className="mb-2 rounded-xl border border-slate-300/40 p-3"><div className="flex items-center justify-between gap-2"><b className="text-xs">{bot}</b><b className={g.pnl>=0?'text-xs text-emerald-500':'text-xs text-red-500'}>{money(g.pnl,currency)}</b></div><div className="mt-1 text-[9px] muted">{g.count} · <span className="text-emerald-500">WIN {g.wins}</span> · <span className="text-red-500">LOSS {g.losses}</span></div></div>):<div className="rounded-xl border border-dashed border-slate-300/40 p-3 text-[10px] muted">{t('noTransactions')}</div>}</div><button type="button" onClick={()=>setHistoryOpen(false)} className="mt-3 w-full rounded-xl border border-slate-300/40 p-2.5 text-[10px] font-bold">{t('close')}</button></div>}<div className="hist mt-3">{profitTransactions.slice(0,12).map(x=>{const p=Number(x.profit_loss||0);return <div className="trade" key={x.contract_id}><div className={`mx-auto mb-2 h-7 w-3 rounded-sm ${p>=0?'bg-blue-500':'bg-red-500'}`}></div><b className={p>=0?'text-emerald-500':'text-red-500'}>{p>=0?t('win'):t('loss')}</b><div className="text-[8px] muted">{x.contract_type||'Trade'}</div><div className="font-mono text-xs">{money(p,currency)}</div></div>})}{!profitTransactions.length&&<div className="p-3 text-xs muted">{t('noTransactions')}</div>}</div></div>
 <button className={`mt-3 w-full rounded-xl p-4 font-bold text-white ${running?'bg-red-600':'bg-blue-600'}`} disabled={!isConnected||!isAuthorized} onClick={running?stop:start}>{running?`■ ${t('stop')}`:`▶ ${t('start')}`}</button>
 <div className="card mt-3 p-4" style={{borderColor:'#facc15'}}><div className="text-[10px] uppercase muted">{t('riskManagement')}</div><div className="mt-3 flex items-center justify-between"><button className={`h-9 w-9 rounded-lg ${light?"bg-slate-300 text-slate-700":"bg-slate-950 text-white"}`} disabled={running||smartAnalyzer} onClick={()=>setStake(x=>Math.max(IA_MIN_STAKE,Number((x-.1).toFixed(2))))}>−</button><b className="font-mono text-xl">${stake.toFixed(2)}</b><button className={`h-9 w-9 rounded-lg ${light?"bg-slate-300 text-slate-700":"bg-slate-950 text-white"}`} disabled={running||smartAnalyzer} onClick={()=>setStake(x=>Number((x+.1).toFixed(2)))}>+</button></div></div>
 <label className="card mt-3 block p-4 text-xs">{t('symbol')}<select className="mt-1 w-full bg-transparent font-bold" value={symbol} onChange={e=>setSymbol(e.target.value)} disabled={running||smartAnalyzer}>{Object.entries(SYMBOLS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
 <div className="card ia-power mt-3 p-4"><div><div className="ia-badge" style={{color:iaPower?'#25D366':(light?'#475569':'#94a3b8')}}>IA POWER</div></div><button className={`ia-toggle ${iaPower?'on':''}`} type="button" onClick={()=>togglePower(!iaPower)} disabled={running||smartAnalyzer} aria-label="Ativar ou desativar IA Power" title={running?'Pare o robô para alterar IA Power':'Alternar IA Power'}><span/></button></div>
 <div className="card ia-power mt-3 p-4"><div><div className="ia-badge" style={{color:sonic?'#25D366':(light?'#475569':'#94a3b8')}}>SONIC</div></div><button className={`ia-toggle ${sonic?'on':''}`} type="button" onClick={()=>toggleSonic(!sonic)} disabled={running||smartAnalyzer} aria-label="Ativar ou desativar Sonic" title={running?'Pare o robô para alterar Sonic':'Alternar SONIC'}><span/></button></div>
 {smartAnalyzer&&<><div className="card mt-3 p-4" style={{borderColor:smartAdvice?.earlyEntry?'#22c55e':smartAnalyzer?'#22c55e':'#cbd5e1'}}>
  <div className="flex items-center justify-between gap-2">
    <div>
      <div className="text-[10px] font-black uppercase tracking-wide">AI ANALYST</div>
      <div className="mt-1 text-[9px] muted">25 ticks · 5 blocos · detecção de subida antecipada</div>
    </div>
    {smartAdvice&&<div className="text-right">
      <div className="text-lg font-black">{Math.round(Number(smartAdvice.score)||0)}/100</div>
      <div className="text-[8px] font-bold muted">{smartAdvice.confidenceBand||'—'}</div>
    </div>}
  </div>
  {smartAnalyzer&&smartAdvice&&<div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">BOT</div><b className="text-[10px]">{smartAdvice.strategy}</b></div>
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">SINAL</div><b className="text-[10px]">{smartAdvice.label}</b></div>
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">FASE</div><b className="text-[10px]" style={{color:smartAdvice.earlyEntry?'#059669':undefined}}>{smartAdvice.phase||'—'}</b></div>
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">CONFIANÇA</div><b className="text-[10px]">{Math.round(smartAdvice.confidence||0)}%</b></div>
  </div>}
  {smartAnalyzer&&smartAdvice&&<div className="mt-2 rounded-lg border border-slate-300/30 p-2">
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-[8px] muted">QUALIDADE DO SINAL</div>
        <b className="text-[10px]" style={{color:smartAdvice.qualityBlocked?'#dc2626':'#059669'}}>
          {smartAdvice.qualityBlocked?'BLOQUEADO':'OPERACIONAL'}
        </b>
      </div>
      <div className="text-right">
        <div className="text-[8px] muted">PENALIZAÇÃO</div>
        <b className="text-[10px]">{Math.round(Number(smartAdvice.qualityPenalty)||0)} pts</b>
      </div>
    </div>
    {smartAdvice.qualityReason&&<div className="mt-1 text-[8px] muted">Motivo: {smartAdvice.qualityReason}</div>}
  </div>}
  {smartAnalyzer&&smartAdvice&&<div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">ESTABILIDADE</div><b className="text-[10px]">{Math.round(smartAdvice.stability||0)}%</b></div>
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">ENTRADA</div><b className="text-[10px]" style={{color:smartAdvice.earlyEntry?'#059669':undefined}}>{smartAdvice.earlyEntry?'ANTECIPADA':'NORMAL'}</b></div>
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">ACELERAÇÃO</div><b className="text-[10px]">{Math.round(Number(smartAdvice.acceleration)||0)}</b></div>
    <div className="rounded-lg border border-slate-300/30 p-2"><div className="text-[8px] muted">VANTAGEM</div><b className="text-[10px]">{Math.round(Number(smartAdvice.advantage)||0)} pts</b></div>
  </div>}
  {smartAnalyzer&&<div className="mt-3">
    <div className="mb-2 text-[8px] font-black uppercase muted">Ranking</div>
    <div className="space-y-1">{(smartAdvice?.rankings||[]).slice(0,3).map((x:any)=><div key={x.strategy+x.label} className="flex items-center justify-between rounded-lg border border-slate-300/20 px-2 py-1.5 text-[9px]"><span><b>{x.strategy}</b> · {x.label}</span><span className="font-black">{Math.round(x.score)}/100</span></div>)}</div>
  </div>}
  {smartAnalyzer&&analyzerHistory.length>0&&<div className="mt-3">
    <div className="mb-2 text-[8px] font-black uppercase muted">Histórico de decisões</div>
    <div className="max-h-32 space-y-1 overflow-y-auto">{analyzerHistory.slice(0,5).map((x:any,i:number)=><div key={i} className="text-[8px] muted">{x.time} · <b>{x.strategy}</b> {x.label} · {x.score}/100 → {x.action}</div>)}</div>
  </div>}
</div></>}<div className="card ia-power mt-3 p-4"><div><div className="ia-badge" style={{color:smartAnalyzer?'#25D366':(light?'#475569':'#94a3b8')}} >{t('analyzer100Ticks')}</div></div><button className={`ia-toggle ${smartAnalyzer?'on':''}`} type="button" onClick={()=>toggleAnalyzer(!smartAnalyzer)} aria-label={t('analyzer100Ticks')} title={smartAnalyzer?'Desligar AI Analyst':'Ligar AI Analyst — inicia automaticamente'}><span/></button></div>
 <div className="mt-2 flex justify-between text-[9px] muted"><span>{SYMBOLS[symbol]}</span><span>{isConnected&&isAuthorized?t('connected'):t('disconnected')}</span></div>
 {error&&<div className="mt-2 rounded-xl border border-red-800 bg-red-950 p-3 text-xs text-red-300">{error}</div>}
 {mozHyperCourse&&<div className="modal-backdrop" onClick={()=>setMozHyperCourse(false)}><div className="modal" style={{width:'min(94vw,560px)',maxHeight:'88vh',overflowY:'auto'}} onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>📚 {t('completeCourse')}</b><button onClick={()=>setMozHyperCourse(false)}>✕</button></div>{courseSection==='home'?<div className="mt-5 grid gap-3 sm:grid-cols-2"><button className="rounded-xl border border-blue-400/50 p-5 text-left" onClick={()=>setCourseSection('risk')}><div className="text-2xl">📊</div><b>{t('riskSheet')}</b><div className="mt-1 text-[10px] muted">{t('riskSheetDesc')}</div></button><button className="rounded-xl border border-emerald-400/50 p-5 text-left" onClick={()=>setCourseSection('course')}><div className="text-2xl">🎓</div><b>{t('course')}</b><div className="mt-1 text-[10px] muted">{t('courseDesc')}</div></button></div>:courseSection==='risk'?<div className="mt-4"><button className="text-xs font-bold text-blue-500" onClick={()=>setCourseSection('home')}>← {t('back')}</button><h3 className="mt-3 font-black">{t('riskSheetTitle')}</h3><div className="mt-3 grid gap-3"><label className="text-xs">{t('riskBalance')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="0" value={riskBalance} onChange={e=>setRiskBalance(Math.max(0,Number(e.target.value)))}/></label><label className="text-xs">{t('riskPerTrade')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="0" max="100" step="0.1" value={riskPercent} onChange={e=>setRiskPercent(Math.min(100,Math.max(0,Number(e.target.value))))}/></label><label className="text-xs">{t('numberTrades')}<input className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="1" value={riskTrades} onChange={e=>setRiskTrades(Math.max(1,Math.floor(Number(e.target.value)||1)))}/></label></div><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-slate-300/30 p-3"><div className="text-[9px] muted">{t('riskPerOperation')}</div><b>{(riskBalance*riskPercent/100).toFixed(2)}</b></div><div className="rounded-xl border border-slate-300/30 p-3"><div className="text-[9px] muted">{t('estimatedExposure')}</div><b>{(riskBalance*riskPercent/100*riskTrades).toFixed(2)}</b></div></div><div className="mt-3 rounded-xl border border-red-400/50 p-3 text-[10px] text-red-500">{t('riskWarning')}</div></div>:<div className="mt-4"><button className="text-xs font-bold text-blue-500" onClick={()=>setCourseSection('home')}>← {t('back')}</button><h3 className="mt-3 font-black">🎓 {t('courseMozHyper')}</h3>{!courseUnlocked?<div className="mt-4 rounded-xl border border-blue-400/50 p-4"><b className="text-sm">🔐 {t('accessCourse')}</b><div className="mt-1 text-[10px] muted">{t('accessDesc')}</div><input className="mt-3 w-full rounded-lg border border-slate-300/40 bg-transparent p-3 font-mono text-sm" placeholder="MozHyper-XXXXXXXX" value={courseCode} onChange={e=>setCourseCode(e.target.value)} autoComplete="off"/><button className="mt-2 w-full rounded-lg bg-blue-600 p-3 text-xs font-bold text-white disabled:opacity-50" disabled={courseUnlocking||!courseCode.trim()} onClick={async()=>{setCourseUnlocking(true);try{const r=await fetch('/api/course/unlock',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:courseCode})});const data=await r.json().catch(()=>null);if(data?.courseUnlocked){setCourseUnlocked(true);setNotice(t('unlockedNotice'))}else{setNotice(data?.error||t('invalidPassword'))}}catch{setNotice(t('validationError'))}finally{setCourseUnlocking(false)}}}>{courseUnlocking?t('validating'):t('validate')}</button><button className="mt-2 w-full rounded-lg border border-slate-300/30 p-3 text-xs font-bold" onClick={()=>{setMozHyperCourse(false);setCashierAction('course')}}>{`${t('buyCourse')} — ${currency === 'MZN' ? '999 MZN' : '15 USDT'}`}</button></div>:<><div className="mt-3 rounded-xl border border-emerald-400/50 p-4"><b className="text-sm text-emerald-500">✅ {t('unlocked')}</b><div className="mt-1 text-[10px] muted">{t('sessionAccess')}</div></div><div className="mt-3 grid gap-2">{[t('module1'),t('module2'),t('module3'),t('module4'),t('module5'),t('module6'),t('module7')].map(m=><div key={m} className="rounded-xl border border-slate-300/30 p-3"><b className="text-xs">{m}</b><div className="mt-1 text-[9px] muted">{t('courseContent')}</div></div>)}</div></>}</div>}</div></div>}{metas&&<div className="modal-backdrop" onClick={()=>setMetas(false)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="flex items-center justify-between"><b>{t('meta')}</b><button onClick={()=>setMetas(false)}>✕</button></div><label className="mt-4 block text-xs">{t('profit')} (US$)<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" step="0.01" min="0" value={target} onChange={e=>setTarget(Math.max(0,Number(e.target.value)))}/></label><label className="mt-3 block text-xs">{t('lossGoal')} (US$)<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" step="0.01" min="0" value={lossLimit} onChange={e=>setLossLimit(Math.max(0,Number(e.target.value)))}/></label><label className="mt-3 block text-xs">{t('maxMartingale')}<input className="mt-2 w-full rounded-lg border border-slate-600 bg-transparent p-2" type="number" min="1" max="20" step="1" value={maxMartingale} onChange={e=>setMaxMartingale(Math.min(20,Math.max(1,Math.floor(Number(e.target.value)||1))))}/><div className="mt-1 text-[9px] muted">{t('maxMartingaleHelp')}</div></label><button className="mt-4 w-full rounded-lg bg-blue-600 p-3 font-bold text-white" onClick={()=>setMetas(false)}>{t('save')}</button></div></div>}
 </div></div>
}