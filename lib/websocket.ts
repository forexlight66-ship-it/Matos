// lib/websocket.ts

type MessageHandler = (data: any) => void;

export class DerivWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private isReady = false;
  private balanceSubscribed = false;
  private tickSubscriptions = new Set<string>();
  private contractSubscriptions = new Set<number>();
  private contractSubscriptionIds = new Map<number, string>();
  private proposalRequestId = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectEnabled = true;
  private reconnectDelay = 1000;
  private lastProfitTableRequest = 0;
  private lastBalanceRequest = 0;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private lastMessageAt = 0;
  private lastTickAt = 0;
  private reconnectUrlProvider: (() => Promise<string>) | null = null;
  private reconnectGeneration = 0;

  constructor(wsUrl: string) { this.url = wsUrl; }

  setReconnectUrlProvider(provider: (() => Promise<string>) | null) {
    this.reconnectUrlProvider = provider;
  }

  async connect() {
    if (!this.reconnectEnabled) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;

    const generation = ++this.reconnectGeneration;
    let url = this.url;
    try {
      if (this.reconnectUrlProvider) url = await this.reconnectUrlProvider();
    } catch (error) {
      console.error('[DerivWS] Failed to refresh WebSocket URL:', error);
      if (this.reconnectEnabled) this.scheduleReconnect();
      return;
    }
    if (!this.reconnectEnabled || generation !== this.reconnectGeneration) return;
    this.url = url;

    const socket = new WebSocket(url);
    this.ws = socket;

    socket.onopen = () => {
      if (this.ws !== socket) {
        try { socket.close(); } catch {}
        return;
      }
      this.isReady = true;
      this.reconnectDelay = 1000;
      this.lastMessageAt = Date.now();
      this.lastTickAt = Date.now();
      this.startKeepAlive(socket);
      this.resubscribeAll();
    };

    socket.onmessage = (event) => {
      if (this.ws !== socket) return;
      this.lastMessageAt = Date.now();
      try {
        let data = JSON.parse(event.data);

        if (data.msg_type === 'balance' && Number.isFinite(Number(data?.balance))) {
          data = {
            ...data,
            balance: {
              balance: Number(data.balance),
              currency: String(data.currency || 'USD'),
              loginid: data.loginid ? String(data.loginid) : undefined,
            },
          };
        }

        if (data.msg_type === 'tick' && data.tick) {
          this.lastTickAt = Date.now();
        }

        if (
          data.msg_type === 'proposal_open_contract' &&
          data.proposal_open_contract?.contract_id &&
          data.subscription?.id
        ) {
          this.contractSubscriptionIds.set(
            Number(data.proposal_open_contract.contract_id),
            String(data.subscription.id)
          );
        }

        const msgType = data.msg_type;
        if (msgType && this.handlers.has(msgType)) {
          for (const fn of this.handlers.get(msgType)!) fn(data);
        }
        if (this.handlers.has('*')) {
          for (const fn of this.handlers.get('*')!) fn(data);
        }
      } catch (error) {
        console.error('[DerivWS] Parse error:', error);
      }
    };

    socket.onclose = () => {
      // Ignore events from an obsolete socket. This prevents an old socket
      // closing after a reconnect from orphaning the current socket reference.
      if (this.ws !== socket) return;

      this.stopKeepAlive();
      this.isReady = false;
      this.ws = null;
      this.balanceSubscribed = false;
      this.contractSubscriptionIds.clear();
      if (this.reconnectEnabled) this.scheduleReconnect();
    };

    socket.onerror = (error) => {
      if (this.ws !== socket) return;
      console.error('[DerivWS] Error:', error);
    };
  }

  private startKeepAlive(socket: WebSocket) {
    this.stopKeepAlive();
    this.keepAliveTimer = setInterval(() => {
      if (this.ws !== socket || !this.isReady || socket.readyState !== WebSocket.OPEN) return;
      try {
        socket.send(JSON.stringify({ ping: 1, req_id: 900000 + Date.now() % 100000 }));
      } catch {
        try { socket.close(); } catch {}
      }
    }, 30000);
  }

  private stopKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = null;
  }

  private scheduleReconnect() {
    if (!this.reconnectEnabled || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
    }, this.reconnectDelay);
  }

  private resubscribeAll() {
    if (!this.isReady) return;

    if (this.send({ balance: 1, subscribe: 1 })) this.balanceSubscribed = true;
    for (const symbol of this.tickSubscriptions) this.send({ ticks: symbol, subscribe: 1 });
    for (const contractId of this.contractSubscriptions) {
      this.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
    }
  }

  send(payload: any) {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(payload));
      return true;
    } catch (error) {
      console.error('[DerivWS] Send error:', error);
      return false;
    }
  }

  isConnected(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }

  isAuthorized(): boolean {
    return this.isConnected();
  }

  // True when the connection looks alive but market-data traffic has stopped.
  // This catches "silent" WebSocket failures that do not emit onclose/onerror.
  isStale(maxTickAgeMs = 25000): boolean {
    if (!this.isConnected() || this.tickSubscriptions.size === 0) return false;
    return Date.now() - this.lastTickAt > maxTickAgeMs;
  }

  // Mobile browsers can suspend an apparently-open WebSocket while the app
  // is minimized. Force a fresh socket when the page becomes visible again,
  // while preserving tick/contract subscriptions for resubscription.
  resumeConnection() {
    if (!this.reconnectEnabled) return;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const old = this.ws;
    if (old) {
      // Detach the old close handler so its asynchronous close event cannot
      // mutate the state of the replacement socket.
      old.onclose = null;
      try { old.close(); } catch {}
    }

    this.stopKeepAlive();
    this.ws = null;
    this.isReady = false;
    this.balanceSubscribed = false;
    this.contractSubscriptionIds.clear();

    window.setTimeout(() => { void this.connect(); }, 50);
  }

  subscribe(msgType: string, handler: MessageHandler) {
    if (!this.handlers.has(msgType)) this.handlers.set(msgType, new Set());
    this.handlers.get(msgType)!.add(handler);
  }

  unsubscribe(msgType: string, handler: MessageHandler) {
    const handlers = this.handlers.get(msgType);
    if (!handlers) return;
    handlers.delete(handler);
    if (handlers.size === 0) this.handlers.delete(msgType);
  }

  subscribeBalance() {
    if (this.balanceSubscribed) return;
    const now = Date.now();
    if (now - this.lastBalanceRequest < 5000) return;
    this.lastBalanceRequest = now;
    if (this.send({ balance: 1, subscribe: 1 })) this.balanceSubscribed = true;
  }

  subscribeTicks(symbol = 'R_100') {
    this.tickSubscriptions.add(symbol);
    if (this.send({ ticks: symbol, subscribe: 1 })) return true;
    return false;
  }

  subscribeContract(contractId: number) {
    if (!Number.isFinite(contractId) || contractId <= 0) return false;
    this.contractSubscriptions.add(contractId);
    return this.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
  }

  unsubscribeContract(contractId: number) {
    const subscriptionId = this.contractSubscriptionIds.get(contractId);
    if (subscriptionId && subscriptionId.trim()) this.send({ forget: subscriptionId });
    this.contractSubscriptionIds.delete(contractId);
    this.contractSubscriptions.delete(contractId);
  }

  getProfitTable(options?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC'; description?: 0 | 1 }) {
    const now = Date.now();
    if (now - this.lastProfitTableRequest < 10000) return false;
    this.lastProfitTableRequest = now;
    const requestedLimit = Number(options?.limit ?? 50);
    const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(50, Math.floor(requestedLimit))) : 50;
    const requestedOffset = Number(options?.offset ?? 0);
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
    const sort = options?.sort === 'ASC' ? 'ASC' : 'DESC';
    const description = options?.description === 0 ? 0 : 1;
    return this.send({ profit_table: 1, limit, offset, sort, description });
  }

  getProposal(symbol: string, contractType: string, amount: number, duration: number, barrier?: number) {
    const req_id = ++this.proposalRequestId;
    const payload: Record<string, any> = {
      proposal: 1,
      req_id,
      amount,
      basis: 'stake',
      contract_type: contractType,
      currency: 'USD',
      duration,
      duration_unit: 't',
      underlying_symbol: symbol,
    };
    if (
      barrier !== undefined &&
      (contractType === 'DIGITMATCH' ||
        contractType === 'DIGITDIFF' ||
        contractType === 'DIGITOVER' ||
        contractType === 'DIGITUNDER')
    ) {
      payload.barrier = String(barrier);
    }
    return this.send(payload) ? req_id : null;
  }

  buyContract(proposalId: string, price: number) {
    if (!proposalId || !Number.isFinite(price) || price <= 0) return false;
    return this.send({ buy: proposalId, price });
  }

  sellContract(contractId: number) {
    return this.send({ sell: contractId, price: 0 });
  }

  disconnect() {
    this.reconnectEnabled = false;
    this.reconnectGeneration++;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopKeepAlive();

    const old = this.ws;
    if (old) {
      old.onclose = null;
      try { old.close(); } catch {}
    }

    this.ws = null;
    this.isReady = false;
    this.balanceSubscribed = false;
    this.tickSubscriptions.clear();
    this.contractSubscriptions.clear();
    this.contractSubscriptionIds.clear();
  }
}
