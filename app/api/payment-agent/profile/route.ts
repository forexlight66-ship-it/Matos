import { NextRequest, NextResponse } from 'next/server';
import { derivPaymentRequest, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('deriv_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Deriv authentication required' }, { status: 401 });
  try {
    const result = await derivPaymentRequest(token, `/payment-agents/v1/agents/${PAYMENT_AGENT_ID}`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment agent unavailable', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
