'use client';

export default function InlineSpinner({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'mh-inline-spin 0.8s linear infinite' }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="#e3e9f2" strokeWidth="3" />
      <circle cx="12" cy="12" r="10" stroke="#ff444f" strokeWidth="3" strokeLinecap="round" strokeDasharray="16 63" />
      <style>{`@keyframes mh-inline-spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
