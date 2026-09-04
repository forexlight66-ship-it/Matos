export interface EstadoGestorStake {
  nivelSoros: number;
  stakeAtual: number;
  emMartingale: boolean;
  nivelMartingale: number;
  lucroAcumuladoCicloSoros: number;
  perdaAcumuladaMartingale: number;
}

export interface ConfigGestorStake {
  stakeBase: number;
  payout: number;
  maxNiveisMartingale: number;
}

export function criarGestorStake(config: ConfigGestorStake) {
  const { stakeBase, payout, maxNiveisMartingale } = config;
  let nivelSoros = 0;
  let stakeAtual = stakeBase;
  let lucroAcumuladoCicloSoros = 0;
  let emMartingale = false;
  let nivelMartingale = 0;
  let perdaAcumuladaMartingale = 0;
  let vezesEntrouMartingale = 0;
  let vezesEstourouMartingale = 0;

  function proximoStake(): number {
    return +stakeAtual.toFixed(2);
  }

  function resetTudo(): void {
    nivelSoros = 0;
    stakeAtual = stakeBase;
    lucroAcumuladoCicloSoros = 0;
    emMartingale = false;
    nivelMartingale = 0;
    perdaAcumuladaMartingale = 0;
  }

  function registrarResultado(ganhou: boolean): void {
    if (!emMartingale) {
      // ---------------- Fase Soros ----------------
      if (ganhou) {
        const lucro = stakeAtual * payout;
        lucroAcumuladoCicloSoros += lucro;

        if (nivelSoros === 0) {
          nivelSoros = 1;
          stakeAtual = stakeBase + lucroAcumuladoCicloSoros;
        } else if (nivelSoros === 1) {
          nivelSoros = 2;
          stakeAtual = stakeBase + lucroAcumuladoCicloSoros;
        } else {
          // WIN no nível 2 -> ciclo Soros completo, volta ao stake base
          nivelSoros = 0;
          stakeAtual = stakeBase;
          lucroAcumuladoCicloSoros = 0;
        }
      } else {
        // QUALQUER LOSS durante o Soros ativa Martingale imediatamente.
        // Isto inclui loss no Soros nível 0, nível 1 ou nível 2.
        emMartingale = true;
        nivelMartingale = 1;
        perdaAcumuladaMartingale = stakeAtual;
        vezesEntrouMartingale++;

        // Próxima stake tenta recuperar a perda e ainda obter o lucro da stake base.
        stakeAtual = +((perdaAcumuladaMartingale + stakeBase) / payout).toFixed(2);
      }
    } else {
      // ---------------- Fase Martingale ----------------
      if (ganhou) {
        // Recuperou -> encerra o ciclo e volta ao Soros nível 0.
        resetTudo();
      } else {
        perdaAcumuladaMartingale += stakeAtual;
        nivelMartingale++;

        if (nivelMartingale >= maxNiveisMartingale) {
          // Atingiu o limite -> não aumenta mais a stake.
          vezesEstourouMartingale++;
          resetTudo();
        } else {
          stakeAtual = +((perdaAcumuladaMartingale + stakeBase) / payout).toFixed(2);
        }
      }
    }
  }

  function getEstado(): EstadoGestorStake {
    return {
      nivelSoros,
      stakeAtual: +stakeAtual.toFixed(2),
      emMartingale,
      nivelMartingale,
      lucroAcumuladoCicloSoros: +lucroAcumuladoCicloSoros.toFixed(2),
      perdaAcumuladaMartingale: +perdaAcumuladaMartingale.toFixed(2),
    };
  }

  function getEstatisticas() {
    return { vezesEntrouMartingale, vezesEstourouMartingale };
  }

  return { proximoStake, registrarResultado, getEstado, getEstatisticas, resetTudo };
}
