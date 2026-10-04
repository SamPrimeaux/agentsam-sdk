export type AbsBrowserMode = 'explore' | 'build';
export type AbsThemeMode = 'dark' | 'light';

export interface Breadcrumb {
  sitename: string;
  page: string;
}

export interface TokenCount {
  input: number;
  output: number;
  isEstimate?: boolean;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface FormFieldState {
  name: string;
  type: string;
  value: string;
}

export interface PageSnapshot {
  html: string;
  breadcrumb: Breadcrumb;
  scrollPosition: number;
  timestamp: number;
  tokenCount: TokenCount;
  prompt: string;
  contextHtml: string | null;
  isGrounded: boolean;
  groundingSources: GroundingSource[];
  searchEntryPointHtml: string;
}

export interface BrowserTabState {
  id: string;
  history: PageSnapshot[];
  currentIndex: number;
  loading: boolean;
  loadingMessage: string;
  generatedContent: string;
  breadcrumb: Breadcrumb;
  tokenCount: TokenCount | null;
  groundingSources: GroundingSource[];
  searchEntryPointHtml: string;
  navigationId: number;
}

export interface AbsQuickLink {
  label: string;
  url: string;
}

export type AbsGenerationIntent = 'create' | 'edit';

export interface AbsGenerationRequest {
  intent: AbsGenerationIntent;
  prompt: string;
  currentHtml: string | null;
  formState?: FormFieldState[];
  mobile?: boolean;
}

export type AbsGenerationEvent =
  | { type: 'status'; label: string }
  | { type: 'html'; chunk: string }
  | { type: 'usage'; tokenCount: TokenCount }
  | { type: 'grounding'; sources: GroundingSource[]; entryPointHtml?: string }
  | { type: 'complete' };

export interface AbsGenerationHost {
  generate(
    request: AbsGenerationRequest,
    options?: { signal?: AbortSignal },
  ): AsyncIterable<AbsGenerationEvent>;
}
