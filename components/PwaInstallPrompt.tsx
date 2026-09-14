'use client';

import { useEffect, useState } from 'react';

declare global { interface Window { __matosPwaPrompt?: Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> } } }

export default function PwaInstallPrompt() {
  const [deferred, setDeferred] = useState<Window['__matosPwaPrompt']>();
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const mobile = /android|iphone|ipad|ipod/i.test(ua);
    if (!mobile) return;
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (standalone || localStorage.getItem('mozhyper-install-dismissed') === '1') return;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    setIos(isIOS);
    const handler = (e: Event) => {
      e.preventDefault();
      const event = e as Window['__matosPwaPrompt'];
      setDeferred(event);
      setShow(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    const timer = window.setTimeout(() => { if (isIOS) setShow(true); }, 1200);
    return () => { window.removeEventListener('beforeinstallprompt', handler); window.clearTimeout(timer); };
  }, []);

  if (!show) return null;
  const dismiss = () => { localStorage.setItem('mozhyper-install-dismissed', '1'); setShow(false); };
  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setShow(false);
  };

  return <div style={{position:'fixed',inset:0,zIndex:9999,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'16px',background:'rgba(0,0,0,.45)'}}>
    <div style={{width:'100%',maxWidth:390,border:'1px solid #323738',borderRadius:18,padding:20,background:'#151717',color:'#fff',boxShadow:'0 20px 60px rgba(0,0,0,.5)'}}>
      <div style={{fontSize:20,fontWeight:700,marginBottom:6}}>📱 Instale o MozHyper</div>
      <div style={{fontSize:14,color:'#c2c2c2',lineHeight:1.5,marginBottom:16}}>Tenha acesso rápido ao MozHyper diretamente na tela inicial do seu celular.</div>
      {ios ? <div style={{fontSize:13,color:'#c2c2c2',lineHeight:1.55,marginBottom:16}}>No iPhone: toque em <b>Compartilhar</b> no Safari e depois em <b>Adicionar à Tela de Início</b>.</div> : <button onClick={install} style={{width:'100%',padding:'12px 16px',border:0,borderRadius:10,background:'#ff444f',color:'#fff',fontWeight:700,fontSize:14}}>INSTALAR APP</button>}
      <button onClick={dismiss} style={{width:'100%',marginTop:10,padding:'10px',border:'1px solid #323738',borderRadius:10,background:'transparent',color:'#c2c2c2',fontSize:13}}>Agora não</button>
    </div>
  </div>;
}
