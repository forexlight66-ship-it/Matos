import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest } from '@/lib/paymentAgent';
import { refreshAccessToken } from '@/lib/oauth';
import { createWithdrawRequest } from '@/lib/paymentAgentRequests';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value;
  const refreshToken = request.cookies.get('deriv_refresh_token')?.value;
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').trim().toUpperCase();
  const verificationCode = String(body.verificationCode || '').trim();
  const paymentMethod = String(body.paymentMethod || '').toLowerCase();
  const paymentNumber = String(body.paymentNumber || '').trim();
  const paymentName = String(body.paymentName || '').trim();

  if (!Number.isFinite(amount) || amount <= 0 || currency !== 'USD' || !/^\d{6}$/.test(verificationCode)) {
    return NextResponse.json({ error: 'Valor USD e código de 6 dígitos são obrigatórios.' }, { status: 400 });
  }
  if (paymentMethod !== 'mpesa' && paymentMethod !== 'emola') {
    return NextResponse.json({ error: 'Escolha M-Pesa ou e-Mola.' }, { status: 400 });
  }
  if (!/^\d{9,15}$/.test(paymentNumber.replace(/\s+/g, ''))) {
    return NextResponse.json({ error: 'Informe um número M-Pesa/e-Mola válido.' }, { status: 400 });
  }
  if (paymentName.length < 2) return NextResponse.json({ error: 'Informe o nome do titular do pagamento.' }, { status: 400 });
  if (!refreshToken) return NextResponse.json({ error: 'A ligação Deriv precisa de refresh token para concluir o pedido após a aprovação.' }, { status: 401 });

  let nickname = '';
  try {
    const result = await derivPaymentRequest(token, '/account/v1/nickname', 'GET', undefined, false);
    nickname = String(result?.data?.nickname || result?.nickname || '').trim();
  } catch {
    try {
      const clientId = process.env.DERIV_APP_ID?.trim();
      if (!clientId || !refreshToken) throw new Error('OAuth refresh unavailable');
      const refreshed = await refreshAccessToken(clientId, refreshToken);
      const result = await derivPaymentRequest(refreshed.access_token, '/account/v1/nickname', 'GET', undefined, false);
      nickname = String(result?.data?.nickname || result?.nickname || '').trim();
    } catch {}
  }

  if (!nickname) {
    return NextResponse.json({ error: 'Não foi possível obter a conta Deriv autenticada.', code: 'NICKNAME_LOOKUP_FAILED' }, { status: 400 });
  }

  try {
    const row = await createWithdrawRequest({
      userId: session.id,
      clientName: session.name,
      clientEmail: session.email,
      clientNickname: nickname,
      amountUsd: Number(amount.toFixed(2)),
      paymentMethod: paymentMethod as 'mpesa' | 'emola',
      paymentNumber,
      paymentName,
      verificationCode,
      refreshToken,
    });

    return NextResponse.json({
      requestId: row.id,
      status: row.status,
      amountUsd: row.amount_usd,
      localAmountMzn: row.local_amount_mzn,
      exchangeRate: row.exchange_rate,
      paymentMethod: row.payment_method,
      paymentNumber: row.payment_number,
      paymentName: row.payment_name,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível criar o pedido de levantamento' },
      { status: (error as { status?: number }).status || 500 },
    );
  }
}
