import { useEffect, useRef, useState } from "react";
import { AudioLines, ArrowUp, FolderOpen, ImagePlus, Maximize2, Mic, FileText, Monitor, Palette, Paperclip, Pause, Play, Plug, Square, Target, Trash2, X } from "lucide-react";
import { AgentComposer, GoalStatusStrip } from "@inneranimalmedia/agentsam-workbench/agent";
import { Button } from "@/components/ui/button";
import { IconAction } from "@/components/ui/icon-action";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ModelSelect } from "@/components/workbench/model-select";
import { cn, formatElapsed } from "@/lib/utils";
import { defaultRunModeForTarget, useWorkStore, type ComposerAttachment, type PendingAnnotation } from "@/lib/work/store";
import { PluginPicker } from '../../../agentsam/PluginPicker';
import { ProjectPicker } from '../../../agentsam/ProjectPicker';
import { toast } from "sonner";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { resolveChatImages, stageChatImage, stageChatFile, type ChatImagePayload, type ChatAttachmentReference } from "@/lib/content/chat-images";
import { ImageLightbox } from "@/components/workbench/image-lightbox";
import { CHAT_IMAGE_DROP_EVENT, takeChatImages } from "@/lib/content/chat-drop-queue";
import { ComposerLibraryPicker } from "./composer-library-picker";
import { isPackagedDesktop } from "@/lib/desktop/tauri";
import { buildNavigateDeepLink } from "@/lib/desktop/open-deep-link";
import { VoiceSession, startDictation, canDictate } from "./voice-session";
import "./work-voice.css";

const EMPTY_PENDING_ATTACHMENTS: ComposerAttachment[] = [];
const EMPTY_PENDING_ANNOTATIONS: PendingAnnotation[] = [];

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
  showWorkShortcuts = false,
  artifactContext,
  contextual = false,
}: {
  targetId: string;
  targetKind: "chat" | "side";
  placeholder?: string;
  onSubmit?: (message: { text: string; attachments: ChatAttachmentReference[]; images: ChatImagePayload[] }) => Promise<void>;
  onCancel?: () => void;
  busy?: boolean;
  contextLabel?: string;
  workMode?: boolean;
  /** Work context actions and the web-to-desktop handoff below the canonical composer. */
  showWorkShortcuts?: boolean;
  artifactContext?: { id: string; title: string };
  /** Compact contextual composer; retains the canonical model and plugin picker. */
  contextual?: boolean;
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
  // One persisted FIFO queue per conversation, owned by the existing Work store.
  const queued = useWorkStore(s => s.followupQueue);
  const targetQueue = queued.filter(item => item.targetId === targetId);
  const removeFollowup = useWorkStore(s => s.removeFollowup);
  const queuePaused = useWorkStore(s => s.pausedQueueTargets.includes(targetId));
  const resumeFollowups = useWorkStore(s => s.resumeFollowups);
  const runMode = useWorkStore((s) => s.runModes[targetId] ?? defaultRunModeForTarget(targetKind));
  const setRunMode = useWorkStore((s) => s.setRunMode);
  const fileRef = useRef<HTMLInputElement>(null);
  const goal = useWorkStore((s) => targetKind === "chat" ? s.goals[targetId] : undefined);
  const clearGoal = useWorkStore((s) => s.clearGoal);
  const toggleGoalPaused = useWorkStore((s) => s.toggleGoalPaused);
  const openSideTab = useWorkStore((s) => s.openSideTab);
  const [now, setNow] = useState(Date.now());

  // Store-backed pending references: moving this same composer from Chat to a
  // floating full-view window must NOT drop unsent files or image previews.
  const pendingAttachments = useWorkStore((s) => s.pendingComposerAttachments[targetId] ?? EMPTY_PENDING_ATTACHMENTS);
  const pendingAnnotations = useWorkStore((s) => s.pendingAnnotations[targetId] ?? EMPTY_PENDING_ANNOTATIONS);
  const setPendingAttachments = (next: ComposerAttachment[] | ((current: ComposerAttachment[]) => ComposerAttachment[])) =>
    useWorkStore.getState().setPendingComposerAttachments(targetId, next);

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
        toast.error("A message can include up to 20 attachments.");
        return;
      }
      if (selected.length > capacity) toast.message(`Only the first ${capacity} file(s) were added. The limit is 20 per message.`);
      for (const file of selected.slice(0, capacity)) {
        const supportedImage = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
        if (supportedImage) {
          const image = await stageChatImage(file, user?.id || '');
          next.push({ ...image, previewUrl: URL.createObjectURL(file) });
        } else {
          // Preserve the real file identity and bytes: never expand a document
          // into the visible prompt or silently invent a project workspace file.
          try { next.push(await stageChatFile(file, user?.id || '')); }
          catch (reason) { toast.error(reason instanceof Error ? reason.message : 'Could not attach '+file.name); }
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
    if ((pendingAnnotations.length || artifactContext) && typeof navigator !== 'undefined' && !navigator.onLine) {
      toast.message('Annotations will stay attached. Send them when this conversation is online.');
      return;
    }
    if (streaming && (onSubmit || pendingAttachments.length)) {
      toast.message('This request stays in your draft until the current operation finishes.');
      return;
    }
    if (staging || submitting || (!value.trim() && !pendingAttachments.length && !pendingAnnotations.length)) return;
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
    if (artifactContext) {
      const page = 'artifact:slides:' + artifactContext.id;
      useWorkStore.getState().setPendingAnnotations(targetId, current => current.some(item => item.page === page) ? current : [...current, {
        id: crypto.randomUUID(), page, tag: 'slides', label: artifactContext.title, text: artifactContext.title,
      }].slice(-8));
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
  function openDesktopApp() {
    const currentPath = window.location.pathname + window.location.search;
    const deepLink = buildNavigateDeepLink(currentPath);
    if (!deepLink) {
      toast.error("This page cannot be handed off to AgentSam Desktop.");
      return;
    }
    window.location.assign(deepLink);
  }
  useEffect(() => {
    const fromMini = (event: Event) => {
      const requestedId = (event as CustomEvent<{ targetId: string }>).detail?.targetId;
      if (requestedId === targetId) setImageMode(true);
    };
    window.addEventListener('agentsam:composer-image-mode', fromMini);
    return () => window.removeEventListener('agentsam:composer-image-mode', fromMini);
  }, [targetId]);
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

  const attachmentPreview = !contextual && (pendingAttachments.length || pendingAnnotations.length) ? (
    <div className="px-2 pt-2 pb-1" role="group" aria-label="Message context and attached files">
      <div className="flex max-h-[376px] flex-wrap items-start gap-3 overflow-y-auto pr-1">
        {pendingAnnotations.map(annotation => annotation.tag === "design-code-handoff" ? (
          <div key={annotation.id} className="as-composer-context-chip" title="Design Canvas context" data-composer-context="design">
            <Palette size={14} aria-hidden="true" />
            <span>Design</span>
            <IconAction type="button" size="icon-sm" variant="ghost" className="as-composer-context-remove"
              label="Remove Design context"
              onClick={() => useWorkStore.getState().setPendingAnnotations(targetId, items => items.filter(item => item.id !== annotation.id))}>
              <X className="size-3.5"/>
            </IconAction>
          </div>
        ) : (
          <div key={annotation.id} className="group relative flex h-[66px] max-w-56 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-2 pr-8 text-foreground shadow-sm" title={annotation.page}>
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-muted text-sm" aria-hidden="true">⌖</span>
            <div className="min-w-0">
              <span className="block truncate text-xs font-medium">{annotation.label || 'Selected annotation'}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{annotation.object ? 'CAD object' : annotation.tag} · Annotation</span>
            </div>
            <IconAction type="button" size="icon-sm" variant="ghost" className="absolute right-1 top-1 size-6 rounded-md"
              label={`Remove annotation ${annotation.label}`}
              onClick={() => useWorkStore.getState().setPendingAnnotations(targetId, items => items.filter(item => item.id !== annotation.id))}>
              <X className="size-3.5"/>
            </IconAction>
          </div>
        ))}
        {pendingAttachments.map((attachment) => (
          <div key={attachment.id} title={attachment.name} className="group relative flex h-[66px] max-w-56 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-2 pr-8 text-foreground shadow-sm">
            {attachment.previewUrl ? (
              <ImageLightbox
                src={attachment.previewUrl}
                alt={attachment.name}
                attachment={attachment.kind === "image" ? attachment : undefined}
                chatId={targetKind === "chat" ? targetId : useWorkStore.getState().activeChatId}
                assistant={<Composer targetId={targetId} targetKind={targetKind} placeholder="Ask about this file" contextLabel={"Image: " + attachment.name} contextual />}
                triggerClassName="size-12 shrink-0 overflow-hidden rounded-md bg-muted"
              >
                <img src={attachment.previewUrl} alt="" className="size-full object-cover" />
              </ImageLightbox>
            ) : <FileText className="size-8 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <div className="min-w-0"><span className="block truncate text-xs font-medium">{attachment.name}</span>
              <span className="text-[10px] text-muted-foreground">{attachment.kind === 'image' ? 'Image' : 'File'} · {Math.ceil(attachment.size / 1024)} KB</span></div>
            <IconAction type="button" size="icon-sm" variant="ghost" className="absolute right-1 top-1 size-6 rounded-md" label={`Remove ${attachment.name}`} onClick={() => removeAttachment(attachment.id)}>
              <X className="size-3.5" />
            </IconAction>
          </div>
        ))}
      </div>
    </div>
  ) : null;

  const mobileVoiceIdle = !value.trim() && !pendingAttachments.length && !pendingAnnotations.length && !streaming;
  const sendControl = (
    <span className="as-composer-send-wrap" data-mobile-voice-idle={mobileVoiceIdle}><button type="button" className="as-composer-mobile-voice" aria-label="Start voice" onClick={() => setVoiceOpen(true)}><AudioLines size={20}/></button><button type="button" className="as-composer-voice-quick" onClick={() => setVoiceOpen(true)}>Start voice</button><IconAction
      type="button"
      size="icon-sm"
      label={streaming ? "Queue follow-up" : "Send"}
      data-composer-send=""
      className="rounded-full border-0 shadow-none hover:bg-[var(--composer-control-hover)] disabled:opacity-100"
      disabled={staging || submitting || (streaming && (!!onSubmit || pendingAttachments.length > 0)) || (!value.trim() && pendingAttachments.length === 0 && pendingAnnotations.length === 0)}
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
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        suppressHydrationWarning
        multiple
        accept="image/png,image/jpeg,image/webp,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.csv,.json,.yaml,.yml,.html,.xml,.svg,.ts,.tsx,.js,.jsx,.py,.css,.sql,.zip,.glb,.gltf,.stl,.ifc,.mov,.mp4"
        onChange={(event) => {
          void onFiles(event.target.files);
          event.target.value = "";
        }}
      />
      {!contextual && goal ? (
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
      {!contextual && targetQueue.length ? (
        <div className="mx-auto mb-2 flex w-full max-w-6xl flex-col gap-1.5" role="list" aria-label="Queued follow-ups">
          {targetQueue.map((item) => (
            <div key={item.id} role="listitem" data-composer-queued="" className="flex min-w-0 items-center gap-2 rounded-full border border-border/60 bg-card/50 px-3 py-1.5 text-xs text-muted-foreground opacity-70">
              <span className="min-w-0 flex-1 truncate">{item.text}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-wide">Queued</span>
              <IconAction type="button" size="icon-sm" label="Remove queued message" className="size-6 shrink-0 rounded-full" onClick={() => removeFollowup(item.id)}><X className="size-3.5" /></IconAction>
            </div>
          ))}
          {!streaming ? <button type="button" onClick={() => resumeFollowups(targetId)}>{queuePaused ? "Resume queued follow-ups" : "Send next queued follow-up"}</button> : null}
        </div>
      ) : null}
      <PluginPicker targetChatId={targetKind === "chat" ? targetId : undefined} value={value} onChange={(next) => setDraft(targetId, next)} onAttach={() => fileRef.current?.click()}
        onLibrary={() => setLibraryOpen(true)}
        onImage={() => setImageMode(true)}
        onWebSearch={webSearch}
        onProject={targetKind === 'chat' ? openProject : undefined}
        activeMode={runMode}
        onModeChange={mode => setRunMode(targetId,mode)}
        contextLabel={contextLabel}>{({ trigger, onKeyDown, onSelect, openPlugins }) => <>
        <AgentComposer
        value={value}
        runMode={runMode}
        onChange={(next) => setDraft(targetId, next)}
        onSend={submitWithAttachments}
        onCancel={cancel}
        streaming={streaming}
        queueWhileStreaming={!onSubmit && !pendingAttachments.length}
        hasPendingContent={pendingAnnotations.length > 0}
        placeholder={imageMode ? 'Describe the image to create…' : streaming && !onSubmit ? 'Follow up' : artifactContext ? "Ask about these slides…" : targetKind === "side" ? placeholder : !workMode ? "Ask AgentSam" : RUN_MODE_PLACEHOLDERS[runMode]}
        toolbarStart={<>{trigger}{imageMode ? <button type="button" className="as-work-mode-indicator" onClick={() => setImageMode(false)} title="Leave image creation mode"><ImagePlus size={14}/> Image creation <X size={13}/></button> : null}</>}
        toolbarEnd={<><ModelSelect workStyle /><IconAction type="button" size="icon-sm" className="as-composer-dictate" data-listening={dictating} label={dictating ? 'Stop dictation' : 'Dictate'} onClick={beginDictation}><Mic size={17}/></IconAction></>}
        attachmentPreview={attachmentPreview}
        sendControl={sendControl}
        cancelControl={cancelControl}
        containerClassName={cn('agentsam-composer-surface mx-auto flex w-full min-w-0 max-w-6xl flex-col rounded-2xl bg-card p-2 pl-3 shadow-hairline', contextual && 'as-image-context-composer', workMode && 'as-work-composer-surface', artifactContext && 'as-artifact-composer', (value.trim() || pendingAttachments.length || pendingAnnotations.length) && 'has-draft')}
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
        {!contextual && workMode && showWorkShortcuts && <div className="as-work-shortcuts" role="group" aria-label="Work context and attachments">
          <div className="as-work-shortcuts-primary">
            <button type="button" onClick={openProject}><FolderOpen size={17} aria-hidden="true"/> Choose project</button>
            <button type="button" onClick={()=>fileRef.current?.click()}><Paperclip size={17} aria-hidden="true"/> Files</button>
            <button type="button" onClick={openPlugins}><Plug size={17} aria-hidden="true"/> Plugins</button>
          </div>
          {!isPackagedDesktop() ? <button type="button" className="as-work-open-desktop" onClick={openDesktopApp} title="Continue this AgentSam workspace in the desktop app">
            <Monitor size={16} aria-hidden="true"/> Open in desktop app
          </button> : null}
        </div>}
        {!contextual && targetKind === 'chat' ? <ProjectPicker chatId={targetId} showTrigger={false} /> : null}
      </>}</PluginPicker>
      <ComposerLibraryPicker open={libraryOpen} onClose={() => setLibraryOpen(false)} onAttach={async files => { await onFiles(files); }} />
      <VoiceSession open={voiceOpen} onClose={() => setVoiceOpen(false)} targetId={targetId} targetKind={targetKind} onSubmit={onSubmit ? (text) => onSubmit({text, attachments: [], images: []}) : undefined} />
    </div>
  );
}
