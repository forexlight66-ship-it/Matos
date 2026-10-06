import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, getPaymentAgentProfile, getSupportedPaymentAgentCurrencies, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

function requestId() {
  return `mh-w-${Date.now()}-${crypto.randomUUID()}`;
}

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const agentToken = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  const token = request.cookies.get('deriv_access_token')?.value;
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').trim().toUpperCase();
  const verificationCode = String(body.verificationCode || '').trim();
  if (!Number.isFinite(amount) || amount <= 0 || !currency || !/^\d{6}$/.test(verificationCode)) {
    return NextResponse.json({ error: 'Valor, moeda e código de 6 dígitos são obrigatórios' }, { status: 400 });
  }

  const id = requestId();
  if (!agentToken) return NextResponse.json({ error: 'Payment Agent is not configured on the server' }, { status: 503 });
  try {
    const profile = await getPaymentAgentProfile(agentToken);
    const supportedCurrencies = getSupportedPaymentAgentCurrencies(profile);
    if (!supportedCurrencies.includes(currency)) {
      return NextResponse.json({ error: `A moeda ${currency} não é suportada pelo Payment Agent 503.`, code: 'AgentCurrencyUnsupported', supportedCurrencies }, { status: 400 });
    }
    const result = await derivPaymentRequest(token, '/payment-agents/v1/withdraw', 'POST', {
      data: {
        agent_id: PAYMENT_AGENT_ID,
        amount: amount.toFixed(2),
        currency,
        verification_code: verificationCode,
        request_id: id,
      },
    });
    return NextResponse.json({ ...result, requestId: id }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha no levantamento', code: (error as { code?: string })?.code },
      { status: (error as { status?: number })?.status || 500 },
    );
  }
}
