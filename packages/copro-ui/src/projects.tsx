import { IconAction } from "./icon-action.js";
import React, { useMemo, useRef, useState } from "react";
import {
  AudioLines, Captions, ChevronDown, ChevronRight, Clapperboard, Clock3,
  FileVideo2, Film, FolderOpen, Grid2X2, Home, Import, LayoutList,
  MoreHorizontal, Plus, Search, Scissors, ScreenShare, Sparkles, Type,
  Video, WandSparkles, X,
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
  example?: boolean;
};

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
  initialSection?: "home" | "projects" | "templates";
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
  appIconUrl, initialSection = "home",
}: ProjectsProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [sort, setSort] = useState<"recent" | "name">("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [active, setActive] = useState<"home" | "projects" | "templates">(initialSection);
  const [iconFailed, setIconFailed] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLElement>(null);

  const saved = useMemo(() => projects.filter(p => !p.example), [projects]);
  const examples = useMemo(() => projects.filter(p => p.example), [projects]);
  const visible = useMemo(() => saved.filter(p =>
    (filter === "All" || p.kind === filter.toLowerCase()) &&
    (!query || `${p.title} ${p.subtitle ?? ""}`.toLowerCase().includes(query.toLowerCase()))
  ).sort((a,b) => sort === "name" ? a.title.localeCompare(b.title) : b.updatedAt.localeCompare(a.updatedAt)), [saved,filter,query,sort]);

  function navigate(target: "home" | "projects" | "templates") {
    setActive(target);
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
        {appIconUrl && !iconFailed ? <img src={appIconUrl} width="34" height="34" alt="" onError={() => setIconFailed(true)}/> : <Clapperboard size={28}/>}
        <div><strong>MovieMode</strong><span>Production Studio</span></div>
      </div>
      <button className="mm-sidebar-create" onClick={onCreate} title="Create an editable project and open the timeline"><Plus size={18}/> Create project</button>
      <span className="mm-sidebar-caption">WORKSPACE</span>
      <button className={active === "home" ? "is-active" : ""} onClick={() => navigate("home")}><Home size={18}/> Home</button>
      <button className={active === "projects" ? "is-active" : ""} onClick={() => navigate("projects")}><FolderOpen size={18}/> Projects <span className="mm-nav-count">{saved.length}</span></button>
      <button className={active === "templates" ? "is-active" : ""} onClick={() => navigate("templates")}><Clapperboard size={18}/> Templates</button>
      <span className="mm-sidebar-caption">CREATE</span>
      <button onClick={onImport}><Import size={18}/> Import media</button>
      <button onClick={recording ? onStopRecording : onRecord} disabled={!recording && !onRecord} title={recording ? "Stop and import the screen recording" : "Capture your screen and import the recording"}><ScreenShare size={18}/> {recording ? "Stop recording" : "Record screen"}</button>
      <button onClick={() => onOpenTool?.("text")} disabled={!onOpenTool}><Type size={18}/> Title studio</button>
      <button onClick={() => onOpenTool?.("captions")} disabled={!onOpenTool}><Captions size={18}/> Captions</button>
      <div className="mm-sidebar-footer"><span className="mm-connection-dot"/> Browser-local editing <small>CoPro / EditPilot assistance in editor</small></div>
    </aside>

    <main className="mm-home-main">
      <header className="mm-home-header">
        <div><span>CREATIVE WORKSPACE</span><strong>MovieMode</strong></div>
        <div className="mm-home-header-actions"><button title="Import video, images and audio" onClick={onImport}><Import size={17}/> Import</button><button onClick={onCreate}><Plus size={17}/> New project</button></div>
      </header>
      {active === "templates" ? <section className="mm-templates-page">
        <div className="mm-heading"><div><span>CREATIVE STARTERS</span><h1>Editable timelines</h1><p>Begin with a composition structure; bring your own footage.</p></div></div>
        <div className="mm-template-list">
          {examples.map(p => <button key={p.id} onClick={() => onOpenProject(p.id)}><span className="mm-template-cover"><Film size={34}/></span><strong>{p.title}</strong><small>{p.subtitle ?? "Template with editable timeline clips"}</small><span>Open editor <ChevronRight size={15}/></span></button>)}
          <button onClick={onCreate}><span className="mm-template-cover"><Plus size={34}/></span><strong>Blank composition</strong><small>Start a new editable project</small><span>Open editor <ChevronRight size={15}/></span></button>
        </div>
      </section> : <>
        <section className="mm-home-quickstart" aria-label="Start creating">
          <button className="mm-create-banner" onClick={onCreate}><span><Plus size={23}/></span><strong>Create project</strong><small>Open the full timeline editor</small><ChevronRight size={21}/></button>
          <div className="mm-home-quick-grid">
            <IconAction aria-label="Open Video Studio to import media" onClick={onImport} className="mm-start-card"><span className="mm-start-icon"><Film size={28}/></span><span><strong>Video Studio</strong><small>Import video, photographs, audio or screen captures</small></span><ChevronRight size={20}/></IconAction>
            <IconAction aria-label={recording ? "Stop screen recording" : "Record screen"} onClick={recording ? onStopRecording : onRecord} disabled={!recording && !onRecord} className="mm-start-card"><span className="mm-start-icon"><ScreenShare size={28}/></span><span><strong>{recording ? "Finish recording" : "Record screen"}</strong><small>{recording ? "Stop capture to add video" : "Capture walkthroughs and bug reports"}</small></span><ChevronRight size={20}/></IconAction>
            <IconAction aria-label="Open Template Studio" onClick={() => navigate("templates")} className="mm-start-card mm-start-template"><span className="mm-start-icon"><Clapperboard size={28}/></span><span><strong>Template Studio</strong><small>Start from an editable composition</small></span><ChevronRight size={20}/></IconAction>
          </div>
        </section>
        <section className="mm-tools-strip" aria-label="Editing tools">
          <div className="mm-heading"><div><h2>More tools</h2><p>Open a real editing workspace for every creation.</p></div></div>
          <div className="mm-tools-grid">
            <button onClick={onImport}><Film size={21}/><strong>Import media</strong></button>
            <button onClick={() => onOpenTool?.("text")}><Type size={21}/><strong>Text & titles</strong></button>
            <button onClick={() => onOpenTool?.("captions")}><Captions size={21}/><strong>Captions</strong></button>
            <button onClick={recording ? onStopRecording : onRecord}><ScreenShare size={21}/><strong>Screen capture</strong></button>
            <button onClick={onCreate}><Scissors size={21}/><strong>Timeline</strong></button>
            <button onClick={() => navigate("templates")}><WandSparkles size={21}/><strong>Templates</strong></button>
          </div>
        </section>
        <section className="mm-projects-section" ref={projectRef} aria-label="Projects">
          <div className="mm-heading mm-projects-heading"><div><h2>Your projects</h2><p>Continue an edit, browse your recordings, or begin a new project.</p></div><button className="mm-projects-add" onClick={onCreate}><Plus size={16}/> New project</button></div>
          <div className="mm-project-toolbar">
            <label className="mm-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search projects" aria-label="Search projects"/></label>
            <div className="mm-filter-group" role="group" aria-label="Filter projects">{FILTERS.map(f => <button key={f} className={filter === f ? "is-active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
            <label className="mm-sort" title="Sort projects"><span>Sort</span><select value={sort} onChange={e => setSort(e.target.value as "recent" | "name")} aria-label="Project sort"><option value="recent">Recently edited</option><option value="name">Name</option></select><ChevronDown size={14}/></label>
            <div className="mm-view-switch" role="group" aria-label="Project layout"><IconAction aria-label="Grid layout" aria-pressed={view === "grid"} onClick={() => setView("grid")} title="Grid view"><Grid2X2 size={17}/></IconAction><IconAction aria-label="List layout" aria-pressed={view === "list"} onClick={() => setView("list")} title="List view"><LayoutList size={17}/></IconAction></div>
          </div>
          {visible.length ? <div className={`mm-project-grid is-${view}`}>
            {visible.map(p => <article className="mm-project-tile" key={p.id}>
              <IconAction className="mm-project-open" onClick={() => onOpenProject(p.id)} aria-label={`Open ${p.title}`}>
                <span className={`mm-project-cover tone-${p.thumbnailTone ?? "slate"}`}><FileVideo2 size={32}/><span>{p.kind}</span></span>
                <span className="mm-project-details"><strong>{p.title}</strong><span>{shortDate(p.updatedAt)} · {duration(p.durationMs)} · {p.aspectRatio ?? "Project"}</span><small>{p.subtitle ?? "Saved project"}</small></span>
              </IconAction>
              <IconAction className="mm-project-more" aria-label={`Project actions for ${p.title}`} aria-expanded={openMenu === p.id} onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}><MoreHorizontal size={18}/></IconAction>
              {openMenu === p.id && <div className="mm-project-menu" role="group" aria-label={`Actions for ${p.title}`}><button onClick={() => {setOpenMenu(null);onOpenProject(p.id);}}>Open</button><button onClick={() => rename(p)}>Rename</button><button disabled={!onDuplicateProject} onClick={() => {onDuplicateProject?.(p.id);setOpenMenu(null);}}>Duplicate</button><button disabled={!onDeleteProject} onClick={() => remove(p)}>Delete</button><button onClick={() => setOpenMenu(null)}>Cancel</button></div>}
            </article>)}
          </div> : <div className="mm-project-empty"><FolderOpen size={29}/><strong>{query || filter !== "All" ? "No projects match" : "Your projects will appear here"}</strong><p>{query || filter !== "All" ? "Try a different search or filter." : "Create a timeline or import a real recording to start."}</p><button onClick={onCreate}>Create project <ChevronRight size={17}/></button></div>}
        </section>
      </>}
      <footer className="mm-home-bottom"><span>MovieMode — visual creation and editing</span><span>CoPro / EditPilot · contextual collaboration inside the editor</span></footer>
    </main>
    <nav className="mm-home-mobile-nav" aria-label="Mobile navigation"><button aria-label="Home" onClick={() => navigate("home")}><Home size={20}/>Home</button><button onClick={() => navigate("projects")}><FolderOpen size={20}/>Projects</button><button className="is-create" onClick={onCreate}><Plus size={23}/>Create</button><button onClick={onImport}><Import size={20}/>Import</button></nav>
  </section>;
}
