import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE, getDerivRefreshToken, saveDerivRefreshToken } from '@/lib/platform-auth';
import { createSignalsFreeRequest, getSignalsFreeRequest } from '@/lib/signalsFree';
import { verifyDerivPartnerClient } from '@/lib/derivPartnerVerification';
import { getAuthenticatedDerivIdentity, type AuthenticatedDerivIdentity } from '@/lib/derivNickname';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function attachRefreshedDerivCookies(response: NextResponse, identity: AuthenticatedDerivIdentity | null) {
  if (!identity?.refreshed) return response;

  response.cookies.set('deriv_access_token', identity.accessToken, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600,
  });
  if (identity.refreshToken) {
    response.cookies.set('deriv_refresh_token', identity.refreshToken, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'Inicie sessão para consultar o pedido.' }, { status: 401 });
    return NextResponse.json({ request: await getSignalsFreeRequest(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Signals Free] status failed', error);
    return NextResponse.json({ error: 'Não foi possível consultar o pedido.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let identity: AuthenticatedDerivIdentity | null = null;
  const respond = (body: unknown, status = 200) =>
    attachRefreshedDerivCookies(NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } }), identity);

  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return respond({ error: 'Inicie sessão para pedir acesso ao Signals Free.' }, 401);

    const body = await request.json().catch(() => ({}));
    const mt5Id = String(body?.mt5Id ?? '').trim();
    if (!/^\d{5,15}$/.test(mt5Id)) {
      return respond({ error: 'Introduza um ID MT5 válido, apenas com 5 a 15 dígitos.' }, 400);
    }

    const appId = process.env.DERIV_APP_ID?.trim();
    if (!appId) {
      return respond({ error: 'A configuração OAuth2 da Deriv está incompleta no servidor.', code: 'DERIV_APP_ID_MISSING' }, 503);
    }

    const accessCookie = request.cookies.get('deriv_access_token')?.value || '';
    const cookieRefreshToken = request.cookies.get('deriv_refresh_token')?.value || '';
    const savedRefreshToken = await getDerivRefreshToken(user.id);
    const preferredRefreshToken = cookieRefreshToken || savedRefreshToken || '';

    try {
      identity = await getAuthenticatedDerivIdentity({
        accessToken: accessCookie,
        refreshToken: preferredRefreshToken,
        appId,
      });
    } catch (firstAuthError) {
      // Some older sessions may have a rotated refresh token in the database
      // while the browser still has a stale refresh-token cookie (or vice versa).
      if (!cookieRefreshToken || !savedRefreshToken || cookieRefreshToken === savedRefreshToken) {
        throw firstAuthError;
      }
      identity = await getAuthenticatedDerivIdentity({
        accessToken: accessCookie,
        refreshToken: savedRefreshToken,
        appId,
      });
    }

    if (identity.refreshed && identity.refreshToken) {
      await saveDerivRefreshToken(user.id, identity.refreshToken);
    }

    // Deriv issues this UUID for the authenticated identity. The form cannot
    // supply or override it, and the nickname is never used as the identity ID.
    const externalReferenceId = identity.externalReferenceId;
    const isTagged = await verifyDerivPartnerClient(externalReferenceId);
    if (!isTagged) {
      return respond({
        error: 'A conta Deriv autenticada não está diretamente associada ao parceiro. O pedido não foi enviado.',
        code: 'CLIENT_NOT_TAGGED',
      }, 403);
    }

    const created = await createSignalsFreeRequest(
      { id: user.id, name: String(user.name || 'Utilizador'), email: String(user.email || '') },
      mt5Id,
      externalReferenceId,
    );
    return respond({ request: created }, 201);
  } catch (error) {
    console.error('[Signals Free] request failed', error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      ? Math.min(599, Math.max(400, (error as { status: number }).status))
      : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error
      && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'SIGNALS_FREE_REQUEST_FAILED';
    const message = error instanceof Error ? error.message : 'Não foi possível enviar o pedido.';
    return respond({ error: message, code }, status);
  }
}
