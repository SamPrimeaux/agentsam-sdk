import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, MessageSquare, Plus, RefreshCw, Unlink } from "lucide-react";
import type { WorkHost, WorkNavigate, WorkProjectChat } from "../contracts/index";
import { formatDate } from "./shared";

/**
 * Project-linked conversations from the Local Studio host.
 * No IAM or HTTP assumptions; a conversation retains its original local
 * workspace and stable ID when assigned to a Work project.
 */
export function ProjectChatsPanel({
  projectId,
  host,
  onNavigate,
}: {
  projectId: string;
  host: Pick<WorkHost, "listProjectChats" | "listAssignableChats" | "assignProjectChat" | "createProjectChat">;
  onNavigate: WorkNavigate;
}) {
  const [chats, setChats] = useState<WorkProjectChat[]>([]);
  const [available, setAvailable] = useState<(WorkProjectChat & { workProjectId?: string })[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((previous) => previous + 1), []);

  useEffect(() => {
    if (!host.listProjectChats) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([host.listProjectChats(projectId), host.listAssignableChats?.() ?? []])
      .then(([linked, candidates]) => {
        if (cancelled) return;
        setChats(linked);
        setAvailable(candidates);
      })
      .catch((failure) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : "Chats unavailable");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [host.listProjectChats, host.listAssignableChats, projectId, revision]);

  async function assign(chatId: string, nextProjectId: string | null) {
    if (!host.assignProjectChat || busy) return;
    setBusy(true);
    setError(null);
    try {
      await host.assignProjectChat(chatId, nextProjectId);
      if (chatId === selectedId) setSelectedId("");
      refresh();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not assign chat");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    if (!host.createProjectChat || busy) return;
    setBusy(true);
    setError(null);
    try {
      const id = await host.createProjectChat(projectId);
      onNavigate("/chats/" + encodeURIComponent(id));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not create chat");
    } finally {
      setBusy(false);
    }
  }

  const selectable = available.filter((chat) => !chats.some((linked) => linked.id === chat.id));
  const selected = selectable.find((chat) => chat.id === selectedId);

  return (
    <section className="aw-project-chats" aria-label="Local Studio project chats">
      <header className="aw-project-chats__header">
        <div>
          <span className="aw-project-eyebrow">LOCAL STUDIO</span>
          <h2>Project chats</h2>
          <p>Conversations from this Studio. Assignment organizes the chat without moving its messages or files.</p>
        </div>
        <div className="aw-project-chats__actions">
          <button type="button" className="aw-btn" onClick={refresh} disabled={loading || busy} aria-label="Refresh project chats"><RefreshCw size={14}/> Refresh</button>
          {host.createProjectChat ? <button type="button" className="aw-btn aw-btn--primary" onClick={() => void create()} disabled={busy}><Plus size={14}/> New chat</button> : null}
        </div>
      </header>

      {host.assignProjectChat && host.listAssignableChats ? (
        <div className="aw-project-chats__assign">
          <label htmlFor="aw-assign-project-chat">Assign an existing conversation</label>
          <div>
            <select id="aw-assign-project-chat" className="aw-select" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={loading || busy}>
              <option value="">Choose a Studio chat…</option>
              {selectable.map((chat) => <option value={chat.id} key={chat.id}>{chat.title}{chat.workProjectId ? " (assigned elsewhere)" : ""}</option>)}
            </select>
            <button type="button" className="aw-btn aw-btn--primary" disabled={!selectedId || busy} onClick={() => void assign(selectedId, projectId)}>
              {selected?.workProjectId ? "Move here" : "Assign"}
            </button>
          </div>
          {selected?.workProjectId ? <p>Moving changes this chat's Work-project association. Its original Studio workspace remains unchanged.</p> : null}
        </div>
      ) : null}

      {error ? <div className="aw-error" role="alert">{error}</div> : null}
      {loading ? <p className="aw-ticket-table__empty">Loading local conversations…</p> : chats.length ? (
        <div className="aw-project-chats__list">
          {chats.map((chat) => <div key={chat.id} className="aw-project-chats__item">
            <span className="aw-project-chats__mark"><MessageSquare size={17}/></span>
            <button type="button" className="aw-project-chats__text" onClick={() => onNavigate("/chats/" + encodeURIComponent(chat.id))}>
              <strong>{chat.title}</strong>
              <small>{chat.messageCount} messages · {chat.updatedAt ? formatDate(new Date(chat.updatedAt).toISOString()) : "No date"}</small>
            </button>
            <button type="button" className="aw-project-chats__unlink" aria-label={"Remove " + chat.title + " from this project"} disabled={busy} onClick={() => void assign(chat.id, null)}><Unlink size={15}/></button>
            <button type="button" className="aw-project-chats__open" aria-label={"Open " + chat.title} onClick={() => onNavigate("/chats/" + encodeURIComponent(chat.id))}><ArrowUpRight size={17}/></button>
          </div>)}
        </div>
      ) : <p className="aw-ticket-table__empty">No chats assigned yet. Choose an existing Studio conversation or create one for this project.</p>}
    </section>
  );
}
