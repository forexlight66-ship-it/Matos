import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value;
  if (!session || !token) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  try {
    const result = await derivPaymentRequest(token, '/account/v1/nickname');
    const nickname = String(result?.data?.nickname || '').trim();
    if (!nickname) return NextResponse.json({ error: 'Nickname Deriv não encontrado' }, { status: 404 });
    return NextResponse.json({ nickname }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível obter o nickname Deriv' }, { status: 500 });
  }
}
