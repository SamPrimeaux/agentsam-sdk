/* Layout only: panel widths stay on this device, never in a customer's CMS draft. */
export const PANEL_WIDTHS = Object.freeze({
  tree: { default: 300, min: 220, max: 520 },
  inspector: { default: 300, min: 240, max: 500 },
  catalog: { default: 520, min: 380, max: 850 },
});

export function clampPanelWidth(kind, proposed, available = Infinity) {
  const spec = PANEL_WIDTHS[kind];
  if (!spec) throw new TypeError('Unknown editor panel');
  const room = Number.isFinite(available) ? Math.max(spec.min, available) : spec.max;
  return Math.round(Math.min(Math.max(spec.min, Number(proposed) || spec.default), spec.max, room));
}

const storageKey = 'iam:cms-editor-panel-widths:v1';
const px = kind => '--te-' + (kind === 'catalog' ? 'catalog' : kind) + '-width';

export function mountThemeStudioResizers(root) {
  if (!root || root.dataset.resizersMounted === 'true') return null;
  const workspace = root.querySelector('.theme-studio-workspace');
  if (!workspace) return null;
  root.dataset.resizersMounted = 'true';
  const values = Object.fromEntries(Object.entries(PANEL_WIDTHS).map(([key, spec]) => [key, spec.default]));
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    for (const key of Object.keys(values))
      if (Number.isFinite(saved[key])) values[key] = clampPanelWidth(key, saved[key]);
  } catch { /* Private browsing may disable storage. */ }
  const desktop = () => matchMedia('(min-width: 901px)').matches;
  const roomFor = kind => {
    const width = workspace.getBoundingClientRect().width;
    if (kind === 'tree') return width - (root.dataset.editorLayout === 'wide' && root.dataset.inspector !== 'closed' ? values.inspector : 0) - 350;
    if (kind === 'inspector') return width - values.tree - 350;
    return width - values.tree - 16;
  };
  const handles = new Map();
  const update = () => {
    for (const key of Object.keys(values)) {
      values[key] = clampPanelWidth(key, values[key], roomFor(key));
      root.style.setProperty(px(key), values[key] + 'px');
      handles.get(key)?.setAttribute('aria-valuenow', String(values[key]));
    }
    const catalog = workspace.querySelector('#te-section-menu');
    if (catalog) catalog.style.setProperty('--te-catalog-width', values.catalog + 'px');
  };
  const persist = () => {
    try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch {}
  };
  const set = (kind, proposed, save = false) => {
    values[kind] = clampPanelWidth(kind, proposed, roomFor(kind));
    update();
    if (save) persist();
  };
  const makeHandle = (kind, label, parent) => {
    const element = document.createElement('div');
    element.className = 'te-resize-handle te-resize-handle--' + kind;
    element.dataset.resizePanel = kind;
    element.setAttribute('role', 'separator');
    element.setAttribute('tabindex', '0');
    element.setAttribute('aria-label', label);
    element.setAttribute('aria-orientation', 'vertical');
    element.setAttribute('aria-valuemin', String(PANEL_WIDTHS[kind].min));
    element.setAttribute('aria-valuemax', String(PANEL_WIDTHS[kind].max));
    element.title = 'Drag to resize. Use arrow keys for precise adjustment; double-click to reset.';
    parent.appendChild(element);
    handles.set(kind, element);
    element.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !desktop()) return;
      event.preventDefault();
      event.stopPropagation();
      const startX = event.clientX, starting = values[kind];
      root.classList.add('te-is-resizing');
      element.setPointerCapture?.(event.pointerId);
      const move = pointer => set(kind, starting + (pointer.clientX - startX) * (kind === 'inspector' ? -1 : 1));
      const end = () => {
        root.classList.remove('te-is-resizing');
        element.removeEventListener('pointermove', move);
        element.removeEventListener('pointerup', end);
        element.removeEventListener('pointercancel', end);
        persist();
      };
      element.addEventListener('pointermove', move);
      element.addEventListener('pointerup', end);
      element.addEventListener('pointercancel', end);
    });
    element.addEventListener('keydown', event => {
      const direction = kind === 'inspector' ? -1 : 1;
      let next;
      if (event.key === 'ArrowRight') next = values[kind] + direction * (event.shiftKey ? 40 : 10);
      if (event.key === 'ArrowLeft') next = values[kind] - direction * (event.shiftKey ? 40 : 10);
      if (event.key === 'Home') next = PANEL_WIDTHS[kind].min;
      if (event.key === 'End') next = PANEL_WIDTHS[kind].max;
      if (next == null) return;
      event.preventDefault();
      set(kind, next, true);
    });
    element.addEventListener('dblclick', () => set(kind, PANEL_WIDTHS[kind].default, true));
    return element;
  };
  makeHandle('tree', 'Resize sections and theme settings panel', workspace);
  makeHandle('inspector', 'Resize selected section settings panel', workspace);
  const dockCatalog = () => {
    const menu = root.querySelector('#te-section-menu');
    const tree = root.querySelector('#te-tree');
    if (!menu || !tree) return;
    const target = desktop() ? workspace : tree;
    if (menu.parentElement !== target) target.appendChild(menu);
    if (!menu.querySelector('[data-resize-panel="catalog"]'))
      makeHandle('catalog', 'Resize sections and apps picker', menu);
    update();
  };
  const observer = new MutationObserver(dockCatalog);
  observer.observe(workspace, { childList: true, subtree: true });
  const resize = new ResizeObserver(() => { update(); dockCatalog(); });
  resize.observe(workspace);
  window.addEventListener('resize', dockCatalog);
  dockCatalog();
  return { values, set, disconnect: () => { observer.disconnect(); resize.disconnect(); window.removeEventListener('resize', dockCatalog); } };
}

// The established editor builds its shell asynchronously. No competing shell.
if (typeof document !== 'undefined') {
  const mount = () => {
    const root = document.querySelector('.theme-studio');
    if (!root || !root.querySelector('.theme-studio-workspace')) return false;
    mountThemeStudioResizers(root);
    return true;
  };
  if (!mount()) {
    const watcher = new MutationObserver(() => { if (mount()) watcher.disconnect(); });
    watcher.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => watcher.disconnect(), { once: true });
  }
}
