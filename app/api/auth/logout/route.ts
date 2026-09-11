import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

function getPublicOrigin(request: NextRequest) {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto');
  if (forwardedHost) return `${(forwardedProto?.split(',')[0].trim() || 'https')}://${forwardedHost.split(',')[0].trim()}`;
  const host = request.headers.get('host');
  if (host && !host.startsWith('localhost') && !host.startsWith('127.0.0.1')) return `https://${host}`;
  return 'https://matos-1n.onrender.com';
}

export async function GET(request: NextRequest) {
  await deleteSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const response = NextResponse.redirect(new URL('/', `${getPublicOrigin(request)}/`));
  for (const name of [PLATFORM_SESSION_COOKIE, 'deriv_access_token', 'deriv_refresh_token', 'oauth_verifier', 'oauth_state', 'oauth_redirect_uri']) response.cookies.delete(name);
  return response;
}
