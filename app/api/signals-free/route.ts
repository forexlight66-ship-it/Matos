import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { createSignalsFreeRequest, getSignalsFreeRequest } from '@/lib/signalsFree';
import { verifyDerivPartnerClient } from '@/lib/derivPartnerVerification';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'Inicie sessão para consultar o pedido.' }, { status: 401 });
    return NextResponse.json({ request: await getSignalsFreeRequest(user.id) });
  } catch (error) {
    console.error('[Signals Free] status failed', error);
    return NextResponse.json({ error: 'Não foi possível consultar o pedido.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return NextResponse.json({ error: 'Inicie sessão para pedir acesso ao Signals Free.' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const mt5Id = String(body?.mt5Id ?? '').trim();
    const clientId = String(body?.clientId ?? '').trim().toUpperCase();
    if (!/^[A-Z]{0,4}\d{5,20}$/.test(clientId)) {
      return NextResponse.json({ error: 'Introduza um ID de cliente Deriv válido (ex.: CR1234567).' }, { status: 400 });
    }
    if (!/^\d{5,15}$/.test(mt5Id)) {
      return NextResponse.json({ error: 'Introduza um ID MT5 válido, apenas com 5 a 15 dígitos.' }, { status: 400 });
    }

    const isTagged = await verifyDerivPartnerClient(clientId);
    if (!isTagged) {
      return NextResponse.json({ error: 'Esta conta Deriv não está associada diretamente ao parceiro. Confirme o ID de cliente Deriv.', code: 'CLIENT_NOT_TAGGED' }, { status: 403 });
    }

    const created = await createSignalsFreeRequest(
      { id: user.id, name: String(user.name || 'Utilizador'), email: String(user.email || '') },
      mt5Id,
      clientId,
    );
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    console.error('[Signals Free] request failed', error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      ? Math.min(599, Math.max(400, (error as { status: number }).status))
      : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível enviar o pedido.' }, { status });
  }
}
