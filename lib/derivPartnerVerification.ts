import { refreshAccessToken } from '@/lib/oauth';
import {
  getDerivPartnerCredentialMetadata,
  getDerivPartnerRefreshCredential,
  saveDerivPartnerRefreshToken,
} from '@/lib/platform-auth';

const DERIV_PARTNER_TAGS_URL = 'https://api.derivws.com/partners/client-tags/check';
// A schema-valid alphanumeric sentinel is used only to detect whether an OAuth
// identity is a partner. Its tag value is deliberately ignored.
const PARTNER_CAPABILITY_PROBE_ID = 'MATOSPARTNERCAPABILITYCHECK00001';

type PartnerCheckResult = {
  partnerId: string;
  isTagged: boolean;
};

function apiError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function unwrapPayload(payload: any) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload;
}

async function postClientTagCheck(accessToken: string, clientIds: string[]) {
  return fetch(DERIV_PARTNER_TAGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_ids: clientIds }),
    cache: 'no-store',
  });
}

async function readPartnerCheck(response: Response, expectedClientId: string): Promise<PartnerCheckResult> {
  const payload: any = await response.json().catch(() => null);
  const data = unwrapPayload(payload);
  const partnerId = data?.partner_id;
  const clients = Array.isArray(data?.clients) ? data.clients : [];
  const item = clients.find((entry: any) =>
    String(entry?.client_id ?? '').toUpperCase() === expectedClientId.toUpperCase()
  );

  if (!Number.isSafeInteger(Number(partnerId)) || Number(partnerId) <= 0) {
    throw apiError('A Deriv devolveu uma resposta de parceiro inválida.', 503, 'PARTNER_RESPONSE_INVALID');
  }
  if (!item || typeof item.is_tagged !== 'boolean') {
    throw apiError('A Deriv não confirmou o estado de associação deste cliente.', 503, 'PARTNER_RESPONSE_INVALID');
  }

  return { partnerId: String(partnerId), isTagged: item.is_tagged };
}

/**
 * Called during OAuth callback. A user is registered as the app-level partner
 * only when the partner endpoint itself recognizes the OAuth identity. A
 * different partner_id can never overwrite the first configured partner.
 * Failures here must not break a normal Deriv sign-in.
 */
export async function tryRegisterDerivPartnerRefreshToken(
  accessToken: string,
  refreshToken: string | undefined,
  platformUserId: string | number,
): Promise<{ registered: boolean; reason?: string }> {
  if (!refreshToken?.trim()) return { registered: false, reason: 'REFRESH_TOKEN_NOT_RETURNED' };

  const existing = await getDerivPartnerCredentialMetadata();
  if (existing?.linkedUserId && existing.linkedUserId !== String(platformUserId)) {
    return { registered: false, reason: 'PARTNER_ALREADY_CONFIGURED' };
  }

  let response: Response;
  try {
    response = await postClientTagCheck(accessToken, [PARTNER_CAPABILITY_PROBE_ID]);
  } catch {
    return { registered: false, reason: 'PARTNER_CHECK_UNAVAILABLE' };
  }

  if (response.status === 404) return { registered: false, reason: 'NOT_A_DERIV_PARTNER' };
  if (response.status === 401) return { registered: false, reason: 'OAUTH_TOKEN_INVALID' };
  if (response.status === 403) return { registered: false, reason: 'APPLICATION_READ_SCOPE_MISSING' };
  if (!response.ok) return { registered: false, reason: `PARTNER_CHECK_HTTP_${response.status}` };

  let checked: PartnerCheckResult;
  try {
    checked = await readPartnerCheck(response, PARTNER_CAPABILITY_PROBE_ID);
  } catch {
    return { registered: false, reason: 'PARTNER_RESPONSE_INVALID' };
  }

  const saved = await saveDerivPartnerRefreshToken(
    platformUserId,
    checked.partnerId,
    refreshToken,
  );
  return saved
    ? { registered: true }
    : { registered: false, reason: 'DIFFERENT_PARTNER_ALREADY_LOCKED' };
}

/**
 * Checks a submitted client ID using the single, server-side partner credential.
 * Never uses the requesting client's own OAuth token as the partner token.
 */
export async function verifyDerivPartnerClient(clientId: string): Promise<boolean> {
  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) {
    throw apiError('A configuração OAuth2 da Deriv está incompleta no servidor.', 503, 'DERIV_APP_ID_MISSING');
  }

  const partnerCredential = await getDerivPartnerRefreshCredential();
  if (!partnerCredential) {
    throw apiError(
      'A conta Deriv de parceiro ainda não foi ligada ao Matos. Entre novamente no Matos com a conta Deriv de parceiro para registar a ligação.',
      503,
      'PARTNER_CREDENTIAL_NOT_CONFIGURED',
    );
  }

  let token: Awaited<ReturnType<typeof refreshAccessToken>>;
  try {
    token = await refreshAccessToken(appId, partnerCredential.refreshToken);
  } catch (error) {
    console.error('[Signals Free] Could not refresh the stored partner OAuth token:', error instanceof Error ? error.message : 'unknown error');
    throw apiError(
      'Não foi possível renovar a ligação Deriv do parceiro. Volte a ligar a conta de parceiro ao Matos.',
      503,
      'PARTNER_TOKEN_REFRESH_FAILED',
    );
  }

  if (token.refresh_token && token.refresh_token !== partnerCredential.refreshToken) {
    const saved = await saveDerivPartnerRefreshToken(
      partnerCredential.linkedUserId,
      partnerCredential.partnerId,
      token.refresh_token,
    );
    if (!saved) {
      throw apiError('A credencial do parceiro mudou inesperadamente. A verificação foi interrompida por segurança.', 503, 'PARTNER_CREDENTIAL_LOCK_MISMATCH');
    }
  }

  let response: Response;
  try {
    response = await postClientTagCheck(token.access_token, [clientId]);
  } catch {
    throw apiError('O serviço de verificação da Deriv está temporariamente indisponível. Tente novamente.', 503, 'PARTNER_CHECK_UNAVAILABLE');
  }

  if (!response.ok) {
    const status = response.status;
    if (status === 400 || status === 422) {
      throw apiError('O ID de cliente enviado não foi aceite pela Deriv. Confirme o identificador.', 400, 'CLIENT_ID_REJECTED');
    }
    if (status === 401 || status === 403 || status === 404) {
      console.error('[Signals Free] Stored partner credential rejected by the partner API:', status);
      throw apiError(
        'A ligação OAuth2 da conta de parceiro não está válida ou não tem a permissão necessária. Volte a ligar a conta de parceiro ao Matos.',
        503,
        'PARTNER_CREDENTIAL_REAUTH_REQUIRED',
      );
    }
    console.error('[Signals Free] Partner tag API unavailable:', status);
    throw apiError('O serviço de verificação da Deriv está temporariamente indisponível. Tente novamente.', 503, 'PARTNER_CHECK_UNAVAILABLE');
  }

  const checked = await readPartnerCheck(response, clientId);
  if (checked.partnerId !== partnerCredential.partnerId) {
    console.error('[Signals Free] Partner ID mismatch; refusing to trust the tag response.');
    throw apiError('A identidade do parceiro não corresponde à credencial guardada. A verificação foi interrompida por segurança.', 503, 'PARTNER_ID_MISMATCH');
  }

  return checked.isTagged;
}
