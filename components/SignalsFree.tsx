'use client';

import { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const GROUP_URL = 'https://t.me/+S4A_5SgZB6x4P_UQ';

type RequestState = { id: number | string; mt5_id: string; status: 'pending' | 'approved' | 'rejected'; created_at?: string } | null;

export default function SignalsFree({ light }: { light: boolean }) {
  const { language } = useLanguage();
  const en = language === 'en';
  const [open, setOpen] = useState(false);
  const [mt5Id, setMt5Id] = useState('');
  const [request, setRequest] = useState<RequestState>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/signals-free', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setRequest(data.request || null);
        if (data.request?.mt5_id) setMt5Id(String(data.request.mt5_id));
      }
    } catch {}
  }, []);

  useEffect(() => { if (open) void loadStatus(); }, [open, loadStatus]);
  useEffect(() => {
    if (!open || request?.status !== 'pending') return;
    const timer = window.setInterval(() => { void loadStatus(); }, 10000);
    return () => window.clearInterval(timer);
  }, [open, request?.status, loadStatus]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (!/^\d{5,15}$/.test(mt5Id.trim())) {
      setError(en ? 'Enter a valid MT5 ID (5–15 digits).' : 'Introduza um ID MT5 válido (5–15 dígitos).');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch('/api/signals-free', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mt5Id: mt5Id.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (en ? 'Could not submit the request.' : 'Não foi possível submeter o pedido.'));
      setRequest(data.request || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : (en ? 'Request failed.' : 'O pedido falhou.'));
    } finally {
      setLoading(false);
    }
  };

  const statusLabel = request?.status === 'approved'
    ? (en ? 'Approved' : 'Aprovado')
    : request?.status === 'rejected'
      ? (en ? 'Rejected' : 'Rejeitado')
      : (en ? 'Waiting for administrator approval' : 'A aguardar aprovação do administrador');

  return <>
    <button
      type="button"
      className="icon-btn signals-free-trigger"
      onClick={() => { setOpen(true); setError(''); }}
      aria-label="Signals Free"
      title="Signals Free"
      style={{ width: 38, height: 38, padding: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid #3f8c43', background: 'linear-gradient(145deg,#087ec2,#07519b)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span aria-hidden="true" style={{ position: 'relative', width: 31, height: 29, display: 'block' }}>
        <span style={{ position: 'absolute', left: 2, top: 5, width: 21, height: 21, borderRadius: '50%', background: 'linear-gradient(145deg,#f6e94d,#9eaa00)', border: '2px solid #6b7b12' }} />
        <span style={{ position: 'absolute', right: 0, top: 1, width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(145deg,#9de36c,#168c2c)', border: '2px solid #267c27' }} />
        <span style={{ position: 'absolute', right: 0, bottom: 0, width: 19, height: 19, borderRadius: '50%', background: 'linear-gradient(145deg,#8fe3ff,#087fc5)', border: '2px solid #075a9d' }} />
        <span style={{ position: 'absolute', left: 8, top: 6, width: 16, height: 16, borderRadius: '50%', background: '#fff', color: '#f08c32', fontSize: 12, lineHeight: '16px', fontWeight: 900, boxShadow: '0 1px 2px #17415b' }}>5</span>
      </span>
    </button>
    {open && <div className="modal-backdrop" onClick={() => setOpen(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="signals-free-title" onClick={e => e.stopPropagation()} style={{ width: 'min(94vw,420px)', maxHeight: '88vh', overflowY: 'auto', borderColor: '#2c9c55' }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><span style={{ fontSize: 24 }}>🟢</span><b id="signals-free-title">Signals Free</b></div>
          <button type="button" onClick={() => setOpen(false)} aria-label={en ? 'Close' : 'Fechar'}>✕</button>
        </div>
        <p className="mt-3 text-xs muted">{en ? 'Submit your MT5 account ID. The Payment Agent 503 administrator will review your request.' : 'Submeta o ID da sua conta MT5. O administrador do Payment Agent 503 analisará o seu pedido.'}</p>
        {request ? <div className="mt-4 rounded-xl border p-3" style={{ borderColor: request.status === 'approved' ? '#22c55e' : request.status === 'rejected' ? '#ef4444' : '#eab308' }}>
          <div className="text-[10px] font-bold uppercase muted">{en ? 'Request status' : 'Estado do pedido'}</div>
          <b className="mt-1 block text-sm">{statusLabel}</b>
          <div className="mt-1 text-xs muted">MT5 ID: {request.mt5_id}</div>
          {request.status === 'pending' && <p className="mt-2 text-xs muted">{en ? 'This window checks for approval automatically.' : 'Esta janela verifica automaticamente se o pedido foi aprovado.'}</p>}
          {request.status === 'approved' && <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-xl bg-emerald-600 p-3 text-center text-sm font-black text-white no-underline">{en ? 'Join Signals Free on Telegram' : 'Entrar no Signals Free no Telegram'} ↗</a>}
          {request.status === 'rejected' && <button type="button" onClick={() => { setRequest(null); setMt5Id(''); }} className="mt-3 w-full rounded-xl border p-3 text-sm font-bold">{en ? 'Submit another request' : 'Submeter novo pedido'}</button>}
        </div> : <form onSubmit={submit} className="mt-4">
          <label className="block text-xs font-bold">{en ? 'MT5 account ID' : 'ID da conta MT5'}
            <input value={mt5Id} onChange={e => setMt5Id(e.target.value.replace(/\D/g, '').slice(0, 15))} inputMode="numeric" pattern="[0-9]{5,15}" minLength={5} maxLength={15} required placeholder={en ? 'Enter your MT5 ID' : 'Introduza o seu ID MT5'} className="mt-2 w-full rounded-xl border border-slate-300/50 bg-transparent p-3 text-sm font-bold" />
          </label>
          {error && <div role="alert" className="mt-2 rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-500">{error}</div>}
          <button disabled={loading} type="submit" className="mt-3 w-full rounded-xl bg-emerald-600 p-3 text-sm font-black text-white disabled:opacity-50">{loading ? (en ? 'Submitting…' : 'A submeter…') : (en ? 'Submit for approval' : 'Submeter para aprovação')}</button>
        </form>}
        {error && request && <div role="alert" className="mt-2 text-xs text-red-500">{error}</div>}
        <button type="button" onClick={() => setOpen(false)} className="mt-3 w-full rounded-xl border border-slate-300/40 p-2 text-xs font-bold">{en ? 'Close' : 'Fechar'}</button>
      </div>
    </div>}
  </>;
}
