import { IconAction } from "./icon-action.js";
import type { CoProCreativeAsset } from "./creative-types.js";
import { CoProSystemIcon, type CoProSystemIconMap } from "./system-icon.js";
import React, { useMemo, useRef, useState } from "react";
import {
  Captions, ChevronDown, ChevronLeft, ChevronRight, Clapperboard,
  Film, FolderOpen, Grid2X2, Home, Import, LayoutList,
  MoreHorizontal, Plus, Search, Scissors, ScreenShare, Type,
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
  updatedAt: string;
  starred?: boolean;
  shared?: boolean;
  thumbnailTone?: "cyan" | "violet" | "amber" | "slate";
  /** Lightweight still preview — never a live decode engine in the gallery. */
  thumbnailUrl?: string;
  example?: boolean;
};

/** Presentation-only tone cycle — not a resource registry. Featured IDs come from asset.featured. */
const SHOWCASE_TONES = ["cyan", "amber", "violet"] as const;

function projectCoverArt(p: CoProProjectSummary): string {
  if (p.thumbnailUrl) return p.thumbnailUrl;
  const tones: Record<string, [string, string, string]> = {
    cyan: ["#0d1c22", "#1a4d55", "#48d0c6"],
    violet: ["#16121f", "#3a2a5c", "#b59cff"],
    amber: ["#1c160d", "#5a3d14", "#f0b45a"],
    slate: ["#121518", "#2a3138", "#8aa0ad"],
  };
  const [bg, mid, accent] = tones[p.thumbnailTone ?? "slate"] ?? tones.slate;
  const label = (p.kind || "video").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient></defs><rect width="640" height="360" fill="url(#g)"/><rect x="0" y="0" width="640" height="28" fill="#00000055"/><rect x="0" y="332" width="640" height="28" fill="#00000055"/><circle cx="520" cy="88" r="54" fill="${accent}" opacity=".28"/><path d="M70 250 L190 120 L310 210 L420 96 L570 180 V300 H70 Z" fill="${accent}" opacity=".18"/><text x="36" y="198" fill="${accent}" font-family="ui-sans-serif,system-ui,sans-serif" font-size="18" font-weight="700" letter-spacing="4">${label}</text><text x="36" y="236" fill="#e8f2f6" font-family="ui-sans-serif,system-ui,sans-serif" font-size="28" font-weight="750">${escapeSvg(p.title.slice(0, 28))}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeSvg(value: string) {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));
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
  onImport: () => void;
  onRecord?: () => void;
  recording?: boolean;
  onStopRecording?: () => void;
  onOpenTool?: (tool: "text" | "captions") => void;
  onRenameProject?: (id: string, title: string) => void;
  onDeleteProject?: (id: string) => void;
  onDuplicateProject?: (id: string) => void;
  appIconUrl?: string;
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
  projects, onOpenProject, onCreate, onImport, onRecord, recording = false,
  onStopRecording, onOpenTool, onRenameProject, onDeleteProject, onDuplicateProject,
  appIconUrl, systemIcons, initialSection = "home", creativeAssets = [], onOpenCreativeTemplate,
}: ProjectsProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [active, setActive] = useState<"home" | "projects" | "templates">(initialSection);
  const [iconFailed, setIconFailed] = useState(false);
  const [templateQuery, setTemplateQuery] = useState("");
  const [templateGroup, setTemplateGroup] = useState("All");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLElement>(null);

  const saved = useMemo(() => projects.filter(p => !p.example), [projects]);
  const examples = useMemo(() => projects.filter(p => p.example), [projects]);
  const creativeTemplates = useMemo(() => creativeAssets.filter(asset => asset.category === "template"), [creativeAssets]);
  const featuredTemplates = useMemo(
    () => creativeTemplates.filter((asset) => asset.featured),
    [creativeTemplates],
  );
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

  function navigate(target: "home" | "projects" | "templates") {
    setActive(target);
    if (target !== "templates") setSelectedTemplateId(null);
    if (target === "projects") projectRef.current?.scrollIntoView({behavior:"smooth", block:"start"});
    else window.scrollTo({top:0,behavior:"smooth"});
  }
  function rename(p: CoProProjectSummary) {
    const title = window.prompt("Rename project",p.title)?.trim();
    if (title && title !== p.title) onRenameProject?.(p.id,title);
    setOpenMenu(null);
  }
  function remove(p: CoProProjectSummary) {
    if (window.confirm(`Delete “${p.title}”? This removes the saved project; imported original files remain available.`)) onDeleteProject?.(p.id);
    setOpenMenu(null);
  }
  return <section className="mm-home" aria-label="MovieMode home">
    <aside className="mm-home-sidebar" aria-label="MovieMode navigation">
      <div className="mm-brand">
        {appIconUrl && !iconFailed ? <img src={appIconUrl} width="34" height="34" alt="" onError={() => setIconFailed(true)}/> : <CoProSystemIcon name="film" icons={systemIcons} size={28} fallback={<Clapperboard size={28}/>} />}
        <div><strong>MovieMode</strong><span>Production Studio</span></div>
      </div>
      <button className="mm-sidebar-create" onClick={onCreate} title="Create an editable project and open the timeline"><CoProSystemIcon name="add" icons={systemIcons} size={18} fallback={<Plus size={18}/>} /> Create project</button>
      <span className="mm-sidebar-caption">WORKSPACE</span>
      <button className={active === "home" ? "is-active" : ""} onClick={() => navigate("home")}><CoProSystemIcon name="home" icons={systemIcons} size={18} fallback={<Home size={18}/>} /> Home</button>
      <button className={active === "projects" ? "is-active" : ""} onClick={() => navigate("projects")}><CoProSystemIcon name="document" icons={systemIcons} size={18} fallback={<FolderOpen size={18}/>} /> Projects <span className="mm-nav-count">{saved.length}</span></button>
      <button className={active === "templates" ? "is-active" : ""} onClick={() => navigate("templates")}><CoProSystemIcon name="film" icons={systemIcons} size={18} fallback={<Clapperboard size={18}/>} /> Templates</button>
      <span className="mm-sidebar-caption">CREATE</span>
      <button onClick={onImport}><CoProSystemIcon name="attachment" icons={systemIcons} size={18} fallback={<Import size={18}/>} /> Import media</button>
      <button onClick={recording ? onStopRecording : onRecord} disabled={!recording && !onRecord} title={recording ? "Stop and import the screen recording" : "Capture your screen and import the recording"}><CoProSystemIcon name="display" icons={systemIcons} size={18} fallback={<ScreenShare size={18}/>} /> {recording ? "Stop recording" : "Record screen"}</button>
      <button onClick={() => onOpenTool?.("text")} disabled={!onOpenTool}><CoProSystemIcon name="document" icons={systemIcons} size={18} fallback={<Type size={18}/>} /> Title studio</button>
      <button onClick={() => onOpenTool?.("captions")} disabled={!onOpenTool}><CoProSystemIcon name="message" icons={systemIcons} size={18} fallback={<Captions size={18}/>} /> Captions</button>
      <div className="mm-sidebar-footer"><span className="mm-connection-dot"/> MovieMode <small>Projects save in this browser · media originals stay local unless a host media library is connected</small></div>
    </aside>

    <main className="mm-home-main">
      <header className="mm-home-header">
        <div>{active === "templates" && <button type="button" className="mm-home-back" onClick={() => navigate("home")}><CoProSystemIcon name="back" icons={systemIcons} size={15} fallback={<ChevronLeft size={15}/>} /> Home</button>}<span>CREATIVE WORKSPACE</span><strong>MovieMode</strong></div>
        <div className="mm-home-header-actions"><button title="Import video, images and audio" onClick={onImport}><CoProSystemIcon name="attachment" icons={systemIcons} size={17} fallback={<Import size={17}/>} /> Import</button><button onClick={onCreate}><Plus size={17}/> New project</button></div>
      </header>
      {active === "templates" ? <section className="mm-templates-page">
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
                    <span className="mm-showcase-badge">MovieMode · {asset.group?.replaceAll("-", " ") ?? "Project template"}</span>
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
                  <span className="mm-resource-identity">MovieMode · {statusLabel(p.status)}</span>
                  <span>{shortDate(p.updatedAt)} · {duration(p.durationMs)} · {p.aspectRatio ?? "Project"}</span>
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
      </>}
      <footer className="mm-home-bottom"><span>MovieMode — visual creation and editing</span><span>Apps · independent from Media Library</span></footer>
    </main>
    <nav className="mm-home-mobile-nav" aria-label="Mobile navigation"><button aria-label="Home" onClick={() => navigate("home")}><CoProSystemIcon name="home" icons={systemIcons} size={20} fallback={<Home size={20}/>} />Home</button><button onClick={() => navigate("projects")}><CoProSystemIcon name="document" icons={systemIcons} size={20} fallback={<FolderOpen size={20}/>} />Projects</button><button className="is-create" onClick={onCreate}><CoProSystemIcon name="add" icons={systemIcons} size={23} fallback={<Plus size={23}/>} />Create</button><button onClick={onImport}><CoProSystemIcon name="attachment" icons={systemIcons} size={20} fallback={<Import size={20}/>} />Import</button></nav>
  </section>;
}
