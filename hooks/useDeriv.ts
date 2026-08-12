// hooks/useDeriv.ts

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DerivWebSocket } from '@/lib/websocket';

interface Balance { balance: number; currency: string; loginid?: string; }
interface Tick { symbol: string; quote: number; epoch: number; }
interface Transaction { id: number; action: string; amount: number; currency: string; }
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
    wsRef.current?.getProfitTable({ limit: 20, offset: 0, sort: 'DESC', description: 1 });
  }, []);

  useEffect(() => {
    let cancelled = false;
    let connectionCheck: ReturnType<typeof setInterval> | null = null;
    let profitRefresh: ReturnType<typeof setInterval> | null = null;

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
          if (data.transaction) {
            setTransaction(data.transaction);
            // A completed contract changes the balance and profit table.
            refreshProfitTable();
          }
        });

        ws.subscribe('profit_table', (data) => {
          if (data.profit_table) {
            setProfitTransactions(data.profit_table.transactions || []);
            setProfitCount(data.profit_table.count || 0);
            setLoadingProfit(false);
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
            // Do not subscribe to balance again: balance is already a live subscription.
            refreshProfitTable();
          }
        });

        ws.connect();

        connectionCheck = setInterval(() => {
          if (cancelled) return;
          const connected = ws.isConnected();
          setIsConnected(connected);
          // The OTP WebSocket URL is already authenticated by Deriv.
          setIsAuthorized(connected);
          if (connected) {
            ws.subscribeBalance();
            ws.subscribeTicks('R_100');
            refreshProfitTable();
            if (connectionCheck) { clearInterval(connectionCheck); connectionCheck = null; }
          }
        }, 250);

        // Keep the closed-operation/P&L card fresh, especially after short digit contracts close.
        profitRefresh = setInterval(() => {
          if (!cancelled && ws.isConnected()) refreshProfitTable();
        }, 2000);
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
      if (profitRefresh) clearInterval(profitRefresh);
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
    wsRef.current?.getProposal(symbol, contractType, amount, duration, barrier);
  }, []);

  const buy = useCallback((proposalId: string, price: number) => {
    setBuying(true);
    wsRef.current?.buyContract(proposalId, price);
  }, []);

  const sell = useCallback((contractId: number) => { wsRef.current?.sellContract(contractId); }, []);

  return { balance, tick, transaction, isConnected, isAuthorized, error, profitTransactions, profitCount, proposal, loadingProfit, buying, subscribeTicks, fetchProfitTable, getProposal, buy, sell };
}
