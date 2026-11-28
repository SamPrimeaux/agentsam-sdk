import docsSvg from './covers/docs.svg';
import slidesSvg from './covers/slides.svg';
import sheetsSvg from './covers/sheets.svg';
import designSvg from './covers/design.svg';
import dataSvg from './covers/data.svg';
import whiteboardSvg from './covers/whiteboard.svg';
import designsystemSvg from './covers/design-system.svg';
import brandguidelinesSvg from './covers/brand-guidelines.svg';
import designincodeSvg from './covers/design-in-code.svg';

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
