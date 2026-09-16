// lib/platform-auth.ts
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { Pool } from 'pg';

const scrypt = promisify(scryptCallback);
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined });

export const PLATFORM_SESSION_COOKIE = 'matos_session';

async function ensureSchema() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS platform_users (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS platform_sessions (
      id TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );
    CREATE INDEX IF NOT EXISTS platform_sessions_user_id_idx ON platform_sessions(user_id);
    CREATE TABLE IF NOT EXISTS platform_password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS platform_password_resets_user_id_idx ON platform_password_resets(user_id);
    CREATE INDEX IF NOT EXISTS platform_password_resets_expires_at_idx ON platform_password_resets(expires_at);
  `);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function hashResetToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(hash, 'hex');
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export async function createUser(name: string, email: string, password: string) {
  await ensureSchema();
  const result = await pool.query(
    'INSERT INTO platform_users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
    [name.trim(), normalizeEmail(email), await hashPassword(password)]
  );
  return result.rows[0];
}

export async function authenticateUser(email: string, password: string) {
  await ensureSchema();
  const result = await pool.query('SELECT id, name, email, password_hash FROM platform_users WHERE email = $1', [normalizeEmail(email)]);
  const user = result.rows[0];
  if (!user || !(await verifyPassword(password, user.password_hash))) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export async function createPasswordResetToken(email: string) {
  await ensureSchema();
  const normalized = normalizeEmail(email);
  const result = await pool.query('SELECT id, name, email FROM platform_users WHERE email = $1', [normalized]);
  const user = result.rows[0];
  if (!user) return null;

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashResetToken(token);
  await pool.query('DELETE FROM platform_password_resets WHERE user_id = $1 AND used_at IS NULL', [user.id]);
  await pool.query(
    "INSERT INTO platform_password_resets (token_hash, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 minutes')",
    [tokenHash, user.id]
  );
  return { token, user };
}

export async function resetPasswordWithToken(token: string, password: string) {
  await ensureSchema();
  const tokenHash = hashResetToken(token.trim());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT user_id FROM platform_password_resets WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [tokenHash]
    );
    const reset = result.rows[0];
    if (!reset) {
      await client.query('ROLLBACK');
      return false;
    }

    const passwordHash = await hashPassword(password);
    await client.query('UPDATE platform_users SET password_hash = $1 WHERE id = $2', [passwordHash, reset.user_id]);
    await client.query('UPDATE platform_password_resets SET used_at = NOW() WHERE token_hash = $1', [tokenHash]);
    await client.query('DELETE FROM platform_sessions WHERE user_id = $1', [reset.user_id]);
    await client.query('COMMIT');
    return true;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function createSession(userId: string | number) {
  await ensureSchema();
  const id = randomBytes(32).toString('base64url');
  await pool.query("INSERT INTO platform_sessions (id, user_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')", [id, userId]);
  return id;
}

export async function getSession(sessionId?: string | null) {
  if (!sessionId) return null;
  await ensureSchema();
  const result = await pool.query(
    `SELECT u.id, u.name, u.email FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id WHERE s.id = $1 AND s.expires_at > NOW()`,
    [sessionId]
  );
  return result.rows[0] || null;
}

export async function deleteSession(sessionId?: string | null) {
  if (!sessionId) return;
  await ensureSchema();
  await pool.query('DELETE FROM platform_sessions WHERE id = $1', [sessionId]);
}

export function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Unknown authentication error';
}
