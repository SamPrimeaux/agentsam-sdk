import React, { useCallback, useState } from 'react';

export const IAM_AGENT_CHAT_NEW_THREAD = 'iam:agent-chat:new-thread';
export const IAM_AGENT_ENSURE_PANEL = 'iam:agent:ensure-panel';

export type CmsGuidedChatHeroProps = {
  siteSlug?: string | null;
  siteName?: string | null;
  onSend?: (message: string) => void;
};

export function CmsGuidedChatHero({ siteSlug, siteName, onSend }: CmsGuidedChatHeroProps) {
  const [draft, setDraft] = useState('');

  const placeholder = siteSlug
    ? `What would you like to manage on ${siteName || siteSlug} today?`
    : 'What would you like to manage in your CMS today?';

  const openAgentRail = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(IAM_AGENT_ENSURE_PANEL));
    }
  }, []);

  const sendToAgent = useCallback(
    (message: string) => {
      if (onSend) {
        onSend(message);
        return;
      }
      openAgentRail();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(IAM_AGENT_CHAT_NEW_THREAD, {
            detail: {
              message,
              ensureAgentPanel: false,
              project_slug: siteSlug || undefined,
              surface: 'cms',
            },
          }),
        );
      }
    },
    [onSend, openAgentRail, siteSlug],
  );

  const onSubmit = useCallback(() => {
    const message = draft.trim();
    if (!message) {
      openAgentRail();
      return;
    }
    sendToAgent(message);
    setDraft('');
  }, [draft, openAgentRail, sendToAgent]);

  return (
    <section className="iam-cms-guided-hero" aria-label="CMS guided chat">
      <div className="iam-cms-guided-hero__copy">
        <p className="iam-cms-guided-hero__kicker">AgentSam · CMS</p>
        <h1 className="iam-cms-guided-hero__title">One goal. Infinite possibilities.</h1>
        <p className="iam-cms-guided-hero__sub">Describe your goal. AgentSam handles the rest.</p>
      </div>

      <div className="iam-cms-guided-hero__compose">
        <div className="iam-cms-guided-hero__compose-meta">
          <span className="iam-cms-guided-hero__agent-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z" />
            </svg>
            Agent Sam
          </span>
          <span className="iam-cms-guided-hero__mode-pill">Auto</span>
        </div>
        <div className="iam-cms-guided-hero__compose-row">
          <input
            className="iam-cms-guided-hero__input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            onFocus={openAgentRail}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="iam-cms-guided-hero__tools">
            <button type="button" className="iam-cms-guided-hero__icon-btn" aria-label="Voice input" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
            <button type="button" className="iam-cms-guided-hero__icon-btn" aria-label="Attach" disabled>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <button
              type="button"
              className="iam-cms-guided-hero__send"
              aria-label="Send to Agent Sam"
              disabled={!draft.trim()}
              onClick={onSubmit}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" x2="12" y1="19" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
