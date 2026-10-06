import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session || !request.cookies.get('deriv_access_token')?.value) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  const agentToken = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  if (!agentToken) return NextResponse.json({ error: 'Payment Agent is not configured on the server' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').toUpperCase();

  if (!Number.isFinite(amount) || amount <= 0 || !currency) {
    return NextResponse.json({ error: 'Amount and currency are required' }, { status: 400 });
  }
  const clientToken = request.cookies.get('deriv_access_token')?.value;
  let toNickname = '';
  try {
    const nicknameResult = await derivPaymentRequest(clientToken || '', '/account/v1/nickname');
    toNickname = String(nicknameResult?.data?.nickname || '').trim();
  } catch {
    return NextResponse.json({ error: 'Não foi possível validar a conta Deriv autenticada' }, { status: 502 });
  }
  if (!toNickname) return NextResponse.json({ error: 'Nickname Deriv não encontrado' }, { status: 404 });

  try {
    const requestId = `mh-d-${Date.now()}-${crypto.randomUUID()}`;
    const result = await derivPaymentRequest(
      agentToken,
      '/payment-agents/v1/transfer',
      'POST',
      {
        data: {
          agent_id: PAYMENT_AGENT_ID,
          to_nickname: toNickname,
          amount: amount.toFixed(2),
          currency,
          request_id: requestId,
        },
      },
    );
    return NextResponse.json({ ...result, requestId, recipientNickname: toNickname }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Payment Agent deposit failed', code: (error as { code?: string })?.code },
      { status: (error as { status?: number })?.status || 500 },
    );
  }
}
