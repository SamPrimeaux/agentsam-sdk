import type {
  WorkHost,
  WorkSnapshot,
  WorkTicket,
} from "../contracts/index";

async function json<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((body as { error?: string }).error || `HTTP ${response.status}`);
  }
  return body as T;
}

export function createHttpWorkHost(base = ""): WorkHost {
  const root = base.replace(/\/$/, "");
  return {
    async snapshot(request = {}): Promise<WorkSnapshot> {
      const params = new URLSearchParams();
      if (request.surface) params.set("surface", request.surface);
      if (request.mailConnectionId) params.set("mail_connection", request.mailConnectionId);
      const query = params.size ? "?" + params.toString() : "";
      const response = await fetch(root + "/api/work/snapshot" + query, {
        credentials: "same-origin",
        cache: "no-store",
      });
      const body = await json<{ snapshot: WorkSnapshot }>(response);
      return body.snapshot;
    },
    async createTicket(input) {
      const response = await fetch(`${root}/api/tickets`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await json<{ ticket: WorkTicket }>(response);
      return body.ticket;
    },
    async updateTicket(id, patch) {
      const response = await fetch(`${root}/api/tickets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await json<{ ticket: WorkTicket }>(response);
      return body.ticket;
    },
    async sendMail(input, connectionId) {
      await json(
        await fetch(root + "/api/mail/send", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...input, connection_id: connectionId }),
        }),
      );
    },
    async archiveMail(id, connectionId) {
      await json(
        await fetch(root + "/api/mail/email/" + encodeURIComponent(id), {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ is_archived: 1, connection_id: connectionId }),
        }),
      );
    },
    async starMail(id, starred, connectionId) {
      await json(
        await fetch(root + "/api/mail/email/" + encodeURIComponent(id), {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ is_starred: starred ? 1 : 0, connection_id: connectionId }),
        }),
      );
    },
  };
}
