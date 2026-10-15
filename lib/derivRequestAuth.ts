import { NextRequest, NextResponse } from 'next/server';
import {
  getDerivRefreshToken,
  saveDerivRefreshToken,
} from '@/lib/platform-auth';
import {
  getAuthenticatedDerivIdentity,
  type AuthenticatedDerivIdentity,
} from '@/lib/derivNickname';

function authError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Resolve the Deriv identity only from the user's server-managed OAuth cookies
 * and encrypted database refresh token. Client-submitted nicknames/IDs are
 * never considered authentication evidence.
 */
export async function resolveDerivIdentityForRequest(
  request: NextRequest,
  userId: string | number,
): Promise<AuthenticatedDerivIdentity> {
  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) {
    throw authError('A configuração OAuth2 da Deriv está incompleta no servidor.', 503, 'DERIV_APP_ID_MISSING');
  }

  const accessToken = request.cookies.get('deriv_access_token')?.value || '';
  const cookieRefreshToken = request.cookies.get('deriv_refresh_token')?.value || '';
  const savedRefreshToken = await getDerivRefreshToken(userId);
  const preferredRefreshToken = cookieRefreshToken || savedRefreshToken || '';

  let identity: AuthenticatedDerivIdentity;
  try {
    identity = await getAuthenticatedDerivIdentity({
      accessToken,
      refreshToken: preferredRefreshToken,
      appId,
    });
  } catch (firstError) {
    // Prefer the encrypted database token if the browser cookie contains an
    // older rotated token.
    if (!cookieRefreshToken || !savedRefreshToken || cookieRefreshToken === savedRefreshToken) {
      throw firstError;
    }
    identity = await getAuthenticatedDerivIdentity({
      accessToken,
      refreshToken: savedRefreshToken,
      appId,
    });
  }

  if (identity.refreshed && identity.refreshToken) {
    await saveDerivRefreshToken(userId, identity.refreshToken);
  }
  return identity;
}

export function attachDerivIdentityCookies(
  response: NextResponse,
  identity: AuthenticatedDerivIdentity | null,
) {
  if (!identity?.refreshed) return response;

  response.cookies.set('deriv_access_token', identity.accessToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });
  if (identity.refreshToken) {
    response.cookies.set('deriv_refresh_token', identity.refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return response;
}
