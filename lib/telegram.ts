const TELEGRAM_API = 'https://api.telegram.org';

function token() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
}

function chatId() {
  return process.env.TELEGRAM_AGENT_CHAT_ID?.trim() || '';
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
  const id = chatId();
  if (!id) throw new Error('TELEGRAM_AGENT_CHAT_ID is not configured');
  return telegramRequest('sendMessage', {
    chat_id: id,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: buttons },
    disable_web_page_preview: true,
  });
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
  return Boolean(token() && chatId());
}
