// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthorizeUrl,
} from '@/lib/oauth';

// IMPORTANT: OAuth redirect URIs must be identical to the URI registered in
// the Deriv application. In production we deliberately do NOT derive this
// from request.nextUrl.origin or a possibly stale environment variable.
const PRODUCTION_CALLBACK_URL =
  'https://matos-1n.onrender.com/api/auth/callback';

function getCallbackUrl(request: NextRequest): string {
  if (process.env.NODE_ENV === 'production') {
    return PRODUCTION_CALLBACK_URL;
  }

  // Local development may use an explicit callback URL when configured.
  const configuredRedirect = process.env.DERIV_REDIRECT_URL?.trim();
  if (configuredRedirect) return configuredRedirect;

  const configuredAppUrl = process.env.APP_URL?.trim();
  if (configuredAppUrl) {
    return `${configuredAppUrl.replace(/\/+$/, '')}/api/auth/callback`;
  }

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

  const redirectUri = getCallbackUrl(request);

  // Production must NEVER start an OAuth flow with localhost.
  if (
    process.env.NODE_ENV === 'production' &&
    !redirectUri.startsWith('https://matos-1n.onrender.com/api/auth/callback')
  ) {
    console.error('[OAuth] Invalid production callback URL:', redirectUri);
    return NextResponse.json(
      { error: 'Invalid production OAuth callback configuration' },
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
  response.cookies.set('oauth_redirect_uri', redirectUri, cookieOptions);

  return response;
}
