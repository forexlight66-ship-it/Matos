'use client';

import { useEffect, useState } from 'react';
import TutorialSection from './TutorialSection';
import AutoBotV3 from './AutoBotV3';
import RobotStrategySelector from './RobotStrategySelector';
import AutoBotEnhancements from './AutoBotEnhancements';

export default function Dashboard() {
  const [mode,setMode]=useState<'automatic'|'robot'>('automatic');
  const [theme,setTheme]=useState<'dark'|'light'>('dark');
  const [menu,setMenu]=useState(false);
  useEffect(()=>{document.body.dataset.theme=theme;return()=>{delete document.body.dataset.theme}},[theme]);
  return <div className="matos-page">
    <style>{`
      html,body{margin:0;padding:0;width:100%;min-height:100%;overflow-x:hidden}
      .matos-page{width:100%;min-height:100dvh;background:var(--bg,#070b14)}
      .matos-shell{width:100%;min-height:100dvh;margin:0;padding:0;display:flex;flex-direction:column;align-items:stretch}
      .matos-phone{width:100%;max-width:none;min-height:100dvh;margin:0;border-radius:0;box-shadow:none;background:var(--bg,#070b14);box-sizing:border-box;padding:clamp(10px,2vw,24px)}
      .matos-phone>div:not(.mode-switch-matos){box-sizing:border-box}
      .matos-phone>div{width:100%;max-width:none}
      .matos-phone .mx-auto{max-width:900px!important;width:100%!important;margin-left:auto!important;margin-right:auto!important}
      .mode-switch-matos{width:min(100%,760px);margin:0 auto 12px}
      #tutorial{width:min(100%,1200px);margin:16px auto 0!important}
      .dashboard-actions{display:flex;gap:6px;align-items:center;position:relative}.theme-btn,.dots-btn{border:1px solid rgba(255,255,255,.07);background:var(--s2);color:var(--t2);border-radius:10px;cursor:pointer;font-size:12px;font-weight:800}.theme-btn{padding:8px 9px}.dots-btn{width:34px;height:34px;font-size:18px}.dashboard-menu{position:absolute;right:0;top:40px;z-index:80;width:160px;padding:6px;border:1px solid rgba(255,255,255,.08);background:var(--s2);border-radius:13px;box-shadow:0 18px 35px -12px #000}.dashboard-menu button{width:100%;border:0;background:transparent;color:var(--t1);padding:9px;text-align:left;border-radius:8px;cursor:pointer;font-size:11px}.dashboard-menu button:hover{background:var(--s3)}
      body[data-theme='light']{--bg:#F4F7FB;--s1:#FFFFFF;--s2:#EAF0F8;--s3:#D7E1EF;--t1:#182235;--t2:#53627A;--t3:#7A879D}body[data-theme='light'] .matos-phone{box-shadow:none;background:var(--bg)}body[data-theme='light'] .auto-status-card{background:linear-gradient(180deg,#fff,#eef4fb)}body[data-theme='light'] .auto-log{background:#edf2f8}
      @media (min-width:768px){.matos-phone{padding:clamp(18px,2.5vw,32px)}.mode-switch-matos{margin-bottom:18px}}
      @media (min-width:1200px){.matos-phone{padding:28px 4vw}.mode-switch-matos{max-width:900px}#tutorial{max-width:1400px}.matos-phone .mx-auto{max-width:1000px!important}}
      @media (max-width:430px){.matos-phone{padding:8px}.matos-phone .mx-auto{max-width:100%!important}.mode-switch-matos{margin-bottom:10px}}
      @media (orientation:landscape) and (max-height:600px){.matos-phone{padding:8px 12px}.mode-switch-matos{margin-bottom:8px}}
    `}</style>
    <div className="matos-shell">
      <div className="matos-phone">
        <div className="mode-switch-matos" role="tablist" aria-label="Trading mode">
          <button className={mode==='automatic'?'active':''} onClick={()=>{setMode('automatic');setMenu(false)}}>Automático</button>
          <button className={mode==='robot'?'active robo':''} onClick={()=>{setMode('robot');setMenu(false)}}>🤖 Robô</button>
        </div>
        <AutoBotEnhancements />
        {mode==='automatic'?<AutoBotV3/>:<RobotStrategySelector/>}
      </div>
      <div id="tutorial" className="mt-4"><TutorialSection/></div>
    </div>
  </div>;
}
