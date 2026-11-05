import 'server-only';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error('DATABASE_URL is required by the trading worker.');

export const tradingPool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 8,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export type RuntimeStatus = 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'safety_stopped';
export type AccountType = 'demo' | 'real';

export interface RuntimeConfig {
  strategy: string;
  symbol: string;
  accountType: AccountType;
  stake: number;
  currency?: string;
  target: number;
  lossLimit: number;
  recoveryExtraProfit: number;
  maxMartingale: number;
  iaPower: boolean;
  sonic: boolean;
  smartAnalyzer: boolean;
  exitSpotsAutoEnabled: boolean;
  tickWindow: number;
  durationTicks: number;
}

export interface RuntimeRow {
  id: string;
  user_id: string;
  account_id: string;
  account_type: AccountType;
  account_currency: string;
  config: RuntimeConfig;
  state: Record<string, any>;
  status: RuntimeStatus;
  lease_owner: string | null;
  lease_until: string | null;
  stop_requested_at: string | null;
}

let schemaPromise: Promise<void> | null = null;
export async function ensureTradingSchema() {
  if (!schemaPromise) {
    schemaPromise = tradingPool.query(`
      CREATE TABLE IF NOT EXISTS bot_runtime_sessions (
        id UUID PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL,
        account_type TEXT NOT NULL CHECK (account_type IN ('demo','real')),
        account_currency TEXT NOT NULL DEFAULT 'USD',
        config JSONB NOT NULL,
        state JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL CHECK (status IN ('starting','running','stopping','stopped','error','safety_stopped')),
        lease_owner TEXT,
        lease_until TIMESTAMPTZ,
        stop_requested_at TIMESTAMPTZ,
        last_heartbeat_at TIMESTAMPTZ,
        error_code TEXT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        stopped_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS bot_runtime_owner_created_idx ON bot_runtime_sessions(user_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS bot_runtime_worker_idx ON bot_runtime_sessions(status, lease_until);
      CREATE UNIQUE INDEX IF NOT EXISTS bot_runtime_one_active_per_account_idx
        ON bot_runtime_sessions(user_id, account_type)
        WHERE status IN ('starting','running','stopping');

      CREATE TABLE IF NOT EXISTS bot_runtime_events (
        id BIGSERIAL PRIMARY KEY,
        runtime_id UUID NOT NULL REFERENCES bot_runtime_sessions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS bot_runtime_events_runtime_idx ON bot_runtime_events(runtime_id, id DESC);

      CREATE TABLE IF NOT EXISTS bot_order_intents (
        id UUID PRIMARY KEY,
        runtime_id UUID NOT NULL REFERENCES bot_runtime_sessions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
        tick_epoch BIGINT NOT NULL,
        symbol TEXT NOT NULL,
        contract_type TEXT NOT NULL,
        barrier NUMERIC,
        stake NUMERIC NOT NULL,
        currency TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('created','quoted','sent','confirmed','reconciled','rejected','unknown')),
        proposal_id TEXT,
        max_price NUMERIC,
        contract_id BIGINT,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(runtime_id, tick_epoch)
      );
      CREATE INDEX IF NOT EXISTS bot_order_intents_contract_idx ON bot_order_intents(contract_id);

      CREATE TABLE IF NOT EXISTS bot_runtime_trades (
        id BIGSERIAL PRIMARY KEY,
        runtime_id UUID NOT NULL REFERENCES bot_runtime_sessions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
        contract_id BIGINT NOT NULL UNIQUE,
        symbol TEXT NOT NULL,
        bot_name TEXT NOT NULL,
        contract_type TEXT NOT NULL,
        barrier NUMERIC,
        buy_price NUMERIC NOT NULL,
        payout NUMERIC,
        status TEXT NOT NULL,
        profit_loss NUMERIC,
        purchase_time BIGINT,
        sell_time BIGINT,
        exit_spot TEXT,
        exit_tick TEXT,
        raw_contract JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS bot_runtime_trades_owner_idx ON bot_runtime_trades(user_id, purchase_time DESC);
    `).then(() => undefined).catch(error => { schemaPromise = null; throw error; });
  }
  await schemaPromise;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await tradingPool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createRuntime(
  userId: string | number,
  account: { accountId: string; accountType: AccountType; currency: string },
  config: RuntimeConfig,
) {
  await ensureTradingSchema();
  const id = randomUUID();
  const initialState = {
    tickSequence: 0,
    ticks: [],
    exitSpots: [],
    balance: null,
    profitLoss: 0,
    tradeCount: 0,
    winCount: 0,
    lossCount: 0,
    lastTradeAt: null,
    activeContractId: null,
    pendingIntentId: null,
    lastSignal: null,
    botActivity: 'collectingTicks',
    hyperBeen: { active: false, deficit: 0, nextParity: 'EVEN', recoveryStep: 0, pauseTicksRemaining: 0, lastTradeMode: null },
    hyperFlows: { analysisActive: false, nextDigit: null, recoveryMode: false, recoveryContract: 'EVEN', nextParity: 'ODD', consecutiveLosses: 0, deficit: 0, recoveryAttempts: 0, extraProfit: config.recoveryExtraProfit, lastTradeMode: null },
    hypercover: { forceNextDirection: false, contractType: 'DIGITUNDER', barrier: 8, lastDirection: null, lossStreak: 0, pauseTicksRemaining: 0 },
    risk: { mode: config.iaPower ? 'ia' : config.sonic ? 'sonic' : 'fixed', state: null },
    lastClosedContractIds: [],
    startedAt: new Date().toISOString(),
  };
  return withTransaction(async client => {
    const active = await client.query(
      `SELECT id FROM bot_runtime_sessions WHERE user_id=$1 AND account_type=$2 AND status IN ('starting','running','stopping') FOR UPDATE`,
      [userId, account.accountType],
    );
    if (active.rows[0]) throw Object.assign(new Error('Já existe um robô activo nesta conta. Pare-o antes de iniciar outro.'), { code: 'BOT_ALREADY_ACTIVE', status: 409 });
    await client.query(
      `INSERT INTO bot_runtime_sessions
       (id,user_id,account_id,account_type,account_currency,config,state,status)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,'starting')`,
      [id,userId,account.accountId,account.accountType,account.currency,JSON.stringify(config),JSON.stringify(initialState)],
    );
    await client.query(
      'INSERT INTO bot_runtime_events(runtime_id,user_id,event_type,payload) VALUES ($1,$2,$3,$4::jsonb)',
      [id,userId,'runtime_started',{ strategy: config.strategy, symbol: config.symbol, accountType: account.accountType }],
    );
    return id;
  });
}

export async function requestStopRuntime(userId: string | number, runtimeId?: string) {
  await ensureTradingSchema();
  const result = await tradingPool.query(
    `UPDATE bot_runtime_sessions SET status='stopping', stop_requested_at=NOW(), updated_at=NOW()
     WHERE user_id=$1 AND status IN ('starting','running') AND ($2::uuid IS NULL OR id=$2::uuid)
     RETURNING id`,
    [userId,runtimeId || null],
  );
  if (!result.rowCount) return false;
  await tradingPool.query(
    'INSERT INTO bot_runtime_events(runtime_id,user_id,event_type,payload) SELECT id,user_id,$2,$3::jsonb FROM bot_runtime_sessions WHERE id=ANY($1::uuid[])',
    [result.rows.map((r: any) => r.id),'stop_requested',{}],
  );
  return true;
}

export async function getUserRuntime(userId: string | number): Promise<RuntimeRow | null> {
  await ensureTradingSchema();
  const result = await tradingPool.query(
    `SELECT id,user_id,account_id,account_type,account_currency,config,state,status,lease_owner,lease_until,stop_requested_at
     FROM bot_runtime_sessions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  return result.rows[0] || null;
}

export async function acquireRuntimeLease(workerId: string, leaseSeconds = 20): Promise<RuntimeRow | null> {
  await ensureTradingSchema();
  const result = await tradingPool.query(
    `WITH candidate AS (
       SELECT id FROM bot_runtime_sessions
       WHERE status IN ('starting','running','stopping')
         AND (lease_until IS NULL OR lease_until < NOW() OR lease_owner=$1)
       ORDER BY CASE status WHEN 'stopping' THEN 0 WHEN 'starting' THEN 1 ELSE 2 END, updated_at
       FOR UPDATE SKIP LOCKED LIMIT 1
     )
     UPDATE bot_runtime_sessions r
     SET lease_owner=$1, lease_until=NOW()+($2 * INTERVAL '1 second'),
         last_heartbeat_at=NOW(), updated_at=NOW()
     FROM candidate c WHERE r.id=c.id
     RETURNING r.*`,
    [workerId,Math.max(10,Math.floor(leaseSeconds))],
  );
  return result.rows[0] || null;
}

export async function heartbeatRuntime(runtimeId: string, workerId: string, state?: Record<string, any>) {
  const result = await tradingPool.query(
    `UPDATE bot_runtime_sessions
     SET last_heartbeat_at=NOW(), lease_until=NOW()+INTERVAL '20 seconds',
         state=COALESCE($3::jsonb,state), updated_at=NOW(),
         status=CASE WHEN status='starting' THEN 'running' ELSE status END,
         started_at=CASE WHEN started_at IS NULL AND status='starting' THEN NOW() ELSE started_at END
     WHERE id=$1 AND lease_owner=$2 AND status IN ('starting','running','stopping')
     RETURNING status`,
    [runtimeId,workerId,state ? JSON.stringify(state) : null],
  );
  return result.rows[0]?.status || null;
}

export async function finishRuntime(runtimeId: string, workerId: string, status: 'stopped'|'error'|'safety_stopped', error?: { code?: string; message?: string }) {
  await tradingPool.query(
    `UPDATE bot_runtime_sessions SET status=$3, stopped_at=NOW(), updated_at=NOW(),
     lease_owner=NULL,lease_until=NULL,error_code=$4,error_message=$5
     WHERE id=$1 AND lease_owner=$2`,
    [runtimeId,workerId,status,error?.code || null,error?.message || null],
  );
}

export async function appendRuntimeEvent(runtime: Pick<RuntimeRow,'id'|'user_id'>, eventType: string, payload: unknown = {}) {
  await tradingPool.query(
    'INSERT INTO bot_runtime_events(runtime_id,user_id,event_type,payload) VALUES ($1,$2,$3,$4::jsonb)',
    [runtime.id,runtime.user_id,eventType,JSON.stringify(payload)],
  );
}

export async function createOrderIntent(input: {
  runtime: Pick<RuntimeRow,'id'|'user_id'>; tickEpoch: number; symbol: string;
  contractType: string; barrier?: number; stake: number; currency: string; botName: string;
}) {
  const id = randomUUID();
  const result = await tradingPool.query(
    `INSERT INTO bot_order_intents
     (id,runtime_id,user_id,tick_epoch,symbol,contract_type,barrier,stake,currency,bot_name,status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'created')
     ON CONFLICT(runtime_id,tick_epoch) DO NOTHING
     RETURNING id`,
    [id,input.runtime.id,input.runtime.user_id,input.tickEpoch,input.symbol,input.contractType,input.barrier ?? null,input.stake,input.currency,input.botName],
  );
  return result.rows[0]?.id as string | undefined;
}

export async function updateOrderIntent(id: string, status: string, values: { proposalId?: string; maxPrice?: number; contractId?: number; errorMessage?: string } = {}) {
  await tradingPool.query(
    `UPDATE bot_order_intents SET status=$2,proposal_id=COALESCE($3,proposal_id),
     max_price=COALESCE($4,max_price),contract_id=COALESCE($5,contract_id),
     error_message=$6,updated_at=NOW() WHERE id=$1`,
    [id,status,values.proposalId ?? null,values.maxPrice ?? null,values.contractId ?? null,values.errorMessage ?? null],
  );
}

export async function recordTrade(runtime: Pick<RuntimeRow,'id'|'user_id'>, contract: any, botName: string, symbol: string) {
  const result = await tradingPool.query(
    `INSERT INTO bot_runtime_trades
     (runtime_id,user_id,contract_id,symbol,bot_name,contract_type,barrier,buy_price,payout,status,profit_loss,purchase_time,sell_time,exit_spot,exit_tick,raw_contract)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb)
     ON CONFLICT(contract_id) DO UPDATE SET
       status=EXCLUDED.status,profit_loss=EXCLUDED.profit_loss,sell_time=EXCLUDED.sell_time,
       exit_spot=EXCLUDED.exit_spot,exit_tick=EXCLUDED.exit_tick,raw_contract=EXCLUDED.raw_contract,updated_at=NOW()
     RETURNING contract_id`,
    [runtime.id,runtime.user_id,contract.contract_id,symbol,botName,contract.contract_type,contract.barrier ?? null,contract.buy_price,contract.payout,contract.status,contract.profit_loss,contract.purchase_time,contract.sell_time,contract.exit_spot == null ? null : String(contract.exit_spot),contract.exit_tick == null ? null : String(contract.exit_tick),JSON.stringify(contract)],
  );
  return result.rowCount || 0;
}

export async function listRuntimeTrades(runtimeId: string, limit = 200) {
  const result = await tradingPool.query(
    'SELECT contract_id,symbol,bot_name AS bot,contract_type,barrier,buy_price,payout,status,profit_loss,purchase_time,sell_time,exit_spot,exit_tick FROM bot_runtime_trades WHERE runtime_id=$1 ORDER BY COALESCE(sell_time,purchase_time) DESC LIMIT $2',
    [runtimeId,Math.max(1,Math.min(500,Math.floor(limit)))],
  );
  return result.rows;
}
