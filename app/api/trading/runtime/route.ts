import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { getUserRuntime, requestStopRuntime } from '@/worker/repository';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const NO_STORE = {
  'Cache-Control': 'no-store, private',
  Pragma: 'no-cache',
  Vary: 'Cookie',
};

async function authenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get(PLATFORM_SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  return getSession(sessionId);
}

function sameOrigin(request: NextRequest) {
  // State-changing browser requests must carry an Origin header. Do not treat
  // a missing Origin as trusted: that would make cookie-authenticated POSTs
  // vulnerable to cross-site request forgery.
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const supplied = new URL(origin);
    return supplied.origin === request.nextUrl.origin;
  } catch {
    return false;
  }
}

function publicRuntime(runtime: Awaited<ReturnType<typeof getUserRuntime>>) {
  if (!runtime) return null;
  const state = runtime.state || {};
  return {
    id: runtime.id,
    status: runtime.status,
    accountType: runtime.account_type,
    currency: runtime.account_currency,
    strategy: runtime.config?.strategy,
    symbol: runtime.config?.symbol,
    startedAt: state.startedAt ?? null,
    botActivity: state.botActivity ?? null,
    balance: typeof state.balance === 'number' ? state.balance : null,
    profitLoss: typeof state.profitLoss === 'number' ? state.profitLoss : 0,
    tradeCount: typeof state.tradeCount === 'number' ? state.tradeCount : 0,
    winCount: typeof state.winCount === 'number' ? state.winCount : 0,
    lossCount: typeof state.lossCount === 'number' ? state.lossCount : 0,
    stopRequested: Boolean(runtime.stop_requested_at),
    updatedAt: state.updatedAt ?? null,
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers: NO_STORE });

    const runtime = await getUserRuntime(user.id);
    return NextResponse.json({ runtime: publicRuntime(runtime) }, { headers: NO_STORE });
  } catch (error) {
    console.error('[trading/runtime] status failed:', error);
    return NextResponse.json({ error: 'Não foi possível consultar o estado do robô.' }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: 'Pedido de origem inválida.' }, { status: 403, headers: NO_STORE });
  }

  try {
    const user = await authenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401, headers: NO_STORE });

    let body: { action?: unknown; runtimeId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Corpo do pedido inválido.' }, { status: 400, headers: NO_STORE });
    }

    if (body.action !== 'stop') {
      return NextResponse.json({ error: 'Acção não permitida.' }, { status: 400, headers: NO_STORE });
    }

    const runtimeId = body.runtimeId;
    if (runtimeId !== undefined && (typeof runtimeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runtimeId))) {
      return NextResponse.json({ error: 'Identificador de sessão inválido.' }, { status: 400, headers: NO_STORE });
    }

    const stopped = await requestStopRuntime(user.id, runtimeId as string | undefined);
    return NextResponse.json({ accepted: stopped, message: stopped ? 'Pedido de paragem registado.' : 'Não existe robô activo para parar.' }, { headers: NO_STORE });
  } catch (error) {
    console.error('[trading/runtime] stop request failed:', error);
    return NextResponse.json({ error: 'Não foi possível registar a paragem.' }, { status: 503, headers: NO_STORE });
  }
}
