import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from '@tanstack/react-router';
import { MessageSquarePlus, MoreHorizontal, Pin, Target, Settings, Folder, Layers, Plug, SquareTerminal, Globe, Users, MonitorPlay, FileCode } from 'lucide-react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { IconAction } from '@/components/ui/icon-action';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage } from '@/components/workbench/side-stage';
import { WorkSurfaceBar } from '@/components/workbench/work-surface-bar';
import { SidePanelToggle } from './AgentSamShell';
import { useActiveCompanion } from './CompanionContext';
import { companionStateAsset } from './companions';
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
  const [hostActionsSlot, setHostActionsSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setHostModeSlot(document.getElementById('agentsam-console-mode-slot'));
    setHostActionsSlot(document.getElementById('agentsam-console-actions-slot'));
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
  const showLivingGoals = () => {
    state.openSideTab('goal', { ephemeral: false });
    state.setSideOpen(true);
  };
  const openWorkTool = (kind: "chat" | "browser" | "files" | "artifacts" | "terminal") => {
    state.openSideTab(kind, { ephemeral: false });
    state.setSideOpen(true);
  };
  const menuActions = [
    ...(data.conversationActions ?? []),
    { id: 'pin-current', label: chat.pinned ? 'Unpin conversation' : 'Pin conversation', icon: <Pin size={16}/>,
      onSelect: () => data.onPinConversation?.(chat.id) },
    { id: 'living-goals', label: 'My goals', icon: <Target size={16}/>, onSelect: showLivingGoals, separatorBefore: true },
    ...(data.projects?.length ? [{ id: 'assign-project', label: 'Add to project', icon: <Folder size={16}/>,
      children: [
        { id: 'project-none', label: 'No project', icon: <Folder size={16}/>,
          onSelect: () => data.onAssignConversationToProject?.(chat.id, null) },
        ...data.projects.map(project => ({ id: 'project-' + project.id, label: project.name,
          icon: <Folder size={16}/>, onSelect: () => data.onAssignConversationToProject?.(chat.id, project.id) })),
      ] }] : []),
    { id: 'work-tools', label: 'Work tools', icon: <Layers size={16}/>, children: [
      { id: 'co-worker', label: 'Co-worker', icon: <Users size={16}/>, onSelect: () => openWorkTool('chat') },
      { id: 'browser', label: 'Browser', icon: <Globe size={16}/>, onSelect: () => openWorkTool('browser') },
      { id: 'files-work', label: 'Files', icon: <Folder size={16}/>, onSelect: () => state.setWorkSurface('files') },
      { id: 'code-work', label: 'Code', icon: <FileCode size={16}/>, onSelect: () => state.setWorkSurface('code') },
      { id: 'terminal-work', label: 'Terminal', icon: <SquareTerminal size={16}/>, onSelect: () => state.setWorkSurface('terminal') },
      { id: 'preview-work', label: 'Preview', icon: <MonitorPlay size={16}/>, onSelect: () => state.setWorkSurface('preview') },
      { id: 'artifacts-work', label: 'Artifacts', icon: <Layers size={16}/>, onSelect: () => openWorkTool('artifacts') },
    ] },
    { id: 'plugins', label: 'Manage plugins', icon: <Plug size={16}/>,
      onSelect: () => void navigate({ to: '/settings/integrations' as never }) },
    { id: 'settings', label: 'Settings', icon: <Settings size={16}/>,
      onSelect: () => void navigate({ to: '/settings/general' as never }), separatorBefore: true },
  ];
  const headerActions = <div className="agentsam-header-action-pill" role="group" aria-label="Conversation actions">
    <IconAction className="agentsam-header-action" label="New chat" hint="New chat (⌘N)" onClick={startNewChat}>
      <MessageSquarePlus size={20} aria-hidden="true" />
    </IconAction>
    <Nav.OverflowMenu label="Conversation options" actions={menuActions}>
      <MoreHorizontal size={22} aria-hidden="true"/>
    </Nav.OverflowMenu>
  </div>;
  return <div className="agentsam-page-layout" data-composer-mode={data.mode} data-work-remaster="true" data-work-surface={workSurface}>
    {hostModeSlot && empty ? createPortal(<div className="agentsam-mode-host"><Nav.ModeSwitcher /></div>, hostModeSlot) : null}
    {hostActionsSlot ? createPortal(headerActions, hostActionsSlot) : null}
    {!hostModeSlot ? <Nav.Topbar className="agentsam-conversation-topbar">
      <Nav.Trigger aria-label="Open navigation" />
      {empty ? <div className="agentsam-topbar-mode"><Nav.ModeSwitcher /></div>
        : <span className="agentsam-topbar-thread-title" title={chat.title}>{chat.title}</span>}
      <span className="flex-1" aria-hidden="true" />
      {headerActions}
    </Nav.Topbar> : null}
    <div className={"agentsam-workspace" + (workFocused ? " is-work-focused" : "")}>
      {hostModeSlot && empty && data.mode !== 'work' ? <div className="agentsam-context-tools" aria-label="Conversation tools"><AnnotationToggle /><SidePanelToggle /></div> : null}
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
    {(!isMobile || empty) ? <WorkSurfaceBar /> : null}
  </div>;
}

