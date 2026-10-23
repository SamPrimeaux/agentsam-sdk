import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, BookOpen, Box, ChevronRight, FilePlus2, Film, Folder, Globe, Layers3, MessageSquare, Search, Ticket } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";
import "./platform-home.css";

export const Route = createFileRoute("/")({ component: LocalStudioHome });

type Destination = "/cad" | "/samsketch" | "/projects" | "/agentsam" | "/sites" | "/cms" | "/browse" | "/tickets" | "/artifacts" | "/media";

const quick = [
  { to: "/sites" as Destination, label: "Sites & themes", summary: "Edit pages, sections, and published sites.", icon: Globe },
  { to: "/projects" as Destination, label: "Projects", summary: "Pick up existing projects and work.", icon: Folder },
  { to: "/artifacts" as Destination, label: "Library", summary: "Open saved outputs and references.", icon: BookOpen },
  { to: "/cad" as Destination, label: "CAD Creator", summary: "Open the drafting and modeling workspace.", icon: Box },
];

const installed = [
  { to: "/agentsam" as Destination, name: "AgentSam", label: "Conversations & Work", icon: MessageSquare },
  { to: "/cad" as Destination, name: "CAD Creator", label: "Modeling & BIM", icon: Box },
  { to: "/samsketch" as Destination, name: "SamSketch", label: "Creative studio", icon: Layers3 },
  { to: "/media" as Destination, name: "Media", label: "Asset library", icon: Film },
  { to: "/browse" as Destination, name: "Browser", label: "Research", icon: Search },
  { to: "/sites" as Destination, name: "Sites", label: "Website CMS", icon: Globe },
];

export function LocalStudioHome() {
  const navigate = useNavigate();
  const state = useWorkStore();
  const active = state.trails.find((thread) => thread.id === state.activeTrailId);
  const recentProjects = state.hydrated ? state.projects.slice(0, 3) : [];

  const newConversation = () => {
    state.startTrail();
    void navigate({ to: "/agentsam" });
  };
  const newProject = () => {
    state.createProject();
    void navigate({ to: "/projects" });
  };

  return <main className="platform-home" data-studio-product="platform-home">
    <div className="platform-home-inner">
      <section className="platform-home-welcome" aria-labelledby="platform-home-title">
        <div className="platform-home-eyebrow"><span className="platform-home-live" /> AgentSam Studio <span className="platform-home-separator">/</span> Workspace</div>
        <h1 id="platform-home-title">What should we build next?</h1>
        <p>Everything you are creating, connected in one place. Start with AgentSam or open an installed workspace.</p>
        <div className="platform-home-composer">
          <button type="button" className="platform-home-composer-entry" onClick={newConversation} aria-label="Start a new AgentSam conversation">
            <span>Work with AgentSam</span><span className="platform-home-composer-prompt">Ask, plan, build, or refine anything…</span>
          </button>
          <div className="platform-home-composer-actions">
            <span className="platform-home-signature">AgentSam</span>
            <span className="platform-home-composer-links">
              <Link to="/projects">Projects <ChevronRight size={14}/></Link>
              <button type="button" onClick={newConversation} className="platform-home-go" aria-label="Open AgentSam"><ArrowUpRight size={18}/></button>
            </span>
          </div>
        </div>
        {active && <Link className="platform-home-continue" to="/agentsam">Continue: {active.title} <ArrowRight size={14}/></Link>}
      </section>

      <section className="platform-home-section" aria-labelledby="platform-quick-heading">
        <div className="platform-home-section-head"><h2 id="platform-quick-heading">Quick access</h2><span>Continue where you left off</span></div>
        <div className="platform-home-quick-grid">
          {quick.map(({ to, label, summary, icon: Icon }) => <Link to={to} className="platform-home-quick-card" key={to}>
            <span className="platform-home-card-line"><Icon size={17}/><ArrowUpRight size={15}/></span>
            <strong>{label}</strong><span>{summary}</span>
          </Link>)}
        </div>
      </section>

      <section className="platform-home-section" aria-labelledby="platform-start-heading">
        <div className="platform-home-section-head"><div><h2 id="platform-start-heading">Start something</h2><p>Real actions in your connected workspace.</p></div></div>
        <div className="platform-home-start-grid">
          <button type="button" className="platform-home-start-card" onClick={newConversation}>
            <MessageSquare size={24}/><span>New conversation</span><small>Begin with AgentSam</small><ArrowUpRight className="platform-home-start-arrow" size={16}/>
          </button>
          <button type="button" className="platform-home-start-card" onClick={newProject}>
            <Folder size={24}/><span>New project</span><small>Organize the next build</small><ArrowUpRight className="platform-home-start-arrow" size={16}/>
          </button>
          <Link to="/sites" className="platform-home-start-card">
            <FilePlus2 size={24}/><span>Website workspace</span><small>Open the CMS editor</small><ArrowUpRight className="platform-home-start-arrow" size={16}/>
          </Link>
          <Link to="/tickets" className="platform-home-start-card">
            <Ticket size={24}/><span>Review tickets</span><small>Track delivery</small><ArrowUpRight className="platform-home-start-arrow" size={16}/>
          </Link>
        </div>
      </section>

      <section className="platform-home-section" aria-labelledby="platform-apps-heading">
        <div className="platform-home-section-head"><div><h2 id="platform-apps-heading">Installed workspaces</h2><p>Applications open inside the shared Studio shell.</p></div></div>
        <div className="platform-home-installed">
          {installed.map(({ to, name, label, icon: Icon }) => <Link key={to} to={to} className="platform-home-installed-item"><Icon size={18}/><span><strong>{name}</strong><small>{label}</small></span><ArrowUpRight size={15}/></Link>)}
        </div>
      </section>

      <section className="platform-home-section platform-home-recent" aria-labelledby="platform-recent-heading">
        <div className="platform-home-section-head"><div><h2 id="platform-recent-heading">Your activity</h2><p>Based on saved Local Studio work.</p></div><Link to="/projects">All projects <ArrowRight size={14}/></Link></div>
        <div className="platform-home-activity">
          <div className="platform-home-activity-count"><strong>{state.hydrated ? state.projects.length : "—"}</strong><span>Projects</span></div>
          <div className="platform-home-activity-count"><strong>{state.hydrated ? state.trails.length : "—"}</strong><span>Conversations</span></div>
          <div className="platform-home-activity-list">
            {recentProjects.length ? recentProjects.map((project) => <Link key={project.id} to="/projects"><Folder size={15}/>{project.name}<ArrowUpRight size={14}/></Link>) : <span>No recent projects saved here yet.</span>}
          </div>
        </div>
      </section>
    </div>
  </main>;
}
