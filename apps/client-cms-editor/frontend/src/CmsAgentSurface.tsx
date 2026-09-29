import type { ReactNode } from 'react';

export type CmsAgentSurfaceProps = {
  projectId: string;
  conversationId: string;
  className?: string;
  children?: ReactNode;
  /**
   * Host-provided AgentSam / contextual composer surface.
   * Core CMS never imports agentsam-workbench; attach via CmsAgentHost in the consumer.
   */
  hostSurface?: ReactNode;
};

/**
 * Optional AgentSam surface slot. Without a host surface, renders a clear empty state.
 */
export function CmsAgentSurface({
  className,
  children,
  hostSurface,
}: CmsAgentSurfaceProps) {
  if (hostSurface) {
    return <div className={className} data-cms-agent-host="">{hostSurface}</div>;
  }
  return (
    <div className={className} data-cms-agent-empty="">
      {children || (
        <p>
          No AgentSam host attached. Pass a host surface from the consumer (Local Studio /
          InnerAnimalMedia) — the CMS package does not bundle AgentSam workbench.
        </p>
      )}
    </div>
  );
}
