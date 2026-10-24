import { useEffect, useRef, useState } from "react";
import { ArrowUp, Maximize2, Paperclip, Pause, Play, Square, Target, Trash2 } from "lucide-react";
import { AgentComposer, GoalStatusStrip } from "@inneranimalmedia/agentsam-workbench/agent";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelSelect } from "@/components/workbench/model-select";
import { RunModeSelect } from "@/components/workbench/run-mode-select";
import { cn, formatElapsed } from "@/lib/utils";
import { defaultRunModeForTarget, useWorkStore } from "@/lib/work/store";
import { PluginPicker } from '../../../agentsam/PluginPicker';
import { ProjectPicker } from '../../../agentsam/ProjectPicker';
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { stageChatImage, type ChatImageReference } from "@/lib/content/chat-images";
import { CHAT_IMAGE_DROP_EVENT, takeChatImages } from "@/lib/content/chat-drop-queue";

const RUN_MODE_PLACEHOLDERS = {
  agent: "Work on anything…",
  plan: "Describe what you want to plan…",
  debug: "Describe the bug — evidence first, then a targeted fix",
  multitask: "Coordinate parallel work…",
  ask: "Ask anything…",
} as const;

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
  const { user } = useCurrentUserState();
  const [staging, setStaging] = useState(false);
  const setDraft = useWorkStore((s) => s.setDraft);
  const send = useWorkStore((s) => s.send);
  const stop = useWorkStore((s) => s.stop);
  const streaming = useWorkStore((s) => s.streamingIds.includes(targetId));
  const runMode = useWorkStore((s) => s.runModes[targetId] ?? defaultRunModeForTarget(targetKind));
  const setRunMode = useWorkStore((s) => s.setRunMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const goal = useWorkStore((s) => targetKind === "trail" ? s.goals[targetId] : undefined);
  const clearGoal = useWorkStore((s) => s.clearGoal);
  const toggleGoalPaused = useWorkStore((s) => s.toggleGoalPaused);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const [now, setNow] = useState(Date.now());

  const [pendingAttachments, setPendingAttachments] = useState<
    Array<ChatImageReference & { previewUrl?: string }>
  >([]);

  useEffect(() => {
    if (!goal || goal.status !== "active") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [goal?.id, goal?.status]);

  async function onFiles(files: FileList | File[] | null) {
    if (!files?.length || staging) return;
    setStaging(true);
    const next: typeof pendingAttachments = [];
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        const image = await stageChatImage(file, user?.id || "");
        next.push({ ...image, previewUrl: URL.createObjectURL(file) });
      }
      setPendingAttachments((previous) => [...previous, ...next].slice(0, 4));
    } catch (error) {
      for (const image of next) if (image.previewUrl) URL.revokeObjectURL(image.previewUrl);
      toast.error(error instanceof Error ? error.message : "Could not attach this image.");
    } finally {
      setStaging(false);
    }
  }

  useEffect(() => {
    const takePending = (event?: Event) => {
      // Wait until desktop identity has resolved before consuming queued Files.
      if (!user?.id) return;
      const intended = (event as CustomEvent<{ targetId: string }> | undefined)?.detail?.targetId;
      if (intended && intended !== targetId) return;
      const files = takeChatImages(targetId);
      if (files.length) void onFiles(files);
    };
    window.addEventListener(CHAT_IMAGE_DROP_EVENT, takePending);
    takePending();
    return () => window.removeEventListener(CHAT_IMAGE_DROP_EVENT, takePending);
    // Staging function is local by design: files are transferred once to this composer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId, user?.id]);

  function removeAttachment(id: string) {
    setPendingAttachments((previous) => {
      const hit = previous.find((a) => a.id === id);
      if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
      return previous.filter((a) => a.id !== id);
    });
  }

  function submitWithAttachments() {
    if (staging) return;
    const bag = (window as unknown as { __agentsamComposerAttachments?: unknown });
    bag.__agentsamComposerAttachments = {
      targetId, accountId: user?.id || "",
      attachments: pendingAttachments.map(({ previewUrl: _previewUrl, ...ref }) => ref),
    };
    void send(targetId, targetKind);
    for (const a of pendingAttachments) if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    setPendingAttachments([]);
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
      <IconAction
        size="icon-sm"
        variant="ghost"
        label="Attach a file"
        hint="Attach an image (PNG, JPEG, WebP, 5 MB max)"
        onClick={() => fileRef.current?.click()}
      >
        <Paperclip className="size-4" />
      </IconAction>
      <RunModeSelect value={runMode} onChange={(mode) => setRunMode(targetId, mode)} compact />
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
      disabled={staging || (!value.trim() && pendingAttachments.length === 0)}
      onClick={submitWithAttachments}
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
    <div className="agentsam-composer-shell w-full min-w-0 px-[clamp(.4rem,1.2cqi,1rem)] pb-[max(.75rem,env(safe-area-inset-bottom))]"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void onFiles(event.dataTransfer.files); } }}>
      {pendingAttachments.length ? (
        <div className="mx-auto mb-2 flex w-full max-w-6xl flex-wrap gap-2">
          {pendingAttachments.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/80 px-2 py-1.5 text-xs shadow-hairline"
            >
              {a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="size-9 rounded-md object-cover" />
              ) : (
                <span className="flex size-9 items-center justify-center rounded-md bg-muted font-semibold">
                  {a.kind === "image" ? "IMG" : "FILE"}
                </span>
              )}
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{a.name}</div>
                <div className="text-muted-foreground">
                  {a.mimeType} · {(a.size / 1024).toFixed(a.size >= 10240 ? 0 : 1)} KB
                </div>
              </div>
              <Button type="button" size="icon-sm" variant="ghost" className="size-6" aria-label={`Remove ${a.name}`} onClick={() => removeAttachment(a.id)}>
                <Trash2 className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {goal ? (
        <GoalStatusStrip
          className="mx-auto mb-2 w-full max-w-6xl rounded-xl bg-card/70 px-3 py-2 text-foreground shadow-hairline backdrop-blur"
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
        runMode={runMode}
        onChange={(next) => setDraft(targetId, next)}
        onSend={submitWithAttachments}
        onCancel={() => stop(targetId)}
        streaming={streaming}
        placeholder={targetKind === "side" ? placeholder : RUN_MODE_PLACEHOLDERS[runMode]}
        toolbarStart={<>{trigger}{attachControl}</>}
        sendControl={sendControl}
        cancelControl={cancelControl}
        containerClassName="agentsam-composer-surface mx-auto flex w-full min-w-0 max-w-6xl flex-col rounded-2xl bg-card p-2 pl-3 shadow-hairline"
        inputClassName={cn(
          "flex min-h-[44px] max-h-52 w-full resize-none rounded-lg bg-transparent px-1 py-2.5 text-sm text-foreground placeholder:text-muted-foreground",
          "focus:outline-none focus-visible:outline-none focus-visible:shadow-none disabled:cursor-not-allowed disabled:opacity-40",
        )}
        toolbarClassName="agentsam-composer-actions flex min-w-0 w-full items-center gap-1 pt-1"
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
      {targetKind === 'trail' && <div className="agentsam-start-context"><ProjectPicker trailId={targetId} /></div>}
    </div>
  );
}
