// components/LoginPage.tsx

'use client';

import { useLanguage } from '@/contexts/LanguageContext';
import LanguageSelector from './LanguageSelector';

const DERIV_SIGNUP_URL = 'https://track.deriv.com/_xhgntjGPYQ7xidYl18iLj2Nd7ZgqdRLk/1/';

export default function LoginPage() {
  const { t } = useLanguage();

  return (
    <div className="matos-auth">
      <div className="auth-card">
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <LanguageSelector />
        </div>

        <div className="auth-brand">
          <div className="brand-mark">M</div>
          <div>
            <h1 className="auth-title">Moz<span style={{ color: 'var(--blue)' }}>Hyper</span></h1>
            <div style={{ color: 'var(--t3)', fontSize: 9, letterSpacing: '.08em' }}>DIGITS TRADING</div>
          </div>
        </div>

        <p className="auth-subtitle">
          {t('loginSubtitle') || 'Entre com a sua conta Deriv para abrir o painel de negociação.'}
        </p>

        <button
          onClick={() => { window.location.href = '/api/auth/login'; }}
          className="auth-btn"
        >
          🔐 {t('loginWithDeriv') || 'Entrar com Deriv'}
        </button>

        <div className="signup">
          <p>Não tem uma conta Deriv?</p>
          <a href={DERIV_SIGNUP_URL} target="_blank" rel="noopener noreferrer">
            Criar conta Deriv →
          </a>
        </div>

        <div className="auth-note">
          {t('loginDisclaimer') || 'A autenticação é feita pela Deriv. O MozHyper não recebe a sua palavra-passe.'}
        </div>
      </div>
    </div>
  );
}
