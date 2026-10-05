// ============================================================================
// IA POWER — CICLO ÚNICO DE SOROS + MARTINGALE + DÉFICE FINANCEIRO REAL
//
// Regras:
// 1. O P/L REAL da operação é a única fonte de verdade.
// 2. WIN em Soros repete a stake REAL que venceu.
// 3. LOSS soma o valor perdido ao défice do ciclo.
// 4. Durante recuperação, WIN reduz somente o lucro REAL recebido.
// 5. Enquanto houver défice (> 0.01), o ciclo NÃO é reiniciado.
// 6. O teto Martingale limita o nível exibido, mas nunca encerra recuperação.
// 7. A recuperação usa défice / payout, com recuperação parcial limitada a $40 por operação.
// 8. O lucro acumulado da sessão nunca apaga o défice do ciclo.
// ============================================================================

export interface ConfigGestorStakeDinamico {
  stakeBase: number;
  payout: number;
  nivelTetoNormal: number;
  nivelTetoProtegido: number;
  multiplicadorLimiarLucro: number;
}

export interface EstadoGestorStakeDinamico {
  nivelSoros: number;
  stakeAtual: number;
  emMartingale: boolean;
  nivelMartingaleAtual: number;
  plAcumuladoSessao: number;
  tetoAtivoAgora: number;
  modo: 'NORMAL_7' | 'PROTEGIDO_1';
  lucroAcumuladoCicloSoros?: number;
  perdaAcumuladaMartingale?: number;
  deficitRecuperacao?: number;
  ultimaStakeExecutada?: number;
  payout?: number;
}

const MIN_STAKE = 0.35;
const MAX_RECOVERY_STAKE = 40;
const EPS = 0.01;

export function criarGestorStakeDinamico(config: ConfigGestorStakeDinamico) {
  const stakeBase = Math.max(MIN_STAKE, Number(config.stakeBase) || 0.75);
  let payout = Math.max(0.0001, Number(config.payout) || 0.95);

  const nivelTetoNormal = Math.max(
    1,
    Math.floor(Number(config.nivelTetoNormal) || 7),
  );
  const nivelTetoProtegido = Math.max(
    1,
    Math.floor(Number(config.nivelTetoProtegido) || 1),
  );
  const multiplicadorLimiarLucro = Math.max(
    0,
    Number(config.multiplicadorLimiarLucro) || 16,
  );

  const arredondar = (v: number) => Number(
    Math.max(0, Number.isFinite(v) ? v : 0).toFixed(2),
  );

  const limiarLucro = () => stakeBase * multiplicadorLimiarLucro;
  const tetoAtivo = () =>
    plAcumuladoSessao >= limiarLucro()
      ? nivelTetoProtegido
      : nivelTetoNormal;

  const stakeParaRecuperar = (deficit: number) => {
    const safeDeficit = Math.max(0, Number(deficit) || 0);
    const objetivo = safeDeficit;
    const stake = objetivo / Math.max(0.0001, payout);
    return Math.min(MAX_RECOVERY_STAKE, Math.ceil(stake * 100 - 1e-9) / 100);
  };

  let nivelSoros = 0;
  let stakeAtual = stakeBase;
  let lucroAcumuladoCicloSoros = 0;

  let emMartingale = false;
  let nivelMartingaleAtual = 0;
  let perdaAcumuladaMartingale = 0;
  let deficitRecuperacao = 0;

  let plAcumuladoSessao = 0;
  let vezesEntrouMartingale = 0;
  let vezesEstourouTeto = 0;
  let ultimaStakeExecutada = stakeBase;

  const proximoStake = () =>
    Math.max(MIN_STAKE, arredondar(stakeAtual));

  function atualizarPayout(novoPayout: number) {
    if (Number.isFinite(novoPayout) && novoPayout > 0) {
      payout = Number(novoPayout);
      if (deficitRecuperacao > EPS) {
        stakeAtual = stakeParaRecuperar(deficitRecuperacao);
      }
    }
  }

  function entrarMartingale(deficitInicial?: number) {
    const deficit = Math.max(
      EPS,
      Number(deficitInicial ?? deficitRecuperacao) || 0,
    );
    emMartingale = true;
    nivelSoros = 0;
    lucroAcumuladoCicloSoros = 0;
    deficitRecuperacao = arredondar(deficit);
    nivelMartingaleAtual = Math.min(
      Math.max(1, nivelMartingaleAtual || 1),
      nivelTetoNormal,
    );
    stakeAtual = Math.max(
      MIN_STAKE,
      arredondar(stakeParaRecuperar(deficitRecuperacao)),
    );
  }

  function resetCiclo() {
    nivelSoros = 0;
    stakeAtual = stakeBase;
    lucroAcumuladoCicloSoros = 0;
    emMartingale = false;
    nivelMartingaleAtual = 0;
    perdaAcumuladaMartingale = 0;
    deficitRecuperacao = 0;
    ultimaStakeExecutada = stakeBase;
  }

  function resetSessao() {
    plAcumuladoSessao = 0;
    resetCiclo();
  }

  function registrarResultado(
    resultado: boolean | number,
    stakeExecutada?: number,
  ): void {
    const resultadoNumerico =
      typeof resultado === 'number'
        ? (Number.isFinite(resultado) ? resultado : 0)
        : (resultado ? stakeAtual * payout : -stakeAtual);

    if (!Number.isFinite(resultadoNumerico) || Math.abs(resultadoNumerico) < 0.000001) {
      return;
    }

    const actualStake =
      Number.isFinite(Number(stakeExecutada)) && Number(stakeExecutada) > 0
        ? Math.max(MIN_STAKE, arredondar(Number(stakeExecutada)))
        : proximoStake();

    ultimaStakeExecutada = actualStake;
    plAcumuladoSessao = arredondar(plAcumuladoSessao + resultadoNumerico);

    if (emMartingale) {
      if (resultadoNumerico < 0) {
        const perda = Math.abs(resultadoNumerico);
        perdaAcumuladaMartingale = arredondar(
          perdaAcumuladaMartingale + perda,
        );
        deficitRecuperacao = arredondar(
          deficitRecuperacao + perda,
        );

        const teto = tetoAtivo();
        if (nivelMartingaleAtual < teto) {
          nivelMartingaleAtual += 1;
        } else {
          vezesEstourouTeto += 1;
          nivelMartingaleAtual = teto;
        }

        stakeAtual = Math.max(
          MIN_STAKE,
          arredondar(stakeParaRecuperar(deficitRecuperacao)),
        );
        return;
      }

      if (resultadoNumerico > 0) {
        deficitRecuperacao = arredondar(
          Math.max(0, deficitRecuperacao - resultadoNumerico),
        );

        if (deficitRecuperacao <= EPS) {
          resetCiclo();
          return;
        }

        const teto = tetoAtivo();
        if (nivelMartingaleAtual < teto) {
          nivelMartingaleAtual += 1;
        } else {
          nivelMartingaleAtual = teto;
        }

        stakeAtual = Math.max(
          MIN_STAKE,
          arredondar(stakeParaRecuperar(deficitRecuperacao)),
        );
        return;
      }

      return;
    }

    if (resultadoNumerico < 0) {
      const perda = Math.abs(resultadoNumerico);
      perdaAcumuladaMartingale = arredondar(
        perdaAcumuladaMartingale + perda,
      );
      deficitRecuperacao = arredondar(deficitRecuperacao + perda);
      vezesEntrouMartingale += 1;
      entrarMartingale(deficitRecuperacao);
      return;
    }

    if (resultadoNumerico > 0) {
      lucroAcumuladoCicloSoros = arredondar(
        lucroAcumuladoCicloSoros + resultadoNumerico,
      );

      if (deficitRecuperacao > EPS) {
        entrarMartingale(deficitRecuperacao);
        return;
      }

      if (nivelSoros === 0) {
        nivelSoros = 1;
        stakeAtual = actualStake;
      } else if (nivelSoros === 1) {
        nivelSoros = 2;
        stakeAtual = actualStake;
      } else {
        resetCiclo();
      }
    }
  }

  function getEstado(): EstadoGestorStakeDinamico {
    const teto = tetoAtivo();
    const protegido = plAcumuladoSessao >= limiarLucro();
    return {
      nivelSoros,
      stakeAtual: proximoStake(),
      emMartingale,
      nivelMartingaleAtual,
      plAcumuladoSessao: arredondar(plAcumuladoSessao),
      tetoAtivoAgora: teto,
      modo: protegido ? 'PROTEGIDO_1' : 'NORMAL_7',
      lucroAcumuladoCicloSoros: arredondar(lucroAcumuladoCicloSoros),
      perdaAcumuladaMartingale: arredondar(perdaAcumuladaMartingale),
      deficitRecuperacao: arredondar(deficitRecuperacao),
      ultimaStakeExecutada: arredondar(ultimaStakeExecutada),
      payout: Number(payout.toFixed(6)),
    };
  }

  function restaurarEstado(estado: Partial<EstadoGestorStakeDinamico>) {
    nivelSoros = Math.max(
      0,
      Math.min(2, Math.floor(Number(estado.nivelSoros) || 0)),
    );
    stakeAtual = Math.max(
      MIN_STAKE,
      arredondar(
        Number(estado.stakeAtual) > 0
          ? Number(estado.stakeAtual)
          : stakeBase,
      ),
    );
    nivelMartingaleAtual = Math.max(
      0,
      Math.min(
        nivelTetoNormal,
        Math.floor(Number(estado.nivelMartingaleAtual) || 0),
      ),
    );
    emMartingale = Boolean(estado.emMartingale);
    plAcumuladoSessao = Number.isFinite(Number(estado.plAcumuladoSessao))
      ? arredondar(Number(estado.plAcumuladoSessao))
      : 0;
    lucroAcumuladoCicloSoros = Math.max(
      0,
      arredondar(Number(estado.lucroAcumuladoCicloSoros) || 0),
    );
    perdaAcumuladaMartingale = Math.max(
      0,
      arredondar(Number(estado.perdaAcumuladaMartingale) || 0),
    );
    deficitRecuperacao = Math.max(
      0,
      arredondar(Number(estado.deficitRecuperacao) || 0),
    );
    ultimaStakeExecutada = Math.max(
      MIN_STAKE,
      arredondar(Number(estado.ultimaStakeExecutada) || stakeAtual),
    );
    if (Number.isFinite(Number(estado.payout)) && Number(estado.payout) > 0) {
      payout = Number(estado.payout);
    }

    if (deficitRecuperacao > EPS) {
      emMartingale = true;
      nivelMartingaleAtual = Math.min(
        Math.max(1, nivelMartingaleAtual || 1),
        nivelTetoNormal,
      );
      nivelSoros = 0;
      lucroAcumuladoCicloSoros = 0;
      stakeAtual = Math.max(
        MIN_STAKE,
        arredondar(stakeParaRecuperar(deficitRecuperacao)),
      );
      return;
    }

    if (!emMartingale) {
      nivelMartingaleAtual = 0;
      perdaAcumuladaMartingale = 0;
    } else {
      resetCiclo();
    }
  }

  function getEstatisticas() {
    return {
      vezesEntrouMartingale,
      vezesEstourouTeto,
      limiarLucro: arredondar(limiarLucro()),
      tetoNormal: nivelTetoNormal,
      tetoProtegido: nivelTetoProtegido,
      recuperacaoFinanceiraReal: true,
      martingaleContinuaEnquantoHouverDeficit: true,
      resetSomenteComDeficitZerado: true,
      sorosRepeteStakeVencedora: true,
    };
  }

  return {
    proximoStake,
    registrarResultado,
    getEstado,
    getEstatisticas,
    resetSessao,
    restaurarEstado,
    atualizarPayout,
  };
}

export function criarGestorStake(config: {
  stakeBase: number;
  payout: number;
  maxNiveisMartingale?: number;
}) {
  const maxLevel = Math.max(
    1,
    Math.min(20, Math.floor(Number(config.maxNiveisMartingale) || 7)),
  );

  return criarGestorStakeDinamico({
    stakeBase: config.stakeBase,
    payout: config.payout,
    nivelTetoNormal: maxLevel,
    nivelTetoProtegido: 1,
    multiplicadorLimiarLucro: 16,
  });
}
