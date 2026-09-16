'use client';

import { Suspense, useSearchParams } from 'next/navigation';
import { useState } from 'react';

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível alterar a password.');
      setDone(true);
      setMessage(data.message || 'Password alterada com sucesso.');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro inesperado.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>
        <h1 style={styles.title}>Redefinir password</h1>
        {done ? (
          <>
            <div style={styles.success}>{message}</div>
            <a href="/" style={styles.buttonLink}>Voltar ao login</a>
          </>
        ) : !token ? (
          <>
            <div style={styles.error}>Link de recuperação inválido.</div>
            <a href="/" style={styles.buttonLink}>Voltar ao login</a>
          </>
        ) : (
          <form onSubmit={submit}>
            <label style={styles.label}>Nova password<input type="password" value={password} onChange={e => setPassword(e.target.value)} style={styles.input} autoComplete="new-password" minLength={8} required /></label>
            <label style={styles.label}>Confirmar password<input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={styles.input} autoComplete="new-password" minLength={8} required /></label>
            {error && <div style={styles.error}>{error}</div>}
            <button disabled={busy} style={{ ...styles.button, opacity: busy ? .65 : 1 }}>{busy ? '...' : 'Alterar password'}</button>
            <a href="/" style={styles.back}>Voltar ao login</a>
          </form>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main style={styles.page}><section style={styles.card}>A carregar...</section></main>}><ResetPasswordForm /></Suspense>;
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',padding:16,boxSizing:'border-box',background:'#fff',fontFamily:"'IBM Plex Sans',sans-serif",color:'#171717'},
  card:{width:'min(100%,390px)',padding:'24px 18px',boxSizing:'border-box',borderRadius:12,background:'#fff',border:'1px solid #e2e5e8',boxShadow:'0 16px 45px rgba(0,0,0,.08)'},
  brand:{display:'flex',alignItems:'center',gap:11,marginBottom:24},mark:{width:48,height:48,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,fontWeight:700,background:'#ff444f',color:'#fff'},brandName:{fontSize:24,fontWeight:700,letterSpacing:'-.04em'},hyper:{color:'#ff444f'},sub:{marginTop:5,color:'#7b8085',fontSize:8,fontWeight:600,letterSpacing:'.16em'},title:{fontSize:20,margin:'0 0 18px'},label:{display:'block',color:'#4f565d',fontSize:11,fontWeight:600,marginBottom:12},input:{display:'block',width:'100%',boxSizing:'border-box',marginTop:5,padding:'12px 11px',borderRadius:7,border:'1px solid #cfd4d9',background:'#fff',color:'#171717',outline:'none'},button:{width:'100%',minHeight:48,border:0,borderRadius:8,cursor:'pointer',color:'#fff',fontSize:12,fontWeight:700,background:'#ff444f',marginTop:4},buttonLink:{display:'block',width:'100%',boxSizing:'border-box',minHeight:48,lineHeight:'48px',textAlign:'center',borderRadius:8,color:'#fff',fontSize:12,fontWeight:700,background:'#ff444f',textDecoration:'none'},back:{display:'block',textAlign:'center',marginTop:14,color:'#ff444f',fontSize:11,fontWeight:700,textDecoration:'none'},error:{padding:9,borderRadius:7,background:'#fff2f3',border:'1px solid #ffc5c9',color:'#d92f3b',fontSize:10,marginBottom:12},success:{padding:12,borderRadius:7,background:'#effaf2',border:'1px solid #b8e5c2',color:'#208a3c',fontSize:11,lineHeight:1.5,marginBottom:14}
};
