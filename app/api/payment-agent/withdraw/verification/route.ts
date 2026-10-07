import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, getPaymentAgentProfile, getSupportedPaymentAgentCurrencies, PAYMENT_AGENT_ID, isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED', redirect: 'https://deriv.com/' }, { status: 403 });
  const token = request.cookies.get('deriv_access_token')?.value;
  const agentToken = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  if (!agentToken) return NextResponse.json({ error: 'Payment Agent is not configured on the server' }, { status: 503 });
  if (!token) return NextResponse.json({ error: 'Deriv authentication required' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return NextResponse.json({ error: 'Invalid amount or currency' }, { status: 400 });
  try {
    const profile = await getPaymentAgentProfile(agentToken);
    const supportedCurrencies = getSupportedPaymentAgentCurrencies(profile);
    if (!supportedCurrencies.includes(currency)) {
      return NextResponse.json({ error: `A moeda ${currency} não é suportada pelo Payment Agent 503.`, code: 'AgentCurrencyUnsupported', supportedCurrencies }, { status: 400 });
    }
    const result = await derivPaymentRequest(token, '/payment-agents/v1/withdraw/verification_code', 'POST', { data: { agent_id: PAYMENT_AGENT_ID, amount: amount.toFixed(2), currency } });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to request verification code', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
