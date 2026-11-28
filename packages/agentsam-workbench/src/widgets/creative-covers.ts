import docsSvg from './covers/docs.svg?raw';
import slidesSvg from './covers/slides.svg?raw';
import sheetsSvg from './covers/sheets.svg?raw';
import designSvg from './covers/design.svg?raw';
import dataSvg from './covers/data.svg?raw';
import whiteboardSvg from './covers/whiteboard.svg?raw';
import designsystemSvg from './covers/design-system.svg?raw';
import brandguidelinesSvg from './covers/brand-guidelines.svg?raw';
import designincodeSvg from './covers/design-in-code.svg?raw';

function svgData(source: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

export const CREATIVE_WIDGET_COVERS = {
  docs: svgData(docsSvg),
  slides: svgData(slidesSvg),
  sheets: svgData(sheetsSvg),
  design: svgData(designSvg),
  data: svgData(dataSvg),
  whiteboard: svgData(whiteboardSvg),
  'design-system': svgData(designsystemSvg),
  'brand-guidelines': svgData(brandguidelinesSvg),
  'design-in-code': svgData(designincodeSvg),
} as const;

export type CreativeWidgetCoverKey = keyof typeof CREATIVE_WIDGET_COVERS;

export const CREATIVE_WIDGET_ENTRIES = [
  { key: 'artifact-preview', title: 'Artifacts', cover: 'artifact-preview' },
  { key: 'design-entry', title: 'Design', cover: 'design' },
  { key: 'design-system-entry', title: 'Design Systems', cover: 'design-system' },
  { key: 'slides-entry', title: 'Slides', cover: 'slides' },
  { key: 'whiteboard-entry', title: 'Whiteboard', cover: 'whiteboard' },
  { key: 'brand-guidelines-entry', title: 'Brand Guidelines', cover: 'brand-guidelines' },
  { key: 'code-entry', title: 'Create in Code', cover: 'design-in-code' },
] as const;

export function creativeWidgetEntry(key: string) {
  return CREATIVE_WIDGET_ENTRIES.find((entry) => entry.key === key);
}

export function creativeWidgetCover(key: string): string | undefined {
  const entry = creativeWidgetEntry(key);
  const coverKey = entry?.cover ?? key;
  if (coverKey === 'artifact-preview') return undefined;
  return Object.prototype.hasOwnProperty.call(CREATIVE_WIDGET_COVERS, coverKey)
    ? CREATIVE_WIDGET_COVERS[coverKey as CreativeWidgetCoverKey]
    : undefined;
}
