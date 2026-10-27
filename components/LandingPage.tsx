'use client';

import { useEffect, useState, type CSSProperties } from 'react';

// Dados ilustrativos do painel de demonstração (não são resultados reais).
const DEMO_DIGITS = [9, 12, 8, 11, 10, 14, 7, 10, 9, 10];
const DEMO_CURRENT_DIGIT = 5;
const DEMO_HISTORY = [
  { win: true, bot: 'HyperFlow B9', value: '+2.11 $' },
  { win: false, bot: 'HyperDrive', value: '−0.35 $' },
  { win: true, bot: 'HyperFlows', value: '+4.52 $' },
];

type Props = { onChoose: (mode: 'register' | 'login') => void };

export default function LandingPage({ onChoose }: Props) {
  const demoMax = Math.max(...DEMO_DIGITS);
  const demoMin = Math.min(...DEMO_DIGITS);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <main className="mh-landing">
      <header className={`mh-nav ${scrolled ? 'mh-nav-scrolled' : ''}`}>
        <a className="mh-brand" href="#inicio" aria-label="MozHyper — início">
          <img src="/icon.svg?v=2" alt="" width="44" height="44" />
          <span className="mh-brand-copy"><strong>Moz<span>Hyper</span></strong><small>NEGOCIA MAIS RÁPIDO</small></span>
        </a>
        <div className="mh-nav-actions">
          <button className="mh-login" onClick={() => onChoose('login')}>Iniciar sessão</button>
          <button className="mh-primary mh-small" onClick={() => onChoose('register')}>Criar conta <span aria-hidden="true">↗</span></button>
        </div>
      </header>

      <section className="mh-hero mh-hero-simple" id="inicio">
        <div className="mh-hero-copy">
          <div className="mh-eyebrow mh-badge"><i /> PLATAFORMA DE NEGOCIAÇÃO E ANÁLISE</div>
          <h1>Conheça os seus sinais.<br /><span>Controle as suas operações.</span></h1>
          <p className="mh-lead">O MozHyper reúne robôs de negociação, análise de dígitos e ferramentas para acompanhar as operações num único painel, com ligação à sua conta Deriv.</p>

          <div className="mh-demo" role="img" aria-label="Pré-visualização ilustrativa do painel MozHyper, com dados de exemplo">
            <div className="mh-demo-head">
              <span className="mh-demo-title">Demonstração do painel MozHyper</span>
              <span className="mh-demo-tag">Dados ilustrativos</span>
            </div>

            <div className="mh-demo-stats">
              <div className="mh-demo-card"><small>Saldo</small><strong>200.00 $</strong></div>
              <div className="mh-demo-card"><small>Lucro/Perda</small><strong className="mh-demo-up">+42.17 $</strong><em>Operações fechadas: 25</em></div>
            </div>

            <div className="mh-demo-card mh-demo-setup">
              <div><small>Conta</small><span className="mh-demo-select">Real <i>⌄</i></span></div>
              <div><small>Estratégia</small><span className="mh-demo-select">HyperFlows <i>⌄</i></span></div>
            </div>

            <div className="mh-demo-card mh-demo-chart-card">
              <div className="mh-demo-digits-top">
                <span className="mh-demo-current">DÍGITO: <b>{DEMO_CURRENT_DIGIT}</b></span>
                <span className="mh-demo-live"><i />ABERTO</span>
                <span className="mh-demo-ticks">100 ticks</span>
              </div>
              <div className="mh-demo-bars">
                {DEMO_DIGITS.map((pct, digit) => (
                  <div
                    key={digit}
                    className={`mh-demo-bar${pct === demoMax ? ' is-max' : ''}${pct === demoMin ? ' is-min' : ''}${digit === DEMO_CURRENT_DIGIT ? ' is-current' : ''}`}
                    style={{ '--h': `${(pct / demoMax) * 100}%`, '--i': digit } as CSSProperties}
                  >
                    <span className="mh-demo-pct">{pct}%</span>
                    <span className="mh-demo-col" />
                    <span className="mh-demo-n">{digit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mh-demo-card mh-demo-history">
              <div className="mh-demo-history-head">HISTÓRICO RECENTE</div>
              <div className="mh-demo-history-list">
                {DEMO_HISTORY.map((trade, i) => (
                  <div key={i} className={`mh-demo-trade ${trade.win ? 'win' : 'loss'}`}>
                    <svg viewBox="0 0 12 26" aria-hidden="true"><path d="M6 0v26" stroke="currentColor" strokeWidth="1.6" /><rect x="2" y="6" width="8" height="14" rx="2" fill="currentColor" /></svg>
                    <b>{trade.win ? 'GANHO' : 'PERDA'}</b>
                    <span>{trade.bot}</span>
                    <strong>{trade.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button className="mh-primary mh-main-cta" onClick={() => onChoose('register')}>Criar conta MozHyper Gratuita <span aria-hidden="true">↗</span></button>

          <div className="mh-service-cards">
            <button className="mh-service-card" onClick={() => onChoose('login')}>
              <span className="mh-service-copy">
                <strong>Depositar e levantar dinheiro na sua conta Deriv por e-Mola ou M-Pesa</strong>
                <span className="mh-payment-icons">
                  <i className="mh-mpesa-logo" aria-label="M-Pesa"><svg viewBox="0 0 120 110" role="img" aria-hidden="true"><rect x="35" y="8" width="48" height="75" rx="9" fill="none" stroke="white" strokeWidth="7"/><path d="M43 68h32M49 90h8m7 0h8" stroke="white" strokeWidth="6" strokeLinecap="round"/><path d="M18 47c22 3 40-5 58-27l22 13C80 61 50 64 18 47Z" fill="#62a844"/><circle cx="94" cy="20" r="13" fill="white"/><path d="m87 20 5 5 9-12" fill="none" stroke="#ed1c2e" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></svg><b>m-pesa</b></i>
                  <i className="mh-emola-logo" aria-label="e-Mola"><svg viewBox="0 0 120 110" role="img" aria-hidden="true"><rect x="30" y="25" width="47" height="62" rx="9" fill="none" stroke="white" strokeWidth="7"/><path d="M38 72h30M48 17c9-13 23-9 24 2" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round"/><path d="m70 32 26 25-16 17-26-26Z" fill="white"/><path d="m61 45 22 22" stroke="#f47b20" strokeWidth="5"/></svg><b>e-Mola</b></i>
                </span>
              </span>
              <span className="mh-service-arrow" aria-hidden="true">↗</span>
            </button>
            <a className="mh-service-card mh-signals-card" href="#" onClick={(event) => { event.preventDefault(); onChoose('register'); }}>
              <span className="mh-service-copy">
                <strong>Sinais Gratuitos de Boom1000/XAUUSD &amp; Forex</strong>
                <span className="mh-signal-action"><i aria-hidden="true">↗</i><b>Aceder Agora</b></span>
              </span>
            </a>
          </div>
          <p className="mh-security-note"><span aria-hidden="true">🔒</span> Ligação segura • A negociação envolve risco financeiro.</p>
        </div>
      </section>

      <style jsx global>{`
        .mh-landing{--mh-red:#ff444f;--mh-red-dark:#e63240;--mh-red-soft:#fff0f1;--mh-text:#172033;--mh-muted:#697589;--mh-border:#dbe2ea;--mh-panel:#fff;background:#f5f7fb;color:var(--mh-text);font-family:Inter,Arial,sans-serif;overflow:hidden;min-height:100vh}
        .mh-landing *{box-sizing:border-box}
        .mh-nav{height:82px;padding:0 clamp(20px,6vw,88px);display:flex;align-items:center;justify-content:space-between;gap:22px;position:sticky;top:0;z-index:50;background:rgba(245,247,251,.96);border-bottom:1px solid transparent;transition:border-color .2s,box-shadow .2s}
        .mh-nav-scrolled{border-color:var(--mh-border);box-shadow:0 8px 24px rgba(23,32,51,.05)}
        .mh-brand{display:flex;align-items:center;gap:10px;flex:none;color:var(--mh-text);text-decoration:none}
        .mh-brand>img{display:block;width:44px;height:44px;border-radius:13px;object-fit:cover}
        .mh-brand-copy{display:flex;flex-direction:column;gap:2px}
        .mh-brand-copy strong{font:700 22px/1.1 'Space Grotesk',Inter,sans-serif;letter-spacing:-.8px}
        .mh-brand-copy strong span{color:var(--mh-red)}
        .mh-brand-copy small{font:500 9px/1.4 Inter,sans-serif;letter-spacing:.7px;color:#8a94a4}
        .mh-nav-links{display:flex;align-items:center;gap:clamp(14px,2.2vw,30px)}
        .mh-nav-links a{font-size:12px;font-weight:600;text-decoration:none;color:#626e80;white-space:nowrap}
        .mh-nav-links a:hover{color:var(--mh-red)}
        .mh-nav-actions{display:flex;align-items:center;gap:8px}
        .mh-landing button{font-family:inherit;cursor:pointer}
        .mh-login{padding:12px 16px;font-size:12px;font-weight:800;white-space:nowrap}
        .mh-login:hover{color:var(--mh-red)}
        .mh-primary{display:inline-flex;align-items:center;justify-content:center;gap:12px;border:1px solid var(--mh-red);border-radius:12px;padding:14px 19px;background:var(--mh-red);color:#fff;font-size:13px;font-weight:800;box-shadow:0 7px 18px rgba(255,68,79,.17);transition:background .18s,transform .18s,box-shadow .18s}
        .mh-primary:hover{background:var(--mh-red-dark);border-color:var(--mh-red-dark);transform:translateY(-1px);box-shadow:0 10px 22px rgba(255,68,79,.22)}
        .mh-primary span{font-size:15px}.mh-small{padding:11px 14px;font-size:11px;border-radius:10px}
        .mh-hero{display:grid;grid-template-columns:minmax(0,1.02fr) minmax(0,.98fr);gap:clamp(30px,5vw,72px);align-items:center;padding:75px clamp(24px,7vw,104px) 82px;background:linear-gradient(180deg,#f5f7fb,#fff 86%);border-bottom:1px solid var(--mh-border)}
        .mh-hero-copy{max-width:610px}
        .mh-eyebrow{display:flex;align-items:center;gap:9px;color:#707d8f;font-size:10px;font-weight:800;letter-spacing:1.1px;line-height:1.6}
        .mh-eyebrow i{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--mh-red);flex:none}
        .mh-hero h1{font:700 clamp(36px,4.1vw,59px)/1.12 'Space Grotesk',Inter,sans-serif;letter-spacing:-2.3px;margin:22px 0 20px;color:#172033}
        .mh-hero h1 span,.mh-section-intro h2 span,.mh-steps-intro h2 span{color:var(--mh-red)}
        .mh-lead{max-width:540px;margin:0;color:#687588;font-size:15px;line-height:1.85}
        .mh-hero-actions{display:flex;flex-wrap:wrap;align-items:center;gap:13px;margin-top:28px}
        .mh-secondary{border:1px solid var(--mh-red);border-radius:12px;background:var(--mh-red);color:#fff;padding:13px 16px;font-size:12px;font-weight:800;box-shadow:0 7px 18px rgba(255,68,79,.17)}
        .mh-secondary:hover{background:var(--mh-red-dark);border-color:var(--mh-red-dark);color:#fff;transform:translateY(-1px)}
        .mh-hero-note{display:flex;align-items:center;gap:12px;margin-top:30px}
        .mh-note-mark{width:36px;height:36px;display:grid;place-items:center;border-radius:11px;background:var(--mh-red-soft);color:var(--mh-red);font-weight:800}
        .mh-hero-note strong,.mh-hero-note small{display:block}.mh-hero-note strong{font-size:11px;color:#384458}.mh-hero-note small{margin-top:5px;font-size:10px;line-height:1.5;color:#8a94a4}
        .mh-preview-wrap{min-width:0}
        .mh-preview-card{background:#fff;border:1px solid #d7e0e9;border-radius:20px;padding:20px;box-shadow:0 24px 60px rgba(33,47,71,.09)}
        .mh-preview-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:17px;border-bottom:1px solid #edf0f4}
        .mh-preview-brand{display:flex;align-items:center;gap:9px}.mh-preview-brand img{width:32px;height:32px;border-radius:9px}
        .mh-preview-brand strong,.mh-preview-brand small{display:block}.mh-preview-brand strong{font-size:13px}.mh-preview-brand small{margin-top:3px;font-size:9px;color:#8a94a4}
        .mh-preview-tag{font-size:8px;letter-spacing:.5px;font-weight:800;color:#8a94a4;background:#f1f4f8;padding:7px 8px;border-radius:7px;white-space:nowrap}
        .mh-preview-stats{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}
        .mh-preview-stats>div{padding:14px;border:1px solid #e4e9ef;border-radius:12px;background:#fbfcfe;min-width:0}
        .mh-preview-stats span,.mh-preview-stats strong,.mh-preview-stats small{display:block}
        .mh-preview-stats span{font-size:10px;color:#7b8798}.mh-preview-stats strong{margin-top:6px;font:700 24px 'JetBrains Mono',monospace;color:#172033}.mh-preview-stats strong.mh-neutral{color:#707d8f}.mh-preview-stats small{margin-top:5px;font-size:8px;color:#96a0af;line-height:1.45}
        .mh-preview-controls{display:grid;grid-template-columns:.75fr 1.25fr;gap:12px;margin-top:12px}
        .mh-preview-controls>div{border:1px solid #e4e9ef;background:#fff;border-radius:11px;padding:12px;min-width:0}
        .mh-preview-controls span,.mh-preview-controls strong{display:block}.mh-preview-controls span{font-size:9px;color:#7b8798}.mh-preview-controls strong{margin-top:8px;font-size:11px;color:#202a3b}.mh-preview-controls strong b{float:right;color:#8a94a4}
        .mh-digit-panel{margin-top:12px;border:1px solid #e4e9ef;border-radius:12px;padding:13px;background:#fff}
        .mh-digit-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.mh-digit-head strong{font-size:11px}.mh-digit-head span{font-size:8px;color:#8a94a4}
        .mh-digits{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:7px;align-items:end;height:83px;padding-top:14px}
        .mh-digit{height:100%;display:flex;align-items:center;justify-content:flex-end;flex-direction:column;gap:6px;min-width:0}
        .mh-digit-bar{width:min(100%,22px);min-height:4px;border-radius:4px 4px 2px 2px;background:#cbd4df}.mh-digit-bar.muted{background:#cbd4df}.mh-digit-bar.red{background:#ff7a82}.mh-digit-bar.accent{background:#ff444f}
        .mh-digit>span{font-size:8px;color:#7b8798}
        .mh-preview-foot{display:flex;align-items:center;gap:6px;margin-top:11px;padding-top:10px;border-top:1px solid #edf0f4;font-size:8px;line-height:1.5;color:#8a94a4}
        .mh-preview-foot i,.mh-preview-action>span:first-child i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#98a3b3;flex:none}
        .mh-preview-action{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px}.mh-preview-action>span:first-child{display:flex;align-items:center;gap:7px;font-size:9px;color:#7b8798}
        .mh-preview-button{padding:9px 12px;border-radius:8px;background:#ff444f;color:#fff;font-size:9px;font-weight:800;opacity:.92}
        .mh-preview-caption{margin:10px 5px 0;font-size:9px;line-height:1.55;color:#8993a3}

        .mh-demo{width:100%;margin-top:24px;padding:14px;border:1px solid #dbe2ea;border-radius:20px;background:linear-gradient(150deg,#fff 0%,#f7f9fc 100%);box-shadow:0 18px 42px rgba(23,32,51,.09);overflow:hidden;color:#172033}
        .mh-demo-head{display:flex;align-items:center;justify-content:space-between;gap:9px;flex-wrap:wrap;margin-bottom:12px}
        .mh-demo-title{font-size:clamp(12px,3.1vw,15px);font-weight:800;letter-spacing:-.25px;color:#202a3b}
        .mh-demo-tag{display:inline-flex;align-items:center;padding:6px 8px;border:1px solid #dfe7ef;border-radius:7px;background:#f4f7fb;color:#718095;font-size:8px;font-weight:800;white-space:nowrap}
        .mh-demo-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
        .mh-demo-card{min-width:0;padding:12px;border:1px solid #e3e9f0;border-radius:12px;background:#fff;box-shadow:0 3px 9px rgba(23,32,51,.025)}
        .mh-demo-card>small{display:block;color:#7b8798;font-size:10px;line-height:1.4}
        .mh-demo-stats .mh-demo-card{min-height:86px;padding:11px 10px}
        .mh-demo-stats .mh-demo-card>strong{display:block;margin-top:6px;color:#172033;font:700 clamp(18px,5vw,24px)/1.15 'JetBrains Mono',monospace;letter-spacing:-.9px;white-space:nowrap;font-variant-numeric:tabular-nums}
        .mh-demo-stats .mh-demo-card>strong.mh-demo-up{color:#12966d}
        .mh-demo-stats .mh-demo-card>em{display:block;margin-top:5px;color:#91a0b1;font-size:8px;line-height:1.4;font-style:normal}
        .mh-demo-setup{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:10px;margin-top:10px}
        .mh-demo-setup>div{min-width:0}
        .mh-demo-select{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:6px;padding:8px 9px;border:1px solid #e2e8ef;border-radius:8px;background:#fbfcfe;color:#253246;font-size:11px;font-weight:800;white-space:nowrap}
        .mh-demo-select i{font-style:normal;color:#8591a2;font-size:12px}
        .mh-demo-chart-card{margin-top:10px;padding:12px 10px 10px}
        .mh-demo-digits-top{display:flex;align-items:center;justify-content:space-between;gap:7px;flex-wrap:wrap}
        .mh-demo-current{display:inline-flex;align-items:center;gap:5px;color:#6d7a8c;font-size:9px;font-weight:800;letter-spacing:.3px;white-space:nowrap}
        .mh-demo-current b{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 4px;border-radius:6px;background:#fff0f1;color:#e63240;font-size:10px}
        .mh-demo-live{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border-radius:7px;background:#ecfbf5;color:#0b946a;font-size:8px;font-weight:900;letter-spacing:.45px;white-space:nowrap}
        .mh-demo-live>i{display:block;width:6px;height:6px;border-radius:50%;background:#13b887;animation:mh-demo-pulse 1.3s ease-in-out infinite}
        .mh-demo-ticks{color:#8994a4;font-size:9px;white-space:nowrap}
        .mh-demo-bars{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:4px;align-items:stretch;height:119px;margin-top:10px;padding:0 1px}
        .mh-demo-bar{display:grid;grid-template-rows:12px minmax(0,1fr) 18px;align-items:stretch;min-width:0;height:100%}
        .mh-demo-pct{display:block;align-self:start;justify-self:center;color:#7f8b9b;font-size:clamp(6px,1.85vw,8px);font-weight:700;line-height:1;white-space:nowrap}
        .mh-demo-col{display:block;align-self:end;justify-self:center;width:min(100%,16px);height:var(--h);min-height:5px;border-radius:4px 4px 1px 1px;background:#cbd4df;transform-origin:center bottom;animation:mh-demo-bar-rise .76s cubic-bezier(.2,.75,.25,1) calc(var(--i,0)*55ms) both}
        .mh-demo-bar.is-max .mh-demo-col{background:#13b887}
        .mh-demo-bar.is-min .mh-demo-col{background:#ff737d}
        .mh-demo-n{align-self:end;justify-self:center;min-width:17px;padding:2px 1px;border-radius:5px;color:#687588;font-size:9px;font-weight:700;line-height:14px;text-align:center}
        .mh-demo-bar.is-current .mh-demo-col{outline:2px solid #ff444f;outline-offset:1px}
        .mh-demo-bar.is-current .mh-demo-n{background:#ff444f;color:#fff}
        .mh-demo-history{margin-top:10px}
        .mh-demo-history-head{margin-bottom:9px;color:#718095;font-size:9px;font-weight:900;letter-spacing:.65px}
        .mh-demo-history-list{display:grid;gap:7px}
        .mh-demo-trade{display:grid;grid-template-columns:10px auto minmax(0,1fr) auto;align-items:center;gap:8px;min-width:0;padding:8px 9px;border:1px solid #e6edf3;border-radius:9px;background:#fcfdff}
        .mh-demo-trade svg{display:block;width:9px;height:20px}
        .mh-demo-trade>b{font-size:8px;font-weight:900;letter-spacing:.2px}
        .mh-demo-trade>span{min-width:0;overflow:hidden;color:#697789;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
        .mh-demo-trade>strong{font-size:10px;font-weight:900;text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
        .mh-demo-trade.win{border-color:#d8f1e6;background:#f3fcf8;color:#13956b}
        .mh-demo-trade.loss{border-color:#f4dfe2;background:#fff7f7;color:#e63240}
        @keyframes mh-demo-bar-rise{from{transform:scaleY(0);opacity:.45}to{transform:scaleY(1);opacity:1}}
        @keyframes mh-demo-pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(19,184,135,.2)}50%{opacity:.45;box-shadow:0 0 0 4px rgba(19,184,135,0)}}
        @media(max-width:460px){.mh-demo{margin-top:20px;padding:11px;border-radius:16px}.mh-demo-head{gap:7px}.mh-demo-title{font-size:12px}.mh-demo-card{padding:10px}.mh-demo-stats{gap:7px}.mh-demo-stats .mh-demo-card{padding:10px 8px;min-height:80px}.mh-demo-stats .mh-demo-card>strong{font-size:clamp(18px,5.1vw,21px);letter-spacing:-1px}.mh-demo-setup{grid-template-columns:minmax(0,.85fr) minmax(0,1.15fr);gap:7px}.mh-demo-setup .mh-demo-select{padding:8px 7px;font-size:10px}.mh-demo-chart-card{padding:10px 8px}.mh-demo-bars{gap:3px;height:112px}.mh-demo-trade{grid-template-columns:9px auto minmax(0,1fr) auto;gap:6px;padding:8px 7px}.mh-demo-trade>span{font-size:9px}.mh-demo-trade>strong{font-size:9px}}
        @media(prefers-reduced-motion:reduce){.mh-demo .mh-demo-col,.mh-demo .mh-demo-live>i{animation:none!important;transition:none!important;transform:none!important;opacity:1!important}.mh-demo .mh-demo-col{height:var(--h)!important}}
        .mh-intro-band{display:grid;grid-template-columns:1.1fr .9fr;gap:55px;align-items:center;padding:62px clamp(24px,9vw,132px);background:#fff;border-bottom:1px solid var(--mh-border)}
        .mh-section-kicker{display:block;margin-bottom:10px;color:var(--mh-red);font-size:9px;font-weight:800;letter-spacing:1.6px}
        .mh-intro-band h2,.mh-section-intro h2,.mh-steps-intro h2{margin:0;font:700 clamp(27px,3vw,39px)/1.2 'Space Grotesk',Inter,sans-serif;letter-spacing:-1.2px;color:#172033}
        .mh-intro-band h2 span{color:var(--mh-red)}.mh-intro-band>p{font-size:12px;line-height:1.9;color:#6c788b;margin:0}
        .mh-feature-section{padding:82px clamp(24px,7vw,104px) 92px;background:#f5f7fb;border-bottom:1px solid var(--mh-border)}
        .mh-section-intro{max-width:690px;margin:0 auto 36px;text-align:center}.mh-section-intro .mh-eyebrow{justify-content:center}
        .mh-section-intro h2{margin-top:16px}.mh-section-intro>p{margin:14px auto 0;max-width:580px;color:#6c788b;font-size:12px;line-height:1.8}
        .mh-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:15px;max-width:1120px;margin:auto}
        .mh-feature{padding:25px 23px;border:1px solid #dce3eb;border-radius:15px;background:#fff;box-shadow:0 10px 28px rgba(30,44,66,.035)}
        .mh-feature-icon{width:39px;height:39px;display:grid;place-items:center;border-radius:11px;background:var(--mh-red-soft);color:var(--mh-red);font:800 11px 'JetBrains Mono',monospace;margin-bottom:24px}
        .mh-feature>small{color:#7d899a;font-size:8px;font-weight:800;letter-spacing:1.1px}.mh-feature h3{margin:11px 0 8px;font-size:16px;letter-spacing:-.3px;color:#202b3d}.mh-feature p{margin:0;color:#6e7a8c;font-size:11px;line-height:1.85}
        .mh-steps-section{display:grid;grid-template-columns:.9fr 1.1fr;gap:70px;align-items:center;padding:82px clamp(24px,9vw,132px);background:#fff;border-bottom:1px solid var(--mh-border)}
        .mh-steps-intro h2{margin-top:15px}.mh-steps-intro>p{max-width:420px;color:#6e7a8c;font-size:12px;line-height:1.85;margin:14px 0 22px}
        .mh-steps{display:grid;gap:12px}.mh-steps article{display:grid;grid-template-columns:38px 1fr;gap:13px;align-items:start;border:1px solid #e0e6ed;border-radius:13px;padding:16px;background:#fff}
        .mh-steps article>b{width:32px;height:32px;display:grid;place-items:center;border-radius:10px;background:var(--mh-red-soft);color:var(--mh-red);font-size:12px}
        .mh-steps h3{margin:1px 0 5px;font-size:12px;color:#202b3d}.mh-steps p{margin:0;color:#788497;font-size:10px;line-height:1.65}
        .mh-risk-section{display:grid;grid-template-columns:48px 1fr auto;align-items:center;gap:18px;padding:42px clamp(24px,7vw,104px);background:#fff6f6;border-bottom:1px solid #f4d9dc}
        .mh-risk-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#ffe3e5;color:var(--mh-red);font-size:22px;font-weight:900}
        .mh-risk-copy .mh-eyebrow{font-size:8px;color:#b34a54}.mh-risk-copy h2{margin:8px 0;font-size:18px;color:#252c39}.mh-risk-copy p{max-width:800px;margin:0;color:#6c6670;font-size:10px;line-height:1.8}
        .mh-outline{border:1px solid #f0a3a9;border-radius:11px;background:#fff;color:#dc3545;padding:12px 14px;font-size:10px;font-weight:800;white-space:nowrap}.mh-outline:hover{background:#fff0f1}
        .mh-footer{display:flex;align-items:center;justify-content:space-between;gap:22px;padding:23px clamp(20px,6vw,88px);background:#f5f7fb;color:#8590a0;font-size:9px}
        .mh-footer .mh-brand>img{width:36px;height:36px;border-radius:10px}.mh-footer .mh-brand-copy strong{font-size:17px}.mh-footer .mh-brand-copy small{font-size:7px}
        .mh-footer-actions{display:flex;align-items:center;gap:14px}.mh-footer-actions button{border:0;background:transparent;color:#697589;font-size:9px}.mh-footer-actions b{color:var(--mh-red)}
        @media(max-width:1060px){.mh-nav{padding:0 22px;gap:12px}.mh-nav-links{gap:13px}.mh-nav-links a{font-size:10px}.mh-brand-copy strong{font-size:19px}.mh-brand>img{width:39px;height:39px}.mh-hero{padding:58px 30px;gap:28px}.mh-hero h1{font-size:clamp(34px,4.5vw,47px);letter-spacing:-1.8px}.mh-intro-band{padding:50px 42px;gap:30px}.mh-steps-section{padding:60px 42px;gap:35px}}
        @media(max-width:760px){.mh-nav{height:72px;padding:0 14px;gap:8px}.mh-brand{gap:7px}.mh-brand>img{width:36px;height:36px;border-radius:10px}.mh-brand-copy strong{font-size:18px}.mh-brand-copy small{font-size:7px;letter-spacing:.3px}.mh-nav-links{display:none}.mh-nav-actions{gap:2px}.mh-login{font-size:10px;padding:10px 7px;white-space:nowrap}.mh-small{font-size:10px;padding:10px 9px;gap:5px}.mh-hero{grid-template-columns:1fr;padding:42px 19px 38px;gap:28px}.mh-hero h1{font-size:clamp(33px,9.1vw,45px);letter-spacing:-1.6px;margin:18px 0 15px}.mh-eyebrow{font-size:8px;letter-spacing:.75px}.mh-lead{font-size:12px;line-height:1.8}.mh-hero-actions{display:grid;grid-template-columns:1fr;gap:9px;margin-top:22px}.mh-primary,.mh-secondary{width:100%;min-height:45px}.mh-hero-note{margin-top:21px}.mh-preview-card{padding:13px;border-radius:15px}.mh-preview-stats{gap:7px}.mh-preview-stats>div{padding:10px}.mh-preview-stats strong{font-size:21px}.mh-preview-controls{gap:7px;grid-template-columns:.78fr 1.22fr}.mh-preview-controls>div{padding:10px}.mh-preview-controls strong{font-size:9px}.mh-digit-head strong{font-size:10px}.mh-digit-head span{font-size:7px}.mh-digits{gap:4px}.mh-digit>span{font-size:7px}.mh-digit-bar{width:15px}.mh-preview-action>span:first-child{font-size:8px}.mh-preview-button{padding:9px;font-size:8px}.mh-preview-caption{font-size:8px}.mh-intro-band{grid-template-columns:1fr;gap:16px;padding:44px 21px}.mh-intro-band h2,.mh-section-intro h2,.mh-steps-intro h2{font-size:28px}.mh-intro-band>p{font-size:11px}.mh-feature-section{padding:54px 19px 60px}.mh-section-intro{margin-bottom:25px}.mh-section-intro>p{font-size:11px}.mh-features{grid-template-columns:1fr;gap:10px}.mh-feature{padding:19px}.mh-feature-icon{margin-bottom:15px}.mh-feature h3{font-size:15px}.mh-feature p{font-size:10px}.mh-steps-section{grid-template-columns:1fr;gap:24px;padding:53px 20px}.mh-steps-intro>p{font-size:11px}.mh-steps article{padding:13px}.mh-risk-section{grid-template-columns:38px 1fr;gap:12px;padding:28px 19px}.mh-risk-icon{width:36px;height:36px}.mh-risk-copy h2{font-size:16px;line-height:1.35}.mh-risk-copy p{font-size:9px}.mh-outline{grid-column:1/-1;white-space:normal;width:100%}.mh-footer{flex-wrap:wrap;padding:19px;gap:13px}.mh-footer>span{order:3;width:100%;line-height:1.6}.mh-footer-actions{margin-left:auto;gap:7px}.mh-footer-actions button{font-size:8px;padding:5px 0}}
        @media(prefers-reduced-motion:reduce){.mh-landing *{scroll-behavior:auto!important;transition:none!important}}


        .mh-login{border:0;background:transparent;color:#394457;padding:12px 14px;font-size:12px;font-weight:700;box-shadow:none}
        .mh-login:hover{color:var(--mh-red);background:transparent;transform:none;box-shadow:none}

        .mh-nav-actions .mh-login{border:1px solid #dbe2ea;background:#fff;color:#293244;box-shadow:0 5px 14px rgba(23,32,51,.06)}
        .mh-nav-actions .mh-login:hover{border-color:#cbd3df;background:#f9fafc;color:#172033;transform:translateY(-1px)}
        .mh-nav-actions .mh-small{background:linear-gradient(145deg,#64748b,#374151);border-color:#64748b;box-shadow:0 8px 20px rgba(55,65,81,.18)}
        .mh-nav-actions .mh-small:hover{background:#374151;border-color:#374151}


        .mh-landing{--mh-red:#ff444f;--mh-red-dark:#e63240;--mh-red-soft:#fff0f1}
        .mh-signals-card{display:flex!important;visibility:visible!important;opacity:1!important;min-height:145px!important;align-items:center!important;justify-content:space-between!important;border:1px solid #ff444f!important;background:#ff444f!important;background-color:#ff444f!important;color:#fff!important;box-shadow:0 7px 18px rgba(255,68,79,.18)!important;padding:17px 15px!important}
        .mh-signals-card *{visibility:visible!important;opacity:1!important}
        .mh-signals-card .mh-service-copy{display:block!important;flex:1!important;min-width:0!important}
        .mh-signals-card .mh-service-copy strong{display:block!important;color:#fff!important;font-size:14px!important;line-height:1.4!important}
        .mh-signals-card .mh-signal-action{display:flex!important;align-items:center!important;gap:8px!important;margin-top:13px!important}
        .mh-signals-card .mh-signal-action i{display:grid!important;place-items:center!important;background:rgba(255,255,255,.18)!important;color:#fff!important}
        .mh-signals-card .mh-signal-action b{display:block!important;flex:1!important;text-align:center!important;border:1px solid rgba(255,255,255,.65)!important;background:rgba(255,255,255,.08)!important;color:#fff!important;border-radius:10px!important;padding:10px 7px!important;font-size:11px!important}

        .mh-signals-card .mh-service-copy strong{color:#fff}
        .mh-signals-card .mh-signal-action i{background:rgba(255,255,255,.18);color:#fff}
        .mh-signals-card .mh-signal-action b{border-color:rgba(255,255,255,.65);background:rgba(255,255,255,.08);color:#fff}
        .mh-signals-card .mh-service-arrow{color:#fff}
        .mh-signals-card:hover{border-color:#e63240;background:#e63240;color:#fff}

        .mh-badge{background:#ff444f!important;border-color:#ff444f!important;color:#fff!important;box-shadow:none!important}
        .mh-badge i{background:#fff!important}
        .mh-main-cta{background:#ff444f!important;border-color:#ff444f!important;color:#fff!important;box-shadow:0 8px 20px rgba(255,68,79,.2)!important}
        .mh-main-cta:hover{background:#e63240!important;border-color:#e63240!important}
        .mh-nav-actions .mh-small{background:#ff444f!important;border-color:#ff444f!important;color:#fff!important}

        .mh-nav-actions .mh-small{background:var(--mh-red);border-color:var(--mh-red);box-shadow:0 8px 20px rgba(255,63,75,.22)}
        .mh-nav-actions .mh-small:hover{background:var(--mh-red-dark);border-color:var(--mh-red-dark)}
        .mh-badge{background:linear-gradient(100deg,#b30e1b,#ed1c2e);border:1px solid #f5a0a7;color:#fff}
        .mh-main-cta{background:linear-gradient(100deg,#ff444f,#d92330);border-color:#ed1c2e;box-shadow:0 9px 20px rgba(255,63,75,.25)}
        .mh-main-cta:hover{background:#c91827;border-color:#c91827}
        .mh-payment-icons{display:flex;gap:10px;margin-top:13px;width:100%}
        .mh-payment-icons i{display:flex;flex:1;min-width:0;min-height:112px;align-items:center;justify-content:center;flex-direction:column;gap:7px;border-radius:15px;border:2px solid rgba(255,255,255,.65);box-shadow:0 4px 12px rgba(23,32,51,.08);font-style:normal;padding:9px}
        .mh-payment-icons svg{display:block;width:min(100%,80px);height:66px}
        .mh-payment-icons b{font-size:13px;line-height:1;color:#fff;text-transform:none}
        .mh-mpesa-logo{background:#ed1c2e!important;color:#fff!important}
        .mh-emola-logo{background:#f47b20!important;color:#fff!important}
        .mh-demo-current-digit{color:#ff444f}
        @media(max-width:760px){.mh-payment-icons i{min-height:92px;border-radius:12px;padding:7px}.mh-payment-icons svg{height:52px}.mh-payment-icons b{font-size:11px}}
        .mh-hero-simple{display:flex;justify-content:center;min-height:calc(100vh - 82px);padding:42px clamp(20px,5vw,70px) 36px}
        .mh-hero-simple .mh-hero-copy{max-width:850px;width:100%}
        .mh-badge{display:inline-flex;background:linear-gradient(100deg,#9f111b,#d51f2b);color:#fff;border-radius:999px;padding:8px 15px;letter-spacing:.4px}
        .mh-badge i{background:#ffd06a}
        .mh-hero-simple .mh-hero h1{margin-top:19px}
        .mh-main-cta{display:flex;width:100%;margin-top:22px;min-height:54px;border-radius:12px;background:linear-gradient(100deg,#a60f19,#c91d28);border:1px solid #e6b8a1;box-shadow:0 9px 20px rgba(180,22,33,.19);font-size:15px}
        .mh-main-cta:hover{background:linear-gradient(100deg,#8e0b14,#b31420);border-color:#d6a18d}
        .mh-service-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:17px}
        .mh-service-card{display:flex;align-items:center;justify-content:space-between;gap:10px;min-width:0;text-align:left;padding:17px 15px;border:1px solid #dfe4eb;border-radius:16px;background:#fff;color:#172033;text-decoration:none;box-shadow:0 7px 18px rgba(23,32,51,.08);font-family:inherit;cursor:pointer;transition:border-color .18s,transform .18s,box-shadow .18s}
        .mh-service-card:hover{border-color:#e8a0a5;transform:translateY(-1px);box-shadow:0 10px 22px rgba(23,32,51,.1)}
        .mh-service-copy{display:block;min-width:0;flex:1}.mh-service-copy strong{display:block;font-size:14px;line-height:1.35;color:#171d29}
        .mh-service-arrow{color:#697589;font-size:17px;font-weight:800;flex:none}
        .mh-payment-icons{display:flex;gap:8px;margin-top:13px}.mh-payment-icons i{display:grid;place-items:center;width:37px;height:37px;border-radius:10px;background:#fff0f1;color:#c52230;font-size:14px;font-weight:900;font-style:normal}.mh-payment-icons i+ i{background:#e7f8ee;color:#15945c}
        .mh-signal-action{display:flex;align-items:center;gap:8px;margin-top:13px}.mh-signal-action i{display:grid;place-items:center;width:37px;height:37px;border-radius:10px;background:#eef1f8;color:#293244;font-style:normal;font-size:17px}.mh-signal-action b{flex:1;text-align:center;border:1px solid #dbe2ea;border-radius:10px;padding:10px 7px;color:#30394a;font-size:11px}
        .mh-security-note{text-align:center;margin:19px 0 0;color:#8a94a4;font-size:10px;line-height:1.6}
        @media(max-width:760px){.mh-hero-simple{min-height:calc(100vh - 72px);padding:32px 19px 30px}.mh-badge{font-size:8px;padding:7px 10px}.mh-main-cta{min-height:50px;margin-top:17px;font-size:13px;padding:12px}.mh-service-cards{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}.mh-service-card{align-items:flex-start;padding:13px 10px;border-radius:14px}.mh-service-copy strong{font-size:12px}.mh-service-arrow{display:none}.mh-payment-icons{margin-top:11px}.mh-payment-icons i,.mh-signal-action i{width:32px;height:32px}.mh-signal-action{gap:6px;flex-wrap:wrap}.mh-signal-action b{font-size:9px;padding:9px 5px}.mh-security-note{font-size:9px;margin-top:15px}}
        .mh-hero-simple{display:flex;justify-content:center;min-height:calc(100vh - 82px);padding-top:clamp(54px,9vh,100px);padding-bottom:58px}
        .mh-hero-simple .mh-hero-copy{max-width:820px;width:100%}
        .mh-hero-simple .mh-hero-actions{display:none}
        .mh-main-cta{margin-top:26px;min-width:260px;min-height:52px}
        .mh-service-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:25px;max-width:820px}
        .mh-service-card{display:flex;align-items:center;gap:13px;min-width:0;text-align:left;padding:19px;border:1px solid #dbe2ea;border-radius:15px;background:#fff;color:#172033;text-decoration:none;box-shadow:0 8px 24px rgba(23,32,51,.045);font-family:inherit;cursor:pointer;transition:border-color .18s,transform .18s,box-shadow .18s}
        .mh-service-card:hover{border-color:#ff9aa1;transform:translateY(-1px);box-shadow:0 12px 28px rgba(23,32,51,.08)}
        .mh-service-icon{display:grid;place-items:center;flex:none;width:42px;height:42px;border-radius:12px;background:#fff0f1;color:var(--mh-red);font-size:19px;font-weight:800}
        .mh-service-copy{display:block;min-width:0;flex:1}
        .mh-service-copy strong,.mh-service-copy small{display:block}
        .mh-service-copy strong{font-size:13px;line-height:1.4;color:#202a3b}
        .mh-service-copy small{margin-top:6px;font-size:10px;line-height:1.6;color:#788497}
        .mh-service-arrow{color:var(--mh-red);font-size:17px;font-weight:800;flex:none}
        .mh-risk-note{margin:20px 0 0;color:#8a94a4;font-size:10px;line-height:1.6}
        @media(max-width:760px){.mh-hero-simple{min-height:calc(100vh - 72px);padding:42px 19px 46px}.mh-hero-simple .mh-hero-copy{max-width:none}.mh-hero-simple .mh-hero-actions{display:none}.mh-main-cta{width:100%;margin-top:23px}.mh-service-cards{grid-template-columns:1fr;gap:11px;margin-top:18px}.mh-service-card{padding:15px}.mh-service-copy strong{font-size:12px}.mh-service-copy small{font-size:10px}.mh-risk-note{font-size:9px}}
        .mh-hero-simple{display:flex;justify-content:center;min-height:calc(100vh - 82px);padding-top:clamp(60px,10vh,115px);padding-bottom:70px}
        .mh-hero-simple .mh-hero-copy{max-width:850px;width:100%}
        .mh-hero-simple .mh-hero-actions{display:grid;grid-template-columns:1fr;max-width:620px}
        .mh-hero-simple .mh-secondary{line-height:1.5;text-align:center}
        .mh-signals-link{display:flex;align-items:center;gap:13px;max-width:620px;margin-top:18px;padding:17px 19px;border:1px solid var(--mh-red);border-radius:13px;background:var(--mh-red);color:#fff;text-decoration:none;box-shadow:0 7px 18px rgba(255,68,79,.17)}
        .mh-signals-link:hover{border-color:var(--mh-red-dark);background:var(--mh-red-dark);color:#fff}
        .mh-signals-icon{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:11px;background:rgba(255,255,255,.18);color:#fff;font-size:19px;font-weight:800}
        .mh-signals-link strong,.mh-signals-link small{display:block}
        .mh-signals-link strong{font-size:14px;line-height:1.45}
        .mh-signals-link small{margin-top:4px;color:rgba(255,255,255,.88);font-size:11px}
        @media(max-width:760px){.mh-hero-simple{min-height:calc(100vh - 72px);padding:42px 19px 50px}.mh-hero-simple .mh-hero-actions{max-width:none}.mh-hero-simple .mh-secondary{font-size:12px}.mh-signals-link{padding:15px}.mh-signals-link strong{font-size:12px}}
      `}</style>
    </main>
  );
}
