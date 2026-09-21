import { useEffect, useState } from 'react';
import { Nav, useNav } from '@inneranimalmedia/agentsam-nav';
import { useWorkStore } from '@/lib/work/store';
import { MessageList } from '@/components/workbench/thread';
import { Composer } from '@/components/workbench/composer';
import { SideStage } from '@/components/workbench/side-stage';
import { SidePanelToggle } from './AgentSamShell';
import { SplitHandle } from '@/components/shell/split-handle';

export function AgentSamPage({ conversationId }: { conversationId?: string }) {
  const { data, isMobile } = useNav();
  const state = useWorkStore();
  const [panelWidth, setPanelWidth] = useState(480);
  const trail = state.trails.find((item) => item.id === (conversationId ?? state.activeTrailId));
  useEffect(() => { if (conversationId && state.trails.some((item) => item.id === conversationId)) state.setActiveTrail(conversationId); }, [conversationId, state.setActiveTrail, state.trails]);
  if (!trail) return <div className="agentsam-welcome"><h1>Conversation unavailable</h1><button type="button" className="as-nav-button" onClick={data.onCreateConversation}>New chat</button></div>;
  // The donor's welcome placeholder is not a conversation. Keep persisted user messages intact.
  const empty = trail.messages.length === 0 || (trail.messages.length === 1 && trail.messages[0].id === 'welcome-msg');
  const streaming = state.streamingIds.includes(trail.id);
  return <div className="agentsam-page-layout">
    <Nav.Topbar startup={empty} rightSlot={<SidePanelToggle />} />
    <div className="agentsam-workspace">
      <section className="agentsam-conversation" aria-label="Conversation" inert={isMobile && state.sideOpen}>
        {empty ? <div className="agentsam-welcome"><h1>{data.mode === 'work' ? 'What should we work on?' : 'Where should we begin?'}</h1><Composer targetId={trail.id} targetKind="trail" placeholder={data.mode === 'work' ? 'Work on anything…' : 'Ask anything…'} /><div className="agentsam-start-context"><Nav.ProjectContext /></div></div> : <><MessageList messages={trail.messages} trailId={trail.id} streaming={streaming} /><div className="agentsam-dock"><Composer targetId={trail.id} targetKind="trail" placeholder={data.mode === 'work' ? 'Work on anything…' : 'Ask anything…'} /></div></>}
      </section>
      {state.sideOpen ? <><SplitHandle label="Resize Side Panel" onDrag={(delta) => setPanelWidth((width) => Math.max(280, Math.min(900, width - delta)))} onDoubleClick={() => setPanelWidth(480)} /><aside className="agentsam-side-panel" style={{ width: panelWidth }} aria-label="Side Panel"><SideStage /></aside></> : null}
    </div>
  </div>;
}
