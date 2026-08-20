'use client';

import { useEffect, useState } from 'react';
import TutorialSection from './TutorialSection';
import DigitsGameV3 from './DigitsGameV3';
import AutoBotV2 from './AutoBotV2';

export default function Dashboard() {
  const [mode,setMode]=useState<'manual'|'robot'>('manual');
  const [theme,setTheme]=useState<'dark'|'light'>('dark');
  const [menu,setMenu]=useState(false);
  useEffect(()=>{document.body.dataset.theme=theme;return()=>{delete document.body.dataset.theme}},[theme]);

  return <div className="matos-page">
    <style>{`
      .dashboard-actions{display:flex;gap:6px;align-items:center;position:relative}.theme-btn,.dots-btn{border:1px solid rgba(255,255,255,.07);background:var(--s2);color:var(--t2);border-radius:10px;cursor:pointer;font-size:12px;font-weight:800}.theme-btn{padding:8px 9px}.dots-btn{width:34px;height:34px;font-size:18px}.dashboard-menu{position:absolute;right:0;top:40px;z-index:80;width:160px;padding:6px;border:1px solid rgba(255,255,255,.08);background:var(--s2);border-radius:13px;box-shadow:0 18px 35px -12px #000}.dashboard-menu button{width:100%;border:0;background:transparent;color:var(--t1);padding:9px;text-align:left;border-radius:8px;cursor:pointer;font-size:11px}.dashboard-menu button:hover{background:var(--s3)}
      body[data-theme='light']{--bg:#F4F7FB;--s1:#FFFFFF;--s2:#EAF0F8;--s3:#D7E1EF;--t1:#182235;--t2:#53627A;--t3:#7A879D}body[data-theme='light'] .matos-phone{box-shadow:0 25px 60px -30px #68758a;background:var(--bg)}body[data-theme='light'] .auto-status-card{background:linear-gradient(180deg,#fff,#eef4fb)}body[data-theme='light'] .auto-log{background:#edf2f8}
    `}</style>
    <div className="matos-shell">
      <div className="matos-phone">
        <div className="mode-switch-matos" role="tablist" aria-label="Trading mode">
          <button className={mode==='manual'?'active':''} onClick={()=>{setMode('manual');setMenu(false)}}>Manual</button>
          <button className={mode==='robot'?'active robo':''} onClick={()=>{setMode('robot');setMenu(false)}}>🤖 Robô</button>
        </div>
        {mode==='robot'&&<div className="dashboard-actions" style={{justifyContent:'flex-end',padding:'0 2px 4px'}}>
          <button className="theme-btn" onClick={()=>setTheme(t=>t==='dark'?'light':'dark')} aria-label="Mudar tema">{theme==='dark'?'☀ Light':'☾ Dark'}</button>
          <button className="dots-btn" onClick={()=>setMenu(v=>!v)} aria-label="Mais opções">⋯</button>
          {menu&&<div className="dashboard-menu"><button onClick={()=>{setTheme('dark');setMenu(false)}}>🌙 Dark</button><button onClick={()=>{setTheme('light');setMenu(false)}}>☀ Light</button><button onClick={()=>window.open('https://wa.me/258879084091','_blank')}>Suporte WhatsApp</button></div>}
        </div>}
        {mode==='manual'?<DigitsGameV3/>:<AutoBotV2/>}
      </div>
      <div id="tutorial" className="mt-4"><TutorialSection/></div>
    </div>
  </div>;
}
