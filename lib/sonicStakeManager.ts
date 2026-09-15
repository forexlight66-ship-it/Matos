const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_MARTINGALE = 8;
const SONIC_LOSSES_TO_TRIGGER = 4;
const SONIC_CONFIRMATION_TRADES = 2;

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

export function calculateSonicAccumulation(baseStake: number, lossesToTrigger = SONIC_LOSSES_TO_TRIGGER) {
  const safeBase = clampBaseStake(baseStake);
  const steps = Math.max(0, Math.floor(lossesToTrigger) - 1);
  return roundStake(safeBase * Math.pow(2, steps));
}

export function calculateSonicStake(baseStake: number, state: Pick<SonicStakeState, 'inMartingale' | 'accumulationStake'>) {
  return state.inMartingale ? roundStake(state.accumulationStake) : roundStake(baseStake);
}

export function createSonicStakeManager(input?: { baseStake?: number; maxLevel?: number }) {
  const baseStake = clampBaseStake(input?.baseStake ?? SONIC_MIN_STAKE);
  const maxLevel = Math.min(SONIC_MAX_MARTINGALE, Math.max(1, Math.floor(input?.maxLevel ?? SONIC_MAX_MARTINGALE)));

  let consecutiveLosses = 0;
  let level = 0;
  let inMartingale = false;
  let accumulationStake = calculateSonicAccumulation(baseStake);
  let confirmationWins = 0;

  const getState = (): SonicStakeState => ({
    baseStake,
    level,
    stake: calculateSonicStake(baseStake, { inMartingale, accumulationStake }),
    maxLevel,
    minStake: SONIC_MIN_STAKE,
    consecutiveLosses,
    accumulationStake,
    inMartingale,
    confirmationWins,
  });

  const reset = () => {
    consecutiveLosses = 0;
    level = 0;
    inMartingale = false;
    accumulationStake = calculateSonicAccumulation(baseStake);
    confirmationWins = 0;
    return getState();
  };

  const recordResult = (profitLoss: number) => {
    const loss = Number(profitLoss) < 0;

    if (!inMartingale) {
      if (loss) {
        consecutiveLosses += 1;
        if (consecutiveLosses >= SONIC_LOSSES_TO_TRIGGER) {
          inMartingale = true;
          level = SONIC_LOSSES_TO_TRIGGER;
          accumulationStake = calculateSonicAccumulation(baseStake);
          confirmationWins = 0;
        }
      } else {
        consecutiveLosses = 0;
      }
      return getState();
    }

    if (loss) {
      if (level >= maxLevel) return reset();
      level = Math.min(maxLevel, level + 1);
      return getState();
    }

    if (level < maxLevel) {
      confirmationWins += 1;
      if (confirmationWins >= SONIC_CONFIRMATION_TRADES) return reset();
      return getState();
    }

    return reset();
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
      return getState();
    },
  };
}

export { SONIC_MIN_STAKE, SONIC_MAX_MARTINGALE as SONIC_MAX_LEVEL };
