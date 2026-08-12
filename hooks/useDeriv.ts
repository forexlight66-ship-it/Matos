// hooks/useDeriv.ts

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DerivWebSocket } from '@/lib/websocket';

interface Balance { balance: number; currency: string; loginid?: string; }
interface Tick { symbol: string; quote: number; epoch: number; }
interface Transaction { id: number; action: string; amount: number; currency: string; contract_id?: number; }
interface ProfitTransaction { contract_id: number; buy_price: number; sell_price: number | null; payout: number; purchase_time: number; sell_time: number | null; contract_type: string; longcode?: string; profit_loss?: number; }
interface Proposal { id: string; ask_price: number; payout: number; stake: number; contract_type: string; symbol: string; duration: number; duration_unit: string; barrier?: number; }

export function useDeriv() {
  const wsRef = useRef<DerivWebSocket | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [tick, setTick] = useState<Tick | null>(null);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profitTransactions, setProfitTransactions] = useState<ProfitTransaction[]>([]);
  const [profitCount, setProfitCount] = useState(0);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loadingProfit, setLoadingProfit] = useState(false);
  const [buying, setBuying] = useState(false);

  const refreshProfitTable = useCallback(() => {
    // profit_table is deliberately used sparingly. Deriv rate-limits this
    // endpoint, so active contracts are tracked through proposal_open_contract.
    wsRef.current?.getProfitTable({ limit: 20, offset: 0, sort: 'DESC', description: 1 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let connectionCheck: ReturnType<typeof setInterval> | null = null;
    let initialProfitLoaded = false;
    let lastProfitRefresh = 0;

    const refreshProfitThrottled = (force = false) => {
      const now = Date.now();
      if (!force && now - lastProfitRefresh < 5000) return;
      lastProfitRefresh = now;
      setLoadingProfit(true);
      refreshProfitTable();
    };

    const start = async () => {
      try {
        const response = await fetch('/api/deriv/ws-url?account_type=demo', { cache: 'no-store', credentials: 'same-origin' });
        const session = await response.json().catch(() => null);
        if (!response.ok || !session?.wsUrl) throw new Error(session?.error || `Unable to create Deriv WebSocket session (${response.status})`);
        if (cancelled) return;

        const ws = new DerivWebSocket(session.wsUrl);
        wsRef.current = ws;

        ws.subscribe('*', (data) => {
          if (data.error) {
            const message = data.error.message || 'Unknown Deriv error';
            console.error('[Deriv] WebSocket error:', data.error);
            // Rate limiting profit_table must not break trading/UI state.
            if (data.error.code === 'RateLimit' || /rate.?limit/i.test(message)) {
              setLoadingProfit(false);
              return;
            }
            // A stale contract can disappear from profit_table immediately after
            // purchase. It is not a fatal WebSocket/session error.
            if (/unknown contract/i.test(message) && data.echo_req?.profit_table) {
              setLoadingProfit(false);
              return;
            }
            setError(message);
            if (data.error.code === 'AuthorizationRequired') setIsAuthorized(false);
            return;
          }
          if (data.msg_type === 'authorize') {
            setIsAuthorized(Boolean(data.authorize));
          }
        });

        ws.subscribe('balance', (data) => {
          if (data.balance) setBalance(data.balance);
        });

        ws.subscribe('tick', (data) => {
          if (data.tick) setTick(data.tick);
        });

        ws.subscribe('transaction', (data) => {
          if (data.transaction) setTransaction(data.transaction);
        });

        ws.subscribe('profit_table', (data) => {
          if (data.profit_table) {
            setProfitTransactions(data.profit_table.transactions || []);
            setProfitCount(data.profit_table.count || 0);
            setLoadingProfit(false);
          }
        });

        // This is the authoritative live result for a just-bought contract.
        // It updates P/L immediately when the 5-tick contract closes.
        ws.subscribe('proposal_open_contract', (data) => {
          const c = data.proposal_open_contract;
          if (!c) return;

          const contractId = Number(c.contract_id);
          const buyPrice = Number(c.buy_price || c.buy_price === 0 ? c.buy_price : 0);
          const payout = Number(c.payout || 0);
          const profitLoss = Number(c.profit_loss ?? (c.is_sold ? payout - buyPrice : 0));
          const purchaseTime = Number(c.purchase_time || Math.floor(Date.now() / 1000));
          const sellTime = c.sell_time ? Number(c.sell_time) : null;

          if (c.is_sold || c.status === 'won' || c.status === 'lost') {
            const closed: ProfitTransaction = {
              contract_id: contractId,
              buy_price: buyPrice,
              sell_price: c.sell_price == null ? null : Number(c.sell_price),
              payout,
              purchase_time: purchaseTime,
              sell_time: sellTime,
              contract_type: c.contract_type || '',
              longcode: c.longcode,
              profit_loss: profitLoss,
            };
            setProfitTransactions(prev => [closed, ...prev.filter(x => x.contract_id !== contractId)].slice(0, 20));
            setProfitCount(prev => Math.max(prev, 1));
            setLoadingProfit(false);

            // Refresh the historical table once after closure, but never in a
            // tight loop. The live contract data above is what drives the UI.
            window.setTimeout(() => {
              if (!cancelled) refreshProfitThrottled();
            }, 1500);
          }
        });

        ws.subscribe('proposal', (data) => {
          if (data.proposal) {
            setProposal({
              id: data.proposal.id,
              ask_price: data.proposal.ask_price,
              payout: data.proposal.payout,
              stake: data.proposal.stake,
              contract_type: data.proposal.contract_type,
              symbol: data.proposal.symbol || data.proposal.underlying_symbol,
              duration: data.proposal.duration,
              duration_unit: data.proposal.duration_unit,
              barrier: data.proposal.barrier,
            });
            setError(null);
          }
        });

        ws.subscribe('buy', (data) => {
          if (data.buy) {
            setBuying(false);
            const contractId = Number(data.buy.contract_id);
            if (Number.isFinite(contractId) && contractId > 0) {
              ws.subscribeContract(contractId);
            }
            // Do not call profit_table immediately after buying: Deriv may
            // briefly report the new contract as unknown and rate-limit repeats.
          }
        });

        ws.connect();

        connectionCheck = setInterval(() => {
          if (cancelled) return;
          const connected = ws.isConnected();
          setIsConnected(connected);
          setIsAuthorized(connected);
          if (connected) {
            ws.subscribeBalance();
            ws.subscribeTicks('R_100');
            if (!initialProfitLoaded) {
              initialProfitLoaded = true;
              refreshProfitThrottled(true);
            }
            if (connectionCheck) { clearInterval(connectionCheck); connectionCheck = null; }
          }
        }, 250);
      } catch (err) {
        if (!cancelled) {
          setIsConnected(false);
          setIsAuthorized(false);
          setError(err instanceof Error ? err.message : 'Unable to initialize Deriv connection');
        }
      }
    };

    start();
    return () => {
      cancelled = true;
      if (connectionCheck) clearInterval(connectionCheck);
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, [refreshProfitTable]);

  const subscribeTicks = useCallback((symbol: string) => {
    wsRef.current?.subscribeTicks(symbol);
  }, []);

  const fetchProfitTable = useCallback((options?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC' }) => {
    setLoadingProfit(true);
    wsRef.current?.getProfitTable({ description: 1, ...options });
  }, []);

  const getProposal = useCallback((symbol: string, contractType: string, amount: number, duration: number, barrier = 5) => {
    wsRef.current?.getProposal(symbol, contractType, Math.max(0.5, amount), duration, barrier);
  }, []);

  const buy = useCallback((proposalId: string, price: number) => {
    setBuying(true);
    const sent = wsRef.current?.buyContract(proposalId, price);
    if (!sent) setBuying(false);
  }, []);

  const sell = useCallback((contractId: number) => { wsRef.current?.sellContract(contractId); }, []);

  return { balance, tick, transaction, isConnected, isAuthorized, error, profitTransactions, profitCount, proposal, loadingProfit, buying, subscribeTicks, fetchProfitTable, getProposal, buy, sell };
}
