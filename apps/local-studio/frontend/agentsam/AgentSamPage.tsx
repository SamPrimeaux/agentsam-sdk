import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, BookOpen, Bot, Compass, Files, GripVertical, Maximize2, Minimize2, Minus, MousePointer2, PanelRightClose, PanelRightOpen, Plus, Plug, Search, SquarePen, Paperclip, X } from 'lucide-react';
import { Nav, useNav, type NavAction } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { IconAction } from '@/components/ui/icon-action';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage, MobileStageActions } from '@/components/workbench/side-stage';
import { WorkProjectSelect } from '@/components/workbench/work-project-select';

import { useActiveCompanion, useCompanionSettings } from './CompanionContext';
import { companionStateAsset } from './companions';
import { emitCompanionHandoff } from './companion-events';
import { SplitHandle } from '@/components/shell/split-handle';
import { AgentConversationSurface } from '@inneranimalmedia/agentsam-workbench/agent';
import '@/components/workbench/work-layout.css';

const WORK_PANEL_MIN = 380;
const CHAT_PANEL_MIN = 380;

// Session-local visited-thread history; unlike browser history, these arrows
// never navigate the user out of AgentSam into an unrelated site or route.
const visitedThreads = { accountId: '' as string, ids: [] as string[], index: -1 };
function rememberThread(id: string, accountId: string) {
  if (visitedThreads.accountId !== accountId) {
    visitedThreads.accountId = accountId;
    visitedThreads.ids = [];
    visitedThreads.index = -1;
  }
  if (visitedThreads.ids[visitedThreads.index] === id) return;
  visitedThreads.ids.splice(visitedThreads.index + 1);
  visitedThreads.ids.push(id);
  if (visitedThreads.ids.length > 60) visitedThreads.ids.shift();
  visitedThreads.index = visitedThreads.ids.length - 1;
}


export function AgentSamPage({ conversationId }: { conversationId?: string }) {
  const { data, isMobile } = useNav();
  const [compactWorkLayout, setCompactWorkLayout] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1099px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1099px)');
    const sync = () => setCompactWorkLayout(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  const navigate = useNavigate();
  const state = useWorkStore();
  const companion = useActiveCompanion();
  const { settings: companionSettings, loading: companionSettingsLoading } = useCompanionSettings();
  const previousMode = useRef(data.mode);
  useEffect(() => {
    const fromMode = previousMode.current;
    previousMode.current = data.mode;
    if (fromMode === 'chat' && data.mode === 'work' && companion.id === 'geaux') {
      emitCompanionHandoff({ fromId: 'geaux', toId: 'bella', context: 'strategy-to-execution', message: 'Geaux sets the direction. Bella is ready to carry the next step.' });
    }
  }, [data.mode, companion.id]);
  const [hostModeSlot, setHostModeSlot] = useState<HTMLElement | null>(null);
  const [hostActionsSlot, setHostActionsSlot] = useState<HTMLElement | null>(null);
  const [hostLeadingSlot, setHostLeadingSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHostModeSlot(document.getElementById('agentsam-console-mode-slot'));
    setHostActionsSlot(document.getElementById('agentsam-console-actions-slot'));
    setHostLeadingSlot(document.getElementById('agentsam-console-leading-slot'));
  }, []);
  const [workFocused, setWorkFocused] = useState(false);
  const [floatingMinimized, setFloatingMinimized] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<{ x: number; y: number } | null>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const floatingChatRef = useRef<HTMLElement>(null);
  const floatingDrag = useRef<{ pointerId: number; startX: number; startY: number; x: number; y: number } | null>(null);

  // The full-view chat is the SAME lead composer, not a second chat or menu.
  // Only the small grip captures the pointer; the textarea, plugins and file cards
  // retain all of their native gestures and click targets.
  const moveFloatingChat = (x: number, y: number) => {
    const workspace = workspaceRef.current;
    const panel = floatingChatRef.current;
    if (!workspace || !panel) return;
    setFloatingPosition({
      x: Math.max(8, Math.min(x, Math.max(8, workspace.clientWidth - panel.offsetWidth - 8))),
      y: Math.max(8, Math.min(y, Math.max(8, workspace.clientHeight - panel.offsetHeight - 8))),
    });
  };
  const onFloatingDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const workspace = workspaceRef.current;
    const panel = floatingChatRef.current;
    if (!workspace || !panel) return;
    const workspaceRect = workspace.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    floatingDrag.current = {
      pointerId: event.pointerId, startX: event.clientX, startY: event.clientY,
      x: panelRect.left - workspaceRect.left, y: panelRect.top - workspaceRect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onFloatingDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = floatingDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    moveFloatingChat(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
  };
  const onFloatingDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (floatingDrag.current?.pointerId !== event.pointerId) return;
    floatingDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  // A floating window must remain reachable when it expands, when content
  // arrives, or when the desktop viewport is resized.
  useEffect(() => {
    if (!workFocused || typeof ResizeObserver === 'undefined') return;
    const workspace = workspaceRef.current;
    const panel = floatingChatRef.current;
    if (!workspace || !panel) return;
    const keepVisible = () => setFloatingPosition(position => {
      if (!position) return null;
      const x = Math.max(8, Math.min(position.x, Math.max(8, workspace.clientWidth - panel.offsetWidth - 8)));
      const y = Math.max(8, Math.min(position.y, Math.max(8, workspace.clientHeight - panel.offsetHeight - 8)));
      return x === position.x && y === position.y ? position : { x, y };
    });
    const observer = new ResizeObserver(keepVisible);
    observer.observe(workspace);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [workFocused, floatingMinimized]);
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
  const [findChatOpen, setFindChatOpen] = useState(false);
  const [showChatFiles, setShowChatFiles] = useState(false);
  const [findChatQuery, setFindChatQuery] = useState('');
  const chat = state.chats.find((item) => item.id === (conversationId ?? state.activeChatId));
  const [threadHistory, setThreadHistory] = useState({ index: visitedThreads.index, total: visitedThreads.ids.length });
  useEffect(() => {
    if (!chat?.id) return;
    rememberThread(chat.id, data.account?.id ?? 'local');
    setThreadHistory({ index: visitedThreads.index, total: visitedThreads.ids.length });
  }, [chat?.id, data.account?.id]);
  useEffect(() => { if (!state.sideOpen && workFocused) setWorkFocused(false); }, [state.sideOpen, workFocused]);
  const visitThread = (direction: -1 | 1) => {
    const nextIndex = visitedThreads.index + direction;
    const id = visitedThreads.ids[nextIndex];
    if (!id) return;
    visitedThreads.index = nextIndex;
    setThreadHistory({ index: nextIndex, total: visitedThreads.ids.length });
    void navigate({ to: '/admin/chats/$chatId', params: { chatId: id } });
  };
  useEffect(() => { if (conversationId && state.chats.some((item) => item.id === conversationId)) state.setActiveChat(conversationId); }, [conversationId, state.setActiveChat, state.chats]);

  const startNewChat = () => {
    const id = state.startChat();
    void navigate({ to: '/admin/chats/$chatId', params: { chatId: id } });
  };
  const openBrowserTab = (fullView: boolean) => {
    state.openSideTab('browser', { ephemeral: false });
    setWorkFocused(fullView);
  };
  // Global top-right control ONLY toggles the side workspace. Focus / full view
  // is a second, contextual action in the stage header once the panel is open.
  const toggleSideWorkspace = () => {
    if (state.sideOpen) {
      setWorkFocused(false);
      state.setSideOpen(false);
      return;
    }
    if (!state.sideTabs.length) state.openSideTab('browser', { ephemeral: false });
    else state.setSideOpen(true);
  };
  // Preserve the existing browser, annotation, pinned resources and conversation
  // capabilities behind the mobile header's one contextual More trigger.
  useEffect(() => { setFindChatOpen(false); setFindChatQuery(''); }, [chat?.id]);
  const pinned = data.pinnedSummary;
  const pinnedItems: NavAction[] = pinned ? [
    ...(pinned.subagents || []).map(agent => ({
      id: 'subagent:' + agent.id, label: agent.label + (agent.status ? ' · ' + agent.status : ''),
      icon: <Bot />, onSelect: agent.onSelect,
    })),
    ...(pinned.outputs || []).map((item,index) => typeof item === 'string'
      ? { id: 'output:' + index, label: item, icon: <BookOpen /> }
      : { id: 'output:' + item.id, label: item.label, icon: <BookOpen />, onSelect: item.onSelect }),
    ...(pinned.sources || []).map((item,index) => typeof item === 'string'
      ? { id: 'source:' + index, label: item, icon: <Files /> }
      : { id: 'source:' + item.id, label: item.label, icon: <Files />, onSelect: item.onSelect }),
    ...(pinned.outputActions || []), ...(pinned.sourceActions || []),
  ] : [];
  const workspaceMoreActions: NavAction[] = [
    { id: 'new-browser-tab', label: 'New browser tab', icon: <Plus />, onSelect: () => openBrowserTab(false) },
    { id: 'new-browser-fullview', label: 'New browser tab in full view', icon: <Maximize2 />, onSelect: () => openBrowserTab(true) },
    { id: 'toggle-work-view', label: workFocused ? 'Exit full view' : 'Enter full view',
      icon: workFocused ? <Minimize2 /> : <Maximize2 />, onSelect: () => {
        if (!workFocused) {
          if (!state.sideTabs.length) state.openSideTab('browser', { ephemeral: false });
          else state.setSideOpen(true);
        }
        setWorkFocused(focused => !focused);
      } },
    { id: 'annotate-page', label: 'Annotate page', icon: <MousePointer2 />,
      onSelect: () => window.dispatchEvent(new Event('agentsam:annotate')) },
    { id: 'assistant', label: 'Open AgentSam assistant', icon: <Bot />,
      onSelect: () => window.dispatchEvent(new Event('agentsam:assistant:activate')) },
    { id: 'files-and-sources', label: 'Files and sources', icon: <Files />,
      onSelect: () => { state.openSideTab('files', { ephemeral: false }); state.setSideOpen(true); } },
    ...(pinnedItems.length ? [{ id: 'pinned-resources', label: 'Sources and outputs',
      icon: <BookOpen />, children: pinnedItems }] : []),
  ];
  const mobileMoreActions: NavAction[] = [
    { id: 'plugins', label: 'Plugins', icon: <Plug />, children: [
      { id: 'browse-plugins', label: 'Browse plugins', icon: <Plug />, onSelect: () => {
        state.setWorkSurface('chat'); state.setSideOpen(false);
        window.dispatchEvent(new CustomEvent('agentsam:conversation-plugins', { detail: { chatId: chat?.id } }));
      } },
      { id: 'manage-plugins', label: 'Manage plugins', icon: <Plug />, onSelect: () => window.dispatchEvent(new CustomEvent('agentsam:navigate', { detail: { to: '/admin/settings/customize?view=plugins' } })) },
    ] },
    { id: 'uploaded-files', label: 'Uploaded files', icon: <Paperclip />, onSelect: () => {
      state.setWorkSurface('chat'); state.setSideOpen(false); setFindChatQuery(''); setFindChatOpen(true); setShowChatFiles(true);
    } },
    { id: 'find-chat', label: 'Find in chat', icon: <Search />, onSelect: () => {
      state.setWorkSurface('chat'); state.setSideOpen(false); setShowChatFiles(false); setFindChatOpen(true);
    } },
    { id: 'workspace-actions', label: 'Workspace actions', icon: <Maximize2 />, children: workspaceMoreActions },
  ];

  if (!chat) return <div className="agentsam-welcome"><h1>Conversation unavailable</h1><button type="button" className="as-nav-button" onClick={startNewChat}>New chat</button></div>;

  // Failed model responses stay inside the conversation transcript — never replace the product.
  const hasConversation = chat.messages.some(message => message.role === 'user' && message.id !== 'welcome-msg') && data.conversation?.id === chat.id;
  const empty = !chat.messages.some(message => message.role === 'user' && message.id !== 'welcome-msg');
  const streaming = state.streamingIds.includes(chat.id);
  const companionArt = companionStateAsset(companion, streaming ? 'working' : 'idle');
  const workSurface = state.workSurface;
  const mobileWorkOpen = compactWorkLayout && (state.sideOpen || workSurface !== 'chat');
  const mobileHeaderState = mobileWorkOpen ? 'surface' : empty ? 'start' : 'conversation';
  const showModeSwitcher = empty && (!isMobile || mobileHeaderState === 'start');
  // Work mirrors the reference: stage on the left, chat on the right.
  // Chat mode keeps the established lead-left / Stage-right layout.
  const workSplit = data.mode === 'work' && state.sideOpen && !workFocused && !compactWorkLayout;
  const leadComposerDetached = workFocused || mobileWorkOpen || (isMobile && state.sideOpen);
  const floatingChatStyle = {
    '--agentsam-chat-left': floatingPosition ? floatingPosition.x + 'px' : 'auto',
    '--agentsam-chat-top': floatingPosition ? floatingPosition.y + 'px' : 'auto',
    '--agentsam-chat-right': floatingPosition ? 'auto' : '16px',
    '--agentsam-chat-bottom': floatingPosition ? 'auto' : '16px',
  } as CSSProperties;
  const activeStage = state.sideTabs.find(tab => tab.id === state.activeSideTabId);
  const stageParams = new URLSearchParams(activeStage?.url?.split('?')[1] || '');
  const slidesContext = (state.sideOpen || mobileWorkOpen) && activeStage?.kind === 'design' && stageParams.get('type') === 'slides' && stageParams.get('canvas')
    ? { id: stageParams.get('canvas')!, title: activeStage.title }
    : undefined;
  const leadComposer = <Composer artifactContext={isMobile ? slidesContext : undefined} workMode={data.mode === 'work'} showWorkShortcuts={data.mode === 'work' && (workFocused || (empty && !leadComposerDetached))} targetId={chat.id} targetKind="chat" placeholder={data.mode === 'work' ? 'Work with ' + companion.name : 'Ask ' + companion.name} />;
  // One set of controls is portalled into hosted chrome or rendered locally.
  const leadingControls = <div className="agentsam-topbar-leading" role="group" aria-label="Thread and workspace navigation">
    {!isMobile ? <>
      <IconAction label="Previous thread" hint="Previous visited conversation" disabled={threadHistory.index <= 0} onClick={() => visitThread(-1)}><ArrowLeft size={17} /></IconAction>
      <IconAction label="Next thread" hint="Next visited conversation" disabled={threadHistory.index >= threadHistory.total - 1} onClick={() => visitThread(1)}><ArrowRight size={17} /></IconAction>
    </> : null}
    {/* The hosted topbar already owns the one global menu bubble. */}
    {!hostLeadingSlot ? <Nav.Trigger aria-label="Toggle global navigation" /> : null}
    {data.mode === 'work' && !isMobile ? <WorkProjectSelect /> : null}
  </div>;
  // Blank chats have no conversation overflow or empty Sources & Outputs panel.
  const mobileStageVisible = isMobile && (mobileWorkOpen || state.sideOpen);
  const mobileFocusedStage = mobileStageVisible && !!activeStage && !["newtab", "files", "artifacts", "apps"].includes(activeStage.kind);
  const headerActions = isMobile ? (mobileStageVisible ? <MobileStageActions /> : empty ? null : <div className="agentsam-header-utilities">
    <div className="agentsam-mobile-header-action-pill" role="group" aria-label="Conversation and workspace actions">
      <IconAction className="agentsam-header-action" label="New chat" hint="New chat (⌘N)" onClick={startNewChat}><SquarePen size={20} aria-hidden="true" /></IconAction>
      {hasConversation ? <Nav.ConversationActions additionalActions={mobileMoreActions} mobile /> : null}
    </div>
  </div>) : <div className="agentsam-header-utilities">
    <div className="agentsam-topbar-browser-actions" role="group" aria-label="Workspace panel">
      <IconAction
        type="button"
        label={state.sideOpen ? 'Close side workspace' : 'Open side workspace'}
        hint={state.sideOpen ? 'Close side workspace' : 'Open side workspace'}
        aria-expanded={state.sideOpen}
        aria-controls="agentsam-side-stage"
        onClick={toggleSideWorkspace}
      >{state.sideOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}</IconAction>
    </div>
    {hasConversation && <div className="agentsam-header-action-pill" role="group" aria-label="Conversation actions">
      <IconAction className="agentsam-header-action" label="New chat" hint="New chat (⌘N)" onClick={startNewChat}><SquarePen size={20} aria-hidden="true" /></IconAction>
      <Nav.ConversationActions />
      <Nav.ShareButton />
      <Nav.PinnedSummary />
    </div>}
  </div>;
  return <div className="agentsam-page-layout" data-composer-mode={data.mode} data-work-remaster="true" data-work-surface={workSurface} data-mobile-stage-focused={mobileFocusedStage ? "true" : undefined}>
    {hostModeSlot ? createPortal(showModeSwitcher ? <div className="agentsam-mode-host" data-mobile-header-state={mobileHeaderState}><Nav.ModeSwitcher /></div> : <span hidden data-mobile-header-state={mobileHeaderState} />, hostModeSlot) : null}
    {hostLeadingSlot && !isMobile ? createPortal(leadingControls, hostLeadingSlot) : null}
    {hostActionsSlot ? createPortal(headerActions ?? <span className="agentsam-blank-conversation-actions" data-mobile-header-state={mobileHeaderState} aria-hidden="true" />, hostActionsSlot) : null}
    {!hostModeSlot ? <Nav.Topbar className={"agentsam-conversation-topbar" + (showModeSwitcher ? " is-empty-thread" : " is-active-thread")}>
      {leadingControls}
      {showModeSwitcher ? <div className="agentsam-topbar-mode"><Nav.ModeSwitcher /></div>
        : !isMobile ? <span className="agentsam-topbar-thread-title" title={chat.title}>{chat.title}</span> : null}
      <span className="flex-1" aria-hidden="true" />
      {!hostActionsSlot ? headerActions : null}
    </Nav.Topbar> : null}
    <div ref={workspaceRef} className={"agentsam-workspace" + (workSplit ? " is-work-stage-first" : "") + (workFocused ? " is-work-focused" : "") + (leadComposerDetached ? " has-detached-composer" : "")}>
      <section className="agentsam-conversation" aria-label="Conversation" inert={mobileWorkOpen || (isMobile && state.sideOpen) || workFocused} style={workFocused || mobileWorkOpen ? { display:"none" } : undefined}>
        {findChatOpen && <div className="agentsam-chat-find" role="region" aria-label={showChatFiles ? 'Uploaded files' : 'Find in chat'}>
          <div className="agentsam-chat-find-head">
            {showChatFiles ? <strong>Uploaded files</strong> : <input autoFocus aria-label="Find in chat" placeholder="Find in chat" value={findChatQuery} onChange={event => setFindChatQuery(event.target.value)} />}
            <IconAction label="Close" onClick={() => setFindChatOpen(false)}><X size={18}/></IconAction>
          </div>
          <div className="agentsam-chat-find-results">
            {showChatFiles ? ((pinned?.sources ?? []).length ? pinned!.sources!.map((file,index) => <button key={index} type="button" onClick={() => { if (typeof file !== 'string') file.onSelect?.(); }} disabled={typeof file === 'string' || !file.onSelect}>{typeof file === 'string' ? file : file.label}</button>) : <span>No uploaded files in this conversation.</span>) : findChatQuery.trim() ? (chat.messages.filter(message => message.content.toLowerCase().includes(findChatQuery.trim().toLowerCase())).map(message => <button key={message.id} type="button" onClick={() => {
              const target = document.querySelector<HTMLElement>('[data-chat-message-id="' + CSS.escape(message.id) + '"]');
              target?.scrollIntoView({block:'center', behavior:'smooth'}); target?.focus({preventScroll:true});
            }}>{message.role}: {message.content.slice(0,180)}</button>)) : <span>Search messages in this conversation.</span>}
          </div>
        </div>}
        <AgentConversationSurface
          empty={empty}
          thread={<MessageList messages={chat.messages} chatId={chat.id} streaming={streaming} readingMode={data.mode === 'work'} />}
          emptyState={<div className="agentsam-welcome-heading">
            {data.mode === 'work' ? <div className="agentsam-work-welcome" data-companion-id={companion.id}>
              <div className="agentsam-work-welcome-art" aria-hidden="true">
                {companionArt ? <img src={companionArt} alt="" draggable={false} /> :
                  <span>{companion.name.slice(0, 1).toUpperCase()}</span>}
              </div>
              <div className="agentsam-work-welcome-copy">
                <h1>What should we work on?</h1>
                {!companionSettingsLoading && !companionSettings.onboarding?.completedAt ? <button type="button" onClick={() => { window.location.href = '/onboarding/companion'; }} className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[.06] px-3 text-[10px] font-medium text-emerald-200 hover:bg-emerald-400/10"><Compass className="size-3.5" /> Discover your InnerAnimal <ArrowRight className="size-3" /></button> : null}
              </div>
            </div> : <div><h1>Where should we begin?</h1>{!companionSettingsLoading && !companionSettings.onboarding?.completedAt ? <button type="button" onClick={() => { window.location.href = '/onboarding/companion'; }} className="mt-3 inline-flex h-8 items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-400/[.06] px-3 text-[10px] font-medium text-emerald-200 hover:bg-emerald-400/10"><Compass className="size-3.5" /> Discover your InnerAnimal <ArrowRight className="size-3" /></button> : null}</div>}
          </div>}
          composer={leadComposerDetached ? null : leadComposer}
          composerClassName="agentsam-conversation-dock"
        />
      </section>
      {state.sideOpen || mobileWorkOpen ? <>{!workFocused && !compactWorkLayout && <SplitHandle label="Resize Work Panel" onDrag={(delta) => setPanelWidth((width) => Math.max(WORK_PANEL_MIN, Math.min(1500, width + (workSplit ? delta : -delta), window.innerWidth - CHAT_PANEL_MIN)))} onDoubleClick={() => setPanelWidth(Math.max(480, Math.round(window.innerWidth * 0.54)))} />}<aside id="agentsam-side-stage" className="agentsam-side-panel" style={{ "--agentsam-panel-width": panelWidth + "px" } as CSSProperties} aria-label="Work Panel"><SideStage workFocused={workFocused} onFocusToggle={() => setWorkFocused(focused => !focused)} /></aside></> : null}
      {leadComposerDetached && workFocused && !compactWorkLayout ? (
        <section
          ref={floatingChatRef}
          className="agentsam-floating-lead-chat"
          aria-label="Movable AgentSam chat"
          style={floatingChatStyle}
        >
          <header className="agentsam-floating-chat-header">
            <IconAction type="button" className="agentsam-floating-chat-minimize" label={floatingMinimized ? 'Expand chat' : 'Minimize chat'} aria-expanded={!floatingMinimized} onClick={() => setFloatingMinimized(minimized => !minimized)}>
              {floatingMinimized ? <Plus size={14} /> : <Minus size={14} />}
            </IconAction>
            <span>Chat</span>
            <IconAction type="button" className="agentsam-floating-chat-grip" label="Drag chat panel" hint="Drag chat panel. Arrow keys move the panel."
              onPointerDown={onFloatingDragStart} onPointerMove={onFloatingDragMove}
              onPointerUp={onFloatingDragEnd} onPointerCancel={onFloatingDragEnd}
              onKeyDown={event => {
                const step = event.shiftKey ? 64 : 24;
                const delta = {
                  ArrowLeft: [-step, 0], ArrowRight: [step, 0],
                  ArrowUp: [0, -step], ArrowDown: [0, step],
                }[event.key];
                if (!delta) return;
                event.preventDefault();
                const root = workspaceRef.current?.getBoundingClientRect();
                const panel = floatingChatRef.current?.getBoundingClientRect();
                if (root && panel) moveFloatingChat(panel.left - root.left + delta[0], panel.top - root.top + delta[1]);
              }}
            ><GripVertical size={16} /></IconAction>
          </header>
          {!floatingMinimized && <>
            {!empty && <div className="agentsam-floating-chat-thread"><MessageList messages={chat.messages} chatId={chat.id} streaming={streaming} readingMode={data.mode === 'work'} /></div>}
            <div className="agentsam-floating-chat-composer">{leadComposer}</div>
          </>}
        </section>
      ) : leadComposerDetached && !compactWorkLayout && (
        <div className="agentsam-focused-lead-composer" aria-label="Lead AgentSam composer">
          {leadComposer}
        </div>
      )}
    </div>
  </div>;
}

