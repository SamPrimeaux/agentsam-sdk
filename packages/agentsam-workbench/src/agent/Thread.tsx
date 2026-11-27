import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';
import type { AgentMessage } from '@inneranimalmedia/agentsam-contracts';

export interface AgentThreadProps {
  messages: AgentMessage[];
  streaming?: boolean;
  renderMessage?: (message: AgentMessage, index: number) => ReactNode;
  empty?: ReactNode;
  scrollerClassName?: string;
  listClassName?: string;
  scrollerStyle?: CSSProperties;
  listStyle?: CSSProperties;
  stickThreshold?: number;
  activity?: ReactNode;
}

export function AgentThread({
  messages,
  streaming = false,
  renderMessage,
  empty = null,
  scrollerClassName,
  listClassName,
  scrollerStyle,
  listStyle,
  stickThreshold = 80,
  activity,
}: AgentThreadProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [away, setAway] = useState(false);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else setAway(el.scrollHeight - el.scrollTop - el.clientHeight >= stickThreshold);
  }, [messages, streaming, stickThreshold, activity]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < stickThreshold;
    setAway(!stick.current);
  }

  return (
    <div data-agent-thread-frame="" style={{position:'relative',display:'flex',flexDirection:'column',flex:1,minHeight:0,minWidth:0}}>
    <div
      ref={scroller}
      className={scrollerClassName}
      data-agent-thread=""
      onScroll={onScroll}
      style={
        scrollerStyle ??
        (scrollerClassName
          ? undefined
          : { minHeight: 0, flex: 1, overflowY: 'auto' })
      }
    >
      <div className={listClassName} style={listStyle}>
        {messages.length === 0
          ? empty
          : messages.map((message, index) =>
              renderMessage ? renderMessage(message, index) : <DefaultMessage key={message.id} message={message} />,
            )}
        {activity}
      </div>
    </div>
    {away ? <button type="button" data-agent-scroll-latest="" aria-label="Scroll to latest message" onClick={() => {
      const el = scroller.current;
      if (!el) return;
      stick.current = true;
      el.scrollTop = el.scrollHeight;
      setAway(false);
    }} style={{position:'absolute',bottom:10,left:'50%',transform:'translateX(-50%)',zIndex:2,width:46,height:46,display:'grid',placeItems:'center',borderRadius:'50%',border:'1px solid color-mix(in srgb, var(--nav-text, #fff) 22%, transparent)',background:'linear-gradient(165deg, #ffffff16, transparent 60%), color-mix(in srgb, var(--nav-popover, #292929) 68%, transparent)',color:'var(--nav-text, #fff)',backdropFilter:'blur(24px) saturate(140%)',WebkitBackdropFilter:'blur(24px) saturate(140%)',boxShadow:'0 4px 16px #0003,inset 0 1px 1px #ffffff16',cursor:'pointer'}}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16m-7-7 7 7 7-7"/></svg>
    </button> : null}
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
