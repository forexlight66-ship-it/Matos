const SONIC_MIN_STAKE = 0.35;
const SONIC_MAX_MARTINGALE = 11;
const SONIC_LOSSES_TO_TRIGGER = 4;
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
  // Compatibilidade com código antigo. Sonic não usa x2/x4/x8 fixo.
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

  const enterRecovery = () => {
    inMartingale = true;
    level = Math.min(
      maxLevel,
      Math.max(SONIC_LOSSES_TO_TRIGGER, consecutiveLosses),
    );
    recoveryDeficit = roundMoney(Math.max(0, -sessionPnl));
    accumulationStake = stakeForRecovery(recoveryDeficit);
    confirmationWins = 0;
  };

  const clearCycle = () => {
    level = 0;
    consecutiveLosses = 0;
    inMartingale = false;
    accumulationStake = roundStake(baseStake);
    confirmationWins = 0;
    recoveryDeficit = 0;
    sessionPnl = 0;
    lastExecutedStake = roundStake(baseStake);
  };

  const atualizarPayout = (newPayout: number) => {
    if (Number.isFinite(newPayout) && newPayout > 0) {
      payout = Number(newPayout);
      if (inMartingale && recoveryDeficit > EPS) {
        accumulationStake = stakeForRecovery(recoveryDeficit);
      }
    }
    return getState();
  };

  const getState = (): SonicStakeState => {
    // Invariant: Sonic só pode estar em recuperação a partir da 4ª
    // perda consecutiva. Isto também protege contra estados antigos
    // restaurados do localStorage.
    if (consecutiveLosses < SONIC_LOSSES_TO_TRIGGER) {
      inMartingale = false;
      recoveryDeficit = 0;
      accumulationStake = roundStake(baseStake);
      level = 0;
    }

    const visibleDeficit = inMartingale
      ? roundMoney(Math.max(0, -sessionPnl))
      : 0;

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
      // Sonic não usa Soros interno.
      inSoros: false,
      sorosLevel: 0,
      sorosStake: roundStake(baseStake),
      recoveryDeficit: visibleDeficit,
      payout,
      lastExecutedStake,
      sessionPnl: roundMoney(sessionPnl),
      profitBuffer: roundMoney(Math.max(0, sessionPnl)),
    };
  };

  const reset = () => {
    clearCycle();
    return getState();
  };

  /**
   * Regra Sonic:
   * 1ª, 2ª e 3ª perdas consecutivas: continua na stake base.
   * 4ª perda consecutiva: ativa recuperação.
   *
   * Depois do gatilho, a recuperação usa o défice financeiro REAL
   * acumulado no ciclo, e não uma multiplicação fixa.
   *
   * Exemplo:
   *   -1 -1 -1 -1 => recoveryDeficit = 4
   *   +3 => défice = 1, continua recuperação
   *   +1 => défice = 0, ciclo termina e volta à base
   *
   * Depois de recuperar totalmente, um novo ciclo começa do zero:
   * são necessárias novamente 4 perdas consecutivas para recuperar.
   *
   * Sonic não usa Soros interno.
   */
  const recordResult = (profitLoss: number, executedStake?: number) => {
    const pnl = Number(profitLoss);
    if (!Number.isFinite(pnl) || Math.abs(pnl) < 0.000001) {
      return getState();
    }

    const actualStake =
      Number.isFinite(Number(executedStake)) && Number(executedStake) > 0
        ? roundStake(Number(executedStake))
        : getState().stake;

    lastExecutedStake = actualStake;
    sessionPnl = roundMoney(sessionPnl + pnl);

    if (pnl < 0) {
      consecutiveLosses += 1;
      confirmationWins = 0;

      if (inMartingale) {
        recoveryDeficit = roundMoney(Math.max(0, -sessionPnl));
        if (level < maxLevel) level += 1;
        level = Math.min(maxLevel, Math.max(SONIC_LOSSES_TO_TRIGGER, level));
        accumulationStake = stakeForRecovery(recoveryDeficit);
        return getState();
      }

      // Antes do 4º loss, Sonic permanece obrigatoriamente na stake base.
      if (consecutiveLosses < SONIC_LOSSES_TO_TRIGGER) {
        accumulationStake = roundStake(baseStake);
        recoveryDeficit = 0;
        return getState();
      }

      // 4º loss: começa a recuperação financeira.
      enterRecovery();
      return getState();
    }

    if (pnl > 0) {
      if (inMartingale) {
        // O lucro real reduz diretamente o défice.
        recoveryDeficit = roundMoney(Math.max(0, -sessionPnl));
        confirmationWins += 1;

        if (recoveryDeficit <= EPS) {
          // Recuperação completa: encerra o ciclo.
          // O próximo ciclo volta a exigir 4 perdas consecutivas.
          clearCycle();
          return getState();
        }

        // Recuperação parcial: permanece em recovery.
        accumulationStake = stakeForRecovery(recoveryDeficit);
        return getState();
      }

      // Uma vitória fora da recuperação encerra a sequência de perdas.
      consecutiveLosses = 0;
      level = 0;
      accumulationStake = roundStake(baseStake);
      recoveryDeficit = 0;
      sessionPnl = 0;
      confirmationWins = 0;
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
          : inMartingale
            ? -recoveryDeficit
            : 0,
      );

      if (Number.isFinite(Number(state.payout)) && Number(state.payout) > 0) {
        payout = Number(state.payout);
      }

      // Nunca restaura recovery apenas porque existe défice salvo:
      // o estado de recuperação precisa ter sido efetivamente ativado.
      if (inMartingale && consecutiveLosses >= SONIC_LOSSES_TO_TRIGGER) {
        consecutiveLosses = Math.max(
          SONIC_LOSSES_TO_TRIGGER,
          consecutiveLosses,
        );
        recoveryDeficit = roundMoney(Math.max(0, -sessionPnl));
        if (recoveryDeficit > EPS) {
          accumulationStake = stakeForRecovery(recoveryDeficit);
          level = Math.min(
            maxLevel,
            Math.max(SONIC_LOSSES_TO_TRIGGER, level),
          );
        } else {
          clearCycle();
        }
      } else {
        // Estado antigo/inconsistente: nunca permitir recuperação antes
        // da 4ª perda consecutiva.
        inMartingale = false;
        recoveryDeficit = 0;
        accumulationStake = roundStake(baseStake);
        level = 0;
        sessionPnl = 0;
      }

      return getState();
    },
  };
}

export {
  SONIC_MIN_STAKE,
  SONIC_MAX_MARTINGALE as SONIC_MAX_LEVEL,
  SONIC_LOSSES_TO_TRIGGER,
};
