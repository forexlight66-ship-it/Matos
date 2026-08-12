// app/api/auth/login/route.ts

import { NextRequest, NextResponse } from 'next/server';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  getAuthorizeUrl,
} from '@/lib/oauth';

// Production is always the public Render URL. Never derive the OAuth
// callback from request.nextUrl.origin because that can accidentally create
// a localhost:10000 redirect URI.
const PRODUCTION_APP_URL = 'https://matos-1n.onrender.com';
const PRODUCTION_CALLBACK_URL = `${PRODUCTION_APP_URL}/api/auth/callback`;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(_request: NextRequest) {
  const clientId = process.env.DERIV_APP_ID?.trim();

  if (!clientId) {
    console.error('[OAuth] Missing DERIV_APP_ID');
    return NextResponse.json(
      { error: 'OAuth server configuration is incomplete: DERIV_APP_ID is missing' },
      { status: 500 }
    );
  }

  // IMPORTANT: production OAuth MUST use this exact URI. Do not use
  // DERIV_REDIRECT_URL, APP_URL, request.nextUrl.origin, localhost, or any
  // browser-provided value here.
  const redirectUri = PRODUCTION_CALLBACK_URL;

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  console.log('[OAuth] Starting login', {
    clientId,
    redirectUri,
    nodeEnv: process.env.NODE_ENV,
  });

  const response = NextResponse.redirect(
    getAuthorizeUrl(clientId, redirectUri, challenge, state),
    { status: 302 }
  );

  // OAuth cookies belong to the public Render origin. Secure must be true
  // because the application is HTTPS in production.
  response.cookies.set('oauth_verifier', verifier, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  response.cookies.set('oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  response.cookies.set('oauth_redirect_uri', redirectUri, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });

  return response;
}
