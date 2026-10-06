import { randomUUID } from 'crypto';
import { getPaymentRequest, transitionPaymentRequest, claimTransfer, completeTransfer, revealRefreshToken, updateRefreshToken, markPlatformTransferCompleted, setPlatformTransferRequestId } from '@/lib/paymentAgentRequests';
import { answerTelegramCallback, editTelegramMessage, telegramRequest } from '@/lib/telegram';
import { derivPaymentRequest, transferWalletToOptions, transferOptionsToWallet, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';
import { refreshAccessToken } from '@/lib/oauth';

function callbackBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN2?.trim()
    || process.env.PAYMENT_AGENT_TELEGRAM_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_PAYMENT_AGENT_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_BOT_TOKEN?.trim()
    || '';
}

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

  const match = data.match(/^pa:(confirm|reject|approve|retry-options):([A-Za-z0-9_-]{1,128})$/);
  if (!match) return false;

  const action = match[1];
  const id = match[2];

  try {
    const row = await getPaymentRequest(id);
    if (!row) throw Object.assign(new Error('Pedido não encontrado.'), { status: 404 });

    if (action === 'confirm') {
      const updated = await transitionPaymentRequest(id, 'client_marked_paid', 'payment_confirmed');
      await answerTelegramCallback(callbackId, updated.type === 'deposit' ? 'Pagamento confirmado.' : 'Levantamento confirmado.').catch(error => {
        console.error('[Payment Agent Telegram] callback acknowledgement failed', error);
      });
      await editPaymentMessage(
        query,
        updated.type === 'deposit'
          ? [
              '✅ <b>PAGAMENTO CONFIRMADO</b>',
              '',
              `Cliente: <b>${escapeHtml(updated.client_name)}</b>`,
              `Conta Deriv: <b>${escapeHtml(updated.client_nickname)}</b>`,
              `Valor: <b>$${amountUsd(updated.amount_usd)} USD</b>`,
              `Valor recebido: <b>${amountUsd(updated.local_amount_mzn)} MZN</b>`,
              '',
              'O pagamento foi confirmado.',
              'A transferência para a Wallet Deriv ainda NÃO foi executada.',
            ].join('\n')
          : [
              '✅ <b>LEVANTAMENTO CONFIRMADO</b>',
              '',
              `Cliente: <b>${escapeHtml(updated.client_name)}</b>`,
              `Conta Deriv: <b>${escapeHtml(updated.client_nickname)}</b>`,
              `Valor: <b>$${amountUsd(updated.amount_usd)} USD</b>`,
              `A pagar ao cliente: <b>${amountUsd(updated.local_amount_mzn)} MZN</b>`,
              '',
              'O pedido foi confirmado.',
              'Ainda NÃO houve transferência de Options para Wallet.',
            ].join('\n'),
        [[{ text: updated.type === 'deposit' ? '🚀 APROVAR TRANSFERÊNCIA' : '🚀 APROVAR LEVANTAMENTO', callback_data: `pa:approve:${updated.id}` }]],
      );
      return true;
    }

    if (action === 'reject') {
      const updated = await transitionPaymentRequest(id, 'client_marked_paid', 'rejected');
      await answerTelegramCallback(callbackId, updated.type === 'deposit' ? 'Pedido de depósito rejeitado.' : 'Pedido de levantamento rejeitado.').catch(error => {
        console.error('[Payment Agent Telegram] callback acknowledgement failed', error);
      });
      await editPaymentMessage(
        query,
        [
          updated.type === 'deposit' ? '❌ <b>PEDIDO DE DEPÓSITO REJEITADO</b>' : '❌ <b>PEDIDO DE LEVANTAMENTO REJEITADO</b>',
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

    if (action === 'retry-options') {
      if (row.status !== 'transfer_pending') throw Object.assign(new Error('Este pedido não está aguardando transferência para Options.'), { status: 409 });
      await answerTelegramCallback(callbackId, 'A tentar novamente Wallet → Options…').catch(() => undefined);
      const refreshToken = revealRefreshToken(row);
      const clientId = process.env.DERIV_APP_ID?.trim();
      if (!refreshToken || !clientId) throw new Error('Refresh token do cliente indisponível para transferir Wallet → Options.');
      const refreshed = await refreshAccessToken(clientId, refreshToken);
      if (refreshed.refresh_token) await updateRefreshToken(row.id, refreshed.refresh_token);
      const platformRequestId = (row.platform_transfer_request_id || randomUUID()) as ReturnType<typeof randomUUID>;
      if (!row.platform_transfer_request_id) await setPlatformTransferRequestId(row.id, platformRequestId);
      try {
        const result = await transferWalletToOptions(refreshed.access_token, Number(row.amount_usd), platformRequestId);
        const completed = await markPlatformTransferCompleted(row.id);
        await editPaymentMessage(query, [
          '✅ <b>DEPÓSITO CONCLUÍDO — WALLET → OPTIONS</b>',
          '',
          `Cliente: <b>${escapeHtml(completed?.client_name || row.client_name)}</b>`,
          `Conta Options: <b>USD</b>`,
          `Valor: <b>$${amountUsd(completed?.amount_usd || row.amount_usd)} USD</b>`,
          '',
          'O valor foi transferido da Wallet para a conta Options real do cliente.',
        ].join('\\n'));
        return true;
      } catch (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code === 'DuplicateRequestID') {
          const completed = await markPlatformTransferCompleted(row.id);
          await editPaymentMessage(query, [
            '✅ <b>WALLET → OPTIONS JÁ EXECUTADO</b>',
            '',
            `Cliente: <b>${escapeHtml(completed?.client_name || row.client_name)}</b>`,
            `Valor: <b>$${amountUsd(completed?.amount_usd || row.amount_usd)} USD</b>`,
          ].join('\\n'));
          return true;
        }
        throw error;
      }
    }

    if (action === 'approve' && row.type === 'withdraw') {
      if (row.status !== 'payment_confirmed') throw Object.assign(new Error('O levantamento ainda não foi confirmado pelo agente.'), { status: 409 });
      const refreshToken = revealRefreshToken(row);
      const clientId = process.env.DERIV_APP_ID?.trim();
      if (!refreshToken || !clientId) throw new Error('Refresh token do cliente indisponível para transferir Options → Wallet.');
      await answerTelegramCallback(callbackId, 'A preparar Options → Wallet…').catch(() => undefined);
      const refreshed = await refreshAccessToken(clientId, refreshToken);
      if (refreshed.refresh_token) await updateRefreshToken(row.id, refreshed.refresh_token);
      const platformRequestId = (row.platform_transfer_request_id || randomUUID()) as ReturnType<typeof randomUUID>;
      if (!row.platform_transfer_request_id) await setPlatformTransferRequestId(row.id, platformRequestId);

      try {
        await transferOptionsToWallet(refreshed.access_token, Number(row.amount_usd), platformRequestId);
      } catch (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code === 'DuplicateRequestID') {
          // The idempotency key indicates the Options → Wallet transfer was already submitted.
        } else {
          throw error;
        }
      }

      await answerTelegramCallback(callbackId, 'Options → Wallet concluído. A enviar para o Payment Agent…').catch(() => undefined);
      const withdrawalRequestId = row.transfer_request_id || randomUUID();
      const result = await derivPaymentRequest(
        refreshed.access_token,
        '/payment-agents/v1/withdraw',
        'POST',
        {
          data: {
            agent_id: PAYMENT_AGENT_ID,
            amount: amountUsd(row.amount_usd),
            currency: 'USD',
            verification_code: revealVerificationCode(row),
            request_id: withdrawalRequestId,
            notes: `MozHyper Payment Agent ${row.id}`,
          },
        },
        false,
      );
      const transferStatus = String(result?.data?.status || 'pending');
      const transactionId = result?.data?.transaction_id ?? null;
      const saved = await completeTransfer(id, transactionId == null ? null : String(transactionId), transferStatus === 'complete' ? 'completed' : 'transfer_pending');

      if (transferStatus === 'complete') {
        await editPaymentMessage(query, [
          '✅ <b>LEVANTAMENTO CONCLUÍDO</b>',
          '',
          `Cliente: <b>${escapeHtml(saved?.client_name || row.client_name)}</b>`,
          `Valor levantado: <b>$${amountUsd(saved?.amount_usd || row.amount_usd)} USD</b>`,
          `Enviado para Wallet do agente: <b>Payment Agent 503</b>`,
          '',
          'O valor foi retirado da conta Options e enviado para a Wallet do Payment Agent.',
          'O agente deve liquidar o equivalente ao cliente por M-Pesa/e-Mola.',
        ].join('\n'));
      } else {
        await editPaymentMessage(query, [
          '⏳ <b>LEVANTAMENTO EM PROCESSAMENTO</b>',
          '',
          `Cliente: <b>${escapeHtml(saved?.client_name || row.client_name)}</b>`,
          `Valor: <b>$${amountUsd(saved?.amount_usd || row.amount_usd)} USD</b>`,
          `Request ID: <b>${escapeHtml(withdrawalRequestId)}</b>`,
          '',
          'Options → Wallet foi executado. O Payment Agent está a processar o levantamento.',
        ].join('\n'));
      }
      return true;
    }

    const claimed = await claimTransfer(id);
    const paymentAgentToken = agentToken();
    if (!paymentAgentToken) throw new Error('DERIV_PAYMENT_AGENT_TOKEN não está configurado.');

    await answerTelegramCallback(callbackId, 'Transferência para Wallet a ser processada…').catch(error => {
      console.error('[Payment Agent Telegram] callback acknowledgement failed', error);
    });

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
      const pending = await completeTransfer(id, String(transactionId), 'transfer_pending');
      const refreshToken = revealRefreshToken(pending || claimed);
      const clientId = process.env.DERIV_APP_ID?.trim();
      if (!refreshToken || !clientId) throw new Error('Refresh token do cliente indisponível para transferir Wallet → Options.');
      const refreshed = await refreshAccessToken(clientId, refreshToken);
      if (refreshed.refresh_token) await updateRefreshToken(id, refreshed.refresh_token);
      const platformRequestId = (pending?.platform_transfer_request_id || randomUUID()) as ReturnType<typeof randomUUID>;
      if (!pending?.platform_transfer_request_id) await setPlatformTransferRequestId(id, platformRequestId);

      try {
        await transferWalletToOptions(refreshed.access_token, Number(claimed.amount_usd), platformRequestId);
        const completed = await markPlatformTransferCompleted(id);
        await editPaymentMessage(query, [
          '✅ <b>DEPÓSITO CONCLUÍDO — WALLET → OPTIONS</b>',
          '',
          `Cliente: <b>${escapeHtml(completed?.client_name || claimed.client_name)}</b>`,
          `Conta Deriv: <b>${escapeHtml(completed?.client_nickname || claimed.client_nickname)}</b>`,
          `Valor: <b>$${amountUsd(completed?.amount_usd || claimed.amount_usd)} USD</b>`,
          `Transaction ID Wallet: <b>${escapeHtml(String(transactionId))}</b>`,
          '',
          'Pagamento do agente → Wallet concluído.',
          'Wallet → Options real USD concluído automaticamente.',
        ].join('\\n'));
        return true;
      } catch (error) {
        const code = String((error as { code?: string })?.code || '');
        if (code === 'DuplicateRequestID') {
          const completed = await markPlatformTransferCompleted(id);
          await editPaymentMessage(query, [
            '✅ <b>WALLET → OPTIONS JÁ EXECUTADO</b>',
            '',
            `Cliente: <b>${escapeHtml(completed?.client_name || claimed.client_name)}</b>`,
            `Valor: <b>$${amountUsd(completed?.amount_usd || claimed.amount_usd)} USD</b>`,
          ].join('\\n'));
          return true;
        }
        await editPaymentMessage(query, [
          '⚠️ <b>WALLET RECEBEU — OPTIONS PENDENTE</b>',
          '',
          `Cliente: <b>${escapeHtml(claimed.client_name)}</b>`,
          `Valor: <b>$${amountUsd(claimed.amount_usd)} USD</b>`,
          '',
          'O depósito foi concluído na Wallet, mas Wallet → Options falhou.',
          'Nenhum novo depósito será enviado. Pode tentar novamente abaixo.',
        ].join('\\n'), [[{ text: '🔁 TENTAR WALLET → OPTIONS', callback_data: `pa:retry-options:${id}` }]]);
        return true;
      }
    }

    if (transferStatus === 'pending') {
      await editPaymentMessage(query, [
        '⏳ <b>TRANSFERÊNCIA PARA WALLET EM PROCESSAMENTO</b>',
        '',
        `Cliente: <b>${escapeHtml(claimed.client_name)}</b>`,
        `Conta Deriv: <b>${escapeHtml(claimed.client_nickname)}</b>`,
        `Valor: <b>$${amountUsd(claimed.amount_usd)} USD</b>`,
        `Request ID: <b>${escapeHtml(String(claimed.transfer_request_id || '—'))}</b>`,
        '',
        'A Deriv ainda está a processar. Wallet → Options será feito após a confirmação.',
      ].join('\\n'));
      return true;
    }

    throw new Error(`Transferência não concluída. Estado recebido: ${transferStatus || 'desconhecido'}`);  } catch (error) {
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

export async function handlePaymentAgentTelegramMessage(message: any) {
  const chatId = String(message?.chat?.id || '');
  const agentChatId = configuredAgentChatId();
  const fromId = String(message?.from?.id || '');
  if (!agentChatId || chatId !== agentChatId || fromId !== agentChatId) return false;

  const command = String(message?.text || '').trim().toLowerCase();
  if (!command.startsWith('/start') && command !== '/test' && command !== 'teste') return false;

  await telegramRequest('sendMessage', {
    chat_id: agentChatId,
    text: [
      '✅ <b>Payment Agent 503 — BOT ONLINE</b>',
      '',
      'Telegram está ligado ao sistema MozHyper.',
      'Os próximos pedidos de depósito serão enviados para este chat.',
      '',
      'Para confirmar um pagamento, use o botão <b>CONFIRMAR PAGAMENTO</b> no alerta.',
    ].join('\n'),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
  return true;
}
