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

/**
 * Validate browser-originated POST requests against the public application
 * origin, not request.nextUrl.origin. Behind Render's reverse proxy the
 * latter can reflect an internal/proxied host and reject legitimate traffic.
 *
 * The public Render hostname is explicit. NEXT_PUBLIC_BASE_URL may add the
 * configured canonical hostname, but is never taken from the incoming Host
 * or X-Forwarded-Host headers.
 */
function allowedApplicationOrigins() {
  const origins = new Set<string>(['https://matos-1n.onrender.com']);
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.trim();

  if (configuredBaseUrl) {
    try {
      const configured = new URL(configuredBaseUrl);
      const isLocalDevelopment = process.env.NODE_ENV !== 'production'
        && (configured.hostname === 'localhost' || configured.hostname === '127.0.0.1');
      if (configured.protocol === 'https:' || isLocalDevelopment) {
        origins.add(configured.origin);
      }
    } catch {
      console.error('[Security] NEXT_PUBLIC_BASE_URL is not a valid URL; using the fixed production origin.');
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return origins;
}

export function sameOriginGuard(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site')?.trim().toLowerCase();
  if (fetchSite === 'cross-site') {
    return NextResponse.json(
      { error: 'Origem do pedido não permitida.', code: 'CROSS_SITE_REQUEST_BLOCKED' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const origin = request.headers.get('origin');
  if (!origin) return null;

  try {
    const parsedOrigin = new URL(origin);
    if (parsedOrigin.origin === 'null' || !allowedApplicationOrigins().has(parsedOrigin.origin)) {
      return NextResponse.json(
        { error: 'Origem do pedido não permitida.', code: 'ORIGIN_MISMATCH' },
        { status: 403, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  } catch {
    return NextResponse.json(
      { error: 'Origem do pedido inválida.', code: 'INVALID_ORIGIN' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return null;
}
