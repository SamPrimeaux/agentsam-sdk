import { useEffect, useRef, useState } from 'react';
import { MousePointer2, ArrowUp } from 'lucide-react';
import { AgentComposer, MiniAgentSam, type AnnotationSelection } from '@inneranimalmedia/agentsam-workbench/agent';
import '@inneranimalmedia/agentsam-workbench/agent/mini-agentsam.css';
import { useWorkStore, type ComposerAttachment } from '@/lib/work/store';
import { useCurrentUserState } from '@/lib/auth/use-current-user';
import { stageChatImage, stageChatFile } from '@/lib/content/chat-images';
import { ComposerLibraryPicker } from '@/components/workbench/composer-library-picker';
import { IconAction } from '@/components/ui/icon-action';
import { PluginPicker } from './PluginPicker';
import { ModelSelect } from "@/components/workbench/model-select";

export const DESIGN_WORKSPACE_PROMPT_EVENT = 'agentsam:design-workspace-prompt' as const;
export type DesignWorkspacePromptRequest = {
  resourceId: string;
  revision: string;
  selectionId: string;
  prompt: string;
  handle?: () => Promise<void>;
  error?: string;
};

export function AnnotationToggle({className=""}:{className?:string}={}) {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const update = (event: Event) => setActive(Boolean((event as CustomEvent<{ selecting: boolean }>).detail?.selecting));
    window.addEventListener('agentsam:annotation-state', update);
    return () => window.removeEventListener('agentsam:annotation-state', update);
  }, []);
  return <IconAction type="button" className={`as-nav-button as-side-stage-annotation ${className}`.trim()} data-annotation-control="" data-active={active ? 'true' : 'false'} aria-pressed={active} label={active ? 'Stop annotating' : 'Annotate page'} hint={active ? 'Stop annotating (Esc)' : 'Select an element to annotate'} onClick={() => window.dispatchEvent(new Event('agentsam:annotate'))}><MousePointer2 size={18} /></IconAction>;
}
export function AnnotationHelper() {
  const [selecting, setSelecting] = useState(false);
  const [miniAttachments, setMiniAttachments] = useState<ComposerAttachment[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const { user } = useCurrentUserState();
  async function attachMiniFiles(files: File[]) {
    setUploadError('');
    for (const file of files.slice(0, 6)) {
      try {
        const ref = ['image/png','image/jpeg','image/webp'].includes(file.type)
          ? await stageChatImage(file, user?.id || '')
          : await stageChatFile(file, user?.id || '');
        setMiniAttachments(items => [...items, {
          ...ref, ...(ref.kind === 'image' ? { previewUrl: URL.createObjectURL(file) } : {}),
        }]);
      } catch (error) {
        setUploadError(error instanceof Error ? error.message : 'Could not attach file');
      }
    }
  }
  useEffect(() => {
    if (!selecting) return;
    setMiniAttachments(items => { items.forEach(item => { if (item.previewUrl) URL.revokeObjectURL(item.previewUrl); }); return []; });
    setUploadError('');
  }, [selecting]);
  useEffect(() => { const toggle = () => setSelecting((value) => !value); window.addEventListener('agentsam:annotate', toggle); return () => window.removeEventListener('agentsam:annotate', toggle); }, []);
  useEffect(() => { window.dispatchEvent(new CustomEvent('agentsam:annotation-state', { detail: { selecting } })); }, [selecting]);
  const activeMode = useWorkStore.getState().runModes[useWorkStore.getState().activeChatId] ?? 'agent';
  return <>
    <input type="file" ref={fileInput} hidden multiple accept="image/png,image/jpeg,image/webp,.pdf,.txt,.md,.csv,.json" onChange={event => {
      const files = Array.from(event.currentTarget.files || []);
      event.currentTarget.value = '';
      void attachMiniFiles(files);
    }}/>
    <MiniAgentSam selecting={selecting} onSelectingChange={setSelecting} scope={() =>
      Array.from(document.querySelectorAll<HTMLElement>('[data-agentsam-annotation-scope]')).find(element => element.getClientRects().length > 0) || null
    } onSubmit={async (prompt, selection: AnnotationSelection) => {
    const store = useWorkStore.getState();
    // A specialist editor may claim this contextual prompt and execute it through
    // its own authenticated domain API. The shared MiniAgentSam remains the only UI.
    if (selection.resource?.kind === 'design-canvas' && selection.resource.appId === 'agentsam-local-studio' && selection.resource.revision && !miniAttachments.length) {
      const request: DesignWorkspacePromptRequest = {
        resourceId: selection.resource.id,
        revision: selection.resource.revision,
        selectionId: selection.id,
        prompt,
      };
      window.dispatchEvent(new CustomEvent(DESIGN_WORKSPACE_PROMPT_EVENT, { detail: request }));
      if (request.handle) { await request.handle(); return 'Canvas edit started.'; }
      if (request.error) throw new Error(request.error);
    }
    const id = store.activeChatId;
    if (!id) throw new Error('Open a conversation first.');
    // Keep the selected resource structured: the user's visible draft stays clean.
    // Sending the main chat attaches this context to the message envelope.
    store.setPendingAnnotations(id, items => [...items, {
      id: crypto.randomUUID(), label: selection.label, page: selection.page,
      tag: selection.tag,
      text: [
        selection.resource ? `Resource ${selection.resource.kind}: ${selection.resource.id}${selection.resource.revision ? ` @ revision ${selection.resource.revision}` : ''}` : '',
        `Selected ${selection.tag}: ${selection.id}`,
        selection.text,
      ].filter(Boolean).join(' · '),
      point: selection.point, object: selection.object,
    }].slice(-8));
    if (miniAttachments.length) {
      store.setPendingComposerAttachments(id, items => [...items, ...miniAttachments].slice(0, 20));
      setMiniAttachments([]);
    }
    store.setDraft(id, [store.drafts[id], prompt].filter(Boolean).join('\n\n'));
  }} renderComposer={({ value, onChange, onSend, busy, expanded }) => <PluginPicker
    value={value} onChange={onChange}
    onAttach={() => fileInput.current?.click()}
    onLibrary={() => setLibraryOpen(true)}
    onImage={() => {
      const store = useWorkStore.getState(); const targetId = store.activeChatId;
      if (!targetId) return;
      if (value.trim()) store.setDraft(targetId, [store.drafts[targetId], value].filter(Boolean).join('\n\n'));
      window.dispatchEvent(new CustomEvent('agentsam:composer-image-mode', { detail: { targetId } }));
    }}
    onWebSearch={() => useWorkStore.getState().openSideTab('browser', { ephemeral: false })}
    onProject={() => window.dispatchEvent(new Event('agentsam:open-project-picker:' + useWorkStore.getState().activeChatId))}
    activeMode={activeMode}
    onModeChange={mode => { const store = useWorkStore.getState(); if (store.activeChatId) store.setRunMode(store.activeChatId, mode); }}
    contextLabel="Selected annotation"
  >{({ trigger, onKeyDown, onSelect }) => <>
    {!!miniAttachments.length && <div className="mini-agentsam-attachment-previews" aria-label="Annotation attachments">
      {miniAttachments.map(file => <div key={file.id} className="mini-agentsam-attachment-card">
        {file.previewUrl ? <img src={file.previewUrl} alt={file.name} /> : <span aria-hidden="true">▤</span>}
        <span title={file.name}>{file.name}</span>
        <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setMiniAttachments(items => {
          const hit = items.find(item => item.id === file.id);
          if (hit?.previewUrl) URL.revokeObjectURL(hit.previewUrl);
          return items.filter(item => item.id !== file.id);
        })}>×</button>
      </div>)}
    </div>}
    {uploadError && <p role="alert" className="mini-agentsam-upload-error">{uploadError}</p>}
    <AgentComposer
    maxHeight={expanded ? 720 : 120}
    value={value}
    onChange={onChange}
    onSend={onSend}
    disabled={busy}
    placeholder="Ask AgentSam"
    toolbarStart={trigger}
    toolbarEnd={<ModelSelect compact />}
    containerClassName={"mini-agentsam-composer" + (value.trim() ? " has-draft" : "")}
    inputClassName="mini-agentsam-input"
    toolbarClassName="mini-agentsam-toolbar"
    sendControl={<button className="mini-agentsam-send" data-composer-send="" type="button" aria-label="Add annotation to conversation" disabled={busy || !value.trim()} onClick={onSend}><ArrowUp aria-hidden="true" size={18} strokeWidth={2.2} /></button>}
    textareaProps={{ onKeyDown, onInput: (event) => onSelect(event.currentTarget.selectionStart), onSelect: (event) => onSelect(event.currentTarget.selectionStart) }}
  /></>}</PluginPicker>} />
    <ComposerLibraryPicker open={libraryOpen} onClose={() => setLibraryOpen(false)} onAttach={async files => { await attachMiniFiles(files); }}/>
  </>;
}

