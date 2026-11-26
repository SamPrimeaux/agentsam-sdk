import { ArrowUp, Maximize2, Minimize2, MousePointer2, X } from 'lucide-react';
import { describeAnnotationTarget, isAnnotationVisualTarget, resolveAnnotationTarget } from './annotation-selection';
import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';

export interface AnnotationSelection {
  id: string;
  label: string;
  page: string;
  tag: string;
  text: string;
  /** An actual visual hit location, never implied from a 3D object's ID. */
  point?: { x: number; y: number };
  /** Optional semantic identity provided by an authenticated host adapter. */
  object?: { id: string; type: string; projectId: string; revision: number };
  /** Host-owned resource identity for contextual routing; never grants mutation authority. */
  resource?: { id: string; kind: string; revision?: string; appId?: string };
  /** True when the annotation should stay anchored to the actual pointer location. */
  visual?: boolean;
  /** True when the selected target is an editable field; its value is withheld. */
  editable?: boolean;
}
function readHostResource(element: Element): AnnotationSelection['resource'] | undefined {
  const host = element.closest('[data-agentsam-resource-host]');
  if (!host) return undefined;
  const clean = (value: string | null, max: number) => (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
  const id = clean(host.getAttribute('data-agentsam-resource-id'), 160);
  const kind = clean(host.getAttribute('data-agentsam-resource-kind'), 80);
  if (!id || !kind) return undefined;
  const revision = clean(host.getAttribute('data-agentsam-resource-revision'), 80);
  const appId = clean(host.getAttribute('data-agentsam-resource-app-id'), 120);
  return { id, kind, ...(revision ? { revision } : {}), ...(appId ? { appId } : {}) };
}

export interface MiniAgentSamProps {
  selecting: boolean;
  onSelectingChange: (value: boolean) => void;
  onSubmit: (prompt: string, selection: AnnotationSelection) => string | void | Promise<string | void>;
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
  const cadContext = useRef<{frame: HTMLIFrameElement | null; label: string;
    object: NonNullable<AnnotationSelection['object']>; point?: {x:number;y:number}; localPoint?:{x:number;y:number}} | null>(null);
  const panel = useRef<HTMLElement>(null);
  const cursorHint = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(200);
  useEffect(() => {
    const acceptCad = (detail: unknown, frame: HTMLIFrameElement | null) => {
      if (detail === null) { cadContext.current = null; return; }
      if (!detail || typeof detail !== 'object') return;
      const value = detail as {label?:unknown;object?:Record<string,unknown>;point?:Record<string,unknown>};
      if (typeof value.label !== 'string' || !value.object ||
          typeof value.object.id !== 'string' || typeof value.object.type !== 'string' ||
          typeof value.object.projectId !== 'string' || !Number.isFinite(value.object.revision)) return;
      const rect = frame?.getBoundingClientRect();
      const x = typeof value.point?.x === 'number' ? value.point.x + (rect?.left ?? 0) : NaN;
      const y = typeof value.point?.y === 'number' ? value.point.y + (rect?.top ?? 0) : NaN;
      const point = Number.isFinite(x) && Number.isFinite(y) && x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight ? {x,y} : undefined;
      cadContext.current = {frame,label:value.label.slice(0,180),
        localPoint: point && frame && value.point ? {x:Number(value.point.x),y:Number(value.point.y)} : undefined,
        object:{
        id:value.object.id.slice(0,160), type:value.object.type.slice(0,80),
        projectId:value.object.projectId.slice(0,160), revision:Number(value.object.revision),
      },point};
      if (selecting && point) {
        setSelection({id:cadContext.current.object.id,label:cadContext.current.label,
          page:location.pathname,tag:'cad-object',text:'',point,visual:true,object:cadContext.current.object});
        setBounds(new DOMRect(point.x,point.y,2,2));
        onSelectingChange(false);
      }
    };
    const direct = (event: Event) => acceptCad((event as CustomEvent).detail, null);
    const nested = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.data?.source !== 'agentsam-cad-selection') return;
      const frame = [...document.querySelectorAll<HTMLIFrameElement>('iframe.as-web-browser-frame,iframe.as-work-generated-preview,iframe.abs-explore-frame,iframe[data-cad-frame]')]
        .find(item => item.contentWindow === event.source);
      if (frame) acceptCad(event.data.selection, frame);
    };
    window.addEventListener('agentsam:cad-selection',direct);
    window.addEventListener('message',nested);
    return () => { window.removeEventListener('agentsam:cad-selection',direct); window.removeEventListener('message',nested); };
  }, [selecting,onSelectingChange]);
  useEffect(() => {
    if (!selecting) return;
    setSelection(null); setBounds(null); setStatus(''); browserSelection.current = null; target.current = null; cadContext.current = null;
    const root = scope?.() ?? null;
    if (!root || !root.isConnected || root === document.body || root === document.documentElement) {
      setStatus('No active workspace is available to annotate.');
      onSelectingChange(false);
      return;
    }
    const previousSelecting = root.getAttribute('data-annotation-selecting');
    root.setAttribute('data-annotation-selecting', 'true');
    const over = (event: PointerEvent) => {
      const selected = resolveAnnotationTarget(event.target, root);
      if (!selected) {
        target.current = null;
        setBounds(null);
        return;
      }
      target.current = selected;
      setBounds(isAnnotationVisualTarget(selected, root)
        ? new DOMRect(event.clientX, event.clientY, 2, 2)
        : selected.getBoundingClientRect());
    };
    const move = (event: PointerEvent) => {
      const hint = cursorHint.current;
      if (!hint) return;
      hint.style.left = `${Math.max(8, Math.min(event.clientX + 14, window.innerWidth - hint.offsetWidth - 8))}px`;
      hint.style.top = `${Math.max(8, event.clientY + hint.offsetHeight + 16 > window.innerHeight ? event.clientY - hint.offsetHeight - 12 : event.clientY + 15)}px`;
    };
    const click = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      // Annotation mode owns clicks inside the active work surface. Excluded
      // chrome and empty space are ignored rather than triggering app actions.
      event.preventDefault();
      event.stopPropagation();
      const selected = resolveAnnotationTarget(event.target, root);
      if (!selected) {
        target.current = null;
        setBounds(null);
        return;
      }
      const description = describeAnnotationTarget(selected, root);
      const hostResource = readHostResource(selected);
      const visual = isAnnotationVisualTarget(selected, root);
      const cad = visual && (!cadContext.current?.frame || cadContext.current.frame === selected)
        ? cadContext.current : null;
      setSelection({
        ...description,
        id: cad?.object.id || description.id,
        label: cad?.label || description.label,
        page: location.pathname,
        point: { x: event.clientX, y: event.clientY },
        visual,
        ...(cad ? { object: cad.object } : {}),
        ...(hostResource ? { resource: hostResource } : {}),
      });
      target.current = selected;
      setBounds(visual ? new DOMRect(event.clientX, event.clientY, 2, 2) : selected.getBoundingClientRect());
      onSelectingChange(false);
    };
    root.addEventListener('pointerover', over, true);
    root.addEventListener('pointermove', move, true);
    root.addEventListener('click', click, true);
    return () => {
      if (previousSelecting === null) root.removeAttribute('data-annotation-selecting');
      else root.setAttribute('data-annotation-selecting', previousSelecting);
      root.removeEventListener('pointerover', over, true);
      root.removeEventListener('pointermove', move, true);
      root.removeEventListener('click', click, true);
    };
  }, [selecting, scope, onSelectingChange]);
  // Browser/HTML previews use the same target contract. Same-origin frames are
  // inspected directly; opaque-origin frames cooperate through a bounded bridge.
  useEffect(() => {
    const frameSelector = 'iframe.as-web-browser-frame,iframe.as-work-generated-preview,iframe.abs-explore-frame,iframe.cv-native-html';
    const root = scope?.() ?? null;
    if (!root || !root.isConnected) return;
    const frames = () => [...root.querySelectorAll<HTMLIFrameElement>(frameSelector)];
    const localFrames = new Map<Document, () => void>();
    const attachSameOrigin = (frame: HTMLIFrameElement) => {
      if (!selecting) return;
      let doc: Document | null = null;
      try { doc = frame.contentDocument; } catch { return; }
      if (!doc?.body || localFrames.has(doc)) return;
      const sameOriginDoc = doc;
      const documentRoot = sameOriginDoc.body;
      const cadGuest = documentRoot.querySelector<HTMLIFrameElement>('[data-cad-iframe-region] > iframe');
      const previousPointerEvents = cadGuest?.style.pointerEvents ?? '';
      if (cadGuest) cadGuest.style.pointerEvents = 'none';
      let last = 0;
      const report = (type: string, event: Event) => {
        const hit = event.target as Element | null;
        const selected = resolveAnnotationTarget(hit, documentRoot);
        if (!selected) {
          window.dispatchEvent(new MessageEvent('message', {
            source: frame.contentWindow,
            data: { source: 'agentsam-browser', type, selection: null },
          }));
          return;
        }
        const description = describeAnnotationTarget(selected, documentRoot);
        const rect = selected.getBoundingClientRect();
        window.dispatchEvent(new MessageEvent('message', {
          source: frame.contentWindow,
          data: { source: 'agentsam-browser', type, selection: {
            ...description,
            rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            point: 'clientX' in event && 'clientY' in event ? { x: Number(event.clientX), y: Number(event.clientY) } : undefined,
            url: frame.contentWindow?.location.href,
          } },
        }));
      };
      const hover = (event: PointerEvent) => {
        if (Date.now() - last < 70) return;
        last = Date.now();
        report('annotation-hover', event);
      };
      const click = (event: MouseEvent) => {
        event.preventDefault();
        event.stopImmediatePropagation();
        report('annotation-selection', event);
      };
      documentRoot.addEventListener('pointermove', hover, true);
      documentRoot.addEventListener('click', click, true);
      localFrames.set(sameOriginDoc, () => {
        documentRoot.removeEventListener('pointermove', hover, true);
        documentRoot.removeEventListener('click', click, true);
        if (cadGuest) cadGuest.style.pointerEvents = previousPointerEvents;
      });
    };
    const sendMode = (frame: HTMLIFrameElement) => {
      frame.contentWindow?.postMessage({ source: 'agentsam-host', type: 'annotation-mode', enabled: selecting }, '*');
    };
    frames().forEach(frame => { sendMode(frame); attachSameOrigin(frame); });
    const load = (event: Event) => {
      if (event.target instanceof HTMLIFrameElement && event.target.matches(frameSelector) && root.contains(event.target)) {
        sendMode(event.target);
        attachSameOrigin(event.target);
      }
    };
    const message = (event: MessageEvent) => {
      if (!selecting || !event.data || event.data.source !== 'agentsam-browser'
        || !['annotation-hover', 'annotation-selection'].includes(event.data.type)) return;
      const frame = frames().find(item => item.contentWindow === event.source);
      if (!frame) return;
      const item = event.data.selection as { id?: unknown; tag?: unknown; label?: unknown; text?: unknown; url?: unknown; rect?: Record<string, unknown>; point?: Record<string, unknown>; visual?: unknown; editable?: unknown } | null | undefined;
      if (!item) {
        browserSelection.current = null;
        target.current = null;
        setBounds(null);
        return;
      }
      const rect = item.rect;
      if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(v => typeof v === 'number' && Number.isFinite(v))
        || Number(rect.width) <= 0 || Number(rect.height) <= 0) return;
      let bounded = { left: Number(rect.left), top: Number(rect.top), width: Number(rect.width), height: Number(rect.height) };
      const frameBox = frame.getBoundingClientRect();
      if (bounded.left < -frameBox.width || bounded.top < -frameBox.height || bounded.width > frameBox.width * 2 || bounded.height > frameBox.height * 2) return;
      const clickPoint = item.point;
      const pointX = typeof clickPoint?.x === 'number' ? clickPoint.x : NaN;
      const pointY = typeof clickPoint?.y === 'number' ? clickPoint.y : NaN;
      const pointValid = Number.isFinite(pointX) && Number.isFinite(pointY)
        && pointX >= 0 && pointY >= 0 && pointX <= frameBox.width && pointY <= frameBox.height;
      if (pointValid && item.visual === true) bounded = { left: pointX, top: pointY, width: 2, height: 2 };
      browserSelection.current = { frame, rect: bounded };
      target.current = null;
      setBounds(new DOMRect(frameBox.left + bounded.left, frameBox.top + bounded.top, bounded.width, bounded.height));
      if (event.data.type === 'annotation-selection') {
        const clean = (value: unknown, max = 180) => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
        const cad = cadContext.current?.frame === frame && item.visual === true ? cadContext.current : null;
        const hostResource = readHostResource(frame);
        const frameResourceId = clean(frame.closest('[data-agentsam-resource]')?.getAttribute('data-agentsam-resource'));
        const itemId = clean(item.id, 200) || clean(item.tag, 80) || 'element';
        const selectedId = (frameResourceId || 'browser') + ':' + itemId;
        setSelection({
          id: cad?.object.id || selectedId,
          label: cad?.label || clean(item.label) || 'Browser element',
          page: (() => {
            try {
              const page = new URL(clean(item.url, 2000), location.href);
              if (page.pathname === '/api/browser/page') {
                const target = page.searchParams.get('url');
                if (target) return new URL(target).origin + new URL(target).pathname;
              }
              return page.origin + page.pathname;
            } catch { return location.pathname; }
          })(),
          tag: clean(item.tag, 80),
          text: clean(item.text, 300),
          ...(pointValid ? { point: { x: frameBox.left + pointX, y: frameBox.top + pointY } } : {}),
          visual: item.visual === true,
          editable: item.editable === true,
          ...(cad ? { object: cad.object } : {}),
          ...(hostResource ? { resource: hostResource } : {}),
        });
        onSelectingChange(false);
      }
    };
    window.addEventListener('message', message);
    document.addEventListener('load', load, true);
    return () => {
      window.removeEventListener('message', message);
      document.removeEventListener('load', load, true);
      frames().forEach(frame => frame.contentWindow?.postMessage({ source: 'agentsam-host', type: 'annotation-mode', enabled: false }, '*'));
      localFrames.forEach(cleanup => cleanup());
    };
  }, [selecting, onSelectingChange, scope]);
  useEffect(() => {
    const update = () => {
      if (browserSelection.current?.frame.isConnected) {
        const {frame, rect} = browserSelection.current;
        const frameBox = frame.getBoundingClientRect();
        setBounds(new DOMRect(frameBox.left + rect.left, frameBox.top + rect.top, rect.width, rect.height));
      } else if (selection?.object && cadContext.current?.point) {
        const cad = cadContext.current;
        if (!cad.point) return;
        const box = cad.frame?.getBoundingClientRect();
        const x = box && cad.localPoint ? box.left + cad.localPoint.x : cad.point.x;
        const y = box && cad.localPoint ? box.top + cad.localPoint.y : cad.point.y;
        setBounds(new DOMRect(x, y, 2, 2));
      } else if (target.current?.isConnected) {
        const element = target.current;
        const point = selection?.point;
        setBounds(point && selection?.visual
          ? new DOMRect(point.x, point.y, 2, 2)
          : element.getBoundingClientRect());
      }
      else { setSelection(null); setBounds(null); }
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { onSelectingChange(false); setSelection(null); setBounds(null); } };
    window.addEventListener('scroll', update, true); window.addEventListener('resize', update); window.addEventListener('keydown', escape);
    const observer = new MutationObserver(update); observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); window.removeEventListener('keydown', escape); };
  }, [onSelectingChange, selection?.point?.x, selection?.point?.y, selection?.object?.id]);
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
    try { const receipt = await onSubmit(value, selection); setValue(''); setStatus(typeof receipt === 'string' && receipt.trim() ? receipt : 'Added to your chat draft for review.'); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not send. Try again.'); }
    finally { setBusy(false); }
  }
  const style: CSSProperties = bounds && typeof window !== 'undefined' ? { left: Math.max(12, Math.min(window.innerWidth - 372, bounds.left + bounds.width / 2 - 180)), top: Math.max(64, Math.min(window.innerHeight - panelHeight - 12, bounds.bottom + 12 + panelHeight < window.innerHeight ? bounds.bottom + 12 : bounds.top - panelHeight - 12)) } : {};
  const suggestions = selection?.object
    ? ['Explain this object', 'Suggest an adjustment', 'Review materials']
    : selection?.tag === 'canvas' || selection?.tag === 'img'
      ? ['Describe this visual', 'Suggest an improvement', 'Check alignment']
      : ['Explain this element', 'Suggest a fix', 'Review accessibility'];
  return <div data-mini-agentsam="" style={{ pointerEvents: 'none' }}>
    {selecting && <div ref={cursorHint} className="mini-agentsam-hint" role="status"><MousePointer2 size={14} aria-hidden="true" /> Select a content element <kbd>Esc</kbd></div>}
    {!selecting && !selection && status && <div className="mini-agentsam-hint" role="status">{status}</div>}
    {bounds && (selecting || selection) && <div className="mini-agentsam-outline" style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }} />}
    {selection && bounds && !expanded && <button type="button" className="mini-agentsam-pin"
      style={{ '--mini-pin-left': Math.max(8, Math.min(window.innerWidth - 30, bounds.right - 10)) + 'px',
        '--mini-pin-top': Math.max(8, Math.min(window.innerHeight - 30, bounds.top - 10)) + 'px' } as CSSProperties}
      aria-label={`Annotation pin for ${selection.label || selection.tag}`} title="Open annotation"
      onClick={() => panel.current?.querySelector('textarea')?.focus()}>1</button>}
    {selection && expanded && <div className="mini-agentsam-review-backdrop" onClick={() => setExpanded(false)} />}
    {selection && <section ref={panel} className="mini-agentsam-panel" data-expanded={expanded ? 'true' : 'false'} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? 'Review annotation message' : 'miniAgentSam'} style={expanded ? undefined : style}
      onDoubleClick={(event) => { if (!(event.target as Element).closest('button')) setExpanded(true); }}
      onPointerUp={(event) => { if (event.pointerType !== 'touch' || (event.target as Element).closest('button')) return; const now = Date.now(); if (now - lastTouch.current < 300) setExpanded(true); lastTouch.current = now; }}>

      <div className="mini-agentsam-heading"><span title={selection.label}>{selection.label || selection.tag}</span><button type="button" aria-label={expanded ? "Collapse message" : "Expand message"} title={expanded ? "Collapse message" : "Review entire message"} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button><button type="button" aria-label="Close miniAgentSam" onClick={() => { setSelection(null); setBounds(null); setExpanded(false); }}><X size={18} /></button></div>
      {renderComposer ? renderComposer({ value, onChange: setValue, onSend: () => void submit(), busy, expanded }) : <><textarea aria-label="Annotation instructions" placeholder="Ask about this…" value={value} onChange={(event) => setValue(event.target.value)} /><button type="button" disabled={busy || !value.trim()} className="mini-agentsam-send" aria-label="Send annotation" title="Send annotation" onClick={() => void submit()}><ArrowUp size={18} /><span className="mini-agentsam-visually-hidden">Send annotation</span></button></>}
      {!expanded && !busy && !value.trim() && <div className="mini-agentsam-suggestions" role="group" aria-label="Suggested annotation prompts">
        {suggestions.map(text => <button type="button" key={text} onClick={() => setValue(text)}>{text}</button>)}
      </div>}
      {status && <p role="status">{status}</p>}
    </section>}
  </div>;
}

