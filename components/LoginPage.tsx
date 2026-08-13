// components/LoginPage.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';

const DERIV_SIGNUP_URL = 'https://track.deriv.com/_xhgntjGPYQ7xidYl18iLj2Nd7ZgqdRLk/1/';
const redDeriv=(text:string)=>{const parts=text.split(/(Deriv)/g);return <>{parts.map((p,i)=>p==='Deriv'?<span key={i} style={{color:'#ef4444'}}>{p}</span>:p)}</>};

export default function LoginPage(){
 const {language,setLanguage,t}=useLanguage();
 const lang=language==='pt'?'pt':language==='es'?'es':'en';
 const copy={
 en:{subtitle:'Sign in with your Deriv account to start trading.',login:'Login with Deriv',noAccount:"Don't have a Deriv account?",signup:'Create Deriv account →',note:'Your credentials are securely handled via OAuth 2.0.',risk:'Risk warning:',riskText:'Trading derivatives (including synthetic indices and Forex) involves significant risk and may not be suitable for all investors. Past performance does not guarantee future results and you may lose all invested capital. MozHyper is an independent interface and is not affiliated with, endorsed by, or operated by Deriv. All trades are executed directly on your Deriv account and are subject to Deriv terms, conditions and risk policies.'},
 pt:{subtitle:'Entre com a sua conta Deriv para começar a negociar.',login:'Entrar com Deriv',noAccount:'Não tem uma conta Deriv?',signup:'Criar conta Deriv →',note:'As suas credenciais são tratadas com segurança através do OAuth 2.0.',risk:'Aviso de risco:',riskText:'A negociação de derivados (incluindo índices sintéticos e Forex) envolve risco significativo e pode não ser adequada para todos os investidores. Rentabilidades passadas não garantem resultados futuros e é possível perder todo o capital investido. A MozHyper é uma interface independente, não afiliada, endossada ou operada pela Deriv. Todas as operações são executadas diretamente na sua conta Deriv, sujeitas aos termos, condições e políticas de risco da própria Deriv.'},
 es:{subtitle:'Inicia sesión con tu cuenta Deriv para comenzar a operar.',login:'Iniciar sesión con Deriv',noAccount:'¿No tienes una cuenta Deriv?',signup:'Crear cuenta Deriv →',note:'Tus credenciales se gestionan de forma segura mediante OAuth 2.0.',risk:'Aviso de riesgo:',riskText:'La negociación de derivados (incluidos índices sintéticos y Forex) implica un riesgo significativo y puede no ser adecuada para todos los inversores. Los resultados pasados no garantizan resultados futuros y puedes perder todo el capital invertido. MozHyper es una interfaz independiente y no está afiliada, respaldada ni operada por Deriv. Todas las operaciones se ejecutan directamente en tu cuenta Deriv y están sujetas a sus términos, condiciones y políticas de riesgo.'}
 }[lang];
 return <main className="moz-login-page"><div className="login-bg-base"/><div className="login-blob login-blob-blue"/><div className="login-blob login-blob-gold"/><div className="login-blob login-blob-violet"/><div className="login-grid"/><div className="login-noise"/>
 <div className="moz-login-card"><div className="moz-lang-switch" aria-label="Language">{(['en','pt','es'] as const).map(item=><button key={item} type="button" className={lang===item?'active':''} onClick={()=>setLanguage(item)}>{item.toUpperCase()}</button>)}</div>
 <div className="moz-login-brand"><div className="moz-login-mark">M</div><div><div className="moz-login-name">Moz<span>Hyper</span></div><div className="moz-login-sub">DIGITS TRADING</div></div></div>
 <p className="moz-login-intro">{redDeriv(t('loginSubtitle')||copy.subtitle)}</p>
 <button type="button" className="moz-login-btn" onClick={()=>window.location.assign('/api/auth/login')}>🔒 {redDeriv(t('loginWithDeriv')||copy.login)}</button>
 <div className="moz-login-divider"/><div className="moz-signup-row">{redDeriv(copy.noAccount)}</div><a href={DERIV_SIGNUP_URL} className="moz-signup-link" target="_blank" rel="noopener noreferrer">{redDeriv(copy.signup)}</a><div className="moz-oauth-note">{copy.note}</div></div>
 <div className="moz-risk-card"><p><strong>{copy.risk}</strong> {redDeriv(copy.riskText)}</p></div></main>;
}
