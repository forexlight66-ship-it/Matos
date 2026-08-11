// hooks/useDeriv.ts

'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { DerivWebSocket } from '@/lib/websocket';

interface Balance {
  balance: number;
  currency: string;
  loginid?: string;
}

interface Tick {
  symbol: string;
  quote: number;
  epoch: number;
}

interface Transaction {
  id: number;
  action: string;
  amount: number;
  currency: string;
}

interface ProfitTransaction {
  contract_id: number;
  buy_price: number;
  sell_price: number | null;
  payout: number;
  purchase_time: number;
  sell_time: number | null;
  contract_type: string;
  longcode?: string;
  profit_loss?: number;
}

interface Proposal {
  id: string;
  ask_price: number;
  payout: number;
  stake: number;
  contract_type: string;
  symbol: string;
  duration: number;
  duration_unit: string;
  barrier?: number;
}

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

  useEffect(() => {
    let cancelled = false;
    let checkConnection: ReturnType<typeof setInterval> | null = null;

    const start = async () => {
      try {
        // The OAuth access token is stored HttpOnly. It must never be read
        // with document.cookie. Ask the same-origin authenticated endpoint
        // for the short-lived token needed by the browser WebSocket.
        const tokenResponse = await fetch('/api/auth/token', {
          cache: 'no-store',
          credentials: 'same-origin',
        });

        if (!tokenResponse.ok) {
          throw new Error('No authenticated Deriv session. Please log in again.');
        }

        const session = await tokenResponse.json();
        const token = session.accessToken;

        if (!token) {
          throw new Error('Authenticated session has no Deriv access token.');
        }

        if (cancelled) return;

        const appId = process.env.NEXT_PUBLIC_DERIV_APP_ID || process.env.DERIV_APP_ID || '1089';
        const ws = new DerivWebSocket(appId);
        wsRef.current = ws;

        ws.subscribe('*', (data) => {
          if (data.error) {
            setError(data.error.message || 'Unknown Deriv error');
          }
        });

        ws.subscribe('balance', (data) => {
          if (data.balance) setBalance(data.balance);
        });

        ws.subscribe('tick', (data) => {
          if (data.tick) setTick(data.tick);
        });

        ws.subscribe('authorize', (data) => {
          if (data.authorize) {
            setIsAuthorized(true);
            setError(null);
            ws.subscribeBalance();
            ws.subscribeTicks('R_100');
            ws.getProfitTable({ limit: 20, offset: 0, sort: 'DESC' });
          } else if (data.error) {
            setError(data.error.message || 'Deriv authorization failed');
            setIsAuthorized(false);
          }
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

        ws.subscribe('proposal', (data) => {
          if (data.proposal) {
            setProposal({
              id: data.proposal.id,
              ask_price: data.proposal.ask_price,
              payout: data.proposal.payout,
              stake: data.proposal.stake,
              contract_type: data.proposal.contract_type,
              symbol: data.proposal.symbol,
              duration: data.proposal.duration,
              duration_unit: data.proposal.duration_unit,
              barrier: data.proposal.barrier,
            });
          }
        });

        ws.subscribe('buy', (data) => {
          if (data.buy) {
            setBuying(false);
            ws.subscribeBalance();
            setTimeout(() => {
              ws.getProfitTable({ limit: 20, offset: 0, sort: 'DESC' });
            }, 1000);
          }
        });

        ws.connect();

        checkConnection = setInterval(() => {
          if (cancelled) return;
          if (ws.isConnected()) {
            ws.authorize(token);
            setIsConnected(true);
            if (checkConnection) {
              clearInterval(checkConnection);
              checkConnection = null;
            }
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
      if (checkConnection) clearInterval(checkConnection);
      wsRef.current?.disconnect();
      wsRef.current = null;
    };
  }, []);

  const fetchProfitTable = useCallback((options?: { limit?: number; offset?: number; sort?: 'ASC' | 'DESC' }) => {
    setLoadingProfit(true);
    wsRef.current?.getProfitTable({ description: 1, ...options });
  }, []);

  const getProposal = useCallback((symbol: string, contractType: string, amount: number, duration: number) => {
    wsRef.current?.getProposal(symbol, contractType, amount, duration);
  }, []);

  const buy = useCallback((proposalId: string, price: number) => {
    setBuying(true);
    wsRef.current?.buyContract(proposalId, price);
  }, []);

  const sell = useCallback((contractId: number) => {
    wsRef.current?.sellContract(contractId);
  }, []);

  return {
    balance,
    tick,
    transaction,
    isConnected,
    isAuthorized,
    error,
    profitTransactions,
    profitCount,
    proposal,
    loadingProfit,
    buying,
    fetchProfitTable,
    getProposal,
    buy,
    sell,
  };
}
