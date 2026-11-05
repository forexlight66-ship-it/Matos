import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const sessionId = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
  const platformSession = await getSession(sessionId);
  const derivAuthenticated = Boolean(request.cookies.get('deriv_access_token')?.value);
  const response = NextResponse.json({
    authenticated: Boolean(platformSession && derivAuthenticated),
    platformAuthenticated: Boolean(platformSession),
    derivAuthenticated,
    user: platformSession ? {
      identity: createHash('sha256').update(String(sessionId || '')).digest('hex'),
    } : null,
  }, { headers: { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Vary: 'Cookie' } });
  if (platformSession?.country) response.cookies.set('matos_country', String(platformSession.country).toUpperCase(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
