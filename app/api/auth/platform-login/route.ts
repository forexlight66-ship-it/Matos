import { NextRequest, NextResponse } from 'next/server';
import { authenticateUser, createSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim();
    const password = String(body?.password || '');
    if (!email || !password) return NextResponse.json({ error: 'Email e password são obrigatórios.' }, { status: 400 });

    const user = await authenticateUser(email, password);
    if (!user) return NextResponse.json({ error: 'Email ou password incorretos.' }, { status: 401 });

    const session = await createSession(user.id);
    const response = NextResponse.json({ ok: true, user });
    response.cookies.set(PLATFORM_SESSION_COOKIE, session, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    console.error('[Auth] platform login failed:', error);
    return NextResponse.json({ error: 'Não foi possível entrar agora.' }, { status: 500 });
  }
}
