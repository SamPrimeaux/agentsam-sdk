import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useCompanionSettings } from './CompanionContext';
import { type CompanionAnimation, type CompanionProfile } from './companions';

const EMPTY: CompanionAnimation = {
  id: '', label: '', description: '', src: null,
  fps: 6, frames: 1, loop: true, kind: 'apng',
};
const inputClass = 'h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:border-primary/50';

export function CompanionAnimationExtensions({ companion, onCreated }: {
  companion: CompanionProfile;
  onCreated?: (id: string) => void;
}) {
  const { settings, save, saving, loading, error } = useCompanionSettings();
  const existing = settings.builtInAnimations?.find((item) => item.companionId === companion.id)?.animations || [];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<CompanionAnimation>({ ...EMPTY });
  const [formError, setFormError] = useState('');
  const disabled = saving || loading || Boolean(error);

  const updateRecord = async (animations: CompanionAnimation[]) => {
    const rest = (settings.builtInAnimations || []).filter((row) => row.companionId !== companion.id);
    await save({
      ...settings,
      builtInAnimations: [...rest, ...(animations.length ? [{ companionId: companion.id, animations }] : [])],
    });
  };

  const add = async () => {
    if (disabled) return;
    const label = draft.label.trim();
    const id = draft.id.trim().toLowerCase().replace(/\s+/g, '-');
    const source = draft.src?.trim() || null;
    if (!label || !id || id.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(id) ||
        ['constructor', 'prototype', 'tostring'].includes(id) ||
        companion.states[id] || companion.galleryStates?.some((state) => state.id === id)) {
      setFormError('Choose a new action name that is not already used by this companion.');
      return;
    }
    if (source && !(/^https:\/\//i.test(source) || /^\/(?!\/)(?!.*\.\.)[a-zA-Z0-9_./-]+$/.test(source))) {
      setFormError('Use a secure media URL or a safe /brand asset path.');
      return;
    }
    try {
      await updateRecord([...existing, { ...draft, id, label, src: source }]);
      toast.success('Animation added to ' + companion.name + '.');
      setDraft({ ...EMPTY });
      setEditing(false);
      setFormError('');
      onCreated?.(id);
    } catch (caught) {
      setFormError(caught instanceof Error ? caught.message : 'Unable to save this animation.');
    }
  };

  const remove = async (id: string) => {
    if (disabled) return;
    try {
      await updateRecord(existing.filter((item) => item.id !== id));
      toast.success('Animation removed from your customization.');
    } catch { toast.error('Unable to remove this animation.'); }
  };

  return <section className="mt-4 space-y-3 border-t border-border/70 pt-3">
    <div className="flex items-center justify-between gap-2">
      <h5 className="text-xs font-semibold">Your animations</h5>
      <button type="button" disabled={disabled} onClick={() => { setEditing((old) => !old); setFormError(''); }}
        className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-[10px] font-medium hover:bg-muted">
        {editing ? <X className="size-3" /> : <Plus className="size-3" />}
        {editing ? 'Close' : 'Add animation'}
      </button>
    </div>
    {existing.map((item) => <div key={item.id} className="flex items-center justify-between gap-1 rounded-md border border-border/60 p-1.5">
      <div className="min-w-0">
        <strong className="block truncate text-[10px]">{item.label}</strong>
        <span className="text-[9px] text-muted-foreground">{item.frames} frames · {item.fps} fps{item.src ? '' : ' · draft'}</span>
      </div>
      <button type="button" disabled={disabled} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={'Remove ' + item.label}
        onClick={() => void remove(item.id)}><Trash2 className="size-3.5" /></button>
    </div>)}
    {editing ? <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <label className="block text-[10px] text-muted-foreground">Animation name
        <input className={'mt-1 ' + inputClass} maxLength={64} value={draft.label} placeholder="Celebrating"
          onChange={(event) => {
            const label = event.target.value;
            setDraft((current) => ({ ...current, label, id: label.toLowerCase().trim().replace(/\s+/g, '-') }));
          }} />
      </label>
      <label className="block text-[10px] text-muted-foreground">Media URL (optional while drafting)
        <input className={'mt-1 ' + inputClass} value={draft.src || ''} placeholder="https://… or /brand/…"
          onChange={(event) => setDraft((current) => ({ ...current, src: event.target.value || null }))} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] text-muted-foreground">Frames
          <input className={'mt-1 ' + inputClass} type="number" min="1" max="10000" value={draft.frames}
            onChange={(event) => setDraft((current) => ({ ...current, frames: Number(event.target.value) }))} />
        </label>
        <label className="text-[10px] text-muted-foreground">FPS
          <input className={'mt-1 ' + inputClass} type="number" min="1" max="60" value={draft.fps}
            onChange={(event) => setDraft((current) => ({ ...current, fps: Number(event.target.value) }))} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <input type="checkbox" checked={draft.loop} onChange={(event) => setDraft((current) => ({ ...current, loop: event.target.checked }))} />
        Loop animation
      </label>
      <label className="block text-[10px] text-muted-foreground">Format
        <select className={'mt-1 ' + inputClass} value={draft.kind}
          onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as CompanionAnimation['kind'] }))}>
          <option value="apng">Animated PNG</option><option value="gif">GIF</option><option value="spritesheet">Sprite sheet</option>
          <option value="frames">Frame sequence</option><option value="static">Static pose</option>
        </select>
      </label>
      {formError ? <p role="alert" className="text-[10px] text-destructive">{formError}</p> : null}
      <button type="button" disabled={disabled} className="h-8 w-full rounded-md bg-primary px-3 text-[11px] font-semibold text-primary-foreground disabled:opacity-50"
        onClick={() => void add()}>{saving ? 'Saving…' : 'Save animation'}</button>
    </div> : null}
  </section>;
}
