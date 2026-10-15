import type { WorkEventInput, WorkProjectInput, WorkTicket, WorkTicketInput, WorkCalendarEvent, WorkProject } from "../contracts/index";

/** Mutations the surfaces may call. Missing members mean the host cannot do it (the control is hidden). */
export type WorkActions = {
  createTicket?: (input: WorkTicketInput & { title: string }) => Promise<unknown>;
  updateTicket?: (id: string, patch: WorkTicketInput) => Promise<unknown>;
  deleteTicket?: (id: string) => Promise<unknown>;
  scheduleTicket?: (ticket: WorkTicket) => Promise<unknown>;
  createProject?: (input: WorkProjectInput & { name: string }) => Promise<WorkProject | undefined>;
  updateProject?: (id: string, patch: WorkProjectInput) => Promise<unknown>;
  deleteProject?: (id: string, options?: { hard?: boolean }) => Promise<unknown>;
  createEvent?: (input: WorkEventInput & { title: string; start: string }) => Promise<WorkCalendarEvent | undefined>;
  updateEvent?: (id: string, patch: WorkEventInput) => Promise<unknown>;
  deleteEvent?: (id: string) => Promise<unknown>;
  refresh?: () => Promise<unknown>;
};
