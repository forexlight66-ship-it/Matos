'use client';

import TutorialSection from './TutorialSection';
import AutoBotV4 from './AutoBotV4';
import AutoBotEnhancements from './AutoBotEnhancements';

export default function Dashboard() {
  return <div className="matos-page">
    <style>{`
      html,body{margin:0;padding:0;width:100%;min-height:100%;overflow-x:hidden}
      .matos-page{width:100%;min-height:100dvh;background:var(--bg,#070b14)}
      .matos-shell{width:100%;min-height:100dvh;margin:0;padding:0;display:flex;flex-direction:column;align-items:stretch}
      .matos-phone{width:100%;min-height:100dvh;margin:0;border-radius:0;box-shadow:none;background:var(--bg,#070b14);box-sizing:border-box;padding:0}
      .matos-phone>div{width:100%;max-width:none}
      .matos-phone .mx-auto{max-width:none!important;width:100%!important;margin-left:0!important;margin-right:0!important}
      /* Remove the AutoBot root padding that was creating the empty side margins. */
      .matos-phone>.mx-auto.w-full{padding:0!important;max-width:none!important;width:100%!important;min-height:100dvh!important;box-sizing:border-box!important}
      .av4{width:100%!important;max-width:none!important;min-height:100dvh;box-sizing:border-box;border-radius:0!important}
      .av4 .hist{scrollbar-width:none;-ms-overflow-style:none}
      .av4 .hist::-webkit-scrollbar{display:none}
      /* Restore the previous mini-candle appearance in recent trade history. */
      .av4 .trade>div:first-child{position:relative!important;width:14px!important;height:38px!important;margin:0 auto 6px!important;background:transparent!important;border-radius:0!important}
      .av4 .trade>div:first-child:before{content:'';position:absolute;left:6px;top:0;width:2px;height:38px;background:currentColor;border-radius:1px}
      .av4 .trade>div:first-child:after{content:'';position:absolute;left:2px;top:9px;width:10px;height:16px;background:currentColor;border-radius:2px}
      .av4 .trade>div.bg-blue-500{color:#3b82f6!important}
      .av4 .trade>div.bg-red-500{color:#ef4444!important}
      .dashboard-actions{display:flex;gap:6px;align-items:center;position:relative}.theme-btn,.dots-btn{border:1px solid rgba(255,255,255,.07);background:var(--s2);color:var(--t2);border-radius:10px;cursor:pointer;font-size:12px;font-weight:800}.theme-btn{padding:8px 9px}.dots-btn{width:34px;height:34px;font-size:18px}.dashboard-menu{position:absolute;right:0;top:40px;z-index:80;width:160px;padding:6px;border:1px solid rgba(255,255,255,.08);background:var(--s2);border-radius:13px;box-shadow:0 18px 35px -12px #000}.dashboard-menu button{width:100%;border:0;background:transparent;color:var(--t1);padding:9px;text-align:left;border-radius:8px;cursor:pointer;font-size:11px}.dashboard-menu button:hover{background:var(--s3)}
      body[data-theme='light']{--bg:#F4F7FB;--s1:#FFFFFF;--s2:#EAF0F8;--s3:#D7E1EF;--t1:#182235;--t2:#53627A;--t3:#7A879D}body[data-theme='light'] .matos-phone{box-shadow:none;background:var(--bg)}body[data-theme='light'] .auto-status-card{background:linear-gradient(180deg,#fff,#eef4fb)}body[data-theme='light'] .auto-log{background:#edf2f8}
      @media (min-width:768px){.matos-phone{padding:0}.av4{padding-left:clamp(16px,2.5vw,40px)!important;padding-right:clamp(16px,2.5vw,40px)!important}}
      @media (min-width:1200px){.matos-phone{padding:0}.matos-phone>div{max-width:none!important}#tutorial{max-width:1400px}}
      @media (max-width:430px){.matos-phone{padding:0}.av4{padding-left:10px!important;padding-right:10px!important}}
      @media (orientation:landscape) and (max-height:600px){.matos-phone{padding:0}.av4{padding-left:12px!important;padding-right:12px!important}}
    `}</style>
    <div className="matos-shell">
      <div className="matos-phone">
        <AutoBotEnhancements />
        <AutoBotV4 />
      </div>
      <div id="tutorial" className="mt-4"><TutorialSection/></div>
    </div>
  </div>;
}
