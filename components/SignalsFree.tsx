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
          width: 30,
          height: 30,
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
          width={30}
          height={30}
          style={{ display: 'block', width: 30, height: 30, objectFit: 'cover' }}
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
            background: 'rgba(0,0,0,.68)',
            backdropFilter: 'blur(4px)',
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
              borderRadius: 18,
              padding: '26px 22px 22px',
              color: light ? '#172033' : '#f5f7fb',
              background: light ? '#ffffff' : '#111827',
              border: '1px solid ' + (light ? '#e5e7eb' : '#374151'),
              boxShadow: '0 24px 70px rgba(0,0,0,.35)',
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
              background: 'linear-gradient(145deg,#087ec2,#07519b)',
              fontSize: 27,
            }} aria-hidden="true">📊</div>
            <h2 id="signals-intro-title" style={{ fontSize: 21, lineHeight: 1.3, fontWeight: 800, margin: '0 0 12px' }}>
              Tenha acesso a sinais de Forex grátis!
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.65, margin: '0 0 22px', color: light ? '#4b5563' : '#d1d5db' }}>
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
                borderRadius: 11,
                background: '#1687d9',
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
                color: light ? '#6b7280' : '#9ca3af',
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
