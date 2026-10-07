import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode } from '@/lib/oauth';
import { getSession, PLATFORM_SESSION_COOKIE, createDerivOAuthSession, saveDerivRefreshToken, consumeDerivOAuthState } from '@/lib/platform-auth';

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

  if (oauthError) return errorRedirect(oauthErrorDescription || oauthError);
  if (!code || !state) return errorRedirect('missing_oauth_parameters');

  const storedState = request.cookies.get('oauth_state')?.value;
  if (!storedState || state !== storedState) return errorRedirect('invalid_oauth_state');

  const oauthState = await consumeDerivOAuthState(state);
  if (!oauthState) {
    const requestedReturnTo = request.cookies.get('oauth_return_to')?.value || '/';
    const returnTo = requestedReturnTo.startsWith('/') && !requestedReturnTo.startsWith('//')
      ? requestedReturnTo
      : '/';
    console.warn('[OAuth] Ignoring replayed or expired callback state.');
    return NextResponse.redirect(new URL(returnTo, PRODUCTION_APP_URL), { status: 302 });
  }

  const { verifier, redirect_uri: storedRedirectUri, return_to: storedReturnTo } = oauthState;
  if (storedRedirectUri !== PRODUCTION_CALLBACK_URL) return errorRedirect('invalid_oauth_redirect_uri');

  const returnTo = storedReturnTo.startsWith('/') && !storedReturnTo.startsWith('//')
    ? storedReturnTo
    : '/';

  const clientId = process.env.DERIV_APP_ID?.trim();
  if (!clientId) return NextResponse.json({ error: 'OAuth server configuration is incomplete' }, { status: 500 });

  try {
    const { access_token, refresh_token } = await exchangeCode(clientId, PRODUCTION_CALLBACK_URL, code, verifier);
    await consumeDerivOAuthState(state);
    console.info('[OAuth] Deriv authorization code exchanged successfully; access token cookie will be set.', { returnTo });
    const response = NextResponse.redirect(new URL(returnTo, PRODUCTION_APP_URL), { status: 302 });
    let oauthSessionId = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value || '';
    let oauthUserId = platformSession?.id;
    if (!platformSession) {
      oauthSessionId = await createDerivOAuthSession();
      response.cookies.set(PLATFORM_SESSION_COOKIE, oauthSessionId, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
      const createdSession = await getSession(oauthSessionId);
      oauthUserId = createdSession?.id;
    }
    if (refresh_token && oauthUserId) {
      await saveDerivRefreshToken(oauthUserId, refresh_token);
    }
    response.cookies.set('deriv_access_token', access_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600 });
    if (platformSession?.country) response.cookies.set('matos_country', String(platformSession.country).toUpperCase(), { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 365 });
    if (refresh_token) response.cookies.set('deriv_refresh_token', refresh_token, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30 });
    response.cookies.delete('oauth_verifier');
    response.cookies.delete('oauth_state');
    response.cookies.delete('oauth_redirect_uri');
    response.cookies.delete('oauth_return_to');
    return response;
  } catch (error) {
    console.error('[OAuth] Callback/token exchange failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (/authorization code has already been used|authorization grant.*already been used/i.test(message)) {
      console.warn('[OAuth] Duplicate callback detected; returning to requested page.');
      return NextResponse.redirect(new URL(returnTo, PRODUCTION_APP_URL), { status: 302 });
    }
    const safeReason = message.replace(/https?:\/\/[^\s]+/gi, '[url]').slice(0, 220);
    return errorRedirect(`oauth_exchange_failed:${safeReason}`);
  }
}
