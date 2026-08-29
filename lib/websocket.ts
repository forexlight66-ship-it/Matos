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

  constructor(wsUrl: string) { this.url = wsUrl; }

  connect() {
    if (!this.reconnectEnabled) return;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.isReady = true;
      this.reconnectDelay = 1000;
      this.resubscribeAll();
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.msg_type === 'proposal_open_contract' && data.proposal_open_contract?.contract_id && data.subscription?.id) {
          this.contractSubscriptionIds.set(Number(data.proposal_open_contract.contract_id), String(data.subscription.id));
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
    this.ws.onclose = () => {
      this.isReady = false;
      this.ws = null;
      this.balanceSubscribed = false;
      this.contractSubscriptionIds.clear();
      if (this.reconnectEnabled) this.scheduleReconnect();
    };
    this.ws.onerror = (error) => console.error('[DerivWS] Error:', error);
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
    for (const contractId of this.contractSubscriptions) this.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 });
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

  isConnected(): boolean { return this.isReady && this.ws?.readyState === WebSocket.OPEN; }
  isAuthorized(): boolean { return this.isConnected(); }

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
    return this.send({ profit_table: 1, ...options });
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
    if (barrier !== undefined && (contractType === 'DIGITMATCH' || contractType === 'DIGITDIFF' || contractType === 'DIGITOVER' || contractType === 'DIGITUNDER')) {
      payload.barrier = String(barrier);
    }
    return this.send(payload) ? req_id : null;
  }

  buyContract(proposalId: string, price: number) {
    if (!proposalId || !Number.isFinite(price) || price <= 0) return false;
    return this.send({ buy: proposalId, price });
  }

  sellContract(contractId: number) { return this.send({ sell: contractId, price: 0 }); }

  disconnect() {
    this.reconnectEnabled = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) this.ws.close();
    this.ws = null;
    this.isReady = false;
    this.balanceSubscribed = false;
    this.tickSubscriptions.clear();
    this.contractSubscriptions.clear();
    this.contractSubscriptionIds.clear();
  }
}
