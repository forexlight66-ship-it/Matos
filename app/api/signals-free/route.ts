import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import {
  ensureSignalsFreeOnboardingSchema,
  getSignalsFreeOnboarding,
  getSignalsFreeRequest,
  upsertSignalsFreeOnboarding,
  activateSignalsFreeUnlimited,
  resetSignalsFreePaymentRequest,
} from '@/lib/signalsFree';
import { getPaymentRequest } from '@/lib/paymentAgentRequests';
import { verifyDerivPartnerClient } from '@/lib/derivPartnerVerification';
import { attachDerivIdentityCookies, resolveDerivIdentityForRequest } from '@/lib/derivRequestAuth';
import type { AuthenticatedDerivIdentity } from '@/lib/derivNickname';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function respond(body: unknown, identity: AuthenticatedDerivIdentity | null, status = 200) {
  return attachDerivIdentityCookies(NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', Pragma: 'no-cache' },
  }), identity);
}

function paymentSummary(row: any) {
  if (!row) return null;
  return {
    requestId: String(row.id),
    status: String(row.status || ''),
    paymentMethod: String(row.payment_method || ''),
    paymentNumber: String(row.payment_number || ''),
    paymentName: String(row.payment_name || ''),
    amountMzn: Number(row.local_amount_mzn || 0),
    amountUsdt: Number(row.amount_usd || 0),
    cryptoAddress: String(row.crypto_address || ''),
    cryptoNetwork: String(row.crypto_network || ''),
    payerName: String(row.payer_name || ''),
    payerNumber: String(row.payer_number || ''),
  };
}

function onboardingSummary(row: any) {
  if (!row) return null;
  return {
    mt5_id: String(row.mt5_id || ''),
    deriv_nickname: String(row.deriv_nickname || ''),
    status: String(row.status || ''),
    amyProofUploaded: Boolean(row.amy_screenshot),
    amyMessageSentAt: row.amy_message_sent_at || null,
    paymentRequestId: row.payment_request_id ? String(row.payment_request_id) : null,
    activatedAt: row.activated_at || null,
  };
}

async function currentOnboarding(externalReferenceId: string, userId: string | number) {
  let onboarding = await getSignalsFreeOnboarding(externalReferenceId);
  let payment: any = null;
  if (onboarding?.payment_request_id) {
    payment = await getPaymentRequest(onboarding.payment_request_id);
    if (payment && String(payment.user_id) !== String(userId)) payment = null;
    if (payment && ['rejected', 'failed'].includes(String(payment.status))) {
      await resetSignalsFreePaymentRequest(userId, String(payment.id));
      onboarding = await getSignalsFreeOnboarding(externalReferenceId);
      payment = null;
    } else if (payment?.status === 'payment_confirmed' && onboarding?.status !== 'active') {
      await activateSignalsFreeUnlimited(userId, String(payment.id));
      onboarding = await getSignalsFreeOnboarding(externalReferenceId);
    }
  }
  const visiblePayment = payment && [
    'awaiting_payment', 'client_marked_paid', 'payment_confirmed', 'completed',
  ].includes(String(payment.status)) ? paymentSummary(payment) : null;
  return { onboarding, payment: visiblePayment };
}

export async function GET(request: NextRequest) {
  let identity: AuthenticatedDerivIdentity | null = null;
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return respond({ error: 'Inicie sessão para consultar o Signals Free.', code: 'AUTH_REQUIRED' }, identity, 401);
    const legacyRequest = await getSignalsFreeRequest(user.id);
    identity = await resolveDerivIdentityForRequest(request, user.id);
    await ensureSignalsFreeOnboardingSchema();
    const current = await currentOnboarding(identity.externalReferenceId, user.id);
    const localEligible = String(user.country || '').trim().toUpperCase() === 'MZ';
    return respond({
      derivConnected: true,
      eligibleForLocalPayment: localEligible,
      onboarding: onboardingSummary(current.onboarding),
      payment: current.payment,
      request: legacyRequest,
    }, identity);
  } catch (error) {
    console.error('[Signals Free] status lookup failed', error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      ? Math.min(599, Math.max(400, (error as { status: number }).status))
      : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error
      && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'SIGNALS_FREE_STATUS_FAILED';
    return respond({ error: error instanceof Error ? error.message : 'Não foi possível consultar o Signals Free.', code }, identity, status);
  }
}

export async function POST(request: NextRequest) {
  let identity: AuthenticatedDerivIdentity | null = null;
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return respond({ error: 'Inicie sessão para pedir acesso ao Signals Free.', code: 'AUTH_REQUIRED' }, identity, 401);

    const body = await request.json().catch(() => ({}));
    const mt5Id = String(body?.mt5Id ?? '').trim();
    if (!/^\d{5,15}$/.test(mt5Id)) {
      return respond({ error: 'Introduza um ID MT5 válido, apenas com 5 a 15 dígitos.', code: 'MT5_ID_FORMAT_INVALID' }, identity, 400);
    }

    identity = await resolveDerivIdentityForRequest(request, user.id);
    await ensureSignalsFreeOnboardingSchema();
    const current = await currentOnboarding(identity.externalReferenceId, user.id);
    if (current.onboarding?.status === 'active') {
      return respond({ nextStep: 'active', onboarding: onboardingSummary(current.onboarding) }, identity);
    }
    if (current.onboarding?.status === 'payment_pending' && current.payment) {
      return respond({ nextStep: 'payment_instructions', onboarding: onboardingSummary(current.onboarding), payment: current.payment }, identity);
    }

    let isTagged = false;
    try {
      isTagged = await verifyDerivPartnerClient(identity.externalReferenceId);
    } catch (error) {
      // If the identity cannot be conclusively verified, guide the customer
      // through the explicit Ask Amy retag process and require a screenshot.
      // Authentication failures are handled before this point; verification
      // failures must never silently be treated as an approved partner tag.
      const code = typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code || '') : 'UNKNOWN';
      console.warn('[Signals Free] Partner tag was not conclusively verified; routing to Ask Amy:', code);
      isTagged = false;
    }

    const onboarding = await upsertSignalsFreeOnboarding({
      userId: user.id,
      externalReferenceId: identity.externalReferenceId,
      derivNickname: identity.nickname,
      mt5Id,
      status: isTagged ? 'ready_for_payment' : 'verification_required',
    });
    const proofUploaded = Boolean(onboarding.amy_proof_uploaded);
    if (!isTagged) {
      return respond({
        nextStep: 'amy_verification',
        alreadySentToAmy: proofUploaded,
        amyProofUploaded: proofUploaded,
        onboarding: { mt5_id: String(onboarding.mt5_id || mt5Id), deriv_nickname: identity.nickname, status: String(onboarding.status || 'verification_required') },
      }, identity);
    }

    return respond({
      nextStep: 'payment',
      eligibleForLocalPayment: String(user.country || '').trim().toUpperCase() === 'MZ',
      amyProofUploaded: proofUploaded,
      onboarding: { mt5_id: String(onboarding.mt5_id || mt5Id), deriv_nickname: identity.nickname, status: String(onboarding.status || 'ready_for_payment') },
    }, identity);
  } catch (error) {
    console.error('[Signals Free] submission failed', error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      ? Math.min(599, Math.max(400, (error as { status: number }).status))
      : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error
      && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'SIGNALS_FREE_REQUEST_FAILED';
    return respond({ error: error instanceof Error ? error.message : 'Não foi possível enviar o pedido.', code }, identity, status);
  }
}
