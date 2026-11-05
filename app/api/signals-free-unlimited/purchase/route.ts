import { rateLimit, sameOriginGuard } from '@/lib/security';
import { NextRequest, NextResponse } from 'next/server';
import {
  getSession,
  PLATFORM_SESSION_COOKIE,
  getDerivRefreshToken,
  saveDerivRefreshToken,
} from '@/lib/platform-auth';
import { getAuthenticatedDerivNickname } from '@/lib/derivNickname';
import { createSignalsFreeUnlimitedRequest } from '@/lib/paymentAgentRequests';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  }
  const originFailure = sameOriginGuard(request);
  if (originFailure) return originFailure;
  const limited = await rateLimit(request, 'signals-free-unlimited-purchase', 5, 900, String(session.id));
  if (limited) return limited;

  const body = await request.json().catch(() => ({}));
  const method = String(body.paymentMethod || '').trim().toLowerCase();
  const eligibleClient = String(session.country || '').trim().toUpperCase() === 'MZ';
  const mt5Id = String(body.mt5Id || '').trim();
  const payerName = String(body.payerName || '').trim();
  const payerNumber = String(body.payerNumber || '').replace(/\D/g, '');

  if (mt5Id.length < 3 || mt5Id.length > 64) {
    return NextResponse.json({ error: 'Informe o ID de login da sua conta MT5.' }, { status: 400 });
  }
  if (eligibleClient && method !== 'mpesa' && method !== 'emola') {
    return NextResponse.json({ error: 'Clientes elegíveis devem pagar por M-Pesa ou e-Mola.' }, { status: 400 });
  }
  if (!eligibleClient && method !== 'binance_usdt_trc20') {
    return NextResponse.json({ error: 'Clientes não elegíveis para pagamentos locais devem pagar 3 USDT pela rede TRC20.' }, { status: 400 });
  }
  if (eligibleClient && payerName.length < 2) {
    return NextResponse.json({ error: 'Informe o nome usado no pagamento.' }, { status: 400 });
  }
  if (eligibleClient && !/^\d{9,15}$/.test(payerNumber)) {
    return NextResponse.json({ error: 'Informe o número usado para fazer o pagamento.' }, { status: 400 });
  }

  const appId = process.env.DERIV_APP_ID?.trim();
  if (!appId) {
    return NextResponse.json({ error: 'DERIV_APP_ID não está configurado.' }, { status: 500 });
  }

  const accessToken = request.cookies.get('deriv_access_token')?.value || '';
  const cookieRefreshToken = request.cookies.get('deriv_refresh_token')?.value || '';
  const storedRefreshToken = await getDerivRefreshToken(session.id);
  let identity;
  try {
    identity = await getAuthenticatedDerivNickname({
      accessToken,
      refreshToken: cookieRefreshToken || storedRefreshToken,
      appId,
    });
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 401);
    return NextResponse.json({
      error: status === 401
        ? 'Conecte a sua conta Deriv antes de comprar os sinais.'
        : 'Não foi possível identificar a sua conta Deriv.',
      code: 'DERIV_NICKNAME_REQUIRED',
    }, { status: status === 401 ? 401 : 502 });
  }

  const paymentMethod = eligibleClient
    ? method as 'mpesa' | 'emola'
    : 'binance_usdt_trc20';

  const row = await createSignalsFreeUnlimitedRequest({
    userId: session.id,
    clientName: session.name,
    clientEmail: session.email,
    clientNickname: identity.nickname,
    mt5Id,
    paymentMethod,
    payerName: eligibleClient ? payerName : undefined,
    payerNumber: eligibleClient ? payerNumber : undefined,
  });

  const response = NextResponse.json({
    requestId: row.id,
    status: row.status,
    amountMzn: eligibleClient ? 250 : null,
    amountUsdt: eligibleClient ? null : 3,
    asset: eligibleClient ? null : 'USDT',
    network: eligibleClient ? null : 'TRC20',
    paymentMethod: row.payment_method,
    paymentNumber: row.payment_number,
    paymentName: row.payment_name,
    derivNickname: identity.nickname,
    mt5Id,
  }, { headers: { 'Cache-Control': 'no-store' } });

  if (identity.refreshed) {
    response.cookies.set('deriv_access_token', identity.accessToken, {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600,
    });
    if (identity.refreshToken) {
      response.cookies.set('deriv_refresh_token', identity.refreshToken, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
      });
      await saveDerivRefreshToken(session.id, identity.refreshToken);
    }
  }
  return response;
}
