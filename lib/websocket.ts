// lib/websocket.ts

type MessageHandler = (data: any) => void;

/**
 * Deriv Options WebSocket client.
 *
 * OAuth2 tokens are not sent with `authorize` on the legacy websocket.
 * The authenticated URL must first be created server-side with the OAuth
 * Bearer token + Options OTP endpoint. This class therefore accepts the
 * ready-to-use OTP WebSocket URL and treats an open socket as authorized.
 */
export class DerivWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private isReady = false;

  constructor(wsUrl: string) {
    this.url = wsUrl;
  }

  connect() {
    if (
      this.ws?.readyState === WebSocket.OPEN ||
      this.ws?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      console.log('[DerivWS] Authenticated WebSocket connected');
      this.isReady = true;
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
      console.log('[DerivWS] Disconnected');
      this.isReady = false;
      this.ws = null;
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

  isConnected(): boolean {
    return this.isReady && this.ws?.readyState === WebSocket.OPEN;
  }

  /** OTP-authenticated sockets are already authorized when they open. */
  isAuthorized(): boolean {
    return this.isConnected();
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
    this.send({ balance: 1, subscribe: 1 });
  }

  subscribeTicks(symbol: string = 'R_100') {
    this.send({ ticks: symbol, subscribe: 1 });
  }

  getProfitTable(options?: {
    limit?: number;
    offset?: number;
    sort?: 'ASC' | 'DESC';
    description?: 0 | 1;
  }) {
    this.send({ profit_table: 1, description: 1, ...options });
  }

  getProposal(
    symbol: string,
    contractType: string,
    amount: number,
    duration: number,
    barrier?: number
  ) {
    const payload: Record<string, any> = {
      proposal: 1,
      amount,
      basis: 'stake',
      contract_type: contractType,
      currency: 'USD',
      duration,
      duration_unit: 's',
      underlying_symbol: symbol,
    };

    if (barrier !== undefined) payload.barrier = String(barrier);
    this.send(payload);
  }

  buyContract(proposalId: string, price: number) {
    this.send({ buy: proposalId, price });
  }

  sellContract(contractId: number) {
    this.send({ sell: contractId, price: 0 });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isReady = false;
  }
}
