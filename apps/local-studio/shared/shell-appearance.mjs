/** Host projection of cms_themes semantic roles. Used by React and static
 * Console pages; neither consumer owns a second theme registry. */
const palettes = {
  dark: { canvas:'#171717', sidebar:'#212121', surface:'#262626', popover:'#292929', text:'#ececec', muted:'#aaaaaa', border:'#ffffff1a', hover:'#ffffff0d', selected:'#ffffff12', danger:'#ff8b8b' },
  light: { canvas:'#fafafa', sidebar:'#f1f1f1', surface:'#ffffff', popover:'#ffffff', text:'#202020', muted:'#636363', border:'#0000001f', hover:'#00000008', selected:'#0000000d', danger:'#b42323' },
};
const roles = {
  canvas:['--bg-canvas','--bg-app','--bg-primary'],
  sidebar:['--bg-sidebar','--bg-nav','--bg-shell'],
  surface:['--bg-surface','--bg-elevated','--bg-secondary','--bg-card'],
  popover:['--bg-panel','--bg-elevated','--bg-card'],
  text:['--text-sidebar','--text-nav','--text-main','--text-primary','--color-text'],
  muted:['--text-sidebar-muted','--text-nav-muted','--text-muted','--text-secondary'],
  border:['--border-nav','--border','--border-subtle','--color-border'],
  hover:['--bg-hover','--primary-dim','--bg-secondary'],
  selected:['--primary-dim','--bg-hover','--bg-secondary'],
  danger:['--accent-danger','--color-error'],
};
const consoleRoles = {
  '--c-bg':'canvas', '--c-surface':'surface', '--c-surface-2':'sidebar',
  '--c-ink':'text', '--c-ink-2':'muted', '--c-muted':'muted', '--c-soft':'muted',
  '--c-line':'border', '--c-line-2':'border', '--c-hover':'hover', '--c-active':'selected',
};

/**
 * @param {{id?:string,themeFamily?:string,cssVars?:Record<string,string>} | null | undefined} record
 * @param {{theme?:string,accentColor?:string|null}} fallback
 * @returns {{theme:'light'|'dark',tokens:Record<string,string>,accentColor:string,themeId:string|null}}
 */
export function projectStudioShellAppearance(record, fallback = {}) {
  const family = String(record?.themeFamily || '').toLowerCase();
  const theme = family === 'light' || family === 'dark' ? family : fallback.theme === 'light' ? 'light' : 'dark';
  const vars = record?.cssVars || {};
  /** @param {...string} keys */
  const pick = (...keys) => keys.map(key => vars[key]).find(value => typeof value === 'string' && value.trim() && value.length <= 120)?.trim();
  /** @type {Record<string,string>} */
  const tokens = { ...palettes[theme] };
  for (const [role, aliases] of Object.entries(roles)) tokens[role] = pick('--nav-' + role, ...aliases) || tokens[role];
  const font = pick('--nav-font','--font-sans');
  if (font) tokens.font = font;
  return { theme, tokens, accentColor:pick('--nav-accent','--accent','--color-primary','--accent-primary') || fallback.accentColor || '#8b5cf6', themeId:record?.id || null };
}

/**
 * @param {ReturnType<typeof projectStudioShellAppearance>} appearance
 * @param {HTMLElement} root
 */
export function applyStudioShellAppearance(appearance, root) {
  root.dataset.theme = appearance.theme;
  root.style.colorScheme = appearance.theme;
  for (const [role, value] of Object.entries(appearance.tokens)) root.style.setProperty('--nav-' + role, value);
  root.style.setProperty('--nav-accent', appearance.accentColor);
  for (const [name, role] of Object.entries(consoleRoles)) root.style.setProperty(name, appearance.tokens[role]);
  root.style.setProperty('--c-accent', appearance.accentColor);
  root.style.setProperty('--c-focus', appearance.accentColor);
}
