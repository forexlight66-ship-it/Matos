// lib/oauth.ts

import { randomBytes, createHash } from 'crypto';

const DERIV_OAUTH_AUTHORIZE = 'https://oauth.deriv.com/oauth/authorize';
const DERIV_OAUTH_TOKEN = 'https://oauth.deriv.com/oauth/token';

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
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'read trade',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state: state,
  });
  return `${DERIV_OAUTH_AUTHORIZE}?${params.toString()}`;
}

export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
  codeVerifier: string
): Promise<{ access_token: string; refresh_token?: string }> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code: code,
    code_verifier: codeVerifier,
  });

  const response = await fetch(DERIV_OAUTH_TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OAuth token exchange failed: ${error}`);
  }

  const data = await response.json();
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
}
