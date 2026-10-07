import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value;
  const requestId = String(request.nextUrl.searchParams.get('request_id') || '').trim();
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED', redirect: 'https://deriv.com/' }, { status: 403 });
  if (!/^[\w-]{1,128}$/.test(requestId)) return NextResponse.json({ error: 'Invalid request_id' }, { status: 400 });
  try {
    const result = await derivPaymentRequest(token, `/payment-agents/v1/withdraw/${encodeURIComponent(requestId)}`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read withdrawal status', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
