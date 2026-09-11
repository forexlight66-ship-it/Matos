'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_SIGNUP_URL = 'https://t.deriv.link?t=JAZWN4WCY6JS';

export default function LoginPage() {
  const { language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [platformReady, setPlatformReady] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  const refreshStatus = () => fetch('/api/auth/me', { cache: 'no-store' }).then(r => r.json()).then(data => {
    setPlatformReady(Boolean(data.platformAuthenticated));
    setChecking(false);
  }).catch(() => setChecking(false));

  useEffect(() => { refreshStatus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setBusy(true);
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/platform-login';
      const body = mode === 'register' ? { name, email, password, confirmPassword } : { email, password };
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível continuar.');
      setPlatformReady(true);
      setPassword(''); setConfirmPassword('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  }

  const pt = language === 'pt';
  const es = language === 'es';
  const copy = pt ? {
    register:'Criar conta', login:'Entrar', name:'Nome', email:'Email', password:'Password', confirm:'Confirmar password', create:'Criar conta na plataforma', enter:'Entrar na plataforma', have:'Já tenho conta', no:'Ainda não tenho conta', welcome:'Conta criada com sucesso.', connectTitle:'Agora conecte a sua conta Deriv', connect:'Entrar com Deriv', derivNo:'Ainda não tem uma conta Deriv?', derivCreate:'Criar conta Deriv', note:'Primeiro criamos a sua conta MozHyper. Depois conecte a Deriv para usar a plataforma.', risk:'A negociação envolve risco significativo. Resultados passados não garantem resultados futuros.'
  } : es ? {
    register:'Crear cuenta', login:'Entrar', name:'Nombre', email:'Email', password:'Contraseña', confirm:'Confirmar contraseña', create:'Crear cuenta en la plataforma', enter:'Entrar en la plataforma', have:'Ya tengo cuenta', no:'Aún no tengo cuenta', welcome:'Cuenta creada correctamente.', connectTitle:'Ahora conecta tu cuenta Deriv', connect:'Entrar con Deriv', derivNo:'¿Aún no tienes una cuenta Deriv?', derivCreate:'Crear cuenta Deriv', note:'Primero creamos tu cuenta MozHyper. Después conecta Deriv para usar la plataforma.', risk:'El trading implica un riesgo significativo. Los resultados pasados no garantizan resultados futuros.'
  } : {
    register:'Create account', login:'Sign in', name:'Name', email:'Email', password:'Password', confirm:'Confirm password', create:'Create platform account', enter:'Sign in to platform', have:'I already have an account', no:'I do not have an account yet', welcome:'Account created successfully.', connectTitle:'Now connect your Deriv account', connect:'Continue with Deriv', derivNo:'Do not have a Deriv account yet?', derivCreate:'Create Deriv account', note:'First we create your MozHyper account. Then connect Deriv to use the platform.', risk:'Trading involves significant risk. Past performance does not guarantee future results.'
  };

  if (checking) return <main style={styles.page}><div style={styles.card}>Loading...</div></main>;

  if (platformReady) return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>
        <div style={styles.success}>✓ {copy.welcome}</div>
        <h2 style={styles.title}>{copy.connectTitle}</h2>
        <p style={styles.intro}>{copy.note}</p>
        <button style={styles.button} onClick={() => window.location.assign('/api/auth/login')}>🔒 &nbsp;{copy.connect}</button>
        <div style={styles.divider}/>
        <div style={styles.muted}>{copy.derivNo}</div>
        <a href={DERIV_SIGNUP_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>{copy.derivCreate} →</a>
        <div style={styles.lang}>{(['en','pt','es'] as const).map(x => <button key={x} onClick={() => setLanguage(x)} style={{...styles.langBtn, ...(language===x?styles.langActive:{})}}>{x.toUpperCase()}</button>)}</div>
      </section>
    </main>
  );

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.lang}>{(['en','pt','es'] as const).map(x => <button key={x} onClick={() => setLanguage(x)} style={{...styles.langBtn, ...(language===x?styles.langActive:{})}}>{x.toUpperCase()}</button>)}</div>
        <div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>
        <div style={styles.tabs}><button onClick={()=>{setMode('register');setError('')}} style={mode==='register'?styles.tabActive:styles.tab}>{copy.register}</button><button onClick={()=>{setMode('login');setError('')}} style={mode==='login'?styles.tabActive:styles.tab}>{copy.login}</button></div>
        <form onSubmit={submit}>
          {mode==='register' && <label style={styles.label}>{copy.name}<input value={name} onChange={e=>setName(e.target.value)} style={styles.input} autoComplete="name" required minLength={2}/></label>}
          <label style={styles.label}>{copy.email}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={styles.input} autoComplete="email" required/></label>
          <label style={styles.label}>{copy.password}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={styles.input} autoComplete={mode==='register'?'new-password':'current-password'} required minLength={8}/></label>
          {mode==='register' && <label style={styles.label}>{copy.confirm}<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={styles.input} autoComplete="new-password" required minLength={8}/></label>}
          {error && <div style={styles.error}>{error}</div>}
          <button disabled={busy} style={{...styles.button, opacity:busy?.65:1}}>{busy?'...':mode==='register'?copy.create:copy.enter}</button>
        </form>
        <div style={styles.switcher} onClick={()=>setMode(mode==='register'?'login':'register')}>{mode==='register'?copy.have:copy.no}</div>
        <div style={styles.note}>{copy.note}</div>
        <div style={styles.risk}>{copy.risk}</div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',padding:16,boxSizing:'border-box',background:'#0e0e0e',color:'#fff',fontFamily:"'IBM Plex Sans',sans-serif"},
  card:{position:'relative',width:'min(100%,390px)',padding:'22px 18px',borderRadius:12,background:'#151717',border:'1px solid #323738',boxShadow:'0 20px 50px rgba(0,0,0,.4)'},
  brand:{display:'flex',alignItems:'center',gap:11,marginBottom:22},mark:{width:48,height:48,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,fontWeight:700,background:'#ff444f'},brandName:{fontSize:24,fontWeight:700,letterSpacing:'-.04em'},hyper:{color:'#ff444f'},sub:{marginTop:5,color:'#6e6e6e',fontSize:8,fontWeight:600,letterSpacing:'.16em'},
  title:{fontSize:18,margin:'18px 0 8px'},intro:{color:'#aeb2b2',fontSize:12,lineHeight:1.5},label:{display:'block',color:'#aeb2b2',fontSize:11,fontWeight:600,marginBottom:10},input:{display:'block',width:'100%',boxSizing:'border-box',marginTop:5,padding:'12px 11px',borderRadius:7,border:'1px solid #323738',background:'#0e0e0e',color:'#fff',outline:'none'},button:{width:'100%',minHeight:48,border:0,borderRadius:8,cursor:'pointer',color:'#fff',fontSize:12,fontWeight:700,background:'#ff444f',marginTop:6},tabs:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:18},tab:{border:0,borderRadius:7,padding:9,background:'#1b1d1d',color:'#777',cursor:'pointer',fontWeight:700},tabActive:{border:0,borderRadius:7,padding:9,background:'#ff444f',color:'#fff',cursor:'pointer',fontWeight:700},divider:{height:1,background:'#323738',margin:'20px 0 14px'},muted:{textAlign:'center',color:'#777',fontSize:10},link:{display:'block',textAlign:'center',marginTop:7,color:'#ff444f',fontSize:12,fontWeight:700,textDecoration:'none'},note:{marginTop:14,padding:10,borderRadius:7,background:'#1b1d1d',border:'1px solid #323738',color:'#858b8b',fontSize:9,lineHeight:1.5,textAlign:'center'},risk:{marginTop:10,color:'#806e70',fontSize:8.5,lineHeight:1.5},error:{padding:9,borderRadius:7,background:'rgba(255,68,79,.08)',border:'1px solid rgba(255,68,79,.3)',color:'#ff8a91',fontSize:10,marginBottom:10},success:{padding:9,borderRadius:7,background:'rgba(75,180,179,.08)',border:'1px solid rgba(75,180,179,.3)',color:'#70cfcd',fontSize:10},switcher:{textAlign:'center',color:'#ff444f',fontSize:10,fontWeight:700,cursor:'pointer',marginTop:13},lang:{position:'absolute',right:12,top:12,display:'flex',gap:3,padding:3,borderRadius:7,background:'#1b1d1d',border:'1px solid #323738'},langBtn:{border:0,borderRadius:5,padding:'4px 6px',cursor:'pointer',color:'#666',background:'transparent',fontSize:8,fontWeight:700},langActive:{color:'#fff',background:'#ff444f'}
};
