// components/Dashboard.tsx

'use client';

import TutorialSection from './TutorialSection';
import DigitsGameV3 from './DigitsGameV3';
import ProbabilitySampling100 from './ProbabilitySampling100';

export default function Dashboard() {
  return (
    <div className="matos-page">
      <div className="matos-shell">
        <div className="matos-phone">
          <DigitsGameV3 />
          <ProbabilitySampling100 />
        </div>

        <div id="tutorial" className="mt-4">
          <TutorialSection />
        </div>
      </div>
    </div>
  );
}
