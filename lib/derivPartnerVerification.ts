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
  if (partnerTokenRefreshInFlight) return partnerTokenRefreshInFlight;

  const operation = (async (): Promise<ActivePartnerToken> => {
    const credential = await getDerivPartnerRefreshCredential();
    if (!credential) {
      throw apiError(
        'A conta Deriv de parceiro ainda não está ligada ao Matos. O administrador deve iniciar sessão novamente com a conta de parceiro para registar a ligação.',
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

  let response: Response;
  try {
    const appId = process.env.DERIV_APP_ID?.trim();
    if (!appId) return { registered: false, reason: 'DERIV_APP_ID_MISSING' };
    response = await postClientTagCheck(accessToken, [externalReferenceId], appId);
  } catch {
    return { registered: false, reason: 'PARTNER_CHECK_UNAVAILABLE' };
  }

  if (response.status === 404) return { registered: false, reason: 'NOT_A_DERIV_PARTNER' };
  if (response.status === 401) return { registered: false, reason: 'OAUTH_TOKEN_INVALID' };
  if (response.status === 403) return { registered: false, reason: 'APPLICATION_READ_SCOPE_MISSING' };
  if (!response.ok) return { registered: false, reason: `PARTNER_CHECK_HTTP_${response.status}` };

  let checked: PartnerCheckResult;
  try {
    checked = await readPartnerCheck(response, externalReferenceId);
  } catch {
    return { registered: false, reason: 'PARTNER_RESPONSE_INVALID' };
  }

  // If a partner credential already exists, only the exact locked partner_id
  // may update it; a different partner cannot replace the app-level credential.
  if (existing && existing.partnerId !== checked.partnerId) {
    return { registered: false, reason: 'DIFFERENT_PARTNER_ALREADY_LOCKED' };
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
  if (checked.partnerId !== partner.partnerId) {
    console.error('[Signals Free] Partner ID mismatch; refusing to trust the tag response.');
    throw apiError('A identidade do parceiro não corresponde à credencial guardada. A verificação foi interrompida por segurança.', 503, 'PARTNER_ID_MISMATCH');
  }

  return checked.isTagged;
}
