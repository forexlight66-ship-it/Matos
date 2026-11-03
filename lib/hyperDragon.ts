export type HyperDragonParity = 'EVEN' | 'ODD';
export type HyperDragonMode = 'OVER0' | HyperDragonParity;
export interface HyperDragonState {
  recoveryActive: boolean;
  parity: HyperDragonParity;
  deficit: number;
}
export interface HyperDragonSettlement {
  state: HyperDragonState;
  nextMode: 'OVER0' | HyperDragonParity;
  outcome: 'won' | 'lost';
  completed: boolean;
  requiredNetProfit: number;
  message: string;
}

/** Start each independent HyperDragon cycle with ACIMA 0 and no carried deficit. */
export const createHyperDragonState = (): HyperDragonState => ({
  recoveryActive: false,
  parity: 'EVEN',
  deficit: 0,
});

export const nextHyperDragonParity = (parity: HyperDragonParity): HyperDragonParity =>
  parity === 'EVEN' ? 'ODD' : 'EVEN';

/** Deriv profit_loss is net P/L. A recovery win only completes if it covers
 * the entire accumulated deficit plus the requested extra profit in one trade.
 */
export function settleHyperDragonTrade(
  current: HyperDragonState,
  mode: HyperDragonMode,
  netProfitLoss: number,
  extraProfit = 5,
): HyperDragonSettlement {
  const result = Number.isFinite(netProfitLoss) ? netProfitLoss : 0;
  const deficit = Math.max(0, Number(current.deficit) || 0);
  const lost = result < 0;
  if (mode === 'OVER0' && !current.recoveryActive) {
    if (lost) {
      const nextState = { recoveryActive: true, parity: 'EVEN' as const, deficit: money(deficit + Math.abs(result)) };
      return {
        state: nextState, nextMode: 'EVEN', outcome: 'lost', completed: false,
        requiredNetProfit: money(nextState.deficit + extraProfit),
        message: 'ACIMA 0 perdeu. Recuperação iniciada com PAR.',
      };
    }
    return {
      state: createHyperDragonState(), nextMode: 'OVER0', outcome: 'won', completed: false,
      requiredNetProfit: 0, message: 'ACIMA 0 ganhou. Próximo ciclo continua em ACIMA 0.',
    };
  }
  const parity = mode === 'EVEN' || mode === 'ODD' ? mode : current.parity;
  if (lost) {
    const nextParity = nextHyperDragonParity(parity);
    const nextState = { recoveryActive: true, parity: nextParity, deficit: money(deficit + Math.abs(result)) };
    return {
      state: nextState, nextMode: nextParity, outcome: 'lost', completed: false,
      requiredNetProfit: money(nextState.deficit + extraProfit),
      message: 'Recuperação perdeu. O défice aumentou; a próxima operação alterna para ' + (nextParity === 'EVEN' ? 'PAR.' : 'ÍMPAR.'),
    };
  }
  const target = money(deficit + extraProfit);
  if (result + 0.005 >= target) {
    return {
      state: createHyperDragonState(), nextMode: 'OVER0', outcome: 'won', completed: true,
      requiredNetProfit: target, message: 'Recuperação concluída: défice total coberto e lucro extra confirmado.',
    };
  }
  const nextParity = nextHyperDragonParity(parity);
  return {
    state: { recoveryActive: true, parity: nextParity, deficit },
    nextMode: nextParity, outcome: 'won', completed: false,
    requiredNetProfit: target,
    message: 'Vitória insuficiente. O défice integral mantém-se; a próxima operação alterna para ' + (nextParity === 'EVEN' ? 'PAR.' : 'ÍMPAR.'),
  };
}

export function hyperDragonStakeForTarget(targetNetProfit: number, ask: number, payout: number): number | null {
  if (!Number.isFinite(ask) || ask <= 0 || !Number.isFinite(payout) || payout <= ask) return null;
  const netRatio = (payout - ask) / ask;
  if (!Number.isFinite(targetNetProfit) || targetNetProfit <= 0 || netRatio <= 0) return null;
  return Math.max(0.35, Math.ceil((targetNetProfit / netRatio) * 100 - 1e-9) / 100);
}

function money(value: number): number {
  return Number(Math.max(0, value).toFixed(2));
}
