'use client';

import { useEffect, useState } from 'react';

type LoaderStage = 'auth' | 'connecting' | 'authorizing' | 'ready' | 'error';

interface ProfessionalLoaderProps {
  stage?: LoaderStage;
  detail?: string;
  progress?: number;
  compact?: boolean;
}

const labels: Record<LoaderStage, { title: string; detail: string }> = {
  auth: { title: 'Preparing MozHyper', detail: 'Checking your secure session' },
  connecting: { title: 'Connecting to Deriv', detail: 'Establishing secure market connection' },
  authorizing: { title: 'Authorizing account', detail: 'Synchronizing your Deriv account' },
  ready: { title: 'Ready', detail: 'Your trading workspace is ready' },
  error: { title: 'Connection interrupted', detail: 'We are trying to restore the connection' },
};

export default function ProfessionalLoader({ stage = 'auth', detail, progress, compact = false }: ProfessionalLoaderProps) {
  const [visibleProgress, setVisibleProgress] = useState(8);
  const meta = labels[stage];

  useEffect(() => {
    if (typeof progress === 'number') {
      setVisibleProgress(Math.max(5, Math.min(100, progress)));
      return;
    }
    if (stage === 'auth') setVisibleProgress(24);
    else if (stage === 'connecting') setVisibleProgress(52);
    else if (stage === 'authorizing') setVisibleProgress(78);
    else if (stage === 'ready') setVisibleProgress(100);
    else setVisibleProgress(64);
  }, [stage, progress]);

  return (
    <div className={compact ? 'mh-loader mh-loader-compact' : 'mh-loader'} role="status" aria-live="polite">
      <div className="mh-loader-card">
        <div className="mh-loader-brand" aria-label="MozHyper">
          <div className="mh-loader-mark">M</div>
          <div>
            <div className="mh-loader-name">Moz<span>Hyper</span></div>
            <div className="mh-loader-caption">DIGITS TRADING</div>
          </div>
        </div>

        <div className="mh-loader-orbit" aria-hidden="true">
          <div className="mh-loader-ring mh-loader-ring-a" />
          <div className="mh-loader-ring mh-loader-ring-b" />
          <div className="mh-loader-core"><span /></div>
        </div>

        <div className="mh-loader-copy">
          <div className="mh-loader-title">{meta.title}</div>
          <div className="mh-loader-detail">{detail || meta.detail}</div>
        </div>

        <div className="mh-loader-track" aria-hidden="true">
          <div className="mh-loader-progress" style={{ width: `${visibleProgress}%` }} />
        </div>
        <div className="mh-loader-state">
          <span>{stage === 'error' ? 'RECONNECTING' : stage === 'ready' ? 'CONNECTED' : 'SECURE SESSION'}</span>
          <span>{Math.round(visibleProgress)}%</span>
        </div>
      </div>

      <style jsx>{`
        .mh-loader{position:fixed;inset:0;z-index:99999;min-height:100dvh;width:100%;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;background:#f4f7fb;color:#182235;font-family:'IBM Plex Sans',-apple-system,BlinkMacSystemFont,sans-serif;isolation:isolate;}
        .mh-loader-compact{position:relative;inset:auto;z-index:auto;min-height:220px;padding:16px;background:transparent;}
        .mh-loader-card{width:min(100%,390px);padding:28px 22px 22px;box-sizing:border-box;border:1px solid #d7e1ef;border-radius:14px;background:rgba(255,255,255,.98);box-shadow:0 24px 70px rgba(24,34,53,.10);}
        .mh-loader-brand{display:flex;align-items:center;gap:11px;margin-bottom:30px;}
        .mh-loader-mark{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#ff444f;color:#fff;font-size:20px;font-weight:700;box-shadow:0 9px 22px rgba(255,68,79,.20);}
        .mh-loader-name{font-size:22px;line-height:1;font-weight:700;letter-spacing:-.045em;}
        .mh-loader-name span{color:#ff444f;}
        .mh-loader-caption{margin-top:5px;color:#7a879d;font-size:7px;font-weight:700;letter-spacing:.17em;}
        .mh-loader-orbit{position:relative;width:84px;height:84px;margin:0 auto 22px;}
        .mh-loader-ring{position:absolute;inset:4px;border:1px solid rgba(255,68,79,.18);border-radius:50%;}
        .mh-loader-ring-a{border-top-color:#ff444f;animation:mhspin 1.1s linear infinite;}
        .mh-loader-ring-b{inset:13px;border-right-color:#ff444f;animation:mhspin 1.7s linear infinite reverse;opacity:.7;}
        .mh-loader-core{position:absolute;inset:25px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 26px rgba(24,34,53,.12);}
        .mh-loader-core span{width:13px;height:13px;border-radius:50%;background:#ff444f;box-shadow:0 0 0 6px rgba(255,68,79,.08),0 0 22px rgba(255,68,79,.25);animation:mhpulse 1.15s ease-in-out infinite;}
        .mh-loader-copy{text-align:center;}
        .mh-loader-title{font-size:15px;font-weight:700;letter-spacing:-.01em;}
        .mh-loader-detail{margin-top:6px;color:#7a879d;font-size:10px;line-height:1.5;}
        .mh-loader-track{height:4px;margin-top:22px;border-radius:99px;overflow:hidden;background:#edf1f6;}
        .mh-loader-progress{height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff6973,#ff444f);box-shadow:0 0 14px rgba(255,68,79,.20);transition:width .35s ease;}
        .mh-loader-state{display:flex;justify-content:space-between;margin-top:8px;color:#8a96aa;font-size:8px;font-weight:700;letter-spacing:.11em;}
        @keyframes mhspin{to{transform:rotate(360deg)}}
        @keyframes mhpulse{0%,100%{transform:scale(.9);opacity:.65}50%{transform:scale(1.05);opacity:1}}
        @media(prefers-reduced-motion:reduce){.mh-loader-ring-a,.mh-loader-ring-b,.mh-loader-core span{animation:none!important}.mh-loader-progress{transition:none}}
      `}</style>
    </div>
  );
}
