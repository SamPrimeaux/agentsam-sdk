/**
 * Brand Workspace read model and deterministic SVG presentation.
 *
 * Brand identity is NOT a CMS application theme. A brand has independent
 * source evidence, an approval state and an optional list of visual variants.
 * This module does not write records, invent tokens or fetch resources.
 */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {};
const safe = value => String(value ?? '').trim();
const colorPattern = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*[\d.%\s,\/+-]+\)|hsla?\(\s*[\d.%\s,\/+-]+\)|oklch\(\s*[\d.%\s,\/+-]+\))$/i;
const escapeXml = value => safe(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function entriesFromTokenSource(source) {
  if (Array.isArray(source)) return source.filter(item => item && typeof item === 'object').map(item => ({
    name: safe(item.name), value: safe(item.value), usage: safe(item.usage),
  })).filter(item => item.name);
  return Object.entries(record(source)).map(([name, raw]) => ({
    name, value: safe(typeof raw === 'string' ? raw : record(raw).value), usage: safe(record(raw).usage),
  }));
}

/**
 * Preserve the source's exact values. Resolve aliases only within the supplied
 * family. CSS variables and generated gradient values are not brand evidence.
 */
export function brandColors(source, themeId = '') {
  const raw = Array.isArray(source) ? source : record(source);
  const input = entriesFromTokenSource(raw);
  const aliases = new Map(input.map(item => [item.name, item.value]));
  const resolve = (value, visited = new Set()) => {
    if (colorPattern.test(value)) return value;
    const alias = value.replace(/^\{([^}]+)\}$/, '$1').replace(/^\$/, '');
    if (!alias || visited.has(alias) || !aliases.has(alias)) return null;
    visited.add(alias);
    return resolve(aliases.get(alias), visited);
  };
  return input.map(item => {
    const rawItem = Array.isArray(source) ? source.find(entry => record(entry).name === item.name) : record(source)[item.name];
    const perTheme = record(record(rawItem).themes);
    const themed = themeId && typeof perTheme[themeId] === 'string' ? perTheme[themeId] : item.value;
    return { name: item.name, value: resolve(themed), usage: item.usage, sourceValue: themed };
  }).filter(item => item.value);
}

function fromContract(contract) {
  const c = record(contract);
  return {
    id: safe(c.id || c.brand_id || record(c.brand).id),
    name: safe(c.name || record(c.identity).name || record(c.brand).name),
    status: safe(c.status || 'draft'),
    contract: c,
    colors: record(record(c.visual_system).colors).resolved || record(c.tokens).color || {},
    assets: c.assets || [],
    sources: c.sources || [],
    themes: c.themes || [],
  };
}

function fromBrandEntry(entry) {
  const e = record(entry), contract = record(e.contract || e.latestContract || e.brandContract || (e.visual_system || e.schema ? e : null));
  const base = fromContract(contract);
  const pack = record(e.pack);
  return {
    id: safe(e.id || e.brandId || record(pack.brand).id || base.id),
    name: safe(e.name || e.displayName || record(pack.brand).name || base.name),
    status: safe(e.status || base.status || 'draft'),
    contract,
    colors: e.colors || record(e.tokens).color || record(pack.tokens).color || base.colors,
    assets: e.assets || pack.assets || base.assets,
    sources: e.sources || record(pack.provenance).sources || base.sources,
    themes: Array.isArray(e.themes) ? e.themes : [],
    lastChange: safe(e.lastChange || e.updated_at || contract.updated_at),
  };
}

/** One entry per real source brand. No seeded platform/customer brand names. */
export function normalizeBrandWorkspace(raw) {
  const data = record(raw);
  const collections = [data.brands, data.brandContracts, data.contracts].find(Array.isArray);
  const candidates = collections?.length ? collections.map(fromBrandEntry) :
    data.latestContract ? [fromBrandEntry({ contract: data.latestContract })] : [];
  const seen = new Set();
  const brands = candidates.filter(brand => {
    if (!brand.id || seen.has(brand.id)) return false;
    seen.add(brand.id);
    return true;
  });
  return {
    workspaceId: safe(data.workspaceId || record(data.workspace).id),
    brands,
    connections: Array.isArray(data.connections) ? data.connections : [],
    activeBrandId: brands.some(brand => brand.id === data.activeBrandId) ? data.activeBrandId : null,
    source: 'authorized_brand_workspace',
  };
}

function lum(hex) {
  const match = /^#([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex || '');
  if (!match) return null;
  const full = match[1].length === 3 ? [...match[1]].map(x => x + x).join('') : match[1];
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255)
    .map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return r * .2126 + g * .7152 + b * .0722;
}

export function brandContrast(a, b) {
  const x = lum(a), y = lum(b);
  return x === null || y === null ? null : (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

function role(colors, names) {
  for (const name of names) {
    const match = colors.find(item => item.name.toLowerCase().replace(/[^a-z]/g, '') === name);
    if (match) return match.value;
  }
  return null;
}
function rng(seed) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => {
    value ^= value << 13; value ^= value >>> 17; value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

/**
 * Cover preview derived only from supplied brand content.
 * Null means the source does not yet support a faithful accessible cover.
 * Pattern and layout are original vector artwork; no logo is fabricated.
 */
export function renderBrandCoverSvg({ id, name, tagline = '', colors: sourceColors, themeId = '' } = {}) {
  const title = safe(name), colors = brandColors(sourceColors, themeId);
  if (!title || colors.length < 3) return null;
  const surface = role(colors, ['surface', 'page', 'background', 'canvas']) || colors[0].value;
  const ink = role(colors, ['ink', 'foreground', 'text', 'onprimary']) || colors.find(c => (brandContrast(c.value, surface) ?? 0) >= 4.5)?.value;
  if (!ink || (brandContrast(ink, surface) ?? 0) < 4.5) return null;
  const blocks = colors.filter(c => c.value !== surface && c.value !== ink).slice(0, 4);
  if (!blocks.length) return null;
  const random = rng(safe(id || title));
  const stipple = Array.from({ length: 58 }, () => {
    const x = Math.round(18 + random() * 1150), y = Math.round(24 + random() * 220);
    return `<circle cx="${x}" cy="${y}" r="${random() > .82 ? 1.35 : .7}" fill="${escapeXml(ink)}" opacity=".21"/>`;
  }).join('');
  const rectangles = blocks.map((color, i) =>
    `<rect x="${i * 300}" y="0" width="300" height="250" fill="${escapeXml(color.value)}"/>`).join('');
  const fontSize = title.length > 23 ? 66 : title.length > 13 ? 84 : 110;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" role="img" aria-label="${escapeXml(title)} brand cover"><rect width="1200" height="675" fill="${escapeXml(surface)}"/>${rectangles}<g>${stipple}</g><path d="M0 250H1200" stroke="${escapeXml(ink)}" stroke-opacity=".17"/><text x="68" y="538" font-family="system-ui,sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="-3" fill="${escapeXml(ink)}">${escapeXml(title)}</text>${tagline ? `<text x="70" y="599" font-family="system-ui,sans-serif" font-size="23" fill="${escapeXml(ink)}">${escapeXml(tagline.slice(0, 95))}</text>` : ''}</svg>`;
}

/** An original flat tinted type cover, never a substituted brand logo. */
export function renderCreationTileSvg({ type, tint, ink, seed = '' } = {}) {
  if (!colorPattern.test(safe(tint)) || !colorPattern.test(safe(ink))) return null;
  const types = {
    slides: '<rect x="30" y="32" width="88" height="60" rx="3"/><path d="M74 92v18m-23 0h46"/>',
    design: '<path d="M32 34h83v65H32zM43 46h60v41H43z"/><path d="M43 88l18-21 14 11 12-14 16 24"/>',
    code: '<path d="M55 52L37 67l18 15M94 52l18 15-18 15M83 43L69 92"/>',
    system: '<rect x="31" y="34" width="89" height="67" rx="7"/><path d="M48 55h54M48 70h38M48 86h23"/><circle cx="105" cy="88" r="7"/>',
    whiteboard: '<rect x="27" y="30" width="45" height="45" rx="5"/><path d="M87 39h35v35H87zM35 95h87M51 75v19m53-20v20"/>',
  };
  const icon = types[safe(type)];
  if (!icon) return null;
  const rand = rng(seed || type);
  const points = Array.from({ length: 75 }, () => `<circle cx="${Math.floor(rand() * 150)}" cy="${Math.floor(rand() * 126)}" r=".5" opacity=".17"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 126" role="img" aria-label="${escapeXml(type)}"><rect width="150" height="126" rx="12" fill="${escapeXml(tint)}"/><g fill="${escapeXml(ink)}">${points}</g><g fill="none" stroke="${escapeXml(ink)}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${icon}</g></svg>`;
}
