// components/Dashboard.tsx

'use client';

import TutorialSection from './TutorialSection';
import DigitsGame from './DigitsGame';

export default function Dashboard() {
  return (
    <div className="matos-page">
      <div className="matos-shell">
        <div className="matos-phone">
          <DigitsGame />
        </div>

        <div id="tutorial" className="mt-4">
          <TutorialSection />
        </div>
      </div>
    </div>
  );
}
