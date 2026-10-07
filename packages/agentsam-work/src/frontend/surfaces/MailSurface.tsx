import { Archive, Cloud, Inbox, MailPlus, Plus, Search, Send, Settings, Star, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkMailConnection, WorkMailMessage } from "../../contracts/index";

export function MailSurface({
  messages,
  connections = [],
  activeConnectionId,
  onSelectConnection,
  onConnectProvider,
  onDisconnectConnection,
  onOpenConnections,
  onArchive,
  onStar,
  onSend,
}: {
  messages: WorkMailMessage[];
  connections?: WorkMailConnection[];
  activeConnectionId?: string | null;
  onSelectConnection?: (connectionId: string) => void | Promise<void>;
  onConnectProvider?: (provider: string) => void | Promise<void>;
  onDisconnectConnection?: (connectionId: string) => void | Promise<void>;
  onOpenConnections?: () => void | Promise<void>;
  onArchive?: (id: string) => void | Promise<void>;
  onStar?: (id: string, starred: boolean) => void | Promise<void>;
  onSend?: (input: { to: string; subject: string; body: string }) => void | Promise<void>;
}) {
  const [folder, setFolder] = useState<"inbox" | "starred" | "sent" | "archived">("inbox");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(messages[0]?.id || "");
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const visible = useMemo(() => {
    return messages.filter((message) => {
      if (folder === "starred" && !message.starred) return false;
      if (folder === "sent" || folder === "archived") return false;
      const haystack = (message.from + " " + message.subject + " " + message.preview).toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [folder, messages, query]);

  const selected = messages.find((message) => message.id === selectedId) || visible[0];
  const mailboxConnections = connections.filter((item) => item.kind === "mailbox");
  const infrastructureConnections = connections.filter((item) => item.kind === "infrastructure");
  const activeConnection =
    mailboxConnections.find((item) => item.id === activeConnectionId) ||
    (mailboxConnections.length === 1 ? mailboxConnections[0] : undefined);
  const canSend = Boolean(onSend) && activeConnection?.status === "connected";

  async function handleSend() {
    if (!onSend || !composeTo.trim()) return;
    setSending(true);
    setComposeError("");
    try {
      await onSend({ to: composeTo.trim(), subject: composeSubject, body: composeBody });
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setComposeOpen(false);
    } catch (error) {
      setComposeError(error instanceof Error ? error.message : "mail_send_failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ position: "relative", height: "100%", display: "grid", gridTemplateColumns: "190px minmax(280px, 0.9fr) minmax(340px, 1.1fr)", minWidth: 880 }}>
      <aside style={{ borderRight: "1px solid var(--agentsam-work-border)", background: "var(--agentsam-work-panel-subtle)", padding: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 38px", gap: 8 }}>
          <button
            type="button"
            className="agentsam-work-toolbar-button"
            data-primary="true"
            onClick={() => setComposeOpen(true)}
            disabled={!canSend}
            title={canSend ? "Compose message" : "Select or connect a mailbox to send mail"}
            style={{ width: "100%" }}
          >
            <MailPlus size={15} />
            Compose
          </button>
          <button
            type="button"
            className="agentsam-work-toolbar-button"
            aria-label="Mail connections"
            title="Connections"
            data-active={connectionsOpen ? "true" : undefined}
            onClick={() => setConnectionsOpen((value) => !value)}
            style={{ paddingInline: 0 }}
          >
            <Settings size={15} />
          </button>
        </div>

        <div style={{ marginTop: 14, paddingBottom: 10, borderBottom: "1px solid var(--agentsam-work-border)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--agentsam-work-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>
              Accounts
            </span>
            <button
              type="button"
              aria-label="Connect another mailbox"
              title="Connect another Gmail account"
              onClick={() => void onConnectProvider?.("google_gmail")}
              style={{ display: "grid", width: 24, height: 24, placeItems: "center", border: 0, borderRadius: 6, background: "transparent", color: "var(--agentsam-work-muted)", cursor: "pointer" }}
            >
              <Plus size={14} />
            </button>
          </div>
          {mailboxConnections.length ? (
            <div style={{ display: "grid", gap: 3 }}>
              {mailboxConnections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.accountLabel || item.label}
                  onClick={() => void onSelectConnection?.(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    minHeight: 30,
                    padding: "0 8px",
                    border: 0,
                    borderRadius: 8,
                    background: item.id === activeConnection?.id ? "var(--agentsam-work-nav-active)" : "transparent",
                    color: item.id === activeConnection?.id ? "var(--agentsam-work-accent)" : "var(--agentsam-work-text)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <span style={{ width: 6, height: 6, flex: "0 0 auto", borderRadius: "50%", background: item.status === "connected" ? "var(--agentsam-work-accent)" : "var(--agentsam-work-muted)" }} />
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 10.5 }}>
                    {item.label} · {item.accountLabel || "Account"}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void onConnectProvider?.("google_gmail")}
              style={{ width: "100%", minHeight: 32, border: "1px dashed var(--agentsam-work-border)", borderRadius: 8, background: "transparent", color: "var(--agentsam-work-muted)", cursor: "pointer", fontSize: 10.5 }}
            >
              Connect a mailbox
            </button>
          )}
        </div>

        <div style={{ display: "grid", gap: 4, marginTop: 10 }}>
          {([
            ["inbox", "Inbox", Inbox],
            ["starred", "Starred", Star],
            ["sent", "Sent", Send],
            ["archived", "Archived", Archive],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={String(id)}
              type="button"
              onClick={() => setFolder(id as typeof folder)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                minHeight: 38,
                padding: "0 10px",
                border: 0,
                borderRadius: 19,
                background: folder === id ? "var(--agentsam-work-nav-active)" : "transparent",
                color: folder === id ? "var(--agentsam-work-accent)" : "var(--agentsam-work-text)",
                cursor: "pointer",
                textAlign: "left",
              }}
            >
              <Icon size={16} />
              <span style={{ fontSize: 12 }}>{label}</span>
            </button>
          ))}
        </div>
      </aside>

      <section style={{ minWidth: 0, borderRight: "1px solid var(--agentsam-work-border)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--agentsam-work-border)" }}>
          <label className="agentsam-work-search">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search mail" />
          </label>
        </div>
        <div style={{ minHeight: 0, flex: 1, overflowY: "auto" }}>
          {visible.map((message) => (
            <button
              key={message.id}
              type="button"
              onClick={() => setSelectedId(message.id)}
              style={{
                width: "100%",
                display: "block",
                padding: 14,
                border: 0,
                borderBottom: "1px solid var(--agentsam-work-border)",
                background: selected?.id === message.id ? "var(--agentsam-work-accent-soft)" : message.unread ? "color-mix(in srgb, var(--agentsam-work-accent-soft) 38%, var(--agentsam-work-panel))" : "var(--agentsam-work-panel)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", fontSize: 11 }}>{message.from}</strong>
                <span style={{ color: "var(--agentsam-work-muted)", fontSize: 9 }}>{message.receivedLabel}</span>
              </div>
              <div style={{ marginTop: 5, fontSize: 11, fontWeight: message.unread ? 700 : 500 }}>{message.subject}</div>
              <div style={{ marginTop: 5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--agentsam-work-muted)", fontSize: 10 }}>
                {message.preview}
              </div>
            </button>
          ))}
        </div>
      </section>

      <main style={{ minWidth: 0, overflowY: "auto", padding: 20 }}>
        {selected ? (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>{selected.subject}</h2>
                <div style={{ marginTop: 8, color: "var(--agentsam-work-muted)", fontSize: 10 }}>
                  From {selected.from} · To {selected.to}
                </div>
              </div>
              <button
                className="agentsam-work-toolbar-button"
                type="button"
                aria-label={selected.starred ? "Unstar message" : "Star message"}
                onClick={() => void onStar?.(selected.id, !selected.starred)}
                disabled={!onStar}
              >
                <Star size={14} />
              </button>
              <button
                className="agentsam-work-toolbar-button"
                type="button"
                aria-label="Archive message"
                onClick={() => void onArchive?.(selected.id)}
                disabled={!onArchive}
              >
                <Archive size={14} />
              </button>
            </div>
            <div style={{ marginTop: 22, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {selected.body || selected.preview}
            </div>
          </>
        ) : (
          <div className="agentsam-work-empty">Select a message</div>
        )}
      </main>

      {connectionsOpen ? (
        <div
          role="dialog"
          aria-label="Connections"
          style={{
            position: "absolute",
            top: 12,
            left: 198,
            zIndex: 55,
            width: 340,
            maxHeight: "calc(100% - 24px)",
            overflowY: "auto",
            border: "1px solid var(--agentsam-work-border)",
            borderRadius: 12,
            background: "var(--agentsam-work-panel)",
            boxShadow: "0 16px 44px rgb(0 0 0 / 24%)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: "1px solid var(--agentsam-work-border)" }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 650 }}>Connections</div>
              <div style={{ marginTop: 2, fontSize: 10, color: "var(--agentsam-work-muted)" }}>Mailboxes and mail infrastructure</div>
            </div>
            <button
              type="button"
              aria-label="Close connections"
              onClick={() => setConnectionsOpen(false)}
              style={{ display: "grid", width: 28, height: 28, placeItems: "center", border: 0, borderRadius: 7, background: "transparent", cursor: "pointer" }}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 650, color: "var(--agentsam-work-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Mailboxes</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {mailboxConnections.map((item) => (
                <div key={item.id} className="agentsam-work-card" style={{ padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Inbox size={15} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ marginTop: 2, fontSize: 10, color: "var(--agentsam-work-muted)", overflowWrap: "anywhere" }}>
                        {item.accountLabel || item.status}
                      </div>
                    </div>
                    {item.id === activeConnection?.id ? <span style={{ fontSize: 9.5, color: "var(--agentsam-work-accent)" }}>Active</span> : null}
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 9 }}>
                    {item.id !== activeConnection?.id ? (
                      <button type="button" className="agentsam-work-toolbar-button" onClick={() => void onSelectConnection?.(item.id)}>Use</button>
                    ) : null}
                    {onDisconnectConnection ? (
                      <button type="button" className="agentsam-work-toolbar-button" onClick={() => void onDisconnectConnection(item.id)}>Disconnect</button>
                    ) : null}
                  </div>
                </div>
              ))}
              <button type="button" className="agentsam-work-toolbar-button" onClick={() => void onConnectProvider?.("google_gmail")}>
                <Plus size={14} /> Connect another Gmail account
              </button>
            </div>

            <div style={{ marginTop: 16, fontSize: 10, fontWeight: 650, color: "var(--agentsam-work-muted)", textTransform: "uppercase", letterSpacing: ".04em" }}>Mail infrastructure</div>
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              {infrastructureConnections.map((item) => (
                <div key={item.id} className="agentsam-work-card" style={{ padding: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Cloud size={15} />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600 }}>{item.label}</div>
                      <div style={{ marginTop: 2, fontSize: 10, color: "var(--agentsam-work-muted)" }}>
                        {item.accountLabel || item.description || item.status}
                      </div>
                    </div>
                    <span style={{ fontSize: 9.5, color: item.status === "connected" ? "var(--agentsam-work-success)" : "var(--agentsam-work-warning)" }}>
                      {item.status === "connected" ? "Connected" : item.status === "needs_scope" ? "Needs access" : "Available"}
                    </span>
                  </div>
                  {item.capabilities?.length ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
                      {item.capabilities.map((capability) => (
                        <span key={capability} style={{ padding: "2px 6px", borderRadius: 999, background: "var(--agentsam-work-panel-subtle)", color: "var(--agentsam-work-muted)", fontSize: 9 }}>
                          {capability}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    className="agentsam-work-toolbar-button"
                    onClick={() => void onConnectProvider?.(item.provider)}
                    style={{ marginTop: 9 }}
                  >
                    {item.status === "connected" ? "Review permissions" : item.status === "needs_scope" ? "Enable email access" : "Connect"}
                  </button>
                </div>
              ))}
            </div>

            {onOpenConnections ? (
              <button
                type="button"
                className="agentsam-work-toolbar-button"
                onClick={() => void onOpenConnections()}
                style={{ width: "100%", marginTop: 14 }}
              >
                <Settings size={14} /> All integrations
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {composeOpen ? (
        <div
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 60,
            width: "min(520px, calc(100vw - 48px))",
            border: "1px solid var(--agentsam-work-border)",
            borderRadius: 14,
            background: "var(--agentsam-work-panel)",
            boxShadow: "0 16px 50px rgb(0 0 0 / 20%)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "10px 14px", background: "var(--agentsam-work-panel-subtle)", fontSize: 12, fontWeight: 600 }}>New message</div>
          <div style={{ display: "grid", gap: 10, padding: 14 }}>
            <input value={composeTo} onChange={(event) => setComposeTo(event.target.value)} placeholder="To" style={{ border: "0", borderBottom: "1px solid var(--agentsam-work-border)", padding: 8, outline: 0 }} />
            <input value={composeSubject} onChange={(event) => setComposeSubject(event.target.value)} placeholder="Subject" style={{ border: "0", borderBottom: "1px solid var(--agentsam-work-border)", padding: 8, outline: 0 }} />
            <textarea value={composeBody} onChange={(event) => setComposeBody(event.target.value)} placeholder="Write a message…" rows={8} style={{ resize: "vertical", border: "0", outline: 0 }} />
            {composeError ? <div style={{ color: "var(--agentsam-work-danger)", fontSize: 11 }}>{composeError}</div> : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="agentsam-work-toolbar-button" onClick={() => setComposeOpen(false)} disabled={sending}>Cancel</button>
              <button type="button" className="agentsam-work-toolbar-button" data-primary="true" onClick={() => void handleSend()} disabled={sending || !composeTo.trim()}>
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
