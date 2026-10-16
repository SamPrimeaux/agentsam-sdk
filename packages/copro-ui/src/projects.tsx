import React, { useMemo, useRef, useState } from "react";
import {
  ArrowRight, AudioLines, Captions, Check, ChevronRight, Clapperboard,
  Clock3, Film, FolderOpen, Home, Image as ImageIcon, Import, Layers3,
  MoreHorizontal, Plus, Search, Scissors, Sparkles, Subtitles, Type, WandSparkles,
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
  /** Bundled timeline demonstration; no source footage or real export receipt is implied. */
  example?: boolean;
};

type ProjectsProps = {
  projects: CoProProjectSummary[];
  onOpenProject: (id: string) => void;
  onCreate: () => void;
  onImport: () => void;
  onOpenTool?: (tool: "text" | "captions") => void;
  onRenameProject?: (id: string, title: string) => void;
  appIconUrl?: string;
};

const FILTERS = ["All", "Video", "Image", "Audio", "Template"] as const;

export function CoProProjectsScreen({
  projects, onOpenProject, onCreate, onImport, onOpenTool, onRenameProject, appIconUrl,
}: ProjectsProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [section, setSection] = useState<"home" | "projects">("home");
  const [iconFailed, setIconFailed] = useState(false);
  const projectsRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLElement>(null);
  const saved = useMemo(() => projects.filter((project) => !project.example), [projects]);
  const examples = useMemo(() => projects.filter((project) => project.example), [projects]);

  const visible = useMemo(() => saved.filter((project) => {
    const matchesQuery = !query || (project.title + " " + (project.subtitle ?? "")).toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "All" || project.kind === filter.toLowerCase();
    return matchesQuery && matchesFilter;
  }), [saved, query, filter]);

  const navigate = (next: "home" | "projects") => {
    setSection(next);
    if (next === "home") topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    else projectsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="copro-projects" ref={topRef}>
      <aside className="copro-family-rail" aria-label="Creative production navigation">
        <button className={section === "home" ? "is-active" : ""} onClick={() => navigate("home")} aria-label="Home" title="Home"><Home size={21} strokeWidth={1.8}/></button>
        <button onClick={onCreate} aria-label="New project" title="Create"><Plus size={22} strokeWidth={1.8}/></button>
        <button className={section === "projects" ? "is-active" : ""} onClick={() => navigate("projects")} aria-label="Projects" title="Projects"><FolderOpen size={21} strokeWidth={1.8}/></button>
      </aside>
      <div className="copro-home-flow">
        <header className="copro-projects-hero">
          <div className="copro-projects-brand">
            <span className="copro-brand-mark">
              {appIconUrl && !iconFailed ? <img src={appIconUrl} width="40" height="40" loading="eager" alt="CoPro" onError={() => setIconFailed(true)}/> : <Clapperboard size={22} aria-hidden="true"/>}
            </span>
            <div><strong>CoPro</strong><span>Media Production</span></div>
            <span className="copro-brand-edition">STUDIO</span>
          </div>
          <div className="copro-projects-copy">
            <p className="copro-eyebrow">THE CREATIVE WORKSPACE</p>
            <h1>Create. Edit.<br/><em>Communicate.</em></h1>
            <p>Turn your footage, ideas and audio into a story that moves. Start with real tools—not empty demos.</p>
          </div>
          <div className="copro-hero-actions">
            <button className="copro-hero-action copro-hero-action-primary" onClick={onCreate}>
              <span className="copro-action-icon"><Plus size={25} strokeWidth={1.8}/></span>
              <span className="copro-action-copy"><strong>New project</strong><small>Open a blank editing timeline</small></span>
              <ArrowRight size={19} aria-hidden="true"/>
            </button>
            <button className="copro-hero-action" onClick={onImport}>
              <span className="copro-action-icon"><Import size={23} strokeWidth={1.8}/></span>
              <span className="copro-action-copy"><strong>Import media</strong><small>Start with files from your device</small></span>
              <ArrowRight size={19} aria-hidden="true"/>
            </button>
          </div>
        </header>

        <main className="copro-projects-content">
          <div className="copro-projects-titlebar" ref={projectsRef}>
            <div><p className="copro-eyebrow">CONTINUE CREATING</p><h2>Your projects</h2></div>
            <label className="copro-project-search">
              <Search size={19} aria-hidden="true"/>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a project" aria-label="Search projects"/>
            </label>
          </div>
          <div className="copro-filter-row" role="group" aria-label="Project filters">
            {FILTERS.map((item) => <button key={item} aria-pressed={filter === item} className={filter === item ? "is-active" : ""} onClick={() => setFilter(item)}>{item}</button>)}
          </div>

          {visible.length ? <div className="copro-project-list">
            {visible.map((project) => (
              <article className="copro-project-card" key={project.id}>
                <button className="copro-card-main" onClick={() => onOpenProject(project.id)} aria-label={"Open " + project.title}>
                  <ProjectThumb project={project}/>
                  <span className="copro-project-card-copy">
                    <strong>{project.title}</strong><span>{project.subtitle ?? humanStatus(project.status)}</span>
                    <small><Clock3 size={13}/>{formatProjectMeta(project)}</small>
                  </span>
                  <ChevronRight size={19} className="copro-card-chevron" aria-hidden="true"/>
                </button>
                {onRenameProject ? (
                  <div className="copro-project-card-tail">
                    <button aria-label={"More options for " + project.title} aria-expanded={openMenu === project.id} onClick={() => setOpenMenu(openMenu === project.id ? null : project.id)}><MoreHorizontal size={19}/></button>
                    {openMenu === project.id && <div className="copro-card-menu">
                      <button onClick={() => { setOpenMenu(null); onOpenProject(project.id); }}>Open editor</button>
                      <button onClick={() => {
                        setOpenMenu(null);
                        const title = window.prompt("Project name", project.title)?.trim();
                        if (title && title !== project.title) onRenameProject(project.id, title);
                      }}>Rename project</button>
                    </div>}
                  </div>
                ) : null}
              </article>
            ))}
          </div> : (
            <div className="copro-project-empty">
              <div className="copro-empty-art"><Clapperboard size={28}/><span/><span/></div>
              <strong>{query || filter !== "All" ? "No projects match your search" : "Your next project starts here"}</strong>
              <p>{query || filter !== "All" ? "Change the filters to see more projects." : "Your saved edits will appear here. Create a timeline or import a file to begin."}</p>
              {!(query || filter !== "All") && <button onClick={onCreate}>Create your first project <ArrowRight size={16}/></button>}
            </div>
          )}

          <section className="copro-creative-tools" aria-label="Creative tools">
            <div className="copro-section-heading">
              <div><p className="copro-eyebrow">YOUR TOOLKIT</p><h2>Make something new.</h2></div>
              <span>Built-in editing tools</span>
            </div>
            <div className="copro-tool-catalog">
              <button onClick={onImport}><span className="copro-tool-tile-icon is-primary"><Film size={25}/></span><strong>Media</strong><small>Import video &amp; images</small></button>
              <button onClick={() => onOpenTool?.("text")} disabled={!onOpenTool}><span className="copro-tool-tile-icon"><Type size={24}/></span><strong>Text</strong><small>Titles &amp; overlays</small></button>
              <button onClick={() => onOpenTool?.("captions")} disabled={!onOpenTool}><span className="copro-tool-tile-icon"><Captions size={25}/></span><strong>Captions</strong><small>Edit words on canvas</small></button>
              <button onClick={onCreate}><span className="copro-tool-tile-icon"><Scissors size={24}/></span><strong>Timeline</strong><small>Trim &amp; arrange clips</small></button>
            </div>
            <p className="copro-tools-guidance"><Check size={16}/> Effects, transitions, speed and audio controls are available inside the editor when you select a clip.</p>
          </section>

          {examples.length ? <section className="copro-examples" aria-label="Example timelines">
            <div className="copro-section-heading"><div><p className="copro-eyebrow">EXPLORE THE EDITOR</p><h2>Example timelines</h2></div><span>No source footage included</span></div>
            <div className="copro-example-grid">
              {examples.map((project) => <button key={project.id} className="copro-example-card" onClick={() => onOpenProject(project.id)}>
                <ProjectThumb project={project}/>
                <span><strong>{project.title}</strong><small>{project.subtitle ?? "Sample timeline"}</small></span>
                <ArrowRight size={18}/>
              </button>)}
            </div>
            <p className="copro-sample-note">Examples demonstrate editing structure only. Import your own media to see footage in the preview.</p>
          </section> : null}
        </main>
      </div>
      <nav className="copro-mobile-nav" aria-label="CoPro navigation">
        <button className={section === "home" ? "is-active" : ""} onClick={() => navigate("home")}><Home size={22}/><span>Home</span></button>
        <button onClick={onImport}><Import size={22}/><span>Import</span></button>
        <button className="copro-create-dock" onClick={onCreate}><Plus size={25}/><span>Create</span></button>
        <button className={section === "projects" ? "is-active" : ""} onClick={() => navigate("projects")}><FolderOpen size={22}/><span>Projects</span></button>
      </nav>
    </section>
  );
}

function ProjectThumb({ project }: { project: CoProProjectSummary }) {
  const Icon = project.kind === "audio" ? AudioLines : project.kind === "image" ? ImageIcon : project.kind === "template" ? Layers3 : Film;
  return <span className={"copro-project-thumb copro-thumb-" + (project.thumbnailTone ?? "slate")}><Icon size={27} strokeWidth={1.4} aria-hidden="true"/></span>;
}

function humanStatus(status: CoProProjectSummary["status"]) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatProjectMeta(project: CoProProjectSummary) {
  const pieces: string[] = [];
  if (project.durationMs) {
    const seconds = Math.round(project.durationMs / 1000);
    pieces.push(Math.floor(seconds / 60) + ":" + String(seconds % 60).padStart(2, "0"));
  }
  if (project.aspectRatio) pieces.push(project.aspectRatio);
  pieces.push(new Date(project.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  return pieces.join("  ·  ");
}
