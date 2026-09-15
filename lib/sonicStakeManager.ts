const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_STAKE = 10;
const SONIC_MAX_LEVEL = 20;

// Discrete ladder from the second Sonic stake system.
const SONIC_STAKES = [0.35, 0.50, 1.00, 1.50, 2.00, 2.50, 3.00, 3.50, 4.00, 4.50, 5.00, 5.50, 6.00, 6.50, 7.00, 7.50, 8.00, 8.50, 9.00, 9.50, 10.00] as const;

export interface SonicStakeState {
  baseStake: number;
  level: number;
  stake: number;
  maxLevel: number;
  minStake: number;
  maxStake: number;
}

function clampBaseStake(value: number) {
  if (!Number.isFinite(value)) return SONIC_MIN_STAKE;
  return Math.min(SONIC_MAX_STAKE, Math.max(SONIC_MIN_STAKE, value));
}

function ladderStake(value: number) {
  const safe = Math.min(SONIC_MAX_STAKE, Math.max(SONIC_MIN_STAKE, value));
  let selected = SONIC_STAKES[0];
  for (const item of SONIC_STAKES) {
    if (item <= safe) selected = item;
    else break;
  }
  return selected;
}

function normalizeLevel(level: number, maxLevel = SONIC_MAX_LEVEL) {
  if (!Number.isFinite(level)) return 0;
  return Math.min(maxLevel, Math.max(0, Math.floor(level)));
}

export function calculateSonicStake(baseStake: number, level: number, maxLevel = SONIC_MAX_LEVEL) {
  const safeBase = clampBaseStake(baseStake);
  const safeLevel = normalizeLevel(level, maxLevel);
  const doubled = safeBase * Math.pow(2, safeLevel);
  return ladderStake(Math.min(SONIC_MAX_STAKE, doubled));
}

/**
 * Pure result transition for the Sonic staking model.
 * Loss => next level. Win/break-even => reset to level 0.
 */
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

/**
 * Sonic combines the two stake systems supplied for the mode:
 * 1) base stake = max(0.35, stored stake) and loss => level + 1 / doubled stake;
 * 2) hard limits of 0.35..10 and a discrete stake ladder, capped at level 20.
 */
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
    maxStake: SONIC_MAX_STAKE,
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

export { SONIC_MIN_STAKE, SONIC_MAX_STAKE, SONIC_MAX_LEVEL, SONIC_STAKES };
