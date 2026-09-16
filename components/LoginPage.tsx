'use client';

import { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_SIGNUP_URL = 'https://t.deriv.link?t=JAZWN4WCY6JS';

const LANGUAGE_OPTIONS = [
  { code: 'en' as const, flag: '🇺🇸', label: 'América' },
  { code: 'pt' as const, flag: '🇧🇷', label: 'Brasil' },
  { code: 'es' as const, flag: '🇪🇸', label: 'España' },
];

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
    const registering = mode === 'register';
    try {
      const endpoint = registering ? '/api/auth/register' : '/api/auth/platform-login';
      const body = registering ? { name, email, password, confirmPassword } : { email, password };
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível continuar.');
      setPassword(''); setConfirmPassword('');
      if (registering) {
        setPlatformReady(true);
      } else {
        window.location.assign('/');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  }

  const pt = language === 'pt';
  const es = language === 'es';
  const copy = pt ? {
    register:'Criar conta', login:'Entrar', name:'Nome', email:'Email', password:'Password', confirm:'Confirmar password', create:'Criar conta na plataforma', enter:'Entrar na plataforma', have:'Já tenho conta', no:'Ainda não tenho conta', welcome:'Conta criada com sucesso.', connectTitle:'Agora conecte a sua conta Deriv', connect:'Entrar com Deriv', derivNo:'Ainda não tem uma conta Deriv?', derivCreate:'Criar conta Deriv', note:'Primeiro criamos a sua conta MozHyper. Depois conecte a Deriv para usar a plataforma.', risk:'AVISO DE RISCO: Negociar envolve risco significativo de perda financeira, incluindo a possibilidade de perder todo o capital utilizado. Resultados passados não garantem resultados futuros. Nunca opere com dinheiro que não pode perder.'
  } : es ? {
    register:'Crear cuenta', login:'Entrar', name:'Nombre', email:'Email', password:'Contraseña', confirm:'Confirmar contraseña', create:'Crear cuenta en la plataforma', enter:'Entrar en la plataforma', have:'Ya tengo cuenta', no:'Aún no tengo cuenta', welcome:'Cuenta creada correctamente.', connectTitle:'Ahora conecta tu cuenta Deriv', connect:'Entrar con Deriv', derivNo:'¿Aún no tienes una cuenta Deriv?', derivCreate:'Crear cuenta Deriv', note:'Primero creamos tu cuenta MozHyper. Después conecta Deriv para usar la plataforma.', risk:'AVISO DE RIESGO: Operar implica un riesgo significativo de pérdida financiera, incluida la posibilidad de perder todo el capital utilizado. Los resultados pasados no garantizan resultados futuros. Nunca operes con dinero que no puedas perder.'
  } : {
    register:'Create account', login:'Sign in', name:'Name', email:'Email', password:'Password', confirm:'Confirm password', create:'Create platform account', enter:'Sign in to platform', have:'I already have an account', no:'I do not have an account yet', welcome:'Account created successfully.', connectTitle:'Now connect your Deriv account', connect:'Continue with Deriv', derivNo:'Do not have a Deriv account yet?', derivCreate:'Create Deriv account', note:'First we create your MozHyper account. Then connect Deriv to use the platform.', risk:'RISK WARNING: Trading involves significant financial risk, including the possibility of losing all capital used. Past performance does not guarantee future results. Never trade with money you cannot afford to lose.'
  };

  const languagePicker = (
    <div style={styles.lang} aria-label="Language selector">
      {LANGUAGE_OPTIONS.map(({ code, flag, label }) => (
        <button
          key={code}
          title={label}
          aria-label={label}
          onClick={() => setLanguage(code)}
          style={{ ...styles.langBtn, ...(language === code ? styles.langActive : {}) }}
        >
          <span style={styles.flag}>{flag}</span>
        </button>
      ))}
    </div>
  );

  if (checking) return <main style={styles.page}><div style={styles.card}>Loading...</div></main>;

  if (platformReady) return (
    <main style={styles.page}>
      <div style={styles.contentWrap}>
        <section style={styles.card}>
          {languagePicker}
          <div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>
          <h2 style={styles.title}>{copy.connectTitle}</h2>
          <p style={styles.intro}>{copy.note}</p>
          <button style={styles.button} onClick={() => window.location.assign('/api/auth/login')}>🔒 &nbsp;{copy.connect}</button>
          <div style={styles.divider}/>
          <div style={styles.muted}>{copy.derivNo}</div>
          <a href={DERIV_SIGNUP_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>{copy.derivCreate} →</a>
        </section>
        <footer style={styles.footer}>{copy.risk}</footer>
      </div>
    </main>
  );

  return (
    <main style={styles.page}>
      <div style={styles.contentWrap}>
        <section style={styles.card}>
          {languagePicker}
          <div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>
          <div className="tabs" style={styles.tabs}><button onClick={()=>{setMode('register');setError('')}} style={mode==='register'?styles.tabActive:styles.tab}>{copy.register}</button><button onClick={()=>{setMode('login');setError('')}} style={mode==='login'?styles.tabActive:styles.tab}>{copy.login}</button></div>
          <form onSubmit={submit}>
            {mode==='register' && <label style={styles.label}>{copy.name}<input value={name} onChange={e=>setName(e.target.value)} style={styles.input} autoComplete="name" required minLength={2}/></label>}
            <label style={styles.label}>{copy.email}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={styles.input} autoComplete="email" required/></label>
            <label style={styles.label}>{copy.password}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={styles.input} autoComplete={mode==='register'?'new-password':'current-password'} required minLength={8}/></label>
            {mode==='register' && <label style={styles.label}>{copy.confirm}<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={styles.input} autoComplete="new-password" required minLength={8}/></label>}
            {error && <div style={styles.error}>{error}</div>}
            <button disabled={busy} style={{...styles.button, opacity:busy?.65:1}}>{busy?'...':mode==='register'?copy.create:copy.enter}</button>
          </form>
          <div style={styles.switcher} onClick={()=>setMode(mode==='register'?'login':'register')}>{mode==='register'?copy.have:copy.no}</div>
        </section>
        <footer style={styles.footer}>{copy.risk}</footer>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'stretch',justifyContent:'center',padding:'16px 16px 10px',boxSizing:'border-box',background:'#ffffff',color:'#171717',fontFamily:"'IBM Plex Sans',sans-serif"},
  contentWrap:{width:'min(100%,390px)',minHeight:'calc(100dvh - 26px)',display:'flex',flexDirection:'column',justifyContent:'space-between',gap:14},
  card:{position:'relative',width:'100%',padding:'22px 18px',boxSizing:'border-box',borderRadius:12,background:'#ffffff',border:'1px solid #e2e5e8',boxShadow:'0 16px 45px rgba(0,0,0,.08)'},
  brand:{display:'flex',alignItems:'center',gap:11,marginBottom:22},mark:{width:48,height:48,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,fontWeight:700,background:'#ff444f',color:'#fff'},brandName:{fontSize:24,fontWeight:700,letterSpacing:'-.04em',color:'#171717'},hyper:{color:'#ff444f'},sub:{marginTop:5,color:'#7b8085',fontSize:8,fontWeight:600,letterSpacing:'.16em'},
  title:{fontSize:18,margin:'18px 0 8px',color:'#171717'},intro:{color:'#626970',fontSize:12,lineHeight:1.5},label:{display:'block',color:'#4f565d',fontSize:11,fontWeight:600,marginBottom:10},input:{display:'block',width:'100%',boxSizing:'border-box',marginTop:5,padding:'12px 11px',borderRadius:7,border:'1px solid #cfd4d9',background:'#fff',color:'#171717',outline:'none'},button:{width:'100%',minHeight:48,border:0,borderRadius:8,cursor:'pointer',color:'#fff',fontSize:12,fontWeight:700,background:'#ff444f',marginTop:6},tabs:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:5,marginBottom:18},tab:{border:0,borderRadius:7,padding:9,background:'#f0f2f4',color:'#687078',cursor:'pointer',fontWeight:700},tabActive:{border:0,borderRadius:7,padding:9,background:'#ff444f',color:'#fff',cursor:'pointer',fontWeight:700},divider:{height:1,background:'#e2e5e8',margin:'20px 0 14px'},muted:{textAlign:'center',color:'#697078',fontSize:10},link:{display:'block',textAlign:'center',marginTop:7,color:'#ff444f',fontSize:12,fontWeight:700,textDecoration:'none'},error:{padding:9,borderRadius:7,background:'#fff2f3',border:'1px solid #ffc5c9',color:'#d92f3b',fontSize:10,marginBottom:10},switcher:{textAlign:'center',color:'#ff444f',fontSize:10,fontWeight:700,cursor:'pointer',marginTop:13},footer:{padding:'8px 8px 4px',textAlign:'center',color:'#7b8085',fontSize:8.5,lineHeight:1.5},lang:{position:'absolute',right:12,top:12,display:'flex',gap:3,padding:3,borderRadius:8,background:'#fff',border:'1px solid #dfe3e6'},langBtn:{border:0,borderRadius:6,padding:'5px 7px',cursor:'pointer',color:'#687078',background:'transparent',fontSize:17,lineHeight:1,display:'flex',alignItems:'center',justifyContent:'center'},langActive:{background:'#ffecee',boxShadow:'inset 0 0 0 1px #ffb8be'},flag:{display:'block',lineHeight:1}
};
