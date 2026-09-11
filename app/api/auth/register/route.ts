import { NextRequest, NextResponse } from 'next/server';
import { createSession, createUser, PLATFORM_SESSION_COOKIE, safeErrorMessage } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const confirmPassword = String(body?.confirmPassword || '');

    if (name.length < 2) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Email inválido.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'A password deve ter pelo menos 8 caracteres.' }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: 'As passwords não coincidem.' }, { status: 400 });

    const user = await createUser(name, email, password);
    const session = await createSession(user.id);
    const response = NextResponse.json({ ok: true, user });
    response.cookies.set(PLATFORM_SESSION_COOKIE, session, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error: any) {
    const message = safeErrorMessage(error);
    if (message.includes('duplicate key') || message.includes('platform_users_email_key')) {
      return NextResponse.json({ error: 'Este email já está registado.' }, { status: 409 });
    }
    console.error('[Auth] register failed:', error);
    return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 });
  }
}
