import type { CSSProperties, ReactNode } from 'react';

export type AgentConversationSurfaceProps = {
  empty?: boolean;
  thread: ReactNode;
  composer: ReactNode;
  emptyState?: ReactNode;
  runtime?: ReactNode;
  status?: ReactNode;
  className?: string;
  bodyClassName?: string;
  composerClassName?: string;
  style?: CSSProperties;
};

/**
 * Portable thread + persistent composer surface.
 *
 * The composer slot is never conditionally removed when a conversation moves
 * from empty/startup to active. Hosts can restyle the surface, but the DOM
 * ownership contract remains stable across web/desktop/product adapters.
 */
export function AgentConversationSurface({
  empty = false,
  thread,
  composer,
  emptyState,
  runtime,
  status,
  className,
  bodyClassName,
  composerClassName,
  style,
}: AgentConversationSurfaceProps) {
  return (
    <section
      className={className}
      data-agent-conversation-surface=""
      data-agent-conversation-empty={empty ? 'true' : 'false'}
      style={{
        position: 'relative',
        display: 'flex',
        minWidth: 0,
        minHeight: 0,
        flex: 1,
        flexDirection: 'column',
        overflow: 'hidden',
        ...style,
      }}
    >
      {runtime}

      <div
        className={bodyClassName}
        data-agent-conversation-body=""
        data-agent-conversation-body-empty={empty ? 'true' : 'false'}
        style={{
          display: 'flex',
          minWidth: 0,
          minHeight: 0,
          flex: '1 1 auto',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {empty ? (
          emptyState ? (
            <div
              data-agent-conversation-empty-state=""
              style={{
                display: 'flex',
                minWidth: 0,
                minHeight: 0,
                flex: '1 1 auto',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {emptyState}
            </div>
          ) : null
        ) : (
          thread
        )}
      </div>

      {status ? (
        <div data-agent-conversation-status="" style={{ flexShrink: 0 }}>
          {status}
        </div>
      ) : null}

      <div
        className={composerClassName}
        data-agent-conversation-composer=""
        style={{
          position: 'relative',
          zIndex: 2,
          width: '100%',
          flexShrink: 0,
        }}
      >
        {composer}
      </div>

    </section>
  );
}
