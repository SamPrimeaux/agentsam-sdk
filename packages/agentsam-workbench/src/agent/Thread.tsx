import { useEffect, useRef, type ReactNode, type UIEvent } from 'react';
import type { AgentMessage } from '@inneranimalmedia/agentsam-contracts';

export interface AgentThreadProps {
  messages: AgentMessage[];
  streaming?: boolean;
  renderMessage?: (message: AgentMessage, index: number) => ReactNode;
  empty?: ReactNode;
  scrollerClassName?: string;
  listClassName?: string;
  stickThreshold?: number;
}

export function AgentThread({
  messages,
  streaming = false,
  renderMessage,
  empty = null,
  scrollerClassName,
  listClassName,
  stickThreshold = 80,
}: AgentThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < stickThreshold;
  }

  return (
    <div ref={scroller} className={scrollerClassName} data-agent-thread="" onScroll={onScroll}>
      <div className={listClassName}>
        {messages.length === 0
          ? empty
          : messages.map((message, index) =>
              renderMessage ? renderMessage(message, index) : <DefaultMessage key={message.id} message={message} />,
            )}
      </div>
    </div>
  );
}

function DefaultMessage({ message }: { message: AgentMessage }) {
  return (
    <article data-agent-role={message.role} data-agent-message-id={message.id}>
      <div>{message.content}</div>
    </article>
  );
}
