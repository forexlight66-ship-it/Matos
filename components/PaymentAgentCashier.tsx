'use client';

import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

type Action = 'deposit' | 'withdraw';
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
  sendCode:string; confirmWithdraw:string; operation:string; confirm:string; realWarning:string;
  code:string; codeHelp:string; accountHelp:string; fetching:string; closeWindow:string; currency:string; loadingCurrencies:string; unsupportedCurrency:string;
  invalid:string; nicknameMissing:string; codeDigits:string; sent:string;
  minWithdraw:string; maxWithdraw:string; depositInfo:string; withdrawInfo:string;
  depositSuccess:string; withdrawSuccess:string; pending:string; complete:string; rejected:string;
  failed:string; accepted:string; request:string; realOperation:string;
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
  if (status === 'complete') return copy.complete;
  if (status === 'pending') return copy.pending;
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
        confirm:'Confirm operation', realWarning:'Check the details. Confirmation sends a real operation to the Payment Agent.',
        code:'Verification code', codeHelp:'The code matches exactly the requested amount.',
        accountHelp:'The deposit will be sent exclusively to this authenticated account.', fetching:'Loading…', closeWindow:'Close',
        invalid:'Please enter a valid amount.', nicknameMissing:'The authenticated Deriv account nickname is unavailable.',
        codeDigits:'The code must contain exactly 6 digits.', sent:'Verification code sent to the contact registered with Deriv.',
        minWithdraw:'The minimum withdrawal is', maxWithdraw:'The maximum withdrawal is',
        depositInfo:'The Payment Agent sends the deposit directly to your Deriv Wallet. Check the details before sending.',
        withdrawInfo:'The withdrawal moves funds from your Deriv Wallet to the Payment Agent and requires a one-time security code.',
        depositSuccess:'Deposit accepted.', withdrawSuccess:'Withdrawal accepted.', pending:'Pending', complete:'Completed',
        rejected:'Rejected', failed:'Failed', accepted:'Accepted', request:'Request', realOperation:'This is a real financial operation.', currency:'Currency', loadingCurrencies:'Loading Payment Agent currencies…', unsupportedCurrency:'This currency is not supported by the Payment Agent.'
      }
    : language === 'es'
      ? {
          deposit:'Depositar', withdraw:'Retirar', paymentAgent:'Agente de pagos 503', close:'Cerrar', account:'Cuenta Deriv', amount:'Importe',
          processing:'Procesando…', continue:'Continuar', back:'Volver', cancel:'Cancelar', confirmDeposit:'Confirmar depósito',
          sendCode:'Enviar código', confirmWithdraw:'Confirmar retiro', operation:'Estado de la operación',
          confirm:'Confirmar operación', realWarning:'Verifica los datos. La confirmación envía una operación real al agente de pagos.',
          code:'Código de verificación', codeHelp:'El código corresponde exactamente al importe solicitado.',
          accountHelp:'El depósito se enviará exclusivamente a esta cuenta autenticada.', fetching:'Cargando…', closeWindow:'Cerrar',
          invalid:'Introduce un importe válido.', nicknameMissing:'No se encontró el nickname de la cuenta Deriv autenticada.',
          codeDigits:'El código debe tener exactamente 6 dígitos.', sent:'Código enviado al contacto registrado en Deriv.',
          minWithdraw:'El retiro mínimo es', maxWithdraw:'El retiro máximo es',
          depositInfo:'El agente de pagos envía el depósito directamente a tu Wallet Deriv. Comprueba los datos antes de enviar.',
          withdrawInfo:'El retiro mueve fondos de tu Wallet Deriv al agente de pagos y requiere un código de seguridad de un solo uso.',
          depositSuccess:'Depósito aceptado.', withdrawSuccess:'Retiro aceptado.', pending:'Pendiente', complete:'Completado',
          rejected:'Rechazado', failed:'Fallido', accepted:'Aceptado', request:'Solicitud', realOperation:'Esta es una operación financiera real.', currency:'Moneda', loadingCurrencies:'Cargando monedas del agente…', unsupportedCurrency:'Esta moneda no es compatible con el agente de pagos.'
        }
      : {
          deposit:'Depositar', withdraw:'Levantar', paymentAgent:'Payment Agent 503', close:'Fechar', account:'Conta Deriv', amount:'Valor',
          processing:'A processar…', continue:'Continuar', back:'Voltar', cancel:'Cancelar', confirmDeposit:'Confirmar depósito',
          sendCode:'Enviar código', confirmWithdraw:'Confirmar levantamento', operation:'Estado da operação',
          confirm:'Confirmar operação', realWarning:'Verifique os dados. A confirmação envia uma operação real ao Payment Agent.',
          code:'Código de verificação', codeHelp:'O código corresponde exatamente ao valor solicitado.',
          accountHelp:'O depósito será enviado exclusivamente para esta conta autenticada.', fetching:'A obter…', closeWindow:'Fechar',
          invalid:'Informe um valor válido.', nicknameMissing:'A conta Deriv autenticada não disponibilizou o nickname.',
          codeDigits:'O código deve ter exatamente 6 dígitos.', sent:'Código enviado para o contacto registado na Deriv.',
          minWithdraw:'O mínimo para levantamento é', maxWithdraw:'O máximo para levantamento é',
          depositInfo:'O Payment Agent envia o depósito diretamente para a sua Wallet Deriv. Confirme os dados antes de enviar.',
          withdrawInfo:'O levantamento move fundos da sua Wallet Deriv para o Payment Agent e requer um código de segurança único.',
          depositSuccess:'Depósito aceite.', withdrawSuccess:'Levantamento aceite.', pending:'Pendente', complete:'Concluída',
          rejected:'Rejeitada', failed:'Falhou', accepted:'Aceite', request:'Pedido', realOperation:'Esta é uma operação financeira real.', currency:'Moeda', loadingCurrencies:'A carregar moedas do Payment Agent…', unsupportedCurrency:'Esta moeda não é suportada pelo Payment Agent.'
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

  useEffect(() => {
    if (!open || !action) return;
    setStep('form');
    setAmount('');
    setCode('');
    setBusy(false);
    setMessage('');
    setRequestId('');
    setDerivNickname('');
    setSupportedCurrencies([]);
    setPaymentCurrency(currency);
  }, [open, action, currency]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      fetch('/api/payment-agent/profile', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
      fetch('/api/payment-agent/nickname', { cache: 'no-store' }).then(r => r.ok ? r.json() : null),
    ]).then(([profile, nickname]) => {
      if (cancelled) return;
      const currencies = Array.isArray(profile?.supportedCurrencies)
        ? profile.supportedCurrencies.map((value: unknown) => String(value).toUpperCase())
        : Array.isArray(profile?.data?.currencies)
          ? profile.data.currencies.map((item: any) => String(item?.currency || item).toUpperCase())
          : [];
      setSupportedCurrencies([...new Set(currencies.filter(Boolean))]);
      setAgentCurrencies(Array.isArray(profile?.data?.currencies) ? profile.data.currencies : []);
      if (currencies.length) setPaymentCurrency(currencies.includes(currency.toUpperCase()) ? currency.toUpperCase() : currencies[0]);
      if (nickname?.nickname) setDerivNickname(String(nickname.nickname));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [open]);

  const limits = useMemo(
    () => agentCurrencies.find(item => String(item.currency || '').toUpperCase() === paymentCurrency.toUpperCase()),
    [agentCurrencies, paymentCurrency],
  );
  const minWithdraw = Number(limits?.withdrawal_minimum ?? 0);
  const maxWithdraw = Number(limits?.withdrawal_maximum ?? 0);

  if (!open || !action) return null;

  const showError = (text: string) => {
    setMessage(text);
    onNotice?.(text);
  };

  const actionTitle = action === 'deposit' ? copy.deposit : copy.withdraw;
  const paymentReady = supportedCurrencies.length > 0;
  const currencySupported = supportedCurrencies.includes(paymentCurrency.toUpperCase());

  const validate = () => {
    const value = parseMoney(amount);
    if (!Number.isFinite(value) || value <= 0) {
      showError(copy.invalid);
      return false;
    }
    if (action === 'deposit' && !derivNickname.trim()) {
      showError(copy.nicknameMissing);
      return false;
    }
    if (!paymentReady) { showError(copy.loadingCurrencies); return false; }
    if (!currencySupported) { showError(copy.unsupportedCurrency + ' (' + paymentCurrency + ')'); return false; }
    if (action === 'withdraw' && minWithdraw > 0 && value < minWithdraw) {
      showError(copy.minWithdraw + ' ' + minWithdraw.toFixed(2) + ' ' + paymentCurrency + '.');
      return false;
    }
    if (action === 'withdraw' && maxWithdraw > 0 && value > maxWithdraw) {
      showError(copy.maxWithdraw + ' ' + maxWithdraw.toFixed(2) + ' ' + paymentCurrency + '.');
      return false;
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

  const execute = async () => {
    if (!validate()) return;
    if (action === 'withdraw' && !/^\d{6}$/.test(code)) {
      showError(copy.codeDigits);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const endpoint = action === 'deposit' ? '/api/payment-agent/deposit' : '/api/payment-agent/withdraw';
      const body = action === 'deposit'
        ? { amount: parseMoney(amount), currency: paymentCurrency }
        : { amount: parseMoney(amount), currency: paymentCurrency, verificationCode: code };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload: ApiResult = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || copy.failed);

      const id = String(payload.requestId || '');
      const status = payload.data?.status || 'pending';
      setRequestId(id);
      setStep('result');
      setMessage(actionTitle + ': ' + statusText(status, copy) + '.');
      if (status === 'pending' && id) void pollStatus(id);
    } catch (error) {
      showError(error instanceof Error ? error.message : copy.failed);
    } finally {
      setBusy(false);
    }
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
        style={{ width:'min(430px,100%)', maxHeight:'90vh', overflowY:'auto', borderRadius:20, background:light?'#fff':'#171c24', color:light?'#0f172a':'#fff', padding:20, boxShadow:'0 24px 70px rgba(0,0,0,.35)' }}
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

        {step === 'form' && <>
          {action === 'deposit' && <div style={{ marginTop:14, padding:12, borderRadius:11, border:'1px solid #cbd5e1', background:light?'#f8fafc':'#111827' }}>
            <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.account}</div>
            <div style={{ marginTop:4, fontSize:13, fontWeight:900 }}>{derivNickname || copy.fetching}</div>
            <div style={{ marginTop:4, fontSize:10, opacity:.62 }}>{copy.accountHelp}</div>
          </div>}
          <div style={{ marginTop:14 }}>
            <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.currency}</div>
            {supportedCurrencies.length > 1 ? <select value={paymentCurrency} onChange={event=>setPaymentCurrency(event.target.value)} style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:800 }}>
              {supportedCurrencies.map(code=><option key={code} value={code}>{code}</option>)}
            </select> : <div style={{ marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #cbd5e1', background:light?'#f8fafc':'#111827', fontWeight:900 }}>{supportedCurrencies[0] || copy.fetching}</div>}
          </div>
          <label style={{ display:'block', fontSize:12, fontWeight:800, marginTop:14 }}>
            {copy.amount} ({paymentCurrency})
            <input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00"
              style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'12px 13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:800 }} />
          </label>
        </>}

        {step === 'confirm' && <div style={{ marginTop:16, padding:14, borderRadius:14, border:'1px solid #cbd5e1', background:light?'#f8fafc':'#111827' }}>
          <div style={{ fontSize:10, textTransform:'uppercase', opacity:.6, fontWeight:900 }}>{copy.confirm}</div>
          {action === 'deposit' && <div style={{ marginTop:8, fontSize:13 }}><b>{copy.account}:</b> {derivNickname || '—'}</div>}
          <div style={{ marginTop:6, fontSize:15, fontWeight:900 }}>{Number.isFinite(parseMoney(amount)) ? parseMoney(amount).toFixed(2) : '0.00'} {paymentCurrency}</div>
          <div style={{ marginTop:10, fontSize:11, opacity:.7 }}>{copy.realWarning}</div>
        </div>}

        {step === 'otp' && <label style={{ display:'block', fontSize:12, fontWeight:800, marginTop:16 }}>
          {copy.code}
          <input autoFocus inputMode="numeric" maxLength={6} value={code}
            onChange={event => setCode(event.target.value.replace(/\D/g,'').slice(0,6))} placeholder="000000"
            style={{ width:'100%', boxSizing:'border-box', marginTop:6, padding:'13px', borderRadius:11, border:'1px solid #94a3b8', background:light?'#fff':'#111827', color:'inherit', fontWeight:900, fontSize:20, letterSpacing:6, textAlign:'center' }} />
          <span style={{ display:'block', marginTop:6, fontSize:10, opacity:.62 }}>{copy.codeHelp}</span>
        </label>}

        {step === 'result' && <div style={{ marginTop:16, padding:15, borderRadius:14, border:'1px solid #22c55e66', background:light?'#f0fdf4':'#052e16' }}>
          <div style={{ fontSize:11, textTransform:'uppercase', fontWeight:900, opacity:.7 }}>{copy.operation}</div>
          <div style={{ marginTop:6, fontSize:14, fontWeight:900 }}>{message}</div>
          {requestId && <div style={{ marginTop:7, fontSize:9, opacity:.65, wordBreak:'break-all' }}>{copy.request}: {requestId}</div>}
        </div>}

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
