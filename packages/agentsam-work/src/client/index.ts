import type {
  WorkCalendarEvent,
  WorkEventInput,
  WorkHost,
  WorkProject,
  WorkProjectInput,
  WorkProjectInsights,
  WorkSnapshot,
  WorkTicket,
  WorkTicketInput,
} from "../contracts/index";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  }
  return body as T;
}

export type WorkRequest = (path: string, method?: string, body?: unknown) => Promise<Response>;

/**
 * Entity CRUD shared by every transport (browser fetch, desktop service bridge).
 * One implementation, so web and desktop can never drift on routes or payloads.
 */
export function createWorkCrud(request: WorkRequest): Pick<
  WorkHost,
  | "createTicket"
  | "updateTicket"
  | "deleteTicket"
  | "createProject"
  | "updateProject"
  | "deleteProject"
  | "projectInsights"
  | "createEvent"
  | "updateEvent"
  | "deleteEvent"
> {
  const id = encodeURIComponent;
  return {
    async createTicket(input: WorkTicketInput & { title: string }) {
      return (await json<{ ticket: WorkTicket }>(await request("/api/tickets", "POST", input))).ticket;
    },
    async updateTicket(ticketId: string, patch: WorkTicketInput) {
      return (await json<{ ticket: WorkTicket }>(await request(`/api/tickets/${id(ticketId)}`, "PATCH", patch))).ticket;
    },
    async deleteTicket(ticketId: string) {
      await json(await request(`/api/tickets/${id(ticketId)}`, "DELETE"));
    },
    async createProject(input: WorkProjectInput & { name: string }) {
      return (await json<{ project: WorkProject }>(await request("/api/projects", "POST", input))).project;
    },
    async updateProject(projectId: string, patch: WorkProjectInput) {
      return (await json<{ project: WorkProject }>(await request(`/api/projects/${id(projectId)}`, "PATCH", patch))).project;
    },
    async deleteProject(projectId: string, options?: { hard?: boolean }) {
      await json(await request(`/api/projects/${id(projectId)}${options?.hard ? "?hard=1" : ""}`, "DELETE"));
    },
    async projectInsights(projectId: string) {
      return (await json<{ insights: WorkProjectInsights }>(await request("/api/work/projects/" + id(projectId) + "/insights"))).insights;
    },
    async createEvent(input: WorkEventInput & { title: string; start: string }) {
      return (await json<{ event: WorkCalendarEvent }>(await request("/api/calendar/events", "POST", input))).event;
    },
    async updateEvent(eventId: string, patch: WorkEventInput) {
      return (await json<{ event: WorkCalendarEvent }>(await request(`/api/calendar/events/${id(eventId)}`, "PATCH", patch))).event;
    },
    async deleteEvent(eventId: string) {
      await json(await request(`/api/calendar/events/${id(eventId)}`, "DELETE"));
    },
  };
}

export function createHttpWorkHost(base = ""): WorkHost {
  const root = base.replace(/\/$/, "");
  const request: WorkRequest = (path, method = "GET", body) =>
    fetch(root + path, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  return {
    async snapshot(req = {}): Promise<WorkSnapshot> {
      const params = new URLSearchParams();
      if (req.surface) params.set("surface", req.surface);
      if (req.mailConnectionId) params.set("mail_connection", req.mailConnectionId);
      if (req.from) params.set("from", req.from);
      if (req.to) params.set("to", req.to);
      const query = params.size ? "?" + params.toString() : "";
      const body = await json<{ snapshot: WorkSnapshot }>(await request("/api/work/snapshot" + query));
      return body.snapshot;
    },
    ...createWorkCrud(request),
    async sendMail(input, connectionId) {
      await json(await request("/api/mail/send", "POST", { ...input, connection_id: connectionId }));
    },
    async archiveMail(id, connectionId) {
      await json(
        await request("/api/mail/email/" + encodeURIComponent(id), "PATCH", { is_archived: 1, connection_id: connectionId }),
      );
    },
    async starMail(id, starred, connectionId) {
      await json(
        await request("/api/mail/email/" + encodeURIComponent(id), "PATCH", {
          is_starred: starred ? 1 : 0,
          connection_id: connectionId,
        }),
      );
    },
  };
}
