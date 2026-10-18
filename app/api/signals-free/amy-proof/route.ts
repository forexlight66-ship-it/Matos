import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import {
  getSignalsFreeAmyProof,
} from '@/lib/signalsFree';
import { attachDerivIdentityCookies, resolveDerivIdentityForRequest } from '@/lib/derivRequestAuth';
import type { AuthenticatedDerivIdentity } from '@/lib/derivNickname';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

function safeError(error: unknown, fallback: string) {
  const status = typeof error === 'object' && error !== null && 'status' in error
    && typeof (error as { status?: unknown }).status === 'number'
    ? Math.min(599, Math.max(400, (error as { status: number }).status))
    : 500;
  const code = typeof error === 'object' && error !== null && 'code' in error
    && typeof (error as { code?: unknown }).code === 'string'
    ? (error as { code: string }).code
    : 'SIGNALS_FREE_PROOF_FAILED';
  return { status, body: { error: error instanceof Error ? error.message : fallback, code } };
}

export async function GET(request: NextRequest) {
  let identity: AuthenticatedDerivIdentity | null = null;
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return new NextResponse('Authentication required', { status: 401 });

    identity = await resolveDerivIdentityForRequest(request, user.id);
    const proof = await getSignalsFreeAmyProof(identity.externalReferenceId);
    if (!proof) return new NextResponse('Not found', { status: 404 });

    const response = new NextResponse(new Uint8Array(proof.bytes), {
      status: 200,
      headers: {
        'Content-Type': proof.mimeType,
        'Content-Disposition': 'inline; filename="ask-amy-proof"',
        'Cache-Control': 'private, no-store, max-age=0',
        Pragma: 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
    return attachDerivIdentityCookies(response, identity);
  } catch (error) {
    const result = safeError(error, 'Não foi possível carregar o screenshot anterior.');
    console.error('[Signals Free] Amy proof download failed', result.body.code);
    return response(result.body, identity, result.status);
  }
}

export async function POST() {
  return response({
    error: 'O fluxo Ask Amy foi desativado. Abra o Signal Unlimited pelo ícone para entrar diretamente no Telegram.',
    code: 'SIGNALS_AMY_PROOF_DISABLED',
  }, null, 410);
}
