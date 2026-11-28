export { DesignCanvasApp } from './DesignCanvasApp';
export type { DesignCanvasAppProps } from './DesignCanvasApp';
export type {
  CreativeArtifact,
  CreativeType,
  CreativeWorkspace,
  DesignCanvasAgentContext,
  SlidesDocument,
  PageDocument,
  PageBlock,
  TextDocument,
  DocumentBlock,
  SpreadsheetDocument,
  SpreadsheetSheet,
  SpreadsheetRow,
  SpreadsheetColumn,
  DesignDocument,
  DesignSystemDocument,
  CreativeObject,
} from './creative-model';
export { makeArtifact, normalizeArtifacts, makeId, blankPage, blankDocument, blankSpreadsheet, reidentifyCreativeData, isPageDocument, isTextDocument, isSpreadsheetDocument } from './creative-model';
export { PageEditor, DocumentEditor, SpreadsheetEditor } from './components/StructuredEditors';
