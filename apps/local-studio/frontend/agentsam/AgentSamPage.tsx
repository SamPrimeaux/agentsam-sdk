import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, Search } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage } from '@/components/workbench/side-stage';
import { SidePanelToggle } from './AgentSamShell';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { SplitHandle } from '@/components/shell/split-handle';
import { AnnotationToggle } from './AnnotationHelper';
import { AgentConversationSurface, AgentRuntimeField } from '@inneranimalmedia/agentsam-workbench/agent';
import { localStudioRuntimeVisuals } from '@/lib/runtime-visuals/local-studio-runtime';

export function AgentSamPage({ conversationId }: { conversationId?: string }) {
  const { data, isMobile } = useNav();
  const state = useWorkStore();
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
  if (!trail) return <div className="agentsam-welcome"><h1>Conversation unavailable</h1><button type="button" className="as-nav-button" onClick={data.onCreateConversation}>New chat</button></div>;
  // The donor's welcome placeholder is not a conversation. Keep persisted user messages intact.
  const empty = trail.messages.length === 0 || (trail.messages.length === 1 && trail.messages[0].id === 'welcome-msg');
  const streaming = state.streamingIds.includes(trail.id);
  return <div className="agentsam-page-layout">
    <Nav.Topbar startup={empty} rightSlot={<>
      {conversationId ? <Link to="/chats" aria-label="Back to Chats" title="Back to Chats" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4"/></Link> : null}
      <button type="button" className="as-nav-button" aria-label="Search pages and tools" title="Search pages and tools" onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }))}><Search size={18}/><span className="sr-only">Search Studio</span></button>
      <AgentSamPetTrigger state={streaming ? 'working' : 'idle'} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} />
      <AnnotationToggle /><SidePanelToggle />
    </>} />
    <div className={"agentsam-workspace" + (workFocused ? " is-work-focused" : "")}>
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

