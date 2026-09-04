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
      .matos-phone>.mx-auto.w-full{padding:0!important;max-width:none!important;width:100%!important;min-height:100dvh!important;box-sizing:border-box!important}
      .av4{width:100%!important;max-width:none!important;min-height:100dvh;box-sizing:border-box;border-radius:0!important}
      .av4 .hist{scrollbar-width:none;-ms-overflow-style:none}
      .av4 .hist::-webkit-scrollbar{display:none}
      .av4 .trade>div:first-child{position:relative!important;width:14px!important;height:38px!important;margin:0 auto 6px!important;background:transparent!important;border-radius:0!important}
      .av4 .trade>div:first-child:before{content:'';position:absolute;left:6px;top:0;width:2px;height:38px;background:currentColor;border-radius:1px}
      .av4 .trade>div:first-child:after{content:'';position:absolute;left:2px;top:9px;width:10px;height:16px;background:currentColor;border-radius:2px}
      .av4 .trade>div.bg-blue-500{color:#3b82f6!important}
      .av4 .trade>div.bg-red-500{color:#ef4444!important}
      /* The old dashboard must not display the API's recent-trades list or operation count. */
      .av4 .card:has(.hist){display:none!important}
      .av4>.mt-3.grid.grid-cols-2.gap-3>.card:nth-child(2)>div:last-child{display:none!important}
      /* WhatsApp: icon only, no flower and no text. */
      .av4 a[aria-label='WhatsApp Channel']{font-size:0!important;width:40px!important;height:40px!important;padding:0!important;display:flex!important;align-items:center!important;justify-content:center!important;color:#22c55e!important}
      .av4 a[aria-label='WhatsApp Channel']::before{content:'';display:block;width:24px;height:24px;background-repeat:no-repeat;background-position:center;background-size:contain;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%2322c55e' d='M12.04 2a9.91 9.91 0 0 0-8.56 14.92L2 22l5.23-1.37A9.92 9.92 0 1 0 12.04 2Zm0 18.16a8.23 8.23 0 0 1-4.2-1.15l-.3-.18-3.1.81.83-3.02-.2-.31A8.23 8.23 0 1 1 12.04 20.16Zm4.52-6.17c-.25-.13-1.47-.73-1.7-.81-.23-.13-1.47-.73-1.7-.81-.23-.08-.39-.13-.56.13-.16.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.13-1.05-.39-2-1.24-.74-.66-1.24-1.47-1.39-1.72-.15-.25-.02-.39.11-.52.11-.11.25-.29.37-.43.12-.15.16-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.43 1.02 2.6c.13.17 1.76 2.69 4.26 3.77.6.26 1.07.41 1.43.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.11-.23-.17-.48-.29Z'/%3E%3C/svg%3E")}
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