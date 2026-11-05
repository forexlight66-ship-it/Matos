import 'server-only';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import { NextRequest, NextResponse } from 'next/server';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});
let schemaReady: Promise<void> | null = null;

async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = pool.query(`
      CREATE TABLE IF NOT EXISTS api_rate_limits (
        key_hash TEXT PRIMARY KEY,
        attempts INTEGER NOT NULL,
        window_ends_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS api_rate_limits_window_idx ON api_rate_limits(window_ends_at);
    `).then(() => undefined).catch(error => { schemaReady = null; throw error; });
  }
  await schemaReady;
}

function requestIp(request: NextRequest) {
  const raw = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-real-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]
    || 'unknown';
  return raw.trim().slice(0, 80) || 'unknown';
}

export async function rateLimit(request: NextRequest, scope: string, maxAttempts: number, windowSeconds: number, subject = '') {
  try {
    await ensureSchema();
    const rawKey = [scope, requestIp(request), subject].join(':').toLowerCase();
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const result = await pool.query(
      `INSERT INTO api_rate_limits (key_hash, attempts, window_ends_at)
       VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 second'))
       ON CONFLICT (key_hash) DO UPDATE SET
         attempts = CASE WHEN api_rate_limits.window_ends_at <= NOW() THEN 1 ELSE api_rate_limits.attempts + 1 END,
         window_ends_at = CASE WHEN api_rate_limits.window_ends_at <= NOW()
           THEN NOW() + ($2 * INTERVAL '1 second') ELSE api_rate_limits.window_ends_at END,
         updated_at = NOW()
       RETURNING attempts, window_ends_at`,
      [keyHash, Math.max(1, Math.floor(windowSeconds))],
    );
    const row = result.rows[0];
    if (Number(row?.attempts || 0) > maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((new Date(row.window_ends_at).getTime() - Date.now()) / 1000));
      return NextResponse.json(
        { error: 'Demasiadas tentativas. Aguarde antes de tentar novamente.', code: 'RATE_LIMITED' },
        { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
      );
    }
    if (Math.random() < 0.01) {
      void pool.query("DELETE FROM api_rate_limits WHERE window_ends_at < NOW() - INTERVAL '2 days'").catch(() => undefined);
    }
    return null;
  } catch (error) {
    console.error('[Security] Rate-limit storage unavailable:', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      { error: 'Proteção temporariamente indisponível. Tente novamente.', code: 'SECURITY_CHECK_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export function sameOriginGuard(request: NextRequest) {
  if (request.headers.get('sec-fetch-site')?.toLowerCase() === 'cross-site') {
    return NextResponse.json({ error: 'Origem do pedido não permitida.', code: 'CROSS_SITE_REQUEST_BLOCKED' }, { status: 403 });
  }
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== request.nextUrl.origin) {
        return NextResponse.json({ error: 'Origem do pedido não permitida.', code: 'ORIGIN_MISMATCH' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: 'Origem do pedido inválida.', code: 'INVALID_ORIGIN' }, { status: 403 });
    }
  }
  return null;
}
