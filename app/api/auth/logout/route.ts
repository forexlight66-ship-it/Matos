// app/api/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  // Always return to the host that handled the logout request. This avoids
  // redirecting a production deployment to a stale localhost URL.
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.delete('deriv_access_token');
  response.cookies.delete('deriv_refresh_token');
  response.cookies.delete('oauth_verifier');
  response.cookies.delete('oauth_state');
  response.cookies.delete('oauth_redirect_uri');
  return response;
}
