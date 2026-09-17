// ============================================================================
// IA POWER — SOROS + MARTINGALE COM RECUPERAÇÃO FINANCEIRA REAL
//
// A recuperação é baseada no P/L REAL do ciclo, não apenas em WIN/LOSS.
// Isso evita encerrar o Martingale quando uma vitória ainda deixou um
// défice financeiro por recuperar.
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
}

export function criarGestorStakeDinamico(config: ConfigGestorStakeDinamico) {
  const stakeBase = Math.max(0, Number(config.stakeBase) || 0.75);
  const payout = Math.max(0.0001, Number(config.payout) || 0.95);
  const nivelTetoNormal = 7;
  const nivelTetoProtegido = 1;
  const multiplicadorLimiarLucro = Math.max(0, Number(config.multiplicadorLimiarLucro) || 16);
  const EPS = 0.01;

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

  const arredondar = (v: number) => +Math.max(0, v).toFixed(2);
  const limiarLucro = () => stakeBase * multiplicadorLimiarLucro;
  const tetoAtivo = () => plAcumuladoSessao >= limiarLucro() ? nivelTetoProtegido : nivelTetoNormal;
  const martingalePermitido = () => plAcumuladoSessao < limiarLucro();

  // Calcula a stake necessária para recuperar TODO o défice financeiro
  // conhecido e ainda deixar pelo menos uma stakeBase de resultado positivo.
  const stakeParaRecuperar = (deficit: number) =>
    arredondar((Math.max(0, deficit) + stakeBase) / payout);

  function proximoStake() {
    return arredondar(stakeAtual);
  }

  function resetCiclo() {
    nivelSoros = 0;
    stakeAtual = stakeBase;
    lucroAcumuladoCicloSoros = 0;
    emMartingale = false;
    nivelMartingaleAtual = 0;
    perdaAcumuladaMartingale = 0;
    deficitRecuperacao = 0;
  }

  function resetSessao() {
    plAcumuladoSessao = 0;
    resetCiclo();
  }

  /** Registra o resultado financeiro REAL da operação. */
  function registrarResultado(resultado: boolean | number): void {
    const resultadoNumerico = typeof resultado === 'number'
      ? (Number.isFinite(resultado) ? resultado : 0)
      : (resultado ? stakeAtual * payout : -stakeAtual);

    const ganhou = resultadoNumerico > 0;
    plAcumuladoSessao += resultadoNumerico;

    // ========================================================================
    // MARTINGALE — RECUPERAÇÃO POR VALOR REAL
    // ========================================================================
    if (emMartingale) {
      if (resultadoNumerico < 0) {
        const perda = Math.abs(resultadoNumerico);
        perdaAcumuladaMartingale += perda;
        deficitRecuperacao += perda;
        nivelMartingaleAtual += 1;

        const teto = tetoAtivo();
        if (!martingalePermitido() || nivelMartingaleAtual >= teto) {
          vezesEstourouTeto++;
          resetCiclo();
        } else {
          stakeAtual = stakeParaRecuperar(deficitRecuperacao);
        }
        return;
      }

      if (ganhou) {
        // A vitória reduz o défice pelo LUCRO REAL recebido.
        // Se ainda existir défice, NÃO termina o Martingale.
        deficitRecuperacao = Math.max(0, deficitRecuperacao - resultadoNumerico);

        if (deficitRecuperacao <= EPS) {
          // Ciclo totalmente recuperado.
          resetCiclo();
        } else if (martingalePermitido()) {
          // Recuperação parcial: continua no Martingale com o valor restante.
          nivelMartingaleAtual += 1;
          if (nivelMartingaleAtual >= tetoAtivo()) {
            vezesEstourouTeto++;
            resetCiclo();
          } else {
            stakeAtual = stakeParaRecuperar(deficitRecuperacao);
          }
        } else {
          resetCiclo();
        }
        return;
      }

      // Resultado zero/empate não reduz o défice.
      if (martingalePermitido() && nivelMartingaleAtual < tetoAtivo()) {
        stakeAtual = stakeParaRecuperar(deficitRecuperacao);
      } else {
        resetCiclo();
      }
      return;
    }

    // ========================================================================
    // SOROS — SEM MARTINGALE ATIVO
    // ========================================================================
    if (ganhou) {
      lucroAcumuladoCicloSoros += resultadoNumerico;

      if (nivelSoros === 0) {
        nivelSoros = 1;
        stakeAtual = arredondar(stakeBase + lucroAcumuladoCicloSoros);
      } else if (nivelSoros === 1) {
        nivelSoros = 2;
        stakeAtual = arredondar(stakeBase + lucroAcumuladoCicloSoros);
      } else {
        resetCiclo();
      }
      return;
    }

    // ========================================================================
    // PRIMEIRA PERDA — INICIA RECUPERAÇÃO
    // ========================================================================
    if (resultadoNumerico < 0 && martingalePermitido()) {
      emMartingale = true;
      nivelMartingaleAtual = 1;
      const perda = Math.abs(resultadoNumerico);
      perdaAcumuladaMartingale = perda;
      deficitRecuperacao = perda;
      vezesEntrouMartingale++;
      stakeAtual = stakeParaRecuperar(deficitRecuperacao);
    } else {
      resetCiclo();
    }
  }

  function getEstado(): EstadoGestorStakeDinamico {
    return {
      nivelSoros,
      stakeAtual: arredondar(stakeAtual),
      emMartingale,
      nivelMartingaleAtual,
      plAcumuladoSessao: arredondar(plAcumuladoSessao),
      tetoAtivoAgora: tetoAtivo(),
      modo: tetoAtivo() === nivelTetoProtegido ? 'PROTEGIDO_1' : 'NORMAL_7',
      lucroAcumuladoCicloSoros: arredondar(lucroAcumuladoCicloSoros),
      perdaAcumuladaMartingale: arredondar(perdaAcumuladaMartingale),
      deficitRecuperacao: arredondar(deficitRecuperacao),
    };
  }

  function restaurarEstado(estado: Partial<EstadoGestorStakeDinamico>): void {
    nivelSoros = Math.max(0, Math.min(2, Math.floor(Number(estado.nivelSoros) || 0)));
    stakeAtual = arredondar(Number(estado.stakeAtual) > 0 ? Number(estado.stakeAtual) : stakeBase);
    nivelMartingaleAtual = Math.max(0, Math.min(7, Math.floor(Number(estado.nivelMartingaleAtual) || 0)));
    emMartingale = Boolean(estado.emMartingale) && nivelMartingaleAtual > 0;
    plAcumuladoSessao = Number.isFinite(Number(estado.plAcumuladoSessao)) ? Number(estado.plAcumuladoSessao) : 0;
    lucroAcumuladoCicloSoros = Math.max(0, Number(estado.lucroAcumuladoCicloSoros) || 0);
    perdaAcumuladaMartingale = Math.max(0, Number(estado.perdaAcumuladaMartingale) || 0);
    deficitRecuperacao = Math.max(0, Number(estado.deficitRecuperacao) || perdaAcumuladaMartingale);

    if (emMartingale && (!martingalePermitido() || nivelMartingaleAtual >= tetoAtivo())) resetCiclo();
  }

  function getEstatisticas() {
    return {
      vezesEntrouMartingale,
      vezesEstourouTeto,
      limiarLucro: arredondar(limiarLucro()),
      tetoNormal: 7,
      tetoProtegido: 1,
      recuperacaoFinanceiraReal: true,
      martingaleContinuaEnquantoHouverDeficit: true,
    };
  }

  return { proximoStake, registrarResultado, getEstado, getEstatisticas, resetSessao, restaurarEstado };
}

export function criarGestorStake(config: {
  stakeBase: number;
  payout: number;
  maxNiveisMartingale?: number;
}) {
  return criarGestorStakeDinamico({
    stakeBase: config.stakeBase,
    payout: config.payout,
    nivelTetoNormal: 7,
    nivelTetoProtegido: 1,
    multiplicadorLimiarLucro: 16,
  });
}
