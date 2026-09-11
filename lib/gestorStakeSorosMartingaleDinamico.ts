// ============================================================================
// IA POWER — Soros Nível 2 + Martingale com TETO DINÂMICO RÍGIDO
//
// Regras do gestor:
// - Soros Nível 2: vitórias 0 -> 1 -> 2 -> reset ao ganhar no nível 2.
// - Perda no Soros Nível 2: entra SEMPRE no Martingale nível 1.
// - Cada perda no Martingale sobe 1 nível.
// - Teto NORMAL = 7 níveis.
// - Teto PROTEGIDO = 1 nível.
// - O teto protegido é ativado quando o P/L acumulado da sessão atinge
//   stakeBase x 16. Com stakeBase $0.75, o limiar é $12.00.
// - Enquanto o P/L estiver no limiar ou acima, o teto permanece em 1.
// - Quando o P/L voltar abaixo do limiar, o teto volta automaticamente para 7.
// - Perder no último nível permitido pelo teto reseta imediatamente para o
//   stake base e Soros nível 0. Nunca existe nível 8.
// - O gestor aceita tanto resultado financeiro real (number) quanto boolean,
//   preservando compatibilidade com o AutoBotV4.
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

  // TETOS RÍGIDOS: nunca permitir configuração acima de 7 ou diferente de 1.
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

  function limiarLucro(): number {
    return stakeBase * multiplicadorLimiarLucro;
  }

  // Avaliação dinâmica: cada resultado pode mudar imediatamente o teto.
  function tetoAtivo(): number {
    return plAcumuladoSessao >= limiarLucro()
      ? nivelTetoProtegido
      : nivelTetoNormal;
  }

  function proximoStake(): number {
    return arredondar(stakeAtual);
  }

  function resetCiclo(): void {
    nivelSoros = 0;
    stakeAtual = stakeBase;
    lucroAcumuladoCicloSoros = 0;
    emMartingale = false;
    nivelMartingaleAtual = 0;
    perdaAcumuladaMartingale = 0;
  }

  function resetSessao(): void {
    plAcumuladoSessao = 0;
    resetCiclo();
  }

  /**
   * Registra o resultado financeiro REAL da operação.
   * Ex.: +0.71, -0.75, +1.42, -2.21.
   * Também aceita boolean para compatibilidade.
   */
  function registrarResultado(resultado: boolean | number): void {
    const resultadoNumerico = typeof resultado === 'number'
      ? (Number.isFinite(resultado) ? resultado : 0)
      : (resultado ? stakeAtual * payout : -stakeAtual);

    const ganhou = resultadoNumerico >= 0;

    // O teto é baseado no P/L financeiro real acumulado da sessão.
    plAcumuladoSessao += resultadoNumerico;

    if (!emMartingale) {
      // ---------------- FASE SOROS ----------------
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
      } else {
        // Só uma perda no Soros nível 2 entra no Martingale.
        if (nivelSoros === 2) {
          emMartingale = true;
          nivelMartingaleAtual = 1;
          perdaAcumuladaMartingale = Math.abs(resultadoNumerico) > 0
            ? Math.abs(resultadoNumerico)
            : stakeAtual;
          vezesEntrouMartingale += 1;

          // Stake calculada para recuperar a perda + stake base no payout.
          stakeAtual = arredondar(
            (perdaAcumuladaMartingale + stakeBase) / payout
          );
        } else {
          // Perda no Soros nível 0 ou 1: reset simples.
          resetCiclo();
        }
      }

      return;
    }

    // ---------------- FASE MARTINGALE ----------------
    if (ganhou) {
      // Qualquer vitória no Martingale encerra o ciclo.
      resetCiclo();
      return;
    }

    perdaAcumuladaMartingale += Math.abs(resultadoNumerico) > 0
      ? Math.abs(resultadoNumerico)
      : stakeAtual;
    nivelMartingaleAtual += 1;

    const teto = tetoAtivo();

    // TETO RÍGIDO: ao atingir 7 (normal) ou 1 (protegido), reseta.
    // Portanto, nunca é criada uma próxima entrada acima do teto.
    if (nivelMartingaleAtual >= teto) {
      vezesEstourouTeto += 1;
      resetCiclo();
    } else {
      stakeAtual = arredondar(
        (perdaAcumuladaMartingale + stakeBase) / payout
      );
    }
  }

  function getEstado(): EstadoGestorStakeDinamico {
    const teto = tetoAtivo();

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

    // Mesmo restaurando estado salvo, nunca permitir nível > 7.
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

    // Se um estado antigo trouxer nível incompatível com o teto atual,
    // protege a banca imediatamente.
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
// IA Power usa SEMPRE teto normal 7 / teto protegido 1.
// maxNiveisMartingale é mantido na assinatura para não quebrar o AutoBotV4,
// mas não pode aumentar o teto rígido de segurança.
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
