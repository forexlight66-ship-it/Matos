'use client';

import { useMemo, useState } from 'react';

type ChartType = 'line' | 'area' | 'candle';

type Props = {
  ticks: number[];
  symbol: string;
  symbols: Record<string, string>;
  onSymbolChange: (symbol: string) => void;
  onViewChange: () => void;
};

export default function DerivChartPanel({ ticks, symbol, symbols, onSymbolChange, onViewChange }: Props) {
  const [chartType, setChartType] = useState<ChartType>('line');
  const [typeMenu, setTypeMenu] = useState(false);
  const [drawMode, setDrawMode] = useState(false);
  const [crosshair, setCrosshair] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [cursor, setCursor] = useState<{ x: number; y: number; price: number } | null>(null);
  const [drawY, setDrawY] = useState<number | null>(null);

  const values = useMemo(() => ticks.slice(-100), [ticks]);
  const visibleCount = Math.max(20, Math.min(Math.max(values.length, 20), Math.round(100 / zoom)));
  const visible = values.slice(-visibleCount);
  const min = visible.length ? Math.min(...visible) : 0;
  const max = visible.length ? Math.max(...visible) : 1;
  const range = max - min || 1;
  const left = 42;
  const right = 950;
  const top = 24;
  const bottom = 286;

  const mapY = (value: number) => bottom - ((value - min) / range) * (bottom - top);
  const linePoints = visible
    .map((value, index) => {
      const x = left + (index / Math.max(visible.length - 1, 1)) * (right - left);
      return x.toFixed(1) + ',' + mapY(value).toFixed(1);
    })
    .join(' ');

  const current = visible[visible.length - 1] ?? 0;
  const first = visible[0] ?? current;
  const change = current - first;
  const changePct = first ? (change / first) * 100 : 0;

  const candles = useMemo(() => {
    if (!visible.length) return [];
    const bucket = Math.max(1, Math.ceil(visible.length / 24));
    const out: { open: number; close: number; high: number; low: number }[] = [];
    for (let i = 0; i < visible.length; i += bucket) {
      const part = visible.slice(i, i + bucket);
      out.push({
        open: part[0],
        close: part[part.length - 1],
        high: Math.max(...part),
        low: Math.min(...part),
      });
    }
    return out;
  }, [visible]);

  const downloadData = () => {
    const rows = ['index,price'];
    values.forEach((value, index) => rows.push(String(index + 1) + ',' + String(value)));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'mozhyper-' + symbol + '-ticks.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const readPosition = (event: any) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.max(left, Math.min(right, ((event.clientX - rect.left) / rect.width) * 1000));
    const y = Math.max(top, Math.min(bottom, ((event.clientY - rect.top) / rect.height) * 320));
    const price = min + ((bottom - y) / (bottom - top)) * range;
    return { x, y, price };
  };

  const handleMove = (event: any) => {
    if (crosshair) setCursor(readPosition(event));
  };

  const handleClick = (event: any) => {
    if (drawMode) setDrawY(readPosition(event).y);
  };

  return (
    <div className="mt-1 md:mt-2 overflow-hidden rounded-[16px] border border-slate-700/80 bg-[#11161d] text-white shadow-inner">
      <div className="flex flex-col gap-3 border-b border-slate-700/80 bg-[#10151c] px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <select
              className="max-w-[250px] rounded-lg bg-[#171d25] px-2 py-1 text-[15px] font-extrabold text-white outline-none"
              value={symbol}
              onChange={(event) => onSymbolChange(event.target.value)}
              aria-label="Símbolo"
            >
              {Object.entries(symbols).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
            <span className="text-[9px] text-slate-400">Derived</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <b className="text-[15px]">{current.toFixed(2)}</b>
            <span className={change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
              {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%)
            </span>
          </div>
        </div>

        <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          <button type="button" onClick={onViewChange} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1218] text-sm text-slate-300 hover:bg-[#19212b]" title="Voltar para barras 0–9" aria-label="Voltar para barras 0–9">▥</button>

          <div className="relative shrink-0">
            <button type="button" onClick={() => setTypeMenu((value) => !value)} className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0d1218] text-lg text-slate-300 hover:bg-[#19212b]" title="Tipo de gráfico" aria-label="Tipo de gráfico">◒</button>
            {typeMenu && (
              <div className="absolute right-0 top-11 z-50 w-28 rounded-xl border border-slate-700 bg-[#171d25] p-1 shadow-2xl">
                <button onClick={() => { setChartType('line'); setTypeMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] hover:bg-[#222b35]">Linha</button>
                <button onClick={() => { setChartType('area'); setTypeMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] hover:bg-[#222b35]">Área</button>
                <button onClick={() => { setChartType('candle'); setTypeMenu(false); }} className="block w-full rounded-lg px-3 py-2 text-left text-[10px] hover:bg-[#222b35]">Velas</button>
              </div>
            )}
          </div>

          <button type="button" onClick={() => setDrawMode((value) => !value)} className={drawMode ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1218] text-slate-300'} title="Ferramenta de desenho" aria-label="Ferramenta de desenho">✎</button>
          <button type="button" onClick={downloadData} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1218] text-lg text-slate-300 hover:bg-[#19212b]" title="Baixar dados" aria-label="Baixar dados">⇩</button>
          <button type="button" onClick={() => setZoom((value) => Math.min(4, value + 0.5))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1218] text-xl text-slate-300 hover:bg-[#19212b]" title="Aumentar zoom" aria-label="Aumentar zoom">+</button>
          <button type="button" onClick={() => setCrosshair((value) => !value)} className={crosshair ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white' : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1218] text-slate-300'} title="Cursor e crosshair" aria-label="Cursor e crosshair">⌖</button>
          <button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.5))} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1218] text-xl text-slate-300 hover:bg-[#19212b]" title="Reduzir zoom" aria-label="Reduzir zoom">−</button>
        </div>
      </div>

      <div className={drawMode ? 'relative h-[300px] w-full cursor-crosshair px-1 pb-2 pt-1 md:h-[390px]' : 'relative h-[300px] w-full px-1 pb-2 pt-1 md:h-[390px]'} onMouseMove={handleMove} onMouseLeave={() => setCursor(null)} onClick={handleClick}>
        <svg viewBox="0 0 1000 320" className="h-full w-full" preserveAspectRatio="none">
          {[35, 98, 161, 224, 286].map((y) => <line key={'h' + y} x1="24" y1={y} x2="965" y2={y} stroke="rgba(148,163,184,.17)" strokeWidth="1" />)}
          {[120, 240, 360, 480, 600, 720, 840].map((x) => <line key={'v' + x} x1={x} y1="20" x2={x} y2="286" stroke="rgba(148,163,184,.11)" strokeWidth="1" />)}

          {chartType === 'area' && linePoints && <polygon points={left + ',' + bottom + ' ' + linePoints + ' ' + right + ',' + bottom} fill="rgba(226,232,240,.10)" />}
          {chartType !== 'candle' && <polyline points={linePoints || '42,155 950,155'} fill="none" stroke="#f3f4f6" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}

          {chartType === 'candle' && candles.map((candle, index) => {
            const x = left + ((index + 0.5) / Math.max(candles.length, 1)) * (right - left);
            const wickTop = mapY(candle.high);
            const wickBottom = mapY(candle.low);
            const bodyTop = Math.min(mapY(candle.open), mapY(candle.close));
            const bodyBottom = Math.max(mapY(candle.open), mapY(candle.close));
            const bodyHeight = Math.max(3, bodyBottom - bodyTop);
            const up = candle.close >= candle.open;
            return (
              <g key={index}>
                <line x1={x} y1={wickTop} x2={x} y2={wickBottom} stroke={up ? '#4bb4b3' : '#ff4757'} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                <rect x={x - 5} y={bodyTop} width="10" height={bodyHeight} rx="1.5" fill={up ? '#4bb4b3' : '#ff4757'} />
              </g>
            );
          })}

          {drawY !== null && <line x1="24" y1={drawY} x2="965" y2={drawY} stroke="#60a5fa" strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />}
          {crosshair && cursor && (
            <>
              <line x1={cursor.x} y1="20" x2={cursor.x} y2="286" stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
              <line x1="24" y1={cursor.y} x2="965" y2={cursor.y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
            </>
          )}

          {[0, 1, 2, 3, 4].map((index) => {
            const value = max - range * (index / 4);
            return <text key={'p' + index} x="973" y={35 + index * 63} fontSize="11" fill="#6f7b89">{value.toFixed(2)}</text>;
          })}
        </svg>

        {crosshair && cursor && (
          <div className="pointer-events-none absolute z-10 rounded-md border border-slate-600 bg-[#171d25] px-2 py-1 text-[9px] text-white" style={{ left: Math.min(88, Math.max(5, cursor.x / 10)) + '%', top: Math.min(84, Math.max(8, cursor.y / 3.2)) + '%' }}>
            {cursor.price.toFixed(2)}
          </div>
        )}

        {!visible.length && <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">Aguardando ticks…</div>}
        <div className="pointer-events-none absolute bottom-2 left-5 right-14 flex justify-between text-[8px] text-slate-500"><span>Agora</span><span>{visible.length} ticks</span><span>Ao vivo</span></div>
      </div>
    </div>
  );
}
