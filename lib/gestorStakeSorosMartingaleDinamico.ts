// ============================================================================
// IA POWER — SOROS NÍVEL 2 + MARTINGALE CONDICIONAL POR P/L
//
// REGRAS PRINCIPAIS
// - Soros normal: níveis 0 -> 1 -> 2 -> reset ao ganhar no nível 2.
// - QUALQUER perda com P/L acumulado da sessão <= 0 ativa Martingale.
//   Não é necessário estar no Soros nível 2.
// - Se o P/L da sessão estiver positivo (> 0), uma perda NÃO ativa Martingale;
//   o ciclo volta ao stake base/Soros nível 0.
// - Ao atingir P/L >= stakeBase x 16, o Martingale fica DESATIVADO.
//   A partir desse ponto o gestor usa SOMENTE SOROS.
// - Enquanto P/L >= stakeBase x 16, nenhuma perda pode iniciar Martingale.
// - Se posteriormente o P/L cair abaixo do limiar, o Martingale volta a ser
//   permitido em uma nova perda quando o P/L estiver <= 0.
// - TETO NORMAL DO MARTINGALE = 7 níveis.
// - TETO PROTEGIDO DO MARTINGALE = 1 nível.
// - Nunca existe nível 8.
// - Quando o Martingale atinge o teto ativo e perde novamente, reseta para
//   stake base/Soros nível 0.
// - Qualquer vitória durante Martingale encerra o Martingale e volta ao Soros
//   nível 0. Se essa vitória levar o P/L ao limiar x16, permanece somente Soros.
// - O gestor aceita resultado financeiro REAL (number) ou boolean.
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
}

export function criarGestorStakeDinamico(config: ConfigGestorStakeDinamico) {
  const stakeBase = Math.max(0, Number(config.stakeBase) || 0.75);
  const payout = Math.max(0.0001, Number(config.payout) || 0.95);

  // TETOS RÍGIDOS DE SEGURANÇA.
  // Os valores recebidos na configuração não podem aumentar esses limites.
  const nivelTetoNormal = 7;
  const nivelTetoProtegido = 1;
  const multiplicadorLimiarLucro = Math.max(
    0,
    Number(config.multiplicadorLimiarLucro) || 16
  );

  let nivelSoros = 0;
  let stakeAtual = stakeBase;
  let lucroAcumuladoCicloSoros = 0;

  let emMartingale = false;
  let nivelMartingaleAtual = 0;
  let perdaAcumuladaMartingale = 0;

  let plAcumuladoSessao = 0;

  let vezesEntrouMartingale = 0;
  let vezesEstourouTeto = 0;

  const arredondar = (v: number) => +Math.max(0, v).toFixed(2);

  // Ex.: $0.75 x 16 = $12.00.
  const limiarLucro = () => stakeBase * multiplicadorLimiarLucro;

  // O teto 1 é usado apenas quando o P/L já atingiu o limiar.
  // Porém, nesse estado o Martingale fica bloqueado de qualquer forma.
  const tetoAtivo = () =>
    plAcumuladoSessao >= limiarLucro()
      ? nivelTetoProtegido
      : nivelTetoNormal;

  // Regra central: Martingale só pode ser usado quando P/L <= 0.
  const martingalePermitido = () =>
    plAcumuladoSessao <= 0 && plAcumuladoSessao < limiarLucro();

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
  }

  function resetSessao() {
    plAcumuladoSessao = 0;
    resetCiclo();
  }

  /**
   * Registra o resultado financeiro REAL da operação.
   * Também aceita boolean para compatibilidade com versões antigas.
   */
  function registrarResultado(resultado: boolean | number): void {
    const resultadoNumerico = typeof resultado === 'number'
      ? (Number.isFinite(resultado) ? resultado : 0)
      : (resultado ? stakeAtual * payout : -stakeAtual);

    const ganhou = resultadoNumerico >= 0;

    // Atualiza primeiro: todas as decisões abaixo usam o P/L pós-operação.
    plAcumuladoSessao += resultadoNumerico;

    // ========================================================================
    // MARTINGALE JÁ ATIVO
    // ========================================================================
    if (emMartingale) {
      if (ganhou) {
        // Qualquer vitória encerra o Martingale.
        // Se o lucro chegou a stakeBase x 16, a próxima operação será somente
        // Soros porque martingalePermitido() ficará falso.
        resetCiclo();
        return;
      }

      // Perda durante Martingale.
      perdaAcumuladaMartingale += Math.abs(resultadoNumerico) > 0
        ? Math.abs(resultadoNumerico)
        : stakeAtual;
      nivelMartingaleAtual += 1;

      // Se o P/L ainda está <= 0, o Martingale continua permitido.
      // O teto é avaliado após o resultado financeiro desta operação.
      const teto = tetoAtivo();

      // TETO RÍGIDO: 7 no modo normal, 1 no protegido.
      // Nunca criar uma próxima entrada acima do teto.
      if (!martingalePermitido() || nivelMartingaleAtual >= teto) {
        vezesEstourouTeto++;
        resetCiclo();
      } else {
        stakeAtual = arredondar(
          (perdaAcumuladaMartingale + stakeBase) / payout
        );
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
        // Vitória no Soros nível 2 fecha o ciclo.
        resetCiclo();
      }

      // Ao atingir stakeBase x 16, não há nenhuma ativação de Martingale.
      // O próximo ciclo continua exclusivamente em Soros.
      return;
    }

    // ========================================================================
    // PERDA SEM MARTINGALE
    // ========================================================================
    // NOVA REGRA: qualquer perda com P/L <= 0 entra no Martingale,
    // independentemente do nível do Soros em que a perda aconteceu.
    if (martingalePermitido()) {
      emMartingale = true;
      nivelMartingaleAtual = 1;
      perdaAcumuladaMartingale = Math.abs(resultadoNumerico) > 0
        ? Math.abs(resultadoNumerico)
        : stakeAtual;
      vezesEntrouMartingale++;

      // Primeira stake do Martingale calcula recuperação da perda + stake base.
      stakeAtual = arredondar(
        (perdaAcumuladaMartingale + stakeBase) / payout
      );
    } else {
      // P/L > 0: não entra Martingale.
      // P/L >= stakeBase x 16: Martingale está explicitamente desativado.
      resetCiclo();
    }
  }

  function getEstado(): EstadoGestorStakeDinamico {
    const teto = tetoAtivo();
    const somenteSoros = plAcumuladoSessao >= limiarLucro();

    return {
      nivelSoros,
      stakeAtual: arredondar(stakeAtual),
      emMartingale,
      nivelMartingaleAtual,
      plAcumuladoSessao: arredondar(plAcumuladoSessao),
      tetoAtivoAgora: teto,
      modo: teto === nivelTetoProtegido ? 'PROTEGIDO_1' : 'NORMAL_7',
      lucroAcumuladoCicloSoros: arredondar(lucroAcumuladoCicloSoros),
      perdaAcumuladaMartingale: arredondar(perdaAcumuladaMartingale),
    };
  }

  function restaurarEstado(
    estado: Partial<EstadoGestorStakeDinamico>
  ): void {
    nivelSoros = Math.max(
      0,
      Math.min(2, Math.floor(Number(estado.nivelSoros) || 0))
    );

    stakeAtual = arredondar(
      Number(estado.stakeAtual) > 0
        ? Number(estado.stakeAtual)
        : stakeBase
    );

    nivelMartingaleAtual = Math.max(
      0,
      Math.min(7, Math.floor(Number(estado.nivelMartingaleAtual) || 0))
    );

    emMartingale = Boolean(estado.emMartingale) && nivelMartingaleAtual > 0;

    plAcumuladoSessao = Number.isFinite(Number(estado.plAcumuladoSessao))
      ? Number(estado.plAcumuladoSessao)
      : 0;

    lucroAcumuladoCicloSoros = Math.max(
      0,
      Number(estado.lucroAcumuladoCicloSoros) || 0
    );

    perdaAcumuladaMartingale = Math.max(
      0,
      Number(estado.perdaAcumuladaMartingale) || 0
    );

    // Segurança após restauração:
    // se o P/L não permite Martingale, força Soros/base.
    if (emMartingale && !martingalePermitido()) {
      resetCiclo();
    }

    // Nunca restaurar um nível que possa criar uma entrada acima do teto.
    if (emMartingale && nivelMartingaleAtual >= tetoAtivo()) {
      resetCiclo();
    }
  }

  function getEstatisticas() {
    return {
      vezesEntrouMartingale,
      vezesEstourouTeto,
      limiarLucro: arredondar(limiarLucro()),
      tetoNormal: 7,
      tetoProtegido: 1,
      martingaleAtivoSomenteComPLZeroOuNegativo: true,
      martingaleDesativadoNoLimiar16x: true,
    };
  }

  return {
    proximoStake,
    registrarResultado,
    getEstado,
    getEstatisticas,
    resetSessao,
    restaurarEstado,
  };
}

// ---------------------------------------------------------------------------
// COMPATIBILIDADE COM O AUTOBOTV4
// ---------------------------------------------------------------------------
// IA Power usa sempre os tetos rígidos 7/1 e limiar stakeBase x 16.
// maxNiveisMartingale permanece na assinatura para não quebrar o AutoBotV4,
// mas não pode aumentar o teto de segurança.
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
