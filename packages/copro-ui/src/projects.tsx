import { IconAction } from "./icon-action.js";
import type { CoProCreativeAsset } from "./creative-types.js";
import { CoProSystemIcon, type CoProSystemIconMap } from "./system-icon.js";
import { normalizeOnboardingUrl } from "./onboarding-url.js";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Captions, ChevronDown, ChevronLeft, ChevronRight, Clapperboard,
  Film, Box, Sparkles, FolderOpen, Grid2X2, Home, Import, LayoutList,
  MoreHorizontal, Plus, Search, Scissors, ScreenShare, Type,
  Palette, Image as ImageIcon, UserRound, ArrowUpRight, MonitorPlay, Play,
} from "lucide-react";

export type CoProProjectSummary = {
  id: string;
  title: string;
  subtitle?: string;
  kind: "video" | "image" | "audio" | "template" | "campaign" | "workspace" | "other";
  status: "draft" | "active" | "processing" | "rendering" | "ready" | "failed" | "archived";
  progress?: number;
  durationMs?: number;
  aspectRatio?: string;
  resolution?: string;
  format?: string;
  updatedAt: string;
  starred?: boolean;
  shared?: boolean;
  thumbnailTone?: "cyan" | "violet" | "amber" | "slate";
  /** Lightweight still preview — never a live decode engine in the gallery. */
  thumbnailUrl?: string;
  thumbnailState?: "empty" | "missing";
  example?: boolean;
};

/** Presentation-only tone cycle — not a resource registry. Featured IDs come from asset.featured. */
const SHOWCASE_TONES = ["cyan", "amber", "violet"] as const;

const EMPTY_SEQUENCE_COVER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#101820"/><path d="M0 72H640M0 144H640M0 216H640M0 288H640M80 0V360M160 0V360M240 0V360M320 0V360M400 0V360M480 0V360M560 0V360" stroke="#263944" stroke-width="1"/><rect x="24" y="24" width="592" height="312" rx="16" fill="none" stroke="#35505b"/><circle cx="320" cy="154" r="43" fill="#1d3740" stroke="#56cbd0" stroke-width="2"/><path d="M309 132L344 154L309 176Z" fill="#7de2df"/><text x="320" y="238" text-anchor="middle" fill="#e8f3f5" font-family="Arial,sans-serif" font-size="21" font-weight="700" letter-spacing="4">EMPTY SEQUENCE</text><text x="320" y="267" text-anchor="middle" fill="#7f9aa4" font-family="Arial,sans-serif" font-size="11" letter-spacing="3">PRIMETECH PROJECT</text></svg>');
const MISSING_SOURCE_COVER = "data:image/svg+xml;charset=utf-8," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#19191b"/><path d="M0 72H640M0 144H640M0 216H640M0 288H640" stroke="#303235"/><rect x="24" y="24" width="592" height="312" rx="16" fill="none" stroke="#55423a"/><path d="M284 112H340L369 141V222H271V112Z" fill="#332b28" stroke="#d28a5e" stroke-width="2"/><path d="M340 112V141H369" fill="none" stroke="#d28a5e" stroke-width="2"/><path d="M320 154V185M320 197V199" stroke="#f0b18b" stroke-width="5" stroke-linecap="round"/><text x="320" y="258" text-anchor="middle" fill="#f3ddd0" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="3">SOURCE MEDIA NEEDED</text><text x="320" y="282" text-anchor="middle" fill="#ad8c7d" font-family="Arial,sans-serif" font-size="11" letter-spacing="2">PROJECT EDITS ARE PRESERVED</text></svg>');

function projectCoverArt(p: CoProProjectSummary): string {
  return p.thumbnailUrl ?? (p.thumbnailState === "missing" ? MISSING_SOURCE_COVER : EMPTY_SEQUENCE_COVER);
}

function statusLabel(status: CoProProjectSummary["status"]) {
  if (status === "ready") return "Ready";
  if (status === "rendering" || status === "processing") return "In progress";
  if (status === "failed") return "Needs attention";
  if (status === "archived") return "Archived";
  if (status === "active") return "Active";
  return "Draft";
}

type ProjectsProps = {
  projects: CoProProjectSummary[];
  onOpenProject: (id: string) => void;
  onCreate: () => void;
  onOpenStudioMode?: (mode: "scene" | "design" | "generate" | "video") => void;
  onImport: () => void;
  onRecord?: () => void;
  recording?: boolean;
  onStopRecording?: () => void;
  onOpenTool?: (tool: "text" | "captions") => void;
  onRenameProject?: (id: string, title: string) => void | Promise<void>;
  onDeleteProject?: (id: string) => void | Promise<void>;
  onDuplicateProject?: (id: string) => void;
  appIconUrl?: string;
  onboardingUrl?: string;
  systemIcons?: CoProSystemIconMap;
  initialSection?: "home" | "projects" | "templates";
  creativeAssets?: CoProCreativeAsset[];
  onOpenCreativeTemplate?: (id: string) => void;
};

const FILTERS = ["All", "Video", "Image", "Audio", "Template"] as const;

function shortDate(value: string) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString(undefined, {month:"short",day:"numeric"}) : "Draft";
}
function duration(ms?: number) {
  if (!ms) return "00:00";
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2,"0")}:${String(seconds % 60).padStart(2,"0")}`;
}

export function CoProProjectsScreen({
  projects, onOpenProject, onCreate, onOpenStudioMode, onImport, onRecord, recording = false,
  onStopRecording, onOpenTool, onRenameProject, onDeleteProject, onDuplicateProject,
  appIconUrl, onboardingUrl, systemIcons, initialSection = "home", creativeAssets = [], onOpenCreativeTemplate,
}: ProjectsProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [projectDialog,setProjectDialog]=useState<{kind:"rename"|"delete";project:CoProProjectSummary}|null>(null);
  const [dialogTitle,setDialogTitle]=useState("");
  const [dialogBusy,setDialogBusy]=useState(false);
  const [dialogError,setDialogError]=useState<string|null>(null);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [active, setActive] = useState<"home" | "projects" | "templates" | "design">(initialSection);
  const [designQuery,setDesignQuery] = useState("");
  const [designGroup,setDesignGroup] = useState("All");
  const [onboardedName,setOnboardedName] = useState<string | null>(null);
  useEffect(() => {
    if (!onboardingUrl) return;
    try {
      const saved = JSON.parse(localStorage.getItem('primetech.onboarding') || 'null');
      if (saved?.done && typeof saved.name === 'string') setOnboardedName(saved.name.trim().split(/\s+/)[0] || null);
    } catch { /* Onboarding is optional in standalone mode. */ }
  }, [onboardingUrl]);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateGroup, setTemplateGroup] = useState("All");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const projectRef = useRef<HTMLElement>(null);

  const saved = useMemo(() => projects.filter(p => !p.example), [projects]);
  const examples = useMemo(() => projects.filter(p => p.example), [projects]);
  const creativeTemplates = useMemo(() => creativeAssets.filter(asset => asset.category === "template"), [creativeAssets]);
  const featuredTemplates = useMemo(
    () => creativeTemplates.filter((asset) => asset.featured),
    [creativeTemplates],
  );
  const homeHighlights = useMemo(() => [...creativeTemplates].sort((a,b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured))).slice(0,8), [creativeTemplates]);
  const templateGroups = useMemo(() => ["All", ...Array.from(new Set(creativeTemplates.map(asset => asset.group).filter((group): group is string => Boolean(group)))).sort()], [creativeTemplates]);
  const visibleTemplates = useMemo(() => creativeTemplates.filter(asset =>
    (templateGroup === "All" || asset.group === templateGroup) &&
    (!templateQuery || `${asset.name} ${asset.description ?? ""} ${asset.group ?? ""}`.toLowerCase().includes(templateQuery.toLowerCase()))
  ), [creativeTemplates, templateGroup, templateQuery]);
  const selectedTemplate = creativeTemplates.find(asset => asset.id === selectedTemplateId) ?? null;
  const visible = useMemo(() => saved.filter(p =>
    (filter === "All" || p.kind === filter.toLowerCase()) &&
    (!query || `${p.title} ${p.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  ).sort((a,b) => sort === "name" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)), [saved,filter,query,sort]);

  const designAssets = useMemo(() => creativeTemplates.filter(asset =>
    (designGroup === "All" || asset.group === designGroup) &&
    (!designQuery.trim() || `${asset.name} ${asset.description ?? ""} ${asset.group ?? ""}`.toLowerCase().includes(designQuery.trim().toLowerCase()))
  ), [creativeTemplates,designGroup,designQuery]);
  function navigate(target: "home" | "projects" | "templates" | "design") {
    setActive(target);
    if (target !== "templates") setSelectedTemplateId(null);
    if (target === "projects") projectRef.current?.scrollIntoView({behavior:"smooth", block:"start"});
    else window.scrollTo({top:0,behavior:"smooth"});
  }
  function rename(p: CoProProjectSummary) {
    setProjectDialog({kind:"rename",project:p});setDialogTitle(p.title);setDialogError(null);setOpenMenu(null);
  }
  function remove(p: CoProProjectSummary) {
    setProjectDialog({kind:"delete",project:p});setDialogError(null);setOpenMenu(null);
  }
  async function confirmProjectDialog(event:React.FormEvent) {
    event.preventDefault();if(!projectDialog||dialogBusy)return;
    setDialogBusy(true);setDialogError(null);
    try {
      if(projectDialog.kind==="rename")await onRenameProject?.(projectDialog.project.id,dialogTitle.trim());
      else await onDeleteProject?.(projectDialog.project.id);
      setProjectDialog(null);
    } catch {setDialogError("Could not save this change. Try again.");}
    finally {setDialogBusy(false);}
  }
  return <section className="mm-home" aria-label="PrimeTech home">
    {projectDialog&&<div className="mm-project-dialog-backdrop" onKeyDown={event=>{if(event.key==="Escape"&&!dialogBusy)setProjectDialog(null);}}>
      <form role="dialog" aria-modal="true" aria-label={projectDialog.kind==="rename"?"Rename project":"Delete project"} onSubmit={confirmProjectDialog}>
        <h2>{projectDialog.kind==="rename"?"Rename project":"Delete project?"}</h2>
        {projectDialog.kind==="rename"?<label>Project name<input autoFocus value={dialogTitle} onChange={event=>setDialogTitle(event.currentTarget.value)} maxLength={200}/></label>:<p>Delete “{projectDialog.project.title}” and its unshared media? Files used by other projects will remain. This cannot be undone.</p>}
        {dialogError&&<p role="alert">{dialogError}</p>}
        <footer><button type="button" disabled={dialogBusy} onClick={()=>setProjectDialog(null)}>Cancel</button><button type="submit" disabled={dialogBusy||(projectDialog.kind==="rename"&&!dialogTitle.trim())}>{dialogBusy?"Saving…":projectDialog.kind==="rename"?"Save name":"Delete project"}</button></footer>
      </form>
    </div>}
    <aside className="mm-home-sidebar" aria-label="PrimeTech navigation">
      <div className="mm-prime-account">
        <div className="mm-prime-account-title"><span className="mm-prime-mark" aria-hidden="true">{appIconUrl?<img src={appIconUrl} alt=""/>:<Clapperboard size={21}/>}</span><div><strong>PrimeTech Account</strong><small>{onboardedName ? `Setup complete · ${onboardedName}` : "Onboarding portal"}</small></div></div>
        <div className="mm-prime-account-actions">
          <a href={onboardingUrl || "/auth/login?next=/admin/moviemode"}><UserRound size={14}/> {onboardingUrl ? (onboardedName ? "Account setup" : "Get started") : "Sign in"} <ArrowUpRight size={13}/></a>
          <a className="is-primary" href={onboardingUrl ? normalizeOnboardingUrl(onboardingUrl)+"#tour" : "/auth/signup?next=/admin/moviemode"}>{onboardingUrl ? "Explore PrimeTech" : "Join Pro"} <ArrowUpRight size={13}/></a>
        </div>
      </div>
      <span className="mm-sidebar-caption">CREATIVE STUDIO</span>
      <nav className="mm-prime-sidebar-nav" aria-label="Creative studio">
        <button type="button" className={active === "home" || active === "projects" ? "is-active" : ""} aria-current={active === "home" || active === "projects" ? "page" : undefined} onClick={() => navigate("home")}><CoProSystemIcon name="home" icons={systemIcons} size={18} fallback={<Home size={18}/>} /> Home</button>
        <button type="button" className={active === "templates" ? "is-active" : ""} aria-current={active === "templates" ? "page" : undefined} onClick={() => navigate("templates")}><CoProSystemIcon name="film" icons={systemIcons} size={18} fallback={<Clapperboard size={18}/>} /> Templates</button>
        <button type="button" className={active === "design" ? "is-active" : ""} aria-current={active === "design" ? "page" : undefined} onClick={() => onOpenStudioMode ? onOpenStudioMode("design") : navigate("design")}><Palette size={18}/> Design Studio</button>
      </nav>
      <div className="mm-prime-sidebar-spacer"/>
      <button type="button" className="mm-prime-professional" onClick={onCreate} title="Open a new project in the PrimeTech unified studio">
        <span className="mm-prime-professional-art"><img src={appIconUrl || "/brand/p-prime-electric.svg"} alt=""/><span>PrimeTech</span></span>
        <span className="mm-prime-professional-caption"><strong>PrimeTech</strong><small>Creative Studio</small></span>
      </button>
    </aside>

    <main className={"mm-home-main"+(active==="design"?" is-design":"")}>
      <header className="mm-home-header">
        <div className="mm-prime-page-heading"><span>PRIMETECH / CREATIVE STUDIO</span><strong>{active === "templates" ? "Templates" : active === "design" ? "Design Studio" : "Home"}</strong></div>
        <div className="mm-home-header-actions">{onboardingUrl&&<a className="mm-prime-onboarding-link" href={onboardingUrl}>Explore PrimeTech <ArrowUpRight size={15}/></a>}<button type="button" title="Import video, images and audio" onClick={onImport}><CoProSystemIcon name="attachment" icons={systemIcons} size={17} fallback={<Import size={17}/>} /> Import</button><button type="button" onClick={onCreate}><Plus size={17}/> Create project</button></div>
      </header>
      {active === "design" ? <section className="mm-design-page" aria-label="PrimeTech Design Studio">
        <div className="mm-design-intro">
          <span className="mm-design-kicker"><Palette size={15}/> PRIMETECH DESIGN STUDIO</span>
          <div className="mm-design-symbols" aria-hidden="true">{creativeTemplates.slice(0,3).map(asset=><span key={asset.id}>{asset.previewUrl?<img src={asset.previewUrl} alt=""/>:<ImageIcon size={24}/>}</span>)}{appIconUrl&&<img className="mm-design-brand-icon" src={appIconUrl} alt=""/>}</div>
          <h1>Imagine it. Design it.</h1>
          <p>Explore editable creative starting points, or bring your own artwork into a new project.</p>
          <form className="mm-design-search" onSubmit={event=>{event.preventDefault();document.querySelector('.mm-design-gallery')?.scrollIntoView({behavior:'smooth',block:'start'});}}>
            <label><Search size={20}/><input value={designQuery} onChange={event=>setDesignQuery(event.currentTarget.value)} placeholder="Search design styles, templates, or compositions" aria-label="Find designs"/></label>
            <button type="submit"><Search size={17}/> Find designs</button>
          </form>
          <div className="mm-design-quick-actions"><button type="button" onClick={onImport}><Import size={16}/> Import artwork</button><button type="button" onClick={onCreate}><Plus size={16}/> Blank canvas</button><button type="button" onClick={()=>navigate('templates')}><Clapperboard size={16}/> All templates</button></div>
        </div>
        <section className="mm-design-gallery" aria-label="Design inspirations">
          <div className="mm-design-gallery-heading"><div><h2>Inspiration</h2><p>Start with a real editable composition from the PrimeTech library.</p></div><span>{designAssets.length} designs</span></div>
          <div className="mm-design-categories" role="group" aria-label="Design categories">
            {templateGroups.map(group=><button key={group} type="button" aria-pressed={group===designGroup} className={group===designGroup?'is-active':''} onClick={()=>setDesignGroup(group)}>{group==='All'?'All':group.replaceAll('-', ' ')}</button>)}
          </div>
          <div className="mm-design-gallery-grid">
            {designAssets.map(asset=><button type="button" className="mm-design-gallery-card" key={asset.id} onClick={()=>{setSelectedTemplateId(asset.id);setActive('templates');}}>
              <span className="mm-design-gallery-image">{asset.previewUrl?<img src={asset.previewUrl} loading="lazy" alt=""/>:<Clapperboard size={29}/>}<span><Play size={15}/> Preview</span></span>
              <span className="mm-design-gallery-meta"><strong>{asset.name}</strong><small>{asset.group?.replaceAll('-',' ')??'Editable composition'}</small></span>
            </button>)}
          </div>
          {!designAssets.length&&<div className="mm-design-empty"><Search size={23}/><strong>No matching designs</strong><p>Try a broader search or choose All.</p><button type="button" onClick={()=>{setDesignQuery('');setDesignGroup('All');}}>Clear filters</button></div>}
        </section>
      </section> : active === "templates" ? <section className="mm-templates-page">
        {selectedTemplate ? <div className="mm-template-detail">
          <button type="button" className="mm-template-back" onClick={() => setSelectedTemplateId(null)}><ChevronDown size={16}/> Back to templates</button>
          <div className="mm-template-detail-grid">
            <div className="mm-template-detail-preview">{selectedTemplate.previewUrl ? <img src={selectedTemplate.previewUrl} alt={`${selectedTemplate.name} template preview`} /> : <span className="mm-template-thumb-fallback"><CoProSystemIcon name="film" icons={systemIcons} size={34} fallback={<Film size={34}/>} /></span>}</div>
            <div className="mm-template-detail-copy">
              <span className="mm-template-kicker">PROJECT TEMPLATE</span>
              <h1>{selectedTemplate.name}</h1>
              <p>{selectedTemplate.description ?? "Creates a new editable project with this motion graphic timeline. Your existing projects stay untouched."}</p>
              <div className="mm-template-specs"><span>{selectedTemplate.group?.replaceAll("-", " ") ?? "Template"}</span><span>{duration((selectedTemplate.durationUs ?? 0) / 1000)}</span><span>{selectedTemplate.aspectRatio ?? "16:9"}</span><span>New project</span></div>
              <button type="button" className="mm-template-use" onClick={() => onOpenCreativeTemplate?.(selectedTemplate.id)} disabled={!onOpenCreativeTemplate}>Create project from template <CoProSystemIcon name="next" icons={systemIcons} size={17} fallback={<ChevronRight size={17}/>} /></button>
            </div>
          </div>
        </div> : <>
          <div className="mm-heading"><div><span>PROJECT TEMPLATES</span><h1>Templates</h1><p>Choose a template to create a distinct project. Effects, transitions and overlays stay in the editor clip tools — they are not project templates.</p></div><span className="mm-template-count">{creativeTemplates.length} templates</span></div>
          {featuredTemplates.length > 0 && <section className="mm-showcase" aria-label="Featured project templates">
            <div className="mm-showcase-heading">
              <div><span>QUICK START</span><h2>Featured templates</h2><p>Each card creates a new project from the packaged creative catalog.</p></div>
            </div>
            <div className="mm-showcase-grid">
              {featuredTemplates.map((asset, index) => {
                const tone = SHOWCASE_TONES[index % SHOWCASE_TONES.length];
                return <button type="button" key={asset.id} className={`mm-showcase-card tone-${tone}`} onClick={() => setSelectedTemplateId(asset.id)}>
                  <span className="mm-showcase-preview">
                    {asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <span className="mm-template-thumb-fallback"><CoProSystemIcon name="film" icons={systemIcons} size={28} fallback={<Film size={28}/>} /></span>}
                    <span className="mm-showcase-badge">PrimeTech · {asset.group?.replaceAll("-", " ") ?? "Project template"}</span>
                  </span>
                  <span className="mm-showcase-copy">
                    <strong>{asset.name}</strong>
                    <small>{asset.description ?? "Creates a distinct editable project."}</small>
                    <span className="mm-showcase-cta">Open template <ChevronRight size={14}/></span>
                  </span>
                </button>;
              })}
            </div>
          </section>}
          <div className="mm-template-toolbar">
            <label className="mm-template-search"><CoProSystemIcon name="search" icons={systemIcons} size={17} fallback={<Search size={17}/>} /><input value={templateQuery} onChange={event => setTemplateQuery(event.currentTarget.value)} placeholder="Search templates" aria-label="Search templates"/></label>
            <span>{visibleTemplates.length} results</span>
          </div>
          <div className="mm-template-categories" role="tablist" aria-label="Template categories">
            {templateGroups.map(group => <button type="button" key={group} role="tab" aria-selected={templateGroup === group} className={templateGroup === group ? "is-active" : ""} onClick={() => setTemplateGroup(group)}>{group === "All" ? "All templates" : group.replaceAll("-", " ")}</button>)}
          </div>
          <div className="mm-template-grid">
            {visibleTemplates.map(asset => <button type="button" key={asset.id} className="mm-template-card" onClick={() => setSelectedTemplateId(asset.id)}>
              <span className="mm-template-card-preview">{asset.previewUrl ? <img src={asset.previewUrl} alt="" loading="lazy"/> : <span className="mm-template-thumb-fallback"><CoProSystemIcon name="film" icons={systemIcons} size={24} fallback={<Film size={24}/>} /></span>}<span className="mm-template-duration">{duration((asset.durationUs ?? 0) / 1000)}</span><span className="mm-template-preview-cta"><CoProSystemIcon name="film" icons={systemIcons} size={14} fallback={<Film size={14}/>} /> Preview</span></span>
              <span className="mm-template-card-copy"><span><strong>{asset.name}</strong><small>{asset.group?.replaceAll("-", " ") ?? "Template"} · {asset.aspectRatio ?? "16:9"}</small></span><CoProSystemIcon name="next" icons={systemIcons} size={17} fallback={<ChevronRight size={17}/>} /></span>
            </button>)}
            <button type="button" className="mm-template-card mm-template-blank" onClick={onCreate}>
              <span className="mm-template-blank-art"><CoProSystemIcon name="add" icons={systemIcons} size={34} fallback={<Plus size={34}/>} /><span>Blank project</span></span>
              <span className="mm-template-card-copy"><span><strong>Blank project</strong><small>Empty timeline — import your own media</small></span><CoProSystemIcon name="next" icons={systemIcons} size={17} fallback={<ChevronRight size={17}/>} /></span>
            </button>
          </div>
          {!visibleTemplates.length && <div className="mm-template-empty"><CoProSystemIcon name="search" icons={systemIcons} size={22} fallback={<Search size={22}/>} /><strong>No templates found</strong><span>Try another search or category.</span></div>}
          {examples.length > 0 && <section className="mm-template-examples" aria-label="Sample timelines">
            <div className="mm-heading">
              <div><span>SAMPLES</span><h2>Sample timelines</h2><p>Inspect track structure. Each opens as a separate editable copy — not a packaged project template.</p></div>
              <span className="mm-template-count">{examples.length} samples</span>
            </div>
            <div className="mm-template-grid">
              {examples.map(example => <button type="button" key={example.id} className="mm-template-card mm-template-example" onClick={() => onOpenProject(example.id)}>
                <span className="mm-template-card-preview">
                  <span className="mm-template-example-art"><CoProSystemIcon name="film" icons={systemIcons} size={32} fallback={<Film size={32}/>} /></span>
                  <span className="mm-template-duration">SAMPLE</span>
                  <span className="mm-template-preview-cta">Open sample copy <CoProSystemIcon name="next" icons={systemIcons} size={14} fallback={<ChevronRight size={14}/>} /></span>
                </span>
                <span className="mm-template-card-copy"><span><strong>{example.title}</strong><small>{example.subtitle ?? "Sample timeline with editable tracks"}</small></span><CoProSystemIcon name="next" icons={systemIcons} size={17} fallback={<ChevronRight size={17}/>} /></span>
              </button>)}
            </div>
          </section>}
        </>}
      </section> : <>
        {active === "home" && <section className="mm-prime-home-start" aria-label="Start creating">
          <div className="mm-prime-entry-row">
            <button type="button" className="mm-prime-create-hero" onClick={onCreate}><span className="mm-prime-hero-icon"><Plus size={22}/></span><span><strong>Create project</strong><small>One creative workspace for 3D, design, generation and video</small></span><ArrowUpRight size={22}/></button>
            {onboardingUrl&&<a className="mm-prime-tour-entry" href={normalizeOnboardingUrl(onboardingUrl)+"#tour"}
              aria-label="Explore the full PrimeTech immersive 3D tour">
              <span className="mm-prime-tour-symbol"><img src={appIconUrl||"/brand/p-prime-electric.svg"} alt=""/></span>
              <span className="mm-prime-tour-copy"><small>PRIMETECH / CREATIVE ENGINEERING</small><strong>Explore PrimeTech</strong><span>Experience the original immersive 3D tour</span></span>
              <ArrowUpRight size={19} aria-hidden="true"/>
            </a>}
          </div>
          <div className="mm-prime-home-actions" aria-label="Start in a PrimeTech studio mode">
            <button type="button" onClick={()=>onOpenStudioMode ? onOpenStudioMode('video') : onCreate()}><span className="mm-prime-action-icon"><MonitorPlay size={25}/></span><span><strong>Video</strong><small>Edit footage, sound, effects and timeline</small></span><ArrowUpRight size={17}/></button>
            <button type="button" onClick={()=>onOpenStudioMode ? onOpenStudioMode('scene') : onCreate()}><span className="mm-prime-action-icon"><Box size={24}/></span><span><strong>3D Scene</strong><small>Work with linked models, beats and scene lighting</small></span><ArrowUpRight size={17}/></button>
            <button type="button" onClick={()=>onOpenStudioMode ? onOpenStudioMode('design') : navigate('design')}><span className="mm-prime-action-icon"><Palette size={24}/></span><span><strong>Design</strong><small>Create titles, graphics and compositions</small></span><ArrowUpRight size={17}/></button>
            <button type="button" onClick={()=>onOpenStudioMode ? onOpenStudioMode('generate') : navigate('templates')}><span className="mm-prime-action-icon"><Sparkles size={24}/></span><span><strong>Generate</strong><small>Browse models and editable creative sources</small></span><ArrowUpRight size={17}/></button>
          </div>
          <div className="mm-prime-tools"><h2>More tools</h2><div>
            <button type="button" onClick={recording ? onStopRecording : onRecord} disabled={!recording&&!onRecord}><ScreenShare size={20}/> {recording?'Stop recording':'Record screen'}</button>
            <button type="button" onClick={()=>onOpenTool?.('text')} disabled={!onOpenTool}><Type size={20}/> Titles</button>
            <button type="button" onClick={()=>onOpenTool?.('captions')} disabled={!onOpenTool}><Captions size={20}/> Captions</button>
            <button type="button" onClick={()=>navigate('templates')}><Clapperboard size={20}/> Templates</button>
            <button type="button" onClick={onImport}><Import size={20}/> Import media</button>
          </div></div>
        </section>}
        <section className="mm-projects-section" ref={projectRef} aria-label="Projects">
          <div className="mm-heading mm-projects-heading"><div><h2>Your projects</h2><p>{saved.length ? `${saved.length} saved · continue where you left off` : "Create a project or import media to begin."}</p></div>
            <div className="mm-projects-heading-actions">
              <button type="button" className="mm-projects-secondary" onClick={onImport}><CoProSystemIcon name="attachment" icons={systemIcons} size={16} fallback={<Import size={16}/>} /> Import</button>
              <button type="button" className="mm-projects-secondary" onClick={() => navigate("templates")}><CoProSystemIcon name="film" icons={systemIcons} size={16} fallback={<Clapperboard size={16}/>} /> Templates</button>
              <button className="mm-projects-add" onClick={onCreate}><CoProSystemIcon name="add" icons={systemIcons} size={16} fallback={<Plus size={16}/>} /> Create project</button>
            </div>
          </div>
          <div className="mm-project-toolbar">
            <label className="mm-search"><CoProSystemIcon name="search" icons={systemIcons} size={17} fallback={<Search size={17}/>} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects"/></label>
            <div className="mm-filter-group" role="group" aria-label="Filter projects">{FILTERS.map(f => <button key={f} className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
            <label className="mm-sort" title="Sort projects"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value as "recent" | "name")} aria-label="Project sort"><option value="recent">Recently edited</option><option value="name">Name</option></select><ChevronDown size={14}/></label>
            <div className="mm-view-switch" role="group" aria-label="Project layout"><IconAction aria-label="Grid layout" aria-pressed={view === "grid"} onClick={() => setView("grid")} title="Grid view"><Grid2X2 size={17}/></IconAction><IconAction aria-label="List layout" aria-pressed={view === "list"} onClick={() => setView("list")} title="List view"><LayoutList size={17}/></IconAction></div>
          </div>
          {visible.length ? <div className={`mm-project-grid is-${view}`}>
            {visible.map(p => <article className={`mm-project-tile mm-resource-card tone-${p.thumbnailTone ?? "slate"}`} key={p.id}>
              <IconAction className="mm-project-open" onClick={() => onOpenProject(p.id)} aria-label={`Open ${p.title}`}>
                <span className={`mm-project-cover tone-${p.thumbnailTone ?? "slate"}`}>
                  <img className="mm-project-cover-art" src={projectCoverArt(p)} alt="" loading="lazy" />
                  <span className="mm-resource-type">{p.kind}</span>
                  <span className="mm-resource-duration">{duration(p.durationMs)}</span>
                  <span className="mm-resource-open-cta"><Film size={14}/> Open edit</span>
                </span>
                <span className="mm-project-details mm-resource-meta">
                  <strong>{p.title}</strong>
                  <span className="mm-resource-identity">PrimeTech · {statusLabel(p.status)}</span>
                  <span>{shortDate(p.updatedAt)} · {duration(p.durationMs)} · {p.aspectRatio ?? "Project"}{p.resolution ? " · "+p.resolution : ""}{p.format ? " · "+p.format : ""}</span>
                  <small>{p.subtitle ?? "Saved project"}</small>
                </span>
              </IconAction>
              <div className="mm-resource-actions">
                <IconAction className="mm-resource-edit" aria-label={`Edit ${p.title}`} onClick={() => onOpenProject(p.id)} title="Open in editor"><Scissors size={15}/></IconAction>
                <IconAction className="mm-project-more" aria-label={`Project actions for ${p.title}`} aria-expanded={openMenu === p.id} onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}><MoreHorizontal size={18}/></IconAction>
              </div>
              {openMenu === p.id && <div className="mm-project-menu" role="group" aria-label={`Actions for ${p.title}`}><button onClick={() => {setOpenMenu(null);onOpenProject(p.id);}}>Open</button><button onClick={() => rename(p)}>Rename</button><button disabled={!onDuplicateProject} onClick={() => {onDuplicateProject?.(p.id);setOpenMenu(null);}}>Duplicate</button><button disabled={!onDeleteProject} onClick={() => remove(p)}>Delete</button><button onClick={() => setOpenMenu(null)}>Cancel</button></div>}
            </article>)}
          </div> : <div className="mm-project-empty"><CoProSystemIcon name="document" icons={systemIcons} size={29} fallback={<FolderOpen size={29}/>} /><strong>{query || filter !== "All" ? "No projects match" : "Your projects will appear here"}</strong><p>{query || filter !== "All" ? "Try a different search or filter." : "Create a timeline or import a real recording to start."}</p><button onClick={onCreate}>Create project <CoProSystemIcon name="next" icons={systemIcons} size={17} fallback={<ChevronRight size={17}/>} /></button></div>}
        </section>
        {active==='home' && homeHighlights.length>0 && <section className="mm-prime-home-highlights" aria-label="Featured editable templates">
          <div className="mm-prime-highlights-heading"><div><h2>Explore templates</h2><p>Real editable starting points from the PrimeTech creative catalog.</p></div><button type="button" onClick={()=>navigate('templates')}>View all <ChevronRight size={16}/></button></div>
          <div className="mm-prime-highlights-grid">
            {homeHighlights.map(asset=><button type="button" className="mm-prime-highlight-card" key={asset.id} onClick={()=>{setSelectedTemplateId(asset.id);navigate('templates');}}>
              <span className="mm-prime-highlight-cover">{asset.previewUrl?<img src={asset.previewUrl} alt="" loading="lazy"/>:<Clapperboard size={27}/>}</span>
              <span><strong>{asset.name}</strong><small>{asset.group?.replaceAll('-',' ')??'Editable template'}</small></span>
            </button>)}
          </div>
        </section>}
      </>}
      <footer className="mm-home-bottom"><span>PrimeTech · Creative Studio</span><span>Local creative workspace</span></footer>
    </main>
    <nav className="mm-home-mobile-nav" aria-label="Mobile navigation"><button aria-current={active==='home'?'page':undefined} aria-label="Home" onClick={() => navigate("home")}><Home size={20}/>Home</button><button aria-current={active==='templates'?'page':undefined} onClick={() => navigate("templates")}><Clapperboard size={20}/>Templates</button><button className="is-create" onClick={onCreate}><Plus size={22}/>Create</button><button aria-current={active==='design'?'page':undefined} onClick={() => onOpenStudioMode ? onOpenStudioMode("design") : navigate("design")}><Palette size={20}/>Design</button></nav>
  </section>;
}
