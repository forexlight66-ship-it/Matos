import { NextRequest, NextResponse } from 'next/server';
import {
  approvePayment,
  createPaymentRequest,
  getLatestAwaitingProof,
  rejectPayment,
  saveProof,
} from '@/lib/telegram-course';

export const dynamic = 'force-dynamic';

const token = () => process.env.TELEGRAM_BOT_TOKEN || '';
const adminChatId = () => process.env.TELEGRAM_ADMIN_CHAT_ID || '';
const price = () => process.env.COURSE_PRICE_MZN || '—';
const emola = () => process.env.EMOLA_NUMBER || '—';
const mpesa = () => process.env.MPESA_NUMBER || '—';

async function telegram(method: string, body: Record<string, unknown>) {
  const botToken = token();
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data?.description || `Telegram API error: ${response.status}`);
  return data.result;
}

function courseIntro() {
  return [
    '👋 Bem-vindo ao Curso Completo!',
    '',
    '📚 O curso ensina, passo a passo, como utilizar a plataforma, compreender as ferramentas e trabalhar com gestão de risco e estratégias.',
    '',
    `💰 Valor: ${price()} MT`,
    `📱 e-Mola: ${emola()}`,
    `📱 M-Pesa: ${mpesa()}`,
    '',
    'Depois de fazer o pagamento, envie o comprovativo neste bot. A validação é feita manualmente.',
  ].join('\\n');
}

async function sendCourse(chatId: number) {
  return telegram('sendMessage', {
    chat_id: chatId,
    text: courseIntro(),
    reply_markup: {
      inline_keyboard: [[{ text: '💳 Já fiz o pagamento', callback_data: 'course_pay' }]],
    },
  });
}

async function handleCallback(query: any) {
  const callbackId = String(query.id || '');
  const data = String(query.data || '');
  const fromId = String(query.from?.id || '');
  const message = query.message;
  const chatId = Number(message?.chat?.id);

  if (data === 'course_pay') {
    if (!Number.isFinite(chatId)) return;
    const request = await createPaymentRequest({
      telegramUserId: Number(query.from?.id),
      chatId,
      username: query.from?.username,
      firstName: query.from?.first_name,
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Envie agora o comprovativo.' });
    await telegram('sendMessage', {
      chat_id: chatId,
      text: `📸 Envie o screenshot/comprovativo do pagamento aqui.

Referência do pedido: #${request.id}`,
    });
    return;
  }

  const match = data.match(/^course_(approve|reject):(\\d+)$/);
  if (!match) return;
  if (fromId !== adminChatId()) {
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Sem autorização.', show_alert: true });
    return;
  }

  const paymentId = Number(match[2]);
  if (match[1] === 'approve') {
    const approved = await approvePayment(paymentId);
    if (!approved) {
      await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento já processado.', show_alert: true });
      return;
    }
    await telegram('sendMessage', {
      chat_id: Number(approved.payment.chat_id),
      text: `✅ Pagamento confirmado!

🔐 Senha de acesso ao curso:
${approved.code}

Guarde esta senha. Ela será usada para desbloquear o curso.`,
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento aprovado.' });
    await telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
    await telegram('sendMessage', { chat_id: chatId, text: `✅ Pagamento #${paymentId} aprovado e senha enviada ao cliente.` });
  } else {
    const rejected = await rejectPayment(paymentId);
    if (!rejected) {
      await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento já processado.', show_alert: true });
      return;
    }
    await telegram('sendMessage', {
      chat_id: Number(rejected.chat_id),
      text: '❌ O comprovativo não foi validado. Se acha que houve um engano, envie um novo comprovativo.',
    });
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, text: 'Pagamento recusado.' });
    await telegram('editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: { inline_keyboard: [] },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && request.headers.get('x-telegram-bot-api-secret-token') !== expectedSecret) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    const update = await request.json();
    if (update.callback_query) {
      await handleCallback(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message?.chat?.id) return NextResponse.json({ ok: true });

    const chatId = Number(message.chat.id);
    const text = String(message.text || '');

    if (text.startsWith('/id')) {
      await telegram('sendMessage', { chat_id: chatId, text: `🆔 O teu Telegram Chat ID é: ${chatId}` });
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith('/start') || text.startsWith('/curso')) {
      await sendCourse(chatId);
      return NextResponse.json({ ok: true });
    }

    if (message.photo?.length) {
      // Accept the proof even if the button callback was not persisted first.
      let pending = await getLatestAwaitingProof(chatId);
      if (!pending) {
        pending = await createPaymentRequest({
          telegramUserId: Number(message.from?.id || chatId),
          chatId,
          username: message.from?.username,
          firstName: message.from?.first_name,
        });
      }

      const photo = message.photo[message.photo.length - 1];
      const saved = await saveProof(Number(pending.id), String(photo.file_id));
      if (!saved) {
        await telegram('sendMessage', { chat_id: chatId, text: 'Este comprovativo já foi recebido. Aguarde a validação.' });
        return NextResponse.json({ ok: true });
      }

      const username = pending.username ? `@${pending.username}` : 'sem username';
      await telegram('sendPhoto', {
        chat_id: adminChatId(),
        photo: String(photo.file_id),
        caption: [
          '🔔 NOVO PAGAMENTO — CURSO',
          '',
          `Pedido: #${saved.id}`,
          `Cliente: ${pending.first_name || '—'}`,
          `Telegram: ${username}`,
          `Telegram ID: ${pending.telegram_user_id}`,
          `Valor esperado: ${price()} MT`,
          '',
          'Valide o pagamento e escolha uma opção:',
        ].join('\\n'),
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ APROVAR', callback_data: `course_approve:${saved.id}` },
            { text: '❌ RECUSAR', callback_data: `course_reject:${saved.id}` },
          ]],
        },
      });
      await telegram('sendMessage', {
        chat_id: chatId,
        text: '📨 Comprovativo recebido. Aguarde a validação do pagamento.',
      });
      return NextResponse.json({ ok: true });
    }

    await telegram('sendMessage', { chat_id: chatId, text: courseIntro(), reply_markup: { inline_keyboard: [[{ text: '💳 Já fiz o pagamento', callback_data: 'course_pay' }]] } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Telegram Course]', error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
