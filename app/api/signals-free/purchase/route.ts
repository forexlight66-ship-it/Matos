import { NextRequest, NextResponse } from 'next/server';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import {
  activateSignalsFreeUnlimited,
  getSignalsFreeOnboarding,
  linkSignalsFreePaymentRequest,
  resetSignalsFreePaymentRequest,
} from '@/lib/signalsFree';
import {
  createSignalsFreeUnlimitedRequest,
  getPaymentRequest,
} from '@/lib/paymentAgentRequests';
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

function safePayment(row: any, eligibleForLocalPayment: boolean) {
  return {
    requestId: String(row.id),
    status: String(row.status || ''),
    paymentMethod: String(row.payment_method || ''),
    paymentNumber: String(row.payment_number || ''),
    paymentName: String(row.payment_name || ''),
    amountMzn: Number(row.local_amount_mzn || 250),
    amountUsdt: Number(row.amount_usd || 3),
    cryptoAddress: String(row.crypto_address || ''),
    cryptoNetwork: String(row.crypto_network || ''),
    mt5Id: String(row.client_mt5_id || ''),
    eligibleForLocalPayment,
  };
}

export async function POST(request: NextRequest) {
  let identity: AuthenticatedDerivIdentity | null = null;
  try {
    const user = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
    if (!user) return respond({ error: 'Inicie sessão para continuar.', code: 'AUTH_REQUIRED' }, identity, 401);

    identity = await resolveDerivIdentityForRequest(request, user.id);
    const onboarding = await getSignalsFreeOnboarding(identity.externalReferenceId);
    if (!onboarding) {
      return respond({ error: 'Submeta primeiro o ID MT5 e conclua a verificação.', code: 'SIGNALS_FREE_ONBOARDING_NOT_FOUND' }, identity, 409);
    }
    if (onboarding.status === 'active') {
      return respond({ nextStep: 'active', status: 'active', mt5Id: onboarding.mt5_id }, identity);
    }
    if (!['ready_for_payment', 'payment_pending'].includes(String(onboarding.status))) {
      return respond({
        error: 'Antes de pagar, é necessário concluir a etapa de verificação. Se a conta não for reconhecida, envie o screenshot pedido pelo Matos.',
        code: 'SIGNALS_FREE_VERIFICATION_INCOMPLETE',
      }, identity, 409);
    }

    const eligibleForLocalPayment = String(user.country || '').trim().toUpperCase() === 'MZ';
    const body = await request.json().catch(() => ({}));
    const method = String(body?.paymentMethod || '').trim().toLowerCase();
    const paymentMethod = eligibleForLocalPayment ? method : 'binance_usdt_trc20';

    if (eligibleForLocalPayment && paymentMethod !== 'mpesa' && paymentMethod !== 'emola') {
      return respond({ error: 'Escolha M-Pesa ou e-Mola.', code: 'PAYMENT_METHOD_INVALID' }, identity, 400);
    }
    if (!eligibleForLocalPayment && method && method !== 'binance_usdt_trc20') {
      return respond({ error: 'Para esta localização, o pagamento deve ser feito em USDT pela rede TRC20.', code: 'USDT_PAYMENT_REQUIRED' }, identity, 400);
    }

    // Reuse an existing payment instead of charging or creating duplicate
    // requests when the user returns to this screen or presses the button again.
    if (onboarding.payment_request_id) {
      let existing = await getPaymentRequest(onboarding.payment_request_id);
      if (existing && String(existing.user_id) === String(user.id)) {
        if (existing.status === 'payment_confirmed' || existing.status === 'completed') {
          await activateSignalsFreeUnlimited(user.id, existing.id);
          return respond({ nextStep: 'active', status: 'active', mt5Id: onboarding.mt5_id }, identity);
        }
        if (['awaiting_payment', 'client_marked_paid'].includes(String(existing.status))) {
          return respond({
            nextStep: 'payment_instructions',
            payment: safePayment(existing, eligibleForLocalPayment),
          }, identity);
        }
        if (['rejected', 'failed'].includes(String(existing.status))) {
          await resetSignalsFreePaymentRequest(user.id, existing.id);
        }
      }
    }

    let payerName = '';
    let payerNumber = '';
    if (eligibleForLocalPayment) {
      payerName = String(body?.payerName || '').trim();
      payerNumber = String(body?.payerNumber || '').replace(/\D/g, '');
      if (payerName.length < 2) {
        return respond({ error: 'Informe o nome usado no pagamento.', code: 'PAYER_NAME_REQUIRED' }, identity, 400);
      }
      if (!/^\d{9,15}$/.test(payerNumber)) {
        return respond({ error: 'Informe um número M-Pesa/e-Mola válido.', code: 'PAYER_NUMBER_INVALID' }, identity, 400);
      }
    }

    const created = await createSignalsFreeUnlimitedRequest({
      userId: user.id,
      clientName: String(user.name || 'Utilizador'),
      clientEmail: String(user.email || ''),
      clientNickname: identity.nickname,
      mt5Id: String(onboarding.mt5_id),
      paymentMethod: paymentMethod as 'mpesa' | 'emola' | 'binance_usdt_trc20',
      payerName,
      payerNumber,
    });
    await linkSignalsFreePaymentRequest(identity.externalReferenceId, created.id);

    return respond({
      nextStep: 'payment_instructions',
      payment: safePayment(created, eligibleForLocalPayment),
    }, identity, 201);
  } catch (error) {
    console.error('[Signals Free] purchase creation failed', error);
    const status = typeof error === 'object' && error !== null && 'status' in error
      && typeof (error as { status?: unknown }).status === 'number'
      ? Math.min(599, Math.max(400, (error as { status: number }).status))
      : 500;
    const code = typeof error === 'object' && error !== null && 'code' in error
      && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'SIGNALS_FREE_PURCHASE_FAILED';
    return respond({ error: error instanceof Error ? error.message : 'Não foi possível iniciar o pagamento.', code }, identity, status);
  }
}
