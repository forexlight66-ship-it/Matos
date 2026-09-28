import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const platformSession = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const derivAuthenticated = Boolean(request.cookies.get('deriv_access_token')?.value);
  const response = NextResponse.json({
    authenticated: Boolean(platformSession && derivAuthenticated),
    platformAuthenticated: Boolean(platformSession),
    derivAuthenticated,
    user: platformSession ? { id: platformSession.id, name: platformSession.name, email: platformSession.email, country: platformSession.country || null } : null,
  });
  if (platformSession?.country) response.cookies.set('matos_country', String(platformSession.country).toUpperCase(), {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
