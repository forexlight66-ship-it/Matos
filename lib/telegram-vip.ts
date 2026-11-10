import 'server-only';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

const API = 'https://api.telegram.org';
const VIP_GROUP_ID = () => process.env.TELEGRAM_VIP_GROUP_ID?.trim() || '-1004379477378';
const ADMIN_ID = () => process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || '';
const token = () => process.env.TELEGRAM_BOT_TOKEN?.trim() || '';
const mpesa = () => process.env.MPESA_NUMBER?.trim() || '';
const emola = () => process.env.EMOLA_NUMBER?.trim() || '';
const usdtAddress = () => process.env.BINANCE_USDT_ADDRESS?.trim() || '';

type TelegramUser = { id: number; username?: string; first_name?: string };

async function tg(method: string, body: Record<string, unknown>) {
  const botToken = token();
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN não configurado');
  const response = await fetch(`${API}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) throw new Error(data?.description || `Telegram API ${response.status}`);
  return data.result;
}

async function ensureSchema() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurado');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_vip_subscriptions (
      telegram_user_id BIGINT PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMPTZ,
      last_reminder_5d_for TIMESTAMPTZ,
      last_reminder_1d_for TIMESTAMPTZ,
      removed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS telegram_vip_payments (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      username TEXT,
      first_name TEXT,
      payment_method TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL,
      proof_file_id TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_proof',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by BIGINT
    );
    CREATE INDEX IF NOT EXISTS telegram_vip_payments_status_idx ON telegram_vip_payments(status, id);
    CREATE INDEX IF NOT EXISTS telegram_vip_subscriptions_expiry_idx ON telegram_vip_subscriptions(expires_at);
  `);
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c] || c));
}

async function sendMethodMenu(chatId: number) {
  await tg('sendMessage', {
    chat_id: chatId,
    text: [
      '⭐ MATOSFX SIGNALS VIP',
      '',
      'Assinatura mensal — 30 dias',
      '🇲🇿 250 MT — M-Pesa ou e-Mola',
      '🌍 3 USDT — rede TRC20',
      '',
      'Escolha o método de pagamento. Depois envie o comprovativo neste chat. A confirmação é manual pelo administrador.',
    ].join('\\n'),
    reply_markup: { inline_keyboard: [
      [{ text: '📱 M-Pesa — 250 MT', callback_data: 'vip_method:mpesa' }],
      [{ text: '📱 e-Mola — 250 MT', callback_data: 'vip_method:emola' }],
      [{ text: '🟡 USDT TRC20 — 3 USDT', callback_data: 'vip_method:usdt' }],
    ] },
  });
}

async function startPayment(user: TelegramUser, method: string, chatId: number) {
  const details = method === 'mpesa'
    ? { amount: 250, currency: 'MZN', label: 'M-Pesa', destination: mpesa() }
    : method === 'emola'
      ? { amount: 250, currency: 'MZN', label: 'e-Mola', destination: emola() }
      : { amount: 3, currency: 'USDT', label: 'USDT TRC20', destination: usdtAddress() };
  if (!details.destination) {
    await tg('sendMessage', { chat_id: chatId, text: `O método ${details.label} ainda não está configurado. Contacte o administrador.` });
    return;
  }
  await ensureSchema();
  const result = await pool.query(
    `INSERT INTO telegram_vip_payments (telegram_user_id, username, first_name, payment_method, amount, currency, status)
     VALUES ($1,$2,$3,$4,$5,$6,'awaiting_proof') RETURNING id`,
    [user.id, user.username || null, user.first_name || null, method, details.amount, details.currency],
  );
  await tg('sendMessage', {
    chat_id: chatId,
    text: [
      `💳 PAGAMENTO — MATOSFX VIP #${result.rows[0].id}`,
      '',
      `Método: ${details.label}`,
      `Valor: ${details.amount} ${details.currency}`,
      `Destino: ${details.destination}`,
      ...(method === 'usdt' ? ['Rede obrigatória: TRC20'] : ['Titular: Mistério João']),
      '',
      'Após pagar, envie o comprovativo (imagem ou PDF) aqui. O acesso só será renovado depois da confirmação manual do administrador.',
    ].join('\\n'),
  });
}

async function adminReview(paymentId: number, action: 'approve' | 'reject', adminId: number, messageId?: number) {
  await ensureSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const found = await client.query('SELECT * FROM telegram_vip_payments WHERE id=$1 FOR UPDATE', [paymentId]);
    const payment = found.rows[0];
    if (!payment || !['awaiting_proof', 'pending'].includes(payment.status) || !payment.proof_file_id) {
      await client.query('ROLLBACK');
      return false;
    }
    if (action === 'approve') {
      await client.query(
        `INSERT INTO telegram_vip_subscriptions (telegram_user_id,username,first_name,status,expires_at,removed_at,last_reminder_5d_for,last_reminder_1d_for)
         VALUES ($1,$2,$3,'active',NOW()+INTERVAL '30 days',NULL,NULL,NULL)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
           username=EXCLUDED.username, first_name=EXCLUDED.first_name, status='active',
           expires_at=GREATEST(COALESCE(telegram_vip_subscriptions.expires_at,NOW()),NOW())+INTERVAL '30 days',
           removed_at=NULL,last_reminder_5d_for=NULL,last_reminder_1d_for=NULL,updated_at=NOW()`,
        [payment.telegram_user_id,payment.username,payment.first_name],
      );
      await client.query(`UPDATE telegram_vip_payments SET status='approved',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1`, [paymentId,adminId]);
    } else {
      await client.query(`UPDATE telegram_vip_payments SET status='rejected',reviewed_at=NOW(),reviewed_by=$2 WHERE id=$1`, [paymentId,adminId]);
    }
    await client.query('COMMIT');
    if (action === 'approve') {
      const invite = await tg('createChatInviteLink', {
        chat_id: VIP_GROUP_ID(),
        member_limit: 1,
        expire_date: Math.floor(Date.now()/1000) + 86400,
        creates_join_request: false,
        name: `VIP-${payment.telegram_user_id}-${paymentId}`,
      });
      await tg('sendMessage', {
        chat_id: String(payment.telegram_user_id),
        text: `✅ Pagamento confirmado! A sua assinatura MatosFx VIP está ativa por 30 dias.\\n\\nEntre no grupo através deste convite pessoal (válido por 24 horas):\\n${invite.invite_link}`,
      });
    } else {
      await tg('sendMessage', { chat_id: String(payment.telegram_user_id), text: '❌ O comprovativo não foi aprovado. Contacte o administrador para esclarecer ou enviar novo comprovativo.' });
    }
    if (messageId) await tg('editMessageReplyMarkup', { chat_id: ADMIN_ID(), message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(() => undefined);
    return true;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function handleVipTelegramUpdate(update: any): Promise<boolean> {
  const message = update?.message;
  const callback = update?.callback_query;
  if (callback) {
    const data = String(callback.data || '');
    const fromId = Number(callback.from?.id || 0);
    const match = data.match(/^vip_(approve|reject):(\\d+)$/);
    if (match) {
      if (!ADMIN_ID() || String(fromId) !== ADMIN_ID()) {
        await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Sem autorização.', show_alert: true });
        return true;
      }
      const ok = await adminReview(Number(match[2]), match[1] as 'approve'|'reject', fromId, Number(callback.message?.message_id));
      await tg('answerCallbackQuery', { callback_query_id: callback.id, text: ok ? 'Pedido processado.' : 'Pedido já processado ou sem comprovativo.', show_alert: !ok });
      return true;
    }
    const method = data.match(/^vip_method:(mpesa|emola|usdt)$/);
    if (method) {
      await startPayment(callback.from as TelegramUser, method[1], Number(callback.message?.chat?.id));
      await tg('answerCallbackQuery', { callback_query_id: callback.id, text: 'Dados de pagamento enviados.' });
      return true;
    }
    return false;
  }
  if (!message?.chat?.id || !message?.from?.id) return false;
  const text = String(message.text || '').trim();
  const user = message.from as TelegramUser;
  const chatId = Number(message.chat.id);
  const fromAdmin = ADMIN_ID() && String(user.id) === ADMIN_ID() && String(chatId) === ADMIN_ID();

  if (fromAdmin && /^\\/vip_pendentes(?:@\\w+)?$/i.test(text)) {
    await ensureSchema();
    const rows = await pool.query(`SELECT id,telegram_user_id,username,first_name,amount,currency,payment_method,created_at FROM telegram_vip_payments WHERE status='pending' AND proof_file_id IS NOT NULL ORDER BY id ASC LIMIT 20`);
    await tg('sendMessage', { chat_id: chatId, text: rows.rows.length ? rows.rows.map((r:any)=>`#${r.id} — ${r.first_name||'Cliente'} (@${r.username||'sem username'}) — ${r.amount} ${r.currency} — Telegram ID ${r.telegram_user_id}`).join('\\n') : 'Não há pagamentos pendentes.' });
    return true;
  }
  if (fromAdmin && /^\\/vip_assinatura\\s+(\\d+)/i.test(text)) {
    await ensureSchema();
    const id = text.match(/^\\/vip_assinatura\\s+(\\d+)/i)?.[1];
    const result = await pool.query('SELECT * FROM telegram_vip_subscriptions WHERE telegram_user_id=$1', [id]);
    const row = result.rows[0];
    await tg('sendMessage', { chat_id: chatId, text: row ? `Telegram ID: ${id}\\nEstado: ${row.status}\\nValidade: ${row.expires_at || 'sem validade'}` : 'Assinatura não encontrada.' });
    return true;
  }
  if (/^\\/vip(?:@\\w+)?$/i.test(text) || /^\\/start(?:@\\w+)?\\s+vip$/i.test(text)) {
    await sendMethodMenu(chatId);
    return true;
  }
  if (message.photo?.length || message.document?.file_id) {
    await ensureSchema();
    const pending = await pool.query(
      `SELECT id FROM telegram_vip_payments WHERE telegram_user_id=$1 AND status='awaiting_proof' ORDER BY id DESC LIMIT 1`,
      [user.id],
    );
    if (!pending.rows[0]) return false;
    const fileId = message.photo?.length ? message.photo[message.photo.length-1].file_id : message.document.file_id;
    await pool.query(`UPDATE telegram_vip_payments SET proof_file_id=$1,status='pending' WHERE id=$2`, [fileId,pending.rows[0].id]);
    const caption = [
      '🔔 NOVO COMPROVATIVO — MATOSFX VIP',
      '',
      `Pedido: #${pending.rows[0].id}`,
      `Cliente: ${escapeHtml(user.first_name || '—')}`,
      `Telegram: @${escapeHtml(user.username || 'sem username')}`,
      `Telegram ID: ${user.id}`,
      '',
      'Confirme apenas depois de verificar o recebimento real.',
    ].join('\\n');
    const adminId = ADMIN_ID();
    if (adminId) {
      if (message.photo?.length) {
        await tg('sendPhoto', { chat_id: adminId, photo: fileId, caption, reply_markup: { inline_keyboard: [[
          { text: '✅ CONFIRMAR 30 DIAS', callback_data: `vip_approve:${pending.rows[0].id}` },
          { text: '❌ REJEITAR', callback_data: `vip_reject:${pending.rows[0].id}` },
        ]] } });
      } else {
        await tg('sendDocument', { chat_id: adminId, document: fileId, caption, reply_markup: { inline_keyboard: [[
          { text: '✅ CONFIRMAR 30 DIAS', callback_data: `vip_approve:${pending.rows[0].id}` },
          { text: '❌ REJEITAR', callback_data: `vip_reject:${pending.rows[0].id}` },
        ]] } });
      }
    }
    await tg('sendMessage', { chat_id: chatId, text: '📨 Comprovativo recebido. A assinatura só será ativada depois da validação manual do administrador.' });
    return true;
  }
  return false;
}

export async function processVipSubscriptionReminders() {
  await ensureSchema();
  const due = await pool.query(`
    SELECT telegram_user_id,expires_at,first_name,
      CASE WHEN expires_at > NOW() AND expires_at <= NOW()+INTERVAL '5 days'
        AND (last_reminder_5d_for IS NULL OR last_reminder_5d_for<>expires_at) THEN '5d'
      WHEN expires_at > NOW()+INTERVAL '5 days' AND expires_at <= NOW()+INTERVAL '6 days'
        AND (last_reminder_5d_for IS NULL OR last_reminder_5d_for<>expires_at) THEN '5d'
      WHEN expires_at > NOW() AND expires_at <= NOW()+INTERVAL '1 day'
        AND (last_reminder_1d_for IS NULL OR last_reminder_1d_for<>expires_at) THEN '1d'
      WHEN expires_at <= NOW() AND status='active' THEN 'expired'
      ELSE NULL END AS action
    FROM telegram_vip_subscriptions
    WHERE status='active' AND expires_at <= NOW()+INTERVAL '6 days'
  `);
  let reminders = 0, removed = 0, failures = 0;
  for (const row of due.rows) {
    const id = String(row.telegram_user_id);
    try {
      if (row.action === '5d' || row.action === '1d') {
        const amount = '250 MT (M-Pesa/e-Mola) ou 3 USDT (TRC20)';
        await tg('sendMessage', { chat_id: id, text: `⏳ MATOSFX VIP — RENOVAÇÃO\\n\\nA sua assinatura termina em ${row.action === '5d' ? '5 dias' : '1 dia'}.\\nValor mensal: ${amount}.\\n\\nUse /vip neste bot para receber os dados de pagamento e envie o comprovativo. O acesso só é renovado após confirmação manual.` });
        await pool.query(row.action === '5d'
          ? 'UPDATE telegram_vip_subscriptions SET last_reminder_5d_for=expires_at,updated_at=NOW() WHERE telegram_user_id=$1'
          : 'UPDATE telegram_vip_subscriptions SET last_reminder_1d_for=expires_at,updated_at=NOW() WHERE telegram_user_id=$1', [id]);
        reminders++;
      } else if (row.action === 'expired') {
        await tg('banChatMember', { chat_id: VIP_GROUP_ID(), user_id: Number(id), revoke_messages: false });
        await tg('unbanChatMember', { chat_id: VIP_GROUP_ID(), user_id: Number(id), only_if_banned: true }).catch(() => undefined);
        await pool.query(`UPDATE telegram_vip_subscriptions SET status='expired',removed_at=NOW(),updated_at=NOW() WHERE telegram_user_id=$1 AND status='active'`, [id]);
        await tg('sendMessage', { chat_id: id, text: '⛔ A sua assinatura MatosFx VIP expirou e o acesso ao grupo foi removido por falta de renovação. Para voltar, use /vip e conclua o pagamento mensal.' }).catch(() => undefined);
        removed++;
      }
    } catch (error) {
      failures++;
      console.error('[MatosFx VIP expiry]', id, error instanceof Error ? error.message : String(error));
    }
  }
  return { reminders, removed, failures };
}
