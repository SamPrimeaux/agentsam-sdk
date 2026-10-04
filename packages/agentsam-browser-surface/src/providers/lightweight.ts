/**
 * The current Local Studio Browser, expressed as a BrowserProvider.
 *
 * This keeps the working browser as the stable host while the richer
 * AgentSamBrowserShell implementation is mined incrementally. The provider
 * delegates to host callbacks so it stays DOM-free and lane-portable.
 */

import type {
  BrowserDocument,
  BrowserInspection,
  BrowserInteraction,
  BrowserProvider,
  BrowserProviderCapabilities,
  BrowserSurfaceEvent,
} from '../index.js';

export interface LightweightBrowserHost {
  /** Load a URL and return what was loaded (iframe, webview, or fetch+sanitize). */
  load(url: string, signal?: AbortSignal): Promise<BrowserDocument>;
  /** Optional DOM query for the inspector panel. */
  inspect?(selector?: string): Promise<BrowserInspection>;
  /** Optional synthetic interaction. */
  interact?(interaction: BrowserInteraction): Promise<BrowserDocument>;
  /** Optional model-backed summarizer. */
  summarize?(input: { document: BrowserDocument; question?: string }): AsyncIterable<{ delta: string; done?: boolean }>;
}

export const LIGHTWEIGHT_CAPABILITIES: BrowserProviderCapabilities = {
  modes: ['browse'],
  operations: ['navigate', 'inspect', 'interact', 'summarize'],
  liveWeb: true,
  sandboxedPreview: false,
  history: true,
  publish: false,
  fidelity: 0.5,
};

export function createLightweightBrowserProvider(host: LightweightBrowserHost): BrowserProvider {
  let current: BrowserDocument | null = null;

  return {
    id: 'lightweight',
    displayName: 'Local Studio Browser',
    capabilities: {
      ...LIGHTWEIGHT_CAPABILITIES,
      operations: LIGHTWEIGHT_CAPABILITIES.operations.filter((operation) => {
        if (operation === 'inspect') return Boolean(host.inspect);
        if (operation === 'interact') return Boolean(host.interact);
        if (operation === 'summarize') return Boolean(host.summarize);
        return true;
      }),
    },

    async *navigate(input, signal) {
      if (!input.url) {
        yield { type: 'error', message: 'The lightweight browser requires a URL. Use the ABS provider for prompts.' };
        return;
      }
      yield { type: 'status', state: 'browser_navigation', label: `Loading ${input.url}` };
      try {
        current = await host.load(input.url, signal);
        yield { type: 'document', document: current };
        yield { type: 'complete' };
      } catch (error) {
        yield { type: 'error', message: error instanceof Error ? error.message : String(error) };
      }
    },

    inspect: host.inspect ? (input) => host.inspect!(input.selector) : undefined,

    interact: host.interact
      ? async function* (interaction): AsyncIterable<BrowserSurfaceEvent> {
          yield { type: 'status', state: 'browser_navigation', label: `Interacting (${interaction.kind})` };
          current = await host.interact!(interaction);
          yield { type: 'document', document: current };
          yield { type: 'complete' };
        }
      : undefined,

    summarize: host.summarize
      ? (input) => {
          if (!current) {
            return (async function* () {
              yield { delta: 'Nothing loaded yet.', done: true };
            })();
          }
          return host.summarize!({ document: current, question: input.question });
        }
      : undefined,

    current: () => current,
  };
}
