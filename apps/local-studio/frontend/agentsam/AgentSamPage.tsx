import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, MessageSquarePlus } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage } from '@/components/workbench/side-stage';
import { WorkSurfaceBar } from '@/components/workbench/work-surface-bar';
import { SidePanelToggle } from './AgentSamShell';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { useActiveCompanion } from './CompanionContext';
import { companionStateAsset } from './companions';
import { NotificationsMenu } from './NotificationsMenu';
import { SplitHandle } from '@/components/shell/split-handle';
import { AnnotationToggle } from './AnnotationHelper';
import { AgentConversationSurface, AgentRuntimeField } from '@inneranimalmedia/agentsam-workbench/agent';
import { localStudioRuntimeVisuals } from '@/lib/runtime-visuals/local-studio-runtime';
import '@/components/workbench/work-layout.css';

const WORK_PANEL_MIN = 380;
const CHAT_PANEL_MIN = 380;

export function AgentSamPage({ conversationId }: { conversationId?: string }) {
  const { data, isMobile } = useNav();
  const navigate = useNavigate();
  const state = useWorkStore();
  const companion = useActiveCompanion();
  const [hostModeSlot, setHostModeSlot] = useState<HTMLElement | null>(null);
  useEffect(() => { setHostModeSlot(document.getElementById('agentsam-console-mode-slot')); }, []);
  const [workFocused, setWorkFocused] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    if (typeof window === 'undefined') return 780;
    try {
      const saved = Number(window.localStorage.getItem('agentsam.studio.agentPanelWidth'));
      return Number.isFinite(saved) && saved >= WORK_PANEL_MIN && saved <= 1120 ? saved : Math.max(480, Math.min(1060, Math.round(window.innerWidth * 0.54)));
    } catch { return 780; }
  });
  useEffect(() => {
    try { window.localStorage.setItem('agentsam.studio.agentPanelWidth', String(panelWidth)); }
    catch { /* Resizing remains available without localStorage. */ }
  }, [panelWidth]);
  const chat = state.chats.find((item) => item.id === (conversationId ?? state.activeChatId));
  useEffect(() => { if (conversationId && state.chats.some((item) => item.id === conversationId)) state.setActiveChat(conversationId); }, [conversationId, state.setActiveChat, state.chats]);

  const startNewChat = () => {
    const id = state.startChat();
    void navigate({ to: '/chats/$chatId', params: { chatId: id } });
  };

  if (!chat) return <div className="agentsam-welcome"><h1>Conversation unavailable</h1><button type="button" className="as-nav-button" onClick={startNewChat}>New chat</button></div>;

  // Failed model responses stay inside the conversation transcript — never replace the product.
  const empty = chat.messages.length === 0 || (chat.messages.length === 1 && chat.messages[0].id === 'welcome-msg');
  const streaming = state.streamingIds.includes(chat.id);
  const companionArt = companionStateAsset(companion, streaming ? 'working' : 'idle');
  const workSurface = state.workSurface;
  const mobileWorkOpen = isMobile && workSurface !== 'chat';
  return <div className="agentsam-page-layout" data-composer-mode={data.mode} data-work-remaster="true" data-work-surface={workSurface}>
    {hostModeSlot ? createPortal(<div className="agentsam-mode-host"><Nav.ModeSwitcher /></div>, hostModeSlot) : null}
    {!hostModeSlot ? <Nav.Topbar startup={false} showNavigationTrigger rightSlot={data.mode === 'work' ? undefined : <>
      {conversationId ? <Link to="/chats" aria-label="Back to Chats" title="Back to Chats" className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><ArrowLeft className="size-4"/></Link> : null}
      <button type="button" className="as-nav-button" aria-label="New chat" title="New chat (⌘N)" onClick={startNewChat}><MessageSquarePlus size={18}/><span className="sr-only">New chat</span></button>
      <AgentSamPetTrigger state={streaming ? 'working' : 'idle'} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} />
      <NotificationsMenu />
      <AnnotationToggle /><SidePanelToggle />
    </>} /> : null}
    {empty && !hostModeSlot ? <div className="agentsam-welcome-mode-bar" aria-label="Choose how to begin">
      <Nav.ModeSwitcher />
    </div> : null}
    <div className={"agentsam-workspace" + (workFocused ? " is-work-focused" : "")}>
      {hostModeSlot && data.mode !== 'work' ? <div className="agentsam-context-tools" aria-label="Conversation tools"><AnnotationToggle /><SidePanelToggle /></div> : null}
      <section className="agentsam-conversation" aria-label="Conversation" inert={mobileWorkOpen || (isMobile && state.sideOpen) || workFocused} style={workFocused || mobileWorkOpen ? { display:"none" } : undefined}>
        <AgentConversationSurface
          empty={empty}
          runtime={
            <AgentRuntimeField
              controller={localStudioRuntimeVisuals.controllerFor(chat.id)}
              blocking={false}
              passiveOpacity={0.48}
              className="z-[1]"
              narrationStyle={{ bottom: 96 }}
            />
          }
          thread={<MessageList messages={chat.messages} chatId={chat.id} streaming={streaming} readingMode={data.mode === 'work'} />}
          emptyState={<div className="agentsam-welcome-heading">
            {data.mode === 'work' ? <div className="agentsam-work-welcome" data-companion-id={companion.id}>
              <div className="agentsam-work-welcome-art" aria-hidden="true">
                {companionArt ? <img src={companionArt} alt="" draggable={false} /> :
                  <span>{companion.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="agentsam-work-welcome-copy">
                <h1>What should we work on?</h1>
                <p className="agentsam-work-welcome-prompt">{companion.id === 'geaux' ? 'Geaux is ready to GEAUX!' : `${companion.name} is ready to work.`}</p>
              </div>
            </div> : <h1>Where should we begin?</h1>}
          </div>}
          composer={<Composer targetId={chat.id} targetKind="chat" placeholder={data.mode === 'work' ? 'Work with ' + companion.name : 'Ask ' + companion.name} />}
          composerClassName="agentsam-conversation-dock"
        />
      </section>
      {state.sideOpen || mobileWorkOpen ? <>{!workFocused && !isMobile && <SplitHandle label="Resize Work Panel" onDrag={(delta) => setPanelWidth((width) => Math.max(WORK_PANEL_MIN, Math.min(1500, width - delta, window.innerWidth - CHAT_PANEL_MIN)))} onDoubleClick={() => setPanelWidth(Math.max(480, Math.round(window.innerWidth * 0.54)))} />}<aside className="agentsam-side-panel" style={{ "--agentsam-panel-width": panelWidth + "px" } as CSSProperties} aria-label="Work Panel"><SideStage workFocused={workFocused} onFocusToggle={() => setWorkFocused((value) => !value)} /></aside></> : null}
    </div>
    <WorkSurfaceBar />
  </div>;
}

