import type {
  WorkArtifact,
  WorkCalendarEvent,
  WorkMailMessage,
  WorkProject,
  WorkSnapshot,
  WorkTicket,
  WorkTicketSurface,
} from "@inneranimalmedia/agentsam-work/contracts";

export type WorkRequestContext = {
  accountId: string;
  projectId?: string | null;
};

export interface WorkTicketsAdapter {
  list(
    context: WorkRequestContext,
    input?: { surface?: WorkTicketSurface; projectId?: string | null },
  ): Promise<WorkTicket[]>;
}

export interface WorkCalendarAdapter {
  list(context: WorkRequestContext): Promise<WorkCalendarEvent[]>;
}

export interface WorkMailAdapter {
  list(context: WorkRequestContext): Promise<WorkMailMessage[]>;
}

export interface WorkArtifactsAdapter {
  list(context: WorkRequestContext): Promise<WorkArtifact[]>;
}

export interface WorkProjectsAdapter {
  list(context: WorkRequestContext): Promise<WorkProject[]>;
  get(context: WorkRequestContext, projectId: string): Promise<WorkProject | null>;
}

export interface WorkAnalyticsAdapter {
  tickets(context: WorkRequestContext): Promise<WorkSnapshot["ticketAnalytics"]>;
}

export type LocalStudioWorkAdapters = {
  tickets: WorkTicketsAdapter;
  calendar: WorkCalendarAdapter;
  mail: WorkMailAdapter;
  artifacts: WorkArtifactsAdapter;
  projects: WorkProjectsAdapter;
  analytics: WorkAnalyticsAdapter;
};
