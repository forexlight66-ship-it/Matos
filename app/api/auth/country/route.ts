import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE, updateUserCountry } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function POST(request: NextRequest) {
  try {
    const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!session) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const country = String(body?.country || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: 'País inválido.' }, { status: 400 });

    const user = await updateUserCountry(session.id, country);
    const response = NextResponse.json({ ok: true, country: user?.country || country });
    response.cookies.set('matos_country', user?.country || country, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    });
    return response;
  } catch (error) {
    console.error('[Auth] country sync failed:', error);
    return NextResponse.json({ error: 'Não foi possível guardar o país.' }, { status: 500 });
  }
}
