const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_MARTINGALE = 11;
const SONIC_DEFAULT_PAYOUT = 0.95;
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
  sessionPnl: number;
  profitBuffer: number;
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
  return Number(
    Math.max(SONIC_MIN_STAKE, Math.ceil(value * 100 - 1e-9) / 100).toFixed(2),
  );
}

export function calculateSonicAccumulation(baseStake: number) {
  // Mantido apenas por compatibilidade com código antigo.
  // Sonic não usa mais multiplicação fixa (x2/x4/x8).
  return roundStake(clampBaseStake(baseStake));
}

export function calculateSonicStake(
  baseStake: number,
  state: Pick<SonicStakeState, 'inMartingale' | 'accumulationStake'>,
) {
  return state.inMartingale
    ? roundStake(state.accumulationStake)
    : roundStake(baseStake);
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

  let level = 0;
  let consecutiveLosses = 0;
  let inMartingale = false;
  let accumulationStake = roundStake(baseStake);
  let confirmationWins = 0;
  let recoveryDeficit = 0;
  let sessionPnl = 0;
  let lastExecutedStake = roundStake(baseStake);

  const stakeForRecovery = (deficit: number) => {
    const safeDeficit = Math.max(0, Number(deficit) || 0);
    return roundUpStake(safeDeficit / Math.max(0.0001, payout));
  };

  const syncRiskFromSessionPnl = () => {
    recoveryDeficit = roundMoney(Math.max(0, -sessionPnl));

    if (recoveryDeficit > EPS) {
      inMartingale = true;
      accumulationStake = stakeForRecovery(recoveryDeficit);
    } else {
      inMartingale = false;
      recoveryDeficit = 0;
      accumulationStake = roundStake(baseStake);
      level = 0;
      consecutiveLosses = 0;
      confirmationWins = 0;
    }
  };

  const atualizarPayout = (newPayout: number) => {
    if (Number.isFinite(newPayout) && newPayout > 0) {
      payout = Number(newPayout);
      if (recoveryDeficit > EPS) {
        accumulationStake = stakeForRecovery(recoveryDeficit);
      }
    }
    return getState();
  };

  const getState = (): SonicStakeState => {
    const deficit = roundMoney(Math.max(0, -sessionPnl));
    const profitBuffer = roundMoney(Math.max(0, sessionPnl));

    return {
      baseStake,
      level,
      stake: calculateSonicStake(baseStake, {
        inMartingale,
        accumulationStake,
      }),
      maxLevel,
      minStake: SONIC_MIN_STAKE,
      consecutiveLosses,
      accumulationStake,
      inMartingale,
      confirmationWins,
      // Sonic nunca usa Soros interno.
      inSoros: false,
      sorosLevel: 0,
      sorosStake: roundStake(baseStake),
      recoveryDeficit: deficit,
      payout,
      lastExecutedStake,
      sessionPnl: roundMoney(sessionPnl),
      profitBuffer,
    };
  };

  const reset = () => {
    level = 0;
    consecutiveLosses = 0;
    inMartingale = false;
    accumulationStake = roundStake(baseStake);
    confirmationWins = 0;
    recoveryDeficit = 0;
    sessionPnl = 0;
    lastExecutedStake = roundStake(baseStake);
    return getState();
  };

  /**
   * Sonic usa o P/L FINANCEIRO ACUMULADO como fonte única de verdade.
   *
   * Exemplo:
   *   -1 x 6  => sessão = -6
   *   +7      => sessão = +1 (défice zerado + colchão de +1)
   *   +1      => sessão = +2 (colchão de +2)
   *   -1      => sessão = +1 -> continua na stake base
   *   -1      => sessão =  0 -> continua na stake base
   *   -1      => sessão = -1 -> agora começa a recuperação
   *
   * O lucro acumulado não é apagado quando o défice é recuperado.
   * Um novo Martingale só nasce quando o P/L acumulado realmente volta abaixo de zero.
   */
  const recordResult = (profitLoss: number, executedStake?: number) => {
    const pnl = Number(profitLoss);
    if (!Number.isFinite(pnl) || Math.abs(pnl) < 0.000001) return getState();

    const actualStake =
      Number.isFinite(Number(executedStake)) && Number(executedStake) > 0
        ? roundStake(Number(executedStake))
        : getState().stake;

    lastExecutedStake = actualStake;
    sessionPnl = roundMoney(sessionPnl + pnl);

    if (pnl < 0) {
      consecutiveLosses += 1;
      confirmationWins = 0;
      if (recoveryDeficit <= EPS) {
        // Ainda existem lucros acumulados? Consome esse colchão primeiro.
        if (sessionPnl >= -EPS) {
          recoveryDeficit = 0;
          inMartingale = false;
          accumulationStake = roundStake(baseStake);
          level = 0;
          return getState();
        }

        inMartingale = true;
        level = Math.min(maxLevel, Math.max(1, level + 1));
      } else if (level < maxLevel) {
        level += 1;
      }

      syncRiskFromSessionPnl();
      if (inMartingale) {
        level = Math.min(maxLevel, Math.max(1, level));
      }
      return getState();
    }

    // WIN: o P/L positivo primeiro recupera o défice acumulado.
    // Qualquer excedente permanece como colchão financeiro.
    if (pnl > 0) {
      confirmationWins += 1;
      syncRiskFromSessionPnl();
      return getState();
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

      level = normalizeLevel(Number(state.level), maxLevel);
      consecutiveLosses = Math.max(
        0,
        Math.floor(Number(state.consecutiveLosses) || 0),
      );
      inMartingale = Boolean(state.inMartingale);
      accumulationStake = roundStake(
        Number(state.accumulationStake) || baseStake,
      );
      confirmationWins = Math.max(
        0,
        Math.floor(Number(state.confirmationWins) || 0),
      );
      recoveryDeficit = roundMoney(
        Math.max(0, Number(state.recoveryDeficit) || 0),
      );
      lastExecutedStake = roundStake(
        Number(state.lastExecutedStake) || baseStake,
      );
      sessionPnl = roundMoney(
        Number.isFinite(Number(state.sessionPnl))
          ? Number(state.sessionPnl)
          : -recoveryDeficit,
      );

      if (Number.isFinite(Number(state.payout)) && Number(state.payout) > 0) {
        payout = Number(state.payout);
      }

      syncRiskFromSessionPnl();

      if (inMartingale) {
        level = Math.min(
          maxLevel,
          Math.max(1, normalizeLevel(level, maxLevel)),
        );
      }

      return getState();
    },
  };
}

export { SONIC_MIN_STAKE, SONIC_MAX_MARTINGALE as SONIC_MAX_LEVEL };
