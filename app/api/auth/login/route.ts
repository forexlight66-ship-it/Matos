// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateState, getAuthorizeUrl } from '@/lib/oauth';

export async function GET(request: NextRequest) {
  const clientId = process.env.DERIV_APP_ID;

  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete: DERIV_APP_ID is missing' },
      { status: 500 }
    );
  }

  // Always derive the callback from the actual public host that received
  // the login request. This prevents stale Render URLs from breaking OAuth
  // when the Render service URL changes.
  const configuredRedirectUri = process.env.DERIV_REDIRECT_URI?.trim();
  const redirectUri = configuredRedirectUri || `${request.nextUrl.origin}/api/auth/callback`;

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

  response.cookies.set('oauth_verifier', verifier, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  // Keep the exact redirect URI used for authorization so the callback
  // exchanges the code with the identical URI required by OAuth.
  response.cookies.set('oauth_redirect_uri', redirectUri, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
