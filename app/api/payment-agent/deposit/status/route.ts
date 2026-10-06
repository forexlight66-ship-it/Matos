import { NextRequest, NextResponse } from 'next/server';
import { derivPaymentRequest } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  const requestId = String(request.nextUrl.searchParams.get('request_id') || '').trim();
  if (!token) return NextResponse.json({ error: 'Payment Agent is not configured on the server' }, { status: 503 });
  if (!/^[\\w-]{1,128}$/.test(requestId)) return NextResponse.json({ error: 'Invalid request_id' }, { status: 400 });
  try {
    const result = await derivPaymentRequest(token, `/payment-agents/v1/transfer/${encodeURIComponent(requestId)}`);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to read deposit status', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
