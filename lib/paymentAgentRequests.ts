import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export const DEPOSIT_RATE_MZN = 80;
export const WITHDRAW_RATE_MZN = 68;
export const EMOLA_NUMBER = '879084091';
export const MPESA_NUMBER = '849084091';
export const PAYMENT_RECIPIENT_NAME = 'Mistério João';
export const BINANCE_USDT_TRC20_ADDRESS = 'TYhiKauxruZ7Lux47nsgtq8R4j5jczRQeu';
export const BINANCE_USDT_TRC20_NETWORK = 'TRC20';

export type PaymentRequestType = 'deposit' | 'withdraw';
export type PaymentRequestStatus =
  | 'awaiting_payment'
  | 'client_marked_paid'
  | 'payment_confirmed'
  | 'rejected'
  | 'transfer_pending'
  | 'completed'
  | 'failed';

export type PaymentRequest = {
  id: string;
  type: PaymentRequestType;
  status: PaymentRequestStatus;
  user_id: string;
  client_name: string;
  client_email: string;
  client_nickname: string;
  amount_usd: number;
  local_amount_mzn: number;
  exchange_rate: number;
  payment_method: string | null;
  payment_number: string | null;
  payment_name: string | null;
  payer_name?: string | null;
  payer_number?: string | null;
  purpose?: string;
  crypto_asset?: string | null;
  crypto_network?: string | null;
  crypto_address?: string | null;
  crypto_tx_hash?: string | null;
  verification_ciphertext: string | null;
  refresh_ciphertext: string | null;
  transfer_request_id: string | null;
  transaction_id: string | null;
  platform_transfer_request_id: string | null;
  created_at: string;
  client_marked_paid_at: string | null;
  agent_confirmed_at: string | null;
  agent_rejected_at: string | null;
  transfer_approved_at: string | null;
  completed_at: string | null;
};

function encryptionKey() {
  const seed = process.env.DERIV_PAYMENT_AGENT_TOKEN?.trim();
  if (!seed) throw new Error('DERIV_PAYMENT_AGENT_TOKEN is not configured');
  return createHash('sha256').update(`matos-payment-agent-v1:${seed}`).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decrypt(value: string) {
  const [ivRaw, tagRaw, encryptedRaw] = value.split('.');
  if (!ivRaw || !tagRaw || !encryptedRaw) throw new Error('Invalid encrypted payment-agent secret');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), ivRaw ? Buffer.from(ivRaw, 'base64url') : Buffer.alloc(0));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, 'base64url')), decipher.final()]).toString('utf8');
}

export async function ensurePaymentRequestSchema() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS payment_agent_requests (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('deposit','withdraw')),
      status TEXT NOT NULL,
      user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      client_email TEXT NOT NULL,
      client_nickname TEXT NOT NULL,
      amount_usd NUMERIC(18,2) NOT NULL,
      local_amount_mzn NUMERIC(18,2) NOT NULL,
      exchange_rate NUMERIC(18,6) NOT NULL,
      payment_method TEXT,
      payment_number TEXT,
      payment_name TEXT,
      payer_name TEXT,
      payer_number TEXT,
      purpose TEXT NOT NULL DEFAULT 'deposit',
      verification_ciphertext TEXT,
      refresh_ciphertext TEXT,
      transfer_request_id TEXT,
      transaction_id TEXT,
      platform_transfer_request_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      client_marked_paid_at TIMESTAMPTZ,
      agent_confirmed_at TIMESTAMPTZ,
      agent_rejected_at TIMESTAMPTZ,
      transfer_approved_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS payment_agent_requests_user_idx ON payment_agent_requests(user_id);
    CREATE INDEX IF NOT EXISTS payment_agent_requests_status_idx ON payment_agent_requests(status);
    CREATE INDEX IF NOT EXISTS payment_agent_requests_created_idx ON payment_agent_requests(created_at DESC);
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS platform_transfer_request_id UUID;
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'deposit';
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS payer_name TEXT;
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS payer_number TEXT;
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS crypto_asset TEXT;
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS crypto_network TEXT;
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS crypto_address TEXT;
    ALTER TABLE payment_agent_requests ADD COLUMN IF NOT EXISTS crypto_tx_hash TEXT;
    CREATE TABLE IF NOT EXISTS ai_analyst_subscriptions (
      user_id BIGINT PRIMARY KEY REFERENCES platform_users(id) ON DELETE CASCADE,
      deriv_nickname TEXT,
      payment_request_id TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE ai_analyst_subscriptions ADD COLUMN IF NOT EXISTS deriv_nickname TEXT;
    UPDATE ai_analyst_subscriptions s
      SET deriv_nickname = NULLIF(TRIM(p.client_nickname), '')
      FROM payment_agent_requests p
      WHERE s.payment_request_id = p.id
        AND (s.deriv_nickname IS NULL OR TRIM(s.deriv_nickname) = '');
    CREATE UNIQUE INDEX IF NOT EXISTS ai_analyst_subscriptions_nickname_idx
      ON ai_analyst_subscriptions(LOWER(deriv_nickname))
      WHERE deriv_nickname IS NOT NULL;
    CREATE INDEX IF NOT EXISTS ai_analyst_subscriptions_expires_idx ON ai_analyst_subscriptions(expires_at);
    ALTER TABLE ai_analyst_subscriptions ADD COLUMN IF NOT EXISTS deriv_nickname TEXT;
    UPDATE ai_analyst_subscriptions s SET deriv_nickname=LOWER(TRIM(p.client_nickname)) FROM payment_agent_requests p WHERE s.payment_request_id=p.id AND (s.deriv_nickname IS NULL OR TRIM(s.deriv_nickname)='');
    CREATE UNIQUE INDEX IF NOT EXISTS ai_analyst_subscriptions_deriv_nickname_idx ON ai_analyst_subscriptions(LOWER(deriv_nickname)) WHERE deriv_nickname IS NOT NULL;
  `);
}

function requestId(prefix: string) {
  return `mh-${prefix}-${Date.now()}-${randomBytes(8).toString('hex')}`;
}

export async function createDepositRequest(input: {
  userId: string | number;
  clientName: string;
  clientEmail: string;
  clientNickname: string;
  amountUsd: number;
  paymentMethod: 'mpesa' | 'emola';
  refreshToken: string;
}) {
  await ensurePaymentRequestSchema();
  const id = requestId('d');
  const paymentNumber = input.paymentMethod === 'mpesa' ? MPESA_NUMBER : EMOLA_NUMBER;
  const result = await pool.query(
    `INSERT INTO payment_agent_requests
      (id,type,status,user_id,client_name,client_email,client_nickname,amount_usd,local_amount_mzn,exchange_rate,payment_method,payment_number,payment_name,refresh_ciphertext,purpose)
     VALUES ($1,'deposit','awaiting_payment',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'deposit')
     RETURNING *`,
    [id,input.userId,input.clientName,input.clientEmail,input.clientNickname,input.amountUsd,input.amountUsd*DEPOSIT_RATE_MZN,DEPOSIT_RATE_MZN,input.paymentMethod,paymentNumber,PAYMENT_RECIPIENT_NAME,encrypt(input.refreshToken)],
  );
  return result.rows[0] as PaymentRequest;
}

export async function createAIAnalystRequest(input: {
  userId: string | number;
  clientName: string;
  clientEmail: string;
  clientNickname: string;
  paymentMethod: 'mpesa' | 'emola';
  payerName: string;
  payerNumber: string;
}) {
  await ensurePaymentRequestSchema();
  const id = requestId('ai');
  const amountUsd = 3;
  const localAmountMzn = 250;
  const exchangeRate = localAmountMzn / amountUsd;
  const paymentNumber = input.paymentMethod === 'mpesa' ? MPESA_NUMBER : EMOLA_NUMBER;
  const payerName = input.payerName.trim();
  const payerNumber = input.payerNumber.replace(/\D/g, '');
  const result = await pool.query(
    `INSERT INTO payment_agent_requests
      (id,type,status,user_id,client_name,client_email,client_nickname,amount_usd,local_amount_mzn,exchange_rate,payment_method,payment_number,payment_name,payer_name,payer_number,purpose)
     VALUES ($1,'deposit','awaiting_payment',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ai_analyst')
     RETURNING *`,
    [id,input.userId,input.clientName,input.clientEmail,input.clientNickname,amountUsd,localAmountMzn,exchangeRate,input.paymentMethod,paymentNumber,PAYMENT_RECIPIENT_NAME,payerName,payerNumber],
  );
  return result.rows[0] as PaymentRequest;
}

export async function createAIAnalystBinanceRequest(input: {
  userId: string | number;
  clientName: string;
  clientEmail: string;
  clientNickname: string;
}) {
  await ensurePaymentRequestSchema();
  const id = requestId('aib');
  const amountUsd = 3;
  const localAmountMzn = 250;
  const result = await pool.query(
    `INSERT INTO payment_agent_requests
      (id,type,status,user_id,client_name,client_email,client_nickname,amount_usd,local_amount_mzn,exchange_rate,payment_method,payment_number,payment_name,purpose,crypto_asset,crypto_network,crypto_address)
     VALUES ($1,'deposit','awaiting_payment',$2,$3,$4,$5,$6,$7,$8,'binance_usdt_trc20',$9,$10,'ai_analyst','USDT','TRC20',$9)
     RETURNING *`,
    [id,input.userId,input.clientName,input.clientEmail,input.clientNickname,amountUsd,localAmountMzn,localAmountMzn/amountUsd,BINANCE_USDT_TRC20_ADDRESS,'Binance USDT TRC20'],
  );
  return result.rows[0] as PaymentRequest;
}

export async function getAIAnalystAccess(userId: string | number, derivNickname?: string | null) {
  await ensurePaymentRequestSchema();
  const nickname=derivNickname?.trim()||'';
  if(nickname){
    const byNickname=await pool.query(
      'SELECT expires_at, deriv_nickname FROM ai_analyst_subscriptions WHERE LOWER(deriv_nickname)=LOWER($1) LIMIT 1',
      [nickname],
    );
    const row=byNickname.rows[0];
    if(row)return {active:new Date(row.expires_at).getTime()>Date.now(),expiresAt:row.expires_at,derivNickname:row.deriv_nickname||null};
    const legacy=await pool.query(
      `SELECT expires_at FROM ai_analyst_subscriptions
       WHERE user_id=$1 AND expires_at>NOW()
       AND (deriv_nickname IS NULL OR LOWER(deriv_nickname)=LOWER('AI Analyst service'))
       LIMIT 1`,
      [userId],
    );
    const legacyRow=legacy.rows[0];
    if(legacyRow){
      const updated=await pool.query(
        'UPDATE ai_analyst_subscriptions SET deriv_nickname=$2 WHERE user_id=$1 RETURNING expires_at, deriv_nickname',
        [userId,nickname],
      );
      const migrated=updated.rows[0];
      return {active:true,expiresAt:migrated.expires_at,derivNickname:migrated.deriv_nickname};
    }
    return {active:false,expiresAt:null,derivNickname:nickname};
  }
  const result=await pool.query('SELECT expires_at, deriv_nickname FROM ai_analyst_subscriptions WHERE user_id=$1',[userId]);
  const row=result.rows[0];
  return row?{active:new Date(row.expires_at).getTime()>Date.now(),expiresAt:row.expires_at,derivNickname:row.deriv_nickname||null}:{active:false,expiresAt:null,derivNickname:null};
}
export async function activateAIAnalystSubscription(userId: string | number, paymentRequestId: string) {
  await ensurePaymentRequestSchema();
  const payment = await pool.query(
    'SELECT id, purpose, client_nickname FROM payment_agent_requests WHERE id=$1 AND user_id=$2 LIMIT 1',
    [paymentRequestId, userId],
  );
  const request = payment.rows[0];
  if (!request || String(request.purpose || '') !== 'ai_analyst') {
    throw new Error('Pedido AI Analyst inválido.');
  }

  const derivNickname = String(request.client_nickname || '').trim();
  if (!derivNickname) throw new Error('O pedido AI Analyst não possui nickname Deriv.');

  const result = await pool.query(
    `INSERT INTO ai_analyst_subscriptions (user_id,deriv_nickname,payment_request_id,expires_at)
     VALUES ($1,$2,$3,NOW()+INTERVAL '30 days')
     ON CONFLICT (user_id) DO UPDATE SET
       deriv_nickname=EXCLUDED.deriv_nickname,
       payment_request_id=EXCLUDED.payment_request_id,
       expires_at=CASE WHEN ai_analyst_subscriptions.expires_at>NOW() THEN ai_analyst_subscriptions.expires_at+INTERVAL '30 days' ELSE EXCLUDED.expires_at END
     RETURNING *`,
    [userId,derivNickname,paymentRequestId],
  );
  return result.rows[0];
}

export async function markDepositPaid(userId: string | number, id: string) {
  await ensurePaymentRequestSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT * FROM payment_agent_requests WHERE id=$1 AND user_id=$2 FOR UPDATE`,
      [id,userId],
    );
    const row = result.rows[0] as PaymentRequest | undefined;
    if (!row) throw Object.assign(new Error('Pedido não encontrado'), { status: 404 });
    if (row.type !== 'deposit' || row.status !== 'awaiting_payment') throw Object.assign(new Error('Este pedido não pode ser marcado como pago.'), { status: 409 });
    const updated = await client.query(
      `UPDATE payment_agent_requests SET status='client_marked_paid', client_marked_paid_at=NOW() WHERE id=$1 RETURNING *`,
      [id],
    );
    await client.query('COMMIT');
    return updated.rows[0] as PaymentRequest;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createWithdrawRequest(input: {
  userId: string | number;
  clientName: string;
  clientEmail: string;
  clientNickname: string;
  amountUsd: number;
  paymentMethod: 'mpesa' | 'emola';
  paymentNumber: string;
  paymentName: string;
  verificationCode: string;
  requestId?: string;
  status?: 'rejected' | 'transfer_pending' | 'completed' | 'failed';
  transactionId?: string | null;
}) {
  await ensurePaymentRequestSchema();
  const id = input.requestId?.trim() || requestId('w');
  const paymentMethod = input.paymentMethod;
  const status = input.status || 'transfer_pending';
  const result = await pool.query(
    `INSERT INTO payment_agent_requests
      (id,type,status,user_id,client_name,client_email,client_nickname,amount_usd,local_amount_mzn,exchange_rate,payment_method,payment_number,payment_name,verification_ciphertext,refresh_ciphertext,transfer_request_id,transaction_id)
     VALUES ($1,'withdraw',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$1,$14)
     RETURNING *`,
    [id,status,input.userId,input.clientName,input.clientEmail,input.clientNickname,input.amountUsd,input.amountUsd*WITHDRAW_RATE_MZN,WITHDRAW_RATE_MZN,paymentMethod,input.paymentNumber.trim(),input.paymentName.trim(),encrypt(input.verificationCode),input.transactionId || null],
  );
  return result.rows[0] as PaymentRequest;
}

export async function getPaymentRequest(id: string) {
  await ensurePaymentRequestSchema();
  const result = await pool.query('SELECT * FROM payment_agent_requests WHERE id=$1', [id]);
  return (result.rows[0] || null) as PaymentRequest | null;
}

export async function transitionPaymentRequest(id: string, expected: PaymentRequestStatus | PaymentRequestStatus[], next: PaymentRequestStatus) {
  await ensurePaymentRequestSchema();
  const expectedList = Array.isArray(expected) ? expected : [expected];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM payment_agent_requests WHERE id=$1 FOR UPDATE', [id]);
    const row = result.rows[0] as PaymentRequest | undefined;
    if (!row) throw Object.assign(new Error('Pedido não encontrado'), { status: 404 });
    if (!expectedList.includes(row.status)) throw Object.assign(new Error(`Pedido já está em estado ${row.status}.`), { status: 409 });
    const updated = await client.query(
      `UPDATE payment_agent_requests SET status=$2, agent_confirmed_at=CASE WHEN $2='payment_confirmed' THEN NOW() ELSE agent_confirmed_at END, agent_rejected_at=CASE WHEN $2='rejected' THEN NOW() ELSE agent_rejected_at END WHERE id=$1 RETURNING *`,
      [id,next],
    );
    await client.query('COMMIT');
    return updated.rows[0] as PaymentRequest;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function claimTransfer(id: string) {
  await ensurePaymentRequestSchema();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT * FROM payment_agent_requests WHERE id=$1 FOR UPDATE', [id]);
    const row = result.rows[0] as PaymentRequest | undefined;
    if (!row) throw Object.assign(new Error('Pedido não encontrado'), { status: 404 });
    if (row.status !== 'payment_confirmed') throw Object.assign(new Error('O pagamento ainda não foi confirmado pelo agente.'), { status: 409 });
    const transferId = row.transfer_request_id || requestId(row.type === 'deposit' ? 'd' : 'w');
    const updated = await client.query(
      `UPDATE payment_agent_requests SET status='transfer_pending', transfer_request_id=$2, transfer_approved_at=NOW() WHERE id=$1 RETURNING *`,
      [id,transferId],
    );
    await client.query('COMMIT');
    return { ...(updated.rows[0] as PaymentRequest), transfer_request_id: transferId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function completeTransfer(id: string, transactionId: string | null, status: 'completed' | 'failed' | 'transfer_pending' | 'rejected') {
  await ensurePaymentRequestSchema();
  const result = await pool.query(
    `UPDATE payment_agent_requests SET status=$2, transaction_id=$3, completed_at=CASE WHEN $2='completed' THEN NOW() ELSE completed_at END WHERE id=$1 RETURNING *`,
    [id,status,transactionId],
  );
  return result.rows[0] as PaymentRequest | undefined;
}

export function revealVerificationCode(row: PaymentRequest) {
  return row.verification_ciphertext ? decrypt(row.verification_ciphertext) : '';
}

export function revealRefreshToken(row: PaymentRequest) {
  return row.refresh_ciphertext ? decrypt(row.refresh_ciphertext) : '';
}

export async function updateRefreshToken(id: string, refreshToken: string) {
  await ensurePaymentRequestSchema();
  const result = await pool.query(
    'UPDATE payment_agent_requests SET refresh_ciphertext=$2 WHERE id=$1 RETURNING *',
    [id, encrypt(refreshToken)],
  );
  return result.rows[0] as PaymentRequest | undefined;
}

export async function markPlatformTransferCompleted(id: string) {
  await ensurePaymentRequestSchema();
  const result = await pool.query(
    "UPDATE payment_agent_requests SET status='completed', completed_at=NOW() WHERE id=$1 RETURNING *",
    [id],
  );
  return result.rows[0] as PaymentRequest | undefined;
}

export async function setPlatformTransferRequestId(id: string, requestId: string) {
  await ensurePaymentRequestSchema();
  const result = await pool.query(
    'UPDATE payment_agent_requests SET platform_transfer_request_id=$2 WHERE id=$1 RETURNING *',
    [id, requestId],
  );
  return result.rows[0] as PaymentRequest | undefined;
}
