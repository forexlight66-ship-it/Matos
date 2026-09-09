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
  // Persistidos para o ciclo continuar corretamente após refresh/restart.
  lucroAcumuladoCicloSoros?: number;
  perdaAcumuladaMartingale?: number;
}

export function criarGestorStakeDinamico(config: ConfigGestorStakeDinamico) {
  const stakeBase = Math.max(0, Number(config.stakeBase) || 0.75);
  const payout = Math.max(0.0001, Number(config.payout) || 0.95);
  const nivelTetoNormal = Math.max(1, Math.floor(Number(config.nivelTetoNormal) || 7));
  const nivelTetoProtegido = Math.max(1, Math.floor(Number(config.nivelTetoProtegido) || 1));
  const multiplicadorLimiarLucro = Math.max(0, Number(config.multiplicadorLimiarLucro) || 16);

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

  // O limiar SEMPRE acompanha o stake definido no gestor de risco.
  // Ex.: 0.75 x 16 = 12; 1.00 x 16 = 16; 2.00 x 16 = 32.
  const limiarLucro = () => stakeBase * multiplicadorLimiarLucro;

  // Se o lucro acumulado atingir o limiar, protege no teto 1.
  // Se cair para abaixo do limiar, volta automaticamente ao teto normal 7.
  const tetoAtivo = () => plAcumuladoSessao >= limiarLucro() ? nivelTetoProtegido : nivelTetoNormal;

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
   * Aceita o resultado financeiro real da operação (ex.: +0.71 / -1.42).
   * Também aceita boolean para compatibilidade, usando stakeAtual/payout.
   */
  function registrarResultado(resultado: boolean | number) {
    const resultadoNumerico = typeof resultado === 'number'
      ? resultado
      : (resultado ? stakeAtual * payout : -stakeAtual);
    const ganhou = resultadoNumerico >= 0;

    // O modo protegido depende do P/L financeiro acumulado real da sessão.
    plAcumuladoSessao += resultadoNumerico;

    if (!emMartingale) {
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
      } else {
        // Perdeu no Soros nível 2: começa SEMPRE Martingale nível 1.
        if (nivelSoros === 2) {
          emMartingale = true;
          nivelMartingaleAtual = 1;
          perdaAcumuladaMartingale = Math.abs(resultadoNumerico) > 0 ? Math.abs(resultadoNumerico) : stakeAtual;
          vezesEntrouMartingale += 1;
          stakeAtual = arredondar((perdaAcumuladaMartingale + stakeBase) / payout);
        } else {
          resetCiclo();
        }
      }
      return;
    }

    if (ganhou) {
      // Qualquer win durante Martingale encerra o ciclo e volta ao stake base.
      resetCiclo();
      return;
    }

    perdaAcumuladaMartingale += Math.abs(resultadoNumerico) > 0 ? Math.abs(resultadoNumerico) : stakeAtual;
    nivelMartingaleAtual += 1;
    const teto = tetoAtivo();

    // No teto ativo, a próxima perda encerra o ciclo.
    if (nivelMartingaleAtual > teto) {
      vezesEstourouTeto += 1;
      resetCiclo();
    } else {
      stakeAtual = arredondar((perdaAcumuladaMartingale + stakeBase) / payout);
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

  function restaurarEstado(estado: Partial<EstadoGestorStakeDinamico>) {
    nivelSoros = Math.max(0, Math.min(2, Math.floor(Number(estado.nivelSoros) || 0)));
    stakeAtual = arredondar(Number(estado.stakeAtual) > 0 ? Number(estado.stakeAtual) : stakeBase);
    nivelMartingaleAtual = Math.max(0, Math.min(nivelTetoNormal, Math.floor(Number(estado.nivelMartingaleAtual) || 0)));
    emMartingale = Boolean(estado.emMartingale) && nivelMartingaleAtual > 0;
    plAcumuladoSessao = Number.isFinite(Number(estado.plAcumuladoSessao)) ? Number(estado.plAcumuladoSessao) : 0;
    lucroAcumuladoCicloSoros = Math.max(0, Number(estado.lucroAcumuladoCicloSoros) || 0);
    perdaAcumuladaMartingale = Math.max(0, Number(estado.perdaAcumuladaMartingale) || 0);
  }

  function getEstatisticas() {
    return { vezesEntrouMartingale, vezesEstourouTeto, limiarLucro: arredondar(limiarLucro()) };
  }

  return { proximoStake, registrarResultado, getEstado, getEstatisticas, resetSessao, restaurarEstado };
}

// Compatibilidade com o AutoBotV4: IA Power usa teto dinâmico 7/1.
export function criarGestorStake(config: { stakeBase: number; payout: number; maxNiveisMartingale?: number }) {
  return criarGestorStakeDinamico({
    stakeBase: config.stakeBase,
    payout: config.payout,
    nivelTetoNormal: 7,
    nivelTetoProtegido: 1,
    multiplicadorLimiarLucro: 16,
  });
}
