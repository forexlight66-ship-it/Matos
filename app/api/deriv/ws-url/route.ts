// app/api/deriv/ws-url/route.ts

import { NextRequest, NextResponse } from 'next/server';

const DERIV_API_BASE = 'https://api.derivws.com';

interface DerivAccount {
  account_id?: string;
  account_type?: string;
  status?: string;
  currency?: string;
}

function extractAccounts(payload: any): DerivAccount[] {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.accounts)) return data.accounts;
    if (data.account_id) return [data];
  }
  return [];
}

/**
 * Creates a short-lived authenticated Deriv WebSocket URL.
 *
 * OAuth access tokens are intentionally kept server-side. The browser only
 * receives the OTP-authenticated WebSocket URL returned by Deriv.
 */
export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get('deriv_access_token')?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'Not authenticated with Deriv' }, { status: 401 });
  }

  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) {
    return NextResponse.json({ error: 'DERIV_APP_ID is not configured' }, { status: 500 });
  }

  // Demo is the safe default. Set DERIV_ACCOUNT_TYPE=real in Render only when
  // this application is intended to trade the real account.
  const requestedType =
    request.nextUrl.searchParams.get('account_type') ||
    process.env.DERIV_ACCOUNT_TYPE ||
    'demo';
  const accountType = requestedType === 'real' ? 'real' : 'demo';

  try {
    const accountsResponse = await fetch(`${DERIV_API_BASE}/trading/v1/options/accounts`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Deriv-App-ID': appId,
      },
      cache: 'no-store',
    });

    const accountsPayload = await accountsResponse.json().catch(() => null);

    if (!accountsResponse.ok) {
      const message =
        accountsPayload?.errors?.[0]?.message ||
        accountsPayload?.error?.message ||
        `Unable to retrieve Deriv accounts (${accountsResponse.status})`;
      console.error('[Deriv] Account lookup failed:', message);
      return NextResponse.json({ error: message }, { status: accountsResponse.status });
    }

    const accounts = extractAccounts(accountsPayload);
    const account = accounts.find(
      (item) => item.account_id && String(item.account_type).toLowerCase() === accountType
    );

    if (!account?.account_id) {
      return NextResponse.json(
        {
          error: `No ${accountType} Options trading account is available for this Deriv user.`,
          availableAccounts: accounts
            .filter((item) => item.account_id)
            .map((item) => ({
              account_id: item.account_id,
              account_type: item.account_type,
              status: item.status,
              currency: item.currency,
            })),
        },
        { status: 404 }
      );
    }

    const otpResponse = await fetch(
      `${DERIV_API_BASE}/trading/v1/options/accounts/${encodeURIComponent(account.account_id)}/otp`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Deriv-App-ID': appId,
        },
        cache: 'no-store',
      }
    );

    const otpPayload = await otpResponse.json().catch(() => null);

    if (!otpResponse.ok) {
      const message =
        otpPayload?.errors?.[0]?.message ||
        otpPayload?.error?.message ||
        `Unable to create Deriv WebSocket session (${otpResponse.status})`;
      console.error('[Deriv] OTP request failed:', message);
      return NextResponse.json({ error: message }, { status: otpResponse.status });
    }

    const wsUrl = otpPayload?.data?.url;
    if (!wsUrl || typeof wsUrl !== 'string') {
      console.error('[Deriv] OTP response did not contain data.url');
      return NextResponse.json(
        { error: 'Deriv did not return an authenticated WebSocket URL' },
        { status: 502 }
      );
    }

    return NextResponse.json(
      {
        wsUrl,
        account: {
          account_id: account.account_id,
          account_type: account.account_type,
          currency: account.currency,
        },
      },
      {
        headers: {
          'Cache-Control': 'no-store, private',
        },
      }
    );
  } catch (error) {
    console.error('[Deriv] WebSocket session setup failed:', error);
    return NextResponse.json(
      { error: 'Unable to establish Deriv WebSocket session' },
      { status: 502 }
    );
  }
}
