// lib/oauth.ts

import { randomBytes, createHash } from 'crypto';

const DERIV_OAUTH_AUTHORIZE = 'https://auth.deriv.com/oauth2/auth';
const DERIV_OAUTH_TOKEN = 'https://auth.deriv.com/oauth2/token';

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

export function getAuthorizeUrl(
  clientId: string,
  redirectUri: string,
  codeChallenge: string,
  state: string
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'trade',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${DERIV_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCode(
  clientId: string,
  redirectUri: string,
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const response = await fetch(DERIV_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`OAuth token exchange failed (${response.status}): ${data?.error_description || data?.error || JSON.stringify(data) || 'Unknown error'}`);
  }
  if (!data?.access_token) throw new Error('OAuth token exchange succeeded but no access_token was returned');

  return { access_token: data.access_token, refresh_token: data.refresh_token };
}

export async function refreshAccessToken(
  clientId: string,
  refreshToken: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
  });

  const response = await fetch(DERIV_OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(`OAuth token refresh failed (${response.status}): ${data?.error_description || data?.error || JSON.stringify(data) || 'Unknown error'}`);
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || refreshToken,
  };
}
