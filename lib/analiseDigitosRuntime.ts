import {
  CONTRATOS,
  gerarConfigPorProbabilidade,
  decidirEntradaPorProbabilidade,
} from './analiseDigitos';

export type RuntimeStrategy =
  | 'PAR_IMPAR'
  | 'ACIMA5_BAIXO4'
  | 'RISE_FALL'
  | 'DIFERENTE'
  | 'MATCH0';

export interface RuntimeDecision {
  contract: 'EVEN' | 'ODD' | 'OVER' | 'UNDER' | 'RISE' | 'FALL' | 'DIFFER' | 'MATCH0' | null;
  label: string | null;
  strength: number;
  p100: number;
  p25: number;
  p5: number;
  ready: boolean;
}

const percentages = (digits: number[], predicate: (d: number) => boolean) => {
  const windows = [100, 25, 5].map((size) => digits.slice(-size));
  return windows.map((window) => window.length ? (window.filter(predicate).length / window.length) * 100 : 0) as [number, number, number];
};

/**
 * Fase 1: motor de análise separado da execução de ordens.
 * A execução atual do MozHyper permanece intacta enquanto a nova estrutura
 * 100/25/5 é validada.
 */
export function analisarEstrategia(digits: number[], strategy: RuntimeStrategy): RuntimeDecision {
  const clean = digits.filter((d) => Number.isFinite(d) && d >= 0 && d <= 9).map(Math.floor);
  if (clean.length < 5) {
    return { contract: null, label: null, strength: 0, p100: 0, p25: 0, p5: 0, ready: false };
  }

  if (strategy === 'RISE_FALL') {
    let up = 0;
    let down = 0;
    for (let i = 1; i < clean.length; i++) {
      if (clean[i] > clean[i - 1]) up++;
      else if (clean[i] < clean[i - 1]) down++;
    }
    const total = Math.max(1, up + down);
    const rise = (up / total) * 100;
    const fall = (down / total) * 100;
    return rise >= 45
      ? { contract: 'RISE', label: 'SUBIR', strength: rise, p100: rise, p25: rise, p5: rise, ready: clean.length >= 25 }
      : fall >= 45
        ? { contract: 'FALL', label: 'DESCER', strength: fall, p100: fall, p25: fall, p5: fall, ready: clean.length >= 25 }
        : { contract: null, label: null, strength: Math.max(rise, fall), p100: rise, p25: fall, p5: 0, ready: clean.length >= 25 };
  }

  if (strategy === 'PAR_IMPAR') {
    const [p100, p25, p5] = percentages(clean, (d) => d % 2 === 0);
    if (clean.length < 100) return { contract: null, label: null, strength: p25, p100, p25, p5, ready: false };
    const even = decidirEntradaPorProbabilidade(clean, gerarConfigPorProbabilidade('PAR'));
    const odd = decidirEntradaPorProbabilidade(clean, gerarConfigPorProbabilidade('IMPAR'));
    if (even.decisao.startsWith('COMPRAR_')) return { contract: 'EVEN', label: 'PAR', strength: p25, p100, p25, p5, ready: true };
    if (odd.decisao.startsWith('COMPRAR_')) return { contract: 'ODD', label: 'ÍMPAR', strength: 100 - p25, p100: 100 - p100, p25: 100 - p25, p5: 100 - p5, ready: true };
    return { contract: null, label: null, strength: Math.max(p100, 100 - p100), p100, p25, p5, ready: true };
  }

  if (strategy === 'ACIMA5_BAIXO4') {
    const [over100, over25, over5] = percentages(clean, (d) => d > 5);
    const [under100, under25, under5] = percentages(clean, (d) => d < 4);
    if (clean.length < 100) return { contract: null, label: null, strength: Math.max(over25, under25), p100: Math.max(over100, under100), p25: Math.max(over25, under25), p5: Math.max(over5, under5), ready: false };
    const over = decidirEntradaPorProbabilidade(clean, gerarConfigPorProbabilidade('OVER_5'));
    const under = decidirEntradaPorProbabilidade(clean, gerarConfigPorProbabilidade('UNDER_4'));
    if (over.decisao.startsWith('COMPRAR_')) return { contract: 'OVER', label: 'ACIMA 5', strength: over25, p100: over100, p25: over25, p5: over5, ready: true };
    if (under.decisao.startsWith('COMPRAR_')) return { contract: 'UNDER', label: 'ABAIXO 4', strength: under25, p100: under100, p25: under25, p5: under5, ready: true };
    return { contract: null, label: null, strength: Math.max(over25, under25), p100: Math.max(over100, under100), p25: Math.max(over25, under25), p5: Math.max(over5, under5), ready: true };
  }

  if (strategy === 'DIFERENTE') {
    const [p100, p25, p5] = percentages(clean, (d) => d !== 0);
    return p100 >= 55 && p25 >= 53 && p5 <= 35
      ? { contract: 'DIFFER', label: 'DIFERENTE DE 0', strength: p25, p100, p25, p5, ready: clean.length >= 100 }
      : { contract: null, label: null, strength: p100, p100, p25, p5, ready: clean.length >= 100 };
  }

  const [p100, p25, p5] = percentages(clean, (d) => d === 0);
  const maxOther = Math.max(...Array.from({ length: 9 }, (_, index) => percentages(clean, (d) => d === index + 1)[0]));
  return p100 >= 30 && p25 >= 30 && p5 >= 30 && p100 > maxOther
    ? { contract: 'MATCH0', label: 'MATCH 0', strength: p25, p100, p25, p5, ready: clean.length >= 100 }
    : { contract: null, label: null, strength: p100, p100, p25, p5, ready: clean.length >= 100 };
}

export const ANALYSIS_CONTRACTS = {
  PAR_IMPAR: ['PAR', 'IMPAR'] as const,
  ACIMA5_BAIXO4: ['OVER_5', 'UNDER_4'] as const,
  RISE_FALL: ['RISE', 'FALL'] as const,
  DIFERENTE: ['DIGITDIFF'] as const,
  MATCH0: ['DIGITMATCH'] as const,
};

void CONTRATOS;
