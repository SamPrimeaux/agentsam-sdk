import { useMemo } from 'react';
import type { AgentPrincipal, AgentWorkbenchAdapter } from '@inneranimalmedia/agentsam-contracts';
import { ConnectedAgentPanel } from '@inneranimalmedia/agentsam-workbench/agent';
import { createCmsAgentContextProvider } from '@inneranimalmedia/agentsam-cms-shared';

export type CmsAgentSurfaceProps = {
  adapter: AgentWorkbenchAdapter;
  principal: AgentPrincipal;
  projectId: string;
  conversationId: string;
  route?: string;
  pageId?: string | null;
  sectionId?: string | null;
  blockId?: string | null;
  publicationRevision?: number | null;
  className?: string;
};

/**
 * CMS-specific adapter around the shared AgentSam workbench. This component does
 * not establish identity or discover CMS context implicitly: the host supplies
 * both an authenticated principal and explicit CMS selection state.
 */
export function CmsAgentSurface({
  adapter,
  principal,
  projectId,
  conversationId,
  route,
  pageId,
  sectionId,
  blockId,
  publicationRevision,
  className,
}: CmsAgentSurfaceProps) {
  const contextProvider = useMemo(() => createCmsAgentContextProvider(() => ({
    principal,
    projectId,
    route,
    pageId,
    sectionId,
    blockId,
    publicationRevision,
  })), [blockId, pageId, principal, projectId, publicationRevision, route, sectionId]);

  return (
    <ConnectedAgentPanel
      className={className}
      adapter={adapter}
      contextProvider={contextProvider}
      conversationId={conversationId}
      header={<div data-cms-agent-header="">AgentSam · CMS</div>}
      empty={<div data-cms-agent-empty="">Ask AgentSam to inspect or propose CMS changes.</div>}
    />
  );
}
