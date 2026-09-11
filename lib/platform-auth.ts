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
  `);
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
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
