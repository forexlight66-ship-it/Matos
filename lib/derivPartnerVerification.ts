import { refreshAccessToken } from '@/lib/oauth';
import {
  getDerivPartnerCredentialMetadata,
  getDerivPartnerRefreshCredential,
  saveDerivPartnerRefreshToken,
} from '@/lib/platform-auth';

const DERIV_PARTNER_TAGS_URL = 'https://api.derivws.com/partners/client-tags/check';

type PartnerCheckResult = {
  partnerId: string;
  isTagged: boolean;
};

type ActivePartnerToken = {
  accessToken: string;
  partnerId: string;
};

let partnerTokenRefreshInFlight: Promise<ActivePartnerToken> | null = null;

async function getActivePartnerToken(appId: string): Promise<ActivePartnerToken> {
  // Deriv's documented OAuth authorization-code flow returns a short-lived
  // access_token, not a refresh_token. Partner verification therefore supports
  // a server-side Deriv Personal Access Token (PAT) with application_read scope.
  // Keep this token only in Render environment variables; never expose it to clients.
  const configuredPat = process.env.DERIV_PARTNER_API_TOKEN?.trim();
  if (configuredPat) {
    const partnerId = await fetchAuthenticatedPartnerId(configuredPat, appId);
    if (!partnerId) {
      throw apiError(
        'A credencial de parceiro configurada no servidor foi rejeitada ou não tem a permissão application_read. Verifique DERIV_PARTNER_API_TOKEN.',
        503,
        'PARTNER_PAT_INVALID_OR_SCOPE_MISSING',
      );
    }
    return { accessToken: configuredPat, partnerId };
  }

  if (partnerTokenRefreshInFlight) return partnerTokenRefreshInFlight;

  const operation = (async (): Promise<ActivePartnerToken> => {
    const credential = await getDerivPartnerRefreshCredential();
    if (!credential) {
      throw apiError(
        'A ligação do parceiro ainda não está configurada no servidor. Configure DERIV_PARTNER_API_TOKEN no Render com um token Deriv que tenha a permissão application_read.',
        503,
        'PARTNER_CREDENTIAL_NOT_CONFIGURED',
      );
    }

    let token: Awaited<ReturnType<typeof refreshAccessToken>>;
    try {
      token = await refreshAccessToken(appId, credential.refreshToken);
    } catch (error) {
      console.error('[Signals Free] Could not refresh the stored partner OAuth token:', error instanceof Error ? error.message : 'unknown error');
      throw apiError(
        'Não foi possível renovar a ligação Deriv do parceiro. Volte a ligar a conta de parceiro ao Matos.',
        503,
        'PARTNER_TOKEN_REFRESH_FAILED',
      );
    }

    // Persist a rotated refresh token before releasing the shared promise. This
    // prevents simultaneous Signals Free requests from refreshing the same
    // single-use token concurrently within one server instance.
    if (token.refresh_token && token.refresh_token !== credential.refreshToken) {
      const saved = await saveDerivPartnerRefreshToken(
        credential.linkedUserId,
        credential.partnerId,
        token.refresh_token,
      );
      if (!saved) {
        throw apiError('A credencial do parceiro mudou inesperadamente. A verificação foi interrompida por segurança.', 503, 'PARTNER_CREDENTIAL_LOCK_MISMATCH');
      }
    }

    return { accessToken: token.access_token, partnerId: credential.partnerId };
  })();

  partnerTokenRefreshInFlight = operation;
  try {
    return await operation;
  } finally {
    if (partnerTokenRefreshInFlight === operation) partnerTokenRefreshInFlight = null;
  }
}

function apiError(message: string, status: number, code: string) {
  return Object.assign(new Error(message), { status, code });
}

function unwrapPayload(payload: any) {
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload;
}

async function postClientTagCheck(accessToken: string, clientIds: string[], appId: string) {
  return fetch(DERIV_PARTNER_TAGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Deriv-App-ID': appId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ client_ids: clientIds }),
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
}

async function fetchAuthenticatedPartnerId(accessToken: string, appId: string): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const response = await fetch(`https://api.derivws.com/partners/analytics/v1/overview?start_date=${from}&end_date=${today}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}`, 'Deriv-App-ID': appId, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    const payload: any = await response.clone().json().catch(() => null);
    const message = String(payload?.errors?.[0]?.message ?? payload?.message ?? '').replace(/[\\r\\n\\t]+/g, ' ').slice(0, 160);
    console.info('[OAuth] Partner overview check rejected', { status: response.status, message: message || 'no message' });
    return null;
  }
  const payload: any = await response.json().catch(() => null);
  const data = unwrapPayload(payload);
  const rawId = data?.partner_id ?? data?.partner?.partner_id ?? data?.partner?.id;
  return Number.isSafeInteger(Number(rawId)) && Number(rawId) > 0 ? String(rawId) : null;
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
  externalReferenceId: string,
): Promise<{ registered: boolean; reason?: string }> {
  if (!refreshToken?.trim()) return { registered: false, reason: 'REFRESH_TOKEN_NOT_RETURNED' };

  const existing = await getDerivPartnerCredentialMetadata();
  // Avoid an extra partner API call during every client's normal OAuth login.
  // The same platform session that initially connected the partner is allowed
  // to refresh its saved credential; clients cannot update the global token.
  if (existing?.linkedUserId && existing.linkedUserId !== String(platformUserId)) {
    return { registered: false, reason: 'PARTNER_ALREADY_CONFIGURED' };
  }

  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) return { registered: false, reason: 'DERIV_APP_ID_MISSING' };

  // Identify the authenticated partner account directly. The client-tags endpoint
  // is for checking clients and must not be used to identify the partner itself.
  let verifiedPartnerId: string | null;
  try {
    verifiedPartnerId = await fetchAuthenticatedPartnerId(accessToken, appId);
  } catch (error) {
    console.info('[OAuth] Partner overview check unavailable:', error instanceof Error ? error.message : 'unknown error');
    return { registered: false, reason: 'PARTNER_OVERVIEW_UNAVAILABLE' };
  }
  if (!verifiedPartnerId) return { registered: false, reason: 'NOT_A_DERIV_PARTNER_OR_SCOPE_MISSING' };

  // A configured partner ID is immutable unless the same partner reauthenticates.
  if (existing && existing.partnerId !== verifiedPartnerId) {
    return { registered: false, reason: 'DIFFERENT_PARTNER_ALREADY_LOCKED' };
  }

  const saved = await saveDerivPartnerRefreshToken(
    platformUserId,
    verifiedPartnerId,
    refreshToken,
  );
  return saved
    ? { registered: true }
    : { registered: false, reason: 'DIFFERENT_PARTNER_ALREADY_LOCKED' };
}

/**
 * Checks the authenticated Deriv external identity ID against the server-side partner credential.
 * Never trusts a client ID typed by the requester or uses the requester's token as the partner token.
 */
export async function verifyDerivPartnerClient(externalReferenceId: string): Promise<boolean> {
  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) {
    throw apiError('A configuração OAuth2 da Deriv está incompleta no servidor.', 503, 'DERIV_APP_ID_MISSING');
  }

  const partner = await getActivePartnerToken(appId);

  let response: Response;
  try {
    response = await postClientTagCheck(partner.accessToken, [externalReferenceId], appId);
  } catch {
    throw apiError('O serviço de verificação da Deriv está temporariamente indisponível. Tente novamente.', 503, 'PARTNER_CHECK_UNAVAILABLE');
  }

  if (!response.ok) {
    const status = response.status;
    // Record status and a short, sanitized API error for diagnosis. Never log tokens
    // or the full client identity. This distinguishes bad scope/partner credentials
    // from an actual untagged client.
    const apiPayload: any = await response.clone().json().catch(() => null);
    const apiMessage = String(
      apiPayload?.errors?.[0]?.message ??
      apiPayload?.error?.message ??
      apiPayload?.message ??
      ''
    ).replace(/[\\r\\n\\t]+/g, ' ').slice(0, 180);
    console.error('[Signals Free] Partner tag API rejected request', {
      status,
      apiMessage: apiMessage || 'no message',
    });
    if (status === 400 || status === 422) {
      throw apiError('O ID de identidade Deriv não foi aceite pela API de parceiros.', 400, 'CLIENT_ID_REJECTED');
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

  const checked = await readPartnerCheck(response, externalReferenceId);
  // Log only the API result metadata needed to diagnose false negatives. Never log
  // the access/refresh token or the full client identity UUID.
  console.info('[Signals Free] Partner tag check result', {
    storedPartnerId: partner.partnerId,
    responsePartnerId: checked.partnerId,
    clientIdentityFormat: /^[0-9a-f-]{36}$/i.test(externalReferenceId) ? 'uuid' : 'other',
    isTagged: checked.isTagged,
  });
  if (checked.partnerId !== partner.partnerId) {
    console.error('[Signals Free] Partner ID mismatch; refusing to trust the tag response.', {
      storedPartnerId: partner.partnerId,
      responsePartnerId: checked.partnerId,
    });
    throw apiError('A conta de parceiro guardada não corresponde ao parceiro que respondeu à Deriv. É necessária uma revisão da ligação de parceiro.', 503, 'PARTNER_ID_MISMATCH');
  }

  return checked.isTagged;
}
