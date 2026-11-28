export type CreativeType = 'page' | 'document' | 'spreadsheet' | 'slides' | 'design' | 'code' | 'system' | 'whiteboard';
export type CreativeWorkspace = CreativeType;
export type DesignCanvasAgentContext = {
  artifactId?: string;
  artifactType: CreativeType;
  title: string;
  selection?: { id: string; kind: string; label?: string; source?: string };
  comment?: string;
};
export type CodeLanguage = 'html' | 'css' | 'javascript' | 'json' | 'markdown' | 'svg';
export type CodeFile = { id: string; name: string; language: CodeLanguage; content: string };
export type CodeDocument = { files: CodeFile[]; activeFileId: string; previewOpen: boolean };
export type ObjectType = 'text' | 'shape' | 'image' | 'svg' | 'media' | 'path' | 'chart' | 'table';
export type ChartType = 'bar' | 'line' | 'pie' | 'area' | 'scatter' | 'histogram' | 'waterfall' | 'funnel' | 'treemap';
export type ShapeKind = 'rect' | 'circle' | 'diamond' | 'triangle' | 'line' | 'star' | 'arrow' | 'plus' | 'chevron' | 'callout';
export type CreativeObject = {
  id: string;
  type: ObjectType;
  name: string;
  x: number; y: number; w: number; h: number;
  text?: string;
  color?: string;
  fill?: string;
  fontSize?: number;
  fontFamily?: string;
  weight?: number;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  shape?: ShapeKind;
  src?: string;
  /** Sanitized inline SVG source. Kept as editable vector markup, not a raster data URL. */
  svgMarkup?: string;
  label?: string;
  mediaType?: 'video';
  points?: { x: number; y: number }[];
  strokeColor?: string;
  strokeWidth?: number;
  imageFit?: 'cover' | 'contain' | 'fill';
  imagePosition?: 'center' | 'top' | 'bottom' | 'left' | 'right';
  fillType?: 'solid' | 'gradient' | 'image';
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  fillImage?: string;
  chartType?: ChartType;
  chartData?: { label: string; value: number }[];
  tableData?: string[][];
  radius?: number;
  opacity?: number;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: 'none' | 'solid' | 'dashed' | 'dotted';
  shadow?: string;
  link?: string;
};
export type CreativeComment = { id: string; text: string; targetId?: string; createdAt: string; resolved?: boolean; replies?: { id: string; text: string; createdAt: string }[]; x?: number; y?: number };
export type Slide = { id: string; name: string; background: string; backgroundImage?: string; objects: CreativeObject[]; notes: string; comments: CreativeComment[] };
export type SlidesDocument = { slides: Slide[] };
export type Artboard = { id: string; name: string; width: number; height: number; background: string; objects: CreativeObject[]; comments?: CreativeComment[] };
export type DesignDocument = { artboards: Artboard[] };
export type ColorToken = { id: string; name: string; value: string; group: string; note: string };
export type TypeToken = { id: string; role: string; family: string; size: number; weight: number; lineHeight: number; fontData?: string };
export type ScaleToken = { id: string; name: string; value: number; unit: string };
export type ShadowToken = { id: string; name: string; x: number; y: number; blur: number; spread: number; color: string };
export type ComponentToken = { id: string; name: string; description: string; variant: string };
export type AssetToken = { id: string; name: string; kind: string; dataUrl: string; size: number };
export type PageTaskItem = { id: string; text: string; checked: boolean };
export type PageBlock =
  | { id: string; type: 'heading'; text: string; level?: 1 | 2 | 3 }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'task_list'; title: string; items: PageTaskItem[] }
  | { id: string; type: 'bullet_list'; title?: string; items: string[] }
  | { id: string; type: 'callout'; tone: 'info' | 'success' | 'warning'; text: string }
  | { id: string; type: 'divider' };
export type PageDocument = { title: string; subtitle?: string; blocks: PageBlock[] };
export type DocumentBlock =
  | { id: string; type: 'heading'; text: string; level?: 1 | 2 | 3 }
  | { id: string; type: 'paragraph'; text: string }
  | { id: string; type: 'bullet_list'; items: string[] }
  | { id: string; type: 'callout'; tone: 'info' | 'success' | 'warning'; text: string }
  | { id: string; type: 'divider' };
export type TextDocument = { title: string; subtitle: string; blocks: DocumentBlock[] };
export type SpreadsheetColumn = { id: string; label: string; width?: number; type?: 'text' | 'number' | 'date' | 'status' | 'priority' };
export type SpreadsheetCellStyle = { bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; align?: 'left' | 'center' | 'right'; fill?: string; color?: string; border?: boolean };
export type SpreadsheetRow = { id: string; cells: Record<string, string>; cellStyles?: Record<string, SpreadsheetCellStyle> };
export type SpreadsheetSheet = { id: string; name: string; columns: SpreadsheetColumn[]; rows: SpreadsheetRow[] };
export type SpreadsheetDocument = { activeSheetId: string; sheets: SpreadsheetSheet[] };

export type DesignSystemDocument = {
  description: string;
  principles: string[];
  colors: ColorToken[];
  typography: TypeToken[];
  spacing: ScaleToken[];
  radii: ScaleToken[];
  shadows: ShadowToken[];
  components: ComponentToken[];
  assets: AssetToken[];
  files: AssetToken[];
};
export type CreativeArtifact = {
  id: string;
  type: CreativeType;
  name: string;
  createdAt: string;
  updatedAt: string;
  pinned?: boolean;
  /** Workspace presentation identity; document engine type remains unchanged. */
  workspace?: CreativeWorkspace;
  /** Provider-derived sharing metadata when supplied by the host artifact source. */
  shared?: boolean;
  data: PageDocument | TextDocument | SpreadsheetDocument | SlidesDocument | DesignDocument | DesignSystemDocument | CodeDocument;
};
export const STORAGE_KEY = 'agentsam.design-canvas.creative-workspace.v1';

export function makeId(prefix = 'item') {
  const value = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().replaceAll('-', '')
    : Date.now().toString(36) + Math.random().toString(36).slice(2);
  return prefix + '_' + value.slice(0, 16);
}
export function normalizeArtifacts(value: unknown): CreativeArtifact[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, CreativeArtifact>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id || !item.type || !item.data) continue;
    const current = byId.get(item.id);
    if (!current || String(item.updatedAt || '').localeCompare(String(current.updatedAt || '')) >= 0) {
      byId.set(item.id, { ...item, workspace: item.workspace || item.type });
    }
  }
  return [...byId.values()].sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}
export function readArtifacts(): CreativeArtifact[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return normalizeArtifacts(value);
  } catch { return []; }
}
export function writeArtifacts(value: CreativeArtifact[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeArtifacts(value))); return true; }
  catch { return false; }
}
export function blankPage(): PageDocument {
  return { title: 'Untitled page', subtitle: '', blocks: [] };
}
export function blankDocument(): TextDocument {
  return { title: 'Untitled document', subtitle: '', blocks: [] };
}
export function blankSpreadsheet(): SpreadsheetDocument {
  const columns: SpreadsheetColumn[] = ['Column A', 'Column B', 'Column C'].map((label, index) => ({
    id: makeId('column'), label, width: index === 0 ? 260 : 180, type: 'text',
  }));
  const rows: SpreadsheetRow[] = Array.from({ length: 10 }, () => ({
    id: makeId('row'), cells: Object.fromEntries(columns.map((column) => [column.id, ''])),
  }));
  const sheet = { id: makeId('sheet'), name: 'Sheet 1', columns, rows };
  return { activeSheetId: sheet.id, sheets: [sheet] };
}
export function emptyDesignSystem(): DesignSystemDocument {
  return { description: '', principles: [], colors: [], typography: [], spacing: [], radii: [], shadows: [], components: [], assets: [], files: [] };
}
function shape(id: string, x: number, y: number, w: number, h: number, fill: string, form: CreativeObject['shape'] = 'rect'): CreativeObject {
  return { id, type: 'shape', name: 'Shape', x, y, w, h, fill, shape: form };
}
function text(id: string, value: string, x: number, y: number, w: number, h: number, fontSize: number, color: string, weight = 500, align: CreativeObject['align'] = 'left'): CreativeObject {
  return { id, type: 'text', name: value.slice(0, 32) || 'Text', text: value, x, y, w, h, fontSize, color, weight, align, fontFamily: 'Inter' };
}
function slide(name: string, background: string, objects: CreativeObject[] = []): Slide {
  return { id: makeId('slide'), name, background, objects, notes: '', comments: [] };
}
export function blankSlides(): SlidesDocument {
  return { slides: [makeSlidePreset('Title')] };
}
export function blankDesign(): DesignDocument {
  return { artboards: [] };
}
export function blankWhiteboard(): DesignDocument {
  return { artboards: [{ id: makeId('artboard'), name: 'Whiteboard', width: 1600, height: 900, background: '#f7f6f2', objects: [] }] };
}
export function blankSystem(): DesignSystemDocument {
  return emptyDesignSystem();
}
export function blankCodeDocument(): CodeDocument {
  const file = { id: makeId('file'), name: 'index.html', language: 'html' as const, content: '' };
  return { files: [file], activeFileId: file.id, previewOpen: false };
}
export function makeArtifact(type: CreativeType, name?: string, data?: CreativeArtifact['data'], workspace?: CreativeWorkspace): CreativeArtifact {
  const now = new Date().toISOString();
  const id = makeId('canvas');
  const initial = data || (type === 'page' ? blankPage() : type === 'document' ? blankDocument() : type === 'spreadsheet' ? blankSpreadsheet() : type === 'slides' ? blankSlides() : type === 'system' ? blankSystem() : type === 'code' ? blankCodeDocument() : type === 'whiteboard' ? blankWhiteboard() : blankDesign());
  const defaultName = type === 'page' ? 'Untitled page' : type === 'document' ? 'Untitled document' : type === 'spreadsheet' ? 'Untitled spreadsheet' : type === 'slides' ? 'Untitled presentation' : type === 'system' ? 'Untitled design system' : type === 'code' ? 'Untitled code project' : type === 'whiteboard' ? 'Untitled whiteboard' : 'Untitled design';
  return { id, type, workspace: workspace || type, name: name || defaultName, createdAt: now, updatedAt: now, data: initial };
}

export function reidentifyCreativeData<T>(value: T): T {
  // Spreadsheet cell maps and activeSheetId reference IDs; copy those references
  // together with their owners instead of silently disconnecting populated cells.
  if (isSpreadsheetDocument(value)) {
    const sheetIds = new Map(value.sheets.map(sheet => [sheet.id, makeId('sheet')]));
    const sheets = value.sheets.map(sheet => {
      const columnIds = new Map(sheet.columns.map(column => [column.id, makeId('column')]));
      return {
        ...sheet,
        id: sheetIds.get(sheet.id)!,
        columns: sheet.columns.map(column => ({ ...column, id: columnIds.get(column.id)! })),
        rows: sheet.rows.map(row => ({
          ...row,
          id: makeId('row'),
          cells: Object.fromEntries(Object.entries(row.cells).map(([columnId, raw]) => [columnIds.get(columnId) ?? columnId, raw])),
          ...(row.cellStyles ? { cellStyles: Object.fromEntries(Object.entries(row.cellStyles).map(([columnId, style]) => [columnIds.get(columnId) ?? columnId, { ...style }])) } : {}),
        })),
      };
    });
    return { ...value, activeSheetId: sheetIds.get(value.activeSheetId)!, sheets } as T;
  }
  if (Array.isArray(value)) return value.map(reidentifyCreativeData) as unknown as T;
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    next[key] = key === 'id' && typeof item === 'string'
      ? makeId(item.split('_')[0] || 'item')
      : reidentifyCreativeData(item);
  }
  return next as unknown as T;
}

export function duplicateArtifact(artifact: CreativeArtifact): CreativeArtifact {
  const now = new Date().toISOString();
  const copy = reidentifyCreativeData(JSON.parse(JSON.stringify(artifact))) as CreativeArtifact;
  return { ...copy, id: makeId('canvas'), name: artifact.name + ' copy', createdAt: now, updatedAt: now, pinned: false, shared: false };
}

export function artifactHasImages(artifact: CreativeArtifact): boolean {
  if (artifact.type === 'slides') {
    const data = artifact.data as SlidesDocument;
    return data.slides.some((item) => Boolean(item.backgroundImage) || item.objects.some((object) => object.type === 'image'));
  }
  if (artifact.type === 'design' || artifact.type === 'whiteboard') {
    const data = artifact.data as DesignDocument;
    return data.artboards.some((board) => board.objects.some((object) => object.type === 'image'));
  }
  if (artifact.type === 'code' || artifact.type === 'page' || artifact.type === 'document' || artifact.type === 'spreadsheet') return false;
  const data = artifact.data as DesignSystemDocument;
  return data.assets.some((asset) => asset.kind.startsWith('image/') || asset.dataUrl.startsWith('data:image/'));
}
export function reorderSlides(slides: Slide[], sourceId: string, targetId: string): Slide[] {
  if (!sourceId || !targetId || sourceId === targetId) return slides;
  const from = slides.findIndex((item) => item.id === sourceId);
  const to = slides.findIndex((item) => item.id === targetId);
  if (from < 0 || to < 0) return slides;
  const next = [...slides];
  const [moving] = next.splice(from, 1);
  if (!moving) return slides;
  next.splice(to, 0, moving);
  return next;
}

export function makeSlidePreset(kind: string): Slide {
  const ink = '#171a1f';
  const muted = '#68717d';
  const accent = '#315fea';
  const paper = '#f5f6f8';
  const makeText = (value: string, x: number, y: number, w: number, h: number, size: number, color = ink, weight = 500) =>
    text(makeId('object'), value, x, y, w, h, size, color, weight);
  const makeShape = (x: number, y: number, w: number, h: number, fill: string, radius = 12) =>
    ({ ...shape(makeId('object'), x, y, w, h, fill, 'rect'), radius });
  const layouts: Record<string, () => Slide> = {
    Blank: () => slide('Blank slide', '#ffffff', []),
    Title: () => slide('Title', '#ffffff', [
      makeShape(84, 160, 76, 6, accent, 3),
      makeText('Presentation title', 84, 205, 1032, 112, 68, ink, 720),
      makeText('Add a clear, concise subtitle', 88, 342, 900, 52, 25, muted, 450),
    ]),
    Section: () => slide('Section', ink, [
      makeShape(84, 174, 7, 310, accent, 4),
      makeText('SECTION 01', 122, 196, 360, 24, 13, '#aeb7c4', 700),
      makeText('Section title', 122, 254, 970, 112, 62, '#ffffff', 700),
      makeText('A short line to introduce the next part', 126, 390, 860, 44, 22, '#c1c8d2', 450),
    ]),
    'Title + body': () => slide('Title + body', '#ffffff', [
      makeText('Slide title', 80, 66, 1040, 70, 46, ink, 700),
      makeShape(82, 154, 1036, 2, '#e1e5ea', 1),
      makeText('Add your supporting content here. Keep the message focused, use short paragraphs, and let the layout provide room for the ideas to breathe.', 84, 194, 1000, 300, 27, '#424b57', 450),
    ]),
    Bullets: () => slide('Bullets', '#ffffff', [
      makeText('Key points', 80, 66, 1040, 70, 46, ink, 700),
      ...['First point — state the main idea clearly', 'Second point — add the evidence or detail', 'Third point — explain why it matters', 'Fourth point — close with the next step'].map((value, index) => makeText('•  ' + value, 104, 176 + index * 86, 1000, 54, 24, '#424b57', 500)),
    ]),
    'Two columns': () => slide('Two columns', '#ffffff', [
      makeText('Compare two ideas', 80, 66, 1040, 70, 46, ink, 700),
      makeShape(80, 174, 496, 390, paper, 16),
      makeShape(624, 174, 496, 390, paper, 16),
      makeText('First column', 112, 210, 430, 44, 27, ink, 700),
      makeText('Add the first perspective, its supporting detail, and the most important takeaway.', 112, 278, 420, 210, 21, muted, 450),
      makeText('Second column', 656, 210, 430, 44, 27, ink, 700),
      makeText('Add the second perspective, its supporting detail, and the most important takeaway.', 656, 278, 420, 210, 21, muted, 450),
    ]),
    Summary: () => slide('Summary', '#ffffff', [
      makeText('Summary', 80, 66, 1040, 70, 46, ink, 700),
      ...[
        { x: 80, label: '01 / Insight', copy: 'The most important finding or message.' },
        { x: 448, label: '02 / Impact', copy: 'Why it matters to the audience or project.' },
        { x: 816, label: '03 / Next step', copy: 'The action that should happen next.' },
      ].flatMap((item) => [
        makeShape(item.x, 190, 304, 310, paper, 16),
        makeShape(item.x + 24, 218, 44, 4, accent, 2),
        makeText(item.label, item.x + 24, 250, 256, 36, 17, ink, 700),
        makeText(item.copy, item.x + 24, 306, 256, 144, 21, muted, 450),
      ]),
    ]),
  };
  const layout = layouts[kind];
  if (layout) return layout();

  return slide(kind || 'Slide', '#ffffff', []);
}

export function contrastRatio(hex: string, against: string) {
  const rgb = (value: string) => {
    const raw = value.replace('#', '');
    const normalized = raw.length === 3 ? raw.split('').map((v) => v + v).join('') : raw;
    const channels = [0,2,4].map((i) => parseInt(normalized.slice(i, i + 2), 16) / 255);
    return channels.map((v) => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  };
  const lum = (value: string) => { const c = rgb(value); return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2]; };
  const a = lum(hex), b = lum(against);
  return (Math.max(a,b) + 0.05) / (Math.min(a,b) + 0.05);
}

export function isPageDocument(value: unknown): value is PageDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as PageDocument;
  return typeof data.title === 'string' && Array.isArray(data.blocks) && data.blocks.every((block) =>
    !!block && typeof block.id === 'string' &&
    (block.type === 'divider' ||
      (block.type === 'heading' && typeof block.text === 'string') ||
      (block.type === 'paragraph' && typeof block.text === 'string') ||
      (block.type === 'callout' && typeof block.text === 'string') ||
      (block.type === 'bullet_list' && Array.isArray(block.items)) ||
      (block.type === 'task_list' && Array.isArray(block.items) && block.items.every((item) => typeof item.id === 'string' && typeof item.text === 'string' && typeof item.checked === 'boolean'))));
}
export function isTextDocument(value: unknown): value is TextDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as TextDocument;
  return typeof data.title === 'string' && typeof data.subtitle === 'string' && Array.isArray(data.blocks) && data.blocks.every((block) =>
    !!block && typeof block.id === 'string' &&
    (block.type === 'divider' ||
      (block.type === 'heading' && typeof block.text === 'string') ||
      (block.type === 'paragraph' && typeof block.text === 'string') ||
      (block.type === 'callout' && typeof block.text === 'string') ||
      (block.type === 'bullet_list' && Array.isArray(block.items) && block.items.every((item) => typeof item === 'string'))));
}
export function isSpreadsheetDocument(value: unknown): value is SpreadsheetDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as SpreadsheetDocument;
  return Array.isArray(data.sheets) && data.sheets.length > 0 &&
    data.sheets.every((sheet) => !!sheet && typeof sheet.id === 'string' && typeof sheet.name === 'string' &&
      Array.isArray(sheet.columns) && sheet.columns.every((column) => !!column && typeof column.id === 'string' && typeof column.label === 'string') &&
      Array.isArray(sheet.rows) && sheet.rows.every((row) => !!row && typeof row.id === 'string' && !!row.cells && typeof row.cells === 'object' && !Array.isArray(row.cells) &&
        Object.values(row.cells).every((cell) => typeof cell === 'string'))) &&
    data.sheets.some((sheet) => sheet.id === data.activeSheetId);
}
