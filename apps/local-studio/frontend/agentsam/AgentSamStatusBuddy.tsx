import { useEffect, useState } from 'react';
import { useCompanionSettings } from './CompanionContext';
import { companionStateAsset, resolveCompanion, type CompanionState } from './companions';
import type { CompanionStatusSignal } from './companion-events';

function stateForSignal(signal: CompanionStatusSignal): CompanionState {
  switch (signal.type) {
    case 'work-started': return 'working';
    case 'runtime-idle': return 'resting';
    case 'tests-passed': return 'success';
    case 'syntax-warning': return 'attention';
    case 'blocked': return 'error';
    case 'state': return signal.state;
  }
}

/** Optional second companion that reflects runtime and work signals without replacing the active pet. */
export function AgentSamStatusBuddy() {
  const { settings } = useCompanionSettings();
  const [state, setState] = useState<CompanionState>('resting');
  const [message, setMessage] = useState('Keeping watch');
  const companion = settings.secondaryId ? resolveCompanion(settings.secondaryId, settings.customCompanions) : null;

  useEffect(() => {
    let resetTimer: number | undefined;
    const onStatus = (event: Event) => {
      const signal = (event as CustomEvent<CompanionStatusSignal>).detail;
      if (!signal) return;
      const next = stateForSignal(signal);
      setState(next);
      const explicitMessage = 'message' in signal ? signal.message : undefined;
      const defaultMessages: Partial<Record<CompanionState, string>> = {
        working: 'Working alongside you', resting: 'Runtime is resting', success: 'Tests passed',
        attention: 'A warning needs a look', error: 'Something needs attention',
      };
      setMessage(explicitMessage || defaultMessages[next] || 'Keeping watch');
      if (resetTimer) window.clearTimeout(resetTimer);
      if (next === 'success' || next === 'attention' || next === 'error') {
        resetTimer = window.setTimeout(() => {
          setState('resting');
          setMessage('Keeping watch');
        }, 3200);
      }
    };
    window.addEventListener('agentsam:companion:status', onStatus);
    return () => {
      window.removeEventListener('agentsam:companion:status', onStatus);
      if (resetTimer) window.clearTimeout(resetTimer);
    };
  }, []);

  if (!settings.desktopBuddyEnabled || !companion || !companion.selectable || companion.id === settings.activeId) return null;
  const image = companionStateAsset(companion, state) || companion.avatarUrl;
  return <aside className="pointer-events-auto fixed bottom-4 right-4 z-[75] hidden sm:block" data-companion-status-buddy={companion.id}>
    <button type="button" onClick={() => { window.location.href = '/admin/agentsam'; }}
      className="flex items-center gap-2 rounded-2xl border border-border/80 bg-background/95 p-2 pr-3 text-left shadow-xl shadow-black/20 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-emerald-400/35"
      title={`${companion.name} · ${message}`} aria-label={`${companion.name}, ${message}. Open AgentSam Work.`}>
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-emerald-950/40">
        {image ? <img src={image} alt="" className="h-full w-full object-contain" draggable={false} /> : <span className="text-lg font-semibold text-emerald-200">{companion.name.slice(0, 1)}</span>}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold">{companion.name}</span>
        <span className="block max-w-[150px] truncate text-[10px] text-muted-foreground">{message}</span>
      </span>
      <span className={`ml-1 size-2 shrink-0 rounded-full ${state === 'error' ? 'bg-rose-400' : state === 'success' ? 'bg-emerald-400' : state === 'working' ? 'bg-sky-400 animate-pulse' : 'bg-muted-foreground/50'}`} aria-hidden="true" />
    </button>
  </aside>;
}
