import { getPaymentRequest, transitionPaymentRequest, claimTransfer, completeTransfer } from '@/lib/paymentAgentRequests';
import { answerTelegramCallback, editTelegramMessage, telegramRequest } from '@/lib/telegram';
import { derivPaymentRequest } from '@/lib/paymentAgent';

function configuredAgentChatId() {
  return (
    process.env.PAYMENT_AGENT_TELEGRAM_CHAT_ID?.trim()
    || process.env.TELEGRAM_PAYMENT_AGENT_CHAT_ID?.trim()
    || process.env.TELEGRAM_AGENT_CHAT_ID?.trim()
    || ''
  );
}

function agentToken() {
  return process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim() || '';
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char] || char));
}

function amountUsd(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
}

async function editPaymentMessage(query: any, text: string, buttons: Array<Array<{ text: string; callback_data: string }>> = []) {
  await editTelegramMessage(
    String(query.message?.chat?.id || configuredAgentChatId()),
    Number(query.message?.message_id),
    text,
    buttons,
  );
}

export async function handlePaymentAgentTelegramCallback(query: any) {
  const callbackId = String(query.id || '');
  const data = String(query.data || '');
  const fromId = String(query.from?.id || '');
  const agentChatId = configuredAgentChatId();
  const messageChatId = String(query.message?.chat?.id || '');

  if (!agentChatId || fromId !== agentChatId || messageChatId !== agentChatId) {
    if (callbackId) {
      await answerTelegramCallback(callbackId, 'Sem autorização.', true).catch(() => undefined);
    }
    return false;
  }

  const match = data.match(/^pa:(confirm|reject|approve):([A-Za-z0-9_-]{1,128})$/);
  if (!match) return false;

  const action = match[1];
  const id = match[2];

  try {
    const row = await getPaymentRequest(id);
    if (!row || row.type !== 'deposit') throw Object.assign(new Error('Pedido de depósito não encontrado.'), { status: 404 });

    if (action === 'confirm') {
      const updated = await transitionPaymentRequest(id, 'client_marked_paid', 'payment_confirmed');
      await answerTelegramCallback(callbackId, 'Pagamento confirmado.');
      await editPaymentMessage(
        query,
        [
          '✅ <b>PAGAMENTO CONFIRMADO</b>',
          '',
          `Cliente: <b>${escapeHtml(updated.client_name)}</b>`,
          `Conta Deriv: <b>${escapeHtml(updated.client_nickname)}</b>`,
          `Valor: <b>$${amountUsd(updated.amount_usd)} USD</b>`,
          `Valor recebido: <b>${amountUsd(updated.local_amount_mzn)} MZN</b>`,
          '',
          'O pagamento foi confirmado.',
          'A transferência para a Wallet Deriv ainda NÃO foi executada.',
        ].join('\n'),
        [[{ text: '🚀 APROVAR TRANSFERÊNCIA', callback_data: `pa:approve:${updated.id}` }]],
      );
      return true;
    }

    if (action === 'reject') {
      const updated = await transitionPaymentRequest(id, 'client_marked_paid', 'rejected');
      await answerTelegramCallback(callbackId, 'Pedido rejeitado.');
      await editPaymentMessage(
        query,
        [
          '❌ <b>PEDIDO REJEITADO</b>',
          '',
          `Cliente: <b>${escapeHtml(updated.client_name)}</b>`,
          `Conta Deriv: <b>${escapeHtml(updated.client_nickname)}</b>`,
          `Valor: <b>$${amountUsd(updated.amount_usd)} USD</b>`,
          '',
          'Nenhuma transferência será executada.',
        ].join('\n'),
      );
      return true;
    }

    const claimed = await claimTransfer(id);
    const paymentAgentToken = agentToken();
    if (!paymentAgentToken) throw new Error('DERIV_PAYMENT_AGENT_TOKEN não está configurado.');

    await answerTelegramCallback(callbackId, 'Transferência a ser processada…');

    const result = await derivPaymentRequest(
      paymentAgentToken,
      '/payment-agents/v1/transfer',
      'POST',
      {
        data: {
          to_nickname: claimed.client_nickname,
          amount: amountUsd(claimed.amount_usd),
          currency: 'USD',
          notes: `MozHyper Payment Agent ${claimed.id}`,
          request_id: claimed.transfer_request_id,
          dry_run: false,
        },
      },
      true,
    );

    const transferStatus = String(result?.data?.status || '');
    const transactionId = result?.data?.transaction_id ?? null;

    if (transferStatus === 'complete' && transactionId != null) {
      const completed = await completeTransfer(id, String(transactionId), 'completed');
      await editPaymentMessage(
        query,
        [
          '✅ <b>TRANSFERÊNCIA CONCLUÍDA</b>',
          '',
          `Cliente: <b>${escapeHtml(completed?.client_name || claimed.client_name)}</b>`,
          `Conta Deriv: <b>${escapeHtml(completed?.client_nickname || claimed.client_nickname)}</b>`,
          `Valor enviado: <b>$${amountUsd(completed?.amount_usd || claimed.amount_usd)} USD</b>`,
          `Transaction ID: <b>${escapeHtml(String(transactionId))}</b>`,
          '',
          'O valor foi enviado para a Wallet Deriv do cliente.',
        ].join('\n'),
      );
      return true;
    }

    if (transferStatus === 'pending') {
      await editPaymentMessage(
        query,
        [
          '⏳ <b>TRANSFERÊNCIA EM PROCESSAMENTO</b>',
          '',
          `Cliente: <b>${escapeHtml(claimed.client_name)}</b>`,
          `Conta Deriv: <b>${escapeHtml(claimed.client_nickname)}</b>`,
          `Valor: <b>$${amountUsd(claimed.amount_usd)} USD</b>`,
          `Request ID: <b>${escapeHtml(String(claimed.transfer_request_id || '—'))}</b>`,
          '',
          'A Deriv ainda está a processar a transferência.',
        ].join('\n'),
      );
      return true;
    }

    throw new Error(`Transferência não concluída. Estado recebido: ${transferStatus || 'desconhecido'}`);
  } catch (error) {
    console.error('[Payment Agent Telegram Callback]', error);
    const message = error instanceof Error ? error.message : 'Não foi possível processar o pedido.';
    await answerTelegramCallback(callbackId, message.slice(0, 190), true).catch(() => undefined);

    try {
      await editPaymentMessage(
        query,
        `⚠️ <b>ERRO AO PROCESSAR PEDIDO</b>\n\n${escapeHtml(message)}\n\nO sistema não deve ser considerado como transferência concluída sem confirmação.`,
      );
    } catch {}
    return true;
  }
}

export async function verifyPaymentAgentWebhookRequest(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || '';
  return Boolean(expected && request.headers.get('x-telegram-bot-api-secret-token') === expected);
}
