import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  try {
    const result = await derivPaymentRequest(token, `/payment-agents/v1/agents/${PAYMENT_AGENT_ID}`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment agent unavailable', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
