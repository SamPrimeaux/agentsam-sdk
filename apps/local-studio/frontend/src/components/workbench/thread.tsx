import { useEffect, useState } from "react";
import { createIndexedDbContentStorage } from "@inneranimalmedia/agentsam-content";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import type { ChatImageReference } from "@/lib/content/chat-images";
import { AgentConversationSurface, AgentThread } from "@inneranimalmedia/agentsam-workbench/agent";
import { MessageMarkdown } from "@/components/workbench/markdown";
import { Composer } from "@/components/workbench/composer";
import { StudioMark } from "@/components/mark";
import { formatElapsed } from "@/lib/utils";
import { useWorkStore, useActiveTrail } from "@/lib/work/store";
import type { ChatMessage } from "@inneranimalmedia/agentsam-local-shared";
import { Button } from "@/components/ui/button";

const STARTERS = [
  "Sketch a dual-pane React layout with an ephemeral helper chat",
  "Add a landing hero to index.html and preview it",
  "Prepare this workspace for Cloudflare Pages and GitHub Actions",
];

function ConversationImage({ refInfo }: { refInfo: ChatImageReference }) {
  const { user } = useCurrentUserState();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!user?.id || refInfo.source?.type !== "blob") return;
    let mounted = true;
    let temporaryUrl: string | null = null;
    const { provider } = createIndexedDbContentStorage(user.id);
    void provider.head(refInfo.source.blobId).then((head) => {
      if (!head || !mounted) return;
      const preview = provider.deliveryUrl(refInfo.source.blobId);
      if (preview) {
        temporaryUrl = preview;
        setUrl(preview);
      }
    }).catch(() => undefined);
    return () => {
      mounted = false;
      if (temporaryUrl?.startsWith("blob:")) URL.revokeObjectURL(temporaryUrl);
    };
  }, [user?.id, refInfo.source]);
  return url ? (
    <img src={url} alt={refInfo.name} title={refInfo.name} className="max-h-52 max-w-64 rounded-lg object-contain" />
  ) : <span className="text-xs opacity-70">{refInfo.name} · image stored locally</span>;
}

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
          {Array.isArray(message.metadata?.attachments) && message.metadata.attachments.length ? (
            <div className="mb-2 flex flex-wrap gap-2">
              {(message.metadata.attachments as ChatImageReference[]).filter((image) => image.kind === "image").map((image) => (
                <ConversationImage key={image.id} refInfo={image} />
              ))}
            </div>
          ) : null}
          {message.content ? <p className="whitespace-pre-wrap">{message.content}</p> : null}
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
  return (
    <AgentThread
      messages={messages}
      streaming={streaming}
      scrollerClassName="scrollbar-thin flex-1 overflow-y-auto px-4 py-6"
      listClassName="mx-auto flex w-full max-w-6xl flex-col gap-6"
      renderMessage={(message, index) => (
        <MessageBubble
          key={message.id}
          message={message as ChatMessage}
          trailId={trailId}
          streaming={streaming && index === messages.length - 1 && message.role === "assistant"}
          startedAt={streaming ? message.createdAt : undefined}
        />
      )}
    />
  );
}

export function TrailThread() {
  const trail = useActiveTrail();
  const send = useWorkStore((s) => s.send);
  const streaming = useWorkStore((s) => s.streamingIds.includes(trail.id));
  const empty = trail.messages.length === 0;

  const starterStatus =
    trail.id === "trail-studio" && trail.messages.length === 1 ? (
      <div className="mx-auto mb-2 flex w-full max-w-6xl flex-wrap gap-2 px-4">
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
    ) : null;

  return (
    <AgentConversationSurface
      empty={empty}
      thread={<MessageList messages={trail.messages} trailId={trail.id} streaming={streaming} />}
      emptyState={<EmptyTrail onPrompt={(text) => void send(trail.id, "trail", text)} />}
      status={starterStatus}
      composer={<Composer targetId={trail.id} targetKind="trail" />}
    />
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
