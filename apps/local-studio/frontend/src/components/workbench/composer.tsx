import { useEffect, useRef, useState } from "react";
import { ArrowUp, Maximize2, Paperclip, Pause, Play, Square, Target, Trash2 } from "lucide-react";
import { AgentComposer, GoalStatusStrip } from "@inneranimalmedia/agentsam-workbench/agent";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelSelect } from "@/components/workbench/model-select";
import { cn, formatElapsed } from "@/lib/utils";
import { useWorkStore } from "@/lib/work/store";
import { PluginPicker } from '../../../agentsam/PluginPicker';
import { Nav } from '@inneranimalmedia/agentsam-nav';

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
  const goal = useWorkStore((s) => targetKind === "trail" ? s.goals[targetId] : undefined);
  const clearGoal = useWorkStore((s) => s.clearGoal);
  const toggleGoalPaused = useWorkStore((s) => s.toggleGoalPaused);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!goal || goal.status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [goal?.id, goal?.status]);

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
      data-composer-send=""
      className="rounded-full border-0 shadow-none hover:bg-[var(--composer-control-hover)] disabled:opacity-100"
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
      data-composer-stop=""
      className="rounded-full border-0 shadow-none disabled:opacity-100"
      onClick={() => stop(targetId)}
    >
      <Square className="size-3 fill-current" />
    </Button>
  );

  return (
    <div className="px-3 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-4 md:pb-4">
      {goal ? (
        <GoalStatusStrip
          className="mx-auto mb-2 w-full max-w-3xl rounded-xl bg-card/70 px-3 py-2 text-foreground shadow-hairline backdrop-blur"
          icon={<Target className="size-3.5 text-accent" />}
          label={goal.status === "paused" ? "Goal paused" : "Pursuing goal"}
          title={goal.title}
          preview={goal.preview}
          elapsed={formatElapsed(Math.max(0, now - goal.startedAt))}
          actions={
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-sm" variant="ghost" className="size-7" aria-label="Clear goal" onClick={() => clearGoal(targetId)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear goal</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-sm" variant="ghost" className="size-7" aria-label={goal.status === "paused" ? "Resume goal" : "Pause goal"} onClick={() => toggleGoalPaused(targetId)}>
                    {goal.status === "paused" ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{goal.status === "paused" ? "Resume goal" : "Pause goal"}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button type="button" size="icon-sm" variant="ghost" className="size-7" aria-label="Edit goal" onClick={() => openSideTab("goal", { title: "Edit goal", parentTrailId: targetId, ephemeral: false })}>
                    <Maximize2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit goal</TooltipContent>
              </Tooltip>
            </>
          }
        />
      ) : null}
      <PluginPicker value={value} onChange={(next) => setDraft(targetId, next)}>{({ trigger, onKeyDown, onSelect }) => <AgentComposer
        value={value}
        onChange={(next) => setDraft(targetId, next)}
        onSend={() => send(targetId, targetKind)}
        onCancel={() => stop(targetId)}
        streaming={streaming}
        placeholder={placeholder}
        toolbarStart={<>{trigger}{attachControl}</>}
        sendControl={sendControl}
        cancelControl={cancelControl}
        containerClassName={cn(
          "mx-auto flex w-full max-w-3xl flex-col rounded-2xl bg-card p-2 pl-3 shadow-hairline",
          "focus-within:shadow-[0_0_0_1.5px_var(--color-accent)]",
        )}
        inputClassName={cn(
          "flex min-h-[44px] max-h-52 w-full resize-none rounded-lg bg-transparent px-1 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus-visible:outline-none focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-40",
        )}
        toolbarClassName="flex items-center gap-1 pt-1 max-md:pr-14"
        textareaProps={{
          onKeyDown,
          onSelect: (event) => onSelect(event.currentTarget.selectionStart),
          onInput: (event) => onSelect(event.currentTarget.selectionStart),
          suppressHydrationWarning: true,
          onPaste: (event) => {
            if (event.clipboardData.files.length) {
              event.preventDefault();
              void onFiles(event.clipboardData.files);
            }
          },
        }}
      />}</PluginPicker>
      {targetKind === 'trail' && <div className="agentsam-start-context"><Nav.ProjectContext /></div>}
    </div>
  );
}
