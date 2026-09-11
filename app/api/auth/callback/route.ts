import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/oauth';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

const PRODUCTION_APP_URL = 'https://matos-1n.onrender.com';
const PRODUCTION_CALLBACK_URL = `${PRODUCTION_APP_URL}/api/auth/callback`;

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const platformSession = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');
  const oauthErrorDescription = searchParams.get('error_description');
  const errorRedirect = (reason: string) => NextResponse.redirect(`${PRODUCTION_APP_URL}/?auth_error=${encodeURIComponent(reason)}`, { status: 302 });

  if (!platformSession) return errorRedirect('platform_account_required');
  if (oauthError) return errorRedirect(oauthErrorDescription || oauthError);
  if (!code || !state) return errorRedirect('missing_oauth_parameters');

  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || state !== storedState) return errorRedirect('invalid_oauth_state');
  const verifier = request.cookies.get('oauth_verifier')?.value;
  if (!verifier) return errorRedirect('missing_oauth_verifier');

  const clientId = process.env.DERIV_APP_ID?.trim();
  if (!clientId) return NextResponse.json({ error: 'OAuth server configuration is incomplete' }, { status: 500 });

  try {
    const { access_token, refresh_token } = await exchangeCode(clientId, PRODUCTION_CALLBACK_URL, code, verifier);
    const response = NextResponse.redirect(PRODUCTION_APP_URL + '/', { status: 302 });
    response.cookies.set('deriv_access_token', access_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
    if (refresh_token) response.cookies.set('deriv_refresh_token', refresh_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    response.cookies.delete('oauth_verifier');
    response.cookies.delete('oauth_state');
    response.cookies.delete('oauth_redirect_uri');
    return response;
  } catch (error) {
    console.error('[OAuth] Callback/token exchange failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    const safeReason = message.replace(/https?:\/\/[^\s]+/gi, '[url]').slice(0, 220);
    return errorRedirect(`oauth_exchange_failed:${safeReason}`);
  }
}
