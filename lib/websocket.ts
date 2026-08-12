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

  constructor(wsUrl: string) { this.url = wsUrl; }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      this.isReady = true;
      this.balanceSubscribed = false;
      this.tickSubscriptions.clear();
      this.contractSubscriptions.clear();
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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
      this.tickSubscriptions.clear();
      this.contractSubscriptions.clear();
    };
    this.ws.onerror = (error) => console.error('[DerivWS] Error:', error);
  }

  send(payload: any) {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(payload));
    return true;
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
    if (this.tickSubscriptions.has(symbol)) return;
    if (this.send({ ticks: symbol, subscribe: 1 })) this.tickSubscriptions.add(symbol);
  }

  // Live contract stream. This replaces rapid profit_table polling while a
  // short Digit contract is running and gives the UI the exact close result.
  subscribeContract(contractId: number) {
    if (!Number.isFinite(contractId) || contractId <= 0 || this.contractSubscriptions.has(contractId)) return;
    if (this.send({ proposal_open_contract: 1, contract_id: contractId, subscribe: 1 })) {
      this.contractSubscriptions.add(contractId);
    }
  }

  getProfitTable(options?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC'; description?: 0 | 1 }) {
    this.send({ profit_table: 1, ...options });
  }

  getProposal(symbol: string, contractType: string, amount: number, duration: number, barrier?: number) {
    const payload: Record<string, any> = {
      proposal: 1,
      amount,
      basis: 'stake',
      contract_type: contractType,
      currency: 'USD',
      duration,
      duration_unit: 't',
      underlying_symbol: symbol,
    };
    if (barrier !== undefined) payload.barrier = String(barrier);
    this.send(payload);
  }

  buyContract(proposalId: string, price: number) { return this.send({ buy: proposalId, price }); }
  sellContract(contractId: number) { return this.send({ sell: contractId, price: 0 }); }

  disconnect() {
    if (this.ws) this.ws.close();
    this.ws = null;
    this.isReady = false;
    this.balanceSubscribed = false;
    this.tickSubscriptions.clear();
    this.contractSubscriptions.clear();
  }
}
