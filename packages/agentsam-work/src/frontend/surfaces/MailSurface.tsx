import { Archive, Inbox, MailPlus, Search, Send, Star } from "lucide-react";
import { useMemo, useState } from "react";
import type { WorkMailMessage } from "../../contracts/index";

export function MailSurface({ messages }: { messages: WorkMailMessage[] }) {
  const [folder, setFolder] = useState<"inbox" | "starred" | "sent" | "archived">("inbox");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(messages[0]?.id || "");
  const [composeOpen, setComposeOpen] = useState(false);

  const visible = useMemo(() => {
    return messages.filter((message) => {
      if (folder === "starred" && !message.starred) return false;
      const haystack = (message.from + " " + message.subject + " " + message.preview).toLowerCase();
      return haystack.includes(query.toLowerCase());
    });
  }, [folder, messages, query]);

  const selected = messages.find((message) => message.id === selectedId) || visible[0];

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "190px minmax(280px, 0.9fr) minmax(340px, 1.1fr)", minWidth: 880 }}>
      <aside style={{ borderRight: "1px solid var(--agentsam-work-border)", background: "var(--agentsam-work-panel-subtle)", padding: 12 }}>
        <button
          type="button"
          className="agentsam-work-toolbar-button"
          data-primary="true"
          onClick={() => setComposeOpen(true)}
          style={{ width: "100%" }}
        >
          <MailPlus size={15} />
          Compose
        </button>
        <div style={{ display: "grid", gap: 4, marginTop: 14 }}>
          {[
            ["inbox", "Inbox", Inbox],
            ["starred", "Starred", Star],
            ["sent", "Sent", Send],
            ["archived", "Archived", Archive],
          ].map(([id, label, Icon]) => (
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
                background: selected?.id === message.id ? "var(--agentsam-work-accent-soft)" : message.unread ? "color-mix(in srgb, var(--agentsam-work-accent-soft) 38%, white)" : "var(--agentsam-work-panel)",
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
              <button className="agentsam-work-toolbar-button" type="button"><Star size={14} /></button>
              <button className="agentsam-work-toolbar-button" type="button"><Archive size={14} /></button>
            </div>
            <div style={{ marginTop: 22, fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {selected.body || selected.preview}
            </div>
          </>
        ) : (
          <div className="agentsam-work-empty">Select a message</div>
        )}
      </main>

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
            <input placeholder="To" style={{ border: "0", borderBottom: "1px solid var(--agentsam-work-border)", padding: 8, outline: 0 }} />
            <input placeholder="Subject" style={{ border: "0", borderBottom: "1px solid var(--agentsam-work-border)", padding: 8, outline: 0 }} />
            <textarea placeholder="Write a message…" rows={8} style={{ resize: "vertical", border: "0", outline: 0 }} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="agentsam-work-toolbar-button" onClick={() => setComposeOpen(false)}>Cancel</button>
              <button type="button" className="agentsam-work-toolbar-button" data-primary="true" onClick={() => setComposeOpen(false)}>Send</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
