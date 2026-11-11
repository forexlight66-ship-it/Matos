import 'server-only';
import { getDerivExternalReferenceId, getDerivRefreshToken, saveDerivRefreshToken } from '../lib/platform-auth';
import { normalizeTickHistory } from '../server/trading/tick-history';
import { normalizeLiveContractProfitLoss } from '../server/trading/contract-normalization';
import { getAuthenticatedDerivIdentity } from '../lib/derivNickname';

const DERIV_API = 'https://api.derivws.com';

export interface DerivTick {
  symbol: string;
  quote: number;
  epoch: number;
  pipSize?: number;
}

export interface DerivContractUpdate {
  contract_id: number;
  buy_price: number;
  sell_price: number | null;
  payout: number;
  purchase_time: number;
  sell_time: number | null;
  contract_type: string;
  status: string;
  profit_loss: number;
  exit_tick?: number | string | null;
  exit_spot?: number | string | null;
  barrier?: number | null;
  symbol?: string;
  is_sold?: boolean | number;
}

export interface DerivAccountSelection {
  accountId: string;
  accountType: 'demo' | 'real';
  currency: string;
}

type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

export class DerivGateway {
  private socket: WebSocket;
  private nextRequestId = 1000;
  private pending = new Map<number, Pending>();
  private closed = false;
  private tickListeners = new Set<(tick: DerivTick) => void>();
  private contractListeners = new Set<(contract: DerivContractUpdate) => void>();
  private balanceListeners = new Set<(balance: { balance: number; currency: string; loginid?: string }) => void>();
  private errorListeners = new Set<(error: Error) => void>();

  private constructor(url: string) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener('message', event => this.handleMessage(String(event.data)));
    this.socket.addEventListener('error', () => this.emitError(new Error('Deriv WebSocket connection error.')));
    this.socket.addEventListener('close', () => {
      this.closed = true;
      for (const item of this.pending.values()) {
        clearTimeout(item.timer);
        item.reject(new Error('Deriv WebSocket disconnected.'));
      }
      this.pending.clear();
      this.emitError(new Error('Deriv WebSocket disconnected.'));
    });
  }

  static async connectForUser(userId: string | number, accountType: 'demo' | 'real') {
    const appId = process.env.DERIV_APP_ID?.trim();
    if (!appId) throw new Error('DERIV_APP_ID is missing on the trading worker.');

    const storedRefreshToken = await getDerivRefreshToken(userId);
    if (!storedRefreshToken) throw new Error('No server-managed Deriv refresh token is saved for this user.');

    const identity = await getAuthenticatedDerivIdentity({ refreshToken: storedRefreshToken, appId });
    const expectedIdentityId = await getDerivExternalReferenceId(userId);
    if (expectedIdentityId && expectedIdentityId !== identity.externalReferenceId) {
      throw new Error('Deriv identity does not match the account linked to this Matos user.');
    }
    await saveDerivRefreshToken(
      userId,
      identity.refreshToken || storedRefreshToken,
      identity.externalReferenceId,
    );

    const response = await fetch(`${DERIV_API}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${identity.accessToken}`, 'Deriv-App-ID': appId },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    const payload: any = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.errors?.[0]?.message || `Deriv account lookup failed (${response.status}).`);

    const raw = payload?.data?.accounts ?? payload?.data ?? [];
    const accounts = Array.isArray(raw) ? raw : raw?.account_id ? [raw] : [];
    const selected = accounts.find((item: any) => String(item?.account_type || '').toLowerCase() === accountType && item?.account_id);
    if (!selected) throw new Error(`No ${accountType} Options account exists for the linked Deriv identity.`);

    const account: DerivAccountSelection = {
      accountId: String(selected.account_id),
      accountType,
      currency: String(selected.currency || 'USD').toUpperCase(),
    };

    const otp = await fetch(
      `${DERIV_API}/trading/v1/options/accounts/${encodeURIComponent(account.accountId)}/otp`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${identity.accessToken}`, 'Deriv-App-ID': appId },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    const otpPayload: any = await otp.json().catch(() => null);
    const wsUrl = otpPayload?.data?.url;
    if (!otp.ok || typeof wsUrl !== 'string' || !wsUrl.startsWith('wss://')) {
      throw new Error(otpPayload?.errors?.[0]?.message || 'Deriv did not issue a valid authenticated WebSocket URL.');
    }

    const gateway = new DerivGateway(wsUrl);
    await gateway.waitUntilOpen();
    return { gateway, account };
  }

  private waitUntilOpen() {
    if (this.socket.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Deriv WebSocket opening timed out.')), 12000);
      const opened = () => { clearTimeout(timeout); resolve(); };
      const failed = () => { clearTimeout(timeout); reject(new Error('Deriv WebSocket could not be opened.')); };
      this.socket.addEventListener('open', opened, { once: true });
      this.socket.addEventListener('error', failed, { once: true });
      this.socket.addEventListener('close', failed, { once: true });
    });
  }

  private handleMessage(raw: string) {
    let data: any;
    try { data = JSON.parse(raw); } catch { return; }
    const reqId = Number(data?.req_id ?? data?.echo_req?.req_id);
    if (reqId && this.pending.has(reqId)) {
      const item = this.pending.get(reqId)!;
      this.pending.delete(reqId);
      clearTimeout(item.timer);
      if (data?.error) item.reject(new Error(String(data.error.message || 'Deriv request failed.')));
      else item.resolve(data);
    }
    if (data?.msg_type === 'tick' && data.tick) {
      const tick = data.tick;
      const symbol = String(tick?.symbol || data?.echo_req?.ticks || '');
      const quote = Number(tick?.quote);
      const epoch = Number(tick?.epoch);
      if (symbol && Number.isFinite(quote) && Number.isFinite(epoch)) {
        const pipSize = Number.isFinite(Number(tick?.pip_size)) ? Number(tick.pip_size) : undefined;
        for (const listener of this.tickListeners) listener({ symbol, quote, epoch, pipSize });
      }
    }
    if (data?.msg_type === 'balance' && data.balance != null) {
      const balance = {
        balance: Number(data.balance?.balance ?? data.balance),
        currency: String(data.balance?.currency ?? data.currency ?? 'USD'),
        loginid: data.balance?.loginid ? String(data.balance.loginid) : (data.loginid ? String(data.loginid) : undefined),
      };
      if (Number.isFinite(balance.balance)) for (const listener of this.balanceListeners) listener(balance);
    }
    if (data?.msg_type === 'proposal_open_contract' && data.proposal_open_contract) {
      const c = data.proposal_open_contract;
      const contract: DerivContractUpdate = {
        contract_id: Number(c.contract_id),
        buy_price: Number(c.buy_price || 0),
        sell_price: c.sell_price == null ? null : Number(c.sell_price),
        payout: Number(c.payout || 0),
        purchase_time: Number(c.purchase_time || 0),
        sell_time: c.sell_time == null ? null : Number(c.sell_time),
        contract_type: String(c.contract_type || ''),
        status: String(c.status || '').toLowerCase(),
        profit_loss: normalizeLiveContractProfitLoss(c),
        exit_tick: c.exit_tick ?? null,
        exit_spot: c.exit_spot ?? null,
        barrier: c.barrier == null ? null : Number(c.barrier),
        symbol: String(c.underlying || c.symbol || ''),
        is_sold: c.is_sold,
      };
      if (Number.isFinite(contract.contract_id) && contract.contract_id > 0) {
        for (const listener of this.contractListeners) listener(contract);
      }
    }
  }

  private emitError(error: Error) { for (const listener of this.errorListeners) listener(error); }

  private send(payload: Record<string, unknown>) {
    if (this.closed || this.socket.readyState !== WebSocket.OPEN) throw new Error('Deriv WebSocket is not connected.');
    this.socket.send(JSON.stringify(payload));
  }

  private request(payload: Record<string, unknown>, timeoutMs = 10000) {
    const req_id = ++this.nextRequestId;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error('Deriv request timed out.'));
      }, timeoutMs);
      this.pending.set(req_id, { resolve, reject, timer });
      try { this.send({ ...payload, req_id }); }
      catch (error) {
        clearTimeout(timer);
        this.pending.delete(req_id);
        reject(error instanceof Error ? error : new Error('Could not send Deriv request.'));
      }
    });
  }

  onTick(listener: (tick: DerivTick) => void) { this.tickListeners.add(listener); return () => this.tickListeners.delete(listener); }
  onContract(listener: (contract: DerivContractUpdate) => void) { this.contractListeners.add(listener); return () => this.contractListeners.delete(listener); }
  onBalance(listener: (balance: { balance: number; currency: string; loginid?: string }) => void) { this.balanceListeners.add(listener); return () => this.balanceListeners.delete(listener); }
  onError(listener: (error: Error) => void) { this.errorListeners.add(listener); return () => this.errorListeners.delete(listener); }

  async subscribe(symbol: string) {
    await this.request({ balance: 1, subscribe: 1 }, 8000);
    this.send({ ticks: symbol, subscribe: 1, req_id: ++this.nextRequestId });
  }

  subscribeTicks(symbol: string) {
    this.send({ ticks: symbol, subscribe: 1, req_id: ++this.nextRequestId });
  }

  async getTicksHistory(symbol: string, count: number) {
    const result = await this.request({ ticks_history: symbol, count: Math.max(1, Math.min(500, Math.floor(count))), end: 'latest', style: 'ticks' });
    return normalizeTickHistory(result?.history);
  }

  async getProposal(input: { symbol: string; contractType: string; amount: number; duration: number; currency: string; barrier?: number }) {
    const params: Record<string, unknown> = {
      proposal: 1, amount: input.amount, basis: 'stake', contract_type: input.contractType,
      currency: input.currency, duration: input.duration, duration_unit: 't', underlying_symbol: input.symbol,
    };
    if (input.barrier !== undefined && ['DIGITMATCH','DIGITDIFF','DIGITOVER','DIGITUNDER'].includes(input.contractType)) {
      params.barrier = String(input.barrier);
    }
    const response = await this.request(params);
    const proposal = response?.proposal;
    if (!proposal?.id || !Number.isFinite(Number(proposal.ask_price)) || Number(proposal.ask_price) <= 0) {
      throw new Error('Deriv returned an invalid proposal.');
    }
    return {
      id: String(proposal.id), askPrice: Number(proposal.ask_price), payout: Number(proposal.payout || 0),
      contractType: String(proposal.contract_type || input.contractType), barrier: proposal.barrier == null ? input.barrier : Number(proposal.barrier),
    };
  }

  async buy(proposalId: string, maxPrice: number) {
    if (!proposalId || !Number.isFinite(maxPrice) || maxPrice <= 0) throw new Error('Invalid buy parameters.');
    const response = await this.request({ buy: proposalId, price: maxPrice }, 12000);
    const contractId = Number(response?.buy?.contract_id);
    if (!Number.isFinite(contractId) || contractId <= 0) throw new Error('Deriv did not confirm the purchase.');
    // Return the confirmed contract ID before attempting a stream subscription.
    // If the socket drops here, the caller can still persist the known contract ID.
    return { contractId, buyPrice: Number(response.buy.buy_price || maxPrice) };
  }

  subscribeContract(contractId: number) {
    if (!Number.isFinite(contractId) || contractId <= 0) throw new Error('Invalid contract ID.');
    this.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1, req_id: ++this.nextRequestId });
  }

  async getPortfolio() { return this.request({ portfolio: 1 }); }
  async getProfitTable() { return this.request({ profit_table: 1, limit: 50, offset: 0, sort: 'DESC', description: 1 }); }

  async sell(contractId: number) {
    if (!Number.isFinite(contractId) || contractId <= 0) throw new Error('Invalid contract ID.');
    return this.request({ sell: contractId, price: 0 }, 12000);
  }

  close() {
    this.closed = true;
    for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(new Error('Deriv gateway closed.')); }
    this.pending.clear();
    try { this.socket.close(); } catch {}
  }
}
