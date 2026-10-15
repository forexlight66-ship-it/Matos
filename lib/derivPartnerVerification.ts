import { refreshAccessToken } from '@/lib/oauth';

export async function verifyDerivPartnerClient(clientId: string) {
  const appId = process.env.DERIV_APP_ID?.trim();
  const refreshToken = process.env.DERIV_PARTNER_REFRESH_TOKEN?.trim();
  if (!appId || !refreshToken) {
    throw Object.assign(new Error('A verificação de parceiro não está configurada. Defina DERIV_PARTNER_REFRESH_TOKEN no Render com o refresh token OAuth2 da conta de parceiro.'), { status: 503, code: 'PARTNER_VERIFICATION_NOT_CONFIGURED' });
  }

  const token = await refreshAccessToken(appId, refreshToken);
  const response = await fetch('https://api.derivws.com/partners/client-tags/check', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_ids: [clientId] }),
    cache: 'no-store',
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.errors?.[0]?.message || payload?.error?.message || `Falha na verificação de parceiro (${response.status}).`;
    throw Object.assign(new Error(message), {
      status: response.status === 502 || response.status === 504 ? 503 : response.status === 401 || response.status === 403 || response.status === 404 ? 503 : 502,
      code: response.status === 403 ? 'PARTNER_SCOPE_OR_AUTH_ERROR' : response.status === 404 ? 'PARTNER_ACCOUNT_NOT_FOUND' : 'PARTNER_TAG_CHECK_FAILED',
    });
  }

  const data = payload?.data ?? payload;
  const list = [data?.results, data?.client_tags, data?.clients].find(Array.isArray) || [];
  const item = list.find((entry: any) => String(entry?.client_id ?? entry?.id ?? '') === clientId) || list[0];
  const tagged = item?.is_tagged ?? item?.tagged ?? item?.isTagged;
  if (typeof tagged !== 'boolean') {
    throw Object.assign(new Error('Resposta da Deriv sem estado de associação reconhecível; pedido não enviado.'), { status: 502, code: 'PARTNER_TAG_RESPONSE_UNKNOWN' });
  }
  return tagged as boolean;
}
