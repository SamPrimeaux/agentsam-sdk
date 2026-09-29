import { useEffect, useRef, useState } from 'react';
import './styles/agentsam-drawer.css';

export type AgentSamDrawerProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
  conversationId: string;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  selectionLabel?: string | null;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
  /** Host-provided live AgentSam panel; when omitted, demo shell is shown. */
  children?: React.ReactNode;
};

/**
 * CMS side-assistant chrome. Live AgentSam UI is injected by the host via children.
 * Core package never imports agentsam-workbench.
 */
export function AgentSamDrawer({
  open,
  onClose,
  selectionLabel,
  pendingPrompt,
  onPendingPromptConsumed,
  children,
}: AgentSamDrawerProps) {
  const status = selectionLabel
    ? `Editing “${selectionLabel}”`
    : 'Context-aware admin chat';

  return (
    <aside
      className={`agentsam-dock${open ? ' is-open' : ''}`}
      id="agentsam-dock"
      aria-hidden={open ? 'false' : 'true'}
      data-annotation-control=""
    >
      <div className="agentsam-drawer drawer-mounted" aria-label="AgentSam Side Assistant">
        <header className="agentsam-head">
          <div className="agentsam-brand">
            <div className="agentsam-mark" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <strong>AgentSam Side Assistant</strong>
              <span>{status}</span>
            </div>
          </div>
          <button type="button" className="agentsam-close" onClick={onClose} aria-label="Close AgentSam Side Assistant">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </header>

        {children || (
          <DemoDrawerChat
            selectionLabel={selectionLabel}
            pendingPrompt={pendingPrompt}
            onPendingPromptConsumed={onPendingPromptConsumed}
          />
        )}
      </div>
    </aside>
  );
}

function DemoDrawerChat({
  selectionLabel,
  pendingPrompt,
  onPendingPromptConsumed,
}: {
  selectionLabel?: string | null;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([
    {
      role: 'assistant',
      text: 'Ask about this page or content. Bind a host AgentSam panel to run live tools — this shell is chrome only.',
    },
  ]);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pendingPrompt?.trim()) return;
    void send(pendingPrompt);
    onPendingPromptConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPrompt]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages, busy]);

  async function send(raw: string) {
    const text = raw.trim();
    if (!text || busy) return;
    setBusy(true);
    setValue('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    await new Promise((r) => setTimeout(r, 420));
    const scope = selectionLabel ? ` for “${selectionLabel}”` : '';
    setMessages((prev) => [
      ...prev,
      {
        role: 'assistant',
        text: `Got it${scope}. No AgentSam host is attached — provide CmsAgentHost.renderDrawer from the consumer to enable live tools.`,
      },
    ]);
    setBusy(false);
  }

  return (
    <>
      <div className="agentsam-messages" ref={logRef} role="log" aria-live="polite">
        {messages.map((msg, i) => (
          <div key={`${msg.role}-${i}`} className={`agentsam-msg agentsam-msg--${msg.role}`}>
            {msg.text}
          </div>
        ))}
        {busy && <div className="agentsam-msg agentsam-msg--assistant agentsam-msg--typing">Thinking…</div>}
      </div>
      <form
        className="agentsam-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send(value);
        }}
      >
        <textarea
          rows={2}
          placeholder="Ask anything…"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={busy}
        />
        <button type="submit" className="agentsam-send" disabled={busy || !value.trim()} aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </>
  );
}
