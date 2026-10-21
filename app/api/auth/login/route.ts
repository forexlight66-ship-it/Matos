import { NextRequest, NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateState, getAuthorizeUrl } from '@/lib/oauth';
import { createDerivOAuthState } from '@/lib/platform-auth';

const PRODUCTION_APP_URL = 'https://matos-1n.onrender.com';
const PRODUCTION_CALLBACK_URL = `${PRODUCTION_APP_URL}/api/auth/callback`;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const clientId = process.env.DERIV_APP_ID?.trim();
  if (!clientId) return NextResponse.json({ error: 'OAuth server configuration is incomplete: DERIV_APP_ID is missing' }, { status: 500 });

  console.info('[OAuth] Login initiation requested.', { host: request.nextUrl.host, configuredClientId: Boolean(clientId) });
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();
  const redirectUri = PRODUCTION_CALLBACK_URL;
  const requestedReturnTo = request.nextUrl.searchParams.get('return_to') || '/';
  const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
    ? requestedReturnTo
    : '/';

  try {
    await createDerivOAuthState(state, verifier, redirectUri, returnTo);
  } catch (error) {
    console.error('[OAuth] Failed to persist login state:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json({ error: 'OAuth login could not be initialized. Please try again.' }, { status: 503 });
  }
  console.info('[OAuth] Redirecting browser to Deriv authorization.', { redirectUri, returnTo });
  const response = NextResponse.redirect(getAuthorizeUrl(clientId, redirectUri, challenge, state), { status: 302 });
  response.cookies.set('oauth_verifier', verifier, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('oauth_redirect_uri', redirectUri, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('oauth_return_to', returnTo, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
