import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

export interface AnnotationSelection {
  id: string;
  label: string;
  page: string;
  tag: string;
  text: string;
}
export interface MiniAgentSamProps {
  selecting: boolean;
  onSelectingChange: (value: boolean) => void;
  onSubmit: (prompt: string, selection: AnnotationSelection) => void | Promise<void>;
  renderComposer?: (props: { value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean }) => ReactNode;
  scope?: () => HTMLElement | null;
}

/** Portable DOM annotation surface. Selection supplies context, never edit authority.
 * Theme inherits --mini-* / --nav-* tokens; transport and resource resolution belong to the host.
 */
export function MiniAgentSam({ selecting, onSelectingChange, onSubmit, renderComposer, scope }: MiniAgentSamProps) {
  const [selection, setSelection] = useState<AnnotationSelection | null>(null);
  const [bounds, setBounds] = useState<DOMRect | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const target = useRef<Element | null>(null);
  const panel = useRef<HTMLElement>(null);
  const [panelHeight, setPanelHeight] = useState(200);
  useEffect(() => {
    if (!selecting) return;
    setSelection(null); setBounds(null); setStatus('');
    const root = scope?.() || document.body;
    const ignored = (element: Element) => Boolean(element.closest('[data-mini-agentsam], [data-annotation-control]'));
    root.setAttribute('data-annotation-selecting', 'true');
    const over = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target;
      if (ignored(element)) return;
      target.current = element;
      setBounds(element.getBoundingClientRect());
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target;
      if (ignored(element)) return;
      event.preventDefault(); event.stopPropagation();
      const resource = element.closest('[data-agentsam-resource]') || element;
      const clean = (text: string | null, max = 180) => (text || '').replace(/\s+/g, ' ').trim().slice(0, max);
      const editableSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
      const editable = element.matches(editableSelector)
        || Boolean(element.closest(editableSelector))
        || resource.matches(editableSelector)
        || Boolean(resource.querySelector(editableSelector));
      setSelection({ id: clean(resource.getAttribute('data-agentsam-resource') || resource.id || resource.tagName), label: clean(resource.getAttribute('aria-label') || resource.getAttribute('alt') || (editable ? 'Input field' : resource.textContent)), page: location.pathname, tag: resource.tagName.toLowerCase(), text: editable ? '[field value withheld]' : clean(resource.textContent, 300) });
      target.current = resource; setBounds(resource.getBoundingClientRect()); onSelectingChange(false);
    };
    root.addEventListener('pointerover', over, true); root.addEventListener('click', click, true);
    return () => { root.removeAttribute('data-annotation-selecting'); root.removeEventListener('pointerover', over, true); root.removeEventListener('click', click, true); };
  }, [selecting, scope, onSelectingChange]);
  useEffect(() => {
    const update = () => { if (target.current?.isConnected) setBounds(target.current.getBoundingClientRect()); else { setSelection(null); setBounds(null); } };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { onSelectingChange(false); setSelection(null); setBounds(null); } };
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update); window.addEventListener('keydown', escape);
    const observer = new MutationObserver(update); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); window.removeEventListener('keydown', escape); };
  }, [onSelectingChange]);
  useEffect(() => { if (!panel.current) return; const observer = new ResizeObserver(() => setPanelHeight(panel.current?.offsetHeight || 200)); observer.observe(panel.current); return () => observer.disconnect(); }, [selection]);
  async function submit() {
    if (!value.trim() || !selection || busy) return;
    setBusy(true); setStatus('');
    try { await onSubmit(value, selection); setValue(''); setStatus('Added to your conversation.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not send. Try again.'); }
    finally { setBusy(false); }
  }
  const style: CSSProperties = bounds && typeof window !== 'undefined' ? { left: Math.max(12, Math.min(window.innerWidth - 372, bounds.left + bounds.width / 2 - 180)), top: Math.max(64, Math.min(window.innerHeight - panelHeight - 12, bounds.bottom + 12 + panelHeight < window.innerHeight ? bounds.bottom + 12 : bounds.top - panelHeight - 12)) } : {};
  return <div data-mini-agentsam="" style={{ pointerEvents: 'none' }}>
    {selecting && <div className="mini-agentsam-hint" role="status">Select an element to annotate · Esc to cancel</div>}
    {bounds && (selecting || selection) && <div className="mini-agentsam-outline" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} />}
    {selection && <section ref={panel} className="mini-agentsam-panel" aria-label="miniAgentSam" style={style}>
      <div className="mini-agentsam-heading"><span title={selection.label}>{selection.label || selection.tag}</span><button type="button" aria-label="Close miniAgentSam" onClick={() => { setSelection(null); setBounds(null); }}>×</button></div>
      {renderComposer ? renderComposer({ value, onChange: setValue, onSend: () => void submit(), busy }) : <><textarea aria-label="Annotation instructions" placeholder="Ask about this…" value={value} onChange={(event) => setValue(event.target.value)} /><button type="button" disabled={busy || !value.trim()} onClick={() => void submit()}>Send</button></>}
      {status && <p role="status">{status}</p>}
    </section>}
  </div>;
}
