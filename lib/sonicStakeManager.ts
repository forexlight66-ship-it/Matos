const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_MARTINGALE = 10;
const SONIC_LOSSES_TO_TRIGGER = 4;
const SONIC_CONFIRMATION_TRADES = 2;
const SONIC_SOROS_LEVELS = 3;
const SONIC_DEFAULT_PAYOUT = 0.95;
const SONIC_MAX_RECOVERY_STAKE = 40;
const EPS = 0.01;

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
  payout: number;
  lastExecutedStake: number;
}

function clampBaseStake(value: number) {
  if (!Number.isFinite(value)) return SONIC_MIN_STAKE;
  return Math.max(SONIC_MIN_STAKE, Number(value));
}

function normalizeLevel(level: number, maxLevel: number) {
  if (!Number.isFinite(level)) return 0;
  return Math.min(maxLevel, Math.max(0, Math.floor(level)));
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

function roundStake(value: number) {
  return Number(Math.max(SONIC_MIN_STAKE, value).toFixed(2));
}

function roundUpStake(value: number) {
  return Number(Math.max(SONIC_MIN_STAKE, Math.ceil(value * 100 - 1e-9) / 100).toFixed(2));
}

export function calculateSonicAccumulation(baseStake: number, lossesToTrigger = SONIC_LOSSES_TO_TRIGGER) {
  const safeBase = clampBaseStake(baseStake);
  const steps = Math.max(0, Math.floor(lossesToTrigger) - 1);
  return roundStake(safeBase * Math.pow(2, steps));
}

export function calculateSonicStake(
  baseStake: number,
  state: Pick<SonicStakeState, 'inMartingale' | 'accumulationStake' | 'inSoros' | 'sorosStake'>,
) {
  if (state.inMartingale) return roundStake(state.accumulationStake);
  if (state.inSoros) return roundStake(state.sorosStake);
  return roundStake(baseStake);
}

export function createSonicStakeManager(input?: {
  baseStake?: number;
  maxLevel?: number;
  payout?: number;
}) {
  const baseStake = clampBaseStake(input?.baseStake ?? SONIC_MIN_STAKE);
  let payout =
    Number.isFinite(Number(input?.payout)) && Number(input?.payout) > 0
      ? Number(input?.payout)
      : SONIC_DEFAULT_PAYOUT;
  const maxLevel = Math.min(
    SONIC_MAX_MARTINGALE,
    Math.max(1, Math.floor(input?.maxLevel ?? SONIC_MAX_MARTINGALE)),
  );

  let consecutiveLosses = 0;
  let level = 0;
  let inMartingale = false;
  let accumulationStake = calculateSonicAccumulation(baseStake);
  let confirmationWins = 0;
  let inSoros = false;
  let sorosLevel = 0;
  let sorosStake = roundStake(baseStake);
  let recoveryDeficit = 0;
  let lastExecutedStake = roundStake(baseStake);

  const stakeForRecovery = (deficit: number) => {
    const safeDeficit = Math.max(0, Number(deficit) || 0);
    // Recuperação parcial: calcula o necessário para o défice,
    // mas nunca expõe mais de $40 numa única operação.
    const objective = safeDeficit;
    return Math.min(
      SONIC_MAX_RECOVERY_STAKE,
      roundUpStake(objective / Math.max(0.0001, payout)),
    );
  };

  const enterMartingaleRecovery = () => {
    inMartingale = true;
    inSoros = false;
    sorosLevel = 0;
    sorosStake = roundStake(baseStake);
    confirmationWins = 0;
    level = Math.min(maxLevel, Math.max(1, Math.floor(level || SONIC_LOSSES_TO_TRIGGER)));
    accumulationStake = stakeForRecovery(recoveryDeficit);
  };

  const atualizarPayout = (newPayout: number) => {
    if (Number.isFinite(newPayout) && newPayout > 0) payout = Number(newPayout);
    if (recoveryDeficit > EPS) accumulationStake = stakeForRecovery(recoveryDeficit);
    return getState();
  };

  const getState = (): SonicStakeState => ({
    baseStake,
    level,
    stake: calculateSonicStake(baseStake, {
      inMartingale,
      accumulationStake,
      inSoros,
      sorosStake,
    }),
    maxLevel,
    minStake: SONIC_MIN_STAKE,
    consecutiveLosses,
    accumulationStake,
    inMartingale,
    confirmationWins,
    inSoros,
    sorosLevel,
    sorosStake,
    recoveryDeficit: roundMoney(recoveryDeficit),
    payout,
    lastExecutedStake,
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
    lastExecutedStake = roundStake(baseStake);
    return getState();
  };

  /**
   * Registra o P/L REAL e a stake REAL executada.
   *
   * Regras:
   * - WIN no Soros: a próxima operação repete exatamente a stake vencedora.
   * - LOSS: acrescenta o valor perdido ao défice do ciclo.
   * - WIN parcial durante recuperação: reduz apenas o P/L REAL recebido.
   * - Nunca reinicia um ciclo enquanto recoveryDeficit > 0.
   * - O teto Martingale limita o nível, nunca apaga o défice.
   */
  const recordResult = (profitLoss: number, executedStake?: number) => {
    const pnl = Number(profitLoss);
    if (!Number.isFinite(pnl) || Math.abs(pnl) < 0.000001) return getState();

    const actualStake =
      Number.isFinite(Number(executedStake)) && Number(executedStake) > 0
        ? roundStake(Number(executedStake))
        : getState().stake;
    lastExecutedStake = actualStake;

    if (pnl < 0) {
      const wasInSoros = inSoros;
      recoveryDeficit = roundMoney(recoveryDeficit + Math.abs(pnl));
      consecutiveLosses += 1;
      inSoros = false;
      sorosLevel = 0;
      sorosStake = roundStake(baseStake);

      if (!inMartingale) {
        // A sequência base mantém o gatilho tradicional de 4 perdas.
        // Uma perda ocorrida durante Soros, porém, quebra o Soros e entra
        // imediatamente em recuperação financeira.
        if (wasInSoros || consecutiveLosses >= SONIC_LOSSES_TO_TRIGGER) {
          enterMartingaleRecovery();
        } else {
          accumulationStake = calculateSonicAccumulation(baseStake);
        }
      } else {
        if (level < maxLevel) level += 1;
        level = Math.min(level, maxLevel);
        accumulationStake = stakeForRecovery(recoveryDeficit);
        confirmationWins = 0;
      }
      return getState();
    }

    // WIN recebido fora do Martingale pode reduzir um défice pendente.
    if (!inMartingale && recoveryDeficit > EPS) {
      recoveryDeficit = roundMoney(Math.max(0, recoveryDeficit - pnl));
      consecutiveLosses = 0;

      if (recoveryDeficit <= EPS) {
        // O ciclo foi totalmente recuperado; começa novo ciclo na base.
        return reset();
      }

      // Vitória parcial não apaga o défice: entra em recuperação imediatamente.
      enterMartingaleRecovery();
      accumulationStake = stakeForRecovery(recoveryDeficit);
      confirmationWins += 1;
      return getState();
    }

    if (inMartingale) {
      recoveryDeficit = roundMoney(Math.max(0, recoveryDeficit - pnl));

      if (recoveryDeficit <= EPS) {
        confirmationWins += 1;
        return reset();
      }

      if (level < maxLevel) level += 1;
      level = Math.min(level, maxLevel);
      accumulationStake = stakeForRecovery(recoveryDeficit);
      confirmationWins += 1;
      return getState();
    }

    // Sem défice: Soros repete exatamente a stake REAL que venceu.
    consecutiveLosses = 0;
    if (!inSoros) {
      inSoros = true;
      sorosLevel = 1;
      sorosStake = actualStake;
    } else {
      sorosLevel += 1;
      sorosStake = actualStake;
      if (sorosLevel >= SONIC_SOROS_LEVELS) return reset();
    }
    return getState();
  };

  return {
    getStake: () => getState().stake,
    getState,
    recordResult,
    recordWin: (executedStake?: number) => recordResult(1, executedStake),
    recordLoss: (executedStake?: number) => recordResult(-1, executedStake),
    reset,
    atualizarPayout,
    restore: (state?: Partial<SonicStakeState>) => {
      if (!state) return getState();

      consecutiveLosses = Math.max(0, Math.floor(Number(state.consecutiveLosses) || 0));
      level = normalizeLevel(Number(state.level), maxLevel);
      inMartingale = Boolean(state.inMartingale) || Number(state.recoveryDeficit) > EPS;
      accumulationStake = roundStake(
        Number(state.accumulationStake) || calculateSonicAccumulation(baseStake),
      );
      confirmationWins = Math.max(0, Math.floor(Number(state.confirmationWins) || 0));
      inSoros = Boolean(state.inSoros) && !inMartingale;
      sorosLevel = Math.max(
        0,
        Math.min(SONIC_SOROS_LEVELS - 1, Math.floor(Number(state.sorosLevel) || 0)),
      );
      sorosStake = roundStake(Number(state.sorosStake) || baseStake);
      recoveryDeficit = roundMoney(Math.max(0, Number(state.recoveryDeficit) || 0));
      lastExecutedStake = roundStake(Number(state.lastExecutedStake) || sorosStake || baseStake);

      if (
        Number.isFinite(Number(state.payout)) &&
        Number(state.payout) > 0
      ) {
        payout = Number(state.payout);
      }

      if (recoveryDeficit > EPS) {
        enterMartingaleRecovery();
        accumulationStake = stakeForRecovery(recoveryDeficit);
        level = Math.min(Math.max(SONIC_LOSSES_TO_TRIGGER, level || SONIC_LOSSES_TO_TRIGGER), maxLevel);
      } else if (inSoros && sorosLevel <= 0) {
        sorosLevel = 1;
      } else if (!inMartingale && !inSoros) {
        accumulationStake = calculateSonicAccumulation(baseStake);
      }

      return getState();
    },
  };
}

export { SONIC_MIN_STAKE, SONIC_MAX_MARTINGALE as SONIC_MAX_LEVEL, SONIC_CONFIRMATION_TRADES };
