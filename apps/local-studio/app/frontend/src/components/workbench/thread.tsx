import { useEffect, useRef, useState } from "react";
import { MessageMarkdown } from "@/components/workbench/markdown";
import { Composer } from "@/components/workbench/composer";
import { StudioMark } from "@/components/mark";
import { formatElapsed } from "@/lib/utils";
import { useWorkStore, useActiveTrail } from "@/lib/work/store";
import type { ChatMessage } from "@/lib/work/types";
import { Button } from "@/components/ui/button";

const STARTERS = [
  "Sketch a dual-pane React layout with an ephemeral helper chat",
  "Add a landing hero to index.html and preview it",
  "Prepare this workspace for Cloudflare Pages and GitHub Actions",
];

function MessageBubble({
  message,
  trailId,
  streaming,
  startedAt,
}: {
  message: ChatMessage;
  trailId?: string;
  streaming?: boolean;
  startedAt?: number;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!streaming) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [streaming]);

  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[min(100%,40rem)] rounded-2xl bg-accent px-4 py-3 text-sm leading-relaxed text-accent-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {streaming && !message.content ? (
        <p className="thinking text-sm">
          Thinking{startedAt ? ` · ${formatElapsed(now - startedAt)}` : ""}
        </p>
      ) : null}
      {streaming && message.content ? (
        <p className="text-xs text-muted-foreground">
          Working{startedAt ? ` · ${formatElapsed(now - startedAt)}` : ""}
        </p>
      ) : null}
      {message.content ? <MessageMarkdown content={message.content} trailId={trailId} /> : null}
    </div>
  );
}

export function MessageList({
  messages,
  trailId,
  streaming,
}: {
  messages: ChatMessage[];
  trailId?: string;
  streaming: boolean;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = scroller.current;
    if (!el || !stick.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  return (
    <div
      ref={scroller}
      className="scrollbar-thin flex-1 overflow-y-auto px-4 py-6"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            trailId={trailId}
            streaming={streaming && index === messages.length - 1 && message.role === "assistant"}
            startedAt={streaming ? message.createdAt : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export function TrailThread() {
  const trail = useActiveTrail();
  const send = useWorkStore((s) => s.send);
  const streaming = useWorkStore((s) => s.streamingIds.includes(trail.id));
  const empty = trail.messages.length === 0;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {empty ? <EmptyTrail onPrompt={(text) => void send(trail.id, "trail", text)} /> : (
        <MessageList messages={trail.messages} trailId={trail.id} streaming={streaming} />
      )}
      {trail.id === "trail-studio" && trail.messages.length === 1 ? (
        <div className="mx-auto mb-2 flex w-full max-w-3xl flex-wrap gap-2 px-4">
          {STARTERS.map((prompt) => (
            <Button
              key={prompt}
              type="button"
              variant="outline"
              size="sm"
              className="h-auto max-w-full rounded-full px-3 py-2 text-left text-xs font-normal text-muted-foreground"
              onClick={() => void send(trail.id, "trail", prompt)}
            >
              {prompt}
            </Button>
          ))}
        </div>
      ) : null}
      <Composer targetId={trail.id} targetKind="trail" />
    </div>
  );
}

function EmptyTrail({ onPrompt }: { onPrompt: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <StudioMark className="mb-4 size-12" />
      <h2 className="text-xl font-medium tracking-tight text-balance">What is on the bench?</h2>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground text-pretty">
        This is the lead chat for the project. Open a co-worker beside it when you want focused help.
      </p>
      <div className="mt-6 flex max-w-lg flex-wrap justify-center gap-2">
        {STARTERS.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto rounded-full px-3 py-2 text-left text-xs font-normal text-muted-foreground"
            onClick={() => onPrompt(prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    </div>
  );
}
