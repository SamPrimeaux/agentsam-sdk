/**
 * @inneranimalmedia/agentsam-browser-surface
 *
 * The browser is a portable capability, not a web-only page.
 *
 *   AgentSamBrowserSurface
 *        ├── Browse mode : navigate · inspect · summarize · interact
 *        └── Build  mode : generate · hot-preview · inspect · annotate · edit · publish
 *
 * Host composition stays stable while implementations are swapped:
 *
 *   SideStage → BrowserStage → BrowserProvider
 *                                ├── current lightweight browser
 *                                └── AgentSamBrowserShell (ABS) provider
 *
 * This package owns the contract and the registry. It renders nothing and
 * imports no platform SDK, so Web/PWA, Capacitor, Expo, and Tauri lanes can
 * all host the same surface.
 */

// ======================================================================
// 1. MODES AND OPERATIONS
// ======================================================================

export type BrowserSurfaceMode = 'browse' | 'build';

export const BROWSE_OPERATIONS = ['navigate', 'inspect', 'summarize', 'interact'] as const;
export const BUILD_OPERATIONS = ['generate', 'hotPreview', 'inspect', 'annotate', 'edit', 'publish'] as const;

export type BrowseOperation = (typeof BROWSE_OPERATIONS)[number];
export type BuildOperation = (typeof BUILD_OPERATIONS)[number];
export type BrowserOperation = BrowseOperation | BuildOperation;

// ======================================================================
// 2. DOCUMENTS AND EVENTS
// ======================================================================

export interface BrowserLocation {
  /** Real URL for live browsing, or an `agentsam:` pseudo-URL for generated pages. */
  url: string;
  title?: string;
  /** Site/page breadcrumb used by generated navigation. */
  breadcrumb?: { sitename: string; page: string };
  generated?: boolean;
}

export interface BrowserDocument {
  location: BrowserLocation;
  /** Rendered HTML when the provider can supply it (always sandboxed by the host). */
  html?: string;
  /** Extracted text for summarization and model context. */
  text?: string;
  /** Provider-specific handle (tab id, webview id, iframe ref key). */
  handle?: string;
  capturedAt: string;
}

export interface BrowserInspection {
  selector?: string;
  nodes: Array<{
    selector: string;
    tag: string;
    role?: string;
    text?: string;
    attributes?: Record<string, string>;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
}

export interface BrowserInteraction {
  kind: 'click' | 'type' | 'submit' | 'scroll' | 'select' | 'back' | 'forward' | 'reload';
  selector?: string;
  value?: string;
  deltaY?: number;
}

export interface BrowserAnnotation {
  id: string;
  selector?: string;
  note: string;
  author: 'user' | 'agent';
  createdAt: string;
  resolved?: boolean;
}

export interface BrowserPublishTarget {
  kind: 'artifact' | 'preview-url' | 'repository' | 'none';
  destination?: string;
}

export interface BrowserPublishResult {
  target: BrowserPublishTarget;
  url?: string;
  artifactId?: string;
  publishedAt: string;
}

/** Streaming progress that maps 1:1 onto AgentSam runtime states. */
export type BrowserSurfaceEvent =
  | { type: 'status'; state: 'browser_navigation' | 'retrieving_context' | 'asset_generation' | 'verification' | 'publishing'; label: string }
  | { type: 'document'; document: BrowserDocument }
  | { type: 'html-chunk'; chunk: string }
  | { type: 'usage'; inputTokens?: number; outputTokens?: number; estimate?: boolean }
  | { type: 'sources'; sources: Array<{ title: string; uri: string }> }
  | { type: 'complete' }
  | { type: 'error'; message: string };

// ======================================================================
// 3. PROVIDER CONTRACT
// ======================================================================

export interface BrowserProviderCapabilities {
  modes: BrowserSurfaceMode[];
  operations: BrowserOperation[];
  /** Can render real remote sites (vs generated content only). */
  liveWeb: boolean;
  /** Generated pages are rendered in a sandbox the provider controls. */
  sandboxedPreview: boolean;
  /** Provider keeps its own deterministic history stack. */
  history: boolean;
  /** Provider can produce an artifact from the current document. */
  publish: boolean;
  /** Approximate fidelity hint for lane comparison, 0..1. */
  fidelity?: number;
}

export interface BrowserProvider {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: BrowserProviderCapabilities;

  // -- Browse mode ----------------------------------------------------
  navigate(input: { url?: string; prompt?: string; mode?: BrowserSurfaceMode }, signal?: AbortSignal): AsyncIterable<BrowserSurfaceEvent>;
  inspect?(input: { selector?: string }): Promise<BrowserInspection>;
  summarize?(input: { question?: string }): AsyncIterable<{ delta: string; done?: boolean }>;
  interact?(input: BrowserInteraction): AsyncIterable<BrowserSurfaceEvent>;

  // -- Build mode -----------------------------------------------------
  generate?(input: { prompt: string; currentHtml?: string | null; mobile?: boolean }, signal?: AbortSignal): AsyncIterable<BrowserSurfaceEvent>;
  hotPreview?(input: { html: string }): Promise<BrowserDocument>;
  annotate?(annotation: Omit<BrowserAnnotation, 'id' | 'createdAt'>): Promise<BrowserAnnotation>;
  edit?(input: { prompt: string; selector?: string }, signal?: AbortSignal): AsyncIterable<BrowserSurfaceEvent>;
  publish?(target: BrowserPublishTarget): Promise<BrowserPublishResult>;

  // -- Lifecycle ------------------------------------------------------
  current?(): BrowserDocument | null;
  dispose?(): Promise<void>;
}

export function supportsOperation(provider: BrowserProvider, operation: BrowserOperation): boolean {
  return provider.capabilities.operations.includes(operation);
}

export function supportsMode(provider: BrowserProvider, mode: BrowserSurfaceMode): boolean {
  return provider.capabilities.modes.includes(mode);
}

// ======================================================================
// 4. THE SURFACE (what BrowserStage talks to)
// ======================================================================

export interface BrowserSurfaceState {
  mode: BrowserSurfaceMode;
  providerId: string;
  document: BrowserDocument | null;
  busy: boolean;
  lastError: string | null;
  annotations: BrowserAnnotation[];
}

export interface BrowserSurfaceOptions {
  providers: BrowserProvider[];
  defaultProviderId?: string;
  initialMode?: BrowserSurfaceMode;
  /** Bridge every surface event to the runtime-state adapter. */
  onRuntimeEvent?: (event: { state: string; phase: 'started' | 'progress' | 'completed' | 'failed'; label?: string; operationId: string }) => void;
}

export class AgentSamBrowserSurface {
  private readonly providers = new Map<string, BrowserProvider>();
  private readonly options: BrowserSurfaceOptions;
  private state: BrowserSurfaceState;
  private listeners = new Set<(state: BrowserSurfaceState) => void>();
  private operationSeq = 0;

  constructor(options: BrowserSurfaceOptions) {
    if (options.providers.length === 0) {
      throw new Error('AgentSamBrowserSurface requires at least one BrowserProvider.');
    }
    this.options = options;
    for (const provider of options.providers) this.providers.set(provider.id, provider);
    const providerId = options.defaultProviderId ?? options.providers[0].id;
    if (!this.providers.has(providerId)) {
      throw new Error(`Unknown default BrowserProvider "${providerId}".`);
    }
    this.state = {
      mode: options.initialMode ?? 'browse',
      providerId,
      document: null,
      busy: false,
      lastError: null,
      annotations: [],
    };
  }

  get provider(): BrowserProvider {
    const provider = this.providers.get(this.state.providerId);
    if (!provider) throw new Error(`BrowserProvider "${this.state.providerId}" is not registered.`);
    return provider;
  }

  get snapshot(): BrowserSurfaceState {
    return this.state;
  }

  list(): BrowserProvider[] {
    return [...this.providers.values()];
  }

  register(provider: BrowserProvider): void {
    this.providers.set(provider.id, provider);
  }

  /** Swap implementations without touching BrowserStage or SideStage. */
  select(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`BrowserProvider "${providerId}" is not registered.`);
    }
    this.patch({ providerId, document: null, lastError: null });
  }

  setMode(mode: BrowserSurfaceMode): void {
    if (!supportsMode(this.provider, mode)) {
      throw new Error(`Provider "${this.provider.id}" does not support ${mode} mode.`);
    }
    this.patch({ mode });
  }

  /** Best provider for an operation — used to auto-upgrade to ABS when present. */
  providerFor(operation: BrowserOperation): BrowserProvider | null {
    const candidates = this.list().filter((provider) => supportsOperation(provider, operation));
    if (candidates.length === 0) return null;
    return candidates.sort((a, b) => (b.capabilities.fidelity ?? 0) - (a.capabilities.fidelity ?? 0))[0];
  }

  async run(
    operation: BrowserOperation,
    stream: AsyncIterable<BrowserSurfaceEvent>,
    onEvent?: (event: BrowserSurfaceEvent) => void,
  ): Promise<BrowserSurfaceState> {
    const operationId = `browser_${this.operationSeq++}`;
    this.patch({ busy: true, lastError: null });
    this.options.onRuntimeEvent?.({ operationId, state: 'browser_navigation', phase: 'started', label: operation });
    try {
      for await (const event of stream) {
        onEvent?.(event);
        if (event.type === 'document') this.patch({ document: event.document });
        if (event.type === 'status') {
          this.options.onRuntimeEvent?.({ operationId, state: event.state, phase: 'progress', label: event.label });
        }
        if (event.type === 'error') {
          this.patch({ lastError: event.message });
          this.options.onRuntimeEvent?.({ operationId, state: 'failed', phase: 'failed', label: event.message });
        }
      }
      this.options.onRuntimeEvent?.({ operationId, state: 'complete', phase: 'completed' });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.patch({ lastError: message });
      this.options.onRuntimeEvent?.({ operationId, state: 'failed', phase: 'failed', label: message });
    } finally {
      this.patch({ busy: false });
    }
    return this.state;
  }

  navigate(input: { url?: string; prompt?: string }, onEvent?: (event: BrowserSurfaceEvent) => void): Promise<BrowserSurfaceState> {
    return this.run('navigate', this.provider.navigate({ ...input, mode: this.state.mode }), onEvent);
  }

  generate(input: { prompt: string; currentHtml?: string | null; mobile?: boolean }, onEvent?: (event: BrowserSurfaceEvent) => void): Promise<BrowserSurfaceState> {
    const provider = this.provider;
    if (!provider.generate) {
      throw new Error(`Provider "${provider.id}" cannot generate. Check capabilities before calling.`);
    }
    return this.run('generate', provider.generate(input), onEvent);
  }

  async annotate(note: string, selector?: string): Promise<BrowserAnnotation> {
    const provider = this.provider;
    const annotation = provider.annotate
      ? await provider.annotate({ note, selector, author: 'user' })
      : {
          id: `ann_${this.operationSeq++}`,
          note,
          selector,
          author: 'user' as const,
          createdAt: new Date().toISOString(),
        };
    this.patch({ annotations: [...this.state.annotations, annotation] });
    return annotation;
  }

  subscribe(listener: (state: BrowserSurfaceState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private patch(partial: Partial<BrowserSurfaceState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }
}

// ======================================================================
// 5. PROVIDERS
// ======================================================================

export * from './providers/lightweight.js';
export * from './providers/abs.js';
