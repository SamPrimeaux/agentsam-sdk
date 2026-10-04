/**
 * AgentSamBrowserShell (ABS) as a BrowserProvider.
 *
 * ABS supplies the richer Explore/Build implementation. Binding it here means
 * BrowserStage can offer it alongside the lightweight browser and fall back
 * safely — we mine ABS incrementally rather than replacing a working browser.
 *
 * The ABS host is referenced structurally (not imported) so this package has
 * no build-order dependency on @inneranimalmedia/agentsam-abs.
 */

import type {
  BrowserDocument,
  BrowserProvider,
  BrowserProviderCapabilities,
  BrowserPublishResult,
  BrowserPublishTarget,
  BrowserSurfaceEvent,
} from '../index.js';

/** Structural mirror of `AbsGenerationEvent` from @inneranimalmedia/agentsam-abs. */
export type AbsEventLike =
  | { type: 'status'; label: string }
  | { type: 'html'; chunk: string }
  | { type: 'usage'; tokenCount: { input: number; output: number; isEstimate?: boolean } }
  | { type: 'grounding'; sources: Array<{ title: string; uri: string }>; entryPointHtml?: string }
  | { type: 'complete' };

/** Structural mirror of `AbsGenerationHost`. */
export interface AbsGenerationHostLike {
  generate(
    request: {
      intent: 'create' | 'edit';
      prompt: string;
      currentHtml: string | null;
      mobile?: boolean;
      formState?: Array<{ name: string; type: string; value: string }>;
    },
    options?: { signal?: AbortSignal },
  ): AsyncIterable<AbsEventLike>;
}

export interface AbsProviderOptions {
  host: AbsGenerationHostLike;
  /** Called when Build mode publishes. Defaults to an artifact stub. */
  publish?: (target: BrowserPublishTarget, html: string) => Promise<BrowserPublishResult>;
  displayName?: string;
}

export const ABS_CAPABILITIES: BrowserProviderCapabilities = {
  modes: ['browse', 'build'],
  operations: ['navigate', 'inspect', 'summarize', 'interact', 'generate', 'hotPreview', 'annotate', 'edit', 'publish'],
  liveWeb: false,
  sandboxedPreview: true,
  history: true,
  publish: true,
  fidelity: 0.9,
};

export function createAbsBrowserProvider(options: AbsProviderOptions): BrowserProvider {
  const { host } = options;
  let current: BrowserDocument | null = null;
  let annotationSeq = 0;

  async function* run(
    intent: 'create' | 'edit',
    prompt: string,
    currentHtml: string | null,
    mobile: boolean | undefined,
    signal: AbortSignal | undefined,
  ): AsyncIterable<BrowserSurfaceEvent> {
    let html = '';
    try {
      for await (const event of host.generate({ intent, prompt, currentHtml, mobile }, { signal })) {
        switch (event.type) {
          case 'status':
            yield { type: 'status', state: 'asset_generation', label: event.label };
            break;
          case 'html':
            html += event.chunk;
            yield { type: 'html-chunk', chunk: event.chunk };
            break;
          case 'usage':
            yield {
              type: 'usage',
              inputTokens: event.tokenCount.input,
              outputTokens: event.tokenCount.output,
              estimate: event.tokenCount.isEstimate,
            };
            break;
          case 'grounding':
            yield { type: 'sources', sources: event.sources };
            break;
          case 'complete':
            break;
        }
      }
      current = {
        location: { url: `agentsam://generated/${encodeURIComponent(prompt.slice(0, 48))}`, generated: true, title: prompt.slice(0, 80) },
        html,
        capturedAt: new Date().toISOString(),
      };
      yield { type: 'document', document: current };
      yield { type: 'complete' };
    } catch (error) {
      yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    id: 'agentsam-browser-shell',
    displayName: options.displayName ?? 'AgentSam Browser Shell',
    capabilities: ABS_CAPABILITIES,

    navigate: (input, signal) =>
      run('create', input.prompt ?? input.url ?? 'A useful starting page', null, undefined, signal),

    generate: (input, signal) => run('create', input.prompt, input.currentHtml ?? null, input.mobile, signal),

    edit: (input, signal) => run('edit', input.prompt, current?.html ?? null, undefined, signal),

    async hotPreview(input) {
      current = {
        location: { url: 'agentsam://preview/hot', generated: true, title: 'Hot preview' },
        html: input.html,
        capturedAt: new Date().toISOString(),
      };
      return current;
    },

    async inspect() {
      // ABS previews are sandboxed; structural inspection is served from the
      // generated HTML rather than a live DOM.
      return { nodes: [] };
    },

    async annotate(annotation) {
      annotationSeq += 1;
      return { ...annotation, id: `abs_ann_${annotationSeq}`, createdAt: new Date().toISOString() };
    },

    async publish(target) {
      if (options.publish) return options.publish(target, current?.html ?? '');
      return {
        target,
        artifactId: `artifact_${Date.now().toString(36)}`,
        publishedAt: new Date().toISOString(),
      };
    },

    current: () => current,
  };
}
