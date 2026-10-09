import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { isPaymentAgentCountryAllowed, transferOptionsToWallet, transferWalletToOptions } from '@/lib/paymentAgent';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value || '';
  if (!session) return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) {
    return NextResponse.json({ error: 'Transferência disponível apenas para contas elegíveis de Moçambique e África do Sul.' }, { status: 403 });
  }
  if (!token) return NextResponse.json({ error: 'Ligue novamente a sua conta Deriv antes de transferir.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const direction = String(body.direction || '');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
    return NextResponse.json({ error: 'Informe um valor USD válido.' }, { status: 400 });
  }
  if (direction !== 'wallet_to_options' && direction !== 'options_to_wallet') {
    return NextResponse.json({ error: 'Escolha a direção da transferência.' }, { status: 400 });
  }

  try {
    const requestId = randomUUID();
    const result: any = direction === 'wallet_to_options'
      ? await transferWalletToOptions(token, Number(amount.toFixed(2)), requestId)
      : await transferOptionsToWallet(token, Number(amount.toFixed(2)), requestId);
    const data = result?.data || {};
    const status = String(data.status || '').toLowerCase();
    if (status !== 'complete' && status !== 'completed' && status !== 'success') {
      return NextResponse.json({
        ok: false,
        status: status || 'unknown',
        requestId,
        error: status === 'pending'
          ? 'A Deriv está a processar a transferência. Verifique os saldos antes de tentar novamente.'
          : 'A Deriv não confirmou a transferência. Verifique os saldos antes de tentar novamente.',
      }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({
      ok: true,
      status,
      direction,
      amountUsd: Number(amount.toFixed(2)),
      transactionId: data.transaction_id ?? null,
      requestId,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const err = error as { status?: number; code?: string };
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'A transferência falhou.',
      code: err.code || undefined,
    }, { status: err.status && err.status >= 400 && err.status < 600 ? err.status : 400 });
  }
}
