import { rateLimit } from '@/lib/security';
import { NextRequest, NextResponse } from 'next/server';
import { verifyCourseCode } from '@/lib/telegram-course';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const code = String(body?.code || '').trim();
    if (!code) return NextResponse.json({ ok: false, error: 'Código obrigatório.' }, { status: 400 });

    const limited = await rateLimit(request, 'course-unlock', 6, 900, code);
    if (limited) return limited;
    const payment = await verifyCourseCode(code);
    if (!payment) return NextResponse.json({ ok: false, error: 'Senha inválida ou pagamento não aprovado.' }, { status: 401 });

    return NextResponse.json({
      ok: true,
      courseUnlocked: true,
    });
  } catch (error) {
    console.error('[Course Unlock]', error);
    return NextResponse.json({ ok: false, error: 'Não foi possível validar a senha.' }, { status: 500 });
  }
}
