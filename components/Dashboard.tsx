'use client';

import { useState } from 'react';
import TutorialSection from './TutorialSection';
import DigitsGameV3 from './DigitsGameV3';
import AutoBot from './AutoBot';

export default function Dashboard() {
  const [mode,setMode]=useState<'manual'|'robot'>('manual');
  return (
    <div className="matos-page">
      <div className="matos-shell">
        <div className="matos-phone">
          <div className="mode-switch-matos" role="tablist" aria-label="Trading mode">
            <button className={mode==='manual'?'active':''} onClick={()=>setMode('manual')}>Manual</button>
            <button className={mode==='robot'?'active robo':''} onClick={()=>setMode('robot')}>🤖 Robô</button>
          </div>
          {mode==='manual' ? <DigitsGameV3 /> : <AutoBot />}
        </div>

        <div id="tutorial" className="mt-4">
          <TutorialSection />
        </div>
      </div>
    </div>
  );
}
