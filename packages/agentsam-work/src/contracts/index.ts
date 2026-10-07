export type WorkSurfaceId =
  | "calendar"
  | "tickets"
  | "mail"
  | "artifacts"
  | "artifact-tickets"
  | "projects"
  | "project-detail";

export type WorkNavId =
  | "calendar"
  | "tickets"
  | "mail"
  | "projects"
  | "artifacts"
  | "r2"
  | "google-drive"
  | "shared-drives"
  | "local-folder"
  | "shared-with-me"
  | "recent"
  | "starred"
  | "trash";

export type WorkNavItem = {
  id: WorkNavId;
  label: string;
  href: string;
  group?: "work" | "files";
};

export type WorkThemeTokens = {
  canvas: string;
  panel: string;
  panelSubtle: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  accentSoft: string;
  navActive: string;
  danger: string;
  success: string;
  warning: string;
  radius: string;
};

export const WORK_THEME_CSS_VARS: Record<keyof WorkThemeTokens, string> = {
  canvas: "--agentsam-work-canvas",
  panel: "--agentsam-work-panel",
  panelSubtle: "--agentsam-work-panel-subtle",
  text: "--agentsam-work-text",
  muted: "--agentsam-work-muted",
  border: "--agentsam-work-border",
  accent: "--agentsam-work-accent",
  accentSoft: "--agentsam-work-accent-soft",
  navActive: "--agentsam-work-nav-active",
  danger: "--agentsam-work-danger",
  success: "--agentsam-work-success",
  warning: "--agentsam-work-warning",
  radius: "--agentsam-work-radius",
};

export type WorkTicketStatus =
  | "backlog"
  | "active"
  | "blocked"
  | "in_review"
  | "shipped"
  | "abandoned";

export type WorkTicketSurface = "platform" | "collaborate";

export type WorkTicket = {
  id: string;
  title: string;
  description?: string | null;
  status: WorkTicketStatus;
  priority?: string | null;
  project?: string | null;
  clientId?: string | null;
  tags: string[];
  blockedBy: string[];
  blocks: string[];
  surface: WorkTicketSurface;
  updatedAt: number;
};

export type WorkArtifact = {
  id: string;
  name: string;
  kind: "image" | "document" | "code" | "archive" | "other";
  source: "artifacts" | "r2" | "google-drive" | "local";
  preview?: string | null;
  mime?: string | null;
  sizeLabel?: string | null;
  updatedLabel?: string | null;
};

export type WorkProject = {
  id: string;
  name: string;
  description?: string;
  projectType?: string;
  status: "planning" | "active" | "review" | "blocked" | "complete" | "production";
  progress: number;
  coverImageUrl?: string | null;
  initials: string;
  accent: string;
  githubRepo?: string | null;
  openTasks: number;
  trackedMinutes: number;
};

export type WorkMailMessage = {
  id: string;
  from: string;
  to: string;
  subject: string;
  preview: string;
  body?: string;
  receivedLabel: string;
  unread?: boolean;
  starred?: boolean;
};

export type WorkMailConnection = {
  id: string;
  provider: string;
  label: string;
  kind: "mailbox" | "infrastructure";
  status: "connected" | "ready" | "disconnected" | "needs_scope";
  accountLabel?: string | null;
  capabilities?: string[];
  description?: string | null;
};

export type WorkCalendarEvent = {
  id: string;
  title: string;
  dayOffset: number;
  startMinutes: number;
  durationMinutes: number;
  kind: "meeting" | "task" | "focus" | "event";
};

export type WorkSnapshot = {
  fixtureName: string;
  nav: WorkNavItem[];
  tickets: WorkTicket[];
  artifacts: WorkArtifact[];
  projects: WorkProject[];
  mail: WorkMailMessage[];
  mailConnections?: WorkMailConnection[];
  activeMailConnectionId?: string | null;
  calendar: WorkCalendarEvent[];
  currentProjectId: string;
  ticketAnalytics: {
    completionRate: number;
    avgCycleDays: number;
    oldestActiveDays: number;
  };
};

export type WorkSnapshotRequest = {
  surface?: WorkSurfaceId;
  mailConnectionId?: string;
};

export interface WorkHost {
  snapshot(request?: WorkSnapshotRequest): Promise<WorkSnapshot>;
  refresh?(): Promise<void>;
  createTicket?(input: Pick<WorkTicket, "title" | "surface"> & Partial<WorkTicket>): Promise<WorkTicket>;
  updateTicket?(id: string, patch: Partial<WorkTicket>): Promise<WorkTicket>;
  archiveMail?(id: string, connectionId?: string): Promise<void>;
  starMail?(id: string, starred: boolean, connectionId?: string): Promise<void>;
  connectMail?(provider?: string): Promise<void>;
  disconnectMail?(connectionId?: string): Promise<void>;
  sendMail?(input: { to: string; subject: string; body: string }, connectionId?: string): Promise<void>;
  selectMailConnection?(connectionId: string): Promise<void> | void;
  openMailConnections?(): Promise<void> | void;
}

export type WorkNavigate = (href: string) => void;
