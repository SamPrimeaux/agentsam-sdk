import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentPrincipal, AgentWorkbenchAdapter } from '@inneranimalmedia/agentsam-contracts';
import { ConnectedAgentPanel } from '@inneranimalmedia/agentsam-workbench/agent';
import { createCmsAgentContextProvider } from '@inneranimalmedia/agentsam-cms-shared';
import './styles/agentsam-drawer.css';

export type AgentSamDrawerProps = {
  open: boolean;
  onClose: () => void;
  adapter?: AgentWorkbenchAdapter | null;
  principal?: AgentPrincipal | null;
  projectId: string;
  conversationId: string;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  selectionLabel?: string | null;
  pendingPrompt?: string | null;
  onPendingPromptConsumed?: () => void;
};

/**
 * FnF-style AgentSam Side Assistant — docked slide-in chat.
 * Ports fuelnfreetime admin agentsam drawer UX into the CMS editor shell.
 */
export function AgentSamDrawer({
  open,
  onClose,
  adapter,
  principal,
  projectId,
  conversationId,
  route,
  pageId,
  sectionId,
  blockId,
  selectionLabel,
  pendingPrompt,
  onPendingPromptConsumed,
}: AgentSamDrawerProps) {
  const contextProvider = useMemo(() => createCmsAgentContextProvider(() => ({
    principal: principal || {
      accountId: 'demo',
      authUserId: 'demo',
      displayName: 'Demo',
    },
    projectId,
    route,
    pageId,
    sectionId,
    blockId,
  })), [principal, projectId, route, pageId, sectionId, blockId]);

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

        {adapter ? (
          <ConnectedAgentPanel
            className="agentsam-connected"
            adapter={adapter}
            contextProvider={contextProvider}
            conversationId={conversationId}
            header={null}
            empty={<div className="agentsam-empty">Ask about this page, sections, or publish flow. I’ll use the current CMS selection.</div>}
          />
        ) : (
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
      text: 'Ask about this page, store operations, customers, content, or repository work. I’ll route the request using the current CMS context.',
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
        text: `Got it${scope}. In demo mode this drawer mirrors the FnF Side Assistant — bind an AgentSam adapter to run live tools.`,
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
