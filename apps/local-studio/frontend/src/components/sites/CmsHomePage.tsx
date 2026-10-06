import { useEffect, useState } from 'react';
import { ArrowUpRight, Globe2, Images, LayoutTemplate, Megaphone, PanelsTopLeft, Pencil } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { themeProjectStore, THEME_PROJECTS_CHANGED } from '@/lib/themes/projects';

function go(to: string) { window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to } })); }
const destinations = [
  { name: 'Websites', url: '/sites', icon: Globe2, description: 'Create websites, edit pages, and manage local drafts' },
  { name: 'Themes', url: '/themes', icon: LayoutTemplate, description: 'Use real packaged designs, then make them your own' },
  { name: 'Campaigns', url: '/campaigns', icon: Megaphone, description: 'Compose launch briefs, email drafts, and social content' },
  { name: 'Media', url: '/media', icon: Images, description: 'Import, inspect, and organize original creative assets' },
];

export function CmsHomePage() {
  const navigate = useNavigate();
  const [recent, setRecent] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    const load = () => { void themeProjectStore.list().then((projects) => {
      if (mounted) setRecent(projects.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 5));
    }, (cause) => { if (mounted) setError(String(cause)); }); };
    load();
    window.addEventListener(THEME_PROJECTS_CHANGED, load);
    return () => { mounted = false; window.removeEventListener(THEME_PROJECTS_CHANGED, load); };
  }, []);
  return <div className="h-full overflow-auto bg-background" data-studio-product="cms-home">
    <div className="mx-auto max-w-7xl space-y-8 p-6 lg:p-9">
      <header>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"><PanelsTopLeft size={15}/> Site & Creative Studio</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Create, edit, and launch.</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Your sites, themes, media, and campaigns—real authoring workspaces backed by the AgentSam SDK. Publish only when a destination is explicitly connected and approved.</p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {destinations.map((d) => <button key={d.url} onClick={() => go(d.url)} className="group flex min-h-[174px] flex-col rounded-2xl border border-border bg-card p-5 text-left transition hover:border-foreground/30 hover:shadow-sm">
          <div className="flex items-center justify-between"><d.icon size={20}/><ArrowUpRight className="text-muted-foreground group-hover:text-foreground" size={15}/></div>
          <h2 className="mt-auto pt-5 text-base font-semibold">{d.name}</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{d.description}</p>
        </button>)}
      </div>
      <section className="space-y-4 border-t border-border pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Recent site drafts</h2><p className="mt-1 text-xs text-muted-foreground">Saved on this browser or desktop installation; no hidden production deployment.</p></div><button className="rounded-xl border border-border px-4 py-2 text-sm hover:bg-muted" onClick={() => go('/sites')}>All websites <ArrowUpRight className="ml-1 inline" size={14}/></button></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {!recent.length ? <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-8"><p className="font-medium">No saved website projects yet</p><p className="mt-1 text-sm text-muted-foreground">Begin with an original site, or revise one of the packaged themes.</p><div className="mt-4 flex gap-2"><button onClick={() => go('/sites')} className="rounded-xl bg-foreground px-4 py-2 text-sm font-medium text-background">Create website</button><button onClick={() => go('/themes')} className="rounded-xl border border-border px-4 py-2 text-sm">Browse themes</button></div></div> :
          <div className="grid gap-3 md:grid-cols-2">{recent.map((project) => <button key={project.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left hover:bg-muted/50" onClick={() => { void navigate({ to: '/cms', search: { view: 'editor', theme_project: project.id } }); }}>
            <span className="rounded-xl bg-muted p-3"><Globe2 size={19}/></span><div className="min-w-0 flex-1"><h3 className="truncate font-medium">{project.name}</h3><p className="mt-0.5 text-xs text-muted-foreground">{project.pages?.length || 0} page(s) · Local draft</p></div><Pencil size={15} className="text-muted-foreground"/>
          </button>)}</div>}
      </section>
    </div>
  </div>;
}
