'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useDeriv } from '@/hooks/useDeriv';

type SymbolCode = 'R_100' | 'R_50' | 'R_10' | 'R_25' | 'R_75' | '1HZ100V' | '1HZ50V';

const SYMBOL_BY_LABEL: Record<string, SymbolCode> = {
  'Volatility 100 Index': 'R_100',
  'Volatility 50 Index': 'R_50',
  'Volatility 10 Index': 'R_10',
  'Volatility 25 Index': 'R_25',
  'Volatility 75 Index': 'R_75',
  'Volatility 100 (1s) Index': '1HZ100V',
  'Volatility 50 (1s) Index': '1HZ50V',
};

const DEFAULT_SYMBOL: SymbolCode = '1HZ100V';
const SAMPLE_SIZE = 100;
const INITIAL_PROBS = Array(10).fill(10) as number[];

export default function ProbabilitySampling100() {
  const [mounted, setMounted] = useState(false);
  const [symbol, setSymbol] = useState<SymbolCode>(DEFAULT_SYMBOL);
  const [digits, setDigits] = useState<number[]>([]);
  const [selected, setSelected] = useState(5);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const dialRef = useRef<Element | null>(null);
  const { tick } = useDeriv('demo');

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const chooseDefault = () => {
      const current = document.querySelector('.symbol-select')?.textContent?.trim() || '';
      if (current === 'Volatility 100 Index') {
        const selector = document.querySelector('.symbol-select') as HTMLButtonElement | null;
        selector?.click();
        const option = Array.from(document.querySelectorAll('.symbol-menu button')).find(
          (b) => b.textContent?.trim() === 'Volatility 100 (1s) Index'
        ) as HTMLButtonElement | undefined;
        option?.click();
      }
    };
    const timer = window.setTimeout(chooseDefault, 150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const readSymbol = () => {
      const label = document.querySelector('.symbol-select')?.textContent?.trim() || '';
      const next = SYMBOL_BY_LABEL[label];
      if (next) {
        setSymbol((old) => old === next ? old : next);
        setDigits([]);
      }
    };
    readSymbol();
    const observer = new MutationObserver(readSymbol);
    const target = document.querySelector('.matos-phone') || document.body;
    observer.observe(target, { subtree: true, childList: true, characterData: true });
    const interval = window.setInterval(readSymbol, 500);
    return () => { observer.disconnect(); window.clearInterval(interval); };
  }, []);

  useEffect(() => {
    const update = () => {
      const dial = document.querySelector('.dial');
      dialRef.current = dial;
      setRect(dial?.getBoundingClientRect() || null);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    const timer = window.setInterval(update, 500);
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); window.clearInterval(timer); };
  }, []);

  useEffect(() => {
    const raw = tick?.quote;
    if (raw === undefined || raw === null) return;
    const digit = Number(String(raw).replace(/\D/g, '').slice(-1));
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
    setDigits((old) => [...old, digit].slice(-SAMPLE_SIZE));
  }, [tick]);

  const probabilities = useMemo(() => {
    if (!digits.length) return INITIAL_PROBS;
    const counts = Array(10).fill(0) as number[];
    digits.forEach((d) => counts[d]++);
    return counts.map((count) => (count / digits.length) * 100);
  }, [digits]);

  const choose = (digit: number) => {
    setSelected(digit);
    const buttons = Array.from(document.querySelectorAll('.dial .digit')) as HTMLButtonElement[];
    buttons[digit]?.click();
  };

  if (!mounted || !rect) return null;

  const size = rect.width;
  const radius = Math.max(72, size * 0.415);
  const center = size / 2;
  const content = (
    <div
      className="probability-100-overlay"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-label="Probabilidades dos últimos 100 ticks"
    >
      <div className="probability-100-title">100 TICKS</div>
      {probabilities.map((probability, i) => {
        const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return (
          <button
            key={i}
            className={`probability-100-digit ${i === selected ? 'selected' : ''}`}
            style={{ left: x, top: y }}
            onClick={() => choose(i)}
            aria-label={`Dígito ${i}, ${probability.toFixed(1)} por cento`}
          >
            <span>{i}</span>
            <small>{probability.toFixed(1)}%</small>
          </button>
        );
      })}
      <div className="probability-100-count">{digits.length}/100</div>
    </div>
  );

  return createPortal(
    <>
      <style>{`
        .dial .digit{visibility:hidden!important;pointer-events:none!important}
        .probability-100-overlay{position:fixed;z-index:80;pointer-events:none}
        .probability-100-title{position:absolute;left:50%;top:50%;transform:translate(-50%,-46px);font-size:8px;font-weight:900;letter-spacing:.8px;color:var(--t3);pointer-events:none;white-space:nowrap}
        .probability-100-count{position:absolute;left:50%;top:50%;transform:translate(-50%,34px);font-size:8px;font-weight:800;color:var(--t3);pointer-events:none;white-space:nowrap}
        .probability-100-digit{position:absolute;transform:translate(-50%,-50%);width:42px;height:42px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:var(--s2);color:var(--t1);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;line-height:1;box-shadow:0 4px 12px rgba(0,0,0,.16);cursor:pointer;pointer-events:auto;padding:0}
        .probability-100-digit span{font-size:13px;font-weight:950}
        .probability-100-digit small{font-size:8px;font-weight:800;color:var(--t3);margin-top:2px}
        .probability-100-digit.selected{border-color:rgba(59,130,246,.9);box-shadow:0 0 0 2px rgba(59,130,246,.18),0 5px 15px rgba(0,0,0,.22);transform:translate(-50%,-50%) scale(1.06)}
      `}</style>
      {content}
    </>,
    document.body
  );
}
