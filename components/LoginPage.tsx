'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import InlineSpinner from '@/components/InlineSpinner';

const DERIV_SIGNUP_URL = 'https://t.deriv.link?t=7D4QKG8Y5W88';
const LANGUAGE_OPTIONS = [
  { code: 'en' as const, flag: '🇺🇸', label: 'América' },
  { code: 'pt' as const, flag: '🇧🇷', label: 'Brasil' },
  { code: 'es' as const, flag: '🇪🇸', label: 'España' },
];

export default function LoginPage({ initialPlatformReady = false, initialUserName = '' }: { initialPlatformReady?: boolean; initialUserName?: string }) {
  const { language, setLanguage } = useLanguage();
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [platformReady, setPlatformReady] = useState(initialPlatformReady);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [userName, setUserName] = useState(initialUserName);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      if (registering) { setPlatformReady(true); setUserName(name); }
      else { window.location.assign('/'); }
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  }

  async function requestPasswordReset(e: React.FormEvent) {
    e.preventDefault(); setError(''); setResetMessage(''); setBusy(true);
    try {
      const res = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: resetEmail }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível processar o pedido.');
      setResetMessage(data.message || 'Se o email estiver registado, receberá um link para redefinir a password.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro inesperado.'); }
    finally { setBusy(false); }
  }

  const pt = language === 'pt';
  const es = language === 'es';
  const copy = pt ? {
    register:'Criar conta', login:'Entrar', name:'Nome', email:'Email', password:'Password', confirm:'Confirmar password', create:'Criar conta na plataforma', enter:'Entrar na plataforma', have:'Já tenho conta', no:'Ainda não tenho conta', greeting:'Bem-vindo', connectTitle:'Agora conecte a sua conta Deriv', connect:'Entrar com Deriv', derivNo:'Ainda não tem uma conta Deriv?', derivCreate:'Criar conta Deriv', note:'Primeiro criamos a sua conta MozHyper. Depois conecte a Deriv para usar a plataforma.', risk:'AVISO DE RISCO: Negociar envolve risco significativo de perda financeira, incluindo a possibilidade de perder todo o capital utilizado. Resultados passados não garantem resultados futuros. Nunca opere com dinheiro que não pode perder.', deriv:'Deriv', forgot:'Esqueci a password', forgotTitle:'Recuperar password', forgotIntro:'Introduza o seu email e enviaremos um link para redefinir a password.', sendReset:'Enviar link de recuperação', backLogin:'Voltar ao login'
  } : es ? {
    register:'Crear cuenta', login:'Entrar', name:'Nombre', email:'Email', password:'Contraseña', confirm:'Confirmar contraseña', create:'Crear cuenta en la plataforma', enter:'Entrar en la plataforma', have:'Ya tengo cuenta', no:'Aún no tengo cuenta', greeting:'Bienvenido', connectTitle:'Ahora conecta tu cuenta Deriv', connect:'Entrar con Deriv', derivNo:'¿Aún no tienes una cuenta Deriv?', derivCreate:'Crear cuenta Deriv', note:'Primero creamos tu cuenta MozHyper. Después conecta Deriv para usar la plataforma.', risk:'AVISO DE RIESGO: Operar implica un riesgo significativo de pérdida financiera, incluida la posibilidad de perder todo el capital utilizado. Los resultados pasados no garantizan resultados futuros. Nunca operes con dinero que no puedas perder.', deriv:'Deriv', forgot:'Olvidé mi contraseña', forgotTitle:'Recuperar contraseña', forgotIntro:'Introduce tu email y enviaremos un enlace para restablecer la contraseña.', sendReset:'Enviar enlace de recuperación', backLogin:'Volver al inicio de sesión'
  } : {
    register:'Create account', login:'Sign in', name:'Name', email:'Email', password:'Password', confirm:'Confirm password', create:'Create platform account', enter:'Sign in to platform', have:'I already have an account', no:'I do not have an account yet', greeting:'Welcome', connectTitle:'Now connect your Deriv account', connect:'Continue with Deriv', derivNo:'Do not have a Deriv account yet?', derivCreate:'Create Deriv account', note:'First we create your MozHyper account. Then connect Deriv to use the platform.', risk:'RISK WARNING: Trading involves significant financial risk, including the possibility of losing all capital used. Past performance does not guarantee future results. Never trade with money you cannot afford to lose.', deriv:'Deriv', forgot:'Forgot password?', forgotTitle:'Recover password', forgotIntro:'Enter your email and we will send a link to reset your password.', sendReset:'Send reset link', backLogin:'Back to sign in'
  };

  const languagePicker = <div style={styles.lang} aria-label="Language selector">{LANGUAGE_OPTIONS.map(({ code, flag, label }) => <button key={code} type="button" title={label} aria-label={label} onClick={() => setLanguage(code)} style={{ ...styles.langBtn, ...(language === code ? styles.langActive : {}) }}><span style={styles.flag}>{flag}</span></button>)}</div>;

  const responsiveStyles = `
    @media (min-width: 768px) {
      .login-page-matos {
        width: 100%;
        min-height: 100dvh;
        padding: 0 !important;
        align-items: stretch !important;
      }
      .login-content-matos {
        width: 100% !important;
        max-width: none !important;
        min-height: 100dvh !important;
        padding: clamp(32px, 5vw, 80px) !important;
        box-sizing: border-box;
        justify-content: center !important;
        align-items: center;
      }
      .login-card-matos {
        width: min(100%, 560px) !important;
        padding: 32px !important;
      }
      .login-footer-matos {
        position: fixed;
        left: 50%;
        bottom: 18px;
        transform: translateX(-50%);
        width: min(90vw, 900px);
      }
    }
    @media (min-width: 1920px) {
      .login-content-matos {
        padding: 60px 80px !important;
      }
      .login-card-matos {
        width: min(100%, 620px) !important;
        padding: 40px !important;
      }
    }
  `;
  if (platformReady) return <main className="login-page-matos" style={styles.page}><style>{responsiveStyles}</style><div className="login-content-matos" style={styles.contentWrap}><section className="login-card-matos" style={styles.card}><div style={styles.topBar}><div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>{languagePicker}</div>{userName && <div style={styles.welcome}>{copy.greeting}, {userName}</div>}<h2 style={styles.title}>{copy.connectTitle}</h2><p style={styles.intro}>{copy.note}</p><button style={styles.button} onClick={() => window.location.assign('/api/auth/login')}>🔒 &nbsp;{copy.connect}</button><div style={styles.divider}/><div style={styles.muted}>{copy.derivNo}</div><a href={DERIV_SIGNUP_URL} target="_blank" rel="noopener noreferrer" style={styles.link}>{copy.derivCreate} →</a></section><footer className="login-footer-matos" style={styles.footer}>{copy.risk}</footer></div></main>;

  return <main style={styles.page}><div style={styles.contentWrap}><section style={styles.card}><div style={styles.topBar}><div style={styles.brand}><div style={styles.mark}>M</div><div><div style={styles.brandName}>Moz<span style={styles.hyper}>Hyper</span></div><div style={styles.sub}>DIGITS TRADING</div></div></div>{languagePicker}</div>{forgotMode ? <><h2 style={styles.title}>{copy.forgotTitle}</h2><p style={styles.intro}>{copy.forgotIntro}</p><form onSubmit={requestPasswordReset}><label style={styles.label}>{copy.email}<input type="email" value={resetEmail} onChange={e=>setResetEmail(e.target.value)} style={styles.input} autoComplete="email" required /></label>{error&&<div style={styles.error}>{error}</div>}{resetMessage&&<div style={styles.success}>{resetMessage}</div>}<button disabled={busy} style={{...styles.button,opacity:busy?.65:1}}>{busy?<InlineSpinner size={16} />:copy.sendReset}</button></form><div style={styles.switcher} onClick={()=>{setForgotMode(false);setError('');setResetMessage('')}}>{copy.backLogin}</div></> : <><div style={styles.tabs}><button type="button" onClick={()=>{setMode('register');setError('')}} style={mode==='register'?styles.tabActive:styles.tab}>{copy.register}</button><button type="button" onClick={()=>{setMode('login');setError('')}} style={mode==='login'?styles.tabActive:styles.tab}>{copy.login}</button><button type="button" onClick={()=>window.location.assign('/api/auth/login')} style={styles.tab}>{copy.deriv}</button></div><form onSubmit={submit}>{mode==='register'&&<label style={styles.label}>{copy.name}<input value={name} onChange={e=>setName(e.target.value)} style={styles.input} autoComplete="name" required minLength={2}/></label>}<label style={styles.label}>{copy.email}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={styles.input} autoComplete="email" required/></label><label style={styles.label}>{copy.password}<input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={styles.input} autoComplete={mode==='register'?'new-password':'current-password'} required minLength={8}/></label>{mode==='register'&&<label style={styles.label}>{copy.confirm}<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} style={styles.input} autoComplete="new-password" required minLength={8}/></label>}{error&&<div style={styles.error}>{error}</div>}<button disabled={busy} style={{...styles.button,opacity:busy?.65:1}}>{busy?<InlineSpinner size={16} />:mode==='register'?copy.create:copy.enter}</button></form>{mode==='login'&&<div style={styles.forgot} onClick={()=>{setForgotMode(true);setResetEmail(email);setError('');setResetMessage('')}}>{copy.forgot}</div>}<div style={styles.switcher} onClick={()=>setMode(mode==='register'?'login':'register')}>{mode==='register'?copy.have:copy.no}</div></>}</section><footer style={styles.footer}>{copy.risk}</footer></div></main>;
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:'100dvh',display:'flex',alignItems:'stretch',justifyContent:'center',padding:'16px 16px 10px',boxSizing:'border-box',background:'#ffffff',color:'#171717',fontFamily:"'IBM Plex Sans',sans-serif"},
  contentWrap:{width:'min(100%,390px)',minHeight:'calc(100dvh - 26px)',display:'flex',flexDirection:'column',justifyContent:'space-between',gap:14},
  card:{position:'relative',width:'100%',padding:'22px 18px',boxSizing:'border-box',borderRadius:12,background:'#ffffff',border:'1px solid #e2e5e8',boxShadow:'0 16px 45px rgba(0,0,0,.08)'},
  topBar:{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:10,marginBottom:16},brand:{display:'flex',alignItems:'center',gap:11,marginBottom:0,flex:1,minWidth:0},mark:{width:48,height:48,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',fontSize:23,fontWeight:700,background:'#ff444f',color:'#fff',flexShrink:0},brandName:{fontSize:24,fontWeight:700,letterSpacing:'-.04em',color:'#171717'},hyper:{color:'#ff444f'},sub:{marginTop:5,color:'#7b8085',fontSize:8,fontWeight:600,letterSpacing:'.16em'},welcome:{marginBottom:10,textAlign:'left',color:'#22a447',fontSize:12,fontWeight:700},title:{fontSize:18,margin:'18px 0 8px',color:'#171717'},intro:{color:'#626970',fontSize:12,lineHeight:1.5},label:{display:'block',color:'#4f565d',fontSize:11,fontWeight:600,marginBottom:10},input:{display:'block',width:'100%',boxSizing:'border-box',marginTop:5,padding:'12px 11px',borderRadius:7,border:'1px solid #cfd4d9',background:'#fff',color:'#171717',outline:'none'},button:{width:'100%',minHeight:48,border:0,borderRadius:8,cursor:'pointer',color:'#fff',fontSize:12,fontWeight:700,background:'#ff444f',marginTop:6,display:'flex',alignItems:'center',justifyContent:'center',gap:8},tabs:{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:5,marginBottom:18},tab:{border:0,borderRadius:7,padding:9,background:'#f0f2f4',color:'#687078',cursor:'pointer',fontWeight:700},tabActive:{border:0,borderRadius:7,padding:9,background:'#ff444f',color:'#fff',cursor:'pointer',fontWeight:700},divider:{height:1,background:'#e2e5e8',margin:'20px 0 14px'},muted:{textAlign:'center',color:'#697078',fontSize:10},link:{display:'block',textAlign:'center',marginTop:7,color:'#ff444f',fontSize:12,fontWeight:700,textDecoration:'none'},error:{padding:9,borderRadius:7,background:'#fff2f3',border:'1px solid #ffc5c9',color:'#d92f3b',fontSize:10,marginBottom:10},success:{padding:9,borderRadius:7,background:'#effaf2',border:'1px solid #b8e5c2',color:'#208a3c',fontSize:10,marginBottom:10},switcher:{textAlign:'center',color:'#ff444f',fontSize:10,fontWeight:700,cursor:'pointer',marginTop:13},forgot:{textAlign:'right',color:'#ff444f',fontSize:10,fontWeight:700,cursor:'pointer',marginTop:11},footer:{padding:'10px 10px',textAlign:'center',color:'#d92f3b',fontSize:8.5,lineHeight:1.5,border:'1px solid #ff444f',borderRadius:8,background:'#fff7f7',boxSizing:'border-box'},lang:{display:'flex',gap:3,padding:3,borderRadius:8,background:'#fff',border:'1px solid #dfe3e6',flexShrink:0},langBtn:{border:0,borderRadius:6,padding:'5px 6px',background:'transparent',cursor:'pointer',opacity:.65},langActive:{background:'#f1f3f5',opacity:1},flag:{fontSize:16,lineHeight:1},
};
