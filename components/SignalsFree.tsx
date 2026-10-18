'use client';

const GROUP_URL = 'https://t.me/+S4A_5SgZB6x4P_UQ';

export default function SignalsFree(_props: { light: boolean }) {
  return (
    <a
      href={GROUP_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="icon-btn signals-free-trigger"
      aria-label="Abrir Signal Unlimited no Telegram"
      title="Signal Unlimited — Telegram"
      style={{
        width: 30,
        height: 30,
        padding: 0,
        borderRadius: 9,
        overflow: 'hidden',
        border: '1px solid #3f8c43',
        background: 'linear-gradient(145deg,#087ec2,#07519b)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <img
        src="/signals-free.svg"
        alt=""
        width={30}
        height={30}
        style={{ display: 'block', width: 30, height: 30, objectFit: 'cover' }}
      />
    </a>
  );
}
