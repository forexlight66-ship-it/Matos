import { NextRequest, NextResponse } from 'next/server';
import { resolveDerivIdentityForRequest, attachDerivIdentityCookies } from '@/lib/derivRequestAuth';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { rateLimit } from '@/lib/security';

const DERIV_API_BASE = 'https://api.derivws.com';
interface DerivAccount { account_id?: string; account_type?: string; status?: string; currency?: string; }

// Account IDs are stable for a signed-in Deriv session. Cache only the non-secret
// account metadata briefly so reconnects need one Deriv REST call (OTP), not two.
const ACCOUNT_CACHE_TTL_MS = 60_000;
const accountCache = new Map<string, { account: DerivAccount; expiresAt: number }>();

function extractAccounts(payload: any): DerivAccount[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.accounts)) return data.accounts;
    if (data.account_id) return [data];
  }
  return [];
}

async function getAccounts(token: string) {
  let response: Response | null = null;
  let payload: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    response = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    payload = await response.json().catch(() => null);
    if (response.ok || (response.status !== 503 && response.status !== 504)) break;
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 350));
  }
  return { response: response!, payload };
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Sessão Matos necessária.', code: 'PLATFORM_AUTH_REQUIRED' }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  const limited = await rateLimit(request, 'deriv-ws-url', 30, 60, String(session.id));
  if (limited) return limited;

  if (!process.env.DERIV_APP_ID?.trim()) {
    return NextResponse.json({ error: 'DERIV_APP_ID is not configured' }, { status: 500 });
  }

  const accountTypeParam = request.nextUrl.searchParams.get('account_type');
  const requestedType = (accountTypeParam === null
    ? (process.env.DERIV_ACCOUNT_TYPE || 'demo')
    : accountTypeParam).trim().toLowerCase();
  if (requestedType !== 'demo' && requestedType !== 'real') {
    return NextResponse.json({ error: 'Tipo de conta inválido. Escolha Demo ou Real.', code: 'INVALID_ACCOUNT_TYPE' }, { status: 400 });
  }
  const accountType = requestedType as 'demo' | 'real';

  try {
    const identity = await resolveDerivIdentityForRequest(request, session.id);
    const accountCacheKey = `${session.id}:${accountType}`;
    const cachedAccount = accountCache.get(accountCacheKey);
    let account = cachedAccount && cachedAccount.expiresAt > Date.now()
      ? cachedAccount.account
      : undefined;

    if (!account) {
      accountCache.delete(accountCacheKey);
      const accountsResult = await getAccounts(identity.accessToken);

      if (!accountsResult.response.ok) {
        const status = accountsResult.response.status;
        const message = accountsResult.payload?.errors?.[0]?.message
          || accountsResult.payload?.error?.message
          || `Deriv service is temporarily unavailable (${status}). Please try again.`;
        return attachDerivIdentityCookies(
          NextResponse.json(
            { error: message, code: 'ACCOUNT_LOOKUP_FAILED', reconnect: status === 401 || status === 403 },
            { status, headers: { 'Cache-Control': 'no-store, private' } },
          ),
          identity,
        );
      }

      const accounts = extractAccounts(accountsResult.payload);
      account = accounts.find(item => item.account_id && String(item.account_type).toLowerCase() === accountType);
      if (account?.account_id) {
        accountCache.set(accountCacheKey, { account, expiresAt: Date.now() + ACCOUNT_CACHE_TTL_MS });
      }
    }
    if (!account?.account_id) {
      return attachDerivIdentityCookies(
        NextResponse.json({
          error: `No ${accountType} Options trading account is available for this Deriv user.`,
          code: 'OPTIONS_ACCOUNT_NOT_FOUND',
          availableAccounts: accounts.filter(item => item.account_id).map(item => ({
            account_id: item.account_id,
            account_type: item.account_type,
            status: item.status,
            currency: item.currency,
          })),
        }, { status: 404, headers: { 'Cache-Control': 'no-store, private' } }),
        identity,
      );
    }

    const otpResponse = await fetch(
      `${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(account.account_id)}/otp`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${identity.accessToken}` },
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      },
    );
    const otpPayload = await otpResponse.json().catch(() => null);
    if (!otpResponse.ok) {
      const message = otpPayload?.errors?.[0]?.message || otpPayload?.error?.message || `Unable to create Deriv WebSocket session (${otpResponse.status})`;
      return attachDerivIdentityCookies(
        NextResponse.json({ error: message, code: 'OTP_FAILED' }, {
          status: otpResponse.status,
          headers: { 'Cache-Control': 'no-store, private' },
        }),
        identity,
      );
    }

    const wsUrl = otpPayload?.data?.url;
    if (!wsUrl || typeof wsUrl !== 'string') {
      return NextResponse.json({ error: 'Deriv did not return an authenticated WebSocket URL', code: 'OTP_URL_MISSING' }, {
        status: 502,
        headers: { 'Cache-Control': 'no-store, private' },
      });
    }

    const response = NextResponse.json(
      { wsUrl, account: { account_id: account.account_id, account_type: account.account_type, currency: account.currency } },
      { headers: { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Vary: 'Cookie' } },
    );
    return attachDerivIdentityCookies(response, identity);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 502);
    const code = String((error as { code?: string })?.code || 'SESSION_SETUP_FAILED');
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to establish Deriv WebSocket session. Please try again.', code },
      { status: status >= 400 && status < 600 ? status : 502, headers: { 'Cache-Control': 'no-store, private' } },
    );
  }
}
