import { NextRequest, NextResponse } from 'next/server';
import { processVipSubscriptionReminders } from '@/lib/telegram-vip';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const expected = process.env.TELEGRAM_VIP_CRON_SECRET?.trim();
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    || request.nextUrl.searchParams.get('secret')
    || '';
  if (!expected || supplied !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  try {
    const result = await processVipSubscriptionReminders();
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[MatosFx VIP cron]', error);
    return NextResponse.json({ ok: false, error: 'VIP subscription job failed' }, { status: 500 });
  }
}
