import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { refreshAccessToken } from '@/lib/oauth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value;
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED', redirect: 'https://deriv.com/' }, { status: 403 });
  let activeToken = token;
  let refreshed = false;

  try {
    let result: any;
    try {
      result = await derivPaymentRequest(activeToken, '/account/v1/nickname', 'GET', undefined, false);
    } catch (firstError) {
      const first = firstError as { status?: number; code?: string; message?: string };
      const refreshToken = request.cookies.get('deriv_refresh_token')?.value;
      const clientId = process.env.DERIV_APP_ID?.trim();

      if (first.status !== 401 || !refreshToken || !clientId) throw firstError;

      const refreshedToken = await refreshAccessToken(clientId, refreshToken);
      activeToken = refreshedToken.access_token;
      refreshed = true;
      result = await derivPaymentRequest(activeToken, '/account/v1/nickname', 'GET', undefined, false);

      const nickname = String(result?.data?.nickname || result?.nickname || '').trim();
      if (!nickname) {
        return NextResponse.json({ error: 'A Deriv não devolveu um nickname para esta identidade.', code: 'NICKNAME_EMPTY' }, { status: 404 });
      }

      const response = NextResponse.json({ nickname }, { headers: { 'Cache-Control': 'no-store' } });
      response.cookies.set('deriv_access_token', activeToken, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600,
      });
      if (refreshedToken.refresh_token) {
        response.cookies.set('deriv_refresh_token', refreshedToken.refresh_token, {
          httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
        });
      }
      return response;
    }

    const nickname = String(result?.data?.nickname || result?.nickname || '').trim();
    if (!nickname) return NextResponse.json({ error: 'A Deriv não devolveu um nickname para esta identidade.', code: 'NICKNAME_EMPTY' }, { status: 404 });
    return NextResponse.json({ nickname }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const e = error as { status?: number; code?: string; message?: string };
    return NextResponse.json({ error: e.message || 'Não foi possível obter o nickname Deriv', code: e.code || 'NICKNAME_LOOKUP_FAILED' }, { status: e.status || 502 });
  }
}
