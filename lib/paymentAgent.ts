const BASE = 'https://api.derivws.com';

export const PAYMENT_AGENT_ID = 503;

export async function derivPaymentRequest(
  token: string,
  path: string,
  method: 'GET' | 'POST' | 'PATCH' = 'GET',
  body?: unknown,
) {
  const headers: Record<string,string> = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const appId = process.env.DERIV_APP_ID?.trim();
  if (appId) headers['Deriv-App-ID'] = appId;

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

export function getSupportedPaymentAgentCurrencies(profile: any): string[] {
  const currencies = Array.isArray(profile?.data?.currencies)
    ? profile.data.currencies
    : Array.isArray(profile?.currencies)
      ? profile.currencies
      : [];
  return [...new Set(
    currencies
      .map((item: any) => typeof item === 'string' ? item : item?.currency)
      .map((value: unknown) => String(value || '').trim().toUpperCase())
      .filter(Boolean),
  )];
}
