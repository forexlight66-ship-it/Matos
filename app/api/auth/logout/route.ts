// app/api/auth/logout/route.ts

import { NextRequest, NextResponse } from 'next/server';

function getPublicOrigin(request: NextRequest) {
  // Render/Next can expose the internal request URL to server code.
  // Prefer the forwarded public host/protocol so logout never redirects
  // the browser to localhost:10000.
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');

  if (forwardedHost) {
    const host = forwardedHost.split(',')[0].trim();
    const proto = (forwardedProto?.split(',')[0].trim() || 'https');
    return `${proto}://${host}`;
  }

  const host = request.headers.get('host');
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
    const proto = request.headers.get('x-forwarded-proto') || 'https';
    return `${proto}://${host}`;
  }

  const requestOrigin = new URL(request.url).origin;
  if (!/localhost|127\.0\.0\.1/i.test(requestOrigin)) return requestOrigin;

  // Production fallback. This is only used when the platform hides the
  // public host and the incoming server URL is an internal localhost URL.
  return 'https://matos-1n.onrender.com';
}

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', `${getPublicOrigin(request)}/`));

  response.cookies.delete('deriv_access_token');
  response.cookies.delete('deriv_refresh_token');
  response.cookies.delete('oauth_verifier');
  response.cookies.delete('oauth_state');
  response.cookies.delete('oauth_redirect_uri');

  return response;
}
