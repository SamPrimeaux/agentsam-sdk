/** One authenticated, account-owned session identity across the SDK and IAM. */
export type AccountChat = {
  id: string;
  title: string;
  projectId: string | null;
  workspaceId: string | null;
  pinned: boolean;
  updatedAt: number; // Unix seconds from D1
  createdAt: number;
  messageCount: number;
  artifactCount: number;
  lastTurnStatus: string | null;
  state: "active" | "archived" | "trashed";
  kind: "chat" | "side_chat" | "subagent";
  origin: "studio" | "account";
};
export type AccountChatsPage = { chats: AccountChat[]; hasMore: boolean; nextOffset: number };

async function parse<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(response.status === 401 ? "Sign in to load your chats." : "We couldn't finish that. Please try again.");
  return response.json() as Promise<T>;
}
export function listAccountChats(options: {
  q?: string; status?: string; kind?: string; sort?: string; since?: number;
  limit?: number; offset?: number;
} = {}, signal?: AbortSignal): Promise<AccountChatsPage> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) if (value !== undefined && value !== "") query.set(key, String(value));
  return fetch("/api/studio/chats?" + query, { credentials: "same-origin", signal }).then(parse<AccountChatsPage>);
}
export function patchAccountChat(id: string, changes: Partial<Pick<AccountChat, "title" | "pinned" | "state" | "projectId">>) {
  return fetch("/api/studio/chats/" + encodeURIComponent(id), {
    method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
    body: JSON.stringify(changes),
  }).then(parse<{ok:boolean}>);
}
export function trashAccountChat(id: string) {
  return fetch("/api/studio/chats/" + encodeURIComponent(id), {
    method: "DELETE", credentials: "same-origin",
  }).then(parse<{ok:boolean}>);
}
export type AccountChatMessage = { id?: string; role?: string; content?: string; ts?: string; createdAt?: number; status?: string };
export function loadAccountMessages(id: string, signal?: AbortSignal) {
  return fetch("/api/studio/chats/" + encodeURIComponent(id) + "/messages", {
    credentials: "same-origin", signal,
  }).then(parse<{messages:AccountChatMessage[];source:string;recoverable?:boolean}>);
}
