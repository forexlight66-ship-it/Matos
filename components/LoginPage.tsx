// components/LoginPage.tsx
'use client';

import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_SIGNUP_URL = 'https://t.deriv.link?t=JAZWN4WCY6JS';
const redDeriv = (text: string) => { const parts = text.split(/(Deriv)/g); return <>{parts.map((p, i) => p === 'Deriv' ? <span key={i} style={{ color: '#ff4d5f' }}>{p}</span> : p)}</>; };

const css: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', width: '100%', position: 'relative', overflowX: 'hidden', overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '28px 16px 22px', background: '#070b16', color: '#f5f7fb', fontFamily: 'Inter, system-ui, sans-serif', gap: 12 },
  glowBlue: { position: 'absolute', width: 420, height: 420, borderRadius: '50%', background: 'rgba(55,125,255,.20)', filter: 'blur(80px)', top: -170, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'none' },
  glowGold: { position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'rgba(245,185,66,.10)', filter: 'blur(75px)', bottom: -120, right: -100, pointerEvents: 'none' },
  grid: { position: 'absolute', inset: 0, opacity: .16, backgroundImage: 'linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px),linear-gradient(90deg,rgba(255,255,255,.07) 1px,transparent 1px)', backgroundSize: '38px 38px', maskImage: 'linear-gradient(to bottom, black, transparent 78%)', pointerEvents: 'none' },
  card: { position: 'relative', zIndex: 2, width: 'min(100%, 430px)', padding: '30px 24px 24px', borderRadius: 28, background: 'linear-gradient(180deg, rgba(19,28,48,.96), rgba(10,15,28,.98))', border: '1px solid rgba(255,255,255,.10)', boxShadow: '0 35px 90px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05)', backdropFilter: 'blur(20px)' },
  lang: { position: 'absolute', right: 16, top: 16, display: 'flex', gap: 4, padding: 4, borderRadius: 10, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.07)' },
  brand: { display: 'flex', alignItems: 'center', gap: 13, marginTop: 20, marginBottom: 26 },
  mark: { width: 58, height: 58, borderRadius: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 27, fontWeight: 800, color: '#fff', background: 'linear-gradient(145deg,#4c8dff,#2452c9)', boxShadow: '0 12px 28px rgba(43,102,238,.38), inset 0 1px 0 rgba(255,255,255,.28)' },
  brandName: { fontSize: 25, lineHeight: 1, fontWeight: 800, letterSpacing: '-.04em' },
  blue: { color: '#3d7fff' }, sub: { marginTop: 7, color: '#74809b', fontSize: 9, fontWeight: 800, letterSpacing: '.20em' },
  intro: { color: '#b4bed3', fontSize: 14, lineHeight: 1.6, margin: '0 0 18px' },
  button: { width: '100%', minHeight: 54, border: 0, borderRadius: 15, cursor: 'pointer', color: '#fff', fontSize: 14, fontWeight: 800, background: 'linear-gradient(135deg,#3d7fff,#2858d4)', boxShadow: '0 12px 28px rgba(42,94,220,.30)' },
  divider: { height: 1, background: 'rgba(255,255,255,.07)', margin: '23px 0 18px' }, signup: { textAlign: 'center', color: '#8d99b2', fontSize: 12 }, signupLink: { display: 'block', textAlign: 'center', marginTop: 8, color: '#5e98ff', fontSize: 13, fontWeight: 800, textDecoration: 'none' },
  note: { marginTop: 18, padding: '11px 12px', borderRadius: 11, background: 'rgba(255,255,255,.035)', border: '1px solid rgba(255,255,255,.06)', color: '#68758f', textAlign: 'center', fontSize: 10, lineHeight: 1.5 },
  risk: { position: 'relative', zIndex: 2, width: 'min(100%, 900px)', padding: '11px 15px', borderRadius: 13, background: 'rgba(240,73,90,.07)', border: '1px solid rgba(240,73,90,.22)', color: '#aa7885', fontSize: 9.5, lineHeight: 1.55, textAlign: 'left' },
};

export default function LoginPage() {
  const { language, setLanguage, t } = useLanguage();
  const lang = language === 'pt' ? 'pt' : language === 'es' ? 'es' : 'en';
  const copy = {
    en: { subtitle: 'Sign in with your Deriv account to start trading.', login: 'Login with Deriv', noAccount: "Don't have a Deriv account?", signup: 'Create Deriv account →', note: 'Your credentials are securely handled via OAuth 2.0.', risk: 'Risk warning: +🔞', riskText: 'Trading derivatives (including synthetic indices and Forex) involves significant risk and may not be suitable for all investors. Past performance does not guarantee future results and you may lose all invested capital. MozHyper is an independent interface and is not affiliated with, endorsed by, or operated by Deriv. All trades are executed directly on your Deriv account and are subject to Deriv terms, conditions and risk policies.' },
    pt: { subtitle: 'Entre com a sua conta Deriv para começar a negociar.', login: 'Entrar com Deriv', noAccount: 'Não tem uma conta Deriv?', signup: 'Criar conta Deriv →', note: 'As suas credenciais são tratadas com segurança através do OAuth 2.0.', risk: 'Aviso de risco: +🔞', riskText: 'A negociação de derivados (incluindo índices sintéticos e Forex) envolve risco significativo e pode não ser adequada para todos os investidores. Rentabilidades passadas não garantem resultados futuros e é possível perder todo o capital investido. A MozHyper é uma interface independente, não afiliada, endossada ou operada pela Deriv. Todas as operações são executadas diretamente na sua conta Deriv, sujeitas aos termos, condições e políticas de risco da própria Deriv.' },
    es: { subtitle: 'Inicia sesión con tu cuenta Deriv para comenzar a operar.', login: 'Iniciar sesión con Deriv', noAccount: '¿No tienes una cuenta Deriv?', signup: 'Crear cuenta Deriv →', note: 'Tus credenciales se gestionan de forma segura mediante OAuth 2.0.', risk: 'Aviso de riesgo: +🔞', riskText: 'La negociación de derivados (incluidos índices sintéticos y Forex) implica un riesgo significativo y puede no ser adecuada para todos los inversores. Los resultados pasados no garantizan resultados futuros y puedes perder todo el capital invertido. MozHyper es una interfaz independiente y no está afiliada, respaldada ni operada por Deriv. Todas las operaciones se ejecutan directamente en tu cuenta Deriv y están sujetas a sus términos, condiciones y políticas de riesgo.' }
  }[lang];

  return <main style={css.page}>
    <div style={css.glowBlue} /><div style={css.glowGold} /><div style={css.grid} />
    <section style={css.card}>
      <div style={css.lang} aria-label="Language">{(['en','pt','es'] as const).map(item => <button key={item} type="button" onClick={() => setLanguage(item)} style={{ border:0,borderRadius:7,padding:'5px 7px',cursor:'pointer',color:lang===item?'#fff':'#75819b',background:lang===item?'#315fc9':'transparent',fontSize:9,fontWeight:800 }}>{item.toUpperCase()}</button>)}</div>
      <div style={css.brand}><div style={css.mark}>M</div><div><div style={css.brandName}>Moz<span style={css.blue}>Hyper</span></div><div style={css.sub}>DIGITS TRADING</div></div></div>
      <p style={css.intro}>{redDeriv(t('loginSubtitle') || copy.subtitle)}</p>
      <button type="button" style={css.button} onClick={() => window.location.assign('/api/auth/login')}>🔒 &nbsp;{redDeriv(t('loginWithDeriv') || copy.login)}</button>
      <div style={css.divider} /><div style={css.signup}>{redDeriv(copy.noAccount)}</div><a href={DERIV_SIGNUP_URL} style={css.signupLink} target="_blank" rel="noopener noreferrer">{redDeriv(copy.signup)}</a><div style={css.note}>✓ &nbsp;{copy.note}</div>
    </section>
    <div style={css.risk}><strong style={{ color:'#f47787' }}>{copy.risk}</strong> &nbsp;{redDeriv(copy.riskText)}</div>
  </main>;
}
