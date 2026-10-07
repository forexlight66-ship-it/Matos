import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { completeTransfer, getPaymentRequest } from '@/lib/paymentAgentRequests';

export const dynamic = 'force-dynamic';

function localStatus(remoteStatus: string) {
  const status = remoteStatus.toLowerCase();
  if (status === 'complete' || status === 'completed') return 'completed' as const;
  if (status === 'rejected') return 'rejected' as const;
  if (status === 'failed') return 'failed' as const;
  return 'transfer_pending' as const;
}

export async function GET(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value || '';
  const requestId = String(request.nextUrl.searchParams.get('request_id') || '').trim();

  if (!session) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) {
    return NextResponse.json({
      error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).',
      code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED',
      redirect: 'https://deriv.com/',
    }, { status: 403 });
  }
  if (!/^[-\w]{1,128}$/.test(requestId)) {
    return NextResponse.json({ error: 'Invalid request_id' }, { status: 400 });
  }
  if (!token) {
    return NextResponse.json({
      error: 'A autenticação Deriv desta conta expirou. Faça login com Deriv novamente para continuar.',
      code: 'DERIV_REAUTH_REQUIRED',
    }, { status: 401 });
  }

  try {
    const row = await getPaymentRequest(requestId);
    if (!row || String(row.user_id) !== String(session.id) || row.type !== 'withdraw') {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    const remoteRequestId = String(row.transfer_request_id || row.id);
    try {
      const result = await derivPaymentRequest(
        token,
        '/payment-agents/v1/withdraw/' + encodeURIComponent(remoteRequestId),
        'GET',
        undefined,
        false,
      );
      const remoteStatus = String(result?.data?.status || row.status || 'pending').toLowerCase();
      const transactionId = result?.data?.transaction_id == null
        ? row.transaction_id
        : String(result.data.transaction_id);
      const updated = await completeTransfer(requestId, transactionId == null ? null : String(transactionId), localStatus(remoteStatus));

      return NextResponse.json({
        data: {
          status: remoteStatus,
          requestId: row.id,
          transactionId: transactionId == null ? null : String(transactionId),
          completedAt: updated?.completed_at || row.completed_at,
          agentConfirmedAt: row.agent_confirmed_at,
          agentRejectedAt: row.agent_rejected_at,
        },
      }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 500);
      const code = String((error as { code?: string })?.code || '');
      if (status === 401) {
        return NextResponse.json({
          error: 'A autenticação Deriv desta conta expirou. Faça login com Deriv novamente para continuar.',
          code: 'DERIV_REAUTH_REQUIRED',
        }, { status: 401 });
      }
      if (code === 'RequestIDNotFound') {
        return NextResponse.json({ error: 'O pedido não foi encontrado na Deriv.', code }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível consultar o estado do levantamento',
    }, { status: 500 });
  }
}
