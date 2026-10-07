import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { markDepositPaid, getPaymentRequest } from '@/lib/paymentAgentRequests';
import { isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { sendAgentAlert } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char] || char));
}

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  const requestedId = String(new URL(request.url).searchParams.get('request_id') || '').trim();
 if (!isPaymentAgentCountryAllowed(session.country) && !requestedId) return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes elegíveis.', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const id = String(body.requestId || requestedId || '').trim();
  if (!id) return NextResponse.json({ error: 'requestId é obrigatório' }, { status: 400 });

  try {
    const existing = await getPaymentRequest(id);
    const isBinanceAi = existing?.purpose === 'ai_analyst' && existing?.payment_method === 'binance_usdt_trc20';
    if (!isPaymentAgentCountryAllowed(session.country) && !isBinanceAi) return NextResponse.json({ error: 'Pedido não elegível para este fluxo.' }, { status: 403 });
    const row = await markDepositPaid(session.id, id);
    try {
      await sendAgentAlert(
        isBinanceAi ? `🔔 <b>AI ANALYST — USDT ENVIADO</b>\n\nCliente:` : `🔔 <b>NOVO DEPÓSITO — PAGAMENTO INFORMADO</b>\n\nCliente: <b>${escapeHtml(row.client_name)}</b>\nConta Deriv: <b>${escapeHtml(row.client_nickname)}</b>\nValor: <b>$${Number(row.amount_usd).toFixed(2)} USD</b>\nCâmbio: <b>1 USD = ${Number(row.exchange_rate).toFixed(0)} MZN</b>\nA pagar: <b>${Number(row.local_amount_mzn).toFixed(2)} MZN</b>\nMétodo: <b>${row.payment_method === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</b>\nNúmero: <b>${escapeHtml(row.payment_number || '—')}</b>\nNome: <b>${escapeHtml(row.payment_name || '—')}</b>\n\n⚠️ O cliente informou que já efetuou o pagamento. Confirme o recebimento antes de qualquer transferência.`,
        [[
          { text: '✅ CONFIRMAR PAGAMENTO', callback_data: `pa:confirm:${row.id}` },
          { text: '❌ REJEITAR', callback_data: `pa:reject:${row.id}` },
        ]],
      );
    } catch (telegramError) {
      console.error('[Payment Agent] Telegram alert failed', {
        requestId: row.id,
        error: telegramError instanceof Error ? telegramError.message : String(telegramError),
      });
    }
    return NextResponse.json({ requestId: row.id, status: row.status }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Não foi possível marcar o depósito como pago' },
      { status: (error as { status?: number }).status || 500 },
    );
  }
}
