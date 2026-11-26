export type CreativeType = 'slides' | 'design' | 'code' | 'system' | 'whiteboard';
export type CreativeWorkspace = CreativeType;
export type DesignCanvasAgentContext = {
  artifactId?: string;
  artifactType: CreativeType;
  title: string;
  selection?: { id: string; kind: string; label?: string };
};
export type CodeLanguage = 'html' | 'css' | 'javascript' | 'json' | 'markdown' | 'svg';
export type CodeFile = { id: string; name: string; language: CodeLanguage; content: string };
export type CodeDocument = { files: CodeFile[]; activeFileId: string; previewOpen: boolean };
export type ObjectType = 'text' | 'shape' | 'image' | 'media' | 'path' | 'chart' | 'table';
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
  data: SlidesDocument | DesignDocument | DesignSystemDocument | CodeDocument;
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
export function brandGuidelinesSlides(): SlidesDocument {
  const ink = '#171a1f';
  const paper = '#f4f3ef';
  const blue = '#315fea';
  const muted = '#69727e';
  const line = '#d9dde2';
  const white = '#ffffff';
  const kicker = (id: string, value: string, x = 72, y = 52, color = muted) => text(id, value, x, y, 420, 22, 12, color, 700);
  const heading = (id: string, value: string, x = 72, y = 88, w = 980, color = ink) => text(id, value, x, y, w, 68, 52, color, 720);
  const card = (id: string, x: number, y: number, w: number, h: number, fill = white, radius = 14) => ({ ...shape(id, x, y, w, h, fill, 'rect'), radius });
  const rule = (id: string, x: number, y: number, w: number, color = line) => shape(id, x, y, w, 2, color, 'rect');
  const page = (id: string, value: string, color = muted) => text(id, value, 1060, 628, 72, 20, 11, color, 650, 'right');

  const cover = slide('Brand Guidelines', paper, [
    shape('cover-edge', 0, 0, 14, 675, blue),
    kicker('cover-kicker', 'IDENTITY SYSTEM  /  FIELD GUIDE', 72, 62, blue),
    text('cover-title-brand', 'Brand', 72, 166, 710, 104, 92, ink, 760),
    text('cover-title-guidelines', 'Guidelines', 72, 260, 790, 108, 84, ink, 760),
    text('cover-subtitle', 'A practical system for a consistent brand identity and experience.', 78, 405, 620, 60, 21, muted, 450),
    shape('cover-panel', 870, 0, 330, 675, ink, 'rect'),
    shape('cover-panel-blue', 922, 156, 226, 226, blue, 'rect'),
    shape('cover-panel-cutout', 978, 212, 114, 114, ink, 'rect'),
    shape('cover-panel-dot-one', 922, 430, 34, 34, '#ffffff', 'circle'),
    shape('cover-panel-dot-two', 980, 430, 34, 34, '#6f8fff', 'circle'),
    shape('cover-panel-dot-three', 1038, 430, 34, 34, '#8ca0b9', 'circle'),
    kicker('cover-meta-brand-label', 'BRAND', 78, 558, muted),
    text('cover-meta-brand-value', 'Brand name', 78, 580, 190, 24, 15, ink, 600),
    kicker('cover-meta-owner-label', 'OWNER', 304, 558, muted),
    text('cover-meta-owner-value', 'Team / owner', 304, 580, 190, 24, 15, ink, 600),
    kicker('cover-meta-version-label', 'VERSION', 530, 558, muted),
    text('cover-meta-version-value', '1.0', 530, 580, 100, 24, 15, ink, 600),
    kicker('cover-meta-date-label', 'ISSUED', 664, 558, muted),
    text('cover-meta-date-value', 'YYYY-MM-DD', 664, 580, 160, 24, 15, ink, 600),
    page('cover-page', '01 / 08', '#c7ced8'),
  ]);

  const foundation = slide('Brand Foundation', paper, [
    kicker('foundation-kicker', '01  /  FOUNDATION', 72, 48, blue),
    heading('foundation-title', 'Start with the foundation.', 72, 84, 1040),
    text('foundation-subtitle', 'Define the choices that guide every expression of the brand.', 76, 151, 900, 32, 18, muted, 450),
    card('foundation-purpose-card', 72, 218, 510, 132),
    kicker('foundation-purpose-label', 'PURPOSE', 96, 242, blue),
    text('foundation-purpose-prompt', 'Why does the brand need to exist?', 96, 274, 450, 52, 23, ink, 620),
    card('foundation-position-card', 618, 218, 510, 132),
    kicker('foundation-position-label', 'POSITIONING', 642, 242, blue),
    text('foundation-position-prompt', 'What should people remember you for?', 642, 274, 450, 52, 23, ink, 620),
    card('foundation-audience-card', 72, 374, 510, 132),
    kicker('foundation-audience-label', 'AUDIENCE', 96, 398, blue),
    text('foundation-audience-prompt', 'Who are you trying to reach and serve?', 96, 430, 450, 52, 23, ink, 620),
    card('foundation-promise-card', 618, 374, 510, 132),
    kicker('foundation-promise-label', 'PROMISE', 642, 398, blue),
    text('foundation-promise-prompt', 'What can people reliably expect?', 642, 430, 450, 52, 23, ink, 620),
    kicker('foundation-personality-label', 'PERSONALITY  /  CHOOSE 3–5 TRAITS', 76, 548, muted),
    ...['Trait 01', 'Trait 02', 'Trait 03', 'Trait 04'].flatMap((label, index) => [
      card('foundation-trait-' + index, 76 + index * 176, 578, 150, 34, '#e7eaf0', 17),
      text('foundation-trait-text-' + index, label, 76 + index * 176, 586, 150, 20, 12, ink, 650, 'center'),
    ]),
    page('foundation-page', '02 / 08'),
  ]);

  const logo = slide('Logo System', white, [
    kicker('logo-kicker', '02  /  IDENTITY', 72, 48, blue),
    heading('logo-title', 'A logo system, not a single file.', 72, 84, 1040),
    text('logo-subtitle', 'Show the approved lockups, their roles and the rules that protect them.', 76, 151, 920, 32, 18, muted, 450),
    card('logo-primary-card', 72, 208, 500, 210, '#f4f5f7'),
    kicker('logo-primary-label', 'PRIMARY LOCKUP', 96, 230, muted),
    { ...shape('logo-primary-frame', 140, 282, 360, 82, 'transparent', 'rect'), color: '#9aa3af', borderWidth: 2, borderStyle: 'dashed', radius: 8 },
    text('logo-primary-placeholder', 'PLACE APPROVED LOGO', 140, 310, 360, 28, 16, muted, 650, 'center'),
    card('logo-symbol-card', 600, 208, 236, 210, '#f4f5f7'),
    kicker('logo-symbol-label', 'SYMBOL', 622, 230, muted),
    { ...shape('logo-symbol-frame', 672, 278, 92, 92, 'transparent', 'rect'), color: '#9aa3af', borderWidth: 2, borderStyle: 'dashed', radius: 8 },
    text('logo-symbol-placeholder', 'MARK', 672, 310, 92, 24, 13, muted, 650, 'center'),
    card('logo-reverse-card', 864, 208, 264, 210, ink),
    kicker('logo-reverse-label', 'REVERSED', 886, 230, '#c7ced8'),
    { ...shape('logo-reverse-frame', 916, 282, 160, 82, 'transparent', 'rect'), color: '#8e99a8', borderWidth: 2, borderStyle: 'dashed', radius: 8 },
    text('logo-reverse-placeholder', 'LIGHT LOGO', 916, 310, 160, 28, 14, '#ffffff', 650, 'center'),
    card('logo-clearspace-card', 72, 442, 500, 166),
    kicker('logo-clearspace-label', 'CLEAR SPACE & MINIMUM SIZE', 96, 464, blue),
    shape('logo-clearspace-outer', 104, 505, 136, 68, 'transparent', 'rect'),
    shape('logo-clearspace-inner', 134, 521, 76, 36, '#dfe6f5', 'rect'),
    text('logo-clearspace-x', 'X', 163, 530, 20, 20, 13, ink, 700, 'center'),
    text('logo-clearspace-copy', 'Keep at least 1× the mark height clear on every side. Define a minimum digital and print size.', 266, 505, 280, 74, 14, ink, 450),
    card('logo-misuse-card', 600, 442, 528, 166, '#f4f5f7'),
    kicker('logo-misuse-label', 'DO NOT', 624, 464, '#b34b4b'),
    ...['Stretch or skew', 'Change approved colors', 'Add effects or outlines'].map((value, index) => text('logo-misuse-' + index, '×  ' + value, 626, 505 + index * 27, 450, 22, 14, ink, 550)),
    page('logo-page', '03 / 08'),
  ]);

  const colors = slide('Color System', ink, [
    kicker('colors-kicker', '03  /  COLOR', 72, 48, '#9db4ff'),
    heading('colors-title', 'A palette with roles, not just swatches.', 72, 84, 1040, white),
    text('colors-subtitle', 'Assign each color a job. Keep these example values until the brand palette is approved.', 76, 151, 1000, 32, 17, '#aeb7c3', 450),
    ...[
      { name: 'Primary', hex: '#315FEA', value: '#315fea' },
      { name: 'Accent', hex: '#1A9D91', value: '#1a9d91' },
      { name: 'Ink', hex: '#171A1F', value: '#171a1f' },
      { name: 'Paper', hex: '#F4F3EF', value: '#f4f3ef' },
      { name: 'Muted', hex: '#CBD2DD', value: '#cbd2dd' },
    ].flatMap((item, index) => {
      const x = 72 + index * 218;
      return [
        card('colors-card-' + index, x, 218, 194, 272, '#252a32'),
        { ...shape('colors-swatch-' + index, x + 12, 230, 170, 142, item.value, 'rect'), radius: 9 },
        text('colors-role-' + index, item.name, x + 14, 390, 166, 26, 17, white, 650),
        text('colors-value-' + index, item.hex, x + 14, 424, 166, 22, 13, '#b5bfcc', 500),
        text('colors-use-' + index, 'Define usage', x + 14, 458, 166, 18, 11, '#8e99a8', 500),
      ];
    }),
    rule('colors-footer-rule', 72, 526, 1056, '#39414d'),
    text('colors-footer', 'EXAMPLE TOKENS ONLY  ·  Replace with approved values and validate text, control and focus contrast.', 76, 548, 1000, 28, 13, '#c1c9d3', 500),
    page('colors-page', '04 / 08', '#c7ced8'),
  ]);

  const typography = slide('Typography', paper, [
    kicker('type-kicker', '04  /  TYPOGRAPHY', 72, 48, blue),
    heading('type-title', 'A hierarchy that stays readable.', 72, 84, 1040),
    text('type-subtitle', 'Choose typefaces for clear roles, then define a repeatable scale.', 76, 151, 900, 32, 18, muted, 450),
    card('type-specimen-card', 72, 208, 400, 372, white),
    kicker('type-specimen-label', 'DISPLAY FACE', 100, 234, blue),
    text('type-specimen', 'Aa', 100, 274, 330, 174, 164, ink, 740),
    text('type-specimen-name', 'Your display family', 102, 468, 320, 28, 19, ink, 650),
    text('type-specimen-note', 'Set the approved family, weights and fallback.', 102, 504, 320, 42, 13, muted, 450),
    card('type-scale-card', 504, 208, 624, 372, white),
    kicker('type-scale-label', 'SAMPLE TYPE SCALE', 530, 234, blue),
    ...[
      ['Display', '72 / 700 / 0.98'],
      ['Heading', '36 / 650 / 1.12'],
      ['Body', '18 / 400 / 1.50'],
      ['Label', '12 / 650 / 1.20'],
      ['Code', '13 / 500 / 1.40'],
    ].flatMap((row, index) => [
      text('type-role-' + index, row[0], 532, 278 + index * 54, 220, 24, 15, ink, 650),
      text('type-spec-' + index, row[1], 812, 278 + index * 54, 270, 24, 13, muted, 500, 'right'),
      ...(index < 4 ? [rule('type-rule-' + index, 532, 312 + index * 54, 550, '#e4e6e9')] : []),
    ]),
    text('type-footer', 'Sample scale — tune the values to the selected typefaces and reading context.', 532, 552, 550, 20, 12, muted, 450),
    page('type-page', '05 / 08'),
  ]);

  const imagery = slide('Imagery & Art Direction', white, [
    kicker('imagery-kicker', '05  /  IMAGERY', 72, 48, blue),
    heading('imagery-title', 'Make the visual language recognizable.', 72, 84, 1040),
    text('imagery-subtitle', 'Define the subjects, framing, lighting and graphic devices that make imagery feel related.', 76, 151, 1020, 32, 17, muted, 450),
    ...[
      { x: 72, title: 'Subject & crop', copy: 'Choose what belongs in frame and what stays out.' },
      { x: 438, title: 'Light & tone', copy: 'Set the contrast, temperature and emotional range.' },
      { x: 804, title: 'Composition', copy: 'Use scale, rhythm and negative space consistently.' },
    ].flatMap((item, index) => {
      const x = item.x;
      return [
        card('imagery-card-' + index, x, 210, 324, 292, '#f4f5f7'),
        { ...shape('imagery-frame-' + index, x + 16, 226, 292, 178, index === 0 ? '#dce5f4' : index === 1 ? '#e8e2d8' : '#dfe9e5', 'rect'), radius: 8 },
        ...(index === 0 ? [
          { ...shape('imagery-subject-circle', x + 82, 270, 82, 82, '#315fea', 'circle'), radius: 99 },
          shape('imagery-subject-block', x + 176, 250, 94, 126, '#1d2634', 'rect'),
        ] : index === 1 ? [
          { ...shape('imagery-light-panel', x + 36, 246, 250, 140, '#c4d0e3', 'rect'), radius: 8 },
          { ...shape('imagery-light-circle', x + 126, 270, 92, 92, '#f5f0e7', 'circle'), radius: 99 },
        ] : [
          shape('imagery-grid-a', x + 42, 250, 104, 128, '#315fea', 'rect'),
          shape('imagery-grid-b', x + 158, 250, 124, 56, '#1a9d91', 'rect'),
          shape('imagery-grid-c', x + 158, 320, 124, 58, '#1d2634', 'rect'),
        ]),
        text('imagery-caption-' + index, item.title, x + 18, 424, 286, 26, 17, ink, 650),
        text('imagery-copy-' + index, item.copy, x + 18, 458, 286, 34, 12, muted, 450),
      ];
    }),
    rule('imagery-footer-rule', 72, 538, 1056),
    text('imagery-footer', 'USE  ·  Intentional framing, consistent treatment, accessible contrast     AVOID  ·  Unrelated stock styles, clutter and decorative effects without purpose', 76, 558, 1030, 42, 12, ink, 500),
    page('imagery-page', '06 / 08'),
  ]);

  const voice = slide('Voice & Messaging', paper, [
    kicker('voice-kicker', '06  /  VOICE', 72, 48, blue),
    heading('voice-title', 'Sound like one brand, everywhere.', 72, 84, 1040),
    text('voice-subtitle', 'Make the voice recognizable across product, marketing, support and internal communication.', 76, 151, 1010, 32, 17, muted, 450),
    card('voice-traits-card', 72, 210, 410, 350, white),
    kicker('voice-traits-label', 'VOICE TRAITS', 96, 234, blue),
    ...[
      ['Trait 01', 'What should this trait make people feel?'],
      ['Trait 02', 'How does it change the words we choose?'],
      ['Trait 03', 'What would be out of character?'],
    ].flatMap((row, index) => [
      text('voice-trait-title-' + index, row[0], 98, 278 + index * 84, 330, 22, 15, ink, 650),
      text('voice-trait-copy-' + index, row[1], 98, 306 + index * 84, 330, 38, 12, muted, 450),
      ...(index < 2 ? [rule('voice-trait-rule-' + index, 98, 354 + index * 84, 330, '#e4e6e9')] : []),
    ]),
    card('voice-message-card', 510, 210, 618, 350, ink),
    kicker('voice-message-label', 'MESSAGE FRAMEWORK', 536, 234, '#9db4ff'),
    text('voice-headline-label', 'HEADLINE', 538, 282, 160, 20, 11, '#aeb7c3', 700),
    text('voice-headline-copy', 'One clear idea. One memorable line.', 538, 306, 540, 34, 23, white, 650),
    rule('voice-message-rule-one', 538, 354, 548, '#39414d'),
    text('voice-support-label', 'SUPPORTING LINE', 538, 378, 180, 20, 11, '#aeb7c3', 700),
    text('voice-support-copy', 'Add the context people need to understand the value.', 538, 402, 540, 44, 16, '#e0e5ec', 450),
    rule('voice-message-rule-two', 538, 456, 548, '#39414d'),
    text('voice-action-label', 'ACTION', 538, 478, 120, 20, 11, '#aeb7c3', 700),
    text('voice-action-copy', 'Use a specific, useful next step.', 538, 502, 540, 30, 16, '#e0e5ec', 550),
    page('voice-page', '07 / 08'),
  ]);

  const applications = slide('Applications & Governance', ink, [
    kicker('applications-kicker', '07  /  APPLICATIONS & GOVERNANCE', 72, 48, '#9db4ff'),
    heading('applications-title', 'Built to travel across touchpoints.', 72, 84, 1040, white),
    text('applications-subtitle', 'Show how the system behaves in real contexts, then document how it stays current.', 76, 151, 1020, 32, 17, '#aeb7c3', 450),
    ...[
      { x: 72, title: 'Web', label: 'Website / product' },
      { x: 438, title: 'Social', label: 'Campaign / social' },
      { x: 804, title: 'Presentation', label: 'Deck / document' },
    ].flatMap((item, index) => {
      const x = item.x;
      return [
        card('application-card-' + index, x, 210, 324, 228, '#252a32'),
        { ...shape('application-window-' + index, x + 16, 226, 292, 166, '#f4f3ef', 'rect'), radius: 7 },
        shape('application-header-' + index, x + 16, 226, 292, 22, '#dfe3e9', 'rect'),
        shape('application-hero-' + index, x + 32, 264, index === 1 ? 92 : 132, 104, blue, 'rect'),
        shape('application-copy-' + index, x + (index === 1 ? 138 : 178), 268, index === 1 ? 154 : 130, 14, '#303741', 'rect'),
        shape('application-copy-two-' + index, x + (index === 1 ? 138 : 178), 294, index === 1 ? 130 : 112, 8, '#aeb7c3', 'rect'),
        shape('application-action-' + index, x + 32, 376, 82, 8, '#1a9d91', 'rect'),
        text('application-title-' + index, item.title, x + 18, 405, 140, 22, 15, white, 650),
        text('application-label-' + index, item.label, x + 156, 405, 150, 22, 11, '#aeb7c3', 450, 'right'),
      ];
    }),
    rule('governance-rule', 72, 474, 1056, '#39414d'),
    kicker('governance-kicker', 'OPERATING THE SYSTEM', 76, 494, '#9db4ff'),
    ...[
      ['OWNER', 'Team / role'],
      ['VERSION', '1.0'],
      ['SOURCE FILES', 'Canonical location'],
      ['APPROVAL', 'Approver / status'],
      ['REVIEW', 'Next review date'],
    ].flatMap((row, index) => [
      text('governance-label-' + index, row[0], 76 + index * 210, 530, 190, 18, 10, '#aeb7c3', 700),
      text('governance-value-' + index, row[1], 76 + index * 210, 552, 190, 22, 13, white, 550),
    ]),
    page('applications-page', '08 / 08', '#c7ced8'),
  ]);

  cover.notes = 'Replace the brand name, owner, version and issue date. Keep the cover minimal; do not add unapproved claims.';
  foundation.notes = 'Complete purpose, positioning, audience and promise from approved strategy. Select three to five personality traits and define what each means in practice.';
  logo.notes = 'Insert approved logo artwork for each lockup. Record clear space, minimum sizes, approved color versions and prohibited modifications.';
  colors.notes = 'The swatches are illustrative only. Replace every value with approved brand tokens and document usage and contrast requirements.';
  typography.notes = 'Replace the display family and type roles with approved fonts. Confirm licenses, fallbacks, sizes, weights and line heights.';
  imagery.notes = 'Replace the abstract frames with approved imagery examples. Document subject, crop, lighting, graphic language and exclusions.';
  voice.notes = 'Choose the actual voice traits and complete the messaging framework with approved copy examples for each audience and channel.';
  applications.notes = 'Replace mockups with approved applications. Record the owner, source of truth, version, approval status and review date.';
  return { slides: [cover, foundation, logo, colors, typography, imagery, voice, applications] };
}
export function blankSlides(): SlidesDocument {
  return { slides: [slide('Slide 1', '#ffffff', [])] };
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
  const initial = data || (type === 'slides' ? blankSlides() : type === 'system' ? blankSystem() : type === 'code' ? blankCodeDocument() : type === 'whiteboard' ? blankWhiteboard() : blankDesign());
  const defaultName = type === 'slides' ? 'Untitled presentation' : type === 'system' ? 'Untitled design system' : type === 'code' ? 'Untitled code project' : type === 'whiteboard' ? 'Untitled whiteboard' : 'Untitled design';
  return { id, type, workspace: workspace || type, name: name || defaultName, createdAt: now, updatedAt: now, data: initial };
}

function reidentify(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reidentify);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    next[key] = key === 'id' && typeof item === 'string'
      ? makeId(item.split('_')[0] || 'item')
      : reidentify(item);
  }
  return next;
}

export function duplicateArtifact(artifact: CreativeArtifact): CreativeArtifact {
  const now = new Date().toISOString();
  const copy = reidentify(JSON.parse(JSON.stringify(artifact))) as CreativeArtifact;
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
  if (artifact.type === 'code') return false;
  const data = artifact.data as DesignSystemDocument;
  return data.assets.some((asset) => asset.kind.startsWith('image/') || asset.dataUrl.startsWith('data:image/'));
}
export function makeSlidePreset(kind: string): Slide {
  const presetIndex: Record<string, number> = {
    'Brand Cover': 0,
    'Brand Foundations': 1,
    'Logo System': 2,
    'Color Palette': 3,
    'Typography': 4,
    'Imagery & Art Direction': 5,
    'Voice & Messaging': 6,
    'Applications & Governance': 7,
    // Retain the earlier preset labels for existing decks and saved menus.
    'Iconography': 5,
    'Photography Gallery': 5,
    'Applications': 7,
  };
  const template = presetIndex[kind] === undefined ? null : brandGuidelinesSlides().slides[presetIndex[kind]];
  if (!template) return slide('Slide ' + kind, '#ffffff', []);
  return { ...template, id: makeId('slide'), objects: template.objects.map((item) => ({ ...item, id: makeId('object') })), comments: [] };
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
