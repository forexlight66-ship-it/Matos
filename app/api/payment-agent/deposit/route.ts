import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { refreshAccessToken } from '@/lib/oauth';
import { createDepositRequest } from '@/lib/paymentAgentRequests';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const refreshToken = request.cookies.get('deriv_refresh_token')?.value || '';
  if (!isPaymentAgentCountryAllowed(session.country)) {
    return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED', redirect: 'https://deriv.com/' }, { status: 403 });
  }
  let clientToken = request.cookies.get('deriv_access_token')?.value || '';

  // A sessão da plataforma e a ligação Deriv são a autenticação necessária.
  // O access token pode ter expirado ou não estar presente; nesse caso,
  // tenta-se renovar com o refresh token antes de rejeitar o pedido.
  if (!session || (!clientToken && !refreshToken)) {
    return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').toUpperCase();
  const paymentMethod = String(body.paymentMethod || '').toLowerCase();

  if (!Number.isFinite(amount) || amount <= 0 || currency !== 'USD') {
    return NextResponse.json({ error: 'Para o Payment Agent, informe um valor USD válido.' }, { status: 400 });
  }
  if (paymentMethod !== 'mpesa' && paymentMethod !== 'emola') {
    return NextResponse.json({ error: 'Escolha M-Pesa ou e-Mola.' }, { status: 400 });
  }

  let nickname = '';
  let refreshedToken: { access_token: string; refresh_token?: string } | null = null;
  try {
    let result: any;
    try {
      result = await derivPaymentRequest(clientToken, '/account/v1/nickname', 'GET', undefined, false);
    } catch (firstError) {
      const first = firstError as { status?: number };
      const clientId = process.env.DERIV_APP_ID?.trim();
      if (first.status !== 401 || !refreshToken || !clientId) throw firstError;
      refreshedToken = await refreshAccessToken(clientId, refreshToken);
      clientToken = refreshedToken.access_token;
      result = await derivPaymentRequest(clientToken, '/account/v1/nickname', 'GET', undefined, false);
    }
    nickname = String(result?.data?.nickname || result?.nickname || '').trim();
  } catch {}

  if (!nickname) {
    return NextResponse.json({
      error: 'Não foi possível obter a conta Deriv autenticada. Volte a ligar a Deriv e tente novamente.',
      code: 'NICKNAME_LOOKUP_FAILED',
    }, { status: 400 });
  }

  try {
    const row = await createDepositRequest({
      userId: session.id,
      clientName: session.name,
      clientEmail: session.email,
      clientNickname: nickname,
      amountUsd: Number(amount.toFixed(2)),
      paymentMethod: paymentMethod as 'mpesa' | 'emola',
      refreshToken: request.cookies.get('deriv_refresh_token')?.value || '',
    });

    const response = NextResponse.json({
      requestId: row.id,
      status: row.status,
      amountUsd: row.amount_usd,
      localAmountMzn: row.local_amount_mzn,
      exchangeRate: row.exchange_rate,
      paymentMethod: row.payment_method,
      paymentNumber: row.payment_number,
      paymentName: row.payment_name,
    }, { headers: { 'Cache-Control': 'no-store' } });

    if (refreshedToken) {
      response.cookies.set('deriv_access_token', refreshedToken.access_token, {
        httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 3600,
      });
      if (refreshedToken.refresh_token) {
        response.cookies.set('deriv_refresh_token', refreshedToken.refresh_token, {
          httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
        });
      }
    }

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível criar o pedido de depósito' },
      { status: (error as { status?: number }).status || 500 },
    );
  }
}
