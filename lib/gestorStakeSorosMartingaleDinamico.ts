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
  const limiarLucro = () => stakeBase * multiplicadorLimiarLucro;
  const tetoAtivo = () => plAcumuladoSessao >= limiarLucro() ? nivelTetoProtegido : nivelTetoNormal;

  function proximoStake() { return arredondar(stakeAtual); }

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

  function registrarResultado(ganhou: boolean) {
    const resultadoFinanceiro = ganhou ? stakeAtual * payout : -stakeAtual;
    plAcumuladoSessao += resultadoFinanceiro;

    if (!emMartingale) {
      if (ganhou) {
        lucroAcumuladoCicloSoros += stakeAtual * payout;
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
        if (nivelSoros === 2) {
          emMartingale = true;
          nivelMartingaleAtual = 1;
          perdaAcumuladaMartingale = stakeAtual;
          vezesEntrouMartingale += 1;
          stakeAtual = arredondar((perdaAcumuladaMartingale + stakeBase) / payout);
        } else {
          resetCiclo();
        }
      }
      return;
    }

    if (ganhou) {
      resetCiclo();
      return;
    }

    perdaAcumuladaMartingale += stakeAtual;
    nivelMartingaleAtual += 1;
    const teto = tetoAtivo();

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
    };
  }

  function restaurarEstado(estado: Partial<EstadoGestorStakeDinamico>) {
    nivelSoros = Math.max(0, Math.min(2, Math.floor(Number(estado.nivelSoros) || 0)));
    stakeAtual = arredondar(Number(estado.stakeAtual) > 0 ? Number(estado.stakeAtual) : stakeBase);
    nivelMartingaleAtual = Math.max(0, Math.min(nivelTetoNormal, Math.floor(Number(estado.nivelMartingaleAtual) || 0)));
    emMartingale = Boolean(estado.emMartingale) && nivelMartingaleAtual > 0;
    plAcumuladoSessao = Number.isFinite(Number(estado.plAcumuladoSessao)) ? Number(estado.plAcumuladoSessao) : 0;
  }

  function getEstatisticas() { return { vezesEntrouMartingale, vezesEstourouTeto }; }

  return { proximoStake, registrarResultado, getEstado, getEstatisticas, resetSessao, restaurarEstado };
}

// Compatibilidade com o AutoBotV4 existente: IA Power passa a usar o teto dinâmico.
export function criarGestorStake(config: { stakeBase: number; payout: number; maxNiveisMartingale?: number }) {
  return criarGestorStakeDinamico({
    stakeBase: config.stakeBase,
    payout: config.payout,
    nivelTetoNormal: 7,
    nivelTetoProtegido: 1,
    multiplicadorLimiarLucro: 16,
  });
}
