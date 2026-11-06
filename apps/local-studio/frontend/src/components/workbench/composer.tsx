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
import { resolveChatImages, stageChatImage, type ChatImagePayload, type ChatImageReference } from "@/lib/content/chat-images";
import { ImageLightbox } from "@/components/workbench/image-lightbox";
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
  onSubmit,
  onCancel,
  busy,
  contextLabel,
}: {
  targetId: string;
  targetKind: "chat" | "side";
  placeholder?: string;
  onSubmit?: (message: { text: string; attachments: ChatImageReference[]; images: ChatImagePayload[] }) => Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  contextLabel?: string;
}) {
  const value = useWorkStore((s) => s.drafts[targetId] ?? "");
  const { user } = useCurrentUserState();
  const [staging, setStaging] = useState(false);
  const setDraft = useWorkStore((s) => s.setDraft);
  const send = useWorkStore((s) => s.send);
  const stop = useWorkStore((s) => s.stop);
  const workStreaming = useWorkStore((s) => s.streamingIds.includes(targetId));
  const [submitting, setSubmitting] = useState(false);
  const streaming = busy ?? workStreaming;
  const cancel = () => onCancel ? onCancel() : stop(targetId);
  const runMode = useWorkStore((s) => s.runModes[targetId] ?? defaultRunModeForTarget(targetKind));
  const setRunMode = useWorkStore((s) => s.setRunMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const goal = useWorkStore((s) => targetKind === "chat" ? s.goals[targetId] : undefined);
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
      const capacity = Math.max(0, 20 - pendingAttachments.length);
      const selected = Array.from(files);
      if (!capacity) {
        toast.error("A message can include up to 20 images.");
        return;
      }
      if (selected.length > capacity) toast.message(`Only the first ${capacity} image(s) were added. The limit is 20 per message.`);
      for (const file of selected.slice(0, capacity)) {
        const image = await stageChatImage(file, user?.id || "");
        next.push({ ...image, previewUrl: URL.createObjectURL(file) });
      }
      setPendingAttachments((previous) => [...previous, ...next].slice(0, 20));
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

  async function submitWithAttachments() {
    if (staging || submitting || streaming || (!value.trim() && !pendingAttachments.length)) return;
    if (onSubmit) {
      setSubmitting(true);
      try {
        const attachments = pendingAttachments.map(({ previewUrl: _previewUrl, ...ref }) => ref);
        const images = await resolveChatImages(attachments, user?.id || "");
        await onSubmit({ text: value.trim(), attachments, images });
        // Preserve anything typed while the operation was being accepted.
        if (useWorkStore.getState().drafts[targetId] === value) setDraft(targetId, "");
        for (const attachment of pendingAttachments) if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
        setPendingAttachments([]);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "The instruction could not be sent. Your draft is retained.");
      } finally { setSubmitting(false); }
      return;
    }
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
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <IconAction
        size="icon-sm"
        variant="ghost"
        label="Attach images"
        hint="Attach up to 20 images (PNG, JPEG, WebP, 5 MB each)"
        onClick={() => fileRef.current?.click()}
      >
        <Paperclip className="size-4" />
      </IconAction>
      <RunModeSelect value={runMode} onChange={(mode) => setRunMode(targetId, mode)} compact />
      <ModelSelect compact />
    </>
  );

  const attachmentPreview = pendingAttachments.length ? (
    <div className="px-2 pt-2 pb-1" role="group" aria-label="Attached images">
      <div className="flex max-h-[376px] flex-wrap items-start gap-3 overflow-y-auto pr-1">
        {pendingAttachments.map((attachment) => (
          <div key={attachment.id} title={attachment.name} className="group relative size-32 shrink-0 overflow-hidden rounded-[18px] border border-border/70 bg-muted/60 sm:size-40 md:size-44">
            {attachment.previewUrl ? (
              <ImageLightbox src={attachment.previewUrl} alt={attachment.name} triggerClassName="size-full cursor-zoom-in">
                <img src={attachment.previewUrl} alt="" className="size-full object-contain p-1" />
              </ImageLightbox>
            ) : (
              <div className="grid size-full place-items-center text-xs text-muted-foreground">Image</div>
            )}
            <Button type="button" size="icon-sm" variant="secondary" className="absolute right-2 top-2 size-7 rounded-full opacity-100 shadow sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100" aria-label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const sendControl = (
    <Button
      type="button"
      size="icon-sm"
      aria-label="Send"
      data-composer-send=""
      className="rounded-full border-0 shadow-none hover:bg-[var(--composer-control-hover)] disabled:opacity-100"
      disabled={staging || submitting || streaming || (!value.trim() && pendingAttachments.length === 0)}
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
      onClick={cancel}
    >
      <Square className="size-3 fill-current" />
    </Button>
  );

  return (
    <div className="agentsam-composer-shell w-full min-w-0 px-[clamp(.4rem,1.2cqi,1rem)] pb-[max(.75rem,env(safe-area-inset-bottom))]"
      onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault(); }}
      onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); void onFiles(event.dataTransfer.files); } }}>
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
                  <Button type="button" size="icon-sm" variant="ghost" className="size-7" aria-label="Edit goal" onClick={() => openSideTab("goal", { title: "Edit goal", parentChatId: targetId, ephemeral: false })}>
                    <Maximize2 className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit goal</TooltipContent>
              </Tooltip>
            </>
          }
        />
      ) : null}
      <PluginPicker value={value} onChange={(next) => setDraft(targetId, next)} onAttach={() => fileRef.current?.click()} contextLabel={contextLabel}>{({ trigger, onKeyDown, onSelect }) => <AgentComposer
        value={value}
        runMode={runMode}
        onChange={(next) => setDraft(targetId, next)}
        onSend={submitWithAttachments}
        onCancel={cancel}
        streaming={streaming}
        placeholder={targetKind === "side" ? placeholder : RUN_MODE_PLACEHOLDERS[runMode]}
        toolbarStart={<>{trigger}{targetKind === 'chat' ? <ProjectPicker chatId={targetId} /> : null}{attachControl}</>}
        attachmentPreview={attachmentPreview}
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
    </div>
  );
}
