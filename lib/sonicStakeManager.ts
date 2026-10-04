const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_MARTINGALE = 10;
const SONIC_LOSSES_TO_TRIGGER = 4;
const SONIC_CONFIRMATION_TRADES = 2;
const SONIC_SOROS_LEVELS = 3;

export interface SonicStakeState {
  baseStake: number;
  level: number;
  stake: number;
  maxLevel: number;
  minStake: number;
  consecutiveLosses: number;
  accumulationStake: number;
  inMartingale: boolean;
  confirmationWins: number;
  inSoros: boolean;
  sorosLevel: number;
  sorosStake: number;
  recoveryDeficit: number;
}

function clampBaseStake(value: number) {
  if (!Number.isFinite(value)) return SONIC_MIN_STAKE;
  return Math.max(SONIC_MIN_STAKE, value);
}

function normalizeLevel(level: number, maxLevel = SONIC_MAX_MARTINGALE) {
  if (!Number.isFinite(level)) return 0;
  return Math.min(maxLevel, Math.max(0, Math.floor(level)));
}

function roundStake(value: number) {
  return Number(Math.max(SONIC_MIN_STAKE, value).toFixed(2));
}

// Após 4 perdas consecutivas, a operação seguinte começa no acumulado 8x da stake base.
// A partir daí, cada nova perda dobra o valor acumulado até ao nível máximo M10.
export function calculateSonicAccumulation(baseStake: number, lossesToTrigger = SONIC_LOSSES_TO_TRIGGER) {
  const safeBase = clampBaseStake(baseStake);
  const steps = Math.max(0, Math.floor(lossesToTrigger) - 1);
  return roundStake(safeBase * Math.pow(2, steps));
}

export function calculateSonicStake(baseStake: number, state: Pick<SonicStakeState, 'inMartingale' | 'accumulationStake' | 'inSoros' | 'sorosStake'>) {
  if (state.inMartingale) return roundStake(state.accumulationStake);
  if (state.inSoros) return roundStake(state.sorosStake);
  return roundStake(baseStake);
}

export function createSonicStakeManager(input?: { baseStake?: number; maxLevel?: number }) {
  const baseStake = clampBaseStake(input?.baseStake ?? SONIC_MIN_STAKE);
  const maxLevel = Math.min(SONIC_MAX_MARTINGALE, Math.max(1, Math.floor(input?.maxLevel ?? SONIC_MAX_MARTINGALE)));

  let consecutiveLosses = 0;
  let level = 0;
  let inMartingale = false;
  let accumulationStake = calculateSonicAccumulation(baseStake);
  let confirmationWins = 0;
  let inSoros = false;
  let sorosLevel = 0;
  let sorosStake = roundStake(baseStake);
  let recoveryDeficit = 0;

  const getState = (): SonicStakeState => ({
    baseStake,
    level,
    stake: calculateSonicStake(baseStake, { inMartingale, accumulationStake, inSoros, sorosStake }),
    maxLevel,
    minStake: SONIC_MIN_STAKE,
    consecutiveLosses,
    accumulationStake,
    inMartingale,
    confirmationWins,
    inSoros,
    sorosLevel,
    sorosStake,
    recoveryDeficit,
  });

  const reset = () => {
    consecutiveLosses = 0;
    level = 0;
    inMartingale = false;
    accumulationStake = calculateSonicAccumulation(baseStake);
    confirmationWins = 0;
    inSoros = false;
    sorosLevel = 0;
    sorosStake = roundStake(baseStake);
    recoveryDeficit = 0;
    return getState();
  };

  const recordResult = (profitLoss: number) => {
    const pnl = Number(profitLoss);
    if (!Number.isFinite(pnl) || Math.abs(pnl) < 0.000001) return getState();
    const loss = pnl < 0;

    // O Sonic entra em Martingale após 4 perdas consecutivas.
    // O reset financeiro NÃO depende apenas do nível: enquanto existir
    // prejuízo a recuperar, o ciclo de recuperação continua ativo.
    if (!inMartingale) {
      if (loss) {
        inSoros = false;
        sorosLevel = 0;
        sorosStake = roundStake(baseStake);
        consecutiveLosses += 1;
        recoveryDeficit = Number((recoveryDeficit + Math.abs(pnl)).toFixed(2));

        if (consecutiveLosses >= SONIC_LOSSES_TO_TRIGGER) {
          inMartingale = true;
          level = SONIC_LOSSES_TO_TRIGGER;
          accumulationStake = calculateSonicAccumulation(baseStake);
          confirmationWins = 0;
        }
      } else {
        consecutiveLosses = 0;

        if (!inSoros) {
          inSoros = true;
          sorosLevel = 1;
          sorosStake = roundStake(baseStake);
        } else {
          sorosLevel += 1;
          if (sorosLevel >= SONIC_SOROS_LEVELS) return reset();
        }
      }
      return getState();
    }

    // Já estamos em Martingale: primeiro atualiza o valor que falta recuperar.
    if (loss) {
      confirmationWins = 0;
      recoveryDeficit = Number((recoveryDeficit + Math.abs(pnl)).toFixed(2));

      if (level < maxLevel) {
        level += 1;
        accumulationStake = roundStake(accumulationStake * 2);
      }
      // No nível máximo, NÃO faz reset. Mantém a última stake até recuperar.
      return getState();
    }

    // WIN no Martingale: desconta o lucro real do prejuízo acumulado.
    recoveryDeficit = Number(Math.max(0, recoveryDeficit - pnl).toFixed(2));

    // Só termina o Martingale quando a recuperação financeira foi concluída.
    if (recoveryDeficit <= 0) return reset();

    // Ainda há prejuízo: não resetar, não voltar para stake base.
    // Mantém a stake atual para continuar a recuperação.
    confirmationWins = 0;
    return getState();
  };

  return {
    getStake: () => getState().stake,
    getState,
    recordResult,
    recordWin: () => recordResult(1),
    recordLoss: () => recordResult(-1),
    reset,
    restore: (state?: Partial<SonicStakeState>) => {
      if (!state) return getState();
      consecutiveLosses = Math.max(0, Math.floor(Number(state.consecutiveLosses) || 0));
      level = normalizeLevel(Number(state.level), maxLevel);
      inMartingale = Boolean(state.inMartingale) || level >= SONIC_LOSSES_TO_TRIGGER;
      accumulationStake = roundStake(Number(state.accumulationStake) || calculateSonicAccumulation(baseStake));
      confirmationWins = Math.max(0, Math.floor(Number(state.confirmationWins) || 0));
      inSoros = Boolean(state.inSoros) && !inMartingale;
      sorosLevel = Math.max(0, Math.min(SONIC_SOROS_LEVELS - 1, Math.floor(Number(state.sorosLevel) || 0)));
      sorosStake = roundStake(Number(state.sorosStake) || baseStake);
      recoveryDeficit = Math.max(0, Number(state.recoveryDeficit) || 0);
      if (inSoros && sorosLevel <= 0) sorosLevel = 1;
      return getState();
    },
  };
}

export { SONIC_MIN_STAKE, SONIC_MAX_MARTINGALE as SONIC_MAX_LEVEL };
