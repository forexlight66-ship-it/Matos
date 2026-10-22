'use client';

import { useEffect, useState } from 'react';

type Props = { onChoose: (mode: 'register' | 'login') => void };

export default function LandingPage({ onChoose }: Props) {
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
        <nav className="mh-nav-links" aria-label="Navegação principal">
          <a href="#plataforma">Plataforma</a>
          <a href="#funcionalidades">Funcionalidades</a>
          <a href="#como-comecar">Como começar</a>
          <a href="#risco">Risco</a>
        </nav>
        <div className="mh-nav-actions">
          <button className="mh-login" onClick={() => onChoose('login')}>Iniciar sessão</button>
          <button className="mh-primary mh-small" onClick={() => onChoose('register')}>Criar conta <span aria-hidden="true">↗</span></button>
        </div>
      </header>

      <section className="mh-hero" id="inicio">
        <div className="mh-hero-copy">
          <div className="mh-eyebrow"><i /> PLATAFORMA DE NEGOCIAÇÃO E ANÁLISE</div>
          <h1>Conheça os seus sinais.<br /><span>Controle as suas operações.</span></h1>
          <p className="mh-lead">O MozHyper reúne robôs de negociação, análise de dígitos e ferramentas para acompanhar as operações num único painel, com ligação à sua conta Deriv.</p>
          <div className="mh-hero-actions">
            <button className="mh-primary" onClick={() => onChoose('register')}>Criar conta MozHyper <span aria-hidden="true">↗</span></button>
            <button className="mh-secondary" onClick={() => document.getElementById('funcionalidades')?.scrollIntoView({ behavior: 'smooth' })}>Conhecer funcionalidades <span aria-hidden="true">↓</span></button>
          </div>
          <div className="mh-hero-note"><span className="mh-note-mark">M</span><span><strong>Uma plataforma, várias ferramentas</strong><small>Consulte estratégias, análise e histórico num só lugar.</small></span></div>
        </div>

        <div className="mh-preview-wrap" id="plataforma">
          <div className="mh-preview-card">
            <div className="mh-preview-top">
              <div className="mh-preview-brand"><img src="/icon.svg?v=2" alt="" width="32" height="32" /><span><strong>MozHyper</strong><small>Painel da plataforma</small></span></div>
              <span className="mh-preview-tag">PRÉ-VISUALIZAÇÃO</span>
            </div>
            <div className="mh-preview-stats">
              <div><span>Saldo</span><strong>—</strong><small>Conforme a conta ligada</small></div>
              <div><span>Lucro / perda</span><strong className="mh-neutral">—</strong><small>Resultado das operações</small></div>
            </div>
            <div className="mh-preview-controls">
              <div><span>Conta</span><strong>Demo / Real*</strong></div>
              <div><span>Estratégia</span><strong>Robôs disponíveis <b>⌄</b></strong></div>
            </div>
            <div className="mh-digit-panel">
              <div className="mh-digit-head"><strong>Análise de dígitos</strong><span>Visão da interface</span></div>
              <div className="mh-digits" aria-hidden="true">
                {Array.from({ length: 10 }, (_, i) => <div className="mh-digit" key={i}><div className={`mh-digit-bar ${i === 0 ? 'muted' : i === 7 ? 'accent' : i === 3 || i === 6 ? 'red' : ''}`} style={{ height: [34, 9, 15, 25, 12, 18, 28, 43, 11, 17][i] + 'px' }} /><span>{i}</span></div>)}
              </div>
              <div className="mh-preview-foot"><i /> Elementos ilustrativos — sem dados de negociação</div>
            </div>
            <div className="mh-preview-action"><span><i /> Área de controlo do robô</span><span className="mh-preview-button">Iniciar robô</span></div>
          </div>
          <p className="mh-preview-caption">Exemplo visual da interface. Os dados reais só são apresentados na plataforma, conforme a conta e a ligação.</p>
        </div>
      </section>

      <section className="mh-intro-band">
        <div><span className="mh-section-kicker">MOZHYPER</span><h2>Ferramentas para acompanhar<br /><span>as suas decisões de negociação.</span></h2></div>
        <p>Consulte as estratégias e os indicadores disponíveis, configure as operações e acompanhe os resultados dentro do painel. O comportamento depende da estratégia, da conta e das condições da plataforma de negociação.</p>
      </section>

      <section className="mh-feature-section" id="funcionalidades">
        <div className="mh-section-intro">
          <div className="mh-eyebrow"><i /> O QUE ENCONTRA NA PLATAFORMA</div>
          <h2>Da análise ao acompanhamento,<br /><span>num único painel.</span></h2>
          <p>Funcionalidades destinadas a organizar a análise e a gestão das operações — sem promessas de lucro nem resultados garantidos.</p>
        </div>
        <div className="mh-features">
          <article className="mh-feature">
            <div className="mh-feature-icon">01</div>
            <small>ROBÔS E ESTRATÉGIAS</small>
            <h3>Escolha a estratégia disponível</h3>
            <p>Explore estratégias da família Hyper, incluindo HyperDrive e HyperFlow, de acordo com as opções apresentadas no painel.</p>
          </article>
          <article className="mh-feature">
            <div className="mh-feature-icon">02</div>
            <small>ANÁLISE DE DÍGITOS</small>
            <h3>Acompanhe os indicadores</h3>
            <p>Consulte a visualização dos dígitos e as informações utilizadas pelas estratégias para analisar os dados recebidos.</p>
          </article>
          <article className="mh-feature">
            <div className="mh-feature-icon">03</div>
            <small>OPERAÇÕES E RISCO</small>
            <h3>Configure e acompanhe</h3>
            <p>Utilize as opções de stake e gestão de risco disponíveis e consulte o histórico e os resultados das operações.</p>
          </article>
        </div>
      </section>

      <section className="mh-steps-section" id="como-comecar">
        <div className="mh-steps-intro">
          <div className="mh-eyebrow"><i /> COMO COMEÇAR</div>
          <h2>Entre na plataforma<br /><span>com passos claros.</span></h2>
          <p>A criação da conta MozHyper e a ligação à Deriv são etapas distintas. Siga as instruções apresentadas em cada ecrã.</p>
          <button className="mh-primary" onClick={() => onChoose('register')}>Criar conta <span aria-hidden="true">↗</span></button>
        </div>
        <div className="mh-steps">
          <article><b>1</b><div><h3>Crie a sua conta MozHyper</h3><p>Registe os dados pedidos no formulário da plataforma.</p></div></article>
          <article><b>2</b><div><h3>Conclua a ligação necessária</h3><p>Siga o fluxo de autenticação e ligação à Deriv que for apresentado.</p></div></article>
          <article><b>3</b><div><h3>Consulte o painel</h3><p>Verifique a conta selecionada, a estratégia, os parâmetros e as informações disponíveis antes de operar.</p></div></article>
        </div>
      </section>

      <section className="mh-risk-section" id="risco">
        <div className="mh-risk-icon" aria-hidden="true">!</div>
        <div className="mh-risk-copy">
          <div className="mh-eyebrow">NEGOCIAÇÃO RESPONSÁVEL</div>
          <h2>Conheça os riscos antes de operar.</h2>
          <p>A negociação de contratos digitais envolve risco de perda, incluindo a possibilidade de perder toda a aposta. Os robôs, os sinais, a análise de dígitos e os resultados anteriores não garantem resultados futuros. Utilize apenas dinheiro que possa perder e confirme sempre os parâmetros antes de iniciar operações.</p>
        </div>
        <button className="mh-outline" onClick={() => onChoose('register')}>Continuar para a plataforma <span aria-hidden="true">↗</span></button>
      </section>

      <footer className="mh-footer">
        <a className="mh-brand" href="#inicio" aria-label="MozHyper — voltar ao início">
          <img src="/icon.svg?v=2" alt="" width="36" height="36" />
          <span className="mh-brand-copy"><strong>Moz<span>Hyper</span></strong><small>NEGOCIA MAIS RÁPIDO</small></span>
        </a>
        <span>© {new Date().getFullYear()} MozHyper. As operações envolvem risco financeiro.</span>
        <div className="mh-footer-actions"><button onClick={() => onChoose('login')}>Já tem conta? <b>Iniciar sessão</b></button><button onClick={() => onChoose('register')}>Criar conta <b>↗</b></button></div>
      </footer>

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
        .mh-login{border:0;background:transparent;color:#394457;padding:12px 10px;font-size:12px;font-weight:700}
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
        .mh-secondary{border:1px solid #d5dce6;border-radius:12px;background:#fff;color:#394457;padding:13px 16px;font-size:12px;font-weight:700}
        .mh-secondary:hover{border-color:#f2a2a8;color:var(--mh-red)}
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
      `}</style>
    </main>
  );
}
