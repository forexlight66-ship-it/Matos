import {
  CONTRATOS,
  gerarConfigPorProbabilidade,
  decidirEntradaPorProbabilidade,
  type ConfigEntrada,
  type TipoContrato,
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

const mapContract = (tipo: TipoContrato): RuntimeDecision['contract'] => {
  if (tipo === 'PAR') return 'EVEN';
  if (tipo === 'IMPAR') return 'ODD';
  if (tipo === 'OVER_5') return 'OVER';
  if (tipo === 'UNDER_4') return 'UNDER';
  if (tipo === 'OVER_4') return 'OVER';
  if (tipo === 'UNDER_5') return 'UNDER';
  return null;
};

const percentages = (digits: number[], predicate: (d: number) => boolean) => {
  const windows = [100, 25, 5].map((size) => digits.slice(-size));
  return windows.map((window) => {
    if (!window.length) return 0;
    return (window.filter(predicate).length / window.length) * 100;
  }) as [number, number, number];
};

/**
 * Fase 1: motor de análise separado da execução de ordens.
 * Mantém a execução atual do MozHyper intacta e permite validar a nova
 * estrutura 100/25/5 antes de ligá-la ao comprador Deriv.
 */
export function analisarEstrategia(
  digits: number[],
  strategy: RuntimeStrategy,
): RuntimeDecision {
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

  let tipo: TipoContrato;
  if (strategy === 'PAR_IMPAR') {
    const even = (d: number) => d % 2 === 0;
    const [p100, p25, p5] = percentages(clean, even);
    if (clean.length < 100) return { contract: null, label: null, strength: p25, p100, p25, p5, ready: false };
    const configEven = gerarConfigPorProbabilidade('PAR');
    const configOdd = gerarConfigPorProbabilidade('IMPAR');
    const evenDecision = decidirEntradaPorProbabilidade(clean, configEven);
    const oddDecision = decidirEntradaPorProbabilidade(clean, configOdd);
    if (evenDecision.decisao.startsWith('COMPRAR_')) return { contract: 'EVEN', label: 'PAR', strength: p25, p100, p25, p5, ready: true };
    if (oddDecision.decisao.startsWith('COMPRAR_')) return { contract: 'ODD', label: 'ÍMPAR', strength: 100 - p25, p100: 100 - p100, p25: 100 - p25, p5: 100 - p5, ready: true };
    return { contract: null, label: null, strength: Math.max(p100, 100 - p100), p100, p25, p5, ready: true };
  }

  if (strategy === 'ACIMA5_BAIXO4') {
    const [over100, over25, over5] = percentages(clean, (d) => d > 5);
    const configOver = gerarConfigPorProbabilidade('OVER_5');
    const configUnder = gerarConfigPorProbabilidade('UNDER_4');
    const over = decidirEntradaPorProbabilidade(clean, configOver);
    const under = decidirEntradaPorProbabilidade(clean, configUnder);
    const under100 = 100 - percentages(clean, (d) => d < 4)[0];
    if (clean.length < 100) return { contract: null, label: null, strength: over25, p100: over100, p25: over25, p5: over5, ready: false };
    if (over.decisao.startsWith('COMPRAR_')) return { contract: 'OVER', label: 'ACIMA 5', strength: over25, p100: over100, p25: over25, p5: over5, ready: true };
    const [u100, u25, u5] = percentages(clean, (d) => d < 4);
    if (under.decisao.startsWith('COMPRAR_')) return { contract: 'UNDER', label: 'ABAIXO 4', strength: u25, p100: u100, p25: u25, p5: u5, ready: true };
    return { contract: null, label: null, strength: Math.max(over25, u25), p100: Math.max(over100, u100), p25: Math.max(over25, u25), p5: Math.max(over5, u5), ready: true };
  }

  if (strategy === 'DIFERENTE') {
    tipo = 'OVER_3';
    const [p100, p25, p5] = percentages(clean, (d) => d !== 0);
    return p100 >= 55 && p25 >= 53 && p5 <= 35
      ? { contract: 'DIFFER', label: 'DIFERENTE DE 0', strength: p25, p100, p25, p5, ready: clean.length >= 100 }
      : { contract: null, label: null, strength: p100, p100, p25, p5, ready: clean.length >= 100 };
  }

  const [p100, p25, p5] = percentages(clean, (d) => d === 0);
  const nonZero = CONTRATOS.PAR;
  void nonZero;
  const maxOther = Math.max(...Array.from({ length: 9 }, (_, d) => percentages(clean, (x) => x === d + 1)[0]));
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
