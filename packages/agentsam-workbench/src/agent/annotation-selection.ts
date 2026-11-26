/**
 * Shared annotation target contract for AgentSam work surfaces.
 *
 * A visible DOM node is not automatically selectable. A target must be either:
 * - an explicitly marked [data-annotation-target] content object;
 * - a native/ARIA interactive control;
 * - a meaningful semantic content element (text, image, table, etc.).
 *
 * Application chrome and assistant UI opt out with data-annotation-control,
 * data-annotation-ignore, or data-mini-agentsam. Generic wrappers never win.
 */
export const ANNOTATION_TARGET_SELECTOR = [
  '[data-annotation-target]',
  'button',
  'a[href]',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
  '[role="button"]',
  '[role="link"]',
  '[role="textbox"]',
  '[role="heading"]',
  '[role="img"]',
  '[role="table"]',
  '[role="row"]',
  '[role="cell"]',
  'label',
  'img',
  'video',
  'audio',
  'canvas',
  'svg',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'li', 'figure', 'figcaption', 'blockquote', 'pre', 'code',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
].join(',');

export const ANNOTATION_EXCLUDED_SELECTOR = [
  '[data-annotation-control]',
  '[data-annotation-ignore]',
  '[data-mini-agentsam]',
  '[hidden]',
  '[inert]',
  '[aria-hidden="true"]',
].join(',');

const EDITABLE_SELECTOR = 'input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
const POINT_ANCHOR_SELECTOR = 'canvas,svg,iframe,video,[data-annotation-anchor="point"],[data-cad-iframe-region]';

function asElement(target: EventTarget | Node | null): Element | null {
  if (!target || typeof target !== 'object') return null;
  const node = target as Node;
  if (node.nodeType === 1) return node as Element;
  if (node.nodeType === 3) return node.parentElement;
  return null;
}

/** Find the nearest matching ancestor without crossing the active workspace root. */
export function closestAnnotationAncestor(
  start: Element | null,
  selector: string,
  root: Element,
): Element | null {
  let current = start;
  while (current && current !== root) {
    if (current.matches(selector)) return current;
    current = current.parentElement;
  }
  return null;
}

function isVisibleAnnotationScope(element: HTMLElement): boolean {
  if (!element.isConnected || element.hasAttribute('hidden') || element.hasAttribute('inert')
    || element.getAttribute('aria-hidden') === 'true' || !element.getClientRects().length) return false;
  const view = element.ownerDocument?.defaultView;
  if (!view) return true;
  let current: Element | null = element;
  while (current) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
      || Number(style.opacity || 1) <= 0) return false;
    current = current.parentElement;
  }
  return true;
}

/** Resolve one explicit active workspace; ambiguous visible roots fail closed. */
export function resolveAnnotationScope(documentRef: Document, preferredId: string | null = null): HTMLElement | null {
  const visible = Array.from(documentRef.querySelectorAll<HTMLElement>('[data-agentsam-annotation-scope]'))
    .filter(isVisibleAnnotationScope);
  const focused = (() => {
    let current = documentRef.activeElement as Element | null;
    while (current) {
      if (visible.includes(current as HTMLElement)) return current as HTMLElement;
      current = current.parentElement;
    }
    return null;
  })();

  if (preferredId) {
    const requested = visible.filter(element => element.dataset.annotationScopeId === preferredId);
    if (requested.length === 1) return requested[0];
    if (focused && requested.includes(focused)) return focused;
    return null;
  }
  if (focused) return focused;
  const active = visible.filter(element => element.dataset.annotationScopeActive === 'true');
  if (active.length === 1) return active[0];
  if (active.length > 1) return null;
  return visible.length === 1 ? visible[0] : null;
}

export function isAnnotationExcluded(element: Element, root: Element): boolean {
  if (element !== root && !root.contains(element)) return true;
  let current: Element | null = element;
  while (current) {
    if (current.matches(ANNOTATION_EXCLUDED_SELECTOR)) return true;
    if (current === root) break;
    current = current.parentElement;
  }
  return false;
}

function isVisibleAnnotationTarget(element: Element): boolean {
  if (element.isConnected === false || element.hasAttribute('hidden')) return false;
  if (!element.getClientRects().length) return false;
  const view = element.ownerDocument?.defaultView;
  if (!view) return true;
  let current: Element | null = element;
  while (current) {
    const style = view.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse'
      || Number(style.opacity || 1) <= 0) return false;
    current = current.parentElement;
  }
  return true;
}

/**
 * Resolve only a meaningful target inside the supplied workspace. No fallback
 * to the clicked wrapper, body, document element, or arbitrary div is allowed.
 * data-annotation-proxy marks rendered child UI that should resolve to its
 * owning explicit data-annotation-target object (e.g. a canvas node).
 */
export function resolveAnnotationTarget(
  eventTarget: EventTarget | Node | null,
  root: Element,
): Element | null {
  const hit = asElement(eventTarget);
  if (!hit || hit === root || !root.contains(hit) || isAnnotationExcluded(hit, root)) return null;

  const proxy = closestAnnotationAncestor(hit, '[data-annotation-proxy]', root);
  const candidate = proxy
    ? closestAnnotationAncestor(proxy.parentElement, '[data-annotation-target]', root)
    : closestAnnotationAncestor(hit, ANNOTATION_TARGET_SELECTOR, root);

  if (!candidate || candidate === root || !root.contains(candidate)) return null;
  if (isAnnotationExcluded(candidate, root) || !isVisibleAnnotationTarget(candidate)) return null;
  return candidate;
}

export function isAnnotationEditableTarget(element: Element, root: Element): boolean {
  return element.matches(EDITABLE_SELECTOR)
    || Boolean(closestAnnotationAncestor(element.parentElement, EDITABLE_SELECTOR, root));
}

/** Canvas/viewport targets use a precise pointer anchor instead of a huge outline. */
export function isAnnotationVisualTarget(element: Element, root: Element): boolean {
  return element.matches(POINT_ANCHOR_SELECTOR)
    || Boolean(closestAnnotationAncestor(element.parentElement, '[data-cad-iframe-region]', root));
}

function clean(value: string | null | undefined, max: number): string {
  return (value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function domPathWithin(root: Element, element: Element): string {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== root) {
    const node: Element = current;
    const parent: Element | null = node.parentElement;
    if (!parent) break;
    const children = Array.from(parent.children) as Element[];
    const sameTag = children.filter((child: Element) => child.tagName === node.tagName);
    parts.unshift(`${node.tagName.toLowerCase()}:${sameTag.indexOf(node) + 1}`);
    current = parent;
  }
  return parts.join('/') || element.tagName.toLowerCase();
}

export function annotationTargetId(element: Element, root: Element): string {
  const explicit = [
    element.getAttribute('data-annotation-id'),
    element.getAttribute('data-canvas-node'),
    element.getAttribute('data-agentsam-resource'),
    element.id,
  ].map(value => clean(value, 200)).find(value => value && value !== 'true');
  return explicit || `dom:${domPathWithin(root, element)}`;
}

export function annotationTargetLabel(element: Element, root: Element): string {
  const direct = [
    element.getAttribute('data-annotation-label'),
    element.getAttribute('aria-label'),
    element.getAttribute('alt'),
    element.getAttribute('title'),
    element.getAttribute('placeholder'),
  ].map(value => clean(value, 180)).find(Boolean);
  if (direct) return direct;

  const labels = (element as HTMLInputElement).labels;
  if (labels?.length) {
    const label = clean(Array.from(labels).map(item => item.textContent || '').join(' '), 180);
    if (label) return label;
  }
  const wrappingLabel = closestAnnotationAncestor(element.parentElement, 'label', root);
  const labelText = clean(wrappingLabel?.textContent, 180);
  if (labelText) return labelText;

  const editable = isAnnotationEditableTarget(element, root);
  const content = clean(element.textContent, 180);
  if (content) return content;
  if (editable) return 'Input field';
  if (element.matches('img')) return 'Image';
  if (element.matches('svg')) return 'Graphic';
  if (element.matches('canvas')) return 'Canvas';
  if (element.matches('video')) return 'Video';
  return element.tagName.toLowerCase();
}

export function annotationTargetText(element: Element, root: Element): string {
  if (isAnnotationEditableTarget(element, root)) return '[field value withheld]';
  return clean(
    element.textContent
      || element.getAttribute('alt')
      || element.getAttribute('aria-label')
      || element.getAttribute('title'),
    300,
  );
}

export function describeAnnotationTarget(element: Element, root: Element) {
  const editable = isAnnotationEditableTarget(element, root);
  return {
    id: annotationTargetId(element, root),
    label: annotationTargetLabel(element, root),
    tag: element.tagName.toLowerCase(),
    text: annotationTargetText(element, root),
    editable,
    visual: isAnnotationVisualTarget(element, root),
  };
}

/** Build the same bounded selector contract for opaque-origin sandboxed frames. */
export function buildAnnotationBridgeScript(): string {
  return `(() => {
  const TARGET_SELECTOR = ${JSON.stringify(ANNOTATION_TARGET_SELECTOR)};
  const EXCLUDED_SELECTOR = ${JSON.stringify(ANNOTATION_EXCLUDED_SELECTOR)};
  const EDITABLE_SELECTOR = ${JSON.stringify(EDITABLE_SELECTOR)};
  const POINT_ANCHOR_SELECTOR = ${JSON.stringify(POINT_ANCHOR_SELECTOR)};
  let enabled = false, last = 0;
  const clean = (value, max) => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, max);
  function closestWithin(start, selector, root) {
    let current = start;
    while (current && current !== root) {
      if (current.matches(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }
  function excluded(element, root) {
    if (!element || (element !== root && !root.contains(element))) return true;
    let current = element;
    while (current) {
      if (current.matches(EXCLUDED_SELECTOR)) return true;
      if (current === root) break;
      current = current.parentElement;
    }
    return false;
  }
  function visible(element) {
    if (!element || !element.isConnected || !element.getClientRects().length) return false;
    let current = element;
    while (current) {
      const style = getComputedStyle(current);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity || 1) <= 0) return false;
      current = current.parentElement;
    }
    return true;
  }
  function resolve(target, root) {
    const hit = target && target.nodeType === 1 ? target : target && target.parentElement;
    if (!hit || hit === root || !root.contains(hit) || excluded(hit, root)) return null;
    const proxy = closestWithin(hit, '[data-annotation-proxy]', root);
    const candidate = proxy
      ? closestWithin(proxy.parentElement, '[data-annotation-target]', root)
      : closestWithin(hit, TARGET_SELECTOR, root);
    if (!candidate || candidate === root || !root.contains(candidate) || excluded(candidate, root) || !visible(candidate)) return null;
    return candidate;
  }
  function pathWithin(root, element) {
    const parts = [];
    let current = element;
    while (current && current !== root) {
      const parent = current.parentElement;
      if (!parent) break;
      const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
      parts.unshift(current.tagName.toLowerCase() + ':' + (siblings.indexOf(current) + 1));
      current = parent;
    }
    return parts.join('/') || element.tagName.toLowerCase();
  }
  function describe(element, root) {
    const editable = element.matches(EDITABLE_SELECTOR) || Boolean(closestWithin(element.parentElement, EDITABLE_SELECTOR, root));
    const values = [element.getAttribute('data-annotation-id'), element.getAttribute('data-canvas-node'), element.getAttribute('data-agentsam-resource'), element.id];
    const explicit = values.map(value => clean(value, 200)).find(value => value && value !== 'true');
    const labels = element.labels ? Array.from(element.labels).map(item => item.textContent || '').join(' ') : '';
    const wrappingLabel = closestWithin(element.parentElement, 'label', root);
    const label = [element.getAttribute('data-annotation-label'), element.getAttribute('aria-label'), element.getAttribute('alt'), element.getAttribute('title'), element.getAttribute('placeholder'), labels, wrappingLabel && wrappingLabel.textContent, element.textContent, editable ? 'Input field' : element.tagName.toLowerCase()]
      .map(value => clean(value, 180)).find(Boolean);
    const visual = element.matches(POINT_ANCHOR_SELECTOR) || Boolean(closestWithin(element.parentElement, '[data-cad-iframe-region]', root));
    return {
      id: explicit || 'dom:' + pathWithin(root, element),
      label: label || element.tagName.toLowerCase(),
      tag: element.tagName.toLowerCase(),
      text: editable ? '[field value withheld]' : clean(element.textContent || element.getAttribute('alt') || element.getAttribute('aria-label') || element.getAttribute('title'), 300),
      editable,
      visual
    };
  }
  function send(type, event) {
    const root = document.body;
    const selected = resolve(event.target, root);
    if (!selected) {
      parent.postMessage({ source: 'agentsam-browser', type, selection: null }, '*');
      return;
    }
    const rect = selected.getBoundingClientRect();
    parent.postMessage({ source: 'agentsam-browser', type, selection: {
      ...describe(selected, root),
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      point: { x: event.clientX, y: event.clientY },
      url: location.href
    } }, '*');
  }
  addEventListener('message', event => {
    if (event.source === parent && event.data && event.data.source === 'agentsam-host' && event.data.type === 'annotation-mode') enabled = event.data.enabled === true;
  });
  addEventListener('pointermove', event => {
    if (!enabled || Date.now() - last < 70) return;
    last = Date.now();
    send('annotation-hover', event);
  }, true);
  addEventListener('click', event => {
    if (!enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    send('annotation-selection', event);
  }, true);
})();`;
}
