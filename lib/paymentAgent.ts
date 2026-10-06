import { randomUUID } from 'crypto';

const BASE = 'https://api.derivws.com';

export const PAYMENT_AGENT_ID = 503;

export async function derivPaymentRequest(
  token: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
  includeAppId = true,
) {
  const headers: Record<string,string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const appId = process.env.DERIV_APP_ID?.trim();
  if (includeAppId && appId) headers['Deriv-App-ID'] = appId;

  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.errors?.[0]?.detail?.message || data?.errors?.[0]?.code || 'Deriv payment request failed';
    const error = new Error(message) as Error & { status?: number; code?: string };
    error.status = response.status;
    error.code = data?.errors?.[0]?.code;
    throw error;
  }
  return data;
}


export async function getPaymentAgentProfile(token: string) {
  return derivPaymentRequest(token, `/payment-agents/v1/agents/${PAYMENT_AGENT_ID}`);
}

export async function transferWalletToOptions(token: string, amountUsd: number, requestId = randomUUID()) {
  const walletResult: any = await derivPaymentRequest(
    token,
    '/wallet/v1/wallets?conversion_currency=USD',
    'GET',
    undefined,
    false,
  );
  const wallets = Array.isArray(walletResult?.data) ? walletResult.data : [];
  const wallet = wallets.find((item: any) => Number(item?.balances?.USD?.balance || 0) >= amountUsd);
  if (!wallet?.wallet_id) throw new Error('Wallet USD do cliente não encontrada ou saldo insuficiente.');

  const optionsResult: any = await derivPaymentRequest(
    token,
    '/trading/v1/options/accounts',
    'GET',
    undefined,
    false,
  );
  const accounts = Array.isArray(optionsResult?.data) ? optionsResult.data : [];
  const optionsAccount = accounts.find((item: any) =>
    item?.account_type === 'real' && item?.status === 'active' && String(item?.currency || '').toUpperCase() === 'USD'
  );
  if (!optionsAccount?.account_id) {
    throw new Error('Conta Options real USD ativa não encontrada para esta conta Deriv.');
  }

  return derivPaymentRequest(
    token,
    '/wallet/v1/transfers/platforms',
    'POST',
    {
      wallet_id: String(wallet.wallet_id),
      amount: Number(amountUsd).toFixed(2),
      currency: 'USD',
      direction: 'from_wallet',
      platform_name: 'options',
      platform_account_id: String(optionsAccount.account_id),
      request_id: requestId,
      description: 'MozHyper Wallet to Options',
    },
    false,
  );
}

export function getSupportedPaymentAgentCurrencies(profile: any): string[] {
  const currencies: any[] = Array.isArray(profile?.data?.currencies)
    ? profile.data.currencies
    : Array.isArray(profile?.currencies)
      ? profile.currencies
      : [];
  const normalized = currencies
    .map((item: any) => typeof item === 'string' ? item : item?.currency)
    .map((value: unknown): string => String(value || '').trim().toUpperCase())
    .filter((value: string): boolean => Boolean(value));
  return Array.from(new Set<string>(normalized));
}
