import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { getPaymentRequest } from '@/lib/paymentAgentRequests';
import { isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED', redirect: 'https://deriv.com/' }, { status: 403 });

  const id = String(request.nextUrl.searchParams.get('request_id') || '').trim();
  if (!id) return NextResponse.json({ error: 'request_id é obrigatório' }, { status: 400 });

  try {
    const row = await getPaymentRequest(id);
    if (!row || String(row.user_id) !== String(session.id)) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    return NextResponse.json({
      data: {
        status: row.status,
        requestId: row.id,
        completedAt: row.completed_at,
        agentConfirmedAt: row.agent_confirmed_at,
        agentRejectedAt: row.agent_rejected_at,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível consultar o pedido' },
      { status: 500 },
    );
  }
}
