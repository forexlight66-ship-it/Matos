'use client';

import { useEffect, useState, type CSSProperties } from 'react';

// Dados ilustrativos do painel de demonstração (não são resultados reais).
const DEMO_DIGITS = [9, 12, 8, 11, 10, 14, 7, 10, 9, 10];
const DEMO_GREEN_DIGITS = [0, 2, 8];
const DEMO_RED_DIGITS = [1, 3, 7, 9];
const DEMO_CURRENT_DIGIT = 5;

type Props = { onChoose: (mode: 'register' | 'login') => void };

export default function LandingPage({ onChoose }: Props) {
  const demoMax = Math.max(...DEMO_DIGITS);
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
          <div className="mh-eyebrow mh-badge mh-tagline-badge"><i /> <span className="mh-tagline-white">CADA DÍGITO CONTA,</span> <span className="mh-tagline-red">TU DECIDES</span></div>
          <h1>A plataforma completa para operar na <span>Deriv</span></h1>
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
              <div><small>Conta</small><span className="mh-demo-account">Real <i>⌄</i></span></div>
              <div><small>Estratégia</small><span className="mh-demo-select">Hypercover <i>⌄</i></span></div>
            </div>

            <div className="mh-demo-card mh-demo-chart-card">
              <div className="mh-demo-digits-top">
                <span className="mh-demo-current">DÍGITO: <b>{DEMO_CURRENT_DIGIT}</b></span>
                <span className="mh-demo-live"><i />ABERTO</span>
                <span className="mh-demo-ticks">100 ticks</span>
                <span className="mh-demo-lightning" aria-label="Sinal ilustrativo" title="Sinal ilustrativo">ϟ</span>
              </div>
              <div className="mh-demo-bars">
                {DEMO_DIGITS.map((pct, digit) => (
                  <div
                    key={digit}
                    className={`mh-demo-bar${DEMO_GREEN_DIGITS.includes(digit) ? ' is-green' : ''}${DEMO_RED_DIGITS.includes(digit) ? ' is-red' : ''}${digit === DEMO_CURRENT_DIGIT ? ' is-current' : ''}`}
                    style={{ '--h': `${(pct / demoMax) * 100}%`, '--i': digit } as CSSProperties}
                  >
                    <span className="mh-demo-pct">{pct}%</span>
                    <span className="mh-demo-col" />
                    <span className="mh-demo-n">{digit}</span>
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


        .mh-demo{--u:clamp(.76px,.245vw,1.05px);width:100%;min-width:0;margin-top:calc(24 * var(--u));padding:calc(16 * var(--u));border:1px solid #dbe2ea;border-radius:calc(20 * var(--u));background:linear-gradient(150deg,#fff 0%,#f7f9fc 100%);box-shadow:0 calc(18 * var(--u)) calc(42 * var(--u)) rgba(23,32,51,.09);overflow:hidden;color:#172033}
        .mh-demo *{box-sizing:border-box;min-width:0}
        .mh-demo-head{display:flex;align-items:center;justify-content:space-between;gap:calc(8 * var(--u));flex-wrap:nowrap;margin-bottom:calc(12 * var(--u))}
        .mh-demo-title{font-size:calc(15 * var(--u));font-weight:800;letter-spacing:calc(-.25 * var(--u));color:#202a3b;white-space:nowrap}
        .mh-demo-tag{display:inline-flex;align-items:center;padding:calc(7 * var(--u)) calc(8 * var(--u));border:1px solid #dfe7ef;border-radius:calc(7 * var(--u));background:#f4f7fb;color:#718095;font-size:calc(10 * var(--u));font-weight:800;white-space:nowrap;flex:none}
        .mh-demo-stats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(10 * var(--u))}
        .mh-demo-card{min-width:0;padding:calc(12 * var(--u));border:1px solid #e3e9f0;border-radius:calc(12 * var(--u));background:#fff;box-shadow:0 calc(3 * var(--u)) calc(9 * var(--u)) rgba(23,32,51,.025)}
        .mh-demo-card>small{display:block;color:#7b8798;font-size:calc(11 * var(--u));line-height:1.35}
        .mh-demo-stats .mh-demo-card{min-height:calc(86 * var(--u));padding:calc(11 * var(--u)) calc(10 * var(--u))}
        .mh-demo-stats .mh-demo-card>strong{display:block;margin-top:calc(6 * var(--u));color:#172033;font:700 calc(24 * var(--u))/1.15 'JetBrains Mono',monospace;letter-spacing:calc(-.6 * var(--u));white-space:nowrap;font-variant-numeric:tabular-nums}
        .mh-demo-stats .mh-demo-card>strong.mh-demo-up{color:#12966d}
        .mh-demo-stats .mh-demo-card>em{display:block;margin-top:calc(5 * var(--u));color:#91a0b1;font-size:calc(9 * var(--u));line-height:1.3;font-style:normal;white-space:nowrap}
        .mh-demo-setup{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:calc(10 * var(--u));margin-top:calc(10 * var(--u))}
        .mh-demo-setup>div{min-width:0}
        .mh-demo-account{display:inline-flex;align-items:center;gap:calc(10 * var(--u));margin-top:calc(6 * var(--u));padding:calc(8 * var(--u)) calc(1 * var(--u));color:#253246;font-size:calc(14 * var(--u));font-weight:800;white-space:nowrap}
        .mh-demo-account i{font-style:normal;color:#8591a2;font-size:calc(14 * var(--u))}
        .mh-demo-select{display:flex;align-items:center;justify-content:space-between;gap:calc(6 * var(--u));margin-top:calc(6 * var(--u));padding:calc(9 * var(--u));border:1px solid #e2e8ef;border-radius:calc(8 * var(--u));background:#eef2f7;color:#253246;font-size:calc(14 * var(--u));font-weight:800;white-space:nowrap}
        .mh-demo-select i{font-style:normal;color:#8591a2;font-size:calc(14 * var(--u))}
        .mh-demo-chart-card{margin-top:calc(10 * var(--u));padding:calc(14 * var(--u))}
        .mh-demo-digits-top{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:calc(8 * var(--u));white-space:nowrap}
        .mh-demo-current{display:inline-flex;align-items:center;gap:calc(5 * var(--u));color:#30394a;font-size:calc(12 * var(--u));font-weight:800;letter-spacing:0;white-space:nowrap}
        .mh-demo-current b{display:inline-grid;place-items:center;min-width:0;height:auto;padding:0;border-radius:0;background:transparent;color:#ff444f;font-size:calc(27 * var(--u))}
        .mh-demo-live{display:inline-flex;align-items:center;gap:calc(4 * var(--u));padding:0;border-radius:0;background:transparent;color:#ff444f;font-size:calc(12 * var(--u));font-weight:900;letter-spacing:0;white-space:nowrap}
        .mh-demo-live>i{display:none}
        .mh-demo-ticks{color:#596273;font-size:calc(12 * var(--u));font-weight:700;white-space:nowrap}
        .mh-demo-lightning{display:inline-grid;place-items:center;width:calc(42 * var(--u));height:calc(42 * var(--u));border:1px solid #d9dee6;border-radius:calc(13 * var(--u));background:#fff;color:#30394a;font-size:calc(24 * var(--u));font-weight:900;line-height:1}
        .mh-demo-bars{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:calc(6 * var(--u));align-items:stretch;height:calc(165 * var(--u));margin-top:calc(14 * var(--u));padding:0}
        .mh-demo-bar{display:grid;grid-template-rows:calc(22 * var(--u)) minmax(0,1fr) calc(24 * var(--u));align-items:stretch;min-width:0;height:100%}
        .mh-demo-pct{display:block;align-self:start;justify-self:center;color:#8a94a4;font-size:calc(11 * var(--u));font-weight:700;line-height:1;white-space:nowrap}
        .mh-demo-col{display:block;align-self:end;justify-self:center;width:calc(30 * var(--u));max-width:100%;height:var(--h);min-height:calc(5 * var(--u));border-radius:calc(7 * var(--u)) calc(7 * var(--u)) calc(2 * var(--u)) calc(2 * var(--u));background:#cbd3dd;transform-origin:center bottom;animation:mh-demo-bar-rise .76s cubic-bezier(.2,.75,.25,1) calc(var(--i,0)*55ms) both}
        .mh-demo-bar.is-green .mh-demo-col{background:#18b68b}
        .mh-demo-bar.is-red .mh-demo-col{background:#ff4054}
        .mh-demo-bar.is-green .mh-demo-pct{color:#159c79}
        .mh-demo-bar.is-red .mh-demo-pct{color:#d84959}
        .mh-demo-bar.is-current .mh-demo-col{outline:none;box-shadow:none;background:#cbd3dd}
        .mh-demo-n{display:grid;place-items:center;align-self:end;justify-self:center;min-width:calc(17 * var(--u));padding:calc(2 * var(--u)) calc(1 * var(--u));border-radius:calc(5 * var(--u));color:#687588;font-size:calc(13 * var(--u));font-weight:700;line-height:calc(18 * var(--u));text-align:center}
        .mh-demo-bar.is-current .mh-demo-n{background:transparent;color:#172033}
        .mh-demo-trade{display:flex;flex:0 0 calc(225 * var(--u));min-width:0;min-height:calc(220 * var(--u));flex-direction:column;align-items:flex-start;justify-content:flex-start;gap:calc(8 * var(--u));padding:calc(20 * var(--u));border:1px solid #e0e6ed;border-radius:calc(22 * var(--u));background:#fff;scroll-snap-align:start}
        .mh-demo-trade svg{display:block;width:calc(18 * var(--u));height:calc(30 * var(--u));margin-bottom:calc(4 * var(--u))}
        .mh-demo-trade>b{font-size:calc(26 * var(--u));font-weight:900;letter-spacing:0;line-height:1.1}
        .mh-demo-trade>span{min-width:0;max-width:100%;overflow:hidden;color:#697789;font-size:calc(15 * var(--u));text-overflow:ellipsis;white-space:nowrap}
        .mh-demo-trade>strong{margin-top:calc(8 * var(--u));font-size:calc(26 * var(--u));font-weight:900;text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
        .mh-demo-trade.win,.mh-demo-trade.loss{border-color:#e0e6ed;background:#fff}
        .mh-demo-trade.win>b,.mh-demo-trade.win>strong{color:#18a97f}
        .mh-demo-trade.loss>b,.mh-demo-trade.loss>strong{color:#ff4054}
        @keyframes mh-demo-bar-rise{from{transform:scaleY(0);opacity:.45}to{transform:scaleY(1);opacity:1}}
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


        /* Ajustes mobile: impedir cortes no cabeçalho, evitar sobreposição no painel
           demonstrativo e reduzir os espaços verticais excessivos. */
        @media(max-width:760px){
          .mh-nav{height:72px;padding:0 12px;gap:6px}
          .mh-brand{gap:7px;min-width:0}
          .mh-brand>img{width:36px;height:36px;border-radius:11px}
          .mh-brand-copy{min-width:0;gap:2px}
          .mh-brand-copy strong{font-size:18px;letter-spacing:-.6px;white-space:nowrap}
          .mh-brand-copy small{font-size:7px;letter-spacing:.3px;white-space:nowrap}
          .mh-nav-actions{flex:none;gap:5px}
          .mh-nav-actions .mh-login{padding:9px 9px;font-size:10px;white-space:nowrap}
          .mh-nav-actions .mh-small{padding:10px 8px;font-size:10px;gap:4px;white-space:nowrap;flex:none}
          .mh-hero-simple{min-height:auto;padding:24px 16px 24px}
          .mh-hero-simple .mh-hero-copy{width:100%;max-width:none}
          .mh-hero-simple h1{margin:15px 0 12px;line-height:1.13;letter-spacing:-1.6px}
          .mh-hero-simple .mh-lead{line-height:1.65}
          .mh-demo{margin-top:16px}
          .mh-demo-head{align-items:flex-start;flex-wrap:wrap;gap:7px;margin-bottom:11px}
          .mh-demo-title{flex:1 1 170px;white-space:normal;overflow-wrap:anywhere;font-size:calc(13 * var(--u));line-height:1.3}
          .mh-demo-tag{font-size:calc(9 * var(--u));padding:calc(6 * var(--u)) calc(7 * var(--u));}
          .mh-main-cta{margin-top:17px;min-height:48px}
          .mh-service-cards{margin-top:14px;gap:10px}
          .mh-security-note{margin-top:12px}
        }
        @media(max-width:390px){
          .mh-nav{padding-left:9px;padding-right:9px;gap:4px}
          .mh-brand{gap:5px}
          .mh-brand>img{width:32px;height:32px}
          .mh-brand-copy strong{font-size:16px;letter-spacing:-.5px}
          .mh-brand-copy small{font-size:6px;letter-spacing:.2px}
          .mh-nav-actions{gap:4px}
          .mh-nav-actions .mh-login{padding:8px 7px;font-size:9px}
          .mh-nav-actions .mh-small{padding:9px 7px;font-size:9px}
        }


        /* Identidade do novo slogan: fundo escuro, texto branco e destaque vermelho MozHyper. */
        .mh-landing .mh-tagline-badge{
          display:inline-flex!important;align-items:center;flex-wrap:wrap;gap:5px;
          padding:9px 15px;border:1px solid #ff444f!important;border-radius:999px;
          background:#ff444f!important;color:#fff!important;box-shadow:none!important;
          font-size:10px;font-weight:900;letter-spacing:.55px;line-height:1.5;
        }
        .mh-landing .mh-tagline-badge>i{background:#fff!important;flex:none}
        .mh-landing .mh-tagline-white,
        .mh-landing .mh-tagline-red{color:#fff!important}
        .mh-landing .mh-hero-simple h1{max-width:100%;overflow-wrap:normal}
        .mh-landing .mh-hero-simple h1 span{color:#ff444f!important}
        @media(max-width:760px){
          .mh-landing .mh-tagline-badge{font-size:9px;padding:8px 11px;gap:4px;letter-spacing:.3px}
          .mh-landing .mh-hero-simple h1{margin-top:15px;line-height:1.13}
        }

      `}</style>
    </main>
  );
}
