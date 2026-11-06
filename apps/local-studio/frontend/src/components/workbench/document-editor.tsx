import { IconAction } from "@/components/ui/icon-action";
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { Download, Pencil, Maximize2, Minimize2, Save, X } from 'lucide-react';
import {
  DocumentSelectionToolbar,
  type TextFormat,
  type TextTone,
  type ReviewTag,
} from '@inneranimalmedia/agentsam-workbench/agent';
import '@inneranimalmedia/agentsam-workbench/agent/selection-toolbar.css';
import { useWorkStore } from '@/lib/work/store';
import { RuntimeFilesystemAdapter } from '@/lib/work/workspace-fs';
import type { Artifact, Project } from '@inneranimalmedia/agentsam-local-shared';
import { StudioMark } from '@/components/mark';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

const ALLOWED_TAGS = ['h1','h2','h3','h4','p','div','span','strong','b','em','i','u','s','del','code','pre','ul','ol','li','blockquote','a','mark','hr','br','table','thead','tbody','tr','td','th'];
const ALLOWED_ATTR = ['href','target','rel','title','data-tone','data-highlight','data-agent-comment-id','data-agent-comment-text','data-review-tag'];
function sanitize(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS, ALLOWED_ATTR, ALLOW_DATA_ATTR: false });
}
function isDocument(path: string) { return /\.agentdoc\.html$/.test(path); }
export { isDocument as isEditableDocument };
function asMarkup(file: Artifact) {
  if (isDocument(file.path)) return sanitize(file.content);
  if (/\.md$|\.markdown$|\.txt$/.test(file.path)) {
    // Markdown parser is only a presentation step; source remains unchanged.
    const rendered = marked.parse(file.content, { async: false });
    return sanitize(typeof rendered === 'string' ? rendered : '');
  }
  return sanitize(file.content);
}
function closestBlock(root: HTMLElement, node: Node): HTMLElement | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  const block = element?.closest('h1,h2,h3,p,li,blockquote,div');
  return block instanceof HTMLElement && root.contains(block) ? block : null;
}
function useSafeDownload(file: Artifact) {
  return () => {
    const plain = /\\.(md|markdown|txt)$/.test(file.path);
    const blob = new Blob([file.content], { type: plain ? 'text/plain;charset=utf-8' : 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = file.path.split('/').pop() || 'document.html';
    document.body.append(a); a.click(); a.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

export function ArtifactDocumentEditor({
  file, project, chatId, onClose, onEditCopy,
}: {
  file: Artifact;
  project: Project;
  chatId?: string;
  onClose?: () => void;
  onEditCopy?: (content: string, title: string) => void | Promise<void>;
}) {
  const editable = isDocument(file.path);
  const editor = useRef<HTMLDivElement>(null);
  const range = useRef<Range | null>(null);
  const selectionText = useRef('');
  const [selection, setSelection] = useState<{
    left:number;top:number;bottom:number;
    style:'paragraph'|'h1'|'h2'|'h3'; tone:TextTone; highlight:TextTone | null;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const changeVersion = useRef(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [version, setVersion] = useState<string | undefined>(undefined);
  const [full, setFull] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const upsert = useWorkStore(state => state.upsertFile);
  const setDraft = useWorkStore(state => state.setDraft);
  const send = useWorkStore(state => state.send);
  const download = useSafeDownload(file);

  useEffect(() => {
    range.current = null; selectionText.current = ''; setSelection(null);
    changeVersion.current = 0;
    setDirty(false); setSaveError(null); setVersion(undefined);
    if (editor.current) editor.current.innerHTML = asMarkup(file);
    if (project.kind !== 'filesystem' || !project.runtimeBaseUrl || !project.runtimeCapability) return;
    let disposed = false;
    const adapter = new RuntimeFilesystemAdapter(project.runtimeBaseUrl, project.runtimeCapability);
    void adapter.read(file.path).then(result => {
      if (disposed) return;
      if (!result.ok) {
        setSaveError('Could not load the latest saved version.');
        return;
      }
      if (result.content !== file.content) {
        setSaveError('This file changed outside the editor. Reopen it before making changes.');
        return;
      }
      setVersion(result.version);
    }).catch(() => { if (!disposed) setSaveError('Could not check the saved version.'); });
    return () => { disposed = true; };
  }, [file.id, project.id, project.kind, project.runtimeBaseUrl, project.runtimeCapability]);

  const captureSelection = useCallback(() => {
    if (!editable || !editor.current) return;
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
    const current = selected.getRangeAt(0);
    if (!editor.current.contains(current.commonAncestorContainer)) { setSelection(null); return; }
    const text = current.toString().trim();
    if (!text) { setSelection(null); return; }
    range.current = current.cloneRange();
    selectionText.current = text;
    const rect = current.getBoundingClientRect();
    const block = closestBlock(editor.current, current.startContainer);
    const style = block && /^(H1|H2|H3)$/.test(block.tagName)
      ? block.tagName.toLowerCase() as 'h1'|'h2'|'h3' : 'paragraph';
    const element = current.startContainer.nodeType === Node.ELEMENT_NODE
      ? current.startContainer as Element : current.startContainer.parentElement;
    const currentTone = element?.closest<HTMLElement>('[data-tone]')?.dataset.tone;
    const currentHighlight = element?.closest<HTMLElement>('[data-highlight]')?.dataset.highlight;
    const isTone = (value: string | undefined): value is TextTone =>
      Boolean(value && ['default','danger','warning','success','info','teal','accent'].includes(value));
    setSelection({left:rect.left + rect.width/2,top:rect.top,bottom:rect.bottom,style,
      tone:isTone(currentTone)?currentTone:'default',
      highlight:isTone(currentHighlight)?currentHighlight:null});
  }, [editable]);

  const markChanged = useCallback(() => {
    changeVersion.current += 1;
    setDirty(true);
    setSaveError(null);
  }, []);

  function updateSelectionAfterMutation(target?: Node) {
    markChanged();
    if (target) {
      const selected = document.createRange();
      selected.selectNodeContents(target);
      range.current = selected;
      const current = window.getSelection();
      current?.removeAllRanges(); current?.addRange(selected);
    }
    setSelection(null);
  }
  function wrap(tag: keyof HTMLElementTagNameMap, attrs?: Record<string,string>) {
    const current = range.current;
    if (!editable || !current || current.collapsed || !editor.current?.contains(current.commonAncestorContainer)) return;
    const el = document.createElement(tag);
    for (const [key,val] of Object.entries(attrs || {})) el.setAttribute(key,val);
    try {
      el.append(current.extractContents());
      current.insertNode(el);
      updateSelectionAfterMutation(el);
    } catch { setSaveError('Could not format this selection. Try a smaller range.'); }
  }
  function format(kind: TextFormat) {
    const current = range.current;
    if (!current || !editor.current) return;
    if (kind === 'bold') return wrap('strong');
    if (kind === 'italic') return wrap('em');
    if (kind === 'underline') return wrap('u');
    if (kind === 'strike') return wrap('s');
    if (kind === 'code') return wrap('code');
    const block = closestBlock(editor.current,current.startContainer);
    if (!block) return;
    const tag = kind === 'bullet' ? 'ul' : kind === 'number' ? 'ol'
      : kind === 'paragraph' ? 'p' : kind;
    if (kind === 'bullet' || kind === 'number') {
      const list = document.createElement(tag);
      const li = document.createElement('li');
      li.append(...Array.from(block.childNodes).map(node=>node.cloneNode(true)));
      list.append(li); block.replaceWith(list);
      updateSelectionAfterMutation(li);
    } else {
      const next = document.createElement(tag);
      for (const node of Array.from(block.childNodes)) next.append(node.cloneNode(true));
      block.replaceWith(next);
      updateSelectionAfterMutation(next);
    }
  }
  function tone(tone: TextTone, type:'tone'|'highlight') {
    if(type==='tone') wrap('span',{'data-tone':tone});
    else wrap('mark',{'data-highlight':tone});
  }
  function saveComment(comment:string, sendToAgent:boolean) {
    const selected = selectionText.current;
    const commentId = crypto.randomUUID();
    wrap('mark', { 'data-agent-comment-id': commentId, 'data-agent-comment-text': comment });
    if (sendToAgent && chatId) {
      const request = 'Review this exact passage in ' + file.path +
        '\nSelected text: "' + selected.slice(0,1500) + '"\nComment: ' + comment +
        '\nPlease propose a scoped revision and preserve unrelated content.';
      void send(chatId,'chat',request);
    }
    setCommentsOpen(true);
  }
  function askAboutSelection() {
    if (!chatId) return;
    setDraft(chatId, 'In ' + file.path + ', please review the selection: "' +
      selectionText.current.slice(0,1500) + '"\n');
    document.querySelector<HTMLTextAreaElement>('.agentsam-conversation-dock textarea')?.focus();
    setSelection(null);
  }
  async function save() {
    if (!editable || !editor.current || saving || !dirty) return;
    setSaving(true); setSaveError(null); setSelection(null);
    const content = sanitize(editor.current.innerHTML);
    const saveChangeVersion = changeVersion.current;
    try {
      if (project.kind === 'filesystem') {
        if (!project.runtimeBaseUrl || !project.runtimeCapability || !version) {
          throw new Error('The saved version could not be verified. Reopen this document before saving.');
        }
        const adapter = new RuntimeFilesystemAdapter(project.runtimeBaseUrl,project.runtimeCapability);
        const result = await adapter.write(file.path, content, version);
        if (!result.ok) {
          throw new Error(result.code === 'conflict'
            ? 'This file changed elsewhere. Review the latest version before saving.'
            : 'Could not save the document. Your edits are still here.');
        }
        setVersion(result.version);
      }
      upsert(project.id,{...file,content,updatedAt:Date.now(),origin:'editor'});
      setDirty(changeVersion.current !== saveChangeVersion);
    } catch(error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save. Your edits are still here.');
    } finally {setSaving(false);}
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase()==='s' && editable && editor.current?.contains(document.activeElement)) {
        event.preventDefault(); void save();
      }
    };
    document.addEventListener('keydown',onKey);
    return () => document.removeEventListener('keydown',onKey);
  }, [dirty,saving,file.id,version,editable]);

  const comments = Array.from(editor.current?.querySelectorAll<HTMLElement>('[data-agent-comment-id]') || [])
    .map(node=>({id:node.dataset.agentCommentId || '', comment:node.dataset.agentCommentText || '', excerpt:node.textContent || ''}))
    .filter(item=>item.id);
  return <div className={'work-artifact-document'+(full?' is-document-fullscreen':'')} data-document-editable={editable}>
    <header className="work-artifact-document__header">
      <div className="work-artifact-document__identity">
        <span className="work-artifact-document__kind">Document</span>
        <strong title={file.title || file.path}>{file.title || file.path.split('/').pop()}</strong>
        <small>{editable ? (saving ? 'Saving…' : dirty ? 'Unsaved changes' : project.kind === 'filesystem' ? 'Saved to file' : 'Saved locally') : 'Preview'}</small>
      </div>
      <nav aria-label="Document actions">
        {editable ? <IconAction type="button" label="Save document" hint="Save document (⌘S)" disabled={!dirty || saving}
          onClick={() => void save()}><Save size={17}/></IconAction> : onEditCopy ? <IconAction type="button"
          label="Edit a document copy" hint="Edit a document copy"
          onClick={() => void onEditCopy(asMarkup(file),file.title || file.path)}><Pencil size={17}/></IconAction> : null}
        <IconAction type="button" label="Download document" hint="Download document" onClick={download}><Download size={17}/></IconAction>
        <button type="button" aria-label={full ? 'Restore document panel':'Expand document'} title={full ? 'Restore document panel':'Expand document'}
          onClick={()=>setFull(current=>!current)}>{full?<Minimize2 size={17}/>:<Maximize2 size={17}/>}</button>
        {onClose ? <IconAction type="button" label="Close document" onClick={() => {
          if (dirty) setConfirmClose(true); else onClose();
        }}><X size={17}/></IconAction> : null}
      </nav>
    </header>
    {saveError ? <p className="work-artifact-document__error" role="alert">{saveError}</p> : null}
    <div className="work-artifact-document__scroller" onScroll={()=>setSelection(null)}>
      <article ref={editor} className="work-artifact-document__body"
        contentEditable={editable} suppressContentEditableWarning
        role={editable ? 'textbox':undefined} aria-label={editable ? 'Edit document content':undefined}
        aria-multiline={editable || undefined} spellCheck={editable}
        onInput={markChanged} onMouseUp={captureSelection} onKeyUp={captureSelection}
        onPaste={event => {
          if (!editable) return;
          // Clipboard HTML can contain untrusted script/attributes. Insert text
          // at the user's true selection; formatting is applied with controls.
          const text = event.clipboardData.getData('text/plain');
          event.preventDefault();
          const selected = window.getSelection();
          if (!selected?.rangeCount) return;
          const target = selected.getRangeAt(0);
          if (!editor.current?.contains(target.commonAncestorContainer)) return;
          target.deleteContents();
          const node = document.createTextNode(text);
          target.insertNode(node);
          target.setStartAfter(node);
          target.collapse(true);
          selected.removeAllRanges(); selected.addRange(target);
          markChanged();
        }}
        onClick={event => {
          const mark = (event.target as Element).closest<HTMLElement>('[data-agent-comment-id]');
          if (mark) setCommentsOpen(true);
        }}/>
    </div>
    <Dialog open={confirmClose} onOpenChange={setConfirmClose}><DialogContent className="max-w-sm">
      <DialogTitle>Unsaved document edits</DialogTitle>
      <DialogDescription>Your changes are still in this document. Save them before closing, or choose to discard.</DialogDescription>
      <div className="work-artifact-document__dialog-actions">
        <button type="button" onClick={() => setConfirmClose(false)}>Keep editing</button>
        <button type="button" onClick={() => { setConfirmClose(false); onClose?.(); }}>Discard changes</button>
      </div>
    </DialogContent></Dialog>
    {commentsOpen && comments.length ? <aside className="work-artifact-document__comments" aria-label="Document comments">
      <div><strong>Comments · {comments.length}</strong><IconAction type="button" onClick={()=>setCommentsOpen(false)} label="Close comments"><X size={15}/></IconAction></div>
      {comments.map(item=><blockquote key={item.id}><span>“{item.excerpt.slice(0,120)}”</span><p>{item.comment}</p></blockquote>)}
    </aside>:null}
    {selection && editable ? createPortal(<DocumentSelectionToolbar anchor={selection}
      activeStyle={selection.style} activeTone={selection.tone} activeHighlight={selection.highlight}
      agentIcon={<StudioMark className="size-5"/>}
      onAsk={askAboutSelection} onFormat={format}
      onTextTone={t=>tone(t,'tone')} onHighlight={t=>tone(t || 'default','highlight')}
      onLink={url=>wrap('a',{href:url,target:'_blank',rel:'noopener noreferrer'})}
      onComment={saveComment} onReact={tag=>wrap('mark',{'data-review-tag':tag})}
      onDismiss={()=>setSelection(null)}/>,
      (editor.current?.closest('.as-nav-scope') as HTMLElement | null) ?? document.body):null}
  </div>;
}
