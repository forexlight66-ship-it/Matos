const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_LEVEL = 20;

export interface SonicStakeState {
  baseStake: number;
  level: number;
  stake: number;
  maxLevel: number;
  minStake: number;
}

function clampBaseStake(value: number) {
  if (!Number.isFinite(value)) return SONIC_MIN_STAKE;
  return Math.max(SONIC_MIN_STAKE, value);
}

function normalizeLevel(level: number, maxLevel = SONIC_MAX_LEVEL) {
  if (!Number.isFinite(level)) return 0;
  return Math.min(maxLevel, Math.max(0, Math.floor(level)));
}

export function calculateSonicStake(baseStake: number, level: number, maxLevel = SONIC_MAX_LEVEL) {
  const safeBase = clampBaseStake(baseStake);
  const safeLevel = normalizeLevel(level, maxLevel);
  return Number((safeBase * Math.pow(2, safeLevel)).toFixed(2));
}

export function applySonicResult(state: SonicStakeState, profitLoss: number): SonicStakeState {
  const nextLevel = Number(profitLoss) < 0
    ? Math.min(state.maxLevel, state.level + 1)
    : 0;

  return {
    ...state,
    level: nextLevel,
    stake: calculateSonicStake(state.baseStake, nextLevel, state.maxLevel),
  };
}

export function createSonicStakeManager(input?: { baseStake?: number; maxLevel?: number }) {
  const baseStake = clampBaseStake(input?.baseStake ?? SONIC_MIN_STAKE);
  const maxLevel = Math.min(SONIC_MAX_LEVEL, Math.max(0, Math.floor(input?.maxLevel ?? SONIC_MAX_LEVEL)));
  let level = 0;

  const getState = (): SonicStakeState => ({
    baseStake,
    level,
    stake: calculateSonicStake(baseStake, level, maxLevel),
    maxLevel,
    minStake: SONIC_MIN_STAKE,
  });

  return {
    getStake: () => calculateSonicStake(baseStake, level, maxLevel),
    getState,
    recordResult: (profitLoss: number) => {
      level = Number(profitLoss) < 0
        ? Math.min(maxLevel, level + 1)
        : 0;
      return getState();
    },
    recordWin: () => {
      level = 0;
      return getState();
    },
    recordLoss: () => {
      level = Math.min(maxLevel, level + 1);
      return getState();
    },
    reset: () => {
      level = 0;
      return getState();
    },
    restore: (state?: Partial<SonicStakeState>) => {
      if (!state) return getState();
      level = normalizeLevel(Number(state.level), maxLevel);
      return getState();
    },
  };
}

export { SONIC_MIN_STAKE, SONIC_MAX_LEVEL };
