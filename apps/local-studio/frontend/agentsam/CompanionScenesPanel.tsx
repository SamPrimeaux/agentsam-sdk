import { useState, type CSSProperties } from 'react';
import { IconAction } from '@/components/ui/icon-action';
import { Check, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCompanionSettings } from './CompanionContext';
import {
  COMPANION_STATE_LABELS, INNERANIMAL_COMPANIONS,
  companionStateAsset, resolveCompanion, extendBuiltInCompanion,
  type CompanionScene, type CompanionSceneLayer, type CompanionProfile,
} from './companions';

const actionClass = 'inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50';
const inputClass = 'h-9 w-full rounded-lg border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary/50';
const safeAsset = (value: string) => /^https:\/\/[^\s]+$/i.test(value) || /^\/(?!\/)(?!.*\.\.)[a-zA-Z0-9_./-]+$/.test(value);

function sceneLayer(companionId: string): CompanionSceneLayer {
  return { id: 'layer_' + crypto.randomUUID(), companionId, stateId: 'idle', x: 50, y: 64, scale: 1 };
}

function sceneAnimationOptions(profile: CompanionProfile) {
  const starter = profile.galleryStates?.map((state) => ({ id: state.id, label: state.label })) ||
    COMPANION_STATE_LABELS.map((state) => ({ id: state.id, label: state.label }));
  const seen = new Set(starter.map((state) => state.id));
  return [...starter, ...Object.keys(profile.states).filter((id) => !seen.has(id))
    .map((id) => ({ id, label: id.replace(/-/g, ' ') }))];
}

/** A lightweight, account-owned scene composer. Visuals are separate from terminal PTYs. */
export function CompanionScenesPanel() {
  const { settings, activeCompanion, save, saving, loading, error } = useCompanionSettings();
  const [draft, setDraft] = useState<CompanionScene | null>(null);
  const [formError, setFormError] = useState('');
  const scenes = settings.scenes || [];
  const characters = [
    ...INNERANIMAL_COMPANIONS.filter((item) => item.selectable)
      .map((item) => extendBuiltInCompanion(item, settings.builtInAnimations)),
    ...settings.customCompanions.map((item) => resolveCompanion(item.id, settings.customCompanions)),
  ];
  const character = (id: string) => characters.find((item) => item.id === id) || activeCompanion;

  const startScene = () => {
    setDraft({
      id: 'scene_' + crypto.randomUUID(),
      name: '', description: '', backgroundUrl: null,
      layers: [sceneLayer(activeCompanion.id)],
    });
    setFormError('');
  };
  const updateLayer = (id: string, patch: Partial<CompanionSceneLayer>) => {
    setDraft((current) => current ? {
      ...current,
      layers: current.layers.map((item) => item.id === id ? { ...item, ...patch } : item),
    } : null);
  };
  const removeScene = async (id: string) => {
    if (saving || loading || Boolean(error)) return;
    try {
      await save({ ...settings, scenes: scenes.filter((scene) => scene.id !== id) });
      if (draft?.id === id) setDraft(null);
      toast.success('Scene removed.');
    } catch { toast.error('The scene could not be removed.'); }
  };
  const persist = async () => {
    if (!draft || saving || loading || Boolean(error)) return;
    const name = draft.name.trim();
    if (!name || !draft.layers.length || (draft.backgroundUrl && !safeAsset(draft.backgroundUrl))) {
      setFormError('Name your scene, include at least one companion, and use a safe background URL.');
      return;
    }
    const normalized = { ...draft, name, description: draft.description.trim(), backgroundUrl: draft.backgroundUrl?.trim() || null };
    try {
      await save({ ...settings, scenes: [...scenes.filter((scene) => scene.id !== normalized.id), normalized] });
      setDraft(normalized);
      setFormError('');
      toast.success('Scene saved to your companion library.');
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Scene could not be saved.');
    }
  };

  return <section className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
    <aside className="space-y-3 rounded-xl border border-border/70 bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Scenes</h3>
          <p className="text-[10px] text-muted-foreground">{scenes.length} saved</p>
        </div>
        <button type="button" className={actionClass} onClick={startScene} disabled={loading || saving || Boolean(error)}>
          <Plus className="size-3.5" /> Add
        </button>
      </div>
      {scenes.length ? scenes.map((scene) =>
        <div key={scene.id} className="flex items-center gap-1 rounded-lg border border-border/70 p-1.5">
          <button type="button" onClick={() => { setDraft({ ...scene, layers: scene.layers.map((layer) => ({ ...layer })) }); setFormError(''); }}
            className="min-w-0 flex-1 rounded px-1.5 py-1.5 text-left hover:bg-muted">
            <span className="block truncate text-xs font-medium">{scene.name}</span>
            <span className="block text-[10px] text-muted-foreground">{scene.layers.length} layers</span>
          </button>
          <IconAction type="button" label={'Remove scene ' + scene.name} variant="ghost" className="text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void removeScene(scene.id)} disabled={saving}><Trash2 className="size-3.5" /></IconAction>
        </div>) : <p className="rounded-lg border border-dashed border-border/70 p-3 text-xs leading-5 text-muted-foreground">Create a scene to combine companion actions into one reusable visual.</p>}
    </aside>
    {draft ? <div className="min-w-0 space-y-3">
      <div className="flex items-center gap-2">
        <input aria-label="Scene name" className={inputClass} value={draft.name} maxLength={64}
          placeholder="Scene name, e.g. Morning briefing" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        <IconAction type="button" variant="ghost" label="Close scene editor" onClick={() => setDraft(null)}><X className="size-4" /></IconAction>
      </div>
      <input aria-label="Scene description" className={inputClass} value={draft.description} maxLength={240}
        placeholder="What happens in this scene?" onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
      <div className="relative aspect-video min-h-[210px] overflow-hidden rounded-xl border border-border/70 bg-muted/40 bg-[image:var(--companion-scene-background)] bg-cover bg-center"
        style={{ '--companion-scene-background': draft.backgroundUrl && safeAsset(draft.backgroundUrl) ? 'url(' + JSON.stringify(draft.backgroundUrl) + ')' : 'none' } as CSSProperties}>
        {draft.layers.map((layer) => {
          const profile = character(layer.companionId);
          const src = profile.galleryStates?.find((state) => state.id === layer.stateId)?.src ||
            companionStateAsset(profile, layer.stateId);
          const position = { '--scene-left': layer.x + '%', '--scene-top': layer.y + '%', '--scene-width': (32 * layer.scale) + '%' } as CSSProperties;
          return src ? <img key={layer.id} alt={profile.name + ' · ' + layer.stateId} src={src}
            className="pointer-events-none absolute left-[var(--scene-left)] top-[var(--scene-top)] w-[var(--scene-width)] -translate-x-1/2 -translate-y-1/2 max-h-full object-contain" style={position} /> :
            <div key={layer.id} style={position} className="pointer-events-none absolute left-[var(--scene-left)] top-[var(--scene-top)] w-[var(--scene-width)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border/70 bg-card/75 px-2 py-2 text-center text-xs text-muted-foreground">
              {profile.name} · artwork not yet assigned
            </div>;
        })}
        {!draft.layers.length ? <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground"><ImageIcon className="size-4" /> Add a companion layer</span> : null}
      </div>
      <label className="block text-xs text-muted-foreground">Background image (optional)
        <input aria-label="Scene background URL" value={draft.backgroundUrl || ''} onChange={(event) => setDraft({ ...draft, backgroundUrl: event.target.value || null })}
          className={'mt-1 ' + inputClass} placeholder="https://… or /brand/…" />
      </label>
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Companion layers</h4>
        <button type="button" onClick={() => setDraft({ ...draft, layers: [...draft.layers, sceneLayer(activeCompanion.id)] })} className={actionClass}><Plus className="size-3.5" /> Add layer</button>
      </div>
      <div className="space-y-2">
        {draft.layers.map((layer, index) => {
          const profile = character(layer.companionId);
          return <div key={layer.id} className="grid grid-cols-2 gap-2 rounded-lg border border-border/70 bg-card/40 p-3 sm:grid-cols-[1fr_1fr_75px_75px_75px_28px]">
            <label className="text-[10px] text-muted-foreground">Companion
              <select aria-label={'Layer ' + (index + 1) + ' companion'} className={'mt-1 ' + inputClass} value={layer.companionId}
                onChange={(event) => updateLayer(layer.id, { companionId: event.target.value, stateId: 'idle' })}>
                {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-[10px] text-muted-foreground">Animation
              <select aria-label={'Layer ' + (index + 1) + ' animation'} className={'mt-1 ' + inputClass} value={layer.stateId}
                onChange={(event) => updateLayer(layer.id, { stateId: event.target.value })}>
                {sceneAnimationOptions(profile).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            {([
              ['x', 'X %', 0, 100, 1],
              ['y', 'Y %', 0, 100, 1],
              ['scale', 'Scale', 0.1, 3, 0.1],
            ] as const).map(([key, label, min, max, step]) => <label key={key} className="text-[10px] text-muted-foreground">{label}
              <input aria-label={'Layer ' + (index + 1) + ' ' + label} type="number" min={min} max={max} step={step}
                value={layer[key]} className={'mt-1 ' + inputClass} onChange={(event) => updateLayer(layer.id, { [key]: Number(event.target.value) })} />
            </label>)}
            <IconAction type="button" label={'Remove layer ' + (index + 1)} variant="ghost" className="self-end text-muted-foreground hover:bg-muted" onClick={() => setDraft({ ...draft, layers: draft.layers.filter((item) => item.id !== layer.id) })}><Trash2 className="size-4" /></IconAction>
          </div>;
        })}
      </div>
      {formError ? <p role="alert" className="text-xs text-destructive">{formError}</p> : null}
      <div className="flex justify-end"><button type="button" onClick={() => void persist()} disabled={saving || loading || Boolean(error)} className={actionClass}><Check className="size-3.5" /> {saving ? 'Saving…' : 'Save scene'}</button></div>
    </div> : <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-dashed border-border/70 p-6 text-center text-xs text-muted-foreground">
      Choose a scene to edit, or add one to begin composing.
    </div>}
  </section>;
}
