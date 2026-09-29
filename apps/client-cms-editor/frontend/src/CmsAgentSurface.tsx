import type { ReactNode } from 'react';

export type CmsAgentSurfaceProps = {
  projectId: string;
  conversationId: string;
  className?: string;
  children?: ReactNode;
  /**
   * Host-provided agent / contextual composer surface.
   * Core CMS never imports a workbench package; attach via CmsAgentHost in the consumer.
   */
  hostSurface?: ReactNode;
};

/**
 * Optional agent surface slot. Without a host surface, renders a clear empty state.
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
          No agent host attached. Pass a host surface from the embedding application —
          this package does not bundle an agent workbench.
        </p>
      )}
    </div>
  );
}
