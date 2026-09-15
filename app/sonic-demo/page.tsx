'use client';

import { useMemo, useState } from 'react';
import { createSonicStakeManager } from '@/lib/sonicStakeManager';

export default function SonicDemoPage() {
  const [baseStake, setBaseStake] = useState(0.75);
  const [version, setVersion] = useState(0);
  const [manager, setManager] = useState(() => createSonicStakeManager({ baseStake: 0.75 }));

  const state = useMemo(() => manager.getState(), [manager, version]);
  const nextAfterLoss = useMemo(() => {
    const preview = createSonicStakeManager({ baseStake });
    preview.restore({ level: Math.min(state.maxLevel, state.level + 1) });
    return preview.getStake();
  }, [baseStake, state.level, state.maxLevel]);

  const resetWithStake = () => {
    const next = createSonicStakeManager({ baseStake });
    setManager(next);
    setVersion(v => v + 1);
  };

  const win = () => {
    manager.recordWin();
    setVersion(v => v + 1);
  };

  const loss = () => {
    manager.recordLoss();
    setVersion(v => v + 1);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white p-6">
      <div className="mx-auto max-w-xl space-y-5">
        <header>
          <div className="text-xs uppercase tracking-[0.2em] text-white/50">MatosFX</div>
          <h1 className="text-3xl font-bold mt-1">SONIC DEMO</h1>
          <p className="text-sm text-white/60 mt-2">Simulação da progressão de stake. Nenhuma operação Deriv é enviada.</p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <label className="block text-sm text-white/70">
            Stake base
            <input
              type="number"
              min="0.35"
              step="0.01"
              value={baseStake}
              onChange={e => setBaseStake(Number(e.target.value) || 0.35)}
              className="mt-2 w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-white outline-none"
            />
          </label>
          <button onClick={resetWithStake} className="w-full rounded-xl bg-white text-black px-4 py-3 font-semibold">
            Reiniciar Sonic
          </button>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/50">Nível</div>
            <div className="text-3xl font-bold mt-1">{state.level}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/50">Stake atual</div>
            <div className="text-3xl font-bold mt-1">${state.stake.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/50">Após perda</div>
            <div className="text-2xl font-bold mt-1">${nextAfterLoss.toFixed(2)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-white/50">Limite</div>
            <div className="text-sm font-semibold mt-2">Nível {state.maxLevel}</div>
            <div className="text-xs text-white/50 mt-1">Sem limite monetário</div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button onClick={win} className="rounded-xl border border-white/10 bg-white/10 px-4 py-4 font-semibold">
            WIN → Reset 0
          </button>
          <button onClick={loss} className="rounded-xl border border-white/10 bg-white/10 px-4 py-4 font-semibold">
            LOSS → Próximo nível
          </button>
        </section>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
          Exemplo: com base $0,75, uma sequência de perdas sobe o nível e recalcula o stake; uma vitória volta ao nível 0.
        </div>
      </div>
    </main>
  );
}
