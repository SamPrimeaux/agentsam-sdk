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

/** Free-form ticket lane (platform, collaborate, dashboard, worker, ...). */
export type WorkTicketSurface = string;

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
  statusReason?: string | null;
  parentId?: string | null;
  /** ISO-8601 timestamps. */
  startAt?: string | null;
  dueAt?: string | null;
  closedAt?: string | null;
  estimatedMinutes?: number | null;
  percentComplete?: number;
  ownerKind?: string;
  ownerRef?: string | null;
  createdAt?: number;
  /** Epoch seconds. */
  updatedAt: number;
};

export type WorkTicketInput = Partial<Omit<WorkTicket, "id" | "updatedAt" | "createdAt" | "closedAt">>;

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

export type WorkProjectStatus =
  | "discovery"
  | "design"
  | "development"
  | "qa"
  | "staging"
  | "production"
  | "maintenance"
  | "archived";

export const WORK_PROJECT_STATUSES: WorkProjectStatus[] = [
  "discovery",
  "design",
  "development",
  "qa",
  "staging",
  "production",
  "maintenance",
  "archived",
];

export const WORK_PROJECT_TYPES = [
  "dashboard",
  "landing-page",
  "saas-product",
  "e-commerce",
  "internal-tool",
  "template",
] as const;

export type WorkProject = {
  id: string;
  name: string;
  description?: string;
  projectType?: string;
  status: WorkProjectStatus;
  progress: number;
  coverImageUrl?: string | null;
  initials: string;
  accent: string;
  githubRepo?: string | null;
  branch?: string | null;
  objective?: string | null;
  clientName?: string | null;
  clientId?: string | null;
  domain?: string | null;
  launchDate?: string | null;
  priority?: number;
  tags?: string[];
  starred?: boolean;
  openTasks: number;
  totalTasks?: number;
  /** Actual logged minutes. Never populated from ticket effort estimates. */
  trackedMinutes: number;
  /** Estimated effort from linked ticket estimates (not a time entry). */
  estimatedMinutes?: number;
  updatedAt?: string | null;
};

/** Installed application entrypoints for an existing Work project. Host-owned, not a second project registry. */
export type WorkProjectApp = { id: string; label: string; description: string; href: string };

export type WorkProjectInput = Partial<
  Pick<
    WorkProject,
    | "name"
    | "description"
    | "projectType"
    | "status"
    | "progress"
    | "coverImageUrl"
    | "accent"
    | "githubRepo"
    | "branch"
    | "objective"
    | "clientName"
    | "clientId"
    | "domain"
    | "launchDate"
    | "priority"
    | "tags"
    | "starred"
  >
>;

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

export type WorkEventType =
  | "meeting"
  | "deadline"
  | "reminder"
  | "task"
  | "client_call"
  | "personal"
  | "travel"
  | "other";

export const WORK_EVENT_TYPES: WorkEventType[] = [
  "meeting",
  "deadline",
  "reminder",
  "task",
  "client_call",
  "personal",
  "travel",
  "other",
];

export type WorkCalendarEvent = {
  id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  type: WorkEventType;
  /** ISO-8601 (UTC). */
  start: string;
  end: string;
  allDay?: boolean;
  status?: "scheduled" | "completed" | "cancelled" | "rescheduled";
  color?: string | null;
  priority?: "low" | "normal" | "high" | "urgent";
  projectId?: string | null;
  clientId?: string | null;
  /** "primary" = created here and editable; anything else is synced from a provider. */
  source?: string;
  readOnly?: boolean;
};

export type WorkEventInput = Partial<
  Pick<
    WorkCalendarEvent,
    "title" | "description" | "location" | "type" | "start" | "end" | "allDay" | "status" | "color" | "priority" | "projectId" | "clientId"
  >
>;

export type WorkEntityCapabilities = { create: boolean; update: boolean; delete: boolean };

/** Hosts advertise what they can do; surfaces hide controls instead of rendering dead buttons. */
export type WorkCapabilities = {
  tickets: WorkEntityCapabilities;
  projects: WorkEntityCapabilities;
  calendar: WorkEntityCapabilities;
  googleCalendar?: boolean;
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
  /** Where this data lives: the hosted account, or the local on-device store. */
  source?: "hosted" | "local";
  capabilities?: WorkCapabilities;
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
  /** Calendar window (ISO-8601). */
  from?: string;
  to?: string;
};

/** Local Studio conversation metadata, derived from its existing persisted chat store. */
export type WorkProjectChat = {
  id: string;
  title: string;
  updatedAt: number;
  messageCount: number;
  starred: boolean;
};

export type WorkProjectInsights = {
  projectId: string;
  costs: { currency: string; recordedTotal: number; lineItems: number } | null;
  rules: { id: string; title: string; version: number; updatedAt: string } | null;
  costsConnected: boolean;
  rulesConnected: boolean;
};
export interface WorkHost {
  snapshot(request?: WorkSnapshotRequest): Promise<WorkSnapshot>;
  /** Optional verified D1 insights, account-scoped by the server. */
  projectInsights?(projectId: string): Promise<WorkProjectInsights>;
  /** Resolve project-aware installed applications without redefining project identity. */
  projectApps?(project: WorkProject): WorkProjectApp[];
  listProjectChats?(projectId: string): Promise<WorkProjectChat[]>;
  listAssignableChats?(): Promise<(WorkProjectChat & { workProjectId?: string })[]>;
  assignProjectChat?(chatId: string, projectId: string | null): Promise<void>;
  createProjectChat?(projectId: string): Promise<string>;
  refresh?(): Promise<void>;
  createTicket?(input: WorkTicketInput & { title: string }): Promise<WorkTicket>;
  updateTicket?(id: string, patch: WorkTicketInput): Promise<WorkTicket>;
  deleteTicket?(id: string): Promise<void>;
  createProject?(input: WorkProjectInput & { name: string }): Promise<WorkProject>;
  updateProject?(id: string, patch: WorkProjectInput): Promise<WorkProject>;
  /** Default archives; `hard` removes the project permanently. */
  deleteProject?(id: string, options?: { hard?: boolean }): Promise<void>;
  createEvent?(input: WorkEventInput & { title: string; start: string }): Promise<WorkCalendarEvent>;
  updateEvent?(id: string, patch: WorkEventInput): Promise<WorkCalendarEvent>;
  deleteEvent?(id: string): Promise<void>;
  archiveMail?(id: string, connectionId?: string): Promise<void>;
  starMail?(id: string, starred: boolean, connectionId?: string): Promise<void>;
  connectMail?(provider?: string): Promise<void>;
  disconnectMail?(connectionId?: string): Promise<void>;
  sendMail?(input: { to: string; subject: string; body: string }, connectionId?: string): Promise<void>;
  selectMailConnection?(connectionId: string): Promise<void> | void;
  openMailConnections?(): Promise<void> | void;
}

export type WorkNavigate = (href: string) => void;
