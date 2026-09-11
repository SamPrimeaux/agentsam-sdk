import { useRef, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { ModelSelect } from "@/components/workbench/model-select";
import { cn } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";

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
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function resize() {
    const el = areaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!streaming) void send(targetId, targetKind);
    }
  }

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
    requestAnimationFrame(resize);
  }

  return (
    <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-4 md:pb-4">
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col rounded-2xl bg-card p-2 pl-3 shadow-hairline",
          "focus-within:shadow-[0_0_0_1px_var(--color-ring)]",
        )}
      >
        <Textarea
          ref={areaRef}
          value={value}
          rows={1}
          placeholder={placeholder}
          onChange={(e) => {
            setDraft(targetId, e.target.value);
            resize();
          }}
          onKeyDown={onKeyDown}
          onInput={resize}
          onPaste={(e) => {
            if (e.clipboardData.files.length) {
              e.preventDefault();
              void onFiles(e.clipboardData.files);
            }
          }}
          className="max-h-52 min-h-[44px] py-2.5"
          aria-label={placeholder}
        />
        <div className="flex items-center gap-1 pt-1 max-md:pr-14">
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            suppressHydrationWarning
            multiple
            onChange={(e) => {
              void onFiles(e.target.files);
              e.target.value = "";
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
          <span className="ml-auto" />
          {streaming ? (
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
          ) : (
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
          )}
        </div>
      </div>
    </div>
  );
}
