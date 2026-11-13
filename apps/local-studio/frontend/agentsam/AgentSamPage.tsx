import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, PanelLeft, PanelRight, MessageSquarePlus } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { IconAction } from '@/components/ui/icon-action';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage } from '@/components/workbench/side-stage';
import { WorkSurfaceBar } from '@/components/workbench/work-surface-bar';
import { SidePanelToggle } from './AgentSamShell';
import { AgentSamPetTrigger } from './AgentSamPetTrigger';
import { useActiveCompanion } from './CompanionContext';
import { companionStateAsset } from './companions';
import { SplitHandle } from '@/components/shell/split-handle';
import { AnnotationToggle } from './AnnotationHelper';
import { AgentConversationSurface, AgentRuntimeField } from '@inneranimalmedia/agentsam-workbench/agent';
import { localStudioRuntimeVisuals } from '@/lib/runtime-visuals/local-studio-runtime';
import '@/components/workbench/work-layout.css';

const WORK_PANEL_MIN = 380;
const CHAT_PANEL_MIN = 380;

// Session-local visited-thread history; unlike browser history, these arrows
// never navigate the user out of AgentSam into an unrelated site or route.
const visitedThreads = { ids: [] as string[], index: -1 };
function rememberThread(id: string) {
  if (visitedThreads.ids[visitedThreads.index] === id) return;
  visitedThreads.ids.splice(visitedThreads.index + 1);
  visitedThreads.ids.push(id);
  if (visitedThreads.ids.length > 60) visitedThreads.ids.shift();
  visitedThreads.index = visitedThreads.ids.length - 1;
}


export function AgentSamPage({ conversationId }: { conversationId?: string }) {
  const { data, isMobile } = useNav();
  const navigate = useNavigate();
  const state = useWorkStore();
  const companion = useActiveCompanion();
  const [hostModeSlot, setHostModeSlot] = useState<HTMLElement | null>(null);
  const [hostActionsSlot, setHostActionsSlot] = useState<HTMLElement | null>(null);
  const [hostLeadingSlot, setHostLeadingSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHostModeSlot(document.getElementById('agentsam-console-mode-slot'));
    setHostActionsSlot(document.getElementById('agentsam-console-actions-slot'));
    setHostLeadingSlot(document.getElementById('agentsam-console-leading-slot'));
  }, []);
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
  const [threadHistory, setThreadHistory] = useState({ index: visitedThreads.index, total: visitedThreads.ids.length });
  useEffect(() => {
    if (!chat?.id) return;
    rememberThread(chat.id);
    setThreadHistory({ index: visitedThreads.index, total: visitedThreads.ids.length });
  }, [chat?.id]);
  useEffect(() => { if (!state.sideOpen && workFocused) setWorkFocused(false); }, [state.sideOpen, workFocused]);
  const visitThread = (direction: -1 | 1) => {
    const nextIndex = visitedThreads.index + direction;
    const id = visitedThreads.ids[nextIndex];
    if (!id) return;
    visitedThreads.index = nextIndex;
    setThreadHistory({ index: nextIndex, total: visitedThreads.ids.length });
    void navigate({ to: '/chats/$chatId', params: { chatId: id } });
  };
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
  // One set of controls is portalled into hosted chrome or rendered locally.
  const leadingControls = <div className="agentsam-topbar-leading" role="group" aria-label="Thread and workspace navigation">
    <IconAction label="Previous thread" hint="Previous visited conversation" disabled={threadHistory.index <= 0} onClick={() => visitThread(-1)}><ArrowLeft size={17} /></IconAction>
    <IconAction label="Next thread" hint="Next visited conversation" disabled={threadHistory.index >= threadHistory.total - 1} onClick={() => visitThread(1)}><ArrowRight size={17} /></IconAction>
    {hostLeadingSlot ? <IconAction label="Toggle global navigation" hint="Show or hide sidebar" onClick={() => {
      const trigger = document.querySelector<HTMLButtonElement>('[data-console-nav-toggle]') || document.getElementById('admin-menu-toggle') as HTMLButtonElement | null;
      trigger?.click();
    }}><PanelLeft size={18} /></IconAction> : <Nav.Trigger aria-label="Toggle global navigation" />}
    <IconAction label={state.sideOpen ? 'Close Side Stage tabs' : 'Open Side Stage tabs'} hint="Show or hide Side Stage" onClick={() => {
      state.setSideOpen(!state.sideOpen);
    }}><PanelRight size={18} /></IconAction>
    <IconAction label={workFocused ? 'Exit full view' : 'Enter full view'} hint="Focus Side Stage while keeping the lead composer" onClick={() => {
      if (!workFocused) state.setSideOpen(true);
      setWorkFocused(focused => !focused);
    }}>{workFocused ? <Minimize2 size={18} /> : <Maximize2 size={18} />}</IconAction>
  </div>;
  // Blank chats have no conversation overflow or empty Sources & Outputs panel.
  const headerActions = <div className="agentsam-header-action-pill" role="group" aria-label="Conversation actions">
    {!empty ? <>
      {isMobile ? <AgentSamPetTrigger state={streaming ? 'working' : 'idle'} onActivate={() => window.dispatchEvent(new Event('agentsam:assistant:activate'))} /> : null}
      <IconAction className="agentsam-header-action" label="New chat" hint="New chat (⌘N)" onClick={startNewChat}><MessageSquarePlus size={20} aria-hidden="true" /></IconAction>
      <Nav.ConversationActions />
      <Nav.ShareButton />
      <Nav.PinnedSummary />
    </> : null}
  </div>;
  return <div className="agentsam-page-layout" data-composer-mode={data.mode} data-work-remaster="true" data-work-surface={workSurface}>
    {hostModeSlot ? createPortal(<div className="agentsam-mode-host"><Nav.ModeSwitcher /></div>, hostModeSlot) : null}
    {hostLeadingSlot ? createPortal(leadingControls, hostLeadingSlot) : null}
    {hostActionsSlot ? createPortal(headerActions, hostActionsSlot) : null}
    {!hostModeSlot ? <Nav.Topbar className="agentsam-conversation-topbar">
      {leadingControls}
      {empty ? <div className="agentsam-topbar-mode"><Nav.ModeSwitcher /></div>
        : <span className="agentsam-topbar-thread-title" title={chat.title}>{chat.title}</span>}
      <span className="flex-1" aria-hidden="true" />
      {!hostActionsSlot ? headerActions : null}
    </Nav.Topbar> : null}
    <div className={"agentsam-workspace" + (workFocused ? " is-work-focused" : "")}>
      {hostModeSlot && empty && data.mode !== 'work' ? <div className="agentsam-context-tools" aria-label="Conversation tools"><AnnotationToggle /></div> : null}
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
              </div>
            </div> : <h1>Where should we begin?</h1>}
          </div>}
          composer={workFocused ? null : <Composer targetId={chat.id} targetKind="chat" placeholder={data.mode === 'work' ? 'Work with ' + companion.name : 'Ask ' + companion.name} />}
          composerClassName="agentsam-conversation-dock"
        />
      </section>
      {state.sideOpen || mobileWorkOpen ? <>{!workFocused && !isMobile && <SplitHandle label="Resize Work Panel" onDrag={(delta) => setPanelWidth((width) => Math.max(WORK_PANEL_MIN, Math.min(1500, width - delta, window.innerWidth - CHAT_PANEL_MIN)))} onDoubleClick={() => setPanelWidth(Math.max(480, Math.round(window.innerWidth * 0.54)))} />}<aside className="agentsam-side-panel" style={{ "--agentsam-panel-width": panelWidth + "px" } as CSSProperties} aria-label="Work Panel"><SideStage workFocused={workFocused} onFocusToggle={() => setWorkFocused((value) => !value)} /></aside></> : null}
      {workFocused && <div className="agentsam-focused-lead-composer" aria-label="Lead AgentSam composer">
        <Composer targetId={chat.id} targetKind="chat" placeholder={data.mode === 'work' ? 'Work with ' + companion.name : 'Ask ' + companion.name} />
      </div>}
    </div>
    {!isMobile ? <WorkSurfaceBar /> : null}
  </div>;
}

