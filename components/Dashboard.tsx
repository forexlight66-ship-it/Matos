// components/Dashboard.tsx

'use client';

import TutorialSection from './TutorialSection';
import DigitsGameV2 from './DigitsGameV2';

export default function Dashboard() {
  return (
    <div className="matos-page">
      <div className="matos-shell">
        <div className="matos-phone">
          <DigitsGameV2 />
        </div>

        <div id="tutorial" className="mt-4">
          <TutorialSection />
        </div>
      </div>
    </div>
  );
}
