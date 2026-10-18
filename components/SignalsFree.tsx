'use client';

import { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';

const GROUP_URL = 'https://t.me/+S4A_5SgZB6x4P_UQ';

export default function SignalsFree({ light, onOpen }: { light: boolean; onOpen?: () => void }) {
  const { language } = useLanguage();
  const english = language === 'en';
  const [showIntro, setShowIntro] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => { onOpen?.(); setShowIntro(true); }}
        className="icon-btn signals-free-trigger"
        aria-label={english ? "View free Forex signals" : "Ver sinais de Forex grátis"}
        title={english ? "Free Forex signals" : "Sinais de Forex grátis"}
        style={{
          width: 24,
          height: 24,
          padding: 0,
          borderRadius: 6,
          overflow: 'hidden',
          border: 0,
          background: '#1976D2',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 48 48" role="img" aria-label="MetaTrader 5 logo" style={{ display: 'block', width: 24, height: 24 }}>
          <defs>
            <linearGradient id="mt5BlueTile" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#11A8E0"/><stop offset="100%" stopColor="#0756A5"/></linearGradient>
            <radialGradient id="mt5GreenBall" cx="32%" cy="22%" r="78%"><stop offset="0%" stopColor="#C9F7A5"/><stop offset="48%" stopColor="#64C94B"/><stop offset="100%" stopColor="#176B2D"/></radialGradient>
            <radialGradient id="mt5YellowBall" cx="28%" cy="20%" r="80%"><stop offset="0%" stopColor="#FFF78A"/><stop offset="52%" stopColor="#E7D72D"/><stop offset="100%" stopColor="#9B9412"/></radialGradient>
            <radialGradient id="mt5CyanBall" cx="28%" cy="20%" r="80%"><stop offset="0%" stopColor="#A7F1FF"/><stop offset="48%" stopColor="#35B8E7"/><stop offset="100%" stopColor="#075A9E"/></radialGradient>
            <linearGradient id="mt5Number" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#FFB15A"/><stop offset="100%" stopColor="#E66A2E"/></linearGradient>
          </defs>
          <rect width="48" height="48" rx="7" fill="url(#mt5BlueTile)"/>
          <path d="M0 12H48M0 24H48M0 36H48M12 0V48M24 0V48M36 0V48" stroke="#D9F5FF" strokeOpacity=".12" strokeWidth=".6"/>
          <circle cx="24" cy="19" r="13.4" fill="#236C2C" opacity=".95"/>
          <circle cx="24" cy="17.5" r="11.8" fill="url(#mt5GreenBall)" stroke="#28763A" strokeWidth="1.1"/>
          <circle cx="16.3" cy="29.2" r="12.5" fill="url(#mt5YellowBall)" stroke="#A6A11B" strokeWidth="1.1"/>
          <circle cx="31.8" cy="29.2" r="12.5" fill="url(#mt5CyanBall)" stroke="#1268A5" strokeWidth="1.1"/>
          <circle cx="24" cy="25.2" r="8.8" fill="#F7FAFC" stroke="#D3E0E9" strokeWidth="1.1"/>
          <text x="24" y="29.8" textAnchor="middle" fontSize="14.5" fontWeight="800" fontFamily="Arial, sans-serif" fill="url(#mt5Number)" stroke="#A64B23" strokeWidth=".25">5</text>
          <path d="M16 10.5C18 6.5 24 5 28 7" fill="none" stroke="#FFFFFF" strokeOpacity=".48" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>

      {showIntro && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowIntro(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
            background: 'rgba(25, 10, 14, .76)',
            backdropFilter: 'blur(7px)',
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="signals-intro-title"
            style={{
              width: '100%',
              maxWidth: 390,
              boxSizing: 'border-box',
              borderRadius: 22,
              padding: '28px 22px 22px',
              color: light ? '#20212a' : '#f8fafc',
              background: light ? 'linear-gradient(180deg,#fff 0%,#fff8f8 100%)' : 'linear-gradient(180deg,#21151a 0%,#15151b 100%)',
              border: '1px solid ' + (light ? '#ffd5d9' : '#51303a'),
              boxShadow: '0 28px 80px rgba(0,0,0,.42)',
              textAlign: 'center',
            }}
          >
            <div style={{
              width: 54,
              height: 54,
              margin: '0 auto 14px',
              borderRadius: 15,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(145deg,#ff5964,#d91f35)',
              boxShadow: '0 8px 22px rgba(217,31,53,.25)',
              fontSize: 27,
            }} aria-hidden="true">📊</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 12px', padding: '5px 11px', borderRadius: 999, background: light ? '#fff0f1' : '#3a1c24', color: light ? '#c91f35' : '#ff8792', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }}>{english ? "● FREE ACCESS" : "● ACESSO GRATUITO"}</div>
            <h2 id="signals-intro-title" style={{ fontSize: 22, lineHeight: 1.28, fontWeight: 850, margin: '0 0 12px', letterSpacing: '-.025em' }}>
              {english ? "Get access to free Forex signals!" : "Tenha acesso a sinais de Forex grátis!"}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, margin: '0 0 22px', color: light ? '#5b606b' : '#c8c5cb' }}>
              {english ? <>Get signals for <strong>XAUUSD</strong>, <strong>Boom 1000</strong>, <strong>Volatility 75</strong> and more — free in our Telegram group.</> : <>Receba sinais para <strong>XAUUSD</strong>, <strong>Boom 1000</strong>, <strong>Volatility 75</strong> e muito mais — gratuitamente no nosso grupo do Telegram.</>}
            </p>
            <a
              href={GROUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setShowIntro(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                minHeight: 48,
                boxSizing: 'border-box',
                borderRadius: 12,
                background: 'linear-gradient(135deg,#ff5964 0%,#e32942 55%,#c91835 100%)',
                boxShadow: '0 8px 18px rgba(217,31,53,.24)',
                color: '#ffffff',
                textDecoration: 'none',
                fontSize: 16,
                fontWeight: 800,
              }}
            >
              {english ? "Continue to Telegram" : "Continuar para o Telegram"}
            </a>
            <button
              type="button"
              onClick={() => setShowIntro(false)}
              style={{
                marginTop: 12,
                padding: '9px 16px',
                border: 0,
                background: 'transparent',
                color: light ? '#777984' : '#b9b3bb',
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              {english ? "Not now" : "Agora não"}
            </button>
          </section>
        </div>
      )}
    </>
  );
}
