export type BoosterStrategy =
  | 'PAR_IMPAR'
  | 'ACIMA5_BAIXO4'
  | 'DIFERENTE'
  | 'HYPERLITE'
  | 'HYPERGUARD'
  | 'HYPERSHIELD'
  | 'HYPERBREAK'
  | 'HYPERSWAP';

export type BoosterCandidate = {
  symbol: string;
  strategy: BoosterStrategy;
  contractType: string;
  barrier: number;
  label: string;
  bot: string;
  payout: number;
  strength: number;
};

export const BOOSTER_SYMBOLS = [
  'R_10','R_25','R_50','R_75','R_100',
  '1HZ10V','1HZ25V','1HZ50V','1HZ75V','1HZ100V',
] as const;

export const BOOSTER_BOTS: Array<{
  strategy: BoosterStrategy;
  bot: string;
  contractType: string;
  barrier: number;
  label: string;
}> = [
  {strategy:'PAR_IMPAR',bot:'HyperDrive',contractType:'DIGITEVEN',barrier:0,label:'PAR'},
  {strategy:'PAR_IMPAR',bot:'HyperDrive',contractType:'DIGITODD',barrier:0,label:'ÍMPAR'},
  {strategy:'ACIMA5_BAIXO4',bot:'HyperStrike',contractType:'DIGITOVER',barrier:5,label:'ACIMA 5'},
  {strategy:'ACIMA5_BAIXO4',bot:'HyperStrike',contractType:'DIGITUNDER',barrier:4,label:'ABAIXO 4'},
  {strategy:'DIFERENTE',bot:'HyperNova',contractType:'DIGITDIFF',barrier:0,label:'DIFERENTE DE 0'},
  {strategy:'HYPERLITE',bot:'Hyperlite',contractType:'DIGITEVEN',barrier:0,label:'PAR'},
  {strategy:'HYPERGUARD',bot:'HyperGuard',contractType:'DIGITDIFF',barrier:0,label:'ACIMA 0'},
  {strategy:'HYPERSHIELD',bot:'HyperShield',contractType:'DIGITOVER',barrier:4,label:'ACIMA 4'},
  {strategy:'HYPERBREAK',bot:'HyperBreak',contractType:'DIGITUNDER',barrier:8,label:'ABAIXO 8'},
  {strategy:'HYPERSWAP',bot:'HyperSwap',contractType:'DIGITOVER',barrier:5,label:'ACIMA 5'},
];

export function boosterSignal(digits:number[], candidate:BoosterCandidate, threshold=65){
  if(digits.length<5) return false;
  const d=digits.slice(-5);
  const even=d.filter(x=>x%2===0).length/5*100;
  const odd=100-even;
  const over=d.filter(x=>x>5).length/5*100;
  const under=d.filter(x=>x<4).length/5*100;
  const diff=d.filter(x=>x!==0).length/5*100;
  const gt4=d.filter(x=>x>4).length/5*100;
  const lt8=d.filter(x=>x<8).length/5*100;
  switch(candidate.strategy){
    case 'PAR_IMPAR': return candidate.contractType==='DIGITEVEN'?even>=threshold:odd>=threshold;
    case 'ACIMA5_BAIXO4': return candidate.contractType==='DIGITOVER'?over>=threshold:under>=threshold;
    case 'DIFERENTE': return diff>=threshold;
    case 'HYPERLITE': return even>=threshold;
    case 'HYPERGUARD': return diff>=threshold;
    case 'HYPERSHIELD': return gt4>=threshold;
    case 'HYPERBREAK': return lt8>=threshold;
    case 'HYPERSWAP': return over>=threshold;
  }
}
export function boosterStrength(digits:number[], candidate:BoosterCandidate){
  const d=digits.slice(-5);
  if(d.length<5)return 0;
  const pct=(fn:(n:number)=>boolean)=>d.filter(fn).length/5*100;
  switch(candidate.strategy){
    case 'PAR_IMPAR': return candidate.contractType==='DIGITEVEN'?pct(n=>n%2===0):pct(n=>n%2!==0);
    case 'ACIMA5_BAIXO4': return candidate.contractType==='DIGITOVER'?pct(n=>n>5):pct(n=>n<4);
    case 'DIFERENTE': return pct(n=>n!==0);
    case 'HYPERLITE': return pct(n=>n%2===0);
    case 'HYPERGUARD': return pct(n=>n!==0);
    case 'HYPERSHIELD': return pct(n=>n>4);
    case 'HYPERBREAK': return pct(n=>n<8);
    case 'HYPERSWAP': return pct(n=>n>5);
  }
}
