// lib/websocket.ts

type MessageHandler = (data: any) => void;

export class DerivWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private isReady = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(appId: string = '1089') {
    this.url = `wss://ws.derivws.com/websockets/v3?app_id=${appId}`;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.url);
    this.ws.onopen = () => {
      console.log('[DerivWS] Connected');
      this.isReady = true;
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const msgType = data.msg_type;
        if (msgType && this.handlers.has(msgType)) {
          for (const fn of this.handlers.get(msgType)!) {
            fn(data);
          }
        }
        if (this.handlers.has('*')) {
          for (const fn of this.handlers.get('*')!) {
            fn(data);
          }
        }
      } catch (e) {
        console.error('[DerivWS] Parse error:', e);
      }
    };
    this.ws.onclose = () => {
      console.log('[DerivWS] Disconnected');
      this.isReady = false;
      if (!this.reconnectTimer) {
        this.reconnectTimer = setTimeout(() => this.connect(), 3000);
      }
    };
    this.ws.onerror = (error) => {
      console.error('[DerivWS] Error:', error);
    };
  }

  send(payload: any) {
    if (!this.isReady || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[DerivWS] Not connected, cannot send');
      return;
    }
    this.ws.send(JSON.stringify(payload));
  }

  /** Public connection-state check. Keeps the internal isReady flag private. */
  isConnected(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }

  subscribe(msgType: string, handler: MessageHandler) {
    if (!this.handlers.has(msgType)) this.handlers.set(msgType, new Set());
    this.handlers.get(msgType)!.add(handler);
  }

  unsubscribe(msgType: string, handler: MessageHandler) {
    if (this.handlers.has(msgType)) {
      this.handlers.get(msgType)!.delete(handler);
      if (this.handlers.get(msgType)!.size === 0) {
        this.handlers.delete(msgType);
      }
    }
  }

  authorize(token: string) {
    this.send({ authorize: token });
  }

  subscribeBalance() {
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks(symbol: string = 'R_100') {
    this.send({ ticks: symbol, subscribe: 1 });
  }

  getProfitTable(options?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC'; description?: 0 | 1 }) {
    this.send({ profit_table: 1, description: 1, ...options });
  }

  getProposal(symbol: string, contractType: string, amount: number, duration: number) {
    this.send({
      proposal: 1,
      amount,
      basis: 'stake',
      contract_type: contractType,
      currency: 'USD',
      duration,
      duration_unit: 's',
      symbol,
    });
  }

  buyContract(proposalId: string, price: number) {
    this.send({ buy: proposalId, price });
  }

  sellContract(contractId: number) {
    this.send({ sell: contractId });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isReady = false;
  }
}
