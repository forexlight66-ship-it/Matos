import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { resolveDerivIdentityForRequest, attachDerivIdentityCookies } from '@/lib/derivRequestAuth';
import { rateLimit } from '@/lib/security';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ authenticated: false }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  const limited = await rateLimit(request, 'auth-token', 30, 60, String(session.id));
  if (limited) return limited;

  try {
    const identity = await resolveDerivIdentityForRequest(request, session.id);
    const response = NextResponse.json(
      { authenticated: true, accessToken: identity.accessToken },
      { headers: { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Vary: 'Cookie' } },
    );
    if (identity.refreshed) {
      response.cookies.set('deriv_access_token', identity.accessToken, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600,
      });
      if (identity.refreshToken) {
        response.cookies.set('deriv_refresh_token', identity.refreshToken, {
          httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
        });
      }
    }
    return attachDerivIdentityCookies(response, identity);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return NextResponse.json(
      { authenticated: false, error: error instanceof Error ? error.message : 'Deriv authentication required.' },
      { status: status >= 400 && status < 600 ? status : 401, headers: { 'Cache-Control': 'no-store, private' } },
    );
  }
}
