import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import {
  getSignalsFreeAmyProof,
  getSignalsFreeOnboarding,
  saveSignalsFreeAmyProof,
} from '@/lib/signalsFree';
import { attachDerivIdentityCookies, resolveDerivIdentityForRequest } from '@/lib/derivRequestAuth';
import type { AuthenticatedDerivIdentity } from '@/lib/derivNickname';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

function response(body: unknown, identity: AuthenticatedDerivIdentity | null, status = 200) {
  return attachDerivIdentityCookies(NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  }), identity);
}

function detectImageType(bytes: Buffer): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

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

export async function POST(request: NextRequest) {
  let identity: AuthenticatedDerivIdentity | null = null;
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return response({ error: 'Inicie sessão para enviar o screenshot.', code: 'AUTH_REQUIRED' }, identity, 401);

    identity = await resolveDerivIdentityForRequest(request, user.id);
    const onboarding = await getSignalsFreeOnboarding(identity.externalReferenceId);
    if (!onboarding) {
      return response({ error: 'Submeta primeiro o seu ID MT5 para iniciar a verificação.', code: 'SIGNALS_FREE_ONBOARDING_NOT_FOUND' }, identity, 409);
    }

    // Keep the first valid proof permanently: clients do not have to send the
    // Ask Amy message or upload the same screenshot again on future attempts.
    if (onboarding.amy_screenshot) {
      return response({
        ok: true,
        alreadyUploaded: true,
        message: 'A mensagem para Ask Amy já foi comprovada. Não precisa de a enviar novamente.',
        status: onboarding.status,
      }, identity);
    }

    const form = await request.formData();
    const uploaded = form.get('screenshot');
    if (!(uploaded instanceof File) || uploaded.size <= 0) {
      return response({ error: 'Envie o screenshot da mensagem enviada ao Ask Amy.', code: 'AMY_SCREENSHOT_REQUIRED' }, identity, 400);
    }
    if (uploaded.size > MAX_SCREENSHOT_BYTES) {
      return response({ error: 'O screenshot deve ter no máximo 5 MB.', code: 'AMY_SCREENSHOT_TOO_LARGE' }, identity, 400);
    }

    const bytes = Buffer.from(await uploaded.arrayBuffer());
    const detectedMime = detectImageType(bytes);
    if (!detectedMime) {
      return response({ error: 'Formato inválido. Envie um screenshot PNG, JPG ou WEBP.', code: 'AMY_SCREENSHOT_INVALID_TYPE' }, identity, 400);
    }

    const saved = await saveSignalsFreeAmyProof({
      externalReferenceId: identity.externalReferenceId,
      mimeType: detectedMime,
      filename: uploaded.name || 'ask-amy-proof',
      bytes,
    });
    return response({
      ok: true,
      alreadyUploaded: false,
      message: 'Screenshot guardado. Não precisará de voltar a enviar a mensagem para Ask Amy.',
      status: saved.status,
      amyProofUploaded: saved.amy_proof_uploaded,
    }, identity);
  } catch (error) {
    const result = safeError(error, 'Não foi possível guardar o screenshot.');
    console.error('[Signals Free] Amy proof upload failed', result.body.code);
    return response(result.body, identity, result.status);
  }
}
