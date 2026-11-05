import 'server-only';

import { randomUUID } from 'node:crypto';
import { DerivGateway, type DerivContractUpdate, type DerivTick } from './deriv-gateway';
import {
  acquireRuntimeLease, appendRuntimeEvent, createOrderIntent, finishRuntime,
  heartbeatRuntime, recordTrade, updateOrderIntent, getUnresolvedOrderIntent, type RuntimeRow,
} from './repository';
import { makeSignal, type Strategy } from '../server/trading/strategy-analysis';

const WORKER_ID = randomUUID();
const POLL_MS = 4000;
const HEARTBEAT_MS = 7000;
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const allowedStrategies = new Set<Strategy>([
  'PAR_IMPAR','ACIMA5_BAIXO4','RISE_FALL','DIFERENTE','HYPERLITE',
  'HYPERGUARD','HYPERSHIELD','HYPERBREAK','HYPERSWAP','HYPERCOVER',
]);

function contractType(signal: any): string {
  const map: Record<string,string> = {
    EVEN:'DIGITEVEN', ODD:'DIGITODD', OVER:'DIGITOVER', UNDER:'DIGITUNDER',
    RISE:'CALL', FALL:'PUT', DIFFER:'DIGITDIFF', MATCH0:'DIGITMATCH', MATCH9:'DIGITMATCH',
  };
  return map[String(signal?.contract || '')] || '';
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
  private state: Record<string, any>;

  constructor(private runtime: RuntimeRow) {
    this.state = { ...(runtime.state || {}) };
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
    await this.gateway.subscribe(cfg.symbol);
    const unresolvedIntent = await getUnresolvedOrderIntent(this.runtime.id);
    if (unresolvedIntent || this.activeContractId || this.state.pendingIntentId) {
      const portfolio = await this.gateway.getPortfolio();
      const open = Array.isArray(portfolio?.portfolio?.contracts) ? portfolio.portfolio.contracts
        : Array.isArray(portfolio?.contracts) ? portfolio.contracts : [];
      const expectedId = Number(unresolvedIntent?.contract_id || this.activeContractId || 0);
      const recovered = expectedId > 0
        ? open.find((item: any) => Number(item?.contract_id) === expectedId)
        : open.length === 1 ? open[0] : null;
      const recoveredId = Number(recovered?.contract_id);
      if (!Number.isFinite(recoveredId) || recoveredId <= 0) {
        throw new Error('Existe uma intenção de compra anterior sem posição aberta correspondente. Resultado incerto: motor bloqueado para evitar compra duplicada.');
      }
      this.activeContractId = recoveredId;
      this.activeIntentId = String(unresolvedIntent?.id || this.state.pendingIntentId || '');
      this.state.activeContractId = recoveredId;
      this.state.pendingIntentId = this.activeIntentId || null;
      this.gateway.subscribeContract(recoveredId);
      if (this.activeIntentId) await updateOrderIntent(this.activeIntentId, 'confirmed', { contractId: recoveredId });
      await appendRuntimeEvent(this.runtime, 'open_contract_reconciled', { contractId: recoveredId, intentId: this.activeIntentId || null });
    }
    this.gateway.onBalance(value => { this.balance = value.balance; this.currency = value.currency || this.currency; });
    this.gateway.onTick(tick => {
      this.queue = this.queue.then(() => this.handleTick(tick)).catch(error => this.fail(error));
    });
    this.gateway.onContract(contract => {
      this.queue = this.queue.then(() => this.handleContract(contract)).catch(error => this.fail(error));
    });
    this.gateway.onError(error => { void this.fail(error); });
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
      botActivity: this.activeContractId ? 'contractOpen' : 'analysing',
      updatedAt: new Date().toISOString(),
    };
  }

  private async handleTick(tick: DerivTick) {
    if (this.stopped || this.stopRequested || tick.epoch <= this.lastEpoch) return;
    this.lastEpoch = tick.epoch;
    this.ticks.push(tick.quote);
    if (this.ticks.length > 500) this.ticks.shift();
    this.state.tickSequence = Number(this.state.tickSequence || 0) + 1;
    if (this.activeContractId || this.state.pendingIntentId) return;
    const leaseStatus = await heartbeatRuntime(this.runtime.id, WORKER_ID, this.snapshot());
    if (leaseStatus !== 'running' && leaseStatus !== 'starting') { this.stopRequested = true; return; }
    const cfg = this.runtime.config;
    const windowSize = Math.max(9, Math.min(100, Number(cfg.tickWindow) || 9));
    const sample = this.ticks.slice(-windowSize);
    if (sample.length < windowSize) return;
    const threshold = cfg.strategy === 'PAR_IMPAR' ? 78 : cfg.strategy === 'DIFERENTE' ? 30 : cfg.strategy === 'HYPERCOVER' ? 60 : 65;
    const signal: any = makeSignal(sample, cfg.strategy as Strategy, tick.pipSize, false, threshold, windowSize);
    if (!signal) return;
    const type = contractType(signal);
    if (!type) return;
    const stake = Math.min(Number(cfg.stake), this.balance ?? Number(cfg.stake));
    if (!Number.isFinite(stake) || stake < 0.35) throw new Error('Saldo Demo insuficiente para a stake configurada.');
    const intentId = await createOrderIntent({
      runtime: this.runtime, tickEpoch: tick.epoch, symbol: cfg.symbol, contractType: type,
      barrier: signal.barrier, stake, currency: this.currency, botName: cfg.strategy,
    });
    if (!intentId) return;
    this.activeIntentId = intentId;
    this.state.pendingIntentId = intentId;
    this.state.lastSignal = { label: signal.label, contract: type, strength: signal.strength, epoch: tick.epoch };
    await updateOrderIntent(intentId, 'created');
    try {
      const proposal = await this.gateway!.getProposal({
        symbol: cfg.symbol, contractType: type, amount: stake,
        duration: Math.max(1, Math.min(10, Number(cfg.durationTicks) || 1)),
        currency: this.currency, barrier: signal.barrier,
      });
      await updateOrderIntent(intentId, 'quoted', { proposalId: proposal.id, maxPrice: proposal.askPrice });
      await updateOrderIntent(intentId, 'sent');
      // A timeout after this point is ambiguous. Never retry a buy blindly.
      const bought = await this.gateway!.buy(proposal.id, proposal.askPrice);
      this.activeContractId = bought.contractId;
      this.activeSignal = signal;
      this.state.activeContractId = bought.contractId;
      await updateOrderIntent(intentId, 'open', { contractId: bought.contractId });
      await appendRuntimeEvent(this.runtime, 'contract_opened', { contractId: bought.contractId, stake, strategy: cfg.strategy });
    } catch (error) {
      await updateOrderIntent(intentId, 'unknown', { errorMessage: error instanceof Error ? error.message : 'buy outcome unknown' });
      this.state.pendingIntentId = null;
      this.activeIntentId = null;
      throw new Error('Resultado de compra não confirmado. Motor parado para reconciliação; nenhuma repetição automática.');
    }
  }

  private async handleContract(contract: DerivContractUpdate) {
    if (this.stopped || !this.activeContractId || contract.contract_id !== this.activeContractId) return;
    const closed = Boolean(contract.is_sold) || ['won','lost','sold','expired','closed'].includes(String(contract.status).toLowerCase());
    if (!closed) return;
    await recordTrade(this.runtime, contract, this.runtime.config.strategy, this.runtime.config.symbol);
    await appendRuntimeEvent(this.runtime, 'contract_closed', {
      contractId: contract.contract_id, status: contract.status, profitLoss: contract.profit_loss,
      exitSpot: contract.exit_spot, exitTick: contract.exit_tick,
    });
    this.state.tradeCount = Number(this.state.tradeCount || 0) + 1;
    this.state.profitLoss = Number(this.state.profitLoss || 0) + Number(contract.profit_loss || 0);
    if (Number(contract.profit_loss) > 0) this.state.winCount = Number(this.state.winCount || 0) + 1;
    else this.state.lossCount = Number(this.state.lossCount || 0) + 1;
    if (this.activeIntentId) await updateOrderIntent(this.activeIntentId, 'reconciled', { contractId: contract.contract_id });
    this.activeContractId = null;
    this.activeIntentId = null;
    this.activeSignal = null;
    this.state.activeContractId = null;
    this.state.pendingIntentId = null;
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
