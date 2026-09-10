// components/LoginPage.tsx
'use client';

import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_SIGNUP_URL = 'https://t.deriv.link?t=JAZWN4WCY6JS';

const redDeriv = (text: string) => {
  const parts = text.split(/(Deriv)/g);
  return <>{parts.map((p, i) => p === 'Deriv' ? <span key={i} style={{ color: '#ff444f' }}>{p}</span> : p)}</>;
};

const css: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', width: '100%', position: 'relative', overflowX: 'hidden', overflowY: 'auto',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '24px 12px', boxSizing: 'border-box', background: '#0e0e0e', color: '#fff',
    fontFamily: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif"
  },
  card: {
    position: 'relative', zIndex: 2, width: 'min(100%, 380px)', boxSizing: 'border-box',
    padding: '20px 16px 16px', borderRadius: 12, background: '#151717', border: '1px solid #323738',
    boxShadow: '0 20px 50px rgba(0,0,0,.38)'
  },
  lang: {
    position: 'absolute', right: 12, top: 12, display: 'flex', gap: 3, padding: 3,
    borderRadius: 7, background: '#1b1d1d', border: '1px solid #323738'
  },
  brand: { display: 'flex', alignItems: 'center', gap: 11, marginTop: 12, marginBottom: 24 },
  mark: {
    width: 48, height: 48, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 23, fontWeight: 700, color: '#fff', background: '#ff444f', boxShadow: '0 8px 20px rgba(255,68,79,.20)'
  },
  brandName: { fontSize: 24, lineHeight: 1, fontWeight: 700, letterSpacing: '-.04em' },
  hyper: { color: '#ff444f' },
  sub: { marginTop: 6, color: '#6e6e6e', fontFamily: "'IBM Plex Mono', monospace", fontSize: 8, fontWeight: 600, letterSpacing: '.16em' },
  intro: { color: '#c2c2c2', fontSize: 13, lineHeight: 1.55, margin: '0 0 16px' },
  button: {
    width: '100%', minHeight: 50, border: '1px solid #ff444f', borderRadius: 8, cursor: 'pointer', color: '#fff',
    fontSize: 13, fontWeight: 700, background: '#ff444f', boxShadow: '0 10px 24px rgba(255,68,79,.18)'
  },
  divider: { height: 1, background: '#323738', margin: '20px 0 15px' },
  signup: { textAlign: 'center', color: '#6e6e6e', fontSize: 11 },
  signupLink: { display: 'block', textAlign: 'center', marginTop: 7, color: '#ff444f', fontSize: 12, fontWeight: 700, textDecoration: 'none' },
  note: {
    marginTop: 16, padding: '10px 11px', borderRadius: 7, background: '#1b1d1d',
    border: '1px solid #323738', color: '#8a8f8f', textAlign: 'center', fontSize: 9, lineHeight: 1.5
  },
  risk: {
    position: 'relative', zIndex: 2, width: 'min(100%, 700px)', boxSizing: 'border-box', marginTop: 10,
    padding: '10px 12px', borderRadius: 8, background: 'rgba(255,68,79,.06)', border: '1px solid rgba(255,68,79,.25)',
    color: '#8a7274', fontSize: 8.5, lineHeight: 1.5, textAlign: 'left'
  }
};

export default function LoginPage() {
  const { language, setLanguage, t } = useLanguage();
  const lang = language === 'pt' ? 'pt' : language === 'es' ? 'es' : 'en';
  const copy = {
    en: {
      subtitle: 'Sign in with your Deriv account to start trading.', login: 'Login with Deriv',
      noAccount: "Don't have a Deriv account?", signup: 'Create Deriv account →',
      note: 'Your credentials are securely handled via OAuth 2.0.', risk: 'Risk warning: +🔞',
      riskText: 'Trading derivatives (including synthetic indices and Forex) involves significant risk and may not be suitable for all investors. Past performance does not guarantee future results and you may lose all invested capital. MozHyper is an independent interface and is not affiliated with, endorsed by, or operated by Deriv. All trades are executed directly on your Deriv account and are subject to Deriv terms, conditions and risk policies.'
    },
    pt: {
      subtitle: 'Entre com a sua conta Deriv para começar a negociar.', login: 'Entrar com Deriv',
      noAccount: 'Não tem uma conta Deriv?', signup: 'Criar conta Deriv →',
      note: 'As suas credenciais são tratadas com segurança através do OAuth 2.0.', risk: 'Aviso de risco: +🔞',
      riskText: 'A negociação de derivados (incluindo índices sintéticos e Forex) envolve risco significativo e pode não ser adequada para todos os investidores. Rentabilidades passadas não garantem resultados futuros e é possível perder todo o capital investido. A MozHyper é uma interface independente, não afiliada, endossada ou operada pela Deriv. Todas as operações são executadas diretamente na sua conta Deriv, sujeitas aos termos, condições e políticas de risco da própria Deriv.'
    },
    es: {
      subtitle: 'Inicia sesión con tu cuenta Deriv para comenzar a operar.', login: 'Iniciar sesión con Deriv',
      noAccount: '¿No tienes una cuenta Deriv?', signup: 'Crear cuenta Deriv →',
      note: 'Tus credenciales se gestionan de forma segura mediante OAuth 2.0.', risk: 'Aviso de riesgo: +🔞',
      riskText: 'La negociación de derivados (incluidos índices sintéticos y Forex) implica un riesgo significativo y puede no ser adecuada para todos los inversores. Los resultados pasados no garantizan resultados futuros y puedes perder todo el capital invertido. MozHyper es una interfaz independiente y no está afiliada, respaldada ni operada por Deriv. Todas las operaciones se ejecutan directamente en tu cuenta Deriv y están sujetas a sus términos, condiciones y políticas de riesgo.'
    }
  }[lang];

  return (
    <main style={css.page}>
      <section style={css.card}>
        <div style={css.lang} aria-label="Language">
          {(['en', 'pt', 'es'] as const).map(item => (
            <button key={item} type="button" onClick={() => setLanguage(item)} style={{
              border: 0, borderRadius: 5, padding: '4px 6px', cursor: 'pointer',
              color: lang === item ? '#fff' : '#6e6e6e', background: lang === item ? '#ff444f' : 'transparent',
              fontSize: 8, fontWeight: 700
            }}>{item.toUpperCase()}</button>
          ))}
        </div>

        <div style={css.brand}>
          <div style={css.mark}>M</div>
          <div>
            <div style={css.brandName}>Moz<span style={css.hyper}>Hyper</span></div>
            <div style={css.sub}>DIGITS TRADING</div>
          </div>
        </div>

        <p style={css.intro}>{redDeriv(t('loginSubtitle') || copy.subtitle)}</p>
        <button type="button" style={css.button} onClick={() => window.location.assign('/api/auth/login')}>
          🔒 &nbsp;{redDeriv(t('loginWithDeriv') || copy.login)}
        </button>

        <div style={css.divider} />
        <div style={css.signup}>{redDeriv(copy.noAccount)}</div>
        <a href={DERIV_SIGNUP_URL} style={css.signupLink} target="_blank" rel="noopener noreferrer">{redDeriv(copy.signup)}</a>
        <div style={css.note}>✓ &nbsp;{copy.note}</div>
      </section>

      <div style={css.risk}><strong style={{ color: '#ff6972' }}>{copy.risk}</strong> &nbsp;{redDeriv(copy.riskText)}</div>
    </main>
  );
}
