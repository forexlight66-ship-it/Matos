const TELEGRAM_API = 'https://api.telegram.org';

function token() {
  return process.env.PAYMENT_AGENT_TELEGRAM_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_BOT_TOKEN?.trim()
    || '';
}

function chatIds() {
  return Array.from(new Set([
    process.env.PAYMENT_AGENT_TELEGRAM_CHAT_ID?.trim(),
    process.env.TELEGRAM_AGENT_CHAT_ID?.trim(),
    process.env.TELEGRAM_ADMIN_CHAT_ID?.trim(),
  ].filter(Boolean)));
}

export async function telegramRequest(method: string, body: Record<string, unknown>) {
  const botToken = token();
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) {
    throw new Error(data?.description || `Telegram API failed (${response.status})`);
  }
  return data;
}

export async function sendAgentAlert(text: string, buttons: Array<Array<{ text: string; callback_data: string }>>) {
  const ids = chatIds();
  if (!ids.length) throw new Error('TELEGRAM_AGENT_CHAT_ID is not configured');

  let lastError: unknown = null;
  for (const id of ids) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await telegramRequest('sendMessage', {
          chat_id: id,
          text,
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: buttons },
          disable_web_page_preview: true,
        });
      } catch (error) {
        lastError = error;
        if (attempt === 2) {
          console.error('[Telegram Agent Alert] delivery failed', {
            chatId: id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Telegram alert delivery failed');
}

export async function answerTelegramCallback(callbackQueryId: string, text: string, showAlert = false) {
  return telegramRequest('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

export async function editTelegramMessage(chatIdValue: string | number, messageId: number, text: string) {
  return telegramRequest('editMessageText', {
    chat_id: chatIdValue,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

export function telegramConfigured() {
  return Boolean(token() && chatIds().length);
}
