import { createHash, randomBytes } from 'crypto';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

export type CoursePayment = {
  id: number;
  telegram_user_id: string;
  chat_id: string;
  username: string | null;
  first_name: string | null;
  status: string;
};

async function ensureCourseSchema() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS telegram_course_payments (
      id BIGSERIAL PRIMARY KEY,
      telegram_user_id BIGINT NOT NULL,
      chat_id BIGINT NOT NULL,
      username TEXT,
      first_name TEXT,
      status TEXT NOT NULL DEFAULT 'awaiting_proof',
      proof_file_id TEXT,
      proof_received_at TIMESTAMPTZ,
      access_code_hash TEXT,
      access_code_last4 TEXT,
      approved_at TIMESTAMPTZ,
      rejected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS telegram_course_payments_chat_idx ON telegram_course_payments(chat_id);
    CREATE INDEX IF NOT EXISTS telegram_course_payments_status_idx ON telegram_course_payments(status);
  `);
}

export async function createPaymentRequest(input: {
  telegramUserId: number;
  chatId: number;
  username?: string;
  firstName?: string;
}) {
  await ensureCourseSchema();
  const result = await pool.query(
    `INSERT INTO telegram_course_payments
      (telegram_user_id, chat_id, username, first_name, status)
     VALUES ($1, $2, $3, $4, 'awaiting_proof')
     RETURNING id, telegram_user_id, chat_id, username, first_name, status`,
    [input.telegramUserId, input.chatId, input.username || null, input.firstName || null],
  );
  return result.rows[0] as CoursePayment;
}

export async function saveProof(paymentId: number, fileId: string) {
  await ensureCourseSchema();
  const result = await pool.query(
    `UPDATE telegram_course_payments
       SET proof_file_id=$1, proof_received_at=NOW(), status='pending'
     WHERE id=$2 AND status='awaiting_proof'
     RETURNING id, telegram_user_id, chat_id, username, first_name, status`,
    [fileId, paymentId],
  );
  return result.rows[0] as CoursePayment | undefined;
}

export async function getLatestAwaitingProof(chatId: number) {
  await ensureCourseSchema();
  const result = await pool.query(
    `SELECT id, telegram_user_id, chat_id, username, first_name, status
       FROM telegram_course_payments
      WHERE chat_id=$1 AND status='awaiting_proof'
      ORDER BY id DESC LIMIT 1`,
    [chatId],
  );
  return result.rows[0] as CoursePayment | undefined;
}

export async function approvePayment(paymentId: number) {
  await ensureCourseSchema();
  const code = `IZI-${randomBytes(4).toString('hex').toUpperCase()}`;
  const hash = createHash('sha256').update(code).digest('hex');
  const result = await pool.query(
    `UPDATE telegram_course_payments
       SET status='approved', access_code_hash=$1, access_code_last4=$2, approved_at=NOW()
     WHERE id=$3 AND status='pending'
     RETURNING id, telegram_user_id, chat_id, username, first_name, status`,
    [hash, code.slice(-4), paymentId],
  );
  return result.rows[0] ? { payment: result.rows[0] as CoursePayment, code } : undefined;
}

export async function rejectPayment(paymentId: number) {
  await ensureCourseSchema();
  const result = await pool.query(
    `UPDATE telegram_course_payments
       SET status='rejected', rejected_at=NOW()
     WHERE id=$1 AND status='pending'
     RETURNING id, telegram_user_id, chat_id, username, first_name, status`,
    [paymentId],
  );
  return result.rows[0] as CoursePayment | undefined;
}

export async function verifyCourseCode(code: string) {
  await ensureCourseSchema();
  const normalized = code.trim().toUpperCase();
  const hash = createHash('sha256').update(normalized).digest('hex');
  const result = await pool.query(
    `SELECT id, telegram_user_id, chat_id, username, first_name, status
       FROM telegram_course_payments
      WHERE status='approved' AND access_code_hash=$1
      ORDER BY approved_at DESC LIMIT 1`,
    [hash],
  );
  return result.rows[0] as CoursePayment | undefined;
}
