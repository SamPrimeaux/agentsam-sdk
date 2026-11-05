/** Host projection of cms_themes semantic roles. Used by React and static
 * Console pages; neither consumer owns a second theme registry.
 *
 * Account Theme Studio (`cms_themes` + `cms_theme_preferences`) is the
 * appearance authority. localStorage only caches the last successful apply
 * for first paint — it never overrides a newer server response. */
export const STUDIO_APPEARANCE_CACHE_PREFIX = 'agentsam-studio-appearance-v1:';
export const STUDIO_APPEARANCE_CACHE_LAST = 'agentsam-studio-appearance-v1:last';

const palettes = {
  dark: {
    canvas: '#171717', sidebar: '#212121', surface: '#262626', popover: '#292929',
    text: '#ececec', muted: '#aaaaaa', border: '#ffffff1a', hover: '#ffffff0d',
    selected: '#ffffff12', danger: '#ff8b8b', topbar: '#111113', search: '#25242a',
    ink: '#ececec', inkMuted: '#aaaaaa',
  },
  light: {
    canvas: '#fafafa', sidebar: '#f1f1f1', surface: '#ffffff', popover: '#ffffff',
    text: '#202020', muted: '#636363', border: '#0000001f', hover: '#00000008',
    selected: '#0000000d', danger: '#b42323', topbar: '#141414', search: '#262626',
    ink: '#202020', inkMuted: '#636363',
  },
};
const roles = {
  canvas: ['--bg-canvas', '--bg-app', '--bg-primary'],
  sidebar: ['--bg-sidebar', '--bg-nav', '--bg-shell'],
  surface: ['--bg-surface', '--bg-elevated', '--bg-secondary', '--bg-card'],
  popover: ['--bg-panel', '--bg-elevated', '--bg-card'],
  text: ['--text-sidebar', '--text-nav', '--text-main', '--text-primary', '--color-text'],
  muted: ['--text-sidebar-muted', '--text-nav-muted', '--text-muted', '--text-secondary'],
  // `text`/`muted` belong to the sidebar chrome (light-on-dark rail in light
  // themes). `ink`/`inkMuted` are page content text on canvas/surface.
  ink: ['--text-main', '--text-primary', '--color-text', '--text-heading', '--text-sidebar', '--text-nav'],
  inkMuted: ['--text-muted', '--text-secondary', '--text-sidebar-muted', '--text-nav-muted'],
  border: ['--border-nav', '--border', '--border-subtle', '--color-border'],
  hover: ['--bg-hover', '--primary-dim', '--bg-secondary'],
  selected: ['--primary-dim', '--bg-hover', '--bg-secondary'],
  danger: ['--accent-danger', '--color-error'],
  topbar: ['--bg-topbar', '--c-topbar'],
  search: ['--bg-search', '--c-search-bg'],
};
const consoleRoles = {
  '--c-bg': 'canvas',
  '--c-surface': 'surface',
  '--c-surface-2': 'sidebar',
  '--c-topbar': 'topbar',
  '--c-topbar-hover': 'hover',
  '--c-search-bg': 'search',
  '--c-ink': 'ink',
  '--c-ink-2': 'inkMuted',
  '--c-muted': 'inkMuted',
  '--c-soft': 'inkMuted',
  '--c-line': 'border',
  '--c-line-2': 'border',
  '--c-hover': 'hover',
  '--c-active': 'selected',
};
const homeRoles = {
  '--home-line': 'border',
  '--home-ink': 'ink',
  '--home-muted': 'inkMuted',
  '--home-card': 'surface',
  '--home-field': 'surface',
  '--home-soft': 'hover',
  '--home-ink-soft': 'inkMuted',
};
// Tailwind/shadcn semantic tokens used by React routes. Projected from the
// same roles so html/body never fall back to the static dark defaults.
const tailwindRoles = {
  '--color-background': 'canvas',
  '--color-foreground': 'ink',
  '--color-card': 'surface',
  '--color-card-foreground': 'ink',
  '--color-popover': 'popover',
  '--color-popover-foreground': 'ink',
  '--color-muted-foreground': 'inkMuted',
};

/** @param {string} accent */
function accentInk(accent) {
  if (!/^#[0-9a-f]{6}$/i.test(accent || '')) return '#ffffff';
  const rgb = [1, 3, 5].map((i) => parseInt(accent.slice(i, i + 2), 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#000000' : '#ffffff';
}

/** Product-specific tokens supplied by the existing account CMS theme. */
/**
 * @param {Record<string, unknown> | null | undefined} vars
 * @returns {Record<string, string>}
 */
function movieModeThemeTokens(vars) {
  if (!vars || typeof vars !== 'object' || Array.isArray(vars)) return {};
  /** @type {Record<string, string>} */
  const safe = {};
  for (const [name, raw] of Object.entries(vars)) {
    if (!/^--copro-[a-z0-9-]{1,66}$/.test(name) || typeof raw !== 'string' || raw.length > 120) continue;
    const value = raw.trim();
    if (!value || /[;{}<>\u0000-\u001f]/.test(value) || /(?:url\s*\(|expression\s*\(|javascript:|@import)/i.test(value)) continue;
    safe[name] = value;
  }
  return safe;
}

/**
 * @param {{id?:string,themeFamily?:string,cssVars?:Record<string,string>} | null | undefined} record
 * @param {{theme?:string,accentColor?:string|null}} fallback
 * @returns {{theme:'light'|'dark',tokens:Record<string,string>,productTokens:Record<string,string>,accentColor:string,themeId:string|null,accentInk:string}}
 */
export function projectStudioShellAppearance(record, fallback = {}) {
  const family = String(record?.themeFamily || '').toLowerCase();
  const theme = family === 'light' || family === 'dark' ? family : fallback.theme === 'light' ? 'light' : 'dark';
  const vars = record?.cssVars || {};
  /** @param {...string} keys */
  const pick = (...keys) => keys.map((key) => vars[key]).find((value) => typeof value === 'string' && value.trim() && value.length <= 120)?.trim();
  /** @type {Record<string,string>} */
  const tokens = { ...palettes[theme] };
  for (const [role, aliases] of Object.entries(roles)) {
    tokens[role] = pick('--nav-' + role, ...aliases) || tokens[role];
  }
  // Topbar/search stay chrome-dark in light themes unless the theme supplies them.
  if (!pick('--nav-topbar', '--bg-topbar', '--c-topbar')) {
    tokens.topbar = theme === 'light' ? '#141414' : tokens.sidebar;
  }
  if (!pick('--nav-search', '--bg-search', '--c-search-bg')) {
    tokens.search = theme === 'light' ? '#262626' : tokens.surface;
  }
  const font = pick('--nav-font', '--font-sans');
  if (font) tokens.font = font;
  const accentColor = pick('--nav-accent', '--accent', '--color-primary', '--accent-primary')
    || fallback.accentColor
    || '#8b5cf6';
  return {
    theme,
    tokens,
    productTokens: movieModeThemeTokens(vars),
    accentColor,
    accentInk: accentInk(accentColor),
    themeId: record?.id || null,
  };
}

/**
 * @param {ReturnType<typeof projectStudioShellAppearance>} appearance
 * @param {HTMLElement} root
 */
export function applyStudioShellAppearance(appearance, root) {
  if (!appearance?.tokens || (appearance.theme !== 'light' && appearance.theme !== 'dark')) return;
  root.dataset.theme = appearance.theme;
  root.style.colorScheme = appearance.theme;
  root.classList.toggle('dark', appearance.theme === 'dark');
  root.classList.toggle('light', appearance.theme === 'light');
  for (const [role, value] of Object.entries(appearance.tokens)) {
    root.style.setProperty('--nav-' + role, value);
  }
  root.style.setProperty('--nav-accent', appearance.accentColor);
  for (const [name, role] of Object.entries(consoleRoles)) {
    root.style.setProperty(name, appearance.tokens[role]);
  }
  root.style.setProperty('--c-accent', appearance.accentColor);
  root.style.setProperty('--c-focus', appearance.accentColor);
  root.style.setProperty('--c-accent-ink', appearance.accentInk || accentInk(appearance.accentColor));
  for (const [name, role] of Object.entries(homeRoles)) {
    root.style.setProperty(name, appearance.tokens[role]);
  }
  root.style.setProperty('--home-focus', appearance.accentColor);
  // On account/theme changes remove stale product overrides; stylesheet defaults win.
  for (const name of (root.dataset.coproAppearanceTokens || '').split(',').filter(Boolean)) {
    root.style.removeProperty?.(name);
  }
  const productTokens = movieModeThemeTokens(appearance.productTokens);
  for (const [name, value] of Object.entries(productTokens)) {
    root.style.setProperty(name.replace(/^--copro-/, '--copro-theme-'), value);
  }
  root.dataset.coproAppearanceTokens = Object.keys(productTokens)
    .map((name) => name.replace(/^--copro-/, '--copro-theme-')).join(',');
  for (const [name, role] of Object.entries(tailwindRoles)) {
    const value = appearance.tokens[role] ?? appearance.tokens[role === 'ink' ? 'text' : role === 'inkMuted' ? 'muted' : role];
    if (value) root.style.setProperty(name, value);
  }
}

/** @param {string|null|undefined} accountId */
export function appearanceCacheKey(accountId) {
  return STUDIO_APPEARANCE_CACHE_PREFIX + (accountId || 'anonymous');
}

/**
 * @param {string|null|undefined} [accountId]
 * @param {Storage|null} [storage]
 * @returns {(ReturnType<typeof projectStudioShellAppearance> & {accountId?:string|null,updatedAt?:number}) | null}
 */
export function readStudioAppearanceCache(accountId, storage) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return null;
  try {
    const resolvedKey = accountId
      ? appearanceCacheKey(accountId)
      : (store.getItem(STUDIO_APPEARANCE_CACHE_LAST) || appearanceCacheKey('anonymous'));
    const value = store.getItem(resolvedKey);
    if (!value) return null;
    const parsed = JSON.parse(value);
    if (!parsed || (parsed.theme !== 'light' && parsed.theme !== 'dark') || !parsed.tokens || typeof parsed.tokens !== 'object') {
      return null;
    }
    return {
      theme: parsed.theme,
      tokens: parsed.tokens,
      productTokens: movieModeThemeTokens(parsed.productTokens),
      accentColor: typeof parsed.accentColor === 'string' ? parsed.accentColor : '#8b5cf6',
      accentInk: typeof parsed.accentInk === 'string' ? parsed.accentInk : accentInk(parsed.accentColor),
      themeId: parsed.themeId || null,
      accountId: parsed.accountId || accountId || null,
      updatedAt: Number(parsed.updatedAt) || 0,
    };
  } catch {
    return null;
  }
}

/**
 * @param {string|null|undefined} accountId
 * @param {ReturnType<typeof projectStudioShellAppearance>} appearance
 * @param {Storage|null} [storage]
 */
export function writeStudioAppearanceCache(accountId, appearance, storage) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store || !appearance?.tokens || !accountId) return;
  try {
    const payload = JSON.stringify({
      theme: appearance.theme,
      tokens: appearance.tokens,
      productTokens: movieModeThemeTokens(appearance.productTokens),
      accentColor: appearance.accentColor,
      accentInk: appearance.accentInk || accentInk(appearance.accentColor),
      themeId: appearance.themeId,
      accountId,
      updatedAt: Date.now(),
    });
    store.setItem(appearanceCacheKey(accountId), payload);
    store.setItem(STUDIO_APPEARANCE_CACHE_LAST, appearanceCacheKey(accountId));
  } catch {
    /* Cache is best-effort for first paint. */
  }
}

/**
 * @param {string|null|undefined} accountId
 * @param {Storage|null} [storage]
 */
export function clearStudioAppearanceCache(accountId, storage) {
  const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
  if (!store) return;
  try {
    if (accountId) store.removeItem(appearanceCacheKey(accountId));
    const last = store.getItem(STUDIO_APPEARANCE_CACHE_LAST);
    if (!accountId || last === appearanceCacheKey(accountId)) store.removeItem(STUDIO_APPEARANCE_CACHE_LAST);
  } catch {
    /* ignore */
  }
}

/**
 * Apply last-known-good appearance synchronously before React/registry fetch.
 * @param {string|null|undefined} accountId
 * @param {HTMLElement} root
 * @returns {ReturnType<typeof projectStudioShellAppearance>|null}
 */
export function bootstrapStudioAppearanceFromCache(accountId, root) {
  const cached = readStudioAppearanceCache(accountId);
  if (!cached || !root) return null;
  applyStudioShellAppearance(cached, root);
  return cached;
}

/** Inline first-paint bootstrap for document <head> (no module graph). */
const FIRST_PAINT_ROLE_MAP = { ...consoleRoles, ...homeRoles, ...tailwindRoles };
export const FIRST_PAINT_BOOTSTRAP_SCRIPT = `(function(){try{var P=${JSON.stringify(STUDIO_APPEARANCE_CACHE_PREFIX)},L=${JSON.stringify(STUDIO_APPEARANCE_CACHE_LAST)};var key=localStorage.getItem(L)||(P+'anonymous');var raw=localStorage.getItem(key);if(!raw)return;var a=JSON.parse(raw);if(!a||(a.theme!=='light'&&a.theme!=='dark')||!a.tokens)return;var r=document.documentElement;r.dataset.theme=a.theme;r.style.colorScheme=a.theme;r.classList.toggle('dark',a.theme==='dark');r.classList.toggle('light',a.theme==='light');var t=a.tokens;for(var k in t){if(Object.prototype.hasOwnProperty.call(t,k))r.style.setProperty('--nav-'+k,t[k]);}if(a.accentColor){r.style.setProperty('--nav-accent',a.accentColor);r.style.setProperty('--c-accent',a.accentColor);r.style.setProperty('--c-focus',a.accentColor);r.style.setProperty('--home-focus',a.accentColor);}var map=${JSON.stringify(FIRST_PAINT_ROLE_MAP)};var fb={ink:'text',inkMuted:'muted'};for(var n in map){var v=t[map[n]]||t[fb[map[n]]];if(v)r.style.setProperty(n,v);}if(a.accentInk)r.style.setProperty('--c-accent-ink',a.accentInk);var p=a.productTokens||{},keys=[];for(var n in p){var v=p[n];if(/^--copro-[a-z0-9-]{1,66}$/.test(n)&&typeof v==='string'&&v.length<=120&&!/[;{}<>\\u0000-\\u001f]/.test(v)&&!/(?:url\\s*\\(|expression\\s*\\(|javascript:|@import)/i.test(v)){var k='--copro-theme-'+n.slice(8);r.style.setProperty(k,v);keys.push(k);}}r.dataset.coproAppearanceTokens=keys.join(',');}catch(e){}})();`;
