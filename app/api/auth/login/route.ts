// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthorizeUrl,
} from '@/lib/oauth';

/**
 * Build the callback URL from the public URL that the user actually opened.
 *
 * Do not use DERIV_REDIRECT_URI here: a stale value such as
 * https://localhost:10000/... can send a production user to the wrong host.
 * Deriv requires the redirect_uri used here to exactly match a URI registered
 * in the OAuth application.
 */
function getCallbackUrl(request: NextRequest): string {
  return new URL('/api/auth/callback', request.nextUrl.origin).toString();
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

  // Always use the public origin of the current request. This prevents a
  // stale localhost/old Render URL from being sent to Deriv in production.
  const redirectUri = getCallbackUrl(request);

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  console.log('[OAuth] Starting login', {
    clientId,
    redirectUri,
    origin: request.nextUrl.origin,
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

  // Persist the exact URI used in the authorization request so the callback
  // sends the identical URI to the token endpoint.
  response.cookies.set('oauth_redirect_uri', redirectUri, cookieOptions);

  return response;
}
