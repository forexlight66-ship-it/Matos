import { NextRequest, NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateState, getAuthorizeUrl } from '@/lib/oauth';

const PRODUCTION_APP_URL = 'https://matos-1n.onrender.com';
const PRODUCTION_CALLBACK_URL = `${PRODUCTION_APP_URL}/api/auth/callback`;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const clientId = process.env.DERIV_APP_ID?.trim();
  if (!clientId) return NextResponse.json({ error: 'OAuth server configuration is incomplete: DERIV_APP_ID is missing' }, { status: 500 });

  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();
  const redirectUri = PRODUCTION_CALLBACK_URL;

  const response = NextResponse.redirect(getAuthorizeUrl(clientId, redirectUri, challenge, state), { status: 302 });
  response.cookies.set('oauth_verifier', verifier, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  response.cookies.set('oauth_redirect_uri', redirectUri, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 600 });
  return response;
}
