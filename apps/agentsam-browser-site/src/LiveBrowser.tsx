import * as React from 'react';
import type {
  AbsGenerationIntent,
  AbsThemeMode,
  BrowserTabState,
} from '@inneranimalmedia/agentsam-abs';
import { AbsBuildHome, AgentSamAbsBrowser } from '@inneranimalmedia/agentsam-abs/react';

const makeTab = (id: string): BrowserTabState => ({
  id,
  history: [],
  currentIndex: -1,
  loading: false,
  loadingMessage: 'Building the experience',
  generatedContent: '',
  breadcrumb: { sitename: '', page: '' },
  tokenCount: null,
  groundingSources: [],
  searchEntryPointHtml: '',
  navigationId: 0,
});

interface BrowserState {
  tabs: BrowserTabState[];
  active: number;
}

/**
 * Local preview host. Returns a canned page after a short delay: no provider key,
 * no network, no cost. Replace the body of `build` with a call to an AgentSam
 * runtime to go live; the surrounding browser UI stays the same.
 */
function usePreviewHost() {
  const counter = React.useRef(1);
  const timers = React.useRef<number[]>([]);
  const [state, setState] = React.useState<BrowserState>({
    tabs: [makeTab('tab-1')],
    active: 0,
  });

  React.useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const patchTab = React.useCallback((id: string, patch: Partial<BrowserTabState>) => {
    setState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    }));
  }, []);

  const active = state.tabs[state.active] ?? state.tabs[0];

  const build = (intent: AbsGenerationIntent, prompt: string) => {
    const id = active.id;
    patchTab(id, {
      loading: true,
      loadingMessage: intent === 'edit' ? 'Applying revision' : 'Building preview',
    });
    timers.current.push(
      window.setTimeout(() => {
        patchTab(id, {
          loading: false,
          generatedContent: prompt,
          breadcrumb: { sitename: 'AgentSam', page: prompt.slice(0, 42) },
        });
      }, 560),
    );
  };

  const newTab = () => {
    counter.current += 1;
    const tab = makeTab(`tab-${counter.current}`);
    setState((current) => ({ tabs: [...current.tabs, tab], active: current.tabs.length }));
  };

  const closeTab = (index: number) => {
    setState((current) => {
      if (current.tabs.length === 1) {
        counter.current += 1;
        return { tabs: [makeTab(`tab-${counter.current}`)], active: 0 };
      }
      const tabs = current.tabs.filter((_, i) => i !== index);
      const active = index < current.active ? current.active - 1 : Math.min(current.active, tabs.length - 1);
      return { tabs, active };
    });
  };

  const reset = () => patchTab(active.id, { generatedContent: '', breadcrumb: { sitename: '', page: '' }, loading: false });

  return {
    state,
    active,
    build,
    newTab,
    closeTab,
    reset,
    stop: () => patchTab(active.id, { loading: false }),
    refresh: () => patchTab(active.id, { navigationId: active.navigationId + 1 }),
    switchTab: (index: number) => setState((current) => ({ ...current, active: index })),
  };
}

function PreviewPage({ prompt }: { prompt: string }) {
  return (
    <div className="site-preview">
      <div className="site-preview__eyebrow">Interactive preview</div>
      <h2>{prompt}</h2>
      <p>
        This is the real AgentSam Browser surface. A signed-in runtime replaces this preview host
        without changing the browser UI.
      </p>
      <div className="site-preview__grid">
        {[
          ['Reusable', 'One browser surface', 'Standalone, embedded, desktop and mobile hosts compose the same package.'],
          ['Provider-neutral', 'Your runtime picks the engine', 'The browser never owns model credentials.'],
          ['Inspectable', 'Build, revise, verify', 'Browse references, build a live preview, keep editing in place.'],
        ].map(([chip, heading, body]) => (
          <article key={heading} className="as-glass-panel site-preview__card">
            <span className="as-chip">{chip}</span>
            <h3>{heading}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
      <div className="site-preview__actions">
        <button type="button" className="as-button as-button--primary">Continue building</button>
        <button type="button" className="as-button as-button--ghost-glass"><span>Preview details</span></button>
      </div>
    </div>
  );
}

export interface LiveBrowserProps {
  theme: AbsThemeMode;
  onThemeChange: (theme: AbsThemeMode) => void;
}

export function LiveBrowser({ theme, onThemeChange }: LiveBrowserProps) {
  const host = usePreviewHost();
  const { active } = host;
  const hasPageContent = Boolean(active.generatedContent);

  return (
    <div className="site-browser-frame as-glass-panel">
      <AgentSamAbsBrowser
        breadcrumb={active.breadcrumb}
        isLoading={active.loading}
        loadingMessage={active.loadingMessage}
        hasPageContent={hasPageContent}
        tabs={host.state.tabs}
        activeTabIndex={host.state.active}
        canGoBack={false}
        canGoForward={false}
        defaultMode="build"
        theme={theme}
        onThemeChange={onThemeChange}
        onNavigate={host.build}
        onBack={() => undefined}
        onForward={() => undefined}
        onRefresh={host.refresh}
        onStop={host.stop}
        onHome={host.reset}
        onNewTab={host.newTab}
        onCloseTab={host.closeTab}
        onSwitchTab={host.switchTab}
        statusSlot={<span className="site-browser-status">Preview runtime</span>}
      >
        {hasPageContent ? (
          <PreviewPage prompt={active.generatedContent} />
        ) : (
          <AbsBuildHome
            title="Build with AgentSam"
            subtitle="Describe an interface, page, workspace, or experience."
            onCreatePage={(prompt) => host.build('create', prompt)}
          />
        )}
      </AgentSamAbsBrowser>
    </div>
  );
}
