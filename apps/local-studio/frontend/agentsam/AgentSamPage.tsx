import { useEffect, useState, type CSSProperties } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, MessageSquarePlus, Search } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage } from '@/components/workbench/side-stage';
import { SidePanelToggle } from './AgentSamShell';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { NotificationsMenu } from './NotificationsMenu';
import { SplitHandle } from '@/components/shell/split-handle';
import { AnnotationToggle } from './AnnotationHelper';
import { AgentConversationSurface, AgentRuntimeField } from '@inneranimalmedia/agentsam-workbench/agent';
import { localStudioRuntimeVisuals } from '@/lib/runtime-visuals/local-studio-runtime';

function looksLikePersistedModelFailure(content: string) {
  return /Studio model error|unsupported_value|max_tokens|max_completion_tokens|Illegal invocation|cloudflare_network_error/i.test(content);
}

export function AgentSamPage({ conversationId }: { conversationId?: string }) {
  const { data, isMobile } = useNav();
  const navigate = useNavigate();
  const state = useWorkStore();
  const [hostModeSlot, setHostModeSlot] = useState<HTMLElement | null>(null);
  const [resumeFailedTrail, setResumeFailedTrail] = useState(false);
  useEffect(() => { setHostModeSlot(document.getElementById('agentsam-console-mode-slot')); }, []);
  const [workFocused, setWorkFocused] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 780;
    try {
      const saved = Number(window.localStorage.getItem('agentsam.studio.agentPanelWidth'));
      return Number.isFinite(saved) && saved >= 280 && saved <= 1120 ? saved : Math.max(480, Math.min(1060, Math.round(window.innerWidth * 0.54)));
    } catch { return 780; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('agentsam.studio.agentPanelWidth', String(panelWidth)); }
    catch { /* Resizing remains available without localStorage. */ }
  }, [panelWidth]);
  const trail = state.trails.find((item) => item.id === (conversationId ?? state.activeTrailId));
  useEffect(() => { if (conversationId && state.trails.some((item) => item.id === conversationId)) state.setActiveTrail(conversationId); }, [conversationId, state.setActiveTrail, state.trails]);
  useEffect(() => { setResumeFailedTrail(false); }, [conversationId, state.activeTrailId]);

  const startNewChat = () => {
    const id = state.startTrail();
    void navigate({ to: '/chats/$chatId', params: { chatId: id } });
  };

  if (!trail) return <div className="agentsam-welcome"><h1>Conversation unavailable</h1><button type="button" className="as-nav-button" onClick={startNewChat}>New chat</button></div>;

  const lastContent = [...trail.messages].reverse().find((msg) => msg.role !== 'system')?.content || '';
  const failedRestored = !conversationId && !resumeFailedTrail && looksLikePersistedModelFailure(lastContent);
  if (failedRestored) {
    const recent = [...state.trails]
      .filter((item) => item.id !== trail.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 4);
    return <div className="agentsam-welcome" data-agentsam-landing="failed-restore">
      <h1>Pick up where you left off</h1>
      <p className="agentsam-landing-copy">Your last chat ended with a model error and was saved locally. Start fresh, or resume intentionally.</p>
      <div className="agentsam-landing-actions">
        <button type="button" className="as-nav-button agentsam-landing-primary" onClick={startNewChat}>
          <MessageSquarePlus size={16} /> New Chat
        </button>
        <button type="button" className="as-nav-button" onClick={() => setResumeFailedTrail(true)}>
          Resume “{trail.title}”
        </button>
        <Link to="/chats" className="as-nav-button">All chats</Link>
      </div>
      {recent.length ? (
        <ul className="agentsam-landing-recent" aria-label="Recent conversations">
          {recent.map((item) => (
            <li key={item.id}>
              <button type="button" className="as-nav-button" onClick={() => {
                state.setActiveTrail(item.id);
                void navigate({ to: '/chats/$chatId', params: { chatId: item.id } });
              }}>Resume {item.title}</button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>;
  }

  // The donor's welcome placeholder is not a conversation. Keep persisted user messages intact.
  const empty = trail.messages.length === 0 || (trail.messages.length === 1 && trail.messages[0].id === 'welcome-msg');
  const streaming = state.streamingIds.includes(trail.id);
  return <div className="agentsam-page-layout" data-composer-mode={data.mode}>
    {!hostModeSlot ? <Nav.Topbar startup={false} showNavigationTrigger={false} rightSlot={<>
      {conversationId ? <Link to="/chats" aria-label="Back to Chats" title="Back to Chats" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4"/></Link> : null}
      <button type="button" className="as-nav-button" aria-label="New chat" title="New chat (⌘N)" onClick={startNewChat}><MessageSquarePlus size={18}/><span className="sr-only">New chat</span></button>
      <button type="button" className="as-nav-button" aria-label="Search pages and tools" title="Search pages and tools" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}><Search size={18}/><span className="sr-only">Search Studio</span></button>
      <AgentSamPetTrigger state={streaming ? 'working' : 'idle'} avatarUrl={data.account?.avatar} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} />
      <NotificationsMenu />
      <AnnotationToggle /><SidePanelToggle />
    </>} /> : null}
    {empty ? <div className="agentsam-welcome-mode-bar" aria-label="Choose how to begin">
      <Nav.ModeSwitcher />
    </div> : null}
    <div className={"agentsam-workspace" + (workFocused ? " is-work-focused" : "")}>
      {hostModeSlot ? <div className="agentsam-context-tools" aria-label="Conversation tools"><AnnotationToggle /><SidePanelToggle /></div> : null}
      <section className="agentsam-conversation" aria-label="Conversation" inert={(isMobile && state.sideOpen) || workFocused} style={workFocused ? { display:"none" } : undefined}>
        <AgentConversationSurface
          empty={empty}
          runtime={
            <AgentRuntimeField
              controller={localStudioRuntimeVisuals.controllerFor(trail.id)}
              blocking={false}
              passiveOpacity={0.48}
              className="z-[1]"
              narrationStyle={{ bottom: 96 }}
            />
          }
          thread={<MessageList messages={trail.messages} trailId={trail.id} streaming={streaming} />}
          emptyState={<div className="agentsam-welcome-heading"><h1>{data.mode === 'work' ? 'What should we work on?' : 'Where should we begin?'}</h1></div>}
          composer={<Composer targetId={trail.id} targetKind="trail" placeholder={data.mode === 'work' ? 'Work on anything…' : 'Ask anything…'} />}
          composerClassName="agentsam-conversation-dock"
        />
      </section>
      {state.sideOpen ? <>{!workFocused && <SplitHandle label="Resize Work Panel" onDrag={(delta) => setPanelWidth((width) => Math.max(320, Math.min(1500, width - delta, window.innerWidth - 320)))} onDoubleClick={() => setPanelWidth(Math.max(480, Math.round(window.innerWidth * 0.54)))} />}<aside className="agentsam-side-panel" style={{ "--agentsam-panel-width": panelWidth + "px" } as CSSProperties} aria-label="Work Panel"><SideStage workFocused={workFocused} onFocusToggle={() => setWorkFocused((value) => !value)} /></aside></> : null}
    </div>
  </div>;
}

