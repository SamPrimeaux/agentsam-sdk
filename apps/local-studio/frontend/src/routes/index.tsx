import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpen, Box, Database, Film, Folder, Globe, MessageSquare, Search, Ticket } from "lucide-react";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/")({
  component: LocalStudioHome,
});

type AppRoute = "/cad" | "/projects" | "/agentsam" | "/chats" | "/apps/ecommerce-cms-agentsam" | "/cms" | "/browse" | "/tickets" | "/artifacts" | "/media" | "/database";

const apps: Array<{
  id: string;
  label: string;
  description: string;
  to: AppRoute;
  icon: typeof Box;
}> = [
  { id: "cad", label: "CAD Creator", description: "Draft with SamSketch, model with SamSculpt, and evolve the DreamHouse BIM in one workspace.", to: "/cad", icon: Box },
  { id: "projects", label: "Projects", description: "Organize active work, project files, and deliverables.", to: "/projects", icon: Folder },
  { id: "agentsam", label: "AgentSam Work", description: "Plan, research, and carry out work with your assistant.", to: "/agentsam", icon: MessageSquare },
  { id: "commerce", label: "Commerce CMS", description: "Manage storefronts, products, themes, content, and publishing.", to: "/apps/ecommerce-cms-agentsam", icon: Globe },
  { id: "sites", label: "Sites", description: "Work with site content and connected web properties.", to: "/cms", icon: Globe },
  { id: "browser", label: "Browser", description: "Research the web and bring useful source material into your work.", to: "/browse", icon: Search },
  { id: "tickets", label: "Tickets", description: "Review tasks, blockers, and delivery status.", to: "/tickets", icon: Ticket },
  { id: "library", label: "Library", description: "Find saved artifacts, files, and reusable references.", to: "/artifacts", icon: BookOpen },
  { id: "media", label: "Media", description: "Curate visual assets and creative resources.", to: "/media", icon: Film },
  { id: "database", label: "Database", description: "Inspect connected data and development resources.", to: "/database", icon: Database },
];

function LocalStudioHome() {
  const state = useWorkStore();
  const activeTrail = state.trails.find((trail) => trail.id === state.activeTrailId);

  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-8 px-5 py-7 sm:px-8 lg:px-10 lg:py-10">
      <header className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Local Studio</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Your workspace, connected.</h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          One desktop shell for your projects, packaged tools, and AgentSam workflows. Open a capability without leaving the workspace.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Workspace activity">
        <Link to="/projects" className="group flex min-h-28 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/60">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Projects</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{state.hydrated ? state.projects.length : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Saved project spaces</p>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground"><Folder className="size-5" /></span>
        </Link>
        <Link to="/chats" className="group flex min-h-28 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/60">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">Conversations</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums text-foreground">{state.hydrated ? state.trails.length : "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">Your ongoing work with AgentSam</p>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground"><MessageSquare className="size-5" /></span>
        </Link>
        <Link to="/agentsam" className="group flex min-h-28 items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/60">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">AgentSam</p>
            <p className="mt-2 text-lg font-semibold text-foreground">{activeTrail?.title || "Start something"}</p>
            <p className="mt-1 text-xs text-muted-foreground">{activeTrail ? "Continue in AgentSam Work" : "Turn an idea into a plan and a result"}</p>
          </div>
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground"><MessageSquare className="size-5" /></span>
        </Link>
      </section>

      <section className="space-y-4" aria-labelledby="apps-heading">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 id="apps-heading" className="text-lg font-semibold text-foreground">Apps and tools</h2>
            <p className="mt-1 text-sm text-muted-foreground">A single entry point for your installed capabilities.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <Link key={app.id} to={app.to} className="group flex min-h-40 flex-col rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-muted text-muted-foreground transition-colors group-hover:text-foreground"><Icon className="size-5" /></span>
                <span className="text-sm font-semibold text-foreground">{app.label}</span>
                <span className="mt-2 text-sm leading-5 text-muted-foreground">{app.description}</span>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}
