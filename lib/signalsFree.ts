import { createHash } from 'crypto';
import { Pool } from 'pg';
import { sendAgentAlert } from '@/lib/telegram';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

export const SIGNALS_FREE_GROUP_URL = 'https://t.me/+S4A_5SgZB6x4P_UQ';

export async function ensureSignalsFreeSchema() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não está configurado.');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signals_free_requests (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      mt5_id VARCHAR(32) NOT NULL,
      deriv_client_id VARCHAR(64),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT
    );
    ALTER TABLE signals_free_requests ADD COLUMN IF NOT EXISTS deriv_client_id VARCHAR(64);
    DO $mig$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'signals_free_requests'
          AND column_name = 'deriv_client_id'
          AND character_maximum_length IS NOT NULL
          AND character_maximum_length < 64
      ) THEN
        ALTER TABLE signals_free_requests ALTER COLUMN deriv_client_id TYPE VARCHAR(64);
      END IF;
    END;
    $mig$;
    CREATE INDEX IF NOT EXISTS signals_free_user_created_idx ON signals_free_requests(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS signals_free_status_idx ON signals_free_requests(status);
  `);
}

export async function createSignalsFreeRequest(
  user: { id: string | number; name: string; email: string },
  mt5Id: string,
  externalReferenceId: string,
) {
  await ensureSignalsFreeSchema();
  const existing = await pool.query(
    "SELECT id, mt5_id, deriv_client_id, status, created_at FROM signals_free_requests WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1",
    [user.id],
  );
  if (existing.rows[0]) return { ...existing.rows[0], alreadyPending: true };

  const result = await pool.query(
    'INSERT INTO signals_free_requests (user_id, mt5_id, deriv_client_id) VALUES ($1,$2,$3) RETURNING id, mt5_id, deriv_client_id, status, created_at',
    [user.id, mt5Id, externalReferenceId],
  );
  const row = result.rows[0];
  const esc = (value: string) => value.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c] || c));
  try {
    await sendAgentAlert(
      [
        '🟢 <b>NOVO PEDIDO — SIGNALS FREE</b>',
        '',
        `Pedido: <b>#${row.id}</b>`,
        `Nome: <b>${esc(user.name || 'Utilizador')}</b>`,
        `Email: <b>${esc(user.email || '—')}</b>`,
        `ID de identidade Deriv (verificado): <code>${esc(externalReferenceId)}</code>`,
        `ID MT5: <code>${esc(mt5Id)}</code>`,
        '',
        'Aprove ou rejeite este pedido:',
      ].join('\n'),
      [[
        { text: '✅ APROVAR', callback_data: `sf:approve:${row.id}` },
        { text: '❌ REJEITAR', callback_data: `sf:reject:${row.id}` },
      ]],
    );
  } catch (error) {
    await pool.query('DELETE FROM signals_free_requests WHERE id=$1 AND status=\'pending\'', [row.id]);
    throw new Error(error instanceof Error ? `Não foi possível notificar o Payment Agent 503 no Telegram: ${error.message}` : 'Não foi possível notificar o Telegram.');
  }
  return row;
}

export async function getSignalsFreeRequest(userId: string | number) {
  await ensureSignalsFreeSchema();
  const result = await pool.query(
    'SELECT id, mt5_id, deriv_client_id, status, created_at, reviewed_at FROM signals_free_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1',
    [userId],
  );
  return result.rows[0] || null;
}

export async function reviewSignalsFreeRequest(id: string, status: 'approved' | 'rejected', reviewer: string) {
  await ensureSignalsFreeSchema();
  const result = await pool.query(
    "UPDATE signals_free_requests SET status=$2, reviewed_at=NOW(), reviewed_by=$3 WHERE id=$1 AND status='pending' RETURNING id, user_id, mt5_id, deriv_client_id, status",
    [id, status, reviewer],
  );
  return result.rows[0] || null;
}


export type SignalsFreeOnboardingStatus =
  | 'verification_required'
  | 'ready_for_payment'
  | 'payment_pending'
  | 'active';

export type SignalsFreeOnboarding = {
  user_id: string;
  deriv_external_reference_id: string;
  deriv_nickname: string;
  mt5_id: string;
  status: SignalsFreeOnboardingStatus;
  amy_screenshot: Buffer | null;
  amy_screenshot_mime: string | null;
  amy_screenshot_filename: string | null;
  amy_screenshot_sha256: string | null;
  amy_message_sent_at: string | null;
  payment_request_id: string | null;
  activated_at: string | null;
};

export async function ensureSignalsFreeOnboardingSchema() {
  await ensureSignalsFreeSchema();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signals_free_onboarding (
      deriv_external_reference_id UUID PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      deriv_nickname TEXT NOT NULL DEFAULT '',
      mt5_id VARCHAR(32) NOT NULL,
      status TEXT NOT NULL DEFAULT 'verification_required'
        CHECK (status IN ('verification_required','ready_for_payment','payment_pending','active')),
      amy_screenshot BYTEA,
      amy_screenshot_mime TEXT,
      amy_screenshot_filename TEXT,
      amy_screenshot_sha256 TEXT,
      amy_message_sent_at TIMESTAMPTZ,
      payment_request_id TEXT,
      activated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS signals_free_onboarding_user_idx
      ON signals_free_onboarding(user_id);
    CREATE INDEX IF NOT EXISTS signals_free_onboarding_status_idx
      ON signals_free_onboarding(status);
    CREATE UNIQUE INDEX IF NOT EXISTS signals_free_onboarding_payment_request_idx
      ON signals_free_onboarding(payment_request_id)
      WHERE payment_request_id IS NOT NULL;
  `);
}

export async function getSignalsFreeOnboarding(
  externalReferenceId: string,
): Promise<SignalsFreeOnboarding | null> {
  await ensureSignalsFreeOnboardingSchema();
  const result = await pool.query(
    `SELECT user_id, deriv_external_reference_id, deriv_nickname, mt5_id,
            status, amy_screenshot, amy_screenshot_mime, amy_screenshot_filename,
            amy_screenshot_sha256, amy_message_sent_at, payment_request_id, activated_at
     FROM signals_free_onboarding
     WHERE deriv_external_reference_id = $1
     LIMIT 1`,
    [externalReferenceId],
  );
  return (result.rows[0] || null) as SignalsFreeOnboarding | null;
}

export async function upsertSignalsFreeOnboarding(input: {
  userId: string | number;
  externalReferenceId: string;
  derivNickname: string;
  mt5Id: string;
  status: SignalsFreeOnboardingStatus;
}) {
  await ensureSignalsFreeOnboardingSchema();
  const result = await pool.query(
    `INSERT INTO signals_free_onboarding
       (deriv_external_reference_id, user_id, deriv_nickname, mt5_id, status)
     VALUES ($1::uuid, $2, $3, $4, $5)
     ON CONFLICT (deriv_external_reference_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       deriv_nickname = EXCLUDED.deriv_nickname,
       mt5_id = EXCLUDED.mt5_id,
       status = CASE
         WHEN signals_free_onboarding.status IN ('payment_pending','active')
           THEN signals_free_onboarding.status
         WHEN signals_free_onboarding.status = 'ready_for_payment'
              AND signals_free_onboarding.amy_screenshot IS NOT NULL
           THEN 'ready_for_payment'
         ELSE EXCLUDED.status
       END,
       payment_request_id = CASE
         WHEN signals_free_onboarding.status IN ('payment_pending','active')
           THEN signals_free_onboarding.payment_request_id
         ELSE NULL
       END,
       updated_at = NOW()
     RETURNING user_id, deriv_external_reference_id, deriv_nickname, mt5_id,
               status, (amy_screenshot IS NOT NULL) AS amy_proof_uploaded,
               amy_message_sent_at, payment_request_id, activated_at`,
    [input.externalReferenceId, input.userId, input.derivNickname, input.mt5Id, input.status],
  );
  return result.rows[0];
}

export async function saveSignalsFreeAmyProof(input: {
  externalReferenceId: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  filename: string;
  bytes: Buffer;
}) {
  await ensureSignalsFreeOnboardingSchema();
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const result = await pool.query(
    `UPDATE signals_free_onboarding
     SET amy_screenshot = COALESCE(amy_screenshot, $2::bytea),
         amy_screenshot_mime = COALESCE(amy_screenshot_mime, $3),
         amy_screenshot_filename = COALESCE(amy_screenshot_filename, $4),
         amy_screenshot_sha256 = COALESCE(amy_screenshot_sha256, $5),
         amy_message_sent_at = COALESCE(amy_message_sent_at, NOW()),
         status = CASE WHEN status = 'verification_required'
                       THEN 'ready_for_payment' ELSE status END,
         updated_at = NOW()
     WHERE deriv_external_reference_id = $1::uuid
     RETURNING status, mt5_id, (amy_screenshot IS NOT NULL) AS amy_proof_uploaded,
               amy_message_sent_at, amy_screenshot_mime`,
    [input.externalReferenceId, input.bytes, input.mimeType, input.filename.slice(0, 180), sha256],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error('Submeta primeiro o seu ID MT5 para iniciar a verificação.'), { status: 409, code: 'SIGNALS_FREE_ONBOARDING_NOT_FOUND' });
  }
  return result.rows[0] as {
    status: SignalsFreeOnboardingStatus;
    mt5_id: string;
    amy_proof_uploaded: boolean;
    amy_message_sent_at: string | null;
    amy_screenshot_mime: string | null;
  };
}

export async function getSignalsFreeAmyProof(externalReferenceId: string) {
  await ensureSignalsFreeOnboardingSchema();
  const result = await pool.query(
    `SELECT amy_screenshot, amy_screenshot_mime, amy_screenshot_filename
     FROM signals_free_onboarding
     WHERE deriv_external_reference_id = $1::uuid
       AND amy_screenshot IS NOT NULL
     LIMIT 1`,
    [externalReferenceId],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    bytes: Buffer.from(row.amy_screenshot),
    mimeType: String(row.amy_screenshot_mime || 'image/jpeg'),
    filename: String(row.amy_screenshot_filename || 'ask-amy-proof.jpg'),
  };
}

export async function linkSignalsFreePaymentRequest(
  externalReferenceId: string,
  paymentRequestId: string,
) {
  await ensureSignalsFreeOnboardingSchema();
  const result = await pool.query(
    `UPDATE signals_free_onboarding
     SET status = 'payment_pending', payment_request_id = $2, updated_at = NOW()
     WHERE deriv_external_reference_id = $1::uuid
       AND status IN ('ready_for_payment','payment_pending')
       AND (payment_request_id IS NULL OR payment_request_id = $2)
     RETURNING user_id, status, payment_request_id`,
    [externalReferenceId, paymentRequestId],
  );
  if (!result.rows[0]) {
    throw Object.assign(new Error('A verificação Signals Free ainda não está concluída ou já existe um pedido de pagamento.'), { status: 409, code: 'SIGNALS_FREE_PAYMENT_NOT_READY' });
  }
  return result.rows[0];
}

export async function activateSignalsFreeUnlimited(
  userId: string | number,
  paymentRequestId: string,
) {
  await ensureSignalsFreeOnboardingSchema();
  const result = await pool.query(
    `UPDATE signals_free_onboarding
     SET status = 'active', activated_at = COALESCE(activated_at, NOW()), updated_at = NOW()
     WHERE payment_request_id = $1
       AND user_id = $2
       AND status IN ('payment_pending','active')
     RETURNING deriv_external_reference_id, mt5_id, deriv_nickname, activated_at`,
    [paymentRequestId, userId],
  );
  if (result.rows[0]) return result.rows[0];

  const existing = await pool.query(
    `SELECT deriv_external_reference_id, mt5_id, deriv_nickname, activated_at
     FROM signals_free_onboarding
     WHERE payment_request_id = $1 AND user_id = $2 AND status = 'active'
     LIMIT 1`,
    [paymentRequestId, userId],
  );
  if (existing.rows[0]) return existing.rows[0];
  throw new Error('O pedido de pagamento não está associado a uma verificação Signals Free válida.');
}

export async function resetSignalsFreePaymentRequest(
  userId: string | number,
  paymentRequestId: string,
) {
  await ensureSignalsFreeOnboardingSchema();
  await pool.query(
    `UPDATE signals_free_onboarding
     SET status = 'ready_for_payment', payment_request_id = NULL, updated_at = NOW()
     WHERE user_id = $1
       AND payment_request_id = $2
       AND status = 'payment_pending'`,
    [userId, paymentRequestId],
  );
}
