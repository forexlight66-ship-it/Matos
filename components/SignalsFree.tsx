'use client';

import { useState } from 'react';

const GROUP_URL = 'https://t.me/+S4A_5SgZB6x4P_UQ';

export default function SignalsFree({ light }: { light: boolean }) {
  const [showIntro, setShowIntro] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowIntro(true)}
        className="icon-btn signals-free-trigger"
        aria-label="Ver sinais de forex grátis"
        title="Sinais de Forex grátis"
        style={{
          width: 24,
          height: 24,
          padding: 0,
          borderRadius: 9,
          overflow: 'hidden',
          border: '1px solid #3f8c43',
          background: 'linear-gradient(145deg,#087ec2,#07519b)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: 'pointer',
        }}
      >
        <img
          src="/signals-free.svg"
          alt=""
          width={24}
          height={24}
          style={{ display: 'block', width: 24, height: 24, objectFit: 'cover' }}
        />
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
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, margin: '0 0 12px', padding: '5px 11px', borderRadius: 999, background: light ? '#fff0f1' : '#3a1c24', color: light ? '#c91f35' : '#ff8792', fontSize: 11, fontWeight: 800, letterSpacing: '.09em', textTransform: 'uppercase' }}>● Acesso gratuito</div>
            <h2 id="signals-intro-title" style={{ fontSize: 22, lineHeight: 1.28, fontWeight: 850, margin: '0 0 12px', letterSpacing: '-.025em' }}>
              Tenha acesso a sinais de Forex grátis!
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, margin: '0 0 22px', color: light ? '#5b606b' : '#c8c5cb' }}>
              Receba sinais para <strong>XAUUSD</strong>, <strong>Boom 1000</strong>, <strong>Volatility 75</strong> e muito mais — gratuitamente no nosso grupo do Telegram.
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
              Continuar para o Telegram
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
              Agora não
            </button>
          </section>
        </div>
      )}
    </>
  );
}
