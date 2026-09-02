// ============================================================================
// analiseDigitos.ts
// Módulo de análise multi-tick + gestão de stake (Soros Nível 2) + backtest
// Para uso no MozHyper — Deriv digit contracts (Par/Ímpar, Over/Under)
//
// IMPORTANTE:
// - Este módulo NÃO cria vantagem estatística. Dígitos em índices sintéticos
//   são gerados de forma independente (i.i.d.). Usa isto para ORGANIZAR a
//   tua análise e gestão de risco — não como uma fonte de edge garantida.
// - Testa sempre primeiro em CONTA DEMO, com histórico real gravado, antes
//   de sequer considerar conta live.
// - Backtest com poucas centenas de operações é ruído estatístico, não sinal.
// ============================================================================

// ---------------------------------------------------------------------------
// 1. TIPOS
// ---------------------------------------------------------------------------

export type TipoContrato =
    | "PAR" | "IMPAR"
    | "OVER_4" | "UNDER_5"
    | "OVER_5" | "UNDER_4"
    | "OVER_3" | "UNDER_6";

export interface ConfigContrato {
    condicaoFn: (digito: number) => boolean;
    probBase: number; // probabilidade teórica em %
}

export interface ConfigEntrada {
    nome: string;
    tipoContrato: TipoContrato;
    probBase: number;
    min100: number;
    min25: number;
    max5: number;
}

export interface DecisaoEntrada {
    decisao: string;
    stats?: { p100: number; p25: number; p5: number };
}

export interface EstadoSoros {
    nivel: number;
    stakeAtual: number;
    lucroAcumuladoNoCiclo: number;
}

export interface ResultadoBacktest {
    config: ConfigEntrada;
    totalOperacoes: number;
    totalVitorias: number;
    taxaAcerto: number;
    saldoFinal: number;
    drawdownMaximo: number;
}

// ---------------------------------------------------------------------------
// 2. DEFINIÇÃO DOS CONTRATOS (confirma o payout real na Deriv antes de operar)
// ---------------------------------------------------------------------------

export const CONTRATOS: Record<TipoContrato, ConfigContrato> = {
    PAR:     { condicaoFn: d => d % 2 === 0, probBase: 50 },
    IMPAR:   { condicaoFn: d => d % 2 !== 0, probBase: 50 },
    OVER_4:  { condicaoFn: d => d > 4,       probBase: 50 }, // 5,6,7,8,9
    UNDER_5: { condicaoFn: d => d < 5,       probBase: 50 }, // 0,1,2,3,4
    OVER_5:  { condicaoFn: d => d > 5,       probBase: 40 }, // 6,7,8,9
    UNDER_4: { condicaoFn: d => d < 4,       probBase: 40 }, // 0,1,2,3
    OVER_3:  { condicaoFn: d => d > 3,       probBase: 60 }, // 4-9
    UNDER_6: { condicaoFn: d => d < 6,       probBase: 60 }, // 0-5
};

// ---------------------------------------------------------------------------
// 3. HISTÓRICO DE TICKS (buffer circular de tamanho fixo)
// ---------------------------------------------------------------------------

const TAMANHO_MAX_HISTORICO = 100;
export let historicoDigitos: number[] = [];

export function registrarNovoTick(digito: number): void {
    if (!Number.isFinite(digito) || digito < 0 || digito > 9) return;
    historicoDigitos.push(Math.floor(digito));
    if (historicoDigitos.length > TAMANHO_MAX_HISTORICO) {
        historicoDigitos.shift();
    }
}

export function limparHistoricoDigitos(): void {
    historicoDigitos = [];
}

// ---------------------------------------------------------------------------
// 4. GERAÇÃO DE CONFIG A PARTIR DA PROBABILIDADE DO CONTRATO
// ---------------------------------------------------------------------------

export function gerarConfigPorProbabilidade(
    tipoContrato: TipoContrato,
    desvioLongo: number = 5,
    desvioGatilho: number = 15
): ConfigEntrada {
    const contrato = CONTRATOS[tipoContrato];
    if (!contrato) throw new Error(`Contrato desconhecido: ${tipoContrato}`);

    return {
        nome: tipoContrato,
        tipoContrato,
        probBase: contrato.probBase,
        min100: contrato.probBase + desvioLongo,
        min25: contrato.probBase + Math.max(0, desvioLongo - 2),
        max5: contrato.probBase - desvioGatilho,
    };
}

// ---------------------------------------------------------------------------
// 5. ANÁLISE E DECISÃO (usa o buffer ao vivo — para o robô em execução)
// ---------------------------------------------------------------------------

function calcularPorcentagem(
    janela: number[],
    quantidadeTicks: number,
    condicaoFn: (d: number) => boolean
): number {
    const subLista = janela.slice(-quantidadeTicks);
    if (subLista.length === 0) return 0;
    const contagem = subLista.filter(condicaoFn).length;
    return (contagem / subLista.length) * 100;
}

export function decidirEntradaPorProbabilidade(
    janela: number[],
    config: ConfigEntrada
): DecisaoEntrada {
    if (janela.length < 100) return { decisao: "AGUARDAR_HISTORICO" };

    const contrato = CONTRATOS[config.tipoContrato];
    const p100 = calcularPorcentagem(janela, 100, contrato.condicaoFn);
    const p25 = calcularPorcentagem(janela, 25, contrato.condicaoFn);
    const p5 = calcularPorcentagem(janela, 5, contrato.condicaoFn);

    if (p100 >= config.min100 && p25 >= config.min25 && p5 <= config.max5) {
        return { decisao: `COMPRAR_${config.tipoContrato}`, stats: { p100, p25, p5 } };
    }
    return { decisao: "AGUARDAR_PROXIMO_TICK", stats: { p100, p25, p5 } };
}

// ---------------------------------------------------------------------------
// 6. GESTÃO DE STAKE — SOROS NÍVEL 2
// ---------------------------------------------------------------------------

export function criarGestorSoros(stakeBase: number) {
    const base = Math.max(0, Number(stakeBase) || 0);
    let nivel = 0;
    let stakeAtual = base;
    let lucroAcumuladoNoCiclo = 0;

    function proximoStake(): number {
        return stakeAtual;
    }

    function registrarResultado(ganhou: boolean, payoutMultiplicador: number = 0.95): void {
        if (ganhou) {
            const lucro = stakeAtual * payoutMultiplicador;
            lucroAcumuladoNoCiclo += lucro;

            if (nivel === 0) {
                nivel = 1;
                stakeAtual = base + lucroAcumuladoNoCiclo;
            } else if (nivel === 1) {
                nivel = 2;
                stakeAtual = base + lucroAcumuladoNoCiclo;
            } else {
                // nivel === 2 -> ciclo completo, reseta
                nivel = 0;
                stakeAtual = base;
                lucroAcumuladoNoCiclo = 0;
            }
        } else {
            // perdeu em qualquer nível -> reseta tudo (essencial para não virar Martingale disfarçado)
            nivel = 0;
            stakeAtual = base;
            lucroAcumuladoNoCiclo = 0;
        }
    }

    function getEstado(): EstadoSoros {
        return { nivel, stakeAtual, lucroAcumuladoNoCiclo };
    }

    return { proximoStake, registrarResultado, getEstado };
}

// ---------------------------------------------------------------------------
// 7. BACKTEST (roda contra histórico gravado, sem depender do buffer ao vivo)
// ---------------------------------------------------------------------------

export function rodarBacktestPorProbabilidade(
    historicoCompleto: number[],
    config: ConfigEntrada,
    stakeBase: number = 1,
    janelaMinima: number = 100,
    payoutMultiplicador: number = 0.95
): ResultadoBacktest {
    let saldo = 0;
    let saldoMaximo = 0;
    let drawdownMaximo = 0;
    let totalOperacoes = 0;
    let totalVitorias = 0;

    const soros = criarGestorSoros(stakeBase);
    const contrato = CONTRATOS[config.tipoContrato];

    for (let i = janelaMinima; i < historicoCompleto.length - 1; i++) {
        const janelaAtual = historicoCompleto.slice(0, i + 1);
        const decisao = decidirEntradaPorProbabilidade(janelaAtual, config);

        if (decisao.decisao === "AGUARDAR_PROXIMO_TICK" || decisao.decisao === "AGUARDAR_HISTORICO") {
            continue;
        }

        const stake = soros.proximoStake();
        const digitoResultado = historicoCompleto[i + 1];
        const ganhou = contrato.condicaoFn(digitoResultado);

        saldo += ganhou ? stake * payoutMultiplicador : -stake;
        totalOperacoes++;
        if (ganhou) totalVitorias++;
        soros.registrarResultado(ganhou, payoutMultiplicador);

        saldoMaximo = Math.max(saldoMaximo, saldo);
        drawdownMaximo = Math.max(drawdownMaximo, saldoMaximo - saldo);
    }

    return {
        config,
        totalOperacoes,
        totalVitorias,
        taxaAcerto: totalOperacoes > 0 ? +((totalVitorias / totalOperacoes) * 100).toFixed(2) : 0,
        saldoFinal: +saldo.toFixed(2),
        drawdownMaximo: +drawdownMaximo.toFixed(2),
    };
}

export function compararThresholds(
    historicoCompleto: number[],
    listaDeConfigs: ConfigEntrada[],
    stakeBase: number = 1,
    janelaMinima: number = 100,
    payoutMultiplicador: number = 0.95
): ResultadoBacktest[] {
    return listaDeConfigs
        .map(config => rodarBacktestPorProbabilidade(historicoCompleto, config, stakeBase, janelaMinima, payoutMultiplicador))
        .sort((a, b) => b.saldoFinal - a.saldoFinal);
}

// ---------------------------------------------------------------------------
// 8. EXEMPLO DE INTEGRAÇÃO NO ROBÔ (chamar isto a cada novo tick da Deriv)
// ---------------------------------------------------------------------------
//
// import { registrarNovoTick, decidirEntradaPorProbabilidade, gerarConfigPorProbabilidade,
//          criarGestorSoros, historicoDigitos } from "./analiseDigitos";
//
// const configAtiva = gerarConfigPorProbabilidade("UNDER_6", 5, 15);
// const soros = criarGestorSoros(1); // stake base — usa valor de conta DEMO
//
// function onNovoTick(preco: number) {
//     const digito = parseInt(preco.toString().slice(-1));
//     registrarNovoTick(digito);
//
//     const decisao = decidirEntradaPorProbabilidade(historicoDigitos, configAtiva);
//     if (decisao.decisao.startsWith("COMPRAR_")) {
//         const stake = soros.proximoStake();
//         // >>> chamar aqui a função que envia a ordem de compra à API da Deriv <<<
//         // enviarOrdemDeriv({ contrato: configAtiva.tipoContrato, stake, conta: "demo" });
//     }
// }
//
// // Depois de receberes o resultado da Deriv para essa operação:
// // soros.registrarResultado(ganhou, payoutRealDoContrato);
