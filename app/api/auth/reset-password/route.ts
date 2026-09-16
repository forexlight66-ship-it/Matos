import { NextRequest, NextResponse } from 'next/server';
import { resetPasswordWithToken } from '@/lib/platform-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = String(body?.token || '').trim();
    const password = String(body?.password || '');
    const confirmPassword = String(body?.confirmPassword || '');

    if (!token) return NextResponse.json({ error: 'Link de recuperação inválido.' }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: 'A password deve ter pelo menos 8 caracteres.' }, { status: 400 });
    if (password !== confirmPassword) return NextResponse.json({ error: 'As passwords não coincidem.' }, { status: 400 });

    const success = await resetPasswordWithToken(token, password);
    if (!success) return NextResponse.json({ error: 'Este link expirou ou já foi utilizado.' }, { status: 400 });

    return NextResponse.json({ ok: true, message: 'Password alterada com sucesso.' });
  } catch (error) {
    console.error('[Auth] reset-password failed:', error);
    return NextResponse.json({ error: 'Não foi possível alterar a password.' }, { status: 500 });
  }
}
