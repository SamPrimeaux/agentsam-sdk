import { useMemo, useState } from 'react';
import { ArrowRight, Check, Image as ImageIcon, Plus, WandSparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkStore } from '@/lib/work/store';
import { useCompanionSettings } from './CompanionContext';
import {
  COMPANION_STATE_LABELS,
  INNERANIMAL_COMPANIONS,
  companionStateAsset,
  resolveCompanion,
  type CompanionProfile,
  type CompanionState,
  type CustomCompanion,
} from './companions';

type CompanionView = 'library' | 'animations' | 'create';
type CompanionDraft = Omit<CustomCompanion, 'id' | 'imageUrl'> & { imageUrl: string };

const emptyDraft: CompanionDraft = {
  name: '', animal: '', role: '', description: '', personality: '',
  visualNotes: '', signatureAction: '', imageUrl: '', stateAssets: {},
};

function openWorkWithBrief(companion: CustomCompanion | CompanionProfile) {
  const custom = 'custom' in companion && companion.custom ? companion.custom : null;
  const name = custom?.name || companion.name;
  const animal = custom?.animal || companion.animal;
  const role = custom?.role || companion.role;
  const description = custom?.description || companion.description;
  const prompt = [
    `Create or continue the InnerAnimal companion package for ${name}, a ${animal}.`,
    `Role: ${role}.`,
    `Character brief: ${description}`,
    custom?.personality ? `Personality: ${custom.personality}` : '',
    custom?.visualNotes ? `Visual direction: ${custom.visualNotes}` : '',
    custom?.signatureAction ? `Signature action: ${custom.signatureAction}` : '',
    'Use the existing InnerAnimal v0.1 package contract: transparent 256×256 character frames, idle/blinking/thinking/working/waiting/attention/success/error/resting/signature states, APNG exports, animation metadata, atlas, contact sheet and previews.',
    'Place the runtime APNGs under assets/brand/inneranimal-companions/v1/custom/<slug>/animations/<slug>-<state>.png. Keep every frame and state independently reviewable, and return the exact /brand/inneranimal-companions/v1/custom/<slug>/animations/<slug>-<state>.png paths so they can be registered in the companion profile.',
    'Preserve original source art, do not overwrite or silently replace an existing character package, and present the finished character for visual approval before calling it production-ready.',
  ].filter(Boolean).join('\n');
  const store = useWorkStore.getState();
  const trailId = store.startTrail();
  store.setDraft(trailId, prompt);
  window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/admin/agentsam' } }));
}

function Portrait({ companion, large = false }: { companion: CompanionProfile; large?: boolean }) {
  const src = companion.portraitUrl || companion.avatarUrl || companion.states.idle;
  return <div className={large
    ? 'flex size-[188px] items-center justify-center overflow-hidden rounded-[28px] bg-[#071b20]/80 sm:size-[216px]'
    : 'flex size-[92px] items-center justify-center overflow-hidden rounded-2xl bg-[#071b20]/80'}>
    {src ? <img src={src} alt={`${companion.name}, ${companion.animal}`} className="h-full w-full object-contain" draggable={false} /> :
      <div className="flex flex-col items-center gap-2 text-cyan-100/65"><ImageIcon className={large ? 'size-9' : 'size-6'} /><span className="text-[10px]">Artwork pending</span></div>}
  </div>;
}

function Preview({ companion, state }: { companion: CompanionProfile; state: CompanionState }) {
  const src = companionStateAsset(companion, state);
  return <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-[#071b20]/70 p-5">
    {src ? <img src={src} alt={`${companion.name} · ${state}`} className="max-h-[260px] max-w-full object-contain" draggable={false} /> :
      <div className="flex flex-col items-center gap-3 text-center text-muted-foreground"><ImageIcon className="size-8" /><p className="max-w-xs text-xs">Add a portrait or build the character artwork and animation package in Work.</p></div>}
  </div>;
}

export function InnerAnimalCompanionsPage() {
  const { settings, activeCompanion, loading, saving, error, refresh, save } = useCompanionSettings();
  const [view, setView] = useState<CompanionView>('library');
  const [previewState, setPreviewState] = useState<CompanionState>('idle');
  const [draft, setDraft] = useState<CompanionDraft>(emptyDraft);
  const [editingCompanionId, setEditingCompanionId] = useState<string | null>(null);
  const [formError, setFormError] = useState('');
  const [creating, setCreating] = useState(false);
  const allCompanions = useMemo(() => [
    ...INNERANIMAL_COMPANIONS,
    ...settings.customCompanions.map((item) => resolveCompanion(item.id, settings.customCompanions)),
  ], [settings.customCompanions]);

  async function choose(companionId: string) {
    if (loading || error || companionId === settings.activeId || saving) return;
    try {
      await save({ ...settings, activeId: companionId });
      setPreviewState('idle');
      toast.success(`${resolveCompanion(companionId, settings.customCompanions).name} is now your Work companion.`);
    } catch { toast.error('The companion selection could not be saved.'); }
  }

  function editCompanion(companion: CustomCompanion) {
    setEditingCompanionId(companion.id);
    setDraft({ ...companion, imageUrl: companion.imageUrl || '', stateAssets: companion.stateAssets || {} });
    setFormError('');
    setView('create');
  }

  async function createCompanion(buildInWork: boolean) {
    if (loading || error || creating || saving) return;
    setFormError('');
    const name = draft.name.trim();
    const animal = draft.animal.trim();
    const role = draft.role.trim();
    const description = draft.description.trim();
    if (!name || !animal || !role || !description) {
      setFormError('Name, animal, role and character brief are required.');
      return;
    }
    const validAssetUrl = (value: string) => !value || /^https:\/\//i.test(value) || (/^\/(?!\/)(?!.*\.\.)[a-zA-Z0-9_./-]+$/.test(value));
    if (!validAssetUrl(draft.imageUrl.trim()) || Object.values(draft.stateAssets).some((url) => !validAssetUrl(url.trim()))) {
      setFormError('Use HTTPS image URLs or safe local /brand asset paths.');
      return;
    }
    const companion: CustomCompanion = {
      id: editingCompanionId || `custom_${crypto.randomUUID()}`,
      name, animal, role, description,
      personality: draft.personality.trim(),
      visualNotes: draft.visualNotes.trim(),
      signatureAction: draft.signatureAction.trim(),
      imageUrl: draft.imageUrl.trim() || null,
      stateAssets: Object.fromEntries(Object.entries(draft.stateAssets).map(([state, url]) => [state, url.trim()]).filter(([, url]) => url)),
    };
    setCreating(true);
    try {
      await save({
        ...settings,
        activeId: companion.id,
        customCompanions: editingCompanionId
          ? settings.customCompanions.map((item) => item.id === editingCompanionId ? companion : item)
          : [...settings.customCompanions, companion],
      });
      setDraft(emptyDraft);
      setEditingCompanionId(null);
      setView('library');
      setPreviewState('idle');
      toast.success(editingCompanionId ? `${companion.name} was updated.` : `${companion.name} was added to your companion library.`);
      if (buildInWork) openWorkWithBrief(companion);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'The companion brief could not be saved.');
    } finally { setCreating(false); }
  }

  const tabs: Array<{ id: CompanionView; label: string }> = [
    { id: 'library', label: 'Library' },
    { id: 'animations', label: 'Animations' },
    { id: 'create', label: 'Create a companion' },
  ];

  return <div className="space-y-5 pb-8">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-300/75">InnerAnimal · First-party plugin</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight">Companion Studio</h2>
        <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted-foreground">Create character briefs, review the original animated family, and choose who joins you in AgentSam Work.</p>
      </div>
      <button type="button" onClick={() => { setEditingCompanionId(null); setDraft(emptyDraft); setFormError(''); setView('create'); }} disabled={loading || Boolean(error) || saving} className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 text-[11px] font-medium text-cyan-100 hover:bg-cyan-400/15 disabled:opacity-50">
        <Plus className="size-3.5" /> Create companion
      </button>
    </header>

    {error ? <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-100/90"><span>Saved companion settings could not be loaded: {error}. Changes are paused to protect your existing selections.</span><button type="button" onClick={() => void refresh()} className="rounded-md border border-amber-300/25 px-2.5 py-1.5 hover:bg-amber-300/10">Retry</button></div> : null}

    <div className="flex flex-wrap gap-1 border-b border-border/70 pb-2" role="tablist" aria-label="Companion studio views">
      {tabs.map((tab) => <button key={tab.id} type="button" role="tab" aria-selected={view === tab.id}
        onClick={() => setView(tab.id)} className={`rounded-md px-3 py-2 text-[11px] font-medium transition-colors ${view === tab.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}>
        {tab.label}
      </button>)}
    </div>

    {view === 'create' ? <section className="rounded-2xl border border-border/70 bg-card/50 p-4 sm:p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100"><WandSparkles className="size-5" /></div>
        <div><h3 className="text-sm font-semibold">{editingCompanionId ? 'Edit companion brief' : 'Create a new companion brief'}</h3><p className="mt-1 text-[11px] leading-5 text-muted-foreground">Define the character here, then hand the brief to AgentSam to build its artwork, animation states and package.</p></div>
      </div>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void createCompanion(false); }}>
        <label className="block"><span className="mb-1.5 block text-[10px] font-medium">Character name *</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={48} required placeholder="e.g. Finch" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-xs outline-none focus:border-cyan-400/50" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-medium">Animal / species *</span><input value={draft.animal} onChange={(event) => setDraft((current) => ({ ...current, animal: event.target.value }))} maxLength={48} required placeholder="e.g. Red panda" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-xs outline-none focus:border-cyan-400/50" /></label>
        <label className="block md:col-span-2"><span className="mb-1.5 block text-[10px] font-medium">Role *</span><input value={draft.role} onChange={(event) => setDraft((current) => ({ ...current, role: event.target.value }))} maxLength={80} required placeholder="What does this companion help with?" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-xs outline-none focus:border-cyan-400/50" /></label>
        <label className="block md:col-span-2"><span className="mb-1.5 block text-[10px] font-medium">Character brief *</span><textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} maxLength={280} required rows={2} placeholder="Describe their character, purpose and personality." className="w-full resize-y rounded-lg border border-border bg-background/60 px-3 py-2 text-xs leading-5 outline-none focus:border-cyan-400/50" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-medium">Personality</span><input value={draft.personality} onChange={(event) => setDraft((current) => ({ ...current, personality: event.target.value }))} maxLength={180} placeholder="Curious, patient, inventive…" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-xs outline-none focus:border-cyan-400/50" /></label>
        <label className="block"><span className="mb-1.5 block text-[10px] font-medium">Signature action</span><input value={draft.signatureAction} onChange={(event) => setDraft((current) => ({ ...current, signatureAction: event.target.value }))} maxLength={180} placeholder="A recognizable gesture or interaction" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-xs outline-none focus:border-cyan-400/50" /></label>
        <label className="block md:col-span-2"><span className="mb-1.5 block text-[10px] font-medium">Visual direction</span><textarea value={draft.visualNotes} onChange={(event) => setDraft((current) => ({ ...current, visualNotes: event.target.value }))} maxLength={400} rows={2} placeholder="Colors, silhouette, materials, expression and props." className="w-full resize-y rounded-lg border border-border bg-background/60 px-3 py-2 text-xs leading-5 outline-none focus:border-cyan-400/50" /></label>
        <label className="block md:col-span-2"><span className="mb-1.5 block text-[10px] font-medium">Portrait image URL (optional)</span><input value={draft.imageUrl} onChange={(event) => setDraft((current) => ({ ...current, imageUrl: event.target.value }))} placeholder="/brand/... or https://…" className="h-9 w-full rounded-lg border border-border bg-background/60 px-3 text-xs outline-none focus:border-cyan-400/50" /></label>
        <details className="rounded-xl border border-border/70 bg-background/30 p-3 md:col-span-2">
          <summary className="cursor-pointer text-[11px] font-medium">Animation state assets <span className="font-normal text-muted-foreground">· optional, 10 states</span></summary>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Paste the public path for each transparent APNG. Any missing state falls back to the idle animation or portrait.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {COMPANION_STATE_LABELS.map((state) => <label key={state.id} className="block min-w-0"><span className="mb-1 block text-[9px] text-muted-foreground">{state.label}</span><input value={draft.stateAssets[state.id] || ''} onChange={(event) => setDraft((current) => ({ ...current, stateAssets: { ...current.stateAssets, [state.id]: event.target.value } }))} placeholder={`/brand/.../${state.id}.png`} className="h-8 w-full rounded-md border border-border bg-background/60 px-2 text-[10px] outline-none focus:border-cyan-400/50" /></label>)}
          </div>
        </details>
        {formError ? <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-[11px] text-red-200 md:col-span-2">{formError}</p> : null}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/70 pt-4 md:col-span-2">
          <button type="button" onClick={() => { setDraft(emptyDraft); setEditingCompanionId(null); setFormError(''); setView('library'); }} className="h-9 rounded-lg border border-border px-3 text-[11px] text-muted-foreground hover:bg-muted">Cancel</button>
          <button type="submit" disabled={creating || saving || loading || Boolean(error)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-[11px] font-medium hover:bg-muted disabled:opacity-50">{creating ? 'Saving…' : editingCompanionId ? 'Save changes' : 'Save brief'}</button>
          <button type="button" disabled={creating || saving || loading || Boolean(error)} onClick={() => void createCompanion(true)} className="inline-flex h-9 items-center gap-2 rounded-lg bg-foreground px-3 text-[11px] font-semibold text-background hover:opacity-90 disabled:opacity-50">
            <WandSparkles className="size-3.5" /> Save & build in Work
          </button>
        </div>
      </form>
    </section> : null}

    {view === 'library' ? <>
      <section className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(240px,.62fr)]">
        <div className="overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-cyan-400/[.08] via-card/80 to-card">
          <div className="grid min-h-[248px] items-center gap-3 p-4 sm:grid-cols-[220px_minmax(0,1fr)] sm:p-5">
            <div className="flex justify-center"><Preview companion={activeCompanion} state="idle" /></div>
            <div className="min-w-0 py-2">
              <p className="text-[9px] font-semibold uppercase tracking-[.18em] text-cyan-200/70">Active Work companion</p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight">{activeCompanion.name}</h3>
              <p className="mt-1 text-[11px] text-cyan-100/70">{activeCompanion.animal} · {activeCompanion.role}</p>
              <p className="mt-3 max-w-xl text-[11px] leading-5 text-muted-foreground">{activeCompanion.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 text-[9px] text-emerald-200"><Check className="size-3" /> Selected for Work</span>
                <button type="button" onClick={() => setView('animations')} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[9px] text-muted-foreground hover:bg-muted">Preview animations <ArrowRight className="size-3" /></button>
                {activeCompanion.custom ? <>
                  <button type="button" onClick={() => editCompanion(activeCompanion.custom!)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 text-[9px] text-muted-foreground hover:bg-muted">Edit profile</button>
                  <button type="button" onClick={() => openWorkWithBrief(activeCompanion)} className="inline-flex h-7 items-center gap-1.5 rounded-full border border-cyan-400/30 px-2.5 text-[9px] text-cyan-100 hover:bg-cyan-400/10">Build artwork in Work</button>
                </> : null}
              </div>
            </div>
          </div>
        </div>
        <aside className="flex flex-col justify-between rounded-2xl border border-border/70 bg-card/40 p-4">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">Work presence</p>
            <h3 className="mt-2 text-sm font-semibold">A companion, not another assistant.</h3>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">Your selected character appears in the Work welcome, the shared AgentSam shell, and the desktop pet. Its idle and working animations follow the session state.</p>
          </div>
          <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/admin/agentsam' } }))} className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-foreground px-3 text-[11px] font-semibold text-background hover:opacity-90">Open Work <ArrowRight className="size-3.5" /></button>
        </aside>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="text-sm font-semibold">The founding family</h3><p className="mt-1 text-[10px] text-muted-foreground">Six original character packages · 345 animation frames · 60 defined states.</p></div>
          <span className="text-[9px] text-muted-foreground">Visual approval remains pending</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {allCompanions.map((companion) => {
            const selected = companion.id === settings.activeId;
            return <button key={companion.id} type="button" aria-pressed={selected} onClick={() => void choose(companion.id)} disabled={saving || loading || Boolean(error)}
              className={`group flex min-w-0 items-center gap-3 rounded-xl border p-3 text-left transition-colors ${selected ? 'border-cyan-400/45 bg-cyan-400/[.07]' : 'border-border/70 bg-card/40 hover:border-border hover:bg-muted/30'}`}>
              <Portrait companion={companion} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2"><strong className="truncate text-[12px] font-semibold">{companion.name}</strong>{selected ? <span className="rounded-full bg-emerald-400/10 px-1.5 py-0.5 text-[8px] text-emerald-200">Active</span> : null}</span>
                <span className="mt-1 block truncate text-[10px] text-muted-foreground">{companion.animal}</span>
                <span className="mt-1.5 block line-clamp-2 text-[10px] leading-4 text-muted-foreground/80">{companion.role}</span>
              </span>
              <span className={`grid size-7 shrink-0 place-items-center rounded-full border ${selected ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-border text-muted-foreground group-hover:text-foreground'}`}>{selected ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}</span>
            </button>;
          })}
        </div>
      </section>
    </> : null}

    {view === 'animations' ? <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <div><h3 className="text-sm font-semibold">{activeCompanion.name} · animation states</h3><p className="mt-1 text-[10px] leading-4 text-muted-foreground">Preview the source APNGs without converting or flattening their transparency.</p></div>
        <Preview companion={activeCompanion} state={previewState} />
        <div className="flex flex-wrap gap-2">
          {COMPANION_STATE_LABELS.map((state) => <button key={state.id} type="button" onClick={() => setPreviewState(state.id)} aria-pressed={previewState === state.id}
            className={`rounded-lg border px-2.5 py-1.5 text-[10px] ${previewState === state.id ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100' : 'border-border text-muted-foreground hover:bg-muted'}`}>{state.label}</button>)}
        </div>
      </div>
      <aside className="rounded-xl border border-border/70 bg-card/40 p-4">
        <p className="text-[9px] font-semibold uppercase tracking-[.16em] text-muted-foreground">State description</p>
        <h4 className="mt-2 text-sm font-semibold">{COMPANION_STATE_LABELS.find((state) => state.id === previewState)?.label}</h4>
        <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{COMPANION_STATE_LABELS.find((state) => state.id === previewState)?.description}</p>
        {!activeCompanion.builtIn ? <p className="mt-4 rounded-lg border border-amber-400/20 bg-amber-400/5 p-3 text-[10px] leading-5 text-amber-100/80">This custom companion has a profile only. Build its transparent animation package in Work to activate these states.</p> : null}
        <button type="button" onClick={() => setView('library')} className="mt-4 h-8 rounded-lg border border-border px-3 text-[10px] text-muted-foreground hover:bg-muted">Back to library</button>
      </aside>
    </section> : null}

    {loading ? <p className="text-[9px] text-muted-foreground">Refreshing saved companion settings…</p> : null}
  </div>;
}
