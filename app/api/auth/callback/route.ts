// app/api/auth/callback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/oauth';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const storedState = request.cookies.get('oauth_state')?.value;
  if (!state || state !== storedState) {
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  const verifier = request.cookies.get('oauth_verifier')?.value;
  if (!verifier) {
    return NextResponse.json({ error: 'Code verifier missing' }, { status: 400 });
  }

  const clientId = process.env.DERIV_APP_ID!;
  const clientSecret = process.env.DERIV_CLIENT_SECRET!;
  const redirectUri = process.env.DERIV_REDIRECT_URI!;

  try {
    const { access_token, refresh_token } = await exchangeCode(
      clientId,
      clientSecret,
      redirectUri,
      code!,
      verifier
    );

    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.set('deriv_access_token', access_token, {
      httpOnly: true,
      secure: true,
      path: '/',
      maxAge: 3600,
    });
    if (refresh_token) {
      response.cookies.set('deriv_refresh_token', refresh_token, {
        httpOnly: true,
        secure: true,
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      });
    }
    response.cookies.delete('oauth_verifier');
    response.cookies.delete('oauth_state');
    return response;
  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json({ error: 'OAuth exchange failed' }, { status: 500 });
  }
}
