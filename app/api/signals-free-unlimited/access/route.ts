import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { getSignalsFreeUnlimitedAccess } from '@/lib/paymentAgentRequests';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ active: false, eligibleClient: false }, {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    const access = await getSignalsFreeUnlimitedAccess(session.id);
    return NextResponse.json({
      ...access,
      eligibleClient: String(session.country || '').trim().toUpperCase() === 'MZ',
    }, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (error) {
    return NextResponse.json({
      active: false,
      eligibleClient: String(session.country || '').trim().toUpperCase() === 'MZ',
      error: error instanceof Error ? error.message : 'Não foi possível verificar o acesso.',
    }, { status: 500, headers: { 'Cache-Control': 'no-store, private' } });
  }
}
