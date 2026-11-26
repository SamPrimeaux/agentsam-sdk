import { IconAction } from "@/components/ui/icon-action";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { Download, FileText, FileCode2, ArrowUpRight, ImageIcon } from "lucide-react";
import type { Artifact } from "@inneranimalmedia/agentsam-local-shared";
import { createIndexedDbContentStorage } from "@inneranimalmedia/agentsam-content";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { stageChatFile, type ChatAttachmentReference, type ChatImageReference } from "@/lib/content/chat-images";
import { AgentConversationSurface, AgentThread } from "@inneranimalmedia/agentsam-workbench/agent";
import { MessageMarkdown } from "@/components/workbench/markdown";
import { Composer } from "@/components/workbench/composer";
import { StudioMark } from "@/components/mark";
import { formatElapsed } from "@/lib/utils";
import { useWorkStore, useActiveChat } from "@/lib/work/store";
import type { ChatMessage } from "@inneranimalmedia/agentsam-local-shared";
import { Button } from "@/components/ui/button";
import { ImageLightbox } from "@/components/workbench/image-lightbox";

const STARTERS = [
  "Sketch a dual-pane React layout with an ephemeral helper chat",
  "Add a landing hero to index.html and preview it",
  "Prepare this workspace for Cloudflare Pages and GitHub Actions",
];

/** A chat resource retains its original provider identity when opened in Files. */
function openChatAttachment(ref: ChatAttachmentReference) {
  const store = useWorkStore.getState();
  store.openSideTab('files', {title: ref.name, fileId: null, ephemeral: false,
    attachedResource: {blobId: ref.source.blobId, name: ref.name,
      mimeType: ref.mimeType, size: ref.size, kind: ref.kind}});
  store.setSideOpen(true);
}

function ConversationAttachmentCard({ refInfo }: {refInfo: ChatAttachmentReference}) {
  if (refInfo.kind === 'image') return <div className="min-w-0 w-[184px] rounded-xl border border-border bg-card p-1.5 text-foreground shadow-sm">
    <ConversationImage refInfo={refInfo} />
    <button type="button" className="mt-1 flex w-full min-w-0 items-center gap-1 rounded-md px-1 py-0.5 text-left text-[11px] hover:bg-muted"
      title={'Open '+refInfo.name+' in Files'} onClick={()=>openChatAttachment(refInfo)}>
      <ImageIcon className="size-3.5 shrink-0"/><span className="min-w-0 flex-1 truncate">{refInfo.name}</span><ArrowUpRight className="size-3 shrink-0"/>
    </button>
  </div>;
  return <button type="button" onClick={()=>openChatAttachment(refInfo)} title={'Open '+refInfo.name+' in Files'}
    className="flex max-w-[260px] items-center gap-2 rounded-xl border border-border bg-card p-2.5 text-left text-foreground shadow-sm transition-colors hover:bg-muted/60">
    <FileText className="size-7 shrink-0 text-muted-foreground"/><span className="min-w-0 flex-1"><strong className="block truncate text-xs font-medium">{refInfo.name}</strong>
      <small className="text-[10px] text-muted-foreground">File · {Math.ceil(refInfo.size/1024)} KB · Open in Files</small></span>
    <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground"/>
  </button>;
}

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
    <ImageLightbox src={url} alt={refInfo.name} triggerClassName="block aspect-square w-full overflow-hidden rounded-xl border border-border/50 bg-black/10">
      <img src={url} alt={refInfo.name} title={refInfo.name} className="size-full object-cover" />
    </ImageLightbox>
  ) : <span className="grid aspect-square place-items-center rounded-xl border border-border/50 bg-muted px-2 text-center text-xs opacity-70">{refInfo.name} · image stored locally</span>;
}

function WorkOutputCards({ files }: {files: Artifact[]}) {
  const openSideTab = useWorkStore(state => state.openSideTab);
  const { user } = useCurrentUserState();
  const projectFiles = useWorkStore(state => state.projects.find(project => project.id === state.activeProjectId)?.files) ?? [];
  if (!files.length) return null;
  async function open(file: Artifact) {
    const inProject = projectFiles.find(item=>item.path===file.path);
    if (inProject) {
      openSideTab('files', {fileId:inProject.id, attachedResource:null,ephemeral:false,title:file.title||file.path});
    } else {
      if (!user?.id) throw new Error('Sign in to open this output in Files.');
      // A generated message output is a resource, not necessarily a saved project
      // file. View the original bytes without silently assigning it to a project.
      const ref = await stageChatFile(new File([file.content],file.path.split('/').pop()||'output.txt',{type:'text/plain'}), user.id);
      openChatAttachment(ref);
    }
    useWorkStore.getState().setSideOpen(true);
  }
  function download(file: Artifact) {
    const blob = new Blob([file.content], {type:/\\.(md|txt|markdown)$/.test(file.path)?'text/plain':'text/html'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href=url;link.download=file.path.split('/').pop() || 'document';
    document.body.append(link);link.click();link.remove();
    window.setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }
  return <div className="agentsam-work-output-cards" aria-label="Created outputs">
    {files.slice(-8).map(file => {
      const inProject = projectFiles.some(item=>item.path===file.path);
      const document = /\\.(md|txt|markdown|agentdoc\\.html)$/.test(file.path);
      return <div key={file.id} className="agentsam-work-output-card">
        <button type="button" className="agentsam-work-output-card__main"
          onClick={()=>{void open(file).catch(error=>toast.error(error instanceof Error?error.message:'Could not open output'));}}
          title={'Open '+(file.title||file.path)+' in Files'}>
          {document ? <FileText size={19} aria-hidden="true"/>:<FileCode2 size={19} aria-hidden="true"/>}
          <span><strong>{file.title || file.path.split('/').pop()}</strong>
            <small>{document?'Document':'File'}</small></span>
          <ArrowUpRight className="agentsam-work-output-card__open" size={16} aria-hidden="true"/>
        </button>
        <IconAction type="button" className="agentsam-work-output-card__download" label={'Download '+(file.title||file.path)}
          hint="Download output" onClick={()=>download(file)}><Download size={16}/></IconAction>
      </div>;
    })}
  </div>;
}

function MessageBubble({
  message,
  chatId,
  streaming,
  startedAt,
  outputs,
}: {
  message: ChatMessage;
  chatId?: string;
  streaming?: boolean;
  startedAt?: number;
  outputs?: Artifact[];
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!streaming) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [streaming]);

  if (message.role === "user") {
    const refs = Array.isArray(message.metadata?.attachments)
      ? (message.metadata.attachments as ChatAttachmentReference[]).filter(ref =>
          ref && (ref.kind === 'image' || ref.kind === 'file') && ref.source?.type === 'blob') : [];
    const annotations = Array.isArray(message.metadata?.annotations)
      ? (message.metadata.annotations as Array<{id:string;label:string;tag:string;object?:{id:string}}>).filter(a => a && typeof a.label === 'string').slice(0,8) : [];
    return (
      <div className="flex flex-col items-end gap-1.5">
        {annotations.length > 0 && <div className="flex max-w-[min(100%,42rem)] flex-wrap justify-end gap-1.5" aria-label="Referenced annotations">
          {annotations.map(a => <span key={a.id} className="inline-flex max-w-56 items-center gap-1.5 rounded-lg border border-border bg-card px-2 py-1 text-xs text-foreground" title={a.object?.id || a.tag}>
            <span aria-hidden="true">⌖</span><span className="truncate">{a.label || 'Annotation'}</span>
          </span>)}
        </div>}
        {refs.length > 0 ? <div className="flex max-w-[min(100%,42rem)] flex-wrap justify-end gap-2" aria-label="Message attachments">
          {refs.map(ref => <ConversationAttachmentCard key={ref.id} refInfo={ref} />)}
        </div> : null}
        {message.content ? <div className="max-w-[min(100%,40rem)] rounded-2xl bg-accent px-4 py-3 text-sm leading-relaxed text-accent-foreground">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div> : null}
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
      {message.content ? <MessageMarkdown content={message.content} chatId={chatId} /> : null}
      {!streaming && outputs?.length ? <WorkOutputCards files={outputs}/> : null}
    </div>
  );
}

export function MessageList({
  messages,
  chatId,
  streaming,
  readingMode = false,
}: {
  messages: ChatMessage[];
  chatId?: string;
  streaming: boolean;
  readingMode?: boolean;
}) {
  const chatFiles = useWorkStore(s => s.chats.find(chat => chat.id === chatId)?.files) ?? [];
  const projectFiles = useWorkStore(s => s.projects.find(project => project.id === s.activeProjectId)?.files) ?? [];
  const documents = [...chatFiles,...projectFiles.filter(file=>file.chatId===chatId)]
    .filter((file,index,rows)=>rows.findIndex(other=>other.path===file.path)===index)
    .filter(file => /\\.(md|txt|markdown|agentdoc\\.html)$/.test(file.path));
  const lastAssistantIndex = messages.reduce((index,message,at)=>message.role==='assistant' && message.id!=='welcome-msg' && message.content.trim() ? at:index,-1);
  return (
    <AgentThread
      messages={messages}
      streaming={streaming}
      scrollerClassName="scrollbar-thin flex-1 overflow-y-auto px-4 py-6"
      listClassName={readingMode ? "agentsam-work-reading mx-auto flex w-full max-w-[70ch] flex-col gap-6" : "mx-auto flex w-full max-w-6xl flex-col gap-6"}
      renderMessage={(message, index) => (
        <div key={message.id} data-chat-message-id={message.id} data-agent-role={message.role} tabIndex={-1}>
        <MessageBubble
          message={message as ChatMessage}
          chatId={chatId}
          streaming={streaming && index === messages.length - 1 && message.role === "assistant"}
          startedAt={streaming ? message.createdAt : undefined}
          outputs={readingMode && index===lastAssistantIndex ? documents : undefined}
        />
        </div>
      )}
    />
  );
}

export function ChatThread() {
  const chat = useActiveChat();
  const send = useWorkStore((s) => s.send);
  const streaming = useWorkStore((s) => s.streamingIds.includes(chat.id));
  const empty = chat.messages.length === 0;

  const starterStatus =
    chat.id === "chat-studio" && chat.messages.length === 1 ? (
      <div className="mx-auto mb-2 flex w-full max-w-6xl flex-wrap gap-2 px-4">
        {STARTERS.map((prompt) => (
          <Button
            key={prompt}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto max-w-full rounded-full px-3 py-2 text-left text-xs font-normal text-muted-foreground"
            onClick={() => void send(chat.id, "chat", prompt)}
          >
            {prompt}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <AgentConversationSurface
      empty={empty}
      thread={<MessageList messages={chat.messages} chatId={chat.id} streaming={streaming} />}
      emptyState={<EmptyChat onPrompt={(text) => void send(chat.id, "chat", text)} />}
      status={starterStatus}
      composer={<Composer targetId={chat.id} targetKind="chat" />}
    />
  );
}

function EmptyChat({ onPrompt }: { onPrompt: (text: string) => void }) {
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
