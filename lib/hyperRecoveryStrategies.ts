export type RecoveryStrategyId = 'HYPERGUARD' | 'HYPERSHIELD' | 'HYPERBREAK' | 'HYPERSWAP';

export interface BarrierState {
  contractType: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITDIFF';
  barrier: number;
  recovering: boolean;
}

export const RECOVERY_STRATEGY_IDS: RecoveryStrategyId[] = [
  'HYPERGUARD',
  'HYPERSHIELD',
  'HYPERBREAK',
  'HYPERSWAP',
];

export function isRecoveryStrategy(id: string): id is RecoveryStrategyId {
  return (RECOVERY_STRATEGY_IDS as string[]).includes(id);
}

export function initialBarrierState(id: RecoveryStrategyId): BarrierState {
  switch (id) {
    case 'HYPERGUARD':
      return { contractType: 'DIGITOVER', barrier: 0, recovering: false };
    case 'HYPERSHIELD':
      return { contractType: 'DIGITOVER', barrier: 4, recovering: false };
    case 'HYPERBREAK':
      return { contractType: 'DIGITUNDER', barrier: 8, recovering: false };
    case 'HYPERSWAP':
      return { contractType: 'DIGITDIFF', barrier: 0, recovering: false };
  }
}

function pickAdaptiveDigit(probs: number[], mode: 'differ' | 'under'): number {
  if (mode === 'differ') {
    let maxIdx = 0;
    for (let i = 1; i < 10; i++) {
      if (probs[i] > probs[maxIdx]) maxIdx = i;
    }
    return maxIdx;
  }

  let bestBarrier = 5;
  let bestCum = -1;
  for (let b = 1; b <= 9; b++) {
    const cum = probs.slice(0, b).reduce((a, c) => a + c, 0);
    if (cum > bestCum) {
      bestCum = cum;
      bestBarrier = b;
    }
  }
  return bestBarrier;
}

/** Chamar quando um contrato fecha, para saber qual é o próximo estado da estratégia. */
export function nextBarrierState(
  id: RecoveryStrategyId,
  prev: BarrierState,
  won: boolean,
  probs: number[],
): BarrierState {
  switch (id) {
    case 'HYPERGUARD':
      if (won) return { contractType: 'DIGITOVER', barrier: 0, recovering: false };
      return prev.recovering
        ? prev
        : { contractType: 'DIGITOVER', barrier: 3, recovering: true };
    case 'HYPERSHIELD':
      if (won) return { contractType: 'DIGITOVER', barrier: 4, recovering: false };
      return prev.recovering
        ? prev
        : { contractType: 'DIGITOVER', barrier: 2, recovering: true };
    case 'HYPERBREAK':
      if (won) return { contractType: 'DIGITUNDER', barrier: 8, recovering: false };
      return prev.recovering
        ? prev
        : { contractType: 'DIGITOVER', barrier: 3, recovering: true };
    case 'HYPERSWAP': {
      if (won) {
        const mode: 'differ' | 'under' = Math.random() < 0.5 ? 'differ' : 'under';
        return {
          contractType: mode === 'differ' ? 'DIGITDIFF' : 'DIGITUNDER',
          barrier: pickAdaptiveDigit(probs, mode),
          recovering: false,
        };
      }
      return { ...prev, recovering: true };
    }
  }
}
