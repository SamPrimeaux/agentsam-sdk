import {
  Archive,
  CalendarDays,
  CheckSquare,
  Clock3,
  Cloud,
  Folder,
  FolderKanban,
  HardDrive,
  Lightbulb,
  Mail,
  Menu,
  Plus,
  Search,
  Star,
  Trash2,
  Users,
  Video,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import type {
  WorkNavId,
  WorkNavItem,
  WorkNavigate,
  WorkSurfaceId,
} from "../contracts/index";

const ICONS: Record<WorkNavId, typeof CalendarDays> = {
  calendar: CalendarDays,
  tickets: CheckSquare,
  mail: Mail,
  projects: FolderKanban,
  artifacts: Archive,
  r2: Cloud,
  "google-drive": Folder,
  "shared-drives": Folder,
  "local-folder": HardDrive,
  "shared-with-me": Users,
  recent: Clock3,
  starred: Star,
  trash: Trash2,
};

function activeNavId(surface: WorkSurfaceId): WorkNavId {
  if (surface === "calendar") return "calendar";
  if (surface === "tickets" || surface === "artifact-tickets") return "tickets";
  if (surface === "mail") return "mail";
  if (surface === "projects" || surface === "project-detail") return "projects";
  return "artifacts";
}

function navHref(
  item: Pick<WorkNavItem, "id" | "href">,
  surface: WorkSurfaceId,
) {
  if (
    item.id === "tickets" &&
    (surface === "artifacts" || surface === "artifact-tickets")
  ) {
    return "/artifacts/tickets";
  }
  return item.href;
}

function shellTitle(surface: WorkSurfaceId) {
  switch (surface) {
    case "calendar":
      return "Calendar";
    case "tickets":
    case "artifact-tickets":
      return "Tickets";
    case "mail":
      return "Mail";
    case "artifacts":
      return "Work";
    case "projects":
      return "Projects";
    case "project-detail":
      return "Project";
    default:
      return "Work";
  }
}

function MiniNav({
  nav,
  surface,
  onNavigate,
  onClose,
}: {
  nav: WorkNavItem[];
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
  onClose?: () => void;
}) {
  const current = activeNavId(surface);
  const workItems = nav.filter((item) => item.group === "work");
  const fileItems = nav.filter((item) => item.group === "files");
  const renderItems = (items: WorkNavItem[]) =>
    items.map((item) => {
      const Icon = ICONS[item.id];
      return (
        <button
          key={item.id}
          type="button"
          className="agentsam-work-mini-nav__item"
          data-active={item.id === current}
          onClick={() => {
            onNavigate(navHref(item, surface));
            onClose?.();
          }}
        >
          <Icon size={17} strokeWidth={1.8} />
          <span className="agentsam-work-mini-nav__label">{item.label}</span>
        </button>
      );
    });

  return (
    <>
      <div className="agentsam-work-mini-nav__header">
        <div className="agentsam-work-mini-nav__brand">
          <div className="agentsam-work-mini-nav__eyebrow">AgentSam</div>
          <div className="agentsam-work-mini-nav__title">Work</div>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Close Work navigation"
            onClick={onClose}
            style={{ border: 0, background: "transparent", cursor: "pointer" }}
          >
            <X size={18} />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        className="agentsam-work-mini-nav__create"
        onClick={() => onNavigate("/collaborate?new=1")}
      >
        <Plus size={18} style={{ marginRight: 8, verticalAlign: "middle" }} />
        Create
      </button>
      <div className="agentsam-work-mini-nav__scroll">
        <div className="agentsam-work-mini-nav__group">{renderItems(workItems)}</div>
        <div className="agentsam-work-mini-nav__group">{renderItems(fileItems)}</div>
      </div>
    </>
  );
}

function RightRail({
  surface,
  onNavigate,
}: {
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
}) {
  return (
    <aside className="agentsam-work-rail" aria-label="Work apps">
      <button type="button" title="Insights">
        <Lightbulb size={18} />
      </button>
      <button
        type="button"
        title="Tickets"
        data-active={surface === "tickets" || surface === "artifact-tickets"}
        onClick={() =>
          onNavigate(
            surface === "artifacts" || surface === "artifact-tickets"
              ? "/artifacts/tickets"
              : "/collaborate?seg=tickets",
          )
        }
      >
        <CheckSquare size={18} />
      </button>
      <button type="button" title="Meet">
        <Video size={18} />
      </button>
      <button
        type="button"
        title="Mail"
        data-active={surface === "mail"}
        onClick={() => onNavigate("/mail")}
      >
        <Mail size={18} />
      </button>
      <button type="button" title="Contacts">
        <Users size={18} />
      </button>
    </aside>
  );
}

export function WorkShell({
  nav,
  surface,
  onNavigate,
  children,
  trailing,
  rightRail = false,
}: {
  nav: WorkNavItem[];
  surface: WorkSurfaceId;
  onNavigate: WorkNavigate;
  children: ReactNode;
  trailing?: ReactNode;
  rightRail?: boolean;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const current = activeNavId(surface);

  return (
    <div className="agentsam-work agentsam-work-shell" data-right-rail={rightRail}>
      <aside className="agentsam-work-mini-nav">
        <MiniNav nav={nav} surface={surface} onNavigate={onNavigate} />
      </aside>

      <section className="agentsam-work-stage">
        <header className="agentsam-work-stage__topbar">
          <button
            type="button"
            className="agentsam-work-stage__mobile-menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open Work navigation"
          >
            <Menu size={18} />
          </button>
          <span className="agentsam-work-stage__muted">Work</span>
          <span className="agentsam-work-stage__muted">/</span>
          <span className="agentsam-work-stage__crumb">{shellTitle(surface)}</span>
          <div style={{ minWidth: 0, flex: 1 }} />
          {trailing}
        </header>
        <div className="agentsam-work-stage__body">{children}</div>
      </section>

      {rightRail ? <RightRail surface={surface} onNavigate={onNavigate} /> : null}

      <nav className="agentsam-work-bottom-nav" aria-label="Work surfaces">
        {[
          { id: "calendar" as const, label: "Calendar", href: "/collaborate", icon: CalendarDays },
          { id: "tickets" as const, label: "Tickets", href: "/collaborate?seg=tickets", icon: CheckSquare },
          { id: "mail" as const, label: "Mail", href: "/mail", icon: Mail },
          { id: "projects" as const, label: "Projects", href: "/projects", icon: FolderKanban },
          { id: "artifacts" as const, label: "Files", href: "/artifacts", icon: Archive },
        ].map((item) => (
          <button
            type="button"
            key={item.id}
            data-active={current === item.id}
            onClick={() => onNavigate(item.href)}
          >
            <item.icon size={17} />
            {item.label}
          </button>
        ))}
      </nav>

      {drawerOpen ? (
        <>
          <button
            type="button"
            className="agentsam-work-drawer-backdrop"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close Work navigation"
          />
          <aside className="agentsam-work-drawer">
            <MiniNav
              nav={nav}
              surface={surface}
              onNavigate={onNavigate}
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </>
      ) : null}
    </div>
  );
}

export function WorkSearch({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="agentsam-work-search">
      <Search size={16} color="var(--agentsam-work-muted)" />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
