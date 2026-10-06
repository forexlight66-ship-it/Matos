import { NextRequest, NextResponse } from 'next/server';
import { handlePaymentAgentTelegramCallback, handlePaymentAgentTelegramMessage, verifyPaymentAgentWebhookRequest } from '@/lib/paymentAgentTelegram';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    if (!(await verifyPaymentAgentWebhookRequest(request))) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json().catch(() => ({}));
    if (update?.callback_query) {
      await handlePaymentAgentTelegramCallback(update.callback_query);
    } else if (update?.message) {
      await handlePaymentAgentTelegramMessage(update.message);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Payment Agent Webhook]', error);
    return NextResponse.json({ ok: true });
  }
}
