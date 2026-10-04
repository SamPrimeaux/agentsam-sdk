import {
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import type {
  AbsBrowserMode,
  AbsThemeMode,
  AbsGenerationIntent,
  AbsQuickLink,
  Breadcrumb,
  BrowserTabState,
} from '../types.js';

const DEFAULT_EXPLORE_LINKS: AbsQuickLink[] = [
  { label: 'AgentSam', url: 'https://agentsam.inneranimalmedia.com/' },
  { label: 'GitHub', url: 'https://github.com/' },
  { label: 'npm', url: 'https://www.npmjs.com/' },
  { label: 'Cloudflare', url: 'https://developers.cloudflare.com/' },
  { label: 'AI Studio', url: 'https://aistudio.google.com/' },
];

function resolveExploreInput(raw: string) {
  const value = raw.trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes(' ') || !value.includes('.')) {
    return `https://duckduckgo.com/?q=${encodeURIComponent(value)}`;
  }
  return `https://${value}`;
}

export interface AgentSamAbsBrowserProps {
  children: ReactNode;
  breadcrumb: Breadcrumb;
  isLoading: boolean;
  loadingMessage?: string;
  hasPageContent: boolean;
  tabs: BrowserTabState[];
  activeTabIndex: number;
  canGoBack: boolean;
  canGoForward: boolean;
  onNavigate: (intent: AbsGenerationIntent, prompt: string) => void;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onStop: () => void;
  onHome: () => void;
  onNewTab: () => void;
  onCloseTab: (index: number) => void;
  onSwitchTab: (index: number) => void;
  mode?: AbsBrowserMode;
  defaultMode?: AbsBrowserMode;
  onModeChange?: (mode: AbsBrowserMode) => void;
  exploreLinks?: AbsQuickLink[];
  theme?: AbsThemeMode;
  defaultTheme?: AbsThemeMode;
  onThemeChange?: (theme: AbsThemeMode) => void;
  toolbarActions?: ReactNode;
  statusSlot?: ReactNode;
}

export function AgentSamAbsBrowser({
  children,
  breadcrumb,
  isLoading,
  loadingMessage = 'Building the experience',
  hasPageContent,
  tabs,
  activeTabIndex,
  canGoBack,
  canGoForward,
  onNavigate,
  onBack,
  onForward,
  onRefresh,
  onStop,
  onHome,
  onNewTab,
  onCloseTab,
  onSwitchTab,
  mode: controlledMode,
  defaultMode = 'explore',
  onModeChange,
  exploreLinks = DEFAULT_EXPLORE_LINKS,
  theme: controlledTheme,
  defaultTheme = 'dark',
  onThemeChange,
  toolbarActions,
  statusSlot,
}: AgentSamAbsBrowserProps) {
  const [localMode, setLocalMode] = useState<AbsBrowserMode>(defaultMode);
  const mode = controlledMode ?? localMode;
  const [localTheme, setLocalTheme] = useState<AbsThemeMode>(defaultTheme);
  const theme = controlledTheme ?? localTheme;
  const [buildDraft, setBuildDraft] = useState('');
  const [exploreDraft, setExploreDraft] = useState('');
  const [exploreHistory, setExploreHistory] = useState<string[]>([]);
  const [exploreIndex, setExploreIndex] = useState(-1);
  const [exploreReloadKey, setExploreReloadKey] = useState(0);

  const exploreUrl = exploreIndex >= 0 ? exploreHistory[exploreIndex] || '' : '';
  const exploreCanBack = exploreIndex > 0;
  const exploreCanForward = exploreIndex >= 0 && exploreIndex < exploreHistory.length - 1;

  const activeTabTitle = useMemo(() => {
    const tab = tabs[activeTabIndex];
    return tab?.breadcrumb.page || tab?.breadcrumb.sitename || 'New Tab';
  }, [tabs, activeTabIndex]);

  function setMode(next: AbsBrowserMode) {
    if (controlledMode === undefined) setLocalMode(next);
    onModeChange?.(next);
  }

  function setTheme(next: AbsThemeMode) {
    if (controlledTheme === undefined) setLocalTheme(next);
    onThemeChange?.(next);
  }

  function exploreGo(raw: string) {
    const next = resolveExploreInput(raw);
    if (!next) return;
    setExploreDraft(next);
    setExploreHistory((history) => {
      const base = history.slice(0, exploreIndex + 1);
      return [...base, next];
    });
    setExploreIndex((index) => index + 1);
    setExploreReloadKey((key) => key + 1);
  }

  function submitExplore(event: FormEvent) {
    event.preventDefault();
    exploreGo(exploreDraft);
  }

  function submitBuild(event: FormEvent) {
    event.preventDefault();
    const prompt = buildDraft.trim();
    if (!prompt) return;
    onNavigate(hasPageContent ? 'edit' : 'create', prompt);
    setBuildDraft('');
  }

  return (
    <section className="abs-browser" data-abs-mode={mode} data-abs-theme={theme}>
      <div className="abs-windowbar">
        <div className="abs-brand-lockup">
          <span className="abs-brand-mark" aria-hidden="true" />
          <span className="abs-brand-name">AgentSam Browser</span>
          <span className="abs-brand-mode">{mode === 'build' ? 'Build' : 'Explore'}</span>
        </div>
        <div className="abs-windowbar-spacer" />
        {statusSlot ? <div className="abs-status-slot">{statusSlot}</div> : null}
        {toolbarActions ? <div className="abs-toolbar-actions">{toolbarActions}</div> : null}
        <button
          type="button"
          className="abs-theme-toggle"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          aria-label={'Switch to ' + (theme === 'dark' ? 'light' : 'dark') + ' theme'}
        >
          {theme === 'dark' ? 'Light' : 'Dark'}
        </button>
      </div>
      {mode === 'build' && (
        <div className="abs-tabbar" role="tablist" aria-label="Build tabs">
          <div className="abs-tablist">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                className={index === activeTabIndex ? 'abs-tab is-active' : 'abs-tab'}
                onClick={() => onSwitchTab(index)}
                role="tab"
                aria-selected={index === activeTabIndex}
              >
                <span>{tab.loading ? 'Building' : (tab.breadcrumb.page || tab.breadcrumb.sitename || 'New Tab')}</span>
                <span
                  className="abs-tab-close"
                  role="button"
                  aria-label="Close tab"
                  onClick={(event) => {
                    event.stopPropagation();
                    onCloseTab(index);
                  }}
                >
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              className="abs-tab-new"
              onClick={onNewTab}
              aria-label="New build tab"
            >
              +
            </button>
          </div>
          <div className="abs-tab-current" aria-hidden="true">{activeTabTitle}</div>
        </div>
      )}

      <div className="abs-toolbar">
        <div className="abs-mode-switch" role="group" aria-label="Browser mode">
          <button
            type="button"
            className={mode === 'explore' ? 'is-active' : ''}
            onClick={() => setMode('explore')}
          >
            Explore
          </button>
          <button
            type="button"
            className={mode === 'build' ? 'is-active' : ''}
            onClick={() => setMode('build')}
          >
            Build
          </button>
        </div>

        {mode === 'explore' ? (
          <>
            <div className="abs-nav-actions">
              <button
                type="button"
                disabled={!exploreCanBack}
                onClick={() => setExploreIndex((index) => Math.max(0, index - 1))}
              >
                Back
              </button>
              <button
                type="button"
                disabled={!exploreCanForward}
                onClick={() => setExploreIndex((index) => Math.min(exploreHistory.length - 1, index + 1))}
              >
                Forward
              </button>
              <button
                type="button"
                disabled={!exploreUrl}
                onClick={() => setExploreReloadKey((key) => key + 1)}
              >
                Reload
              </button>
            </div>
            <form className="abs-omnibar" onSubmit={submitExplore}>
              <input
                value={exploreDraft}
                onChange={(event) => setExploreDraft(event.target.value)}
                placeholder="Search or enter a URL"
                aria-label="Explore address"
              />
            </form>
            {exploreUrl && (
              <button
                type="button"
                className="abs-open-external"
                onClick={() => window.open(exploreUrl, '_blank', 'noopener,noreferrer')}
              >
                Open externally
              </button>
            )}
          </>
        ) : (
          <>
            <div className="abs-nav-actions">
              <button type="button" disabled={!canGoBack} onClick={onBack}>Back</button>
              <button type="button" disabled={!canGoForward} onClick={onForward}>Forward</button>
              <button type="button" onClick={isLoading ? onStop : onRefresh}>
                {isLoading ? 'Stop' : 'Refresh'}
              </button>
              <button type="button" onClick={onHome}>Home</button>
            </div>
            <form className="abs-omnibar" onSubmit={submitBuild}>
              <input
                value={buildDraft}
                onChange={(event) => setBuildDraft(event.target.value)}
                placeholder={isLoading
                  ? loadingMessage
                  : hasPageContent
                    ? 'Describe a change...'
                    : 'Imagine any website...'}
                aria-label="AgentSam build prompt"
              />
            </form>
          </>
        )}
      </div>

      <div className="abs-browser-stage">
        {mode === 'explore' ? (
          exploreUrl ? (
            <iframe
              key={`${exploreUrl}-${exploreReloadKey}`}
              className="abs-explore-frame"
              src={exploreUrl}
              title={exploreUrl}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="abs-explore-home">
              <div className="abs-explore-home-inner">
                <div className="abs-explore-kicker">AgentSam Browser</div>
                <h2>Explore the web</h2>
                <p>
                  Browse, research, and inspect live sites without leaving your workspace.
                  Switch to Build to turn an idea or reference into a live AgentSam prototype.
                </p>
                <div className="abs-explore-links">
                  {exploreLinks.map((link) => (
                    <button key={link.url} type="button" onClick={() => exploreGo(link.url)}>
                      {link.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )
        ) : (
          children
        )}
      </div>
    </section>
  );
}
