import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({
    error: 'A assinatura mensal do grupo de sinais é gerida pelo Payment Agent 503 no Telegram. Abra o bot e envie /vip para escolher o método de pagamento.',
    code: 'SIGNALS_SUBSCRIPTION_MOVED_TO_TELEGRAM',
  }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
}
