// app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/oauth';

const PRODUCTION_APP_URL = 'https://matos-1n.onrender.com';
const PRODUCTION_CALLBACK_URL = `${PRODUCTION_APP_URL}/api/auth/callback`;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');

  // Never redirect OAuth failures to request.url-derived localhost. The user
  // must always return to the public application URL.
  const appUrl = PRODUCTION_APP_URL;
  const errorRedirect = (reason: string) =>
    NextResponse.redirect(
      `${appUrl}/?auth_error=${encodeURIComponent(reason)}`,
      { status: 302 }
    );

  if (oauthError) {
    console.error('[OAuth] Deriv authorization error:', {
      error: oauthError,
      description: oauthErrorDescription,
    });
    return errorRedirect(oauthErrorDescription || oauthError);
  }

  if (!code || !state) {
    console.error('[OAuth] Callback missing code/state');
    return errorRedirect('missing_oauth_parameters');
  }

  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || state !== storedState) {
    console.error('[OAuth] State validation failed');
    return errorRedirect('invalid_oauth_state');
  }

  const verifier = request.cookies.get('oauth_verifier')?.value;
  if (!verifier) {
    console.error('[OAuth] PKCE verifier missing');
    return errorRedirect('missing_oauth_verifier');
  }

  const clientId = process.env.DERIV_APP_ID?.trim();
  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete' },
      { status: 500 }
    );
  }

  // IMPORTANT: this MUST exactly match the URI registered in the Deriv app.
  // Do not read redirect_uri from a cookie, request origin, or environment
  // variable. This prevents stale localhost:10000 values from being used.
  const redirectUri = PRODUCTION_CALLBACK_URL;

  console.log('[OAuth] Exchanging authorization code', {
    redirectUri,
    requestOrigin: request.nextUrl.origin,
  });

  try {
    const { access_token, refresh_token } = await exchangeCode(
      clientId,
      redirectUri,
      code,
      verifier
    );

    const response = NextResponse.redirect(appUrl + '/', { status: 302 });

    response.cookies.set('deriv_access_token', access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });

    if (refresh_token) {
      response.cookies.set('deriv_refresh_token', refresh_token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }

    response.cookies.delete('oauth_verifier');
    response.cookies.delete('oauth_state');
    response.cookies.delete('oauth_redirect_uri');

    return response;
  } catch (error) {
    console.error('[OAuth] Callback/token exchange failed:', error);

    // Keep the real failure in Render logs, but give the browser a useful
    // stable error without exposing OAuth credentials or token data.
    const message = error instanceof Error ? error.message : String(error);
    const safeReason = message
      .replace(/https?:\/\/[^\s]+/gi, '[url]')
      .slice(0, 220);

    return errorRedirect(`oauth_exchange_failed:${safeReason}`);
  }
}
