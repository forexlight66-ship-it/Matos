import { refreshAccessToken } from '@/lib/oauth';

const DERIV_API_BASE = 'https://api.derivws.com';

export async function getDerivNickname(accessToken: string) {
  const token = accessToken.trim();
  if (!token) throw new Error('Deriv access token is required');

  const response = await fetch(`${DERIV_API_BASE}/account/v1/nickname`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || payload?.error?.message || `Deriv nickname lookup failed (${response.status})`;
    throw Object.assign(new Error(message), { status: response.status });
  }

  const nickname =
    payload?.data?.nickname ??
    payload?.nickname ??
    payload?.data?.account_nickname ??
    '';

  if (!nickname || typeof nickname !== 'string') {
    throw new Error('Deriv did not return an account nickname');
  }

  return nickname.trim();
}

export async function getAuthenticatedDerivNickname(input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  appId: string;
}) {
  let accessToken = input.accessToken?.trim() || '';
  let rotatedRefreshToken: string | undefined;

  if (accessToken) {
    try {
      return {
        nickname: await getDerivNickname(accessToken),
        accessToken,
        refreshToken: input.refreshToken || undefined,
        refreshed: false,
      };
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0);
      if (status !== 401 && status !== 403) throw error;
    }
  }

  if (!input.refreshToken?.trim()) {
    throw Object.assign(new Error('Deriv authentication is required'), { status: 401 });
  }

  const refreshed = await refreshAccessToken(input.appId, input.refreshToken.trim());
  accessToken = refreshed.access_token;
  rotatedRefreshToken = refreshed.refresh_token;

  return {
    nickname: await getDerivNickname(accessToken),
    accessToken,
    refreshToken: rotatedRefreshToken,
    refreshed: true,
  };
}
