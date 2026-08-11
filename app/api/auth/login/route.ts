// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthorizeUrl,
} from '@/lib/oauth';

/**
 * Resolve the OAuth callback URL.
 *
 * Production must use the public Render URL rather than a browser/local
 * development origin. This prevents an OAuth flow started on the deployed
 * app from accidentally sending Deriv to https://localhost:10000.
 *
 * Set APP_URL in production to the exact public URL registered in the Deriv
 * OAuth application, for example:
 *   https://matos-1n.onrender.com
 *
 * Render also exposes RENDER_EXTERNAL_URL, which is used as a fallback.
 * Local development continues to use the current request origin.
 */
function getCallbackUrl(request: NextRequest): string {
  const configuredAppUrl = process.env.APP_URL?.trim();
  const renderExternalUrl = process.env.RENDER_EXTERNAL_URL?.trim();

  let origin: string;

  if (process.env.NODE_ENV === 'production') {
    origin = configuredAppUrl || renderExternalUrl || request.nextUrl.origin;
  } else {
    origin = configuredAppUrl || request.nextUrl.origin;
  }

  // Remove a trailing slash so the callback is always exactly:
  // https://host/api/auth/callback
  origin = origin.replace(/\/+$/, '');

  return new URL('/api/auth/callback', `${origin}/`).toString();
}

export async function GET(request: NextRequest) {
  const clientId = process.env.DERIV_APP_ID?.trim();

  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete: DERIV_APP_ID is missing' },
      { status: 500 }
    );
  }

  const redirectUri = getCallbackUrl(request);

  // Never allow a production OAuth flow to use localhost.
  if (
    process.env.NODE_ENV === 'production' &&
    /localhost|127\.0\.0\.1/i.test(redirectUri)
  ) {
    console.error('[OAuth] Invalid production callback URL:', redirectUri);
    return NextResponse.json(
      {
        error:
          'OAuth server configuration is incomplete: production callback URL resolves to localhost. Set APP_URL to the deployed public URL.',
      },
      { status: 500 }
    );
  }

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  console.log('[OAuth] Starting login', {
    clientId,
    redirectUri,
    environment: process.env.NODE_ENV,
  });

  const response = NextResponse.redirect(
    getAuthorizeUrl(clientId, redirectUri, challenge, state)
  );

  const secure = request.nextUrl.protocol === 'https:';
  const cookieOptions = {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 600,
  };

  response.cookies.set('oauth_verifier', verifier, cookieOptions);
  response.cookies.set('oauth_state', state, cookieOptions);

  // Persist the exact URI used in the authorization request. The callback
  // uses this same value for the token exchange, as required by OAuth PKCE.
  response.cookies.set('oauth_redirect_uri', redirectUri, cookieOptions);

  return response;
}
