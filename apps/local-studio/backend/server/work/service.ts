import type { WorkSnapshot } from "@inneranimalmedia/agentsam-work/contracts";
import type {
  LocalStudioWorkAdapters,
  WorkRequestContext,
} from "./contracts";

const NAV: WorkSnapshot["nav"] = [
  { id: "calendar", label: "Calendar", href: "/collaborate", group: "work" },
  { id: "tickets", label: "Tickets", href: "/collaborate?seg=tickets", group: "work" },
  { id: "mail", label: "Mail", href: "/mail", group: "work" },
  { id: "projects", label: "Projects", href: "/projects", group: "work" },
  { id: "artifacts", label: "My artifacts", href: "/artifacts", group: "files" },
  { id: "r2", label: "R2 Storage", href: "/artifacts?source=r2", group: "files" },
  { id: "google-drive", label: "Google Drive", href: "/artifacts?source=google-drive", group: "files" },
  { id: "shared-drives", label: "Shared drives", href: "/artifacts?source=shared-drives", group: "files" },
  { id: "local-folder", label: "Local folder", href: "/artifacts?source=local", group: "files" },
  { id: "shared-with-me", label: "Shared with me", href: "/artifacts?view=shared", group: "files" },
  { id: "recent", label: "Recent", href: "/artifacts?view=recent", group: "files" },
  { id: "starred", label: "Starred", href: "/artifacts?view=starred", group: "files" },
  { id: "trash", label: "Trash", href: "/artifacts?view=trash", group: "files" },
];

export function createLocalStudioWorkService(adapters: LocalStudioWorkAdapters) {
  return {
    async snapshot(context: WorkRequestContext): Promise<WorkSnapshot> {
      const [
        tickets,
        calendar,
        mail,
        artifacts,
        projects,
        ticketAnalytics,
      ] = await Promise.all([
        adapters.tickets.list(context),
        adapters.calendar.list(context),
        adapters.mail.list(context),
        adapters.artifacts.list(context),
        adapters.projects.list(context),
        adapters.analytics.tickets(context),
      ]);

      return {
        fixtureName: "live",
        nav: NAV,
        tickets,
        calendar,
        mail,
        artifacts,
        projects,
        currentProjectId:
          context.projectId && projects.some((project) => project.id === context.projectId)
            ? context.projectId
            : projects[0]?.id ?? "",
        ticketAnalytics,
      };
    },
  };
}
