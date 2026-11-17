import { ArrowUp, Maximize2, Minimize2, MousePointer2, X } from 'lucide-react';
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
  renderComposer?: (props: { value: string; onChange: (value: string) => void; onSend: () => void; busy: boolean; expanded: boolean }) => ReactNode;
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
  const [expanded, setExpanded] = useState(false);
  const lastTouch = useRef(0);
  const target = useRef<Element | null>(null);
  const browserSelection = useRef<{ frame: HTMLIFrameElement; rect: { left: number; top: number; width: number; height: number } } | null>(null);
  const panel = useRef<HTMLElement>(null);
  const cursorHint = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(200);
  useEffect(() => {
    if (!selecting) return;
    setSelection(null); setBounds(null); setStatus(''); browserSelection.current = null;
    const root = scope?.() || document.body;
    const ignored = (element: Element) => Boolean(element.closest('[data-mini-agentsam], [data-annotation-control]'));
    root.setAttribute('data-annotation-selecting', 'true');
    const over = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target;
      if (ignored(element) || (element instanceof HTMLIFrameElement && element.matches('.as-web-browser-frame,.as-work-generated-preview,.abs-explore-frame'))) return;
      const focus = element.closest('button, a, input, textarea, select, [role="button"], [data-annotation-target]') || element;
      target.current = focus;
      setBounds(focus.getBoundingClientRect());
    };
    const move = (event: PointerEvent) => {
      const hint = cursorHint.current;
      if (!hint) return;
      hint.style.left = `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - hint.offsetWidth - 8))}px`;
      hint.style.top = `${Math.max(8, event.clientY + hint.offsetHeight + 16 > window.innerHeight ? event.clientY - hint.offsetHeight - 12 : event.clientY + 15)}px`;
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      const element = event.target;
      if (ignored(element)) return;
      event.preventDefault(); event.stopPropagation();
      const selected = element.closest('button, a, input, textarea, select, [role="button"], [data-annotation-target]') || element;
      const resource = selected.closest('[data-agentsam-resource]') || selected;
      const clean = (text: string | null, max = 180) => (text || '').replace(/\s+/g, ' ').trim().slice(0, max);
      const editableSelector = 'input,textarea,select,[contenteditable]:not([contenteditable="false"])';
      const editable = selected.matches(editableSelector) || Boolean(selected.closest(editableSelector));
      setSelection({
        id: clean(resource.getAttribute('data-agentsam-resource') || resource.id || resource.tagName),
        label: clean(selected.getAttribute('aria-label') || selected.getAttribute('alt') || (editable ? 'Input field' : selected.textContent) || resource.getAttribute('aria-label')),
        page: location.pathname,
        tag: selected.tagName.toLowerCase(),
        text: editable ? '[field value withheld]' : clean(selected.textContent, 300),
      });
      target.current = selected; setBounds(selected.getBoundingClientRect()); onSelectingChange(false);
    };
    root.addEventListener('pointerover', over, true); root.addEventListener('pointermove', move, true); root.addEventListener('click', click, true);
    return () => { root.removeAttribute('data-annotation-selecting'); root.removeEventListener('pointerover', over, true); root.removeEventListener('pointermove', move, true); root.removeEventListener('click', click, true); };
  }, [selecting, scope, onSelectingChange]);
  // Opaque-origin browser frames can report a selected element without exposing their DOM.
  // Authenticate the sender against a frame currently owned by the app, never a global message.
  useEffect(() => {
    const frameSelector = 'iframe.as-web-browser-frame,iframe.as-work-generated-preview,iframe.abs-explore-frame';
    const frames = () => [...document.querySelectorAll<HTMLIFrameElement>(frameSelector)];
    // Same-origin embedded pages are not rewritten by the browser proxy. Attach
    // directly to their child document rather than selecting the entire iframe.
    const localFrames = new Map<Document, () => void>();
    const attachSameOrigin = (frame: HTMLIFrameElement) => {
      if (!selecting) return;
      let doc: Document | null = null;
      try { doc = frame.contentDocument; } catch { return; }
      if (!doc || localFrames.has(doc)) return;
      let last = 0;
      const report = (type: string, event: Event) => {
        const hit = event.target as Element | null;
        if (!hit?.closest || hit === doc?.body || hit === doc?.documentElement) return;
        const selected = hit.closest('button,a,img,input,textarea,select,label,h1,h2,h3,h4,p,li,article,section,[role="button"],[data-annotation-target]') || hit;
        const field = selected.matches('input,textarea,select,[contenteditable="true"]');
        const clean = (v: string | null, max: number) => (v || '').replace(/\s+/g, ' ').trim().slice(0, max);
        const rect = selected.getBoundingClientRect();
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: { source: 'agentsam-browser', type, selection: {
            tag: selected.tagName.toLowerCase(),
            label: clean(selected.getAttribute('aria-label') || selected.getAttribute('alt') || (field ? 'Input field' : selected.textContent), 180),
            text: field ? '[field value withheld]' : clean(selected.textContent, 300),
            rect: {left:rect.left,top:rect.top,width:rect.width,height:rect.height}, url: frame.contentWindow?.location.href,
          }},
        }));
      };
      const hover = (event: PointerEvent) => {
        if (Date.now() - last < 70) return;
        last = Date.now(); report('annotation-hover', event);
      };
      const click = (event: MouseEvent) => { event.preventDefault(); event.stopImmediatePropagation(); report('annotation-selection', event); };
      doc.addEventListener('pointermove', hover, true);
      doc.addEventListener('click', click, true);
      localFrames.set(doc, () => { doc.removeEventListener('pointermove', hover, true); doc.removeEventListener('click', click, true); });
    };
    const sendMode = (frame: HTMLIFrameElement) => {
      frame.contentWindow?.postMessage({ source: 'agentsam-host', type: 'annotation-mode', enabled: selecting }, '*');
    };
    frames().forEach(frame => { sendMode(frame); attachSameOrigin(frame); });
    const load = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement && event.target.matches(frameSelector)) {
        sendMode(event.target);
        attachSameOrigin(event.target);
      }
    };
    const message = (event: MessageEvent) => {
      if (!selecting || !event.data || event.data.source !== 'agentsam-browser'
        || !['annotation-hover', 'annotation-selection'].includes(event.data.type)) return;
      const frame = frames().find(item => item.contentWindow === event.source);
      if (!frame) return;
      const item = event.data.selection as { tag?: unknown; label?: unknown; text?: unknown; url?: unknown; rect?: Record<string, unknown> } | undefined;
      const rect = item?.rect;
      if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(v => typeof v === 'number' && Number.isFinite(v))
        || Number(rect.width) <= 0 || Number(rect.height) <= 0) return;
      const bounded = { left: Number(rect.left), top: Number(rect.top), width: Number(rect.width), height: Number(rect.height) };
      const frameBox = frame.getBoundingClientRect();
      if (bounded.left < -frameBox.width || bounded.top < -frameBox.height || bounded.width > frameBox.width * 2 || bounded.height > frameBox.height * 2) return;
      browserSelection.current = { frame, rect: bounded };
      target.current = null;
      setBounds(new DOMRect(frameBox.left + bounded.left, frameBox.top + bounded.top, bounded.width, bounded.height));
      if (event.data.type === 'annotation-selection') {
        const clean = (v: unknown, max = 180) => typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
        setSelection({
          id: clean(frame.closest('[data-agentsam-resource]')?.getAttribute('data-agentsam-resource') || 'browser') + ':' + clean(item?.tag),
          label: clean(item?.label) || 'Browser element', page: (() => {
            try {
              const page = new URL(clean(item?.url, 2000), location.href);
              if (page.pathname === '/api/browser/page') {
                const target = page.searchParams.get('url');
                if (target) return new URL(target).origin + new URL(target).pathname;
              }
              return page.origin + page.pathname;
            } catch { return location.pathname; }
          })(),
          tag: clean(item?.tag), text: clean(item?.text, 300),
        });
        onSelectingChange(false);
      }
    };
    window.addEventListener('message', message);
    document.addEventListener('load', load, true);
    return () => {
      window.removeEventListener('message', message);
      document.removeEventListener('load', load, true);
      frames().forEach(frame => frame.contentWindow?.postMessage({source: 'agentsam-host', type: 'annotation-mode', enabled: false}, '*'));
      localFrames.forEach(cleanup => cleanup());
    };
  }, [selecting, onSelectingChange]);
  useEffect(() => {
    const update = () => {
      if (browserSelection.current?.frame.isConnected) {
        const {frame, rect} = browserSelection.current;
        const frameBox = frame.getBoundingClientRect();
        setBounds(new DOMRect(frameBox.left + rect.left, frameBox.top + rect.top, rect.width, rect.height));
      } else if (target.current?.isConnected) setBounds(target.current.getBoundingClientRect());
      else { setSelection(null); setBounds(null); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { onSelectingChange(false); setSelection(null); setBounds(null); } };
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update); window.addEventListener('keydown', escape);
    const observer = new MutationObserver(update); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); window.removeEventListener('keydown', escape); };
  }, [onSelectingChange]);
  useEffect(() => { if (!panel.current) return; const observer = new ResizeObserver(() => setPanelHeight(panel.current?.offsetHeight || 200)); observer.observe(panel.current); return () => observer.disconnect(); }, [selection]);
  useEffect(() => {
    if (!expanded || !selection) return;
    const previous = document.activeElement as HTMLElement | null;
    const area = panel.current?.querySelector('textarea');
    area?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); setExpanded(false); return; }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, input, [tabindex="0"]') || []);
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', trap, true);
    return () => { window.removeEventListener('keydown', trap, true); previous?.focus(); };
  }, [expanded, selection]);
  async function submit() {
    if (!value.trim() || !selection || busy) return;
    setBusy(true); setStatus('');
    try { await onSubmit(value, selection); setValue(''); setStatus('Added to your conversation.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not send. Try again.'); }
    finally { setBusy(false); }
  }
  const style: CSSProperties = bounds && typeof window !== 'undefined' ? { left: Math.max(12, Math.min(window.innerWidth - 372, bounds.left + bounds.width / 2 - 180)), top: Math.max(64, Math.min(window.innerHeight - panelHeight - 12, bounds.bottom + 12 + panelHeight < window.innerHeight ? bounds.bottom + 12 : bounds.top - panelHeight - 12)) } : {};
  return <div data-mini-agentsam="" style={{ pointerEvents: 'none' }}>
    {selecting && <div ref={cursorHint} className="mini-agentsam-hint" role="status"><MousePointer2 size={14} aria-hidden="true" /> Select to annotate <kbd>Esc</kbd></div>}
    {bounds && (selecting || selection) && <div className="mini-agentsam-outline" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} />}
    {selection && expanded && <div className="mini-agentsam-review-backdrop" onClick={() => setExpanded(false)} />}
    {selection && <section ref={panel} className="mini-agentsam-panel" data-expanded={expanded ? 'true' : 'false'} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? 'Review annotation message' : 'miniAgentSam'} style={expanded ? undefined : style}
      onDoubleClick={(event) => { if (!(event.target as Element).closest('button')) setExpanded(true); }}
      onPointerUp={(event) => { if (event.pointerType !== 'touch' || (event.target as Element).closest('button')) return; const now = Date.now(); if (now - lastTouch.current < 300) setExpanded(true); lastTouch.current = now; }}>

      <div className="mini-agentsam-heading"><span title={selection.label}>{selection.label || selection.tag}</span><button type="button" aria-label={expanded ? "Collapse message" : "Expand message"} title={expanded ? "Collapse message" : "Review entire message"} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button type="button" aria-label="Close miniAgentSam" onClick={() => { setSelection(null); setBounds(null); setExpanded(false); }}><X size={18} /></button></div>
      {renderComposer ? renderComposer({ value, onChange: setValue, onSend: () => void submit(), busy, expanded }) : <><textarea aria-label="Annotation instructions" placeholder="Ask about this…" value={value} onChange={(event) => setValue(event.target.value)} /><button type="button" disabled={busy || !value.trim()} className="mini-agentsam-send" aria-label="Send annotation" onClick={() => void submit()}><ArrowUp size={18} /></button></>}
      {status && <p role="status">{status}</p>}
    </section>}
  </div>;
}

