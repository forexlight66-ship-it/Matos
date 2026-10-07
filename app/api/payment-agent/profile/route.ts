import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { getPaymentAgentProfile, getSupportedPaymentAgentCurrencies, isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { ensurePaymentAgentWebhook } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) {
    return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED', redirect: 'https://deriv.com/' }, { status: 403 });
  }
  try {
    void ensurePaymentAgentWebhook().catch(error => {
      console.error('[Payment Agent] Telegram webhook setup failed', error instanceof Error ? error.message : String(error));
    });
    const result = await getPaymentAgentProfile(token);
    const supportedCurrencies = getSupportedPaymentAgentCurrencies(result);
    return NextResponse.json({ ...result, supportedCurrencies }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment agent unavailable', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
