import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, FilePlus2, Globe2, Images, LayoutTemplate, Megaphone, Pencil, Plus } from 'lucide-react';
import { themeProjectStore, THEME_PROJECTS_CHANGED } from '@/lib/themes/projects';
import { createThemeDraft, openThemeProject } from '@/lib/themes/inventory';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { RedirectToSignIn } from '@/lib/auth/gates';

const control = 'inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted disabled:opacity-40';
function go(to: string) { window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to } })); }

export function SitesStudioPage() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return <p role="status" className="p-8 text-muted-foreground">Loading Sites…</p>;
  if (!user) return <RedirectToSignIn />;
  return <SitesWorkspace />;
}
export function SitesWorkspace() {
  const [projects, setProjects] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(async () => setProjects(await themeProjectStore.list()), []);
  useEffect(() => {
    void reload().catch((e) => setError(String(e)));
    const listener = () => { void reload().catch((e) => setError(String(e))); };
    window.addEventListener(THEME_PROJECTS_CHANGED, listener);
    return () => window.removeEventListener(THEME_PROJECTS_CHANGED, listener);
  }, [reload]);
  async function createSite() {
    if (!name.trim()) { setError('Give the site draft a name.'); return; }
    setBusy(true); setError('');
    try {
      const project = await createThemeDraft(null, name.trim());
      openThemeProject(project.id);
    } catch (e) { setError(String(e)); }
    finally { setBusy(false); }
  }
  return <div className="h-full overflow-auto bg-background" data-studio-product="sites">
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">CMS / Websites</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">Sites</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Build and edit complete multipage theme projects using the packaged Site Editor. Local drafts are saved on this installation, not published to the internet.</p></div>
        <button className={control} onClick={() => go('/themes')}><LayoutTemplate size={16}/> Explore themes <ArrowUpRight size={14}/></button>
      </header>
      <section className="flex flex-wrap gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <input className="min-w-[220px] flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-foreground" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') void createSite(); }} placeholder="New website or theme project name" aria-label="New site name"/>
        <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-foreground px-5 py-2.5 text-sm font-semibold text-background disabled:opacity-40" onClick={() => void createSite()} disabled={busy}><Plus size={17}/> Create site draft</button>
      </section>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Saved website drafts</h2><span className="text-xs text-muted-foreground">{projects.length} local projects</span></div>
      {!projects.length && <div className="rounded-2xl border border-dashed border-border p-12 text-center"><Globe2 size={28} className="mx-auto text-muted-foreground"/><h3 className="mt-3 font-medium">No saved sites on this installation yet</h3><p className="mt-2 text-sm text-muted-foreground">Create a site above or use a packaged theme as a starting point.</p><button className={control + ' mt-4'} onClick={() => go('/themes')}><FilePlus2 size={15}/> Start from a theme</button></div>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => <article key={project.id} className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-2"><span className="rounded-md bg-muted p-2"><Globe2 size={18}/></span><span className="text-[11px] text-muted-foreground">Local draft</span></div>
          <h3 className="mt-4 line-clamp-2 text-lg font-semibold">{project.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{project.pages?.length || 0} page(s) · {project.sourcePackage || 'Original site'}</p>
          <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground" title={project.id}>{project.id}</p>
          <div className="mt-auto flex items-center justify-between gap-2 pt-5"><span className="text-[11px] text-muted-foreground">{project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : ''}</span><button className={control} onClick={() => openThemeProject(project.id)}><Pencil size={14}/> Edit site</button></div>
        </article>)}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          { title: 'Media Library', to: '/media', description: 'Import, inspect, prepare, and organize creative assets.', icon: Images },
          { title: 'Campaign Studio', to: '/campaigns', description: 'Create linked marketing plans, messages, and channel drafts.', icon: Megaphone },
          { title: 'Themes', to: '/themes', description: 'Review packaged website templates and create site revisions.', icon: LayoutTemplate },
        ].map((link) => <button key={link.to} className="rounded-2xl border border-border p-5 text-left transition hover:bg-card" onClick={() => go(link.to)}><link.icon size={18}/><h3 className="mt-3 font-semibold">{link.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{link.description}</p></button>)}
      </div>
    </div>
  </div>;
}
