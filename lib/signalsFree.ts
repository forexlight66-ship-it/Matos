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
    END
    $mig$;
    CREATE INDEX IF NOT EXISTS signals_free_user_created_idx ON signals_free_requests(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS signals_free_status_idx ON signals_free_requests(status);
  `);
}

export async function createSignalsFreeRequest(
  user: { id: string | number; name: string; email: string },
  mt5Id: string,
  clientId: string,
) {
  await ensureSignalsFreeSchema();
  const existing = await pool.query(
    "SELECT id, mt5_id, deriv_client_id, status, created_at FROM signals_free_requests WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1",
    [user.id],
  );
  if (existing.rows[0]) return { ...existing.rows[0], alreadyPending: true };

  const result = await pool.query(
    'INSERT INTO signals_free_requests (user_id, mt5_id, deriv_client_id) VALUES ($1,$2,$3) RETURNING id, mt5_id, deriv_client_id, status, created_at',
    [user.id, mt5Id, clientId],
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
        `ID de cliente Deriv (verificado): <code>${esc(clientId)}</code>`,
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
