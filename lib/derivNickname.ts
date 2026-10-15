import { refreshAccessToken } from '@/lib/oauth';

const DERIV_API_BASE = 'https://api.derivws.com';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DerivIdentity = {
  nickname: string;
  externalReferenceId: string;
};

export type AuthenticatedDerivIdentity = DerivIdentity & {
  accessToken: string;
  refreshToken?: string;
  refreshed: boolean;
};

function identityError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

/**
 * Returns the Deriv identity bound by Deriv to this OAuth access token.
 * external_reference_id is the identity ID for partner-client checks; it is
 * different from the human-readable nickname.
 */
export async function getDerivIdentity(accessToken: string, appId?: string): Promise<DerivIdentity> {
  const token = accessToken.trim();
  const derivAppId = (appId || process.env.DERIV_APP_ID || '').trim();
  if (!derivAppId) throw identityError('DERIV_APP_ID is required', 503, 'DERIV_APP_ID_MISSING');
  if (!token) throw identityError('Deriv access token is required', 401, 'DERIV_AUTH_REQUIRED');

  let response: Response;
  try {
    response = await fetch(`${DERIV_API_BASE}/account/v1/nickname`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Deriv-App-ID': derivAppId,
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw identityError('O serviço de identidade da Deriv está temporariamente indisponível.', 503, 'DERIV_IDENTITY_UNAVAILABLE');
  }

  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || payload?.error?.message || `Deriv identity lookup failed (${response.status})`;
    throw identityError(message, response.status, 'DERIV_IDENTITY_LOOKUP_FAILED');
  }

  const data = payload?.data ?? payload;
  const nickname = String(data?.nickname ?? data?.account_nickname ?? '').trim();
  const externalReferenceId = String(data?.external_reference_id ?? data?.externalReferenceId ?? '').trim();

  if (!nickname || !UUID_PATTERN.test(externalReferenceId)) {
    throw identityError('A Deriv não devolveu um ID de identidade válido para a conta autenticada.', 502, 'DERIV_EXTERNAL_REFERENCE_ID_MISSING');
  }

  return { nickname, externalReferenceId: externalReferenceId.toLowerCase() };
}

/** Compatibility helper for routes that only need the display nickname. */
export async function getDerivNickname(accessToken: string, appId?: string) {
  return (await getDerivIdentity(accessToken, appId)).nickname;
}

export async function getAuthenticatedDerivIdentity(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  appId: string;
}): Promise<AuthenticatedDerivIdentity> {
  let accessToken = input.accessToken?.trim() || '';
  const refreshToken = input.refreshToken?.trim() || '';

  if (accessToken) {
    try {
      const identity = await getDerivIdentity(accessToken, input.appId);
      return {
        ...identity,
        accessToken,
        refreshToken: refreshToken || undefined,
        refreshed: false,
      };
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status !== 401 && status !== 403) throw error;
    }
  }

  if (!refreshToken) {
    throw identityError(
      'A ligação Deriv expirou. Volte a ligar a sua conta Deriv ao Matos.',
      401,
      'DERIV_RECONNECT_REQUIRED',
    );
  }

  let refreshed: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    refreshed = await refreshAccessToken(input.appId, refreshToken);
  } catch {
    throw identityError(
      'A ligação Deriv expirou ou foi revogada. Volte a ligar a sua conta Deriv ao Matos.',
      401,
      'DERIV_RECONNECT_REQUIRED',
    );
  }

  accessToken = refreshed.access_token;
  const identity = await getDerivIdentity(accessToken, input.appId);
  return {
    ...identity,
    accessToken,
    refreshToken: refreshed.refresh_token || refreshToken,
    refreshed: true,
  };
}

/** Backwards-compatible name for callers that previously needed only nickname. */
export async function getAuthenticatedDerivNickname(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  appId: string;
}) {
  return getAuthenticatedDerivIdentity(input);
}
