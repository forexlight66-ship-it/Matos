import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getSession, PLATFORM_SESSION_COOKIE } from '@/lib/platform-auth';
import { derivPaymentRequest, isPaymentAgentCountryAllowed, PAYMENT_AGENT_ID } from '@/lib/paymentAgent';
import { createWithdrawRequest } from '@/lib/paymentAgentRequests';
import { sendAgentAlert } from '@/lib/telegram';

export const dynamic = 'force-dynamic';

function safeText(value: string) {
  return value.replace(/[&<>"]/g, '');
}

function withdrawalStatus(value: unknown): 'rejected' | 'transfer_pending' | 'completed' | 'failed' {
  const status = String(value || '').toLowerCase();
  if (status === 'complete' || status === 'completed') return 'completed';
  if (status === 'rejected') return 'rejected';
  if (status === 'failed') return 'failed';
  return 'transfer_pending';
}

export async function POST(request: NextRequest) {
  const session = await getSession(request.cookies.get(PLATFORM_SESSION_COOKIE)?.value);
  const token = request.cookies.get('deriv_access_token')?.value || '';

  if (!session) return NextResponse.json({ error: 'Autenticação necessária' }, { status: 401 });
  if (!isPaymentAgentCountryAllowed(session.country)) {
    return NextResponse.json({
      error: 'O Payment Agent está disponível apenas para clientes de Moçambique (MZN/MT) e África do Sul (ZAR/Rand).',
      code: 'PAYMENT_AGENT_COUNTRY_UNSUPPORTED',
      redirect: 'https://deriv.com/',
    }, { status: 403 });
  }
  if (!token) {
    return NextResponse.json({
      error: 'A autenticação Deriv desta conta expirou. Faça login com Deriv novamente para continuar.',
      code: 'DERIV_REAUTH_REQUIRED',
    }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const amount = Number(body.amount);
  const currency = String(body.currency || '').trim().toUpperCase();
  const verificationCode = String(body.verificationCode || '').trim();
  const paymentMethod = String(body.paymentMethod || '').toLowerCase();
  const paymentNumber = String(body.paymentNumber || '').trim();
  const paymentName = String(body.paymentName || '').trim();

  if (!Number.isFinite(amount) || amount <= 0 || currency !== 'USD' || !/^\d{6}$/.test(verificationCode)) {
    return NextResponse.json({ error: 'Valor USD e código de 6 dígitos são obrigatórios.' }, { status: 400 });
  }
  if (paymentMethod !== 'mpesa' && paymentMethod !== 'emola') {
    return NextResponse.json({ error: 'Escolha M-Pesa ou e-Mola.' }, { status: 400 });
  }
  if (!/^\d{9,15}$/.test(paymentNumber.replace(/\s+/g, ''))) {
    return NextResponse.json({ error: 'Informe um número M-Pesa/e-Mola válido.' }, { status: 400 });
  }
  if (paymentName.length < 2) {
    return NextResponse.json({ error: 'Informe o nome do titular do pagamento.' }, { status: 400 });
  }

  let nickname = '';
  try {
    const result = await derivPaymentRequest(token, '/account/v1/nickname', 'GET', undefined, false);
    nickname = String(result?.data?.nickname || result?.nickname || '').trim();
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 0);
    if (status === 401) {
      return NextResponse.json({
        error: 'A autenticação Deriv desta conta expirou. Faça login com Deriv novamente para continuar.',
        code: 'DERIV_REAUTH_REQUIRED',
      }, { status: 401 });
    }
    return NextResponse.json({
      error: 'Não foi possível obter a conta Deriv autenticada. Tente ligar novamente a Deriv.',
      code: 'NICKNAME_LOOKUP_FAILED',
    }, { status: 400 });
  }

  const requestId = randomUUID();

  try {
    const result = await derivPaymentRequest(
      token,
      '/payment-agents/v1/withdraw',
      'POST',
      {
        data: {
          agent_id: PAYMENT_AGENT_ID,
          amount: Number(amount).toFixed(2),
          currency: 'USD',
          verification_code: verificationCode,
          request_id: requestId,
          notes: `MozHyper Payment Agent ${nickname}`,
        },
      },
      false,
    );

    const remoteStatus = String(result?.data?.status || 'pending').toLowerCase();
    const transactionId = result?.data?.transaction_id == null ? null : String(result.data.transaction_id);
    const localStatus = withdrawalStatus(remoteStatus);

    const row = await createWithdrawRequest({
      userId: session.id,
      clientName: session.name,
      clientEmail: session.email,
      clientNickname: nickname,
      amountUsd: Number(amount.toFixed(2)),
      paymentMethod: paymentMethod as 'mpesa' | 'emola',
      paymentNumber,
      paymentName,
      verificationCode,
      requestId,
      status: localStatus,
      transactionId,
    });

    try {
      await sendAgentAlert(
        [
          '🔔 <b>LEVANTAMENTO ENVIADO À DERIV</b>',
          '',
          `Cliente: <b>${safeText(session.name)}</b>`,
          `Conta Deriv: <b>${safeText(nickname)}</b>`,
          `Valor: <b>${row.amount_usd.toFixed(2)} USD</b>`,
          `A pagar ao cliente: <b>${row.local_amount_mzn.toFixed(2)} MZN</b>`,
          `Método: <b>${paymentMethod === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</b>`,
          `Número: <b>${safeText(paymentNumber)}</b>`,
          `Nome: <b>${safeText(paymentName)}</b>`,
          `Estado Deriv: <b>${remoteStatus}</b>`,
          `Request ID: <code>${requestId}</code>`,
          '',
          'O levantamento já foi submetido diretamente pela Wallet do cliente para o Payment Agent 503.',
          'Não existe transferência Options → Wallet neste fluxo.',
          'O agente deve liquidar o equivalente ao cliente por M-Pesa/e-Mola após a conclusão na Deriv.',
        ].join('\\n'),
      );
    } catch {}

    return NextResponse.json({
      requestId: row.id,
      status: remoteStatus,
      amountUsd: row.amount_usd,
      localAmountMzn: row.local_amount_mzn,
      exchangeRate: row.exchange_rate,
      paymentMethod: row.payment_method,
      paymentNumber: row.payment_number,
      paymentName: row.payment_name,
      transactionId,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    const code = String((error as { code?: string })?.code || '');

    if (status === 401) {
      return NextResponse.json({
        error: 'A autenticação Deriv desta conta expirou. Faça login com Deriv novamente para continuar.',
        code: 'DERIV_REAUTH_REQUIRED',
      }, { status: 401 });
    }

    if (code === 'WalletFundsInsufficient') {
      return NextResponse.json({
        error: 'Saldo insuficiente na Wallet Deriv para este levantamento.',
        code,
      }, { status: 400 });
    }

    if (code === 'InvalidOTP') {
      return NextResponse.json({
        error: 'O código de verificação da Deriv é inválido ou já expirou. Solicite um novo código.',
        code,
      }, { status: 400 });
    }

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Não foi possível submeter o levantamento.',
      code: code || undefined,
    }, { status });
  }
}
