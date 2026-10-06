import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, FileText, Images, Mail, Plus, Save, Search, Trash2, Upload } from 'lucide-react';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';
import { campaignProjectStore, type CampaignProject, CAMPAIGNS_CHANGED } from '@/lib/campaigns/store';
// @ts-ignore Published portable campaign planning contract.
import { makeCampaignPlanningBrief } from '@inneranimalmedia/agentsam-campaign/project';

type PreviewMode = 'email' | 'social' | 'site';
const input = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-foreground/50 focus:ring-2 focus:ring-foreground/10';
const action = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm font-medium text-foreground transition hover:bg-muted disabled:opacity-40';
const primary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-85 disabled:opacity-40';
const field = 'space-y-1.5';
const channels = [
  { id: 'email', label: 'Email' },
  { id: 'social', label: 'Social' },
  { id: 'site', label: 'Website' },
  { id: 'search', label: 'Search' },
] as const;

function navigate(to: string) {
  window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to } }));
}
function saveJSON(data: unknown, name: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name.replace(/[^a-z0-9_-]/gi, '-') + '.json';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function CampaignStudioPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <div role="status" className="p-8 text-muted-foreground">Opening Campaign Studio…</div>;
  if (!user) return <RedirectToSignIn />;
  return <CampaignStudio accountId={user.id} />;
}

export function CampaignStudio({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<CampaignProject[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [draft, setDraft] = useState<CampaignProject | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [filter, setFilter] = useState('');
  const [preview, setPreview] = useState<PreviewMode>('email');
  const [brief, setBrief] = useState<any>(null);
  const importer = useRef<HTMLInputElement>(null);

  const loadList = useCallback(async () => {
    const found = await campaignProjectStore.list(accountId);
    setItems(found);
    return found;
  }, [accountId]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void loadList().then((found) => {
      if (!live) return;
      const next = found[0] ?? null;
      setSelected(next?.id || '');
      setDraft(next);
      setDirty(false);
      setLoading(false);
    }, (cause) => { if (live) { setError(String(cause)); setLoading(false); } });
    const handler = () => { void loadList().catch((cause) => setError(String(cause))); };
    window.addEventListener(CAMPAIGNS_CHANGED, handler);
    return () => { live = false; window.removeEventListener(CAMPAIGNS_CHANGED, handler); };
  }, [accountId, loadList]);

  function edit<K extends keyof CampaignProject>(key: K, value: CampaignProject[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
    setNotice('');
    setBrief(null);
  }
  function editMaterial(key: keyof CampaignProject['material'], value: string) {
    if (!draft) return;
    setDraft({ ...draft, material: { ...draft.material, [key]: value } });
    setDirty(true);
    setNotice('');
    setBrief(null);
  }
  function choose(project: CampaignProject) {
    if (dirty && !window.confirm('Discard unsaved changes to this campaign?')) return;
    setSelected(project.id);
    setDraft(project);
    setDirty(false);
    setBrief(null);
    setError('');
    setNotice('');
  }
  async function create() {
    if (!name.trim()) { setError('Enter a campaign name.'); return; }
    setBusy(true); setError('');
    try {
      const project = await campaignProjectStore.create(accountId, name.trim());
      await loadList();
      setSelected(project.id); setDraft(project); setDirty(false); setBrief(null); setName('');
      setNotice('Draft created on this installation.');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const saved = await campaignProjectStore.save(accountId, draft);
      setDraft(saved);
      setDirty(false);
      setNotice('Draft saved on this installation.');
      await loadList();
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  async function duplicate() {
    if (!draft) return;
    setBusy(true); setError('');
    try {
      const created = await campaignProjectStore.importDraft(accountId, { ...draft, name: draft.name + ' revision' });
      await loadList();
      setDraft(created); setSelected(created.id); setDirty(false); setBrief(null);
      setNotice('Separate revision created.');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!draft || !window.confirm('Delete this local campaign draft? This cannot be undone.')) return;
    setBusy(true); setError('');
    try {
      await campaignProjectStore.remove(accountId, draft.id);
      const rest = await loadList();
      setDraft(rest[0] || null); setSelected(rest[0]?.id || '');
      setDirty(false); setBrief(null); setNotice('Local draft deleted.');
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      if (file.size > 2_000_000) throw new Error('campaign_file_too_large');
      const json = JSON.parse(await file.text());
      const project = await campaignProjectStore.importDraft(accountId, json);
      await loadList();
      setSelected(project.id); setDraft(project); setDirty(false); setBrief(null);
      setNotice('Imported a new local draft. No live campaign was changed.');
    } catch (cause) { setError('Import failed: ' + String(cause)); }
    finally { setBusy(false); if (importer.current) importer.current.value = ''; }
  }
  function planBrief() {
    if (!draft) return;
    try { setBrief(makeCampaignPlanningBrief(draft)); setError(''); }
    catch (cause) { setError(String(cause)); }
  }

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background" data-studio-product="campaigns">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card/40 px-5 py-4">
      <div>
        <div className="flex items-center gap-2"><span className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Creator suite</span><span className="text-xs text-muted-foreground">Local drafts · no live publishing</span></div>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Campaign Studio</h1>
        <p className="text-xs text-muted-foreground">Plan, compose, review, and export campaigns across your brands and channels.</p>
      </div>
      <div className="flex gap-2">
        <button className={action} onClick={() => navigate('/media')}><Images size={15}/> Media library <ArrowUpRight size={14}/></button>
        <button className={primary} onClick={save} disabled={!draft || busy || !dirty}><Save size={15}/> Save draft</button>
      </div>
    </header>
    {error && <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-2 text-sm text-destructive">{error}</div>}
    {notice && <div role="status" className="border-b border-border px-5 py-2 text-xs text-muted-foreground"><Check className="mr-1 inline" size={13}/>{notice}</div>}
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-auto lg:grid-cols-[245px_minmax(0,1fr)] 2xl:grid-cols-[270px_minmax(0,1fr)_340px]">
      <aside className="border-b border-border bg-muted/20 p-4 lg:overflow-auto lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Campaign drafts</h2><span className="text-xs text-muted-foreground">{items.length}</span></div>
        <div className="flex gap-2"><input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void create(); }} className={input} placeholder="New campaign name" aria-label="New campaign name"/><button className={primary} aria-label="Create campaign" disabled={busy} onClick={() => void create()}><Plus size={17}/></button></div>
        <label className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"><Search size={15} className="text-muted-foreground"/><input className="min-w-0 flex-1 bg-transparent text-xs outline-none" placeholder="Find drafts" value={filter} onChange={(e) => setFilter(e.target.value)}/></label>
        <div className="mt-3 space-y-1.5">
          {loading && <p className="p-3 text-xs text-muted-foreground">Loading saved drafts…</p>}
          {!loading && !items.length && <p className="p-3 text-xs text-muted-foreground">No campaigns yet. Create your first draft above.</p>}
          {items.filter((entry) => entry.name.toLowerCase().includes(filter.toLowerCase())).map((entry) => <button key={entry.id} onClick={() => choose(entry)} className={'w-full rounded-xl border p-3 text-left transition ' + (selected === entry.id ? 'border-foreground/25 bg-card shadow-sm' : 'border-transparent hover:bg-card/75')}>
            <div className="line-clamp-2 text-sm font-medium">{entry.name}</div><div className="mt-1 flex justify-between gap-2 text-[11px] text-muted-foreground"><span className="capitalize">{entry.status}</span><span>{entry.updatedAt ? new Date(entry.updatedAt).toLocaleDateString() : 'New'}</span></div>
          </button>)}
        </div>
        <div className="mt-5 border-t border-border pt-4">
          <input ref={importer} className="hidden" aria-label="Import campaign JSON" type="file" accept=".json,application/json" onChange={(e) => void importFile(e.target.files?.[0])}/>
          <button className={action + ' w-full'} onClick={() => importer.current?.click()} disabled={busy}><Upload size={15}/> Import campaign JSON</button>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">Drafts are stored on this device or browser. Export JSON to move them between installations. Connecting a publishing channel is a separate approval step.</p>
        </div>
      </aside>
      {!draft ? <main className="flex min-h-[350px] flex-col items-center justify-center gap-3 p-8 text-center"><FileText size={28} className="text-muted-foreground"/><h2 className="text-lg font-medium">Build a campaign</h2><p className="max-w-sm text-sm text-muted-foreground">Set a campaign name on the left to create an editable, durable marketing draft.</p></main> : <>
      <main className="min-w-0 space-y-6 p-5 lg:overflow-auto lg:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><span className="text-[11px] uppercase tracking-widest text-muted-foreground">Campaign / {draft.status}</span><h2 className="mt-1 text-xl font-semibold">{draft.name}</h2></div>
          <div className="flex flex-wrap gap-2"><button className={action} onClick={() => void duplicate()} disabled={busy}><Copy size={14}/> Duplicate</button><button className={action} onClick={() => saveJSON(draft, draft.name)}><Download size={14}/> Export</button><button aria-label="Delete campaign" title="Delete local draft" className={action} onClick={() => void remove()} disabled={busy}><Trash2 size={14}/></button></div>
        </div>
        <section className="grid gap-4 md:grid-cols-2">
          <label className={field}><span className="text-xs font-medium">Campaign name</span><input className={input} value={draft.name} onChange={(e) => edit('name', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Status</span><select className={input} value={draft.status} onChange={(e) => edit('status', e.target.value as 'draft'|'review')}><option value="draft">Draft</option><option value="review">Ready for review</option></select></label>
          <label className={field}><span className="text-xs font-medium">Goal / objective</span><input className={input} placeholder="Introduce new collection" value={draft.objective} onChange={(e) => edit('objective', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Audience</span><input className={input} placeholder="Customers, subscribers, community" value={draft.audience} onChange={(e) => edit('audience', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Offer / campaign promise</span><input className={input} value={draft.offer} onChange={(e) => edit('offer', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Brand / site reference</span><input className={input} placeholder="Brand ID (optional)" value={draft.sourceBrandId} onChange={(e) => edit('sourceBrandId', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Start date</span><input type="date" className={input} value={draft.startDate} onChange={(e) => edit('startDate', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">End date</span><input type="date" className={input} value={draft.endDate} onChange={(e) => edit('endDate', e.target.value)}/></label>
        </section>
        <section className="space-y-3 border-t border-border pt-5"><h3 className="text-sm font-semibold">Channels</h3><div className="flex flex-wrap gap-2">{channels.map(({id,label}) => <label key={id} className={'cursor-pointer rounded-lg border px-3 py-2 text-xs transition ' + (draft.channels.includes(id) ? 'border-foreground/30 bg-muted text-foreground' : 'border-border text-muted-foreground')}><input className="mr-2 accent-foreground" type="checkbox" checked={draft.channels.includes(id)} onChange={(e) => edit('channels', e.target.checked ? [...draft.channels,id] : draft.channels.filter((v: string) => v !== id))}/>{label}</label>)}</div></section>
        <section className="space-y-4 border-t border-border pt-5"><h3 className="text-sm font-semibold">Message & creative</h3>
          <label className={field}><span className="text-xs font-medium">Headline</span><input className={input} placeholder="A campaign headline worth remembering" value={draft.material.headline} onChange={(e) => editMaterial('headline', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Body / campaign copy</span><textarea rows={4} className={input} value={draft.material.body} onChange={(e) => editMaterial('body', e.target.value)}/></label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={field}><span className="text-xs font-medium">Call to action</span><input className={input} placeholder="Explore the collection" value={draft.material.cta} onChange={(e) => editMaterial('cta', e.target.value)}/></label>
            <label className={field}><span className="text-xs font-medium">Landing URL</span><input type="url" className={input} placeholder="https://yourbrand.com/..." value={draft.material.landingUrl} onChange={(e) => editMaterial('landingUrl', e.target.value)}/></label>
            <label className={field}><span className="text-xs font-medium">Email subject</span><input className={input} value={draft.material.emailSubject} onChange={(e) => editMaterial('emailSubject', e.target.value)}/></label>
            <label className={field}><span className="text-xs font-medium">Media asset ID (from library)</span><input className={input} placeholder="Optional approved asset reference" value={draft.material.mediaAssetId} onChange={(e) => editMaterial('mediaAssetId', e.target.value)}/></label>
          </div>
          <label className={field}><span className="text-xs font-medium">Social caption</span><textarea rows={3} className={input} value={draft.material.socialCaption} onChange={(e) => editMaterial('socialCaption', e.target.value)}/></label>
          <label className={field}><span className="text-xs font-medium">Campaign brief and instructions</span><textarea rows={4} className={input} value={draft.brief} onChange={(e) => edit('brief', e.target.value)}/></label>
        </section>
        <section className="space-y-3 border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Evidence-aware planning brief</h3><p className="text-xs text-muted-foreground">Uses the real AgentSam campaign engine. Missing brand, inventory, and analytics evidence is reported, not invented.</p></div><button className={action} onClick={planBrief}>Build planning brief</button></div>
          {brief && <div className="rounded-xl border border-border bg-card p-4 text-sm"><div className="flex items-center gap-2 font-medium"><Check size={15}/> {brief.objective}</div><p className="mt-2 text-xs text-muted-foreground">Status: draft · Evidence sources available: {brief.evidence?.summary?.available ?? 0} / {brief.evidence?.summary?.total ?? 'unknown'}</p><p className="mt-1 text-xs text-muted-foreground">Missing: {(brief.evidence?.summary?.missing || []).join(', ') || 'none'}</p><button className={action + ' mt-3'} onClick={() => saveJSON(brief, draft.name + '-planning-brief')}><Download size={13}/> Export brief</button></div>}
        </section>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5"><button className={primary} disabled={busy || !dirty} onClick={() => void save()}><Save size={15}/> Save draft</button><span className="text-xs text-muted-foreground">{dirty ? 'Unsaved edits' : 'No unsaved edits'}</span></div>
      </main>
      <aside className="min-h-[450px] space-y-4 border-t border-border bg-muted/20 p-5 2xl:overflow-auto 2xl:border-l 2xl:border-t-0">
        <div className="flex items-center justify-between"><h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Live composition preview</h3><span className="text-[10px] text-muted-foreground">Draft only</span></div>
        <div className="flex rounded-xl border border-border bg-card p-1">{(['email','social','site'] as const).map((mode) => <button key={mode} className={'flex-1 rounded-lg px-2 py-2 text-xs capitalize ' + (preview === mode ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted')} onClick={() => setPreview(mode)}>{mode}</button>)}</div>
        <div className="min-h-[290px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {preview === 'email' && <><div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground"><Mail size={15}/> Email draft · not sent</div><div className="space-y-4 p-5"><div className="border-b border-border pb-3 text-xs text-muted-foreground">Subject: <span className="font-medium text-foreground">{draft.material.emailSubject || 'Your subject line'}</span></div><p className="text-lg font-semibold">{draft.material.headline || 'Your headline'}</p><p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{draft.material.body || 'Your campaign copy appears here as you write.'}</p><span className="inline-block rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background">{draft.material.cta || 'Call to action'}</span></div></>}
          {preview === 'social' && <><div className="border-b border-border p-4 text-xs text-muted-foreground">Social post draft · not published</div><div className="space-y-4 p-5"><div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground"><Images size={18} className="mr-2"/> {draft.material.mediaAssetId ? 'Linked asset: ' + draft.material.mediaAssetId : 'Choose artwork from Media'}</div><p className="whitespace-pre-wrap text-sm">{draft.material.socialCaption || draft.material.body || 'Your social caption appears here.'}</p></div></>}
          {preview === 'site' && <><div className="border-b border-border p-4 text-xs text-muted-foreground">Website campaign placement · conceptual preview</div><div className="flex min-h-[260px] flex-col justify-center space-y-4 bg-muted/50 p-6 text-center"><p className="text-2xl font-bold tracking-tight">{draft.material.headline || 'Campaign headline'}</p><p className="text-sm text-muted-foreground">{draft.material.body || 'Write the campaign copy.'}</p><span className="mx-auto rounded-xl bg-foreground px-4 py-2 text-xs font-semibold text-background">{draft.material.cta || 'Explore'}</span></div></>}
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Preview is based on this draft. It is not a live email, social post, storefront publication, or production asset render.</p>
      </aside>
      </>}
    </div>
  </div>;
}
