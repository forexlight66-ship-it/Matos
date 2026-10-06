import { NextRequest, NextResponse } from 'next/server';
import { derivPaymentRequest, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const token = request.cookies.get('deriv_access_token')?.value;
  if (!token) return NextResponse.json({ error: 'Deriv authentication required' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return NextResponse.json({ error: 'Invalid amount or currency' }, { status: 400 });
  try {
    const result = await derivPaymentRequest(token, '/payment-agents/v1/withdraw/verification_code', 'POST', { data: { agent_id: PAYMENT_AGENT_ID, amount: amount.toFixed(2), currency } });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to request verification code', code: (error as {code?:string})?.code }, { status: (error as {status?:number})?.status || 500 });
  }
}
