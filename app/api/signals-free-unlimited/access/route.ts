import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  PLATFORM_SESSION_COOKIE,
  getDerivRefreshToken,
  saveDerivRefreshToken,
} from '@/lib/platform-auth';
import { getAuthenticatedDerivNickname } from '@/lib/derivNickname';
import { getSignalsFreeUnlimitedAccess } from '@/lib/paymentAgentRequests';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ active: false, eligibleClient: false }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const eligibleClient = String(session.country || '').trim().toUpperCase() === 'MZ';
  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) {
    return NextResponse.json({ active: false, eligibleClient, error: 'DERIV_APP_ID não está configurado.' }, {
      status: 500,
      headers: { 'Cache-Control': 'no-store, private' },
    });
  }

  const accessToken = request.cookies.get('deriv_access_token')?.value || '';
  const cookieRefreshToken = request.cookies.get('deriv_refresh_token')?.value || '';
  try {
    const storedRefreshToken = await getDerivRefreshToken(session.id);
    const identity = await getAuthenticatedDerivNickname({
      accessToken,
      refreshToken: cookieRefreshToken || storedRefreshToken,
      appId,
    });
    const access = await getSignalsFreeUnlimitedAccess(identity.nickname);
    const response = NextResponse.json({
      ...access,
      eligibleClient,
      derivNickname: identity.nickname,
    }, { headers: { 'Cache-Control': 'no-store, private' } });

    if (identity.refreshed) {
      response.cookies.set('deriv_access_token', identity.accessToken, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600,
      });
      if (identity.refreshToken) {
        response.cookies.set('deriv_refresh_token', identity.refreshToken, {
          httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
        });
        await saveDerivRefreshToken(session.id, identity.refreshToken);
      }
    }
    return response;
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    return NextResponse.json({
      active: false,
      eligibleClient,
      error: status === 401
        ? 'Ligue a sua conta Deriv para verificar o acesso aos sinais.'
        : error instanceof Error ? error.message : 'Não foi possível verificar o acesso.',
      code: status === 401 ? 'DERIV_NICKNAME_REQUIRED' : undefined,
    }, { status: status === 401 ? 401 : 502, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
