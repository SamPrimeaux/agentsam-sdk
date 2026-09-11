import { useRef, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const draft = useWorkStore((s) => s.drafts[targetId] ?? "");
  const setDraft = useWorkStore((s) => s.setDraft);
  const send = useWorkStore((s) => s.send);
  const busy = useWorkStore((s) => s.agentBusy);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  function submitValue() {
    const typed = areaRef.current?.value ?? draft;
    void send(targetId, targetKind, typed);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitValue();
  }

  function onKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitValue();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      data-composer={targetKind}
      className="border-t border-border px-3 py-3"
    >
      <div className="flex items-end gap-2 rounded-2xl bg-surface px-3 py-2">
        <button
          type="button"
          aria-label="Attach"
          className="mb-0.5 flex size-11 shrink-0 items-center justify-center rounded-full text-clay hover:text-fg md:size-9"
        >
          <Paperclip className="size-4" />
        </button>
        <textarea
          ref={areaRef}
          name="prompt"
          value={draft}
          onChange={(e) => setDraft(targetId, e.target.value)}
          onKeyDown={onKey}
          placeholder={placeholder}
          rows={1}
          aria-label={placeholder}
          className="max-h-40 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-sm outline-none placeholder:text-clay"
        />
        <span className="mb-2 hidden shrink-0 text-xs text-clay md:inline">4.6</span>
        <Button
          type="submit"
          size="icon"
          disabled={busy}
          aria-label="Send"
          className="mb-0.5 size-11 shrink-0 rounded-full md:size-9"
        >
          <ArrowUp className="size-4" />
        </Button>
      </div>
    </form>
  );
}
