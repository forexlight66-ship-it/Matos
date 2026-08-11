// app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/oauth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');

  // OAuth providers may return an error instead of code/state when the user
  // cancels or authorization fails. Never present this as a server crash.
  if (oauthError) {
    console.error('[OAuth] Deriv authorization error:', {
      error: oauthError,
      description: oauthErrorDescription,
    });
    return NextResponse.redirect(
      new URL(
        `/?auth_error=${encodeURIComponent(oauthErrorDescription || oauthError)}`,
        request.url
      )
    );
  }

  // A callback URL opened manually, or a malformed provider redirect, does
  // not contain an authorization code. Send the user back to the app instead
  // of leaving them on a confusing JSON error page.
  if (!code || !state) {
    console.error('[OAuth] Callback missing code/state', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      callbackUrl: request.nextUrl.origin + request.nextUrl.pathname,
    });
    return NextResponse.redirect(
      new URL('/?auth_error=missing_oauth_parameters', request.url)
    );
  }

  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || state !== storedState) {
    console.error('[OAuth] State validation failed');
    return NextResponse.redirect(
      new URL('/?auth_error=invalid_oauth_state', request.url)
    );
  }

  const verifier = request.cookies.get('oauth_verifier')?.value;
  if (!verifier) {
    console.error('[OAuth] PKCE verifier missing');
    return NextResponse.redirect(
      new URL('/?auth_error=missing_oauth_verifier', request.url)
    );
  }

  const clientId = process.env.DERIV_APP_ID;
  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete' },
      { status: 500 }
    );
  }

  // Use the exact redirect URI used when the OAuth flow started. This must
  // remain identical for the authorization and token exchange requests.
  const redirectUri =
    request.cookies.get('oauth_redirect_uri')?.value ||
    process.env.DERIV_REDIRECT_URI?.trim() ||
    `${request.nextUrl.origin}/api/auth/callback`;

  console.log('[OAuth] Processing callback', {
    redirectUri,
    origin: request.nextUrl.origin,
  });

  try {
    const { access_token, refresh_token } = await exchangeCode(
      clientId,
      redirectUri,
      code,
      verifier
    );

    const response = NextResponse.redirect(new URL('/', request.url));
    const secure = request.nextUrl.protocol === 'https:';

    response.cookies.set('deriv_access_token', access_token, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600,
    });

    if (refresh_token) {
      response.cookies.set('deriv_refresh_token', refresh_token, {
        httpOnly: true,
        secure,
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
    return NextResponse.redirect(
      new URL('/?auth_error=oauth_exchange_failed', request.url)
    );
  }
}
