// app/api/deriv/ws-url/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { refreshAccessToken } from '@/lib/oauth';

const DERIV_API_BASE = 'https://api.derivws.com';

interface DerivAccount { account_id?: string; account_type?: string; status?: string; currency?: string; }

function extractAccounts(payload: any): DerivAccount[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.accounts)) return data.accounts;
    if (data.account_id) return [data];
  }
  return [];
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getAccounts(token: string, appId: string) {
  let response: Response | null = null;
  let payload: any = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    response = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Deriv-App-ID': appId },
      cache: 'no-store',
    });
    payload = await response.json().catch(() => null);
    if (response.ok || (response.status !== 503 && response.status !== 504)) break;
    if (attempt < 2) await wait(700 * (attempt + 1));
  }
  return { response: response!, payload };
}

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const accessCookie = request.cookies.get('deriv_access_token')?.value || '';
  const refreshCookie = request.cookies.get('deriv_refresh_token')?.value || '';
  if (!accessCookie && !refreshCookie) return NextResponse.json({ error: 'Not authenticated with Deriv', code: 'AUTH_REQUIRED' }, { status: 401 });

  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) return NextResponse.json({ error: 'DERIV_APP_ID is not configured' }, { status: 500 });

  const requestedType = request.nextUrl.searchParams.get('account_type') || process.env.DERIV_ACCOUNT_TYPE || 'demo';
  const accountType = requestedType === 'real' ? 'real' : 'demo';
  let accessToken = accessCookie;
  let refreshed = false;
  let rotatedRefreshToken: string | undefined;

  try {
    let accountsResult = await getAccounts(accessToken, appId);

    if ((accountsResult.response.status === 401 || accountsResult.response.status === 403) && refreshCookie) {
      const refreshedToken = await refreshAccessToken(appId, refreshCookie);
      accessToken = refreshedToken.access_token;
      rotatedRefreshToken = refreshedToken.refresh_token;
      refreshed = true;
      accountsResult = await getAccounts(accessToken, appId);
    }

    if (!accountsResult.response.ok) {
      const message = accountsResult.payload?.errors?.[0]?.message || accountsResult.payload?.error?.message ||
        `Deriv service is temporarily unavailable (${accountsResult.response.status}). Please try again.`;
      console.error('[Deriv] Account lookup failed:', accountsResult.response.status, message);
      const response = NextResponse.json({ error: message, code: 'ACCOUNT_LOOKUP_FAILED' }, { status: accountsResult.response.status });
      if (refreshed) response.cookies.set('deriv_access_token', accessToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
      return response;
    }

    const accounts = extractAccounts(accountsResult.payload);
    const account = accounts.find(item => item.account_id && String(item.account_type).toLowerCase() === accountType);
    if (!account?.account_id) {
      return NextResponse.json({ error: `No ${accountType} Options trading account is available for this Deriv user.`, code: 'OPTIONS_ACCOUNT_NOT_FOUND', availableAccounts: accounts.filter(item => item.account_id).map(item => ({ account_id: item.account_id, account_type: item.account_type, status: item.status, currency: item.currency })) }, { status: 404 });
    }

    const otpResponse = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(account.account_id)}/otp`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Deriv-App-ID': appId },
      cache: 'no-store',
    });
    const otpPayload = await otpResponse.json().catch(() => null);
    if (!otpResponse.ok) {
      const message = otpPayload?.errors?.[0]?.message || otpPayload?.error?.message || `Unable to create Deriv WebSocket session (${otpResponse.status})`;
      console.error('[Deriv] OTP request failed:', otpResponse.status, message);
      return NextResponse.json({ error: message, code: 'OTP_FAILED' }, { status: otpResponse.status });
    }

    const wsUrl = otpPayload?.data?.url;
    if (!wsUrl || typeof wsUrl !== 'string') return NextResponse.json({ error: 'Deriv did not return an authenticated WebSocket URL', code: 'OTP_URL_MISSING' }, { status: 502 });

    const response = NextResponse.json({ wsUrl, account: { account_id: account.account_id, account_type: account.account_type, currency: account.currency } }, { headers: { 'Cache-Control': 'no-store, private' } });
    if (refreshed) {
      response.cookies.set('deriv_access_token', accessToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
      if (rotatedRefreshToken) response.cookies.set('deriv_refresh_token', rotatedRefreshToken, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    }
    return response;
  } catch (error) {
    console.error('[Deriv] WebSocket session setup failed:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to establish Deriv WebSocket session. Please try again.', code: 'SESSION_SETUP_FAILED' }, { status: 502 });
  }
}
