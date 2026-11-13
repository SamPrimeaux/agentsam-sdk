import { useEffect, useRef, useState } from "react";
import { ArrowUp, ImagePlus, Maximize2, Mic, Paperclip, Pause, Play, Square, Target, Trash2, X } from "lucide-react";
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
import { ComposerLibraryPicker } from "./composer-library-picker";
import { VoiceSession, startDictation, canDictate } from "./voice-session";
import "./composer-library.css";
import "./work-voice.css";

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
  workMode = false,
}: {
  targetId: string;
  targetKind: "chat" | "side";
  placeholder?: string;
  onSubmit?: (message: { text: string; attachments: ChatImageReference[]; images: ChatImagePayload[] }) => Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  contextLabel?: string;
  workMode?: boolean;
}) {
  const value = useWorkStore((s) => s.drafts[targetId] ?? "");
  const { user } = useCurrentUserState();
  const [staging, setStaging] = useState(false);
  const [libraryOpen,setLibraryOpen] = useState(false);
  const [voiceOpen,setVoiceOpen] = useState(false);
  const [imageMode,setImageMode] = useState(false);
  const [dictating,setDictating] = useState(false);
  const dictationStop = useRef<(() => void) | null>(null);
  useEffect(() => () => { dictationStop.current?.(); }, []);
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
        const supportedImage = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
        const supportedText = ['text/plain', 'text/markdown', 'text/csv', 'text/html', 'application/json', 'application/xml'].includes(file.type)
          || /\.(md|txt|csv|json|html|xml)$/i.test(file.name);
        if (supportedImage) {
          const image = await stageChatImage(file, user?.id || '');
          next.push({ ...image, previewUrl: URL.createObjectURL(file) });
        } else if (supportedText && file.size <= 1_000_000) {
          const contents = (await file.text()).slice(0, 24_000).replaceAll('```', '``\u200b`');
          const old = useWorkStore.getState().drafts[targetId] || '';
          setDraft(targetId, [old, 'Attached reference file: ' + file.name + '\n```text\n' + contents + '\n```'].filter(Boolean).join('\n\n'));
        } else {
          toast.error('Unsupported file: ' + file.name + '. Attach PNG/JPEG/WebP or a text, Markdown, JSON, CSV, HTML or XML file under 1 MB.');
        }
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
    if (imageMode) { await generateImage(); return; }
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

  function webSearch() {
    const state = useWorkStore.getState();
    const id = state.openSideTab('browser', { ephemeral: false });
    if (value.trim()) state.setTabUrl(id, 'https://duckduckgo.com/?q=' + encodeURIComponent(value.trim()));
  }
  function openProject() {
    window.dispatchEvent(new Event('agentsam:open-project-picker:' + targetId));
  }
  function beginDictation() {
    if (dictating) { dictationStop.current?.(); dictationStop.current = null; setDictating(false); return; }
    if (!canDictate()) { toast.error('Dictation is not supported by this browser.'); return; }
    setDictating(true);
    dictationStop.current = startDictation(text => {
      const current = useWorkStore.getState().drafts[targetId] || '';
      setDraft(targetId, [current.trim(), text].filter(Boolean).join(' '));
      setDictating(false);
    }, message => {
      if (!message.startsWith('Listening')) { setDictating(false); toast.message(message); }
    });
  }
  async function generateImage() {
    const prompt = value.trim();
    if (!prompt || submitting || staging) return;
    setSubmitting(true);
    try {
      // This is the existing image-generation runtime, not a fabricated chat-only image mode.
      const response = await fetch('/api/admin/agentsam/chat', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ message: prompt, task_type: 'image_generation', mode: 'image', lane: 'image',
          workflow_key: 'commerce_creative_studio', context: { page: '/admin/agentsam',
            task_type: 'image_generation', mode: 'image', lane: 'image', workflow_key: 'commerce_creative_studio' } }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ai?.image_base64) throw new Error(String(body.ai?.error_code || body.error || 'Image generation is not configured or returned no artwork.'));
      const base64 = String(body.ai.image_base64).split(',').pop() || '';
      const decoded = atob(base64);
      const bytes = Uint8Array.from(decoded, char => char.charCodeAt(0));
      const mime = String(body.ai.mime_type || 'image/png');
      const file = new File([bytes], 'agentsam-generated-' + Date.now() + (mime === 'image/jpeg' ? '.jpg' : '.png'), { type: mime });
      if (file.size > 5_000_000) throw new Error('The image exceeds the 5 MB message attachment limit.');
      const asset = await stageChatImage(file, user?.id || '');
      setPendingAttachments(items => [...items, { ...asset, previewUrl: URL.createObjectURL(file) }].slice(0,20));
      if (useWorkStore.getState().drafts[targetId] === value) setDraft(targetId, '');
      setImageMode(false);
      toast.success('Image generated and attached for review.');
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Image generation could not run.'); }
    finally { setSubmitting(false); }
  }

  const attachControl = (
    <>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        suppressHydrationWarning
        multiple
        accept="image/png,image/jpeg,image/webp,.txt,.md,.csv,.json,.html,.xml"
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      <IconAction
        size="icon-sm"
        variant="ghost"
        label="Attach images"
        hint="Attach images or reference text files"
        onClick={() => fileRef.current?.click()}
      >
        <Paperclip className="size-4" />
      </IconAction>
      {!workMode ? <><RunModeSelect value={runMode} onChange={(mode) => setRunMode(targetId, mode)} compact /><ModelSelect compact /></> : null}
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
    <span className="as-composer-send-wrap"><button type="button" className="as-composer-voice-quick" onClick={() => setVoiceOpen(true)}>Start voice</button><IconAction
      type="button"
      size="icon-sm"
      label="Send"
      data-composer-send=""
      className="rounded-full border-0 shadow-none hover:bg-[var(--composer-control-hover)] disabled:opacity-100"
      disabled={staging || submitting || streaming || (!value.trim() && pendingAttachments.length === 0)}
      onClick={submitWithAttachments}
    >
      <ArrowUp className="size-4" />
    </IconAction></span>
  );

  const cancelControl = (
    <IconAction
      type="button"
      size="icon-sm"
      variant="secondary"
      label="Stop"
      data-composer-stop=""
      className="rounded-full border-0 shadow-none disabled:opacity-100"
      onClick={cancel}
    >
      <Square className="size-3 fill-current" />
    </IconAction>
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
      <PluginPicker value={value} onChange={(next) => setDraft(targetId, next)} onAttach={() => fileRef.current?.click()}
        onLibrary={workMode ? () => setLibraryOpen(true) : undefined}
        onImage={workMode ? () => setImageMode(true) : undefined}
        onWebSearch={workMode ? webSearch : undefined}
        onProject={workMode && targetKind === 'chat' ? openProject : undefined}
        activeMode={workMode ? runMode : undefined}
        onModeChange={workMode ? mode => setRunMode(targetId,mode) : undefined}
        contextLabel={contextLabel}>{({ trigger, onKeyDown, onSelect }) => <><AgentComposer
        value={value}
        runMode={runMode}
        onChange={(next) => setDraft(targetId, next)}
        onSend={submitWithAttachments}
        onCancel={cancel}
        streaming={streaming}
        placeholder={imageMode ? 'Describe the image to create…' : targetKind === "side" ? placeholder : RUN_MODE_PLACEHOLDERS[runMode]}
        toolbarStart={<>{trigger}{!workMode && targetKind === 'chat' ? <ProjectPicker chatId={targetId} /> : null}{!workMode ? attachControl : <>
          <button type="button" className="as-work-mode-indicator" onClick={() => setImageMode(false)} title={imageMode ? 'Leave image creation mode' : 'Select active mode from the + menu'}>{imageMode ? <><ImagePlus size={14}/> Image creation <X size={13}/></> : <>Mode: {runMode[0].toUpperCase() + runMode.slice(1)}</>}</button>
        </>}</>}
        toolbarEnd={workMode ? <><ModelSelect workStyle /><IconAction type="button" size="icon-sm" className="as-composer-dictate" data-listening={dictating} label={dictating ? 'Stop dictation' : 'Dictate'} onClick={beginDictation}><Mic size={17}/></IconAction></> : null}
        attachmentPreview={attachmentPreview}
        sendControl={sendControl}
        cancelControl={cancelControl}
        containerClassName={cn('agentsam-composer-surface mx-auto flex w-full min-w-0 max-w-6xl flex-col rounded-2xl bg-card p-2 pl-3 shadow-hairline', workMode && 'as-work-composer-surface')}
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
      />
        {workMode && targetKind === 'chat' ? <div className="as-work-composer-under"><ProjectPicker chatId={targetId}/></div> : null}
      </>}</PluginPicker>
      <ComposerLibraryPicker open={libraryOpen} onClose={() => setLibraryOpen(false)} onAttach={async file => { await onFiles([file]); }} />
      <VoiceSession open={voiceOpen} onClose={() => setVoiceOpen(false)} targetId={targetId} targetKind={targetKind} />
    </div>
  );
}
