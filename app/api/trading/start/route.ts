import { NextRequest, NextResponse } from 'next/server';
import { getSession, getDerivAccessToken, getDerivRefreshToken, getDerivExternalReferenceId, saveDerivAccessToken, saveDerivRefreshToken, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { createRuntime, getUserRuntime, type RuntimeConfig } from '@/worker/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = { 'Cache-Control': 'no-store, private', Pragma: 'no-cache', Vary: 'Cookie' };
const STRATEGIES = new Set([
  'PAR_IMPAR','ACIMA5_BAIXO4','RISE_FALL','DIFERENTE','HYPERLITE','HYPERCOVER',
]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === request.nextUrl.origin; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Pedido de origem inválida.' }, { status: 403, headers: NO_STORE });
  try {
    const sessionId = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
    const user = await getSession(sessionId);
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers: NO_STORE });
    if (!process.env.DERIV_APP_ID?.trim()) return NextResponse.json({ error: 'A integração Deriv não está configurada no servidor.' }, { status: 503, headers: NO_STORE });
    const storedDerivCredential = await getDerivAccessToken(user.id);
    // The OAuth callback stores refresh credentials server-side. Keep the
    // access cookie only as a candidate: if it has expired, the identity helper
    // can fall back to the persisted refresh token without resetting its age.
    const callbackAccessToken = request.cookies.get('deriv_access_token')?.value?.trim();
    const storedRefreshCredential = storedDerivCredential ? null : await getDerivRefreshToken(user.id);
    if (!storedDerivCredential && !callbackAccessToken && !storedRefreshCredential) {
      return NextResponse.json({ error: 'A ligação Deriv expirou ou não tem uma credencial válida. Volte a ligar a conta Deriv ao Matos.' }, { status: 409, headers: NO_STORE });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400, headers: NO_STORE });
    const strategy = String(body.strategy || '').toUpperCase();
    const symbol = String(body.symbol || '').trim();
    const accountType = String(body.accountType || 'demo').toLowerCase();
    const stake = Number(body.stake);
    if (accountType !== 'demo') return NextResponse.json({ error: 'Nesta fase, o motor server-side aceita apenas conta Demo.' }, { status: 403, headers: NO_STORE });
    if (!STRATEGIES.has(strategy)) return NextResponse.json({ error: 'Estratégia ainda não validada no motor server-side.' }, { status: 400, headers: NO_STORE });
    if (!/^[A-Za-z0-9_]{2,24}$/.test(symbol)) return NextResponse.json({ error: 'Símbolo Deriv inválido.' }, { status: 400, headers: NO_STORE });
    if (!Number.isFinite(stake) || stake < 0.35 || stake > 10000) return NextResponse.json({ error: 'Stake deve estar entre 0.35 e 10000.' }, { status: 400, headers: NO_STORE });

    const config: RuntimeConfig = {
      strategy, symbol, accountType: 'demo', stake,
      currency: 'USD',
      target: Math.max(0, Number(body.target) || 0),
      lossLimit: Math.max(0, Number(body.lossLimit) || 0),
      recoveryExtraProfit: Math.max(0, Number(body.recoveryExtraProfit ?? 5)),
      maxMartingale: 0,
      iaPower: false, sonic: false, smartAnalyzer: false,
      exitSpotsAutoEnabled: false,
      tickWindow: Math.max(9, Math.min(100, Math.floor(Number(body.tickWindow) || 9))),
      durationTicks: Math.max(1, Math.min(10, Math.floor(Number(body.durationTicks) || 1))),
    };
    const existing = await getUserRuntime(user.id);
    if (existing && ['starting','running','stopping'].includes(existing.status)) {
      return NextResponse.json({ error: 'Já existe um robô activo nesta conta.', runtimeId: existing.id }, { status: 409, headers: NO_STORE });
    }
    const account = await (async () => {
      const { getAuthenticatedDerivIdentity } = await import('@/lib/derivNickname');
      const identity = await getAuthenticatedDerivIdentity({
        accessToken: storedDerivCredential?.token || callbackAccessToken,
        refreshToken: storedRefreshCredential || undefined,
        appId: process.env.DERIV_APP_ID!.trim(),
      });
      const expectedIdentityId = await getDerivExternalReferenceId(user.id);
      if (expectedIdentityId && expectedIdentityId !== identity.externalReferenceId) {
        throw new Error('A identidade Deriv não corresponde à conta já ligada a este utilizador Matos.');
      }
      if (identity.refreshToken) {
        await saveDerivRefreshToken(user.id, identity.refreshToken, identity.externalReferenceId);
      }
      if (storedDerivCredential) {
        const remainingSeconds = Math.floor((Date.parse(storedDerivCredential.expiresAt) - Date.now()) / 1000);
        if (remainingSeconds > 60) {
          await saveDerivAccessToken(user.id, storedDerivCredential.token, remainingSeconds, identity.externalReferenceId);
        }
      } else if (!identity.refreshed && callbackAccessToken) {
        await saveDerivAccessToken(user.id, identity.accessToken, 3600, identity.externalReferenceId);
      }
      const response = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
        headers: { Authorization: `Bearer ${identity.accessToken}`, 'Deriv-App-ID': process.env.DERIV_APP_ID!.trim() },
        cache: 'no-store', signal: AbortSignal.timeout(10000),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.errors?.[0]?.message || 'Não foi possível validar a conta Deriv.');
      const list = payload?.data?.accounts ?? payload?.data ?? [];
      const accounts = Array.isArray(list) ? list : list?.account_id ? [list] : [];
      const demo = accounts.find((item: any) => String(item?.account_type || '').toLowerCase() === 'demo' && item?.account_id);
      if (!demo) throw new Error('Não existe uma conta Options Demo nesta identidade Deriv.');
      return { accountId: String(demo.account_id), accountType: 'demo' as const, currency: String(demo.currency || 'USD').toUpperCase() };
    })();
    const runtimeId = await createRuntime(user.id, account, config);
    return NextResponse.json({ accepted: true, runtimeId, message: 'Robô Demo enviado ao motor server-side.' }, { status: 202, headers: NO_STORE });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível iniciar o robô.';
    console.error('[trading/start] failed:', message);
    return NextResponse.json({ error: message }, { status: 503, headers: NO_STORE });
  }
}
