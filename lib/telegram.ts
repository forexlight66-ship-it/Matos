const TELEGRAM_API = 'https://api.telegram.org';

function token() {
  // Payment Agent 503 uses the second Telegram bot configured in Render.
  // Keep the course bot completely separate.
  return process.env.TELEGRAM_BOT_TOKEN2?.trim()
    || process.env.PAYMENT_AGENT_TELEGRAM_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_PAYMENT_AGENT_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_BOT_PAYMENT_AGENT_TOKEN?.trim()
    || process.env.TELEGRAM_PAYMENT_AGENT_TOKEN?.trim()
    || process.env.PAYMENT_AGENT_BOT_TOKEN?.trim()
    || process.env.PAYMENT_AGENT_TELEGRAM_TOKEN?.trim()
    || process.env.TELEGRAM_PAYMENTAGENT_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_PAYMENTAGENT_TOKEN?.trim()
    || process.env.PAYMENTAGENT_TELEGRAM_BOT_TOKEN?.trim()
    || process.env.PAYMENTAGENT_BOT_TOKEN?.trim()
    || process.env.TELEGRAM_BOT_TOKEN_PAYMENT_AGENT?.trim()
    || process.env.TELEGRAM_BOT_TOKEN2?.trim()
    || '';
}

function chatIds() {
  return Array.from(new Set([
    process.env.PAYMENT_AGENT_TELEGRAM_CHAT_ID?.trim(),
    process.env.TELEGRAM_PAYMENT_AGENT_CHAT_ID?.trim(),
    process.env.TELEGRAM_AGENT_CHAT_ID?.trim(),
    process.env.PAYMENT_AGENT_CHAT_ID?.trim(),
  ].filter(Boolean)));
}

function webhookSecret() {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || '';
}

function appBaseUrl() {
  return (
    process.env.PAYMENT_AGENT_TELEGRAM_WEBHOOK_BASE_URL?.trim()
    || process.env.RENDER_EXTERNAL_URL?.trim()
    || process.env.NEXT_PUBLIC_APP_URL?.trim()
    || 'https://matos-1n.onrender.com'
  ).replace(/\/$/, '');
}

let webhookSetup: Promise<void> | null = null;

export async function telegramRequest(method: string, body: Record<string, unknown>) {
  const botToken = token();
  if (!botToken) throw new Error('Payment Agent Telegram bot token is not configured');
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

export async function ensurePaymentAgentWebhook() {
  if (webhookSetup) return webhookSetup;
  webhookSetup = (async () => {
    const botToken = token();
    const secret = webhookSecret();
    if (!botToken) throw new Error('Payment Agent Telegram bot token is not configured');
    if (!secret) throw new Error('TELEGRAM_WEBHOOK_SECRET is not configured');
    const url = `${appBaseUrl()}/api/telegram/payment-agent/webhook`;
    await telegramRequest('setWebhook', {
      url,
      secret_token: secret,
      allowed_updates: ['message', 'callback_query'],
      drop_pending_updates: false,
    });
  })().catch(error => {
    webhookSetup = null;
    throw error;
  });
  return webhookSetup;
}

export async function sendAgentAlert(text: string, buttons: Array<Array<{ text: string; callback_data: string }>>) {
  const ids = chatIds();
  if (!ids.length) throw new Error('Payment Agent Telegram chat ID is not configured');

  void ensurePaymentAgentWebhook().catch(error => {
    console.error('[Payment Agent Telegram] webhook setup failed', error instanceof Error ? error.message : String(error));
  });

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

export async function editTelegramMessage(chatIdValue: string | number, messageId: number, text: string, buttons?: Array<Array<{ text: string; callback_data: string }>>) {
  return telegramRequest('editMessageText', {
    chat_id: chatIdValue,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    reply_markup: buttons ? { inline_keyboard: buttons } : { inline_keyboard: [] },
    disable_web_page_preview: true,
  });
}

export function telegramConfigured() {
  return Boolean(token() && chatIds().length && webhookSecret());
}
