import { ArrowUpRight, Globe2, Images, LayoutTemplate, Megaphone, PanelsTopLeft } from 'lucide-react';
import { SitesWorkspace } from './SitesStudioPage';

function go(to: string) { window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to } })); }
const destinations = [
  { name: 'Websites', url: '/sites', icon: Globe2, description: 'Sites, pages, drafts and website editing' },
  { name: 'Theme Library', url: '/themes', icon: LayoutTemplate, description: 'Browse and revise real packaged themes' },
  { name: 'Campaign Studio', url: '/campaigns', icon: Megaphone, description: 'Campaign briefs, channel copy and draft previews' },
  { name: 'Media Library', url: '/media', icon: Images, description: 'Reusable artwork, images, assets and optimization' },
];
export function CmsHomePage() {
  return <div className="h-full overflow-auto bg-background" data-studio-product="cms-home">
    <div className="mx-auto max-w-7xl p-6 lg:p-9">
      <header className="mb-8"><div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-muted-foreground"><PanelsTopLeft size={15}/> Site & Creative Studio</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">Create, edit, and launch.</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Real authoring tools from the AgentSam SDK. Your site drafts and campaigns remain local until an authorized publishing adapter is connected.</p></header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{destinations.map((d) => <button key={d.url} onClick={() => go(d.url)} className="group min-h-[150px] rounded-2xl border border-border bg-card p-5 text-left transition hover:border-foreground/30 hover:shadow-sm"><div className="flex items-center justify-between"><d.icon size={20}/><ArrowUpRight className="text-muted-foreground group-hover:text-foreground" size={15}/></div><h2 className="mt-4 font-semibold">{d.name}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{d.description}</p></button>)}</div>
      <div className="mt-8 border-t border-border pt-2"><SitesWorkspace /></div>
    </div>
  </div>;
}
