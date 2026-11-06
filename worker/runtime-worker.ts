import 'server-only';

import { randomUUID } from 'node:crypto';
import { DerivGateway, type DerivContractUpdate, type DerivTick } from './deriv-gateway';
import {
  acquireRuntimeLease, appendRuntimeEvent, createOrderIntent, finishRuntime,
  heartbeatRuntime, markOrderIntentSent, recordTrade, updateOrderIntent, getUnresolvedOrderIntent, type RuntimeRow,
} from './repository';
import { digit, makeSignal, type Strategy } from '../server/trading/strategy-analysis';
import {
  initialHyperBeenState, onHyperBeenClose, onHyperBeenTick,
  initialHyperFlowsState, onHyperFlowsClose, rankHyperFlowsAlternativeDigit,
  initialHypercoverState, onHypercoverClose, onHypercoverTick,
} from '../server/trading/recovery';

const WORKER_ID = randomUUID();
const POLL_MS = 4000;
const HEARTBEAT_MS = 7000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const allowedStrategies = new Set<Strategy>([
  'PAR_IMPAR','ACIMA5_BAIXO4','RISE_FALL','DIFERENTE','HYPERLITE',
  'HYPERCOVER',
]);

function contractType(signal: any): string {
  const map: Record<string,string> = {
    EVEN:'DIGITEVEN', ODD:'DIGITODD', OVER:'DIGITOVER', UNDER:'DIGITUNDER',
    RISE:'CALL', FALL:'PUT', DIFFER:'DIGITDIFF', MATCH0:'DIGITMATCH', MATCH9:'DIGITMATCH',
  };
  return map[String(signal?.contract || '')] || '';
}

function normalizeProfitTableContract(raw: any, fallbackSymbol: string): DerivContractUpdate | null {
  const contractId = Number(raw?.contract_id);
  const sellTime = Number(raw?.sell_time);
  if (!Number.isSafeInteger(contractId) || contractId <= 0 || !Number.isFinite(sellTime) || sellTime <= 0) return null;

  const explicitProfitLoss = Number(raw?.profit_loss);
  const apiProfit = Number(raw?.profit);
  const buyPrice = Number(raw?.buy_price ?? 0);
  const sellPrice = raw?.sell_price == null ? null : Number(raw.sell_price);
  const profitLoss = Number.isFinite(explicitProfitLoss) && Math.abs(explicitProfitLoss) > 0.000001
    ? explicitProfitLoss
    : Number.isFinite(apiProfit) && Math.abs(apiProfit) > 0.000001
      ? apiProfit
      : Number.isFinite(buyPrice) && sellPrice !== null && Number.isFinite(sellPrice)
        ? Number((sellPrice - buyPrice).toFixed(2))
        : Number.isFinite(explicitProfitLoss) ? explicitProfitLoss : 0;

  let status = String(raw?.status || '').toLowerCase();
  if (!['won', 'lost', 'sold', 'expired', 'closed'].includes(status)) {
    status = profitLoss > 0 ? 'won' : profitLoss < 0 ? 'lost' : 'sold';
  }

  return {
    contract_id: contractId,
    buy_price: Number.isFinite(buyPrice) ? buyPrice : 0,
    sell_price: sellPrice !== null && Number.isFinite(sellPrice) ? sellPrice : null,
    payout: Number(raw?.payout || 0),
    purchase_time: Number(raw?.purchase_time ?? raw?.date_start ?? 0),
    sell_time: sellTime,
    contract_type: String(raw?.contract_type || ''),
    status,
    profit_loss: profitLoss,
    exit_tick: raw?.exit_tick ?? null,
    exit_spot: raw?.exit_spot ?? null,
    barrier: raw?.barrier == null ? null : Number(raw.barrier),
    symbol: String(raw?.symbol || raw?.underlying_symbol || raw?.underlying || fallbackSymbol),
    is_sold: true,
  };
}

class RuntimeWorker {
  private gateway: DerivGateway | null = null;
  private stopped = false;
  private stopRequested = false;
  private terminalStatus: 'stopped' | 'safety_stopped' = 'stopped';
  private queue = Promise.resolve();
  private ticks: number[] = [];
  private lastEpoch = 0;
  private activeContractId: number | null = null;
  private activeIntentId: string | null = null;
  private activeSignal: any = null;
  private balance: number | null = null;
  private currency = 'USD';
  private pipSize?: number;
  private state: Record<string, any>;

  constructor(private runtime: RuntimeRow) {
    this.state = { ...(runtime.state || {}) };
    this.state.hyperBeen ||= initialHyperBeenState();
    this.state.hyperFlows ||= initialHyperFlowsState(Number(runtime.config.recoveryExtraProfit ?? 5));
    this.state.hypercover ||= initialHypercoverState();
    this.ticks = Array.isArray(this.state.ticks) ? this.state.ticks.slice(-500).map(Number).filter(Number.isFinite) : [];
    this.lastEpoch = Number(this.state.lastEpoch || 0);
    this.activeContractId = this.state.activeContractId ? Number(this.state.activeContractId) : null;
  }

  async run() {
    const cfg = this.runtime.config;
    if (this.runtime.account_type !== 'demo') throw new Error('Por segurança, o motor server-side só aceita conta Demo nesta fase.');
    if (!allowedStrategies.has(cfg.strategy as Strategy)) throw new Error('Estratégia não reconhecida pelo motor server-side.');
    if (!cfg.symbol || !/^[A-Za-z0-9_]{2,24}$/.test(cfg.symbol)) throw new Error('Símbolo Deriv inválido.');
    if (!Number.isFinite(Number(cfg.stake)) || Number(cfg.stake) < 0.35) throw new Error('Stake mínima inválida.');

    const connected = await DerivGateway.connectForUser(this.runtime.user_id, 'demo');
    this.gateway = connected.gateway;
    if (connected.account.accountId !== this.runtime.account_id) throw new Error('A conta Demo ligada mudou desde o início. Inicie novamente para validar a conta correcta.');
    this.currency = connected.account.currency;
    // Seed the rolling window from Deriv's latest official ticks before live subscription.
    // This avoids waiting for nine new ticks and keeps the first decision aligned with
    // the normal strategy's nine-tick rule.
    const initialWindow = cfg.strategy === 'HYPERFLOWS' ? 25 : cfg.strategy === 'MATCH0' ? 10 : 9;
    const history = await this.gateway.getTicksHistory(cfg.symbol, initialWindow);
    if (history.length) this.ticks = history.slice(-initialWindow);
    this.gateway.onBalance(value => { this.balance = value.balance; this.currency = value.currency || this.currency; });
    this.gateway.onTick(tick => {
      this.queue = this.queue.then(() => this.handleTick(tick)).catch(error => this.fail(error));
    });
    this.gateway.onContract(contract => {
      this.queue = this.queue.then(() => this.handleContract(contract)).catch(error => this.fail(error));
    });
    this.gateway.onError(error => { void this.fail(error); });
    await this.gateway.subscribe(cfg.symbol);
    const unresolvedIntent = await getUnresolvedOrderIntent(this.runtime.id);
    if (unresolvedIntent || this.activeContractId || this.state.pendingIntentId) {
      const portfolio = await this.gateway.getPortfolio();
      const open = Array.isArray(portfolio?.portfolio?.contracts) ? portfolio.portfolio.contracts
        : Array.isArray(portfolio?.contracts) ? portfolio.contracts : [];
      // Reconcile only by an exact contract_id persisted before the interruption.
      // A single open contract is not proof that it belongs to this runtime: it may
      // have been opened manually or by another application/bot on the same account.
      const expectedId = Number(unresolvedIntent?.contract_id || this.activeContractId || 0);
      if (!Number.isSafeInteger(expectedId) || expectedId <= 0) {
        throw new Error('Reconciliação bloqueada: a intenção anterior não contém contract_id confirmado. Não é seguro associar uma posição apenas por ser a única aberta.');
      }
      const recovered = open.find((item: any) => Number(item?.contract_id) === expectedId);
      const recoveredId = Number(recovered?.contract_id);
      this.activeIntentId = String(unresolvedIntent?.id || this.state.pendingIntentId || '');

      if (Number.isSafeInteger(recoveredId) && recoveredId === expectedId) {
        this.activeContractId = recoveredId;
        this.state.activeContractId = recoveredId;
        this.state.pendingIntentId = this.activeIntentId || null;
        this.gateway.subscribeContract(recoveredId);
        if (this.activeIntentId) await updateOrderIntent(this.activeIntentId, 'confirmed', { contractId: recoveredId });
        await appendRuntimeEvent(this.runtime, 'open_contract_reconciled', { contractId: recoveredId, intentId: this.activeIntentId || null });
      } else {
        // A one-tick contract may have closed while Render was suspended. Look
        // up only the exact persisted contract_id in Deriv's closed history;
        // never infer ownership from a symbol, stake, or a single open position.
        const historyResponse = await this.gateway.getProfitTable();
        const transactions = Array.isArray(historyResponse?.profit_table?.transactions)
          ? historyResponse.profit_table.transactions : [];
        const closedRaw = transactions.find((item: any) =>
          Number(item?.contract_id) === expectedId && Number(item?.sell_time) > 0
        );
        const closedContract = normalizeProfitTableContract(closedRaw, cfg.symbol);
        if (!closedContract) {
          throw new Error('A intenção anterior não aparece na carteira aberta nem no histórico fechado da Deriv. Resultado incerto: motor bloqueado para evitar compra duplicada.');
        }
        this.activeContractId = expectedId;
        this.state.activeContractId = expectedId;
        this.state.pendingIntentId = this.activeIntentId || null;
        await appendRuntimeEvent(this.runtime, 'closed_contract_found_in_profit_table', {
          contractId: expectedId, status: closedContract.status, profitLoss: closedContract.profit_loss,
        });
        await this.handleContract(closedContract);
      }
    }
    await appendRuntimeEvent(this.runtime, 'worker_connected', { accountType: 'demo', symbol: cfg.symbol });
    let lastHeartbeat = 0;
    while (!this.stopped) {
      const now = Date.now();
      if (now - lastHeartbeat >= HEARTBEAT_MS) {
        const status = await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
        if (!status) { this.stopped = true; break; }
        if (status === 'stopping') this.stopRequested = true;
        if (this.stopRequested && !this.activeContractId) { this.stopped = true; break; }
        lastHeartbeat = now;
      }
      await sleep(500);
    }
    this.gateway?.close();
    await finishRuntime(this.runtime.id, WORKER_ID, this.terminalStatus);
  }

  private snapshot() {
    return {
      ...this.state,
      ticks: this.ticks.slice(-500),
      lastEpoch: this.lastEpoch,
      balance: this.balance,
      currency: this.currency,
      activeContractId: this.activeContractId,
      botActivity: this.activeContractId ? 'reconcilingBot' : 'analyzing',
      updatedAt: new Date().toISOString(),
    };
  }

  private async handleTick(tick: DerivTick) {
    if (this.stopped || this.stopRequested || tick.epoch <= this.lastEpoch) return;
    this.lastEpoch = tick.epoch;
    this.pipSize = tick.pipSize;
    this.ticks.push(tick.quote);
    if (this.ticks.length > 500) this.ticks.shift();
    this.state.tickSequence = Number(this.state.tickSequence || 0) + 1;
    if (this.activeContractId || this.state.pendingIntentId) return;
    const cfg = this.runtime.config;
    if (cfg.strategy === 'HYPERCOVER') {
      const current = this.state.hypercover || initialHypercoverState();
      const transition = onHypercoverTick(current);
      this.state.hypercover = transition.state;
      if (transition.notice) await appendRuntimeEvent(this.runtime, 'strategy_notice', { strategy: 'HYPERCOVER', notice: transition.notice });
      if (transition.nextAction === 'WAIT') return;
    }
    if (cfg.strategy === 'MATCH0') {
      const current = this.state.hyperBeen || initialHyperBeenState();
      const transition = onHyperBeenTick(current);
      this.state.hyperBeen = transition.state;
      if (transition.notice) await appendRuntimeEvent(this.runtime, 'strategy_notice', { strategy: 'MATCH0', notice: transition.notice });
      if (transition.nextAction === 'WAIT') {
        await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
        return;
      }
    }
    const leaseStatus = await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
    if (leaseStatus !== 'running' && leaseStatus !== 'starting') { this.stopRequested = true; return; }
    const windowSize = 9;
    const sample = this.ticks.slice(-windowSize);
    if (sample.length < windowSize) return;
    const threshold = cfg.strategy === 'PAR_IMPAR' ? 78 : cfg.strategy === 'DIFERENTE' ? 30 : cfg.strategy === 'HYPERCOVER' ? 60 : 65;
    let signal: any;
    let hyperFlowsMode: string | null = null;
    if (cfg.strategy === 'MATCH0') {
      const recovery = this.state.hyperBeen || initialHyperBeenState();
      if (recovery.active) {
        signal = { contract: recovery.nextParity, label: recovery.nextParity === 'EVEN' ? 'PAR — RECUPERAÇÃO' : 'ÍMPAR — RECUPERAÇÃO', strength: 100 };
      } else {
        signal = makeSignal(sample, 'MATCH0', tick.pipSize, false, 22, 9);
        if (signal) signal.barrier = 0;
      }
    } else if (cfg.strategy === 'HYPERFLOWS') {
      const recovery = this.state.hyperFlows || initialHyperFlowsState(Number(cfg.recoveryExtraProfit ?? 5));
      if (recovery.recoveryMode) {
        if (recovery.recoveryContract === 'OVER0') {
          signal = { contract: 'OVER', label: 'ACIMA 0 — RECUPERAÇÃO', strength: 100, barrier: 0 };
          hyperFlowsMode = 'OVER0';
        } else {
          signal = { contract: recovery.recoveryContract, label: recovery.recoveryContract === 'EVEN' ? 'PAR — RECUPERAÇÃO' : 'ÍMPAR — RECUPERAÇÃO', strength: 100 };
          hyperFlowsMode = recovery.recoveryContract;
        }
      } else if (recovery.nextDigit !== null) {
        signal = { contract: 'MATCH9', label: 'MATCH ' + recovery.nextDigit + ' — ALTERNATIVO', strength: 90, barrier: recovery.nextDigit };
        hyperFlowsMode = 'ALTERNATE';
      } else {
        const latest10 = this.ticks.slice(-10);
        const latest9 = latest10.slice(-9);
        const zeroCount = latest9.filter(value => digit(value, tick.pipSize) === 0).length;
        if (latest10.length === 10 && zeroCount / 9 * 100 >= 22) {
          signal = { contract: 'MATCH9', label: 'MATCH 9', strength: zeroCount / 9 * 100, barrier: 9 };
          hyperFlowsMode = 'MATCH9';
        }
      }
    } else if (cfg.strategy === 'HYPERCOVER') {
      const recovery = this.state.hypercover || initialHypercoverState();
      if (recovery.forceNextDirection) {
        signal = {
          contract: recovery.contractType === 'DIGITOVER' ? 'OVER' : 'UNDER',
          label: recovery.contractType === 'DIGITOVER' ? 'ACIMA 1 — OVER 1' : 'ABAIXO 8 — UNDER 8',
          strength: 100,
          barrier: recovery.barrier,
        };
      } else {
        signal = makeSignal(sample, 'HYPERCOVER', tick.pipSize, false, threshold, windowSize);
        if (signal) signal.barrier = signal.contract === 'OVER' ? 1 : 8;
      }
    } else {
      signal = makeSignal(sample, cfg.strategy as Strategy, tick.pipSize, false, threshold, windowSize);
    }
    if (!signal) return;
    if (cfg.strategy === 'ACIMA5_BAIXO4') signal.barrier = signal.contract === 'OVER' ? 5 : 4;
    if (cfg.strategy === 'DIFERENTE') signal.barrier = 0;
    const type = contractType(signal);
    if (!type) return;
    if (cfg.strategy === 'MATCH0') {
      const current = this.state.hyperBeen || initialHyperBeenState();
      this.state.hyperBeen = { ...current, lastTradeMode: current.active ? current.nextParity : 'OVER0' };
    }
    if (cfg.strategy === 'HYPERFLOWS' && hyperFlowsMode) {
      const current = this.state.hyperFlows || initialHyperFlowsState(Number(cfg.recoveryExtraProfit ?? 5));
      this.state.hyperFlows = { ...current, lastTradeMode: hyperFlowsMode as any };
    }
    if (cfg.strategy === 'MATCH0' && !this.state.hyperBeen.active) signal.barrier = 0;
    if (cfg.strategy === 'HYPERFLOWS' && (hyperFlowsMode === 'OVER0')) signal.barrier = 0;
    if (cfg.strategy === 'HYPERFLOWS' && (hyperFlowsMode === 'MATCH9' || hyperFlowsMode === 'ALTERNATE')) signal.barrier = Number(signal.barrier);
    if (cfg.strategy === 'HYPERCOVER') {
      const current = this.state.hypercover || initialHypercoverState();
      this.state.hypercover = {
        ...current,
        contractType: signal.contract === 'OVER' ? 'DIGITOVER' : 'DIGITUNDER',
        barrier: Number(signal.barrier ?? (signal.contract === 'OVER' ? 1 : 8)),
      };
    }

    let stake = Math.min(Number(cfg.stake), this.balance ?? Number(cfg.stake));
    if (!Number.isFinite(stake) || stake < 0.35) throw new Error('Saldo Demo insuficiente para a stake configurada.');
    const isRecoveryTrade = (cfg.strategy === 'MATCH0' && Boolean(this.state.hyperBeen?.active))
      || (cfg.strategy === 'HYPERFLOWS' && Boolean(this.state.hyperFlows?.recoveryMode));
    const recoveryTarget = cfg.strategy === 'MATCH0'
      ? Number(this.state.hyperBeen?.deficit || 0) + Math.max(0, Number(cfg.recoveryExtraProfit ?? 5))
      : Number(this.state.hyperFlows?.deficit || 0) + Math.max(0, Number(this.state.hyperFlows?.extraProfit ?? cfg.recoveryExtraProfit ?? 5));
    const duration = isRecoveryTrade ? 5 : Math.max(1, Math.min(10, Number(cfg.durationTicks) || 1));
    let proposal = await this.gateway!.getProposal({
      symbol: cfg.symbol, contractType: type, amount: stake, duration,
      currency: this.currency, barrier: signal.barrier,
    });
    if (isRecoveryTrade) {
      const profitRatio = (proposal.payout - proposal.askPrice) / proposal.askPrice;
      if (!Number.isFinite(profitRatio) || profitRatio <= 0 || !Number.isFinite(recoveryTarget) || recoveryTarget <= 0) {
        throw new Error('Recuperação bloqueada: a cotação Deriv não permite calcular uma stake segura para cobrir o défice total + lucro extra.');
      }
      const requiredStake = Math.ceil((recoveryTarget / profitRatio) * 100 - 1e-8) / 100;
      stake = Math.max(stake, requiredStake);
      const availableBalance = this.balance ?? 0;
      if (!Number.isFinite(stake) || stake > availableBalance + 0.001 || stake > 10000) {
        throw new Error('Recuperação bloqueada: o saldo Demo não cobre a stake necessária para recuperar o défice total + lucro extra. O robô foi parado sem abrir uma operação parcial.');
      }
      if (stake > Number(cfg.stake) + 0.001) {
        proposal = await this.gateway!.getProposal({
          symbol: cfg.symbol, contractType: type, amount: stake, duration,
          currency: this.currency, barrier: signal.barrier,
        });
      }
      if (proposal.payout - proposal.askPrice + 0.005 < recoveryTarget) {
        throw new Error('Recuperação bloqueada: a nova cotação não garante o lucro líquido necessário. Nenhuma compra foi enviada.');
      }
    }
    const intentId = await createOrderIntent({
      runtime: this.runtime, tickEpoch: tick.epoch, symbol: cfg.symbol, contractType: type,
      barrier: signal.barrier, stake, currency: this.currency, botName: cfg.strategy,
    });
    if (!intentId) return;
    this.activeIntentId = intentId;
    this.state.pendingIntentId = intentId;
    this.state.lastSignal = { label: signal.label, contract: type, strength: signal.strength, epoch: tick.epoch, stake, recoveryTarget: isRecoveryTrade ? recoveryTarget : null };
    await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
    await updateOrderIntent(intentId, 'created');
    try {
      await updateOrderIntent(intentId, 'quoted', { proposalId: proposal.id, maxPrice: proposal.askPrice });
      const authorized = await markOrderIntentSent(intentId, this.runtime.id, WORKER_ID);
      if (!authorized) {
        await updateOrderIntent(intentId, 'rejected', { errorMessage: 'Runtime parou ou perdeu a lease antes da autorização da compra.' });
        this.state.pendingIntentId = null;
        this.activeIntentId = null;
        this.stopRequested = true;
        await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
        return;
      }
      // A timeout after this point is ambiguous. Never retry a buy blindly.
      const bought = await this.gateway!.buy(proposal.id, proposal.askPrice);
      this.activeContractId = bought.contractId;
      this.activeSignal = signal;
      this.state.activeContractId = bought.contractId;
      await updateOrderIntent(intentId, 'confirmed', { contractId: bought.contractId });
      await appendRuntimeEvent(this.runtime, 'contract_opened', { contractId: bought.contractId, stake, strategy: cfg.strategy, recoveryTarget: isRecoveryTrade ? recoveryTarget : null });
      this.gateway!.subscribeContract(bought.contractId);
    } catch (error) {
      if (!this.activeContractId) {
        await updateOrderIntent(intentId, 'unknown', { errorMessage: error instanceof Error ? error.message : 'buy outcome unknown' });
        this.state.pendingIntentId = null;
        this.activeIntentId = null;
        throw new Error('Resultado de compra não confirmado. Motor parado para reconciliação; nenhuma repetição automática.');
      }
      await appendRuntimeEvent(this.runtime, 'contract_stream_subscribe_failed', {
        contractId: this.activeContractId,
        message: error instanceof Error ? error.message : 'subscription failed',
      });
      throw new Error('Compra confirmada, mas a subscrição do contrato falhou. Motor parado para reconciliação; não será feita nova compra.');
    }
  }

  private async handleContract(contract: DerivContractUpdate) {
    if (this.stopped || !this.activeContractId || contract.contract_id !== this.activeContractId) return;
    const closed = Boolean(contract.is_sold) || ['won','lost','sold','expired','closed'].includes(String(contract.status).toLowerCase());
    if (!closed) return;
    // Deriv's current proposal_open_contract payload exposes the realised
    // result as "profit". Keep profit_loss as a compatibility fallback for
    // older payloads, and persist one normalized value throughout the runtime.
    const pnlRaw = (contract as any).profit ?? contract.profit_loss;
    const pnl = Number(pnlRaw);
    const normalizedContract = { ...contract, profit_loss: pnl };
    await recordTrade(this.runtime, normalizedContract, this.runtime.config.strategy, this.runtime.config.symbol);
    const rawStatus = String(contract.status || '').toLowerCase();
    const outcome = rawStatus === 'won' || rawStatus === 'lost'
      ? rawStatus
      : rawStatus === 'sold' && Number.isFinite(pnl) && pnl !== 0
        ? (pnl > 0 ? 'won' : 'lost') : rawStatus;
    if (this.runtime.config.strategy === 'HYPERCOVER') {
      if (!['won','lost'].includes(outcome) || !Number.isFinite(pnl)) {
        throw new Error('Hypercover: resultado oficial inválido; robô parado por segurança.');
      }
      const current = this.state.hypercover || initialHypercoverState();
      const transition = onHypercoverClose(current, outcome === 'won');
      this.state.hypercover = transition.state;
      await appendRuntimeEvent(this.runtime, 'strategy_recovery_transition', {
        strategy: 'HYPERCOVER', notice: transition.notice, nextAction: transition.nextAction,
        state: transition.state,
      });
      if (transition.stop) this.stopRequested = true;
    }
    if (this.runtime.config.strategy === 'MATCH0') {
      if (!['won','lost'].includes(outcome) || !Number.isFinite(pnl)) {
        throw new Error('HyperBeen: resultado oficial inválido; robô parado sem avançar a recuperação.');
      }
      const current = this.state.hyperBeen || initialHyperBeenState();
      const transition = onHyperBeenClose(current, {
        status: outcome, profitLoss: pnl,
        contractType: String(contract.contract_type || ''),
        barrier: contract.barrier == null ? null : Number(contract.barrier),
        exitSpot: contract.exit_spot, exitTick: contract.exit_tick,
      }, Number(this.runtime.config.recoveryExtraProfit ?? 5));
      this.state.hyperBeen = transition.state;
      await appendRuntimeEvent(this.runtime, 'strategy_recovery_transition', {
        strategy: 'MATCH0', notice: transition.notice, nextAction: transition.nextAction,
        stop: transition.stop, state: transition.state,
      });
      if (transition.stop) {
        this.stopRequested = true;
        this.terminalStatus = 'safety_stopped';
      }
    }
    if (this.runtime.config.strategy === 'HYPERFLOWS') {
      if (!['won','lost'].includes(outcome) || !Number.isFinite(pnl)) {
        throw new Error('HyperFlows: resultado oficial inválido; robô parado sem avançar a recuperação.');
      }
      const current = this.state.hyperFlows || initialHyperFlowsState(Number(this.runtime.config.recoveryExtraProfit ?? 5));
      const isPrimaryMatch9 = String(contract.contract_type || '').toUpperCase() === 'DIGITMATCH'
        && Number(contract.barrier) === 9;
      const alternativeDigit = outcome === 'lost' && isPrimaryMatch9
        ? rankHyperFlowsAlternativeDigit(this.ticks.slice(-10), this.pipSize) : null;
      const transition = onHyperFlowsClose(current, {
        status: outcome, profitLoss: pnl,
        contractType: String(contract.contract_type || ''),
        barrier: contract.barrier == null ? null : Number(contract.barrier),
        alternativeDigit,
        exitSpot: contract.exit_spot, exitTick: contract.exit_tick,
      });
      this.state.hyperFlows = transition.state;
      await appendRuntimeEvent(this.runtime, 'strategy_recovery_transition', {
        strategy: 'HYPERFLOWS', notice: transition.notice, nextAction: transition.nextAction,
        stop: transition.stop, state: transition.state,
      });
      if (transition.stop) {
        this.stopRequested = true;
        this.terminalStatus = 'safety_stopped';
      }
    }
    await appendRuntimeEvent(this.runtime, 'contract_closed', {
      contractId: contract.contract_id, status: contract.status, profitLoss: pnl,
      exitSpot: contract.exit_spot, exitTick: contract.exit_tick,
    });
    this.state.tradeCount = Number(this.state.tradeCount || 0) + 1;
    this.state.profitLoss = Number(this.state.profitLoss || 0) + Number(contract.profit_loss || 0);
    if (Number.isFinite(pnl) && pnl > 0) this.state.winCount = Number(this.state.winCount || 0) + 1;
    else if (Number.isFinite(pnl) && pnl < 0) this.state.lossCount = Number(this.state.lossCount || 0) + 1;
    if (this.activeIntentId) await updateOrderIntent(this.activeIntentId, 'reconciled', { contractId: contract.contract_id });
    const totalProfitLoss = Number(this.state.profitLoss || 0);
    const target = Math.max(0, Number(this.runtime.config.target) || 0);
    const lossLimit = Math.max(0, Number(this.runtime.config.lossLimit) || 0);
    if ((target > 0 && totalProfitLoss >= target) || (lossLimit > 0 && totalProfitLoss <= -lossLimit)) {
      this.stopRequested = true;
      await appendRuntimeEvent(this.runtime, 'session_limit_reached', {
        profitLoss: totalProfitLoss, target, lossLimit,
        reason: target > 0 && totalProfitLoss >= target ? 'target' : 'loss_limit',
      });
    }
    this.activeContractId = null;
    this.activeIntentId = null;
    this.activeSignal = null;
    this.state.activeContractId = null;
    this.state.pendingIntentId = null;
    await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
  }

  private async fail(error: unknown) {
    if (this.stopped) return;
    this.stopped = true;
    this.terminalStatus = 'safety_stopped';
    const message = error instanceof Error ? error.message : 'Erro desconhecido no motor.';
    try { await appendRuntimeEvent(this.runtime, 'worker_safety_stop', { message }); } catch {}
    try { await finishRuntime(this.runtime.id, WORKER_ID, 'safety_stopped', { code: 'WORKER_SAFETY_STOP', message }); } catch {}
    this.gateway?.close();
  }
}

let started = false;
let polling = false;

export function startTradingWorker() {
  if (started || process.env.NODE_ENV !== 'production') return;
  started = true;
  console.info('[TradingWorker] In-process worker started; no separate Render service required.');
  void (async () => {
    while (true) {
      if (!polling) {
        polling = true;
        try {
          const runtime = await acquireRuntimeLease(WORKER_ID, 20);
          if (runtime) {
            const worker = new RuntimeWorker(runtime);
            try { await worker.run(); }
            catch (error) {
              const message = error instanceof Error ? error.message : 'Worker failed.';
              console.error('[TradingWorker] Runtime stopped:', message);
              try { await finishRuntime(runtime.id, WORKER_ID, 'safety_stopped', { code: 'WORKER_START_FAILED', message }); } catch {}
            }
          }
        } catch (error) {
          console.error('[TradingWorker] Lease polling failed:', error);
        } finally {
          polling = false;
        }
      }
      await sleep(POLL_MS);
    }
  })();
}
