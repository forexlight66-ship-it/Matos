'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { isPaymentAgentCurrencyAllowed } from '@/lib/paymentAgent';

type Action = 'deposit' | 'withdraw' | 'ai_analyst';
type Step = 'form' | 'confirm' | 'otp' | 'result';

type AgentCurrency = {
  currency?: string;
  withdrawal_minimum?: string | number;
  withdrawal_maximum?: string | number;
};

type ApiResult = {
  data?: { status?: string; transaction_id?: number | null };
  requestId?: string;
  error?: string;
  code?: string;
  next_request_at?: number;
  expires_at?: number;
};

type Copy = {
  deposit:string; withdraw:string; paymentAgent:string; close:string; account:string; amount:string;
  processing:string; continue:string; back:string; cancel:string; confirmDeposit:string;
  sendCode:string; confirmWithdraw:string; operation:string; confirm:string; realWarning:string; withdrawWarning:string;
  code:string; codeHelp:string; accountHelp:string; fetching:string; closeWindow:string; currency:string; loadingCurrencies:string; unsupportedCurrency:string;
  invalid:string; nicknameMissing:string; nicknameError:string; retry:string; codeDigits:string; sent:string;
  minWithdraw:string; maxWithdraw:string; depositInfo:string; withdrawInfo:string;
  depositSuccess:string; withdrawSuccess:string; pending:string; complete:string; rejected:string;
  failed:string; accepted:string; request:string; authExpired:string; reauthenticate:string; realOperation:string; paymentMethod:string; mpesa:string; emola:string; recipientNumber:string; recipientName:string; exchangeRate:string; localAmount:string; alreadyPaid:string; awaitingAgent:string; paymentMarked:string; paymentInstructions:string; transferAmount:string; withdrawalDestination:string; paymentInstructionsTitle:string; amountToReceive:string;
};

interface PaymentAgentCashierProps {
  open: boolean;
  action: Action | null;
  currency: string;
  light: boolean;
  onClose: () => void;
  onNotice?: (message: string) => void;
}

function parseMoney(value: string) {
  const n = Number(value.replace(',', '.').trim());
  return Number.isFinite(n) ? n : NaN;
}

function statusText(status: string | undefined, copy: Copy) {
  if (status === 'complete' || status === 'completed') return copy.complete;
  if (status === 'pending' || status === 'client_marked_paid' || status === 'awaiting_payment') return copy.pending;
  if (status === 'payment_confirmed') return copy.accepted;
  if (status === 'transfer_pending') return copy.processing;
  if (status === 'rejected') return copy.rejected;
  if (status === 'failed') return copy.failed;
  return copy.accepted;
}

export default function PaymentAgentCashier({ open, action, currency, light, onClose, onNotice }: PaymentAgentCashierProps) {
  const { language } = useLanguage();
  const copy: Copy = language === 'en'
    ? {
        deposit:'Deposit', withdraw:'Withdraw', paymentAgent:'Payment Agent 503', close:'Close', account:'Deriv account', amount:'Amount',
        processing:'Processing…', continue:'Continue', back:'Back', cancel:'Cancel', confirmDeposit:'Confirm deposit',
        sendCode:'Send verification code', confirmWithdraw:'Confirm withdrawal', operation:'Operation status',
        confirm:'Confirm operation', realWarning:'Check the details. This creates a deposit request; no client funds are moved by this confirmation.', withdrawWarning:'Check the details. Confirming the withdrawal submits a real request directly from your Deriv Wallet to Payment Agent 503.',
        code:'Verification code', codeHelp:'The code matches exactly the requested amount.',
        accountHelp:'The deposit will be sent exclusively to this authenticated account.', fetching:'Loading…', closeWindow:'Close',
        invalid:'Please enter a valid amount.', nicknameMissing:'The authenticated Deriv account nickname is unavailable.', nicknameError:'Could not load the authenticated Deriv account nickname.', retry:'Retry',
        codeDigits:'The code must contain exactly 6 digits.', sent:'Verification code sent to the contact registered with Deriv.',
        minWithdraw:'The minimum withdrawal is', maxWithdraw:'The maximum withdrawal is',
        depositInfo:'Create a deposit request, pay the shown MZN amount, then press “I already paid”. The Payment Agent confirms the payment before the request is processed.',
        withdrawInfo:'Request a withdrawal, provide the M-Pesa/e-Mola destination and the Deriv verification code. After confirmation, the withdrawal is submitted directly from your Deriv Wallet to Payment Agent 503.',
        depositSuccess:'Deposit accepted.', withdrawSuccess:'Withdrawal accepted.', pending:'Pending', complete:'Completed',
        rejected:'Rejected', failed:'Failed', accepted:'Accepted', request:'Request', authExpired:'Deriv authentication expired. Sign in with Deriv again to continue.', reauthenticate:'Authenticate with Deriv', realOperation:'This is a real financial operation.', paymentMethod:'Payment method', mpesa:'M-Pesa', emola:'e-Mola', recipientNumber:'Payment number', recipientName:'Account holder name', exchangeRate:'Exchange rate', localAmount:'Amount in MZN', alreadyPaid:'I already paid', awaitingAgent:'Waiting for Payment Agent confirmation.', paymentMarked:'Payment marked as paid. Wait for the agent.', paymentInstructions:'Make the payment using the details below.', transferAmount:'Amount to transfer', withdrawalDestination:'Funds will be sent to', paymentInstructionsTitle:'Deposit payment', amountToReceive:'Amount to receive', currency:'Currency', loadingCurrencies:'Loading Payment Agent currencies…', unsupportedCurrency:'This currency is not supported by the Payment Agent.'
      }
    : language === 'es'
      ? {
          deposit:'Depositar', withdraw:'Retirar', paymentAgent:'Agente de pagos 503', close:'Cerrar', account:'Cuenta Deriv', amount:'Importe',
          processing:'Procesando…', continue:'Continuar', back:'Volver', cancel:'Cancelar', confirmDeposit:'Confirmar depósito',
          sendCode:'Enviar código', confirmWithdraw:'Confirmar retiro', operation:'Estado de la operación',
          confirm:'Confirmar operación', realWarning:'Verifica los datos. La confirmación crea un pedido de depósito; esta confirmación no mueve fondos del cliente.', withdrawWarning:'Verifica los datos. Confirmar el retiro envía un pedido real directamente desde tu Wallet Deriv al Payment Agent 503.',
          code:'Código de verificación', codeHelp:'El código corresponde exactamente al importe solicitado.',
          accountHelp:'El depósito se enviará exclusivamente a esta cuenta autenticada.', fetching:'Cargando…', closeWindow:'Cerrar',
          invalid:'Introduce un importe válido.', nicknameMissing:'No se encontró el nickname de la cuenta Deriv autenticada.', nicknameError:'No se pudo cargar el nickname de la cuenta Deriv autenticada.', retry:'Reintentar',
          codeDigits:'El código debe tener exactamente 6 dígitos.', sent:'Código enviado al contacto registrado en Deriv.',
          minWithdraw:'El retiro mínimo es', maxWithdraw:'El retiro máximo es',
          depositInfo:'Crea el pedido, paga el valor en MZN mostrado y depois pulsa “Ya pagué”. El Payment Agent confirma el pago antes de procesarlo.',
          withdrawInfo:'Solicita el retiro, indica el destino M-Pesa/e-Mola y el código de verificación de Deriv. Después de confirmar, el retiro se envía directamente desde tu Wallet Deriv al Payment Agent 503.',
          depositSuccess:'Depósito aceptado.', withdrawSuccess:'Retiro aceptado.', pending:'Pendiente', complete:'Completado',
          rejected:'Rechazado', failed:'Fallido', accepted:'Aceptado', request:'Solicitud', authExpired:'La autenticación de Deriv expiró. Inicia sesión con Deriv nuevamente para continuar.', reauthenticate:'Autenticar con Deriv', realOperation:'Esta es una operación financiera real.', paymentMethod:'Método de pago', mpesa:'M-Pesa', emola:'e-Mola', recipientNumber:'Número de pago', recipientName:'Nombre del titular', exchangeRate:'Tipo de cambio', localAmount:'Importe en MZN', alreadyPaid:'Ya pagué', awaitingAgent:'Esperando confirmación del agente.', paymentMarked:'Pago marcado. Espera la confirmación del agente.', paymentInstructions:'Realiza el pago con los datos abajo.', transferAmount:'Importe a transferir', withdrawalDestination:'Los fondos se enviarán a', paymentInstructionsTitle:'Pago del depósito', amountToReceive:'Importe a recibir', currency:'Moneda', loadingCurrencies:'Cargando monedas del agente…', unsupportedCurrency:'Esta moneda no es compatible con el agente de pagos.'
        }
      : {
          deposit:'Depositar', withdraw:'Levantar', paymentAgent:'Payment Agent 503', close:'Fechar', account:'Conta Deriv', amount:'Valor',
          processing:'A processar…', continue:'Continuar', back:'Voltar', cancel:'Cancelar', confirmDeposit:'Confirmar depósito',
          sendCode:'Enviar código', confirmWithdraw:'Confirmar levantamento', operation:'Estado da operação',
          confirm:'Confirmar operação', realWarning:'Verifique os dados. A confirmação cria um pedido de depósito; esta confirmação não movimenta fundos do cliente.', withdrawWarning:'Verifique os dados. Confirmar o levantamento envia um pedido real diretamente da sua Wallet Deriv para o Payment Agent 503.',
          code:'Código de verificação', codeHelp:'O código corresponde exatamente ao valor solicitado.',
          accountHelp:'O depósito será enviado exclusivamente para esta conta autenticada.', fetching:'A obter…', closeWindow:'Fechar',
          invalid:'Informe um valor válido.', nicknameMissing:'A conta Deriv autenticada não disponibilizou o nickname.', nicknameError:'Não foi possível carregar o nickname da conta Deriv autenticada.', retry:'Tentar novamente',
          codeDigits:'O código deve ter exatamente 6 dígitos.', sent:'Código enviado para o contacto registado na Deriv.',
          minWithdraw:'O mínimo para levantamento é', maxWithdraw:'O máximo para levantamento é',
          depositInfo:'Crie o pedido, pague o valor em MZN mostrado e depois toque em “JÁ PAGUEI”. O Payment Agent confirma o pagamento antes de processar o pedido.',
          withdrawInfo:'Solicite o levantamento, informe o destino M-Pesa/e-Mola e o código de verificação da Deriv. Depois de confirmar, o levantamento é enviado diretamente da sua Wallet Deriv para o Payment Agent 503.',
          depositSuccess:'Depósito aceite.', withdrawSuccess:'Levantamento aceite.', pending:'Pendente', complete:'Concluída',
          rejected:'Rejeitada', failed:'Falhou', accepted:'Aceite', request:'Pedido', authExpired:'A autenticação Deriv desta conta expirou. Faça login com Deriv novamente para continuar.', reauthenticate:'Autenticar novamente com Deriv', realOperation:'Esta é uma operação financeira real.', paymentMethod:'Método de pagamento', mpesa:'M-Pesa', emola:'e-Mola', recipientNumber:'Número para pagamento', recipientName:'Nome do titular', exchangeRate:'Câmbio', localAmount:'Valor em MZN', alreadyPaid:'JÁ PAGUEI', awaitingAgent:'A aguardar confirmação do Payment Agent.', paymentMarked:'Pagamento marcado. Aguarde a confirmação do agente.', paymentInstructions:'Faça o pagamento com os dados abaixo.', transferAmount:'Valor a transferir', withdrawalDestination:'Os fundos serão enviados para', paymentInstructionsTitle:'Pagamento do depósito', amountToReceive:'Valor por receber', currency:'Moeda', loadingCurrencies:'A carregar moedas do Payment Agent…', unsupportedCurrency:'Esta moeda não é suportada pelo Payment Agent.'
        };

  const [step, setStep] = useState<Step>('form');
  const [amount, setAmount] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [requestId, setRequestId] = useState('');
  const [agentCurrencies, setAgentCurrencies] = useState<AgentCurrency[]>([]);
  const [supportedCurrencies, setSupportedCurrencies] = useState<string[]>([]);
  const [paymentCurrency, setPaymentCurrency] = useState(currency);
  const [derivNickname, setDerivNickname] = useState('');
  const [nicknameLoading, setNicknameLoading] = useState(false);
  const [nicknameError, setNicknameError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'emola'>('mpesa');
  const [paymentNumber, setPaymentNumber] = useState('');
  const [paymentName, setPaymentName] = useState('');
  const [depositPaid, setDepositPaid] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);
  const [depositStatus, setDepositStatus] = useState<'awaiting_payment' | 'client_marked_paid' | 'payment_confirmed' | 'rejected' | 'completed' | 'failed' | ''>('');

  useEffect(() => {
    if (!open || !action) return;
    setStep('form');
    setAmount(action === 'ai_analyst' ? '3' : '');
    setCode('');
    setBusy(false);
    setMessage('');
    setRequestId('');
    setDerivNickname('');
    setNicknameLoading(false);
    setNicknameError('');
    setPaymentMethod('mpesa');
    setPaymentNumber('');
    setPaymentName('');
    setDepositPaid(false);
    setDepositStatus('');
    setAuthExpired(false);
    setSupportedCurrencies([]);
    setPaymentCurrency(action === 'ai_analyst' ? 'USD' : currency);
    try {
      const raw = sessionStorage.getItem('mozhyper_payment_agent_draft');
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft?.action === action && Date.now() - Number(draft.savedAt || 0) < 15 * 60 * 1000) {
          setAmount(String(draft.amount || ''));
          setPaymentCurrency(String(draft.paymentCurrency || currency));
          setPaymentMethod(draft.paymentMethod === 'emola' ? 'emola' : 'mpesa');
          setPaymentNumber(String(draft.paymentNumber || ''));
          setPaymentName(String(draft.paymentName || ''));
        }
        sessionStorage.removeItem('mozhyper_payment_agent_draft');
      }
    } catch {}
  }, [open, action, currency]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const loadProfile = async () => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/api/payment-agent/profile', { cache: 'no-store', signal: controller.signal });
        const profile = await response.json().catch(() => null);
        if (cancelled) return;
        if (!response.ok) return;

        const currencies = Array.isArray(profile?.supportedCurrencies)
          ? profile.supportedCurrencies.map((value: unknown): string => String(value).toUpperCase())
          : Array.isArray(profile?.data?.currencies)
            ? profile.data.currencies.map((item: any): string => String(item?.currency || item).toUpperCase())
            : [] as string[];
        const normalizedCurrencies: string[] = currencies;
        setSupportedCurrencies([...new Set<string>(normalizedCurrencies.filter(Boolean))]);
        setAgentCurrencies(Array.isArray(profile?.data?.currencies) ? profile.data.currencies : []);
        if (currencies.length) {
          setPaymentCurrency(currencies.includes(currency.toUpperCase()) ? currency.toUpperCase() : currencies[0]);
        }
      } catch {
        // The nickname flow must remain independent from the profile request.
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const loadNickname = async () => {
      setNicknameLoading(true);
      setNicknameError('');
      setDerivNickname('');

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch('/api/payment-agent/nickname', { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok) {
          const code = payload?.code ? ' [' + String(payload.code) + ']' : '';
          throw new Error(String(payload?.error || copy.nicknameError) + code);
        }

        const nickname = String(payload?.nickname || '').trim();
        if (!nickname) throw new Error(copy.nicknameMissing);
        setDerivNickname(nickname);
      } catch (error) {
        if (cancelled) return;
        setNicknameError(error instanceof Error ? error.message : copy.nicknameError);
      } finally {
        window.clearTimeout(timeout);
        if (!cancelled) setNicknameLoading(false);
      }
    };

    void loadProfile();
    void loadNickname();

    return () => {
      cancelled = true;
    };
  }, [open, currency, copy.nicknameError, copy.nicknameMissing]);

  const actionTitle = action === 'deposit' ? copy.deposit : action === 'withdraw' ? copy.withdraw : 'AI Analyst';
  const binanceFallback = action === 'ai_analyst' && !isPaymentAgentCurrencyAllowed(currency); 
  const limits = useMemo(
    () => agentCurrencies.find(item => String(item.currency || '').toUpperCase() === paymentCurrency.toUpperCase()),
    [agentCurrencies, paymentCurrency],
  );
  const minWithdraw = Number(limits?.withdrawal_minimum ?? 0);
  const maxWithdraw = Number(limits?.withdrawal_maximum ?? 0);

  useEffect(() => {
    if (!open || (action !== 'deposit' && action !== 'ai_analyst') || !requestId || !depositPaid) return;

    let cancelled = false;
    let timer: number | undefined;

    const refreshStatus = async () => {
      try {
        const response = await fetch(
          (binanceFallback ? '/api/ai-analyst/access' : '/api/payment-agent/deposit/status?request_id=' + encodeURIComponent(requestId)),
          {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache' },
          },
        );
        const payload: ApiResult = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;

        const status = binanceFallback ? (payload?.active ? 'payment_confirmed' : 'awaiting_payment') : String(payload.data?.status || '').toLowerCase();
        if (status === 'payment_confirmed') {
          setDepositStatus('payment_confirmed');
          setMessage(copy.accepted);
          onNotice?.(copy.accepted);
        } else if (status === 'rejected') {
          setDepositStatus('rejected');
          setMessage(copy.rejected);
          onNotice?.(copy.rejected);
        } else if (status === 'completed') {
          setDepositStatus('completed');
          setMessage(copy.depositSuccess);
          onNotice?.(copy.depositSuccess);
        } else if (status === 'failed') {
          setDepositStatus('failed');
          setMessage(copy.failed);
          onNotice?.(copy.failed);
        }

        if (status === 'payment_confirmed' || status === 'rejected' || status === 'completed' || status === 'failed') {
          if (timer) window.clearInterval(timer);
          return;
        }
      } catch {
        // Keep retrying while the request is pending.
      }
    };

    void refreshStatus();
    timer = window.setInterval(() => void refreshStatus(), 2000);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [open, action, requestId, depositPaid, binanceFallback, copy.accepted, copy.rejected, copy.depositSuccess, copy.failed, onNotice]);

  const BINANCE_USDT_ADDRESS = 'TYhiKauxruZ7Lux47nsgtq8R4j5jczRQeu';

  useEffect(() => {
    if (!open || action !== 'withdraw' || !requestId) return;

    let cancelled = false;
    let timer: number | undefined;

    const refreshWithdrawStatus = async () => {
      try {
        const response = await fetch(
          '/api/payment-agent/withdraw/status?request_id=' + encodeURIComponent(requestId),
          { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } },
        );
        const payload: ApiResult = await response.json().catch(() => ({}));
        if (!response.ok || cancelled) return;

        const status = String(payload.data?.status || '').toLowerCase();
        if (!status) return;

        const final = status === 'complete' || status === 'rejected' || status === 'failed';
        setMessage(actionTitle + ': ' + statusText(status, copy) + '.');
        onNotice?.(actionTitle + ': ' + statusText(status, copy) + '.');

        if (final && timer) {
          window.clearInterval(timer);
          timer = undefined;
        }
      } catch {
        // Keep retrying while the withdrawal is pending.
      }
    };

    void refreshWithdrawStatus();
    timer = window.setInterval(() => void refreshWithdrawStatus(), 2500);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
    };
  }, [open, action, requestId, actionTitle, language, onNotice]);

  if (!open || !action) return null;

  const showError = (text: string) => {
    setMessage(text);
    onNotice?.(text);
  };

  const paymentReady = supportedCurrencies.length > 0;

  const retryNickname = async () => {
    setNicknameLoading(true);
    setNicknameError('');
    setDerivNickname('');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('/api/payment-agent/nickname?retry=1', {
        cache: 'no-store',
        signal: controller.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const code = payload?.code ? ' [' + String(payload.code) + ']' : '';
        throw new Error(String(payload?.error || copy.nicknameError) + code);
      }
      const nickname = String(payload?.nickname || '').trim();
      if (!nickname) throw new Error(copy.nicknameMissing);
      setDerivNickname(nickname);
    } catch (error) {
      setNicknameError(error instanceof Error ? error.message : copy.nicknameError);
    } finally {
      window.clearTimeout(timeout);
      setNicknameLoading(false);
    }
  };
  const currencySupported = supportedCurrencies.includes(paymentCurrency.toUpperCase());

  const validate = () => {
    const value = parseMoney(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showError(copy.invalid);
      return false;
    }
    if ((action === 'deposit' || action === 'ai_analyst') && !derivNickname.trim()) {
      showError(copy.nicknameMissing);
      return false;
    }
    if (action !== 'ai_analyst' && !paymentReady) { showError(copy.loadingCurrencies); return false; }
    if (action !== 'ai_analyst' && !currencySupported) { showError(copy.unsupportedCurrency + ' (' + paymentCurrency + ')'); return false; }
    if (action === 'withdraw' && minWithdraw > 0 && value < minWithdraw) {
      showError(copy.minWithdraw + ' ' + minWithdraw.toFixed(2) + ' ' + paymentCurrency + '.');
      return false;
    }
    if (action === 'withdraw' && maxWithdraw > 0 && value > maxWithdraw) {
      showError(copy.maxWithdraw + ' ' + maxWithdraw.toFixed(2) + ' ' + paymentCurrency + '.');
      return false;
    }
    if (action === 'withdraw') {
      if (!/^\d{9,15}$/.test(paymentNumber.replace(/\s+/g,''))) { showError(copy.recipientNumber); return false; }
      if (paymentName.trim().length < 2) { showError(copy.recipientName); return false; }
    }
    return true;
  };

  const pollStatus = async (id: string) => {
    const endpoint = action === 'deposit'
      ? '/api/payment-agent/deposit/status?request_id=' + encodeURIComponent(id)
      : '/api/payment-agent/withdraw/status?request_id=' + encodeURIComponent(id);

    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        const payload: ApiResult = await response.json().catch(() => ({}));
        if (!response.ok) continue;
        const status = payload.data?.status;
        if (!status || status === 'pending') continue;
        const text = actionTitle + ': ' + statusText(status, copy) + '.';
        setMessage(text);
        onNotice?.(text);
        return;
      } catch {}
    }
  };

  const requestOtp = async () => {
    if (!validate()) return;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch('/api/payment-agent/withdraw/verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseMoney(amount), currency: paymentCurrency }),
      });
      const payload: ApiResult = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || copy.sent);
      setStep('otp');
      setMessage(copy.sent);
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.sent);
    } finally {
      setBusy(false);
    }
  };

  const markDepositPaid = async () => {
    if (!requestId || depositPaid) return;
    setBusy(true);
    try {
      const response = await fetch(binanceFallback ? '/api/payment-agent/deposit/mark-paid?request_id=' + encodeURIComponent(requestId) : '/api/payment-agent/deposit/mark-paid', {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ requestId }),
      });
      const payload: ApiResult = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || copy.failed);
      setDepositPaid(true);
      setDepositStatus('client_marked_paid');
      setMessage(copy.paymentMarked);
      onNotice?.(copy.paymentMarked);
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.failed);
    } finally { setBusy(false); }
  };

  const execute = async () => {
    if (!validate()) return;
    if (action === 'withdraw' && !/^\d{6}$/.test(code)) {
      showError(copy.codeDigits);
      return;
    }
    setBusy(true);
    setMessage('');
    setAuthExpired(false);
    try {
      const endpoint = action === 'deposit' ? '/api/payment-agent/deposit' : action === 'withdraw' ? '/api/payment-agent/withdraw' : '/api/ai-analyst/purchase';
      const body = action === 'deposit'
        ? { amount: parseMoney(amount), currency: paymentCurrency, paymentMethod }
        : action === 'withdraw'
          ? { amount: parseMoney(amount), currency: paymentCurrency, verificationCode: code, paymentMethod, paymentNumber, paymentName }
          : { paymentMethod: binanceFallback ? 'binance_usdt_trc20' : paymentMethod };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: ApiResult = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (action === 'withdraw' && (payload.code === 'DERIV_REAUTH_REQUIRED' || response.status === 401)) {
          setAuthExpired(true);
          throw new Error(copy.authExpired);
        }
        throw new Error(payload.error || copy.failed);
      }

      setAuthExpired(false);
      const id = String(payload.requestId || '');
      const status = payload.data?.status || 'pending';
      setRequestId(id);
      setStep('result');
      setMessage(actionTitle + ': ' + statusText(status, copy) + '.');

    } catch (error) {
      showError(error instanceof Error ? error.message : copy.failed);
    } finally {
      setBusy(false);
    }
  };

  const reauthenticate = () => {
    try {
      sessionStorage.setItem('mozhyper_payment_agent_draft', JSON.stringify({
        action,
        amount,
        paymentCurrency,
        paymentMethod,
        paymentNumber,
        paymentName,
        savedAt: Date.now(),
      }));
    } catch {}
    const returnTo = '/?paymentAgent=' + encodeURIComponent(action || 'withdraw');
    window.location.assign('/api/auth/login?return_to=' + encodeURIComponent(returnTo));
  };

  const primary = step === 'otp'
    ? copy.confirmWithdraw
    : step === 'confirm'
      ? (action === 'deposit' ? copy.confirmDeposit : copy.sendCode)
      : copy.continue;

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,.62)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-agent-title"
        style={{ width:'min(430px,100%)', maxHeight:'calc(100vh - 24px)', overflowY:'auto', WebkitOverflowScrolling:'touch', borderRadius:20, background:light?'#fff':'#171c24', color:light?'#0f172a':'#fff', padding:20, boxShadow:'0 24px 70px rgba(0,0,0,.35)' }}
        onClick={event => event.stopPropagation()}
      >
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
          <div>
            <div id="payment-agent-title" style={{ fontSize:19, fontWeight:900 }}>{actionTitle}</div>
            <div style={{ fontSize:11, opacity:.62, marginTop:2 }}>Forex Moçambique · {copy.paymentAgent}</div>
          </div>
          <button type="button" disabled={busy} onClick={onClose} aria-label={copy.close}
            style={{ border:0, background:'transparent', color:'inherit', fontSize:24, lineHeight:1, cursor:'pointer' }}>×</button>
        </div>

        <div style={{ fontSize:12, lineHeight:1.45, marginTop:16, padding:12, borderRadius:12, background:light?'#f1f5f9':'#202733' }}>
          {action === 'deposit' ? copy.depositInfo : copy.withdrawInfo}
        </div>

        {(action === 'deposit' || action === 'ai_analyst') && requestId && <div style={{ marginTop:14, padding:14, borderRadius:14, border:'2px solid #ff4654', background:light?'#fff7f7':'#2a1114', boxShadow:'0 8px 24px rgba(255,70,84,.12)' }}>
          <div style={{ fontSize:11, textTransform:'uppercase', fontWeight:900, color:'#ff4654' }}>{binanceFallback ? 'BINANCE USDT' : copy.paymentInstructionsTitle}</div>
          {binanceFallback ? <>
            <div style={{ marginTop:8, fontSize:12, fontWeight:800 }}>Pague <b>3 USDT</b> usando exclusivamente a rede <b>TRON (TRC20)</b>.</div>
            <div style={{ marginTop:10, fontSize:10, opacity:.7 }}>Endereço Binance USDT:</div>
            <div style={{ marginTop:5, padding:10, borderRadius:10, background:light?'#fff':'#111827', fontSize:11, fontWeight:900, wordBreak:'break-all' }}>{BINANCE_USDT_ADDRESS}</div>
            <button type="button" onClick={()=>navigator.clipboard?.writeText(BINANCE_USDT_ADDRESS)} style={{ width:'100%', marginTop:8, padding:10, border:0, borderRadius:10, background:'#f3ba2f', color:'#111827', fontWeight:900 }}>Copiar endereço</button>
            <div style={{ marginTop:9, fontSize:11, lineHeight:1.45, opacity:.78 }}>Depois de enviar exatamente 3 USDT, clique em “JÁ PAGUEI”. O agente verifica o recebimento na Binance antes de ativar o AI Analyst.</div>
          </> : <>
            <div style={{ marginTop:8, fontSize:12, fontWeight:800 }}>{copy.paymentInstructions}</div>
            <div style={{ marginTop:10, display:'grid', gap:6, fontSize:13 }}>
              <div><b>{copy.paymentMethod}:</b> {paymentMethod === 'mpesa' ? copy.mpesa : copy.emola}</div>
              <div><b>{copy.recipientNumber}:</b> <span style={{ fontSize:17, fontWeight:900 }}>{paymentMethod === 'mpesa' ? '84 908 4091' : '87 908 4091'}</span></div>
              <div><b>{copy.recipientName}:</b> Mistério João</div>
              <div><b>{copy.exchangeRate}:</b> 1 USD = 80 MZN</div>
              <div style={{ marginTop:4, padding:'9px 10px', borderRadius:10, background:light?'#fff':'#111827', fontSize:15, fontWeight:900 }}>{copy.transferAmount}: {((parseMoney(amount) || 0) * 80).toFixed(2)} MZN</div>
            </div>
            <div style={{ marginTop:9, fontSize:11, lineHeight:1.45, opacity:.78 }}>{copy.alreadyPaid}</div>
          </>}
        </div>}

        {authExpired && (
          <div style={{ marginTop:14, padding:12, borderRadius:12, border:'1px solid #fca5a5', background:light?'#fff1f2':'#3f1d24', color:light?'#991b1b':'#fecaca' }}>
            <div style={{ fontSize:12, fontWeight:800, lineHeight:1.45 }}>{copy.authExpired}</div>
            <button type="button" onClick={reauthenticate} style={{ marginTop:10, width:'100%', padding:'11px 12px', border:0, borderRadius:10, background:'#ff444f', color:'#fff', fontWeight:900, cursor:'pointer' }}>
              {copy.reauthenticate}
            </button>
          </div>
        )}

        {step === 'form' && <>
          {(action === 'deposit' || action === 'ai_analyst') && <div style={{ marginTop:14, padding:12, borderRadius:11, border:'1px solid #cbd5e1', background:light?'#f8fafc':'#111827' }}>
            <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.account}</div>
            <div style={{ marginTop:4, fontSize:13, fontWeight:900 }}>
              {nicknameLoading ? copy.fetching : derivNickname || copy.nicknameError}
            </div>
            {nicknameError && (
              <div style={{ marginTop:6, fontSize:10, lineHeight:1.4, color:light ? '#b91c1c' : '#fca5a5' }}>
                {nicknameError}
                <button type="button" onClick={() => void retryNickname()} disabled={nicknameLoading}
                  style={{ marginLeft:8, border:0, background:'transparent', color:'inherit', textDecoration:'underline', cursor:nicknameLoading?'default':'pointer', fontWeight:900 }}>
                  {nicknameLoading ? copy.processing : copy.retry}
                </button>
              </div>
            )}
            <div style={{ marginTop:4, fontSize:10, opacity:.62 }}>{copy.accountHelp}</div>
          </div>}
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.currency}</div>
            {supportedCurrencies.length > 1 ? <select value={paymentCurrency} onChange={event=>setPaymentCurrency(event.target.value)} style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:800 }}>
              {supportedCurrencies.map(code=><option key={code} value={code}>{code}</option>)}
            </select> : <div style={{ marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #cbd5e1', background:light?'#f8fafc':'#111827', fontWeight:900 }}>{supportedCurrencies[0] || copy.fetching}</div>}
          </div>
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.paymentMethod}</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:8 }}>
              <button type="button" onClick={()=>setPaymentMethod('mpesa')} aria-label={copy.mpesa}
                style={{ position:'relative', flex:1, height:112, padding:0, borderRadius:14, border: paymentMethod==='mpesa' ? '3px solid #fff' : '2px solid rgba(255,255,255,.55)', background:'#ed1b24', boxShadow: paymentMethod==='mpesa' ? '0 0 0 3px #ff4654, 0 10px 25px rgba(237,27,36,.28)' : '0 8px 20px rgba(0,0,0,.12)', cursor:'pointer', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <img src="/payment-agent/mpesa.svg" alt={copy.mpesa} style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} />
                {paymentMethod==='mpesa' && <span style={{ position:'absolute', top:7, right:7, width:26, height:26, borderRadius:'50%', background:'#fff', color:'#ed1b24', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:900 }}>✓</span>}
              </button>
              <button type="button" onClick={()=>setPaymentMethod('emola')} aria-label={copy.emola}
                style={{ position:'relative', flex:1, height:112, padding:0, borderRadius:14, border: paymentMethod==='emola' ? '3px solid #fff' : '2px solid rgba(255,255,255,.55)', background:'#f97824', boxShadow: paymentMethod==='emola' ? '0 0 0 3px #ff7a24, 0 10px 25px rgba(249,120,36,.28)' : '0 8px 20px rgba(0,0,0,.12)', cursor:'pointer', overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <img src="/payment-agent/emola.svg" alt={copy.emola} style={{ width:'100%', height:'100%', objectFit:'contain', display:'block' }} />
                {paymentMethod==='emola' && <span style={{ position:'absolute', top:7, right:7, width:26, height:26, borderRadius:'50%', background:'#fff', color:'#f97824', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:900 }}>✓</span>}
              </button>
            </div>
          </div>
          {action === 'withdraw' && <>
            <label style={{ display:'block', fontSize:12, fontWeight:800, marginTop:14 }}>{copy.recipientNumber}
              <input inputMode="numeric" value={paymentNumber} onChange={event=>setPaymentNumber(event.target.value.replace(/\D/g,'').slice(0,15))} placeholder="84xxxxxxxx" style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:800 }} />
            </label>
            <label style={{ display:'block', fontSize:12, fontWeight:800, marginTop:12 }}>{copy.recipientName}
              <input value={paymentName} onChange={event=>setPaymentName(event.target.value)} placeholder="Nome do titular" style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:800 }} />
            </label>
          </>}
          {action !== 'ai_analyst' ?           <label style={{ display:'block', fontSize:12, fontWeight:800, marginTop:14 }}>
            {copy.amount} ({paymentCurrency})
            <input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"
              style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:800 }} />
          </label> : <div style={{ marginTop:14, padding:13, borderRadius:11, border:'1px solid #ff4654', background:light?'#fff7f7':'#2a1114' }}><div style={{fontSize:10,textTransform:'uppercase',fontWeight:900,color:'#ff4654'}}>AI Analyst — assinatura mensal</div><div style={{marginTop:5,fontSize:18,fontWeight:950}}>$3 USD <span style={{fontSize:12,opacity:.7}}>ou 250 MZN</span></div><div style={{marginTop:4,fontSize:10,opacity:.7}}>Acesso por 30 dias após confirmação do Payment Agent.</div></div>}
          {action !== 'ai_analyst' && paymentCurrency === 'USD' && <div style={{ marginTop:8, fontSize:11, opacity:.72 }}>{copy.exchangeRate}: <b>{action === 'deposit' ? '1 USD = 80 MZN' : '1 USD = 68 MZN'}</b> · {copy.localAmount}: <b>{((parseMoney(amount) || 0) * (action === 'deposit' ? 80 : 68)).toFixed(2)} MZN</b></div>}
        </>}

        {step === 'confirm' && <>
          <style>{`@keyframes paymentConfirmBorderSpin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
          <div style={{ position:'relative', marginTop:16, padding:2, borderRadius:16, overflow:'hidden', isolation:'isolate', boxShadow:'0 0 18px rgba(255,70,84,.10)' }}>
            <span aria-hidden="true" style={{ position:'absolute', inset:'-70%', background:'conic-gradient(from 0deg, transparent 0deg, transparent 300deg, #ff4654 334deg, #ff1f3d 350deg, transparent 360deg)', animation:'paymentConfirmBorderSpin 2.4s linear infinite', zIndex:0 }} />
            <div style={{ position:'relative', zIndex:1, padding:14, borderRadius:14, background:light?'#f8fafc':'#111827' }}>
              <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.confirm}</div>
              {action === 'deposit' && <div style={{ marginTop:8, fontSize:13 }}><b>{copy.account}:</b> {derivNickname || '—'}</div>}
              <div style={{ marginTop:6, fontSize:15, fontWeight:900 }}>{Number.isFinite(parseMoney(amount)) ? parseMoney(amount).toFixed(2) : '0.00'} {paymentCurrency}</div>
              <div style={{ marginTop:10, fontSize:11, opacity:.7 }}>{action === 'withdraw' ? copy.withdrawWarning : copy.realWarning}</div>
              {action === 'deposit' && <div style={{ marginTop:10, fontSize:11, lineHeight:1.55 }}><b>{paymentMethod === 'mpesa' ? copy.mpesa : copy.emola}</b> · {paymentMethod === 'mpesa' ? '84 908 4091' : '87 908 4091'} · <b>Mistério João</b><br/>1 USD = 80 MZN<div style={{ marginTop:8, fontSize:14, fontWeight:900 }}>{copy.transferAmount} = {((parseMoney(amount) || 0) * 80).toFixed(2)} MZN</div></div>}
              {action === 'withdraw' && <div style={{ marginTop:10, fontSize:11, lineHeight:1.55 }}><b>{copy.withdrawalDestination}</b><div style={{ marginTop:5, fontSize:13, fontWeight:900 }}>{paymentMethod === 'mpesa' ? copy.mpesa : copy.emola} · {paymentNumber} · <b>{paymentName}</b></div><div style={{ marginTop:6 }}>1 USD = 68 MZN</div><div style={{ marginTop:8, fontSize:14, fontWeight:900 }}>{copy.amountToReceive} = {((parseMoney(amount) || 0) * 68).toFixed(2)} MZN</div></div>}
            </div>
          </div>
        </>}

        {step === 'otp' && <label style={{ display:'block', fontSize:12, fontWeight:800, marginTop:16 }}>
          {copy.code}
          <input autoFocus inputMode="numeric" maxLength={6} value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"
            style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:900, fontSize:20, letterSpacing:6, textAlign:'center' }} />
          <span style={{ display:'block', marginTop:6, fontSize:10, opacity:.62 }}>{copy.codeHelp}</span>
        </label>}

        {step === 'result' && action === 'deposit' && (depositStatus === 'payment_confirmed' || depositStatus === 'completed') ? (
          <div style={{ marginTop:16, padding:15, borderRadius:14, border:'1px solid #22c55e66', background:light?'#f0fdf4':'#052e16' }}>
            <div style={{ fontSize:11, textTransform:'uppercase', fontWeight:900 }}>{copy.operation}</div>
            <div style={{ marginTop:6, fontSize:14, fontWeight:900 }}>{message}</div>
            <div style={{ marginTop:7, fontSize:9, opacity:.65, wordBreak:'break-all' }}>{copy.request}: {requestId}</div>
            <div style={{ marginTop:10, fontSize:11, fontWeight:800 }}>{copy.accepted}</div>
          </div>
        ) : step === 'result' && action === 'ai_analyst' && depositStatus === 'payment_confirmed' ? (
          <div style={{ marginTop:16, padding:15, borderRadius:14, border:'1px solid #22c55e66', background:light?'#f0fdf4':'#052e16' }}>
            <div style={{ fontSize:11, textTransform:'uppercase', fontWeight:900 }}>AI Analyst</div>
            <div style={{ marginTop:6, fontSize:14, fontWeight:900 }}>Pagamento confirmado</div>
            <div style={{ marginTop:7, fontSize:11 }}>O AI Analyst está disponível por 30 dias.</div>
            <div style={{ marginTop:7, fontSize:9, opacity:.65, wordBreak:'break-all' }}>{copy.request}: {requestId}</div>
          </div>
        ) : step === 'result' ? (
          <div style={{ marginTop:16, padding:15, borderRadius:14, border:'1px solid #22c55e66', background:light?'#f0fdf4':'#052e16' }}>
            <div style={{ fontSize:11, textTransform:'uppercase', fontWeight:900 }}>{copy.operation}</div>
            <div style={{ marginTop:6, fontSize:14, fontWeight:900 }}>{message}</div>
            {requestId && <div style={{ marginTop:7, fontSize:9, opacity:.65, wordBreak:'break-all' }}>{copy.request}: {requestId}</div>}
            {(action === 'deposit' || action === 'ai_analyst') && !depositPaid && requestId && <button type="button" disabled={busy} onClick={()=>void markDepositPaid()} style={{ width:'100%', marginTop:14, padding:13, border:0, borderRadius:11, background:'#ff4654', color:'#fff', fontWeight:900 }}>{busy ? copy.processing : copy.alreadyPaid}</button>}
            {(action === 'deposit' || action === 'ai_analyst') && depositPaid && <div style={{ marginTop:10, fontSize:11, fontWeight:800 }}>
              {depositStatus === 'payment_confirmed' ? copy.accepted : depositStatus === 'rejected' ? copy.rejected : depositStatus === 'completed' ? copy.depositSuccess : depositStatus === 'failed' ? copy.failed : copy.awaitingAgent}
            </div>}
          </div>
        ) : null}

        {message && step !== 'result' && <div style={{ marginTop:12, padding:10, borderRadius:11, background:light?'#eff6ff':'#172554', fontSize:11 }}>{message}</div>}

        {step !== 'result' && <div style={{ display:'flex', gap:8, marginTop:16 }}>
          <button type="button" disabled={busy} onClick={step === 'form' ? onClose : () => setStep(step === 'otp' ? 'confirm' : 'form')}
            style={{ flex:1, padding:12, borderRadius:11, border:'1px solid #64748b', background:'transparent', color:'inherit', fontWeight:800 }}>
            {step === 'form' ? copy.cancel : copy.back}
          </button>
          <button type="button" disabled={busy} onClick={() => {
            if (step === 'form') {
              if (validate()) setStep('confirm');
            } else if (step === 'confirm') {
              if (action === 'withdraw') void requestOtp();
              else void execute();
            } else {
              void execute();
            }
          }} style={{ flex:1, padding:12, border:0, borderRadius:11, background:'#ff4654', color:'#fff', fontWeight:900 }}>
            {busy ? copy.processing : primary}
          </button>
        </div>}

        {step === 'result' && <button type="button" onClick={onClose}
          style={{ width:'100%', marginTop:16, padding:12, borderRadius:11, border:'1px solid #64748b', background:'transparent', color:'inherit', fontWeight:800 }}>
          {copy.closeWindow}
        </button>}
      </div>
    </div>
  );
}

