import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { markDepositPaid, getPaymentRequest } from '@/lib/paymentAgentRequests';
import { isPaymentAgentCountryAllowed } from '@/lib/paymentAgent';
import { sendAgentAlert, sendAgentPhotoAlert } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char] || char));
}

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  const requestedId = String(new URL(request.url).searchParams.get('request_id') || '').trim();
 if (!isPaymentAgentCountryAllowed(session.country) && !requestedId) return NextResponse.json({ error: 'O Payment Agent está disponível apenas para clientes elegíveis.', code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED' }, { status: 403 });

  const contentType = request.headers.get('content-type') || '';
  let body: Record<string, unknown> = {};
  let proof: File | null = null;
  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    body = { requestId: form.get('requestId') };
    const uploaded = form.get('paymentProof');
    if (uploaded instanceof File) proof = uploaded;
  } else {
    body = await request.json().catch(() => ({}));
  }
  const id = String(body.requestId || requestedId || '').trim();
  if (!proof || proof.size <= 0) return NextResponse.json({ error: 'Envie o screenshot/comprovativo do pagamento antes de clicar em “JÁ PAGUEI”.' }, { status: 400 });
  if (!proof.type.startsWith('image/')) return NextResponse.json({ error: 'O comprovativo deve ser uma imagem.' }, { status: 400 });
  if (proof.size > 10 * 1024 * 1024) return NextResponse.json({ error: 'O comprovativo deve ter no máximo 10 MB.' }, { status: 400 });
  if (!id) return NextResponse.json({ error: 'requestId é obrigatório' }, { status: 400 });

  try {
    const existing = await getPaymentRequest(id);
    const isBinanceAi = existing?.purpose === 'ai_analyst' && existing?.payment_method === 'binance_usdt_trc20';
    if (!isPaymentAgentCountryAllowed(session.country) && !isBinanceAi) return NextResponse.json({ error: 'Pedido não elegível para este fluxo.' }, { status: 403 });
    const row = await markDepositPaid(session.id, id);
    try {
      const isAiAnalyst = row.purpose === 'ai_analyst';
      const isCourse = row.purpose === 'complete_course';
      const alertText = isCourse
        ? [
            '🔔 <b>COMPLETE COURSE — PAGAMENTO INFORMADO</b>',
            '',
            `Cliente: <b>${escapeHtml(row.client_name)}</b>`,
            `Conta Deriv: <code>${escapeHtml(row.client_nickname)}</code>`,
            'Serviço: <b>Complete Course</b>',
            'Acesso: <b>Ilimitado</b>',
            `Valor: <b>${row.payment_method === 'binance_usdt_trc20' ? '15 USDT' : '999 MZN'}</b>`,
            `Método: <b>${row.payment_method === 'binance_usdt_trc20' ? 'Binance — TRC20' : row.payment_method === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</b>`,
            ...(row.payer_name || row.payer_number ? [`Seu nome: <b>${escapeHtml(row.payer_name || '—')}</b>`,`Número usado para pagamento: <b>${escapeHtml(row.payer_number || '—')}</b>`] : []),
            '',
            '⚠️ O cliente clicou em “JÁ PAGUEI”. O comprovativo está anexado. Confirme o recebimento antes de ativar o curso.',
          ].join('\n')
        : isAiAnalyst
        ? row.payment_method === 'binance_usdt_trc20'
          ? [
              '🔔 <b>AI ANALYST — PAGAMENTO INFORMADO</b>',
              '',
              `Nome do cliente: <b>${escapeHtml(row.client_name)}</b>`,
              `Conta Deriv: <code>${escapeHtml(row.client_nickname)}</code>`,
              'Serviço: <b>AI Analyst</b>',
              'Plano: <b>30 dias</b>',
              'Valor: <b>3 USDT</b>',
              'Método: <b>Binance — TRC20</b>',
              '',
              '⚠️ O cliente informou o pagamento. Confirme o recebimento antes de ativar o serviço.',
            ].join('\n')
          : [
              '🔔 <b>AI ANALYST — PAGAMENTO INFORMADO</b>',
              '',
              `Cliente: <b>${escapeHtml(row.client_name)}</b>`,
              `Conta Deriv: <code>${escapeHtml(row.client_nickname)}</code>`,
              'Serviço: <b>AI Analyst</b>',
              'Plano: <b>30 dias</b>',
              'Valor: <b>250 MZN</b>',
              `Método: <b>${row.payment_method === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</b>`,
              `Seu nome: <b>${escapeHtml(row.payer_name || '—')}</b>`,
              `Número usado para pagamento: <b>${escapeHtml(row.payer_number || '—')}</b>`,
              '',
              '⚠️ O cliente clicou em “JÁ PAGUEI”. Confirme o recebimento antes de ativar o serviço.',
            ].join('\n')
        : [
            '🔔 <b>NOVO DEPÓSITO — PAGAMENTO INFORMADO</b>',
            '',
            `Cliente: <b>${escapeHtml(row.client_name)}</b>`,
            `Conta Deriv: <code>${escapeHtml(row.client_nickname)}</code>`,
            `Valor: <b>${Number(row.amount_usd).toFixed(2)} USD</b>`,
            `Câmbio: <b>1 USD = ${Number(row.exchange_rate).toFixed(0)} MZN</b>`,
            `A pagar: <b>${Number(row.local_amount_mzn).toFixed(2)} MZN</b>`,
            `Método: <b>${row.payment_method === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</b>`,
            `Número: <b>${escapeHtml(row.payment_number || '—')}</b>`,
            `Nome: <b>${escapeHtml(row.payment_name || '—')}</b>`,
            `Seu nome: <b>${escapeHtml(row.payer_name || '—')}</b>`,
            `Número usado para pagamento: <b>${escapeHtml(row.payer_number || '—')}</b>`,
            '',
            '⚠️ O cliente informou que já efetuou o pagamento. Confirme o recebimento antes de qualquer transferência.',
          ].join('\n');
      const buttons = [[
        { text: '✅ CONFIRMAR PAGAMENTO', callback_data: `pa:confirm:${row.id}` },
        { text: '❌ REJEITAR', callback_data: `pa:reject:${row.id}` },
      ]];
      await sendAgentPhotoAlert(
        proof!,
        `${alertText}\n\n📎 <b>COMPROVATIVO DE PAGAMENTO ANEXADO</b>`,
        buttons,
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
