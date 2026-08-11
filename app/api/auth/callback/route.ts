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

  const clientId = process.env.DERIV_APP_ID?.trim();
  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete' },
      { status: 500 }
    );
  }

  // The login route stores the exact redirect URI used in the authorization
  // request. Reuse that exact value for the code exchange; OAuth requires an
  // exact match between authorization and token requests.
  const redirectUri = request.cookies.get('oauth_redirect_uri')?.value;
  if (!redirectUri) {
    console.error('[OAuth] Missing stored redirect URI');
    return NextResponse.redirect(
      new URL('/?auth_error=missing_oauth_redirect_uri', request.url)
    );
  }

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
