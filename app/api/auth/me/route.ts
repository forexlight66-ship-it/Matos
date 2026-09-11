import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const platformSession = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const derivAuthenticated = Boolean(request.cookies.get('deriv_access_token')?.value);

  return NextResponse.json({
    authenticated: Boolean(platformSession && derivAuthenticated),
    platformAuthenticated: Boolean(platformSession),
    derivAuthenticated,
    user: platformSession ? { id: platformSession.id, name: platformSession.name, email: platformSession.email } : null,
  });
}
