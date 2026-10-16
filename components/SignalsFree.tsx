'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const GROUP_URL = 'https://t.me/+S4A_5SgZB6x4P_UQ';
const AMY_MESSAGE = 'Hello, I already have a Deriv account and would like to change my IB partner to this referral link: https://t.deriv.link?t=7D4QKG8Y5W88 Please assist with retagging.';

type Step = 'start' | 'amy' | 'payment' | 'payment_instructions' | 'waiting' | 'active' | 'legacy';
type LegacyRequest = { id: number | string; mt5_id: string; deriv_client_id?: string | null; status: 'pending' | 'approved' | 'rejected'; created_at?: string } | null;
type Onboarding = {
  deriv_nickname: string;
  status: string;
  amyProofUploaded: boolean;
  amyMessageSentAt?: string | null;
  paymentRequestId?: string | null;
  activatedAt?: string | null;
} | null;
type PaymentInfo = {
  requestId: string;
  status: string;
  paymentMethod: string;
  paymentNumber: string;
  paymentName: string;
  amountMzn: number;
  amountUsdt: number;
  cryptoAddress: string;
  cryptoNetwork: string;
  mt5Id?: string;
  eligibleForLocalPayment?: boolean;
} | null;

function formatPaymentStatus(status: string, en: boolean) {
  if (status === 'payment_confirmed' || status === 'completed') return en ? 'Payment confirmed' : 'Pagamento confirmado';
  if (status === 'client_marked_paid') return en ? 'Waiting for MozHyper confirmation' : 'A aguardar confirmação do MozHyper';
  if (status === 'rejected') return en ? 'Payment rejected' : 'Pagamento rejeitado';
  return en ? 'Awaiting payment' : 'A aguardar pagamento';
}

export default function SignalsFree({ light }: { light: boolean }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('start');
  const [onboarding, setOnboarding] = useState<Onboarding>(null);
  const [legacyRequest, setLegacyRequest] = useState<LegacyRequest>(null);
  const [eligibleForLocalPayment, setEligibleForLocalPayment] = useState(false);
  const [payment, setPayment] = useState<PaymentInfo>(null);
  const [paymentMethod, setPaymentMethod] = useState<'mpesa' | 'emola'>('mpesa');
  const [payerName, setPayerName] = useState('');
  const [payerNumber, setPayerNumber] = useState('');
  const [amyFile, setAmyFile] = useState<File | null>(null);
  const [paymentProof, setPaymentProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [proofVersion, setProofVersion] = useState(Date.now());

  const applyServerState = useCallback((data: any) => {
    const currentOnboarding: Onboarding = data?.onboarding || null;
    const legacy: LegacyRequest = data?.request || null;
    const currentPayment: PaymentInfo = data?.payment || null;
    setOnboarding(currentOnboarding);
    setLegacyRequest(legacy);
    setEligibleForLocalPayment(Boolean(data?.eligibleForLocalPayment));
    setPayment(currentPayment);

    if (currentOnboarding?.status === 'active') {
      setStep('active');
      setNotice('');
      return;
    }
    if (legacy?.status === 'approved') {
      setStep('active');
      setNotice(en ? 'Your previous Signal Unlimited request is approved.' : 'O seu pedido anterior do Signal Unlimited foi aprovado.');
      return;
    }
    if (currentPayment) {
      setStep(currentPayment.status === 'client_marked_paid' ? 'waiting' : 'payment_instructions');
      setNotice('');
      return;
    }
    if (currentOnboarding?.status === 'verification_required') {
      setStep('amy');
      setNotice(currentOnboarding.amyProofUploaded
        ? (en ? 'You already sent the Ask Amy message. No need to send it again; your saved screenshot will be reused.' : 'Já enviou a mensagem para Ask Amy. Não precisa de a enviar novamente; vamos reutilizar o screenshot guardado.')
        : '');
      return;
    }
    if (currentOnboarding?.status === 'ready_for_payment') {
      if (currentOnboarding.amyProofUploaded) {
        setStep('amy');
        setNotice(en
          ? 'You already sent the message to Ask Amy. You do not need to send it again or upload another screenshot; MozHyper will reuse the saved proof.'
          : 'Já enviou a mensagem para Ask Amy. Não precisa de a enviar novamente nem de carregar outro screenshot; o MozHyper reutilizará o comprovativo guardado.');
      } else {
        setStep('payment');
        setNotice('');
      }
      return;
    }
    if (legacy?.status === 'pending') {
      setStep('legacy');
      return;
    }
    setStep('start');
  }, [en]);

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/signals-free', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(String(data?.error || (en ? 'Could not load Signal Unlimited status.' : 'Não foi possível consultar o estado do Signal Unlimited.')));
        if (response.status === 401) setStep('start');
        return;
      }
      applyServerState(data);
    } catch {
      setError(en ? 'Connection error. Try again.' : 'Erro de ligação. Tente novamente.');
    }
  }, [applyServerState, en]);

  useEffect(() => {
    if (open) {
      setError('');
      void loadStatus();
    }
  }, [open, loadStatus]);

  useEffect(() => {
    if (!open || !payment?.requestId || step === 'active') return;
    if (!['awaiting_payment', 'client_marked_paid'].includes(payment.status)) return;

    let alive = true;
    const poll = async () => {
      try {
        const statusResponse = await fetch('/api/payment-agent/deposit/status?request_id=' + encodeURIComponent(payment.requestId), { cache: 'no-store' });
        const data = await statusResponse.json().catch(() => ({}));
        if (!alive || !statusResponse.ok) return;
        const status = String(data?.data?.status || '');
        if (status === 'payment_confirmed' || status === 'completed') {
          setPayment(current => current ? { ...current, status } : current);
          await loadStatus();
        } else if (status === 'rejected' || status === 'failed') {
          setError(en ? 'The payment was rejected. You can start a new payment request.' : 'O pagamento foi rejeitado. Pode iniciar um novo pedido de pagamento.');
          setPayment(null);
          setPaymentProof(null);
          setStep('payment');
          await loadStatus();
        } else if (status) {
          setPayment(current => current ? { ...current, status } : current);
          if (status === 'client_marked_paid') setStep('waiting');
        }
      } catch {}
    };

    const timer = window.setInterval(() => { void poll(); }, 10000);
    void poll();
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [open, payment?.requestId, payment?.status, step, loadStatus, en]);

  const submitVerification = async () => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const response = await fetch('/api/signals-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || (en ? 'Verification failed.' : 'A verificação falhou.')));
      if (data?.onboarding) {
        setOnboarding({
          ...data.onboarding,
          amyProofUploaded: Boolean(data?.amyProofUploaded ?? data.onboarding?.amyProofUploaded),
        });
      }
      if (data?.eligibleForLocalPayment !== undefined) setEligibleForLocalPayment(Boolean(data.eligibleForLocalPayment));
      if (data?.nextStep === 'amy_verification') {
        setStep('amy');
        setNotice(data?.alreadySentToAmy
          ? (en ? 'You already sent the message to Ask Amy. Do not send it again; your previous screenshot is saved.' : 'Já enviou a mensagem para Ask Amy. Não volte a enviá-la; o screenshot anterior está guardado.')
          : '');
      } else if (data?.nextStep === 'payment') {
        setStep('payment');
        setNotice(data?.amyProofUploaded
          ? (en ? 'Your previously uploaded Ask Amy screenshot is saved and will be reused.' : 'O screenshot anterior do Ask Amy está guardado e será reutilizado.')
          : '');
      } else if (data?.nextStep === 'payment_instructions' && data?.payment) {
        setPayment(data.payment);
        setStep(data.payment.status === 'client_marked_paid' ? 'waiting' : 'payment_instructions');
      } else if (data?.nextStep === 'active') {
        setStep('active');
      } else {
        setStep('start');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : (en ? 'Verification failed.' : 'A verificação falhou.'));
    } finally {
      setBusy(false);
    }
  };

  const copyAmyMessage = async () => {
    try {
      await navigator.clipboard.writeText(AMY_MESSAGE);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError(en ? 'Could not copy automatically. Select and copy the message manually.' : 'Não foi possível copiar automaticamente. Selecione e copie a mensagem manualmente.');
    }
  };

  const uploadAmyProof = async () => {
    if (!amyFile) {
      setError(en ? 'Choose a screenshot first.' : 'Escolha primeiro o screenshot.');
      return;
    }
    if (amyFile.size > 5 * 1024 * 1024) {
      setError(en ? 'The screenshot must be 5 MB or smaller.' : 'O screenshot deve ter no máximo 5 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('screenshot', amyFile);
      const response = await fetch('/api/signals-free/amy-proof', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || (en ? 'Could not save the screenshot.' : 'Não foi possível guardar o screenshot.')));
      setOnboarding(current => current ? { ...current, amyProofUploaded: true, status: String(data.status || 'ready_for_payment') } : current);
      setAmyFile(null);
      setProofVersion(Date.now());
      setNotice(en ? 'Screenshot saved. You will not need to send the Ask Amy message again.' : 'Screenshot guardado. Não precisará de voltar a enviar a mensagem para Ask Amy.');
    } catch (e) {
      setError(e instanceof Error ? e.message : (en ? 'Could not save the screenshot.' : 'Não foi possível guardar o screenshot.'));
    } finally {
      setBusy(false);
    }
  };

  const createPayment = async () => {
    setError('');
    if (eligibleForLocalPayment) {
      if (payerName.trim().length < 2) {
        setError(en ? 'Enter the payer name.' : 'Introduza o nome usado no pagamento.');
        return;
      }
      if (!/^\d{9,15}$/.test(payerNumber.replace(/\D/g, ''))) {
        setError(en ? 'Enter a valid M-Pesa/e-Mola phone number.' : 'Introduza um número M-Pesa/e-Mola válido.');
        return;
      }
    }
    setBusy(true);
    try {
      const response = await fetch('/api/signals-free/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentMethod: eligibleForLocalPayment ? paymentMethod : 'binance_usdt_trc20',
          payerName: eligibleForLocalPayment ? payerName.trim() : undefined,
          payerNumber: eligibleForLocalPayment ? payerNumber.replace(/\D/g, '') : undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || (en ? 'Could not create the payment request.' : 'Não foi possível criar o pedido de pagamento.')));
      if (data?.nextStep === 'active') {
        setStep('active');
        return;
      }
      if (!data?.payment) throw new Error(en ? 'Payment instructions were not returned.' : 'As instruções de pagamento não foram devolvidas.');
      setPayment(data.payment);
      setPaymentProof(null);
      setStep(data.payment.status === 'client_marked_paid' ? 'waiting' : 'payment_instructions');
      setNotice('');
    } catch (e) {
      setError(e instanceof Error ? e.message : (en ? 'Could not create the payment request.' : 'Não foi possível criar o pedido de pagamento.'));
    } finally {
      setBusy(false);
    }
  };

  const markAsPaid = async () => {
    if (!payment?.requestId) return;
    if (!paymentProof) {
      setError(en ? 'Upload the payment screenshot first.' : 'Envie primeiro o screenshot do pagamento.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('requestId', payment.requestId);
      form.append('paymentProof', paymentProof);
      const response = await fetch('/api/payment-agent/deposit/mark-paid?request_id=' + encodeURIComponent(payment.requestId), {
        method: 'POST',
        body: form,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(data?.error || (en ? 'Could not submit payment proof.' : 'Não foi possível enviar o comprovativo do pagamento.')));
      setPayment(current => current ? { ...current, status: String(data.status || 'client_marked_paid') } : current);
      setPaymentProof(null);
      setStep('waiting');
      setNotice(en ? 'Payment proof sent. Wait for MozHyper 503 to confirm.' : 'Comprovativo enviado. Aguarde a confirmação do MozHyper 503.');
    } catch (e) {
      setError(e instanceof Error ? e.message : (en ? 'Could not submit payment proof.' : 'Não foi possível enviar o comprovativo do pagamento.'));
    } finally {
      setBusy(false);
    }
  };

  const actionButtonStyle = (disabled = false): React.CSSProperties => ({
    width: '100%',
    marginTop: 12,
    padding: '12px 14px',
    border: 0,
    borderRadius: 11,
    background: disabled ? '#94a3b8' : '#ef233c',
    color: '#fff',
    fontWeight: 900,
    fontSize: 12,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
  });

  const buttonStyle: React.CSSProperties = {
    border: '1px solid #94a3b8',
    borderRadius: 10,
    padding: '10px 12px',
    background: 'transparent',
    color: 'inherit',
    fontWeight: 800,
    fontSize: 11,
  };

  const errorBox = error ? <div role="alert" className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-500">{error}</div> : null;
  const previousProofUrl = '/api/signals-free/amy-proof?v=' + proofVersion;
  const paymentIsCrypto = payment?.paymentMethod === 'binance_usdt_trc20';

  return <>
    <button
      type="button"
      className="icon-btn signals-free-trigger"
      onClick={() => { setOpen(true); setError(''); }}
      aria-label="Signal Unlimited"
      title="Signal Unlimited"
      style={{ width: 30, height: 30, padding: 0, borderRadius: 9, overflow: 'hidden', border: '1px solid #3f8c43', background: 'linear-gradient(145deg,#087ec2,#07519b)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <img src="/signals-free.svg" alt="" width="30" height="30" style={{ display: 'block', width: '30px', height: '30px', objectFit: 'cover' }} />
    </button>

    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signals-free-title" onClick={e => e.stopPropagation()} style={{ width: 'min(94vw,460px)', maxHeight: '90vh', overflowY: 'auto', borderColor: '#2c9c55', background: light ? '#fff' : '#0d2347', color: light ? '#0f172a' : '#f8fafc' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><span style={{ fontSize: 24 }}>🔴</span><b id="signals-free-title">Signal Unlimited</b></div>
          <button type="button" onClick={() => setOpen(false)} aria-label={en ? 'Close' : 'Fechar'}>✕</button>
        </div>

        {step === 'start' && <>
          <div className="mt-4 rounded-xl border border-blue-400/40 bg-blue-500/10 p-4">
            <b className="text-sm">{en ? 'Automatic Deriv verification' : 'Verificação automática pela Deriv'}</b>
            <p className="mt-2 text-xs leading-5">{en ? 'MozHyper will use your connected Deriv account to check automatically whether you are tagged to our partner. No MT5 ID or email is required.' : 'O MozHyper utilizará a sua conta Deriv ligada para verificar automaticamente se está associado ao nosso parceiro. Não precisa de ID MT5 nem de email.'}</p>
          </div>
          {errorBox}
          <button type="button" disabled={busy} onClick={() => void submitVerification()} style={actionButtonStyle(busy)}>{busy ? (en ? 'Checking Deriv account…' : 'A verificar a conta Deriv…') : (en ? 'Verify Deriv account' : 'Verificar conta Deriv')}</button>
        </>}

        {step === 'amy' && <>
          <div className="mt-4 rounded-xl border border-amber-400/60 bg-amber-500/10 p-3">
            <b className="text-sm">{en ? 'Action required in Deriv' : 'É necessária uma ação na Deriv'}</b>
            <p className="mt-2 text-xs leading-5">{en ? 'We could not confirm that your Deriv identity is directly tagged to this partner. Open Deriv, start a chat with Ask Amy, copy the message below and send it. Then upload a screenshot showing the message you sent.' : 'Não foi possível confirmar que a sua identidade Deriv está diretamente associada a este parceiro. Abra a Deriv, inicie uma conversa com Ask Amy, copie a mensagem abaixo e envie-a. Depois carregue um screenshot que mostre a mensagem enviada.'}</p>
          </div>

          {onboarding?.amyProofUploaded
            ? <div className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                <b className="text-xs text-red-600">{en ? 'Already sent to Ask Amy' : 'Já enviou a mensagem para Ask Amy'}</b>
                <p className="mt-1 text-xs">{en ? 'You do not need to send the message again. MozHyper has kept your previous screenshot and will reuse it.' : 'Não precisa de enviar a mensagem novamente. O MozHyper guardou o screenshot anterior e irá reutilizá-lo.'}</p>
                <img src={previousProofUrl} alt={en ? 'Previously uploaded Ask Amy screenshot' : 'Screenshot anterior enviado ao Ask Amy'} className="mt-3 w-full rounded-lg border border-slate-300/40 object-contain" style={{ maxHeight: 280 }} />
              </div>
            : <div className="mt-3 rounded-xl border border-slate-300/40 p-3">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-xs">{en ? 'Copy this message to Ask Amy' : 'Copie esta mensagem para Ask Amy'}</b>
                  <button type="button" onClick={() => void copyAmyMessage()} style={buttonStyle}>{copied ? (en ? 'Copied ✓' : 'Copiado ✓') : (en ? 'Copy message' : 'Copiar MSG')}</button>
                </div>
                <textarea readOnly value={AMY_MESSAGE} className="mt-3 w-full resize-none rounded-lg border border-slate-300/40 bg-transparent p-3 text-xs leading-5" rows={5} onFocus={e => e.currentTarget.select()} />
                <a href="https://deriv.com/" target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-lg border border-blue-400/50 p-3 text-center text-xs font-bold text-blue-500">{en ? 'Open Deriv and contact Ask Amy ↗' : 'Abrir a Deriv e contactar Ask Amy ↗'}</a>
                <label className="mt-4 block text-xs font-bold">{en ? 'Screenshot of the message sent to Ask Amy' : 'Screenshot da mensagem enviada ao Ask Amy'}
                  <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => setAmyFile(e.target.files?.[0] || null)} disabled={busy} className="mt-2 block w-full text-xs" />
                </label>
                {amyFile && <div className="mt-2 break-all text-[10px] muted">✓ {amyFile.name} · {(amyFile.size / 1024).toFixed(0)} KB</div>}
                <button type="button" disabled={busy || !amyFile} onClick={() => void uploadAmyProof()} style={actionButtonStyle(busy || !amyFile)}>{busy ? (en ? 'Saving screenshot…' : 'A guardar screenshot…') : (en ? 'Save screenshot' : 'Guardar screenshot')}</button>
              </div>
          }

          {notice && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs">{notice}</div>}
          {errorBox}
          <button type="button" disabled={busy || !onboarding?.amyProofUploaded} onClick={() => { setError(''); setStep('payment'); }} style={actionButtonStyle(busy || !onboarding?.amyProofUploaded)}>{en ? 'Continue to payment' : 'Continuar para pagamento'}</button>
        </>}

        {step === 'payment' && <>
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
            <div className="text-[10px] font-black uppercase tracking-wide text-red-600">{en ? 'Unlimited package' : 'Pacote ilimitado'}</div>
            <div className="mt-1 text-2xl font-black">{eligibleForLocalPayment ? '250 MT' : '3 USDT'}</div>
            <p className="mt-1 text-xs">{en ? 'Unlimited Signal Unlimited access after MozHyper 503 confirms your payment.' : 'Acesso ilimitado ao Signal Unlimited depois de o MozHyper 503 confirmar o pagamento.'}</p>
          </div>

          {notice && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs">{notice}</div>}
          {eligibleForLocalPayment ? <>
            <div className="mt-4 text-xs font-black">{en ? 'Choose payment method' : 'Escolha o método de pagamento'}</div>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod('mpesa')}
                aria-label="M-Pesa"
                aria-pressed={paymentMethod === 'mpesa'}
                style={{ position: 'relative', minWidth: 0, height: 112, padding: 0, borderRadius: 14, border: paymentMethod === 'mpesa' ? '3px solid #fff' : '2px solid rgba(255,255,255,.55)', background: '#ed1b24', boxShadow: paymentMethod === 'mpesa' ? '0 0 0 3px #ff4654, 0 10px 25px rgba(237,27,36,.28)' : '0 8px 20px rgba(0,0,0,.12)', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <img src="/payment-agent/mpesa.svg?v=2" alt="M-Pesa" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                {paymentMethod === 'mpesa' && <span aria-hidden="true" style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: '50%', background: '#fff', color: '#ed1b24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900 }}>✓</span>}
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('emola')}
                aria-label="e-Mola"
                aria-pressed={paymentMethod === 'emola'}
                style={{ position: 'relative', minWidth: 0, height: 112, padding: 0, borderRadius: 14, border: paymentMethod === 'emola' ? '3px solid #fff' : '2px solid rgba(255,255,255,.55)', background: '#f97824', boxShadow: paymentMethod === 'emola' ? '0 0 0 3px #ff7a24, 0 10px 25px rgba(249,120,36,.28)' : '0 8px 20px rgba(0,0,0,.12)', cursor: 'pointer', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <img src="/payment-agent/emola.svg?v=2" alt="e-Mola" style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                {paymentMethod === 'emola' && <span aria-hidden="true" style={{ position: 'absolute', top: 7, right: 7, width: 26, height: 26, borderRadius: '50%', background: '#fff', color: '#f97824', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 900 }}>✓</span>}
              </button>
            </div>
            <label className="mt-3 block text-xs font-bold">{en ? 'Payer name' : 'Nome usado no pagamento'}
              <input value={payerName} onChange={e => setPayerName(e.target.value)} autoComplete="name" required className="mt-2 w-full rounded-xl border border-slate-300/50 bg-transparent p-3 text-sm" />
            </label>
            <label className="mt-3 block text-xs font-bold">{en ? 'Phone number used for payment' : 'Número usado para pagamento'}
              <input value={payerNumber} onChange={e => setPayerNumber(e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" autoComplete="tel" required className="mt-2 w-full rounded-xl border border-slate-300/50 bg-transparent p-3 text-sm" />
            </label>
            <div className="mt-3 text-xs muted">{en ? 'You are eligible for M-Pesa/e-Mola because your MozHyper country is Mozambique.' : 'É elegível para M-Pesa/e-Mola porque o país da sua conta MozHyper é Moçambique.'}</div>
          </> : <div className="mt-4 rounded-xl border border-amber-400/50 p-3">
            <b className="text-sm">Binance — USDT TRC20</b>
            <p className="mt-1 text-xs">{en ? 'Your location is not eligible for M-Pesa/e-Mola. Pay 3 USDT using the TRC20 network.' : 'A sua localização não é elegível para M-Pesa/e-Mola. Pague 3 USDT pela rede TRC20.'}</p>
          </div>}
          {errorBox}
          <button type="button" disabled={busy} onClick={() => void createPayment()} style={actionButtonStyle(busy)}>{busy ? (en ? 'Preparing payment…' : 'A preparar pagamento…') : (en ? 'Continue to payment instructions' : 'Continuar para instruções de pagamento')}</button>
        </>}

        {(step === 'payment_instructions' || step === 'waiting') && payment && <>
          <div className="mt-4 rounded-xl border border-red-500/40 bg-red-500/10 p-3">
            <div className="text-[10px] font-black uppercase tracking-wide text-red-600">{en ? 'Signal Unlimited' : 'Signal Unlimited'}</div>
            <div className="mt-1 text-2xl font-black">{paymentIsCrypto ? '3 USDT' : '250 MT'}</div>
            <div className="mt-1 text-xs">{en ? 'Payment method' : 'Método de pagamento'}: <b>{paymentIsCrypto ? 'Binance — USDT TRC20' : payment.paymentMethod === 'mpesa' ? 'M-Pesa' : 'e-Mola'}</b></div>
          </div>

          {paymentIsCrypto ? <div className="mt-3 rounded-xl border border-amber-400/50 p-3">
            <div className="text-xs font-black">USDT · TRC20</div>
            <div className="mt-2 break-all rounded-lg border border-slate-300/40 p-3 font-mono text-xs">{payment.cryptoAddress || payment.paymentNumber}</div>
            <button type="button" className="mt-2" style={buttonStyle} onClick={() => void navigator.clipboard.writeText(payment.cryptoAddress || payment.paymentNumber).then(() => setNotice(en ? 'Address copied.' : 'Endereço copiado.')).catch(() => setError(en ? 'Select and copy the address manually.' : 'Selecione e copie o endereço manualmente.'))}>{en ? 'Copy USDT address' : 'Copiar endereço USDT'}</button>
            <p className="mt-2 text-xs text-amber-600">{en ? 'Send exactly 3 USDT on TRC20. Do not use another network.' : 'Envie exactamente 3 USDT pela rede TRC20. Não utilize outra rede.'}</p>
          </div> : <div className="mt-3 rounded-xl border border-slate-300/40 p-3">
            <div className="text-xs font-black">{en ? 'Payment recipient' : 'Destinatário do pagamento'}</div>
            <div className="mt-2 text-xs muted">{en ? 'Number' : 'Número'}: <b className="text-sm" style={{ color: 'inherit' }}>{payment.paymentNumber}</b></div>
            <div className="mt-1 text-xs muted">{en ? 'Name' : 'Nome'}: <b style={{ color: 'inherit' }}>{payment.paymentName}</b></div>
            <div className="mt-3 rounded-lg border border-red-500/30 p-3 text-lg font-black">250 MT</div>
            <p className="mt-2 text-xs muted">{en ? 'Make the payment with the selected method, then upload a screenshot of the payment.' : 'Faça o pagamento pelo método escolhido e depois envie um screenshot do pagamento.'}</p>
          </div>}

          <div className="mt-4 rounded-xl border border-slate-300/40 p-3">
            <b className="text-xs">{en ? 'Payment screenshot' : 'Screenshot do pagamento'}</b>
            <p className="mt-1 text-xs muted">{en ? 'Upload the payment proof. MozHyper 503 will check the payment before activating unlimited access.' : 'Envie o comprovativo do pagamento. O MozHyper 503 verificará o pagamento antes de activar o acesso ilimitado.'}</p>
            <input type="file" accept="image/*" onChange={e => setPaymentProof(e.target.files?.[0] || null)} disabled={busy || step === 'waiting'} className="mt-3 block w-full text-xs" />
            {paymentProof && <div className="mt-2 break-all text-[10px] muted">✓ {paymentProof.name}</div>}
            {step === 'payment_instructions'
              ? <button type="button" disabled={busy || !paymentProof} onClick={() => void markAsPaid()} style={actionButtonStyle(busy || !paymentProof)}>{busy ? (en ? 'Sending proof…' : 'A enviar comprovativo…') : (en ? 'I ALREADY PAID' : 'JÁ PAGUEI')}</button>
              : <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-xs font-bold">{en ? 'Payment proof submitted. Waiting for MozHyper 503.' : 'Comprovativo enviado. A aguardar o MozHyper 503.'}</div>}
          </div>
          <div className="mt-3 text-[10px] muted">{en ? 'Request' : 'Pedido'}: {payment.requestId}</div>
          {errorBox}
          {notice && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs">{notice}</div>}
        </>}

        {step === 'waiting' && !payment && <div className="mt-4 rounded-xl border p-3 text-sm">{en ? 'Waiting for payment confirmation.' : 'A aguardar confirmação do pagamento.'}</div>}

        {step === 'active' && <>
          <div className="mt-4 rounded-xl border border-red-500/50 bg-red-500/10 p-4">
            <div className="text-[10px] font-black uppercase tracking-wide text-red-600">{en ? 'Access active' : 'Acesso activo'}</div>
            <div className="mt-2 text-xl font-black">{onboarding?.status === 'active' ? (en ? 'Unlimited package activated' : 'Pacote ilimitado activado') : (en ? 'Signal Unlimited approved' : 'Signal Unlimited aprovado')}</div>
            <div className="mt-2 text-xs">{onboarding?.status === 'active'
              ? (en ? 'Your Signal Unlimited package has no expiry date.' : 'O seu pacote Signal Unlimited não tem data de expiração.')
              : (en ? 'Your previous Signal Unlimited request was approved.' : 'O seu pedido anterior do Signal Unlimited foi aprovado.')}</div>
            <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-xl bg-red-600 p-3 text-center text-sm font-black text-white no-underline">{en ? 'Join Signal Unlimited on Telegram' : 'Entrar no Signal Unlimited no Telegram'} ↗</a>
          </div>
        </>}

        {step === 'legacy' && legacyRequest && <>
          <div className="mt-4 rounded-xl border border-amber-400/50 p-3">
            <div className="text-[10px] font-black uppercase muted">{en ? 'Previous request status' : 'Estado do pedido anterior'}</div>
            <b className="mt-1 block text-sm">{en ? 'Waiting for administrator review' : 'A aguardar análise do administrador'}</b>
            <p className="mt-2 text-xs muted">{en ? 'Your earlier Signal Unlimited request is still pending.' : 'O seu pedido anterior de Signal Unlimited ainda está pendente.'}</p>
          </div>
        </>}

        {errorBox}
        <button type="button" onClick={() => { setOpen(false); }} className="mt-4 w-full rounded-xl border border-slate-300/40 p-2 text-xs font-bold">{en ? 'Close' : 'Fechar'}</button>
      </div>
    </div>}
  </>;
}
