// app/api/auth/login/route.ts

import { NextResponse } from 'next/server';
import { generateCodeVerifier, generateCodeChallenge, generateState, getAuthorizeUrl } from '@/lib/oauth';

export async function GET() {
  const clientId = process.env.DERIV_APP_ID!;
  const redirectUri = process.env.DERIV_REDIRECT_URI!;
  
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = generateState();

  const response = NextResponse.redirect(getAuthorizeUrl(clientId, redirectUri, challenge, state));
  response.cookies.set('oauth_verifier', verifier, { httpOnly: true, secure: true, path: '/', maxAge: 600 });
  response.cookies.set('oauth_state', state, { httpOnly: true, secure: true, path: '/', maxAge: 600 });
  return response;
}
