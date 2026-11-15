import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { companionStateAsset, resolveCompanion } from './companions';
import type { CompanionHandoffSignal } from './companion-events';

export function AgentSamDuoHandoff() {
  const [handoff, setHandoff] = useState<CompanionHandoffSignal | null>(null);
  useEffect(() => {
    let hideTimer: number | undefined;
    const onHandoff = (event: Event) => {
      const detail = (event as CustomEvent<CompanionHandoffSignal>).detail;
      if (!detail?.fromId || !detail?.toId) return;
      setHandoff(detail);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setHandoff(null), 2600);
    };
    window.addEventListener('agentsam:companion:handoff', onHandoff);
    return () => {
      window.removeEventListener('agentsam:companion:handoff', onHandoff);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, []);

  if (!handoff) return null;
  const from = resolveCompanion(handoff.fromId);
  const to = resolveCompanion(handoff.toId);
  const fromImage = companionStateAsset(from, 'thinking') || from.avatarUrl;
  const toImage = companionStateAsset(to, 'working') || to.avatarUrl;
  return <div className="pointer-events-none fixed bottom-5 left-1/2 z-[85] -translate-x-1/2" role="status" aria-live="polite" data-companion-handoff={`${from.id}-${to.id}`}>
    <div className="flex min-w-[270px] items-center gap-3 rounded-2xl border border-emerald-400/25 bg-background/95 px-4 py-3 shadow-2xl shadow-black/25 backdrop-blur-xl">
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-950/35">
        {fromImage ? <img src={fromImage} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="font-semibold">{from.name.slice(0, 1)}</span>}
      </span>
      <ArrowRight className="size-4 shrink-0 text-emerald-300" />
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-950/35">
        {toImage ? <img src={toImage} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="font-semibold">{to.name.slice(0, 1)}</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold">{from.name} → {to.name}</span>
        <span className="mt-0.5 block max-w-[190px] text-[10px] leading-4 text-muted-foreground">{handoff.message || `${from.name} sets the direction. ${to.name} takes it from here.`}</span>
      </span>
    </div>
  </div>;
}
