import { useCallback, useRef, useState } from "react";
import { ArrowUp, Check, Cloud, Loader2, Paperclip, Plus, Square } from "lucide-react";
import { AgentComposer } from "@inneranimalmedia/agentsam-workbench/agent";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelSelect } from "@/components/workbench/model-select";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";

function PluginMenu({ onMention }: { onMention: (mention: string) => void }) {
  const [status, setStatus] = useState<"unknown" | "loading" | "connected" | "available">("unknown");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const response = await fetch("/api/connections", { credentials: "same-origin" });
      const body = (await response.json().catch(() => ({}))) as {
        connections?: Array<{ provider?: string; kind?: string; status?: string }>;
      };
      const connection = body.connections?.find((row) => row.provider === "cloudflare" && row.kind === "oauth");
      setStatus(connection?.status === "connected" ? "connected" : "available");
    } catch {
      setStatus("available");
    }
  }, []);

  const select = useCallback(async () => {
    if (status === "connected") {
      onMention("@agentsam-mcp");
      return;
    }
    const response = await fetch("/api/connections/cloudflare/start", { credentials: "same-origin" });
    const body = (await response.json().catch(() => ({}))) as { authorize_url?: string };
    if (response.ok && body.authorize_url) window.location.assign(body.authorize_url);
  }, [onMention, status]);

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) void load(); }}>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Add an AgentSam plugin">
          <Plus className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>Connected tools</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => void select()}>
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-accent">
            <Cloud className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-medium">AgentSam MCP</span>
            <span className="truncate text-[11px] text-muted-foreground">Cloudflare account access</span>
          </span>
          {status === "loading" ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          {status === "connected" ? <Check className="size-4 text-accent" aria-label="Connected" /> : null}
          {status === "available" || status === "unknown" ? (
            <span className="text-xs font-medium text-accent">Connect</span>
          ) : null}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Composer({
  targetId,
  targetKind,
  placeholder = "Work with AgentSam",
}: {
  targetId: string;
  targetKind: "trail" | "side";
  placeholder?: string;
}) {
  const value = useWorkStore((s) => s.drafts[targetId] ?? "");
  const setDraft = useWorkStore((s) => s.setDraft);
  const send = useWorkStore((s) => s.send);
  const stop = useWorkStore((s) => s.stop);
  const streaming = useWorkStore((s) => s.streamingIds.includes(targetId));
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const chunks: string[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (file.size > 200_000) continue;
      const text = await file.text();
      chunks.push(`Attached \`${file.name}\`:\n\`\`\`${file.name}\n${text.slice(0, 8000)}\n\`\`\``);
    }
    if (!chunks.length) return;
    setDraft(targetId, [value, ...chunks].filter(Boolean).join("\n\n"));
  }

  const attachControl = (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        suppressHydrationWarning
        multiple
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <PluginMenu
        onMention={(mention) => {
          const next = [value.trimEnd(), mention].filter(Boolean).join(" ");
          setDraft(targetId, `${next} `);
        }}
      />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        aria-label="Attach a file"
        onClick={() => fileRef.current?.click()}
      >
        <Paperclip className="size-4" />
      </Button>
      <ModelSelect compact />
    </>
  );

  const sendControl = (
    <Button
      type="button"
      size="icon-sm"
      aria-label="Send"
      className="rounded-full"
      disabled={!value.trim()}
      onClick={() => void send(targetId, targetKind)}
    >
      <ArrowUp className="size-4" />
    </Button>
  );

  const cancelControl = (
    <Button
      type="button"
      size="icon-sm"
      variant="secondary"
      aria-label="Stop"
      className="rounded-full"
      onClick={() => stop(targetId)}
    >
      <Square className="size-3 fill-current" />
    </Button>
  );

  return (
    <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-4 md:pb-4">
      <AgentComposer
        value={value}
        onChange={(next) => setDraft(targetId, next)}
        onSend={() => send(targetId, targetKind)}
        onCancel={() => stop(targetId)}
        streaming={streaming}
        placeholder={placeholder}
        toolbarStart={attachControl}
        sendControl={sendControl}
        cancelControl={cancelControl}
        containerClassName={cn(
          "mx-auto flex w-full max-w-3xl flex-col rounded-2xl bg-card p-2 pl-3 shadow-hairline",
          "focus-within:shadow-[0_0_0_1px_var(--color-ring)]",
        )}
        inputClassName={cn(
          "flex min-h-[44px] max-h-52 w-full resize-none rounded-lg bg-transparent px-1 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
          "focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40",
        )}
        toolbarClassName="flex items-center gap-1 pt-1 max-md:pr-14"
        textareaProps={{
          suppressHydrationWarning: true,
          onPaste: (event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              void onFiles(event.clipboardData.files);
            }
          },
        }}
      />
    </div>
  );
}
