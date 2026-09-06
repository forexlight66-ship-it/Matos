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
  let stakeBase = Math.max(0, Number(config.stakeBase) || 0);
  const payout = Math.max(0.0001, Number(config.payout) || 0.95);
  const requestedMax = Math.floor(Number(config.maxNiveisMartingale) || 7);
  const maxNiveisMartingale = Math.max(1, requestedMax === 5 ? 7 : requestedMax);

  let nivelSoros = 0;
  let stakeAtual = stakeBase;
  let lucroAcumuladoCicloSoros = 0;
  let emMartingale = false;
  let nivelMartingale = 0;
  let perdaAcumuladaMartingale = 0;
  let vezesEntrouMartingale = 0;
  let vezesEstourouMartingale = 0;

  const arredondarStake = (valor: number) => +Math.max(0, valor).toFixed(2);

  function proximoStake(): number {
    return arredondarStake(stakeAtual);
  }

  function resetTudo(): void {
    nivelSoros = 0;
    stakeAtual = stakeBase;
    lucroAcumuladoCicloSoros = 0;
    emMartingale = false;
    nivelMartingale = 0;
    perdaAcumuladaMartingale = 0;
  }

  function definirStakeBase(novaStake: number): void {
    const valor = Number(novaStake);
    if (!Number.isFinite(valor) || valor <= 0) return;
    stakeBase = arredondarStake(valor);
    resetTudo();
  }

  function registrarResultado(ganhou: boolean): void {
    // Resultado sempre é processado antes de calcular a próxima entrada.
    // Soros: somente WIN reinveste lucro. Qualquer LOSS sai do Soros.
    if (!emMartingale) {
      if (ganhou) {
        const lucro = stakeAtual * payout;
        lucroAcumuladoCicloSoros += lucro;

        if (nivelSoros < 2) {
          nivelSoros += 1;
          stakeAtual = arredondarStake(stakeBase + lucroAcumuladoCicloSoros);
        } else {
          // 3o WIN fecha o ciclo Soros e volta ao stake manual/base.
          resetTudo();
        }
      } else {
        // LOSS em qualquer nível Soros -> Martingale nível 1.
        emMartingale = true;
        nivelMartingale = 1;
        perdaAcumuladaMartingale = stakeAtual;
        vezesEntrouMartingale += 1;
        stakeAtual = arredondarStake((perdaAcumuladaMartingale + stakeBase) / payout);
      }
      return;
    }

    // Martingale: WIN recupera o ciclo e volta ao stake manual/base.
    if (ganhou) {
      resetTudo();
      return;
    }

    perdaAcumuladaMartingale += stakeAtual;

    if (nivelMartingale >= maxNiveisMartingale) {
      vezesEstourouMartingale += 1;
      resetTudo();
      return;
    }

    nivelMartingale += 1;
    stakeAtual = arredondarStake((perdaAcumuladaMartingale + stakeBase) / payout);
  }

  function getEstado(): EstadoGestorStake {
    return {
      nivelSoros,
      stakeAtual: arredondarStake(stakeAtual),
      emMartingale,
      nivelMartingale,
      lucroAcumuladoCicloSoros: +lucroAcumuladoCicloSoros.toFixed(2),
      perdaAcumuladaMartingale: +perdaAcumuladaMartingale.toFixed(2),
    };
  }

  function restaurarEstado(estado: Partial<EstadoGestorStake>): void {
    const nS=Math.max(0,Math.min(2,Math.floor(Number(estado.nivelSoros)||0)));
    const nM=Math.max(0,Math.min(maxNiveisMartingale,Math.floor(Number(estado.nivelMartingale)||0)));
    nivelSoros=nS; stakeAtual=arredondarStake(Number(estado.stakeAtual)>0?Number(estado.stakeAtual):stakeBase);
    emMartingale=Boolean(estado.emMartingale)&&nM>0; nivelMartingale=emMartingale?nM:0;
    lucroAcumuladoCicloSoros=Math.max(0,Number(estado.lucroAcumuladoCicloSoros)||0);
    perdaAcumuladaMartingale=Math.max(0,Number(estado.perdaAcumuladaMartingale)||0);
  }

  function getEstatisticas() {
    return { vezesEntrouMartingale, vezesEstourouMartingale };
  }

  return {
    proximoStake,
    registrarResultado,
    definirStakeBase,
    getEstado,
    getEstatisticas,
    resetTudo,
    restaurarEstado,
  };
}
