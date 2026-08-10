// app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/oauth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');

  if (oauthError) {
    console.error('[OAuth] Deriv authorization error:', oauthError, oauthErrorDescription);
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(oauthErrorDescription || oauthError)}`, request.url)
    );
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: 'Missing OAuth code or state parameter' },
      { status: 400 }
    );
  }

  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || state !== storedState) {
    console.error('[OAuth] State validation failed');
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  const verifier = request.cookies.get('oauth_verifier')?.value;
  if (!verifier) {
    return NextResponse.json({ error: 'Code verifier missing' }, { status: 400 });
  }

  const clientId = process.env.DERIV_APP_ID;
  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete' },
      { status: 500 }
    );
  }

  // Use the exact redirect URI that was used to start this OAuth flow.
  // This is critical because OAuth requires an exact redirect_uri match.
  const redirectUri =
    request.cookies.get('oauth_redirect_uri')?.value ||
    process.env.DERIV_REDIRECT_URI?.trim() ||
    `${request.nextUrl.origin}/api/auth/callback`;

  console.log('[OAuth] Processing callback', { redirectUri });

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
