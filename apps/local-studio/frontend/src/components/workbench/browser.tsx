import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Puzzle, Square, X, ChevronUp, ChevronDown } from 'lucide-react';
import { AgentSamAbsBrowser, AbsBuildHome } from '@inneranimalmedia/agentsam-abs/react';
import type { AbsBrowserMode, BrowserTabState } from '@inneranimalmedia/agentsam-abs';
import type { SideTab } from '@inneranimalmedia/agentsam-local-shared';
import { useWorkStore } from '@/lib/work/store';
import { getTauriInvoke, isPackagedDesktop, listenTauriEvent, openAgentBrowser } from '@/lib/desktop/tauri';
import { EmbeddedBrowserViewport } from './embedded-browser-viewport';
import { toast } from 'sonner';
import { IconAction } from '@/components/ui/icon-action';
import { useActiveCompanion } from '../../../agentsam/CompanionContext';
import { companionStateAsset } from '../../../agentsam/companions';
import '@inneranimalmedia/agentsam-abs/browser.css';
import './browser-stage.css';
import { extractRunnableHtml, buildBrowserInstruction } from './browser-build-result';

interface BrowserNativeEvent { sessionId: string; url: string; title?: string | null }

/** The existing Side Stage and expanded Work panel both mount this same browser session. */
export function BrowserStage({ tab }: { tab: SideTab }) {
  const native = isPackagedDesktop();
  const companion = useActiveCompanion();
  const busy = useWorkStore(state => state.streamingIds.includes(tab.id));
  const pet = companionStateAsset(companion, busy ? 'working' : 'idle');
  const mascot = pet ? <img className="as-browser-ready-pet" src={pet} alt="" draggable={false} /> : null;
  const setTabUrl = useWorkStore((state) => state.setTabUrl);
  const navigateBrowser = useWorkStore((state) => state.navigateBrowser);
  const openSideTab = useWorkStore((state) => state.openSideTab);
  const [mode, setMode] = useState<AbsBrowserMode>(tab.srcdoc ? 'build' : 'explore');
  const [reloadKey, setReloadKey] = useState(0);
  const [buildError, setBuildError] = useState('');
  const [activityOpen, setActivityOpen] = useState(true);
  const [buildRequested, setBuildRequested] = useState(false);
  const send = useWorkStore(state => state.send);
  const stop = useWorkStore(state => state.stop);
  const latestReply = [...tab.messages].reverse().find(message => message.role === 'assistant')?.content || '';
  useEffect(() => { if (tab.url) setMode('explore'); }, [tab.url]);
  const canBack = tab.historyIndex > 0;
  const canForward = tab.historyIndex >= 0 && tab.historyIndex < tab.history.length - 1;

  // Navigation in the native WebView (including redirects and link clicks) updates
  // the existing persisted SideTab, rather than spawning a second session registry.
  useEffect(() => {
    if (!native) return;
    let disposed = false;
    let removeLocation: (() => void) | null = null;
    let removeNewTab: (() => void) | null = null;
    void listenTauriEvent<BrowserNativeEvent>('agentsam://embedded-browser-location', ({ payload }) => {
      if (disposed || payload.sessionId !== tab.id || !/^https?:\/\//i.test(payload.url)) return;
      const store = useWorkStore.getState();
      const current = store.sideTabs.find((item) => item.id === tab.id);
      if (!current) return;
      if (current.url !== payload.url) {
        const previous = current.historyIndex > 0 ? current.history[current.historyIndex - 1] : null;
        const next = current.historyIndex + 1 < current.history.length ? current.history[current.historyIndex + 1] : null;
        if (previous === payload.url) store.navigateBrowser(tab.id, -1);
        else if (next === payload.url) store.navigateBrowser(tab.id, 1);
        else store.setTabUrl(tab.id, payload.url);
      }
      if (payload.title) useWorkStore.setState((state) => ({
        sideTabs: state.sideTabs.map((item) => item.id === tab.id ? { ...item, title: payload.title! } : item),
      }));
    }).then((remove) => { if (disposed) remove?.(); else removeLocation = remove; });
    void listenTauriEvent<BrowserNativeEvent>('agentsam://embedded-browser-new-tab', ({ payload }) => {
      if (disposed || payload.sessionId !== tab.id || !/^https?:\/\//i.test(payload.url)) return;
      const id = openSideTab('browser', { ephemeral: false });
      useWorkStore.getState().setTabUrl(id, payload.url);
    }).then((remove) => { if (disposed) remove?.(); else removeNewTab = remove; });
    return () => { disposed = true; removeLocation?.(); removeNewTab?.(); };
  }, [native, tab.id, openSideTab]);

  const absTabs = useMemo<BrowserTabState[]>(() => [{
    id: tab.id, history: [], currentIndex: -1, loading: false,
    loadingMessage: '', generatedContent: tab.srcdoc ?? '',
    breadcrumb: { sitename: tab.title, page: '' }, tokenCount: null,
    groundingSources: [], searchEntryPointHtml: '', navigationId: 0,
  }], [tab.id, tab.srcdoc, tab.title]);

  function openExternally(target = tab.url) {
    if (!target) return;
    if (native) {
      void openAgentBrowser(target).catch((error) => toast.error(String(error)));
    } else {
      window.open(target, '_blank', 'noopener,noreferrer');
    }
  }

  function nativeAction(action: 'back' | 'forward' | 'reload') {
    const invoke = getTauriInvoke();
    if (native && invoke && tab.url) {
      void invoke('embedded_browser_action', { sessionId: tab.id, action }).catch((error) => toast.error(String(error)));
      return;
    }
    if (action === 'back') navigateBrowser(tab.id, -1);
    if (action === 'forward') navigateBrowser(tab.id, 1);
    if (action === 'reload') setReloadKey((key) => key + 1);
  }

  /** Run the existing authenticated agent directly against this persistent browser tab.
   * The browser stores its own instruction/reply history and only previews verified HTML output.
   */
  async function runBrowserBuild(intent: 'create' | 'edit', prompt: string) {
    if (!prompt.trim() || busy) return;
    const request = intent === 'edit' ? 'Revise the current page: ' + prompt : prompt;
    setMode('build'); setBuildRequested(true); setActivityOpen(true); setBuildError('');
    const source = useWorkStore.getState().sideTabs.find(item => item.id === tab.id)?.srcdoc;
    try {
      await send(tab.id, 'side', buildBrowserInstruction(request, source), { runMode: 'agent' });
      const latest = useWorkStore.getState().sideTabs.find(item => item.id === tab.id);
      const answer = [...(latest?.messages || [])].reverse().find(message => message.role === 'assistant' && message.content.trim());
      const html = answer && extractRunnableHtml(answer.content);
      if (!html) { setBuildError('The agent responded, but no complete runnable HTML was produced. Review its response below and retry.'); return; }
      useWorkStore.getState().setBrowserSrcdoc(tab.id, html, 'Built · ' + prompt.trim().slice(0,48));
      setActivityOpen(false);
    } catch (error) { setBuildError(error instanceof Error ? error.message : 'Browser build failed.'); }
  }

  return (
    <div className="as-work-browser-shell flex h-full min-h-0 flex-col" data-agentsam-resource={`browser:${tab.id}`}>
      <AgentSamAbsBrowser
        breadcrumb={{ sitename: tab.title, page: '' }}
        isLoading={false}
        hasPageContent={Boolean(tab.srcdoc)}
        tabs={absTabs}
        activeTabIndex={0}
        canGoBack={canBack}
        canGoForward={canForward}
        mode={mode}
        onModeChange={setMode}
        showBuildTabs={false}
        showThemeToggle={false}
        exploreHomeExtra={mascot}
        exploreUrl={tab.url}
        exploreCanBack={canBack}
        exploreCanForward={canForward}
        onExploreNavigate={(url) => setTabUrl(tab.id, url)}
        onExploreBack={() => nativeAction('back')}
        onExploreForward={() => nativeAction('forward')}
        onExploreRefresh={() => nativeAction('reload')}
        exploreSurface={native ? <EmbeddedBrowserViewport key={`${tab.id}-${reloadKey}`} sessionId={tab.id} url={tab.url} /> : (
          <div className="as-browser-no-iframe" role="status">
            <Globe className="size-7" />
            <strong>Use the native browser in AgentSam Local Studio</strong>
            <p>Web pages that block embedding need the installed desktop browser engine. This web surface does not fake a live browser with an iframe.</p>
            <button type="button" onClick={() => openExternally()}>Open in an external browser</button>
          </div>
        )}
        onNavigate={(intent, prompt) => { void runBrowserBuild(intent,prompt); }}
        onBack={() => nativeAction('back')}
        onForward={() => nativeAction('forward')}
        onRefresh={() => nativeAction('reload')}
        onStop={() => stop(tab.id)}
        onHome={() => { setMode('explore'); setTabUrl(tab.id, ''); }}
        onNewTab={() => openSideTab('browser', { ephemeral: false })}
        onCloseTab={() => undefined}
        onSwitchTab={() => undefined}
        statusSlot={<span className="as-work-browser-status">{native ? 'In-app browser' : 'Web preview'}</span>}
        toolbarActions={<div className="as-work-browser-actions">
          {native && <IconAction type="button" variant="ghost" label="Chrome extensions" hint="Open Chrome extensions in your separate browser profile" onClick={() => {
            void openAgentBrowser('chrome://extensions/').catch((error) => toast.error(String(error)));
          }}><Puzzle size={14} /></IconAction>}
          <IconAction type="button" variant="ghost" label="Open externally" hint="Open this website in a separate browser window" onClick={() => openExternally()} disabled={!tab.url}><ExternalLink size={14} /></IconAction>
        </div>}
      >
        {tab.srcdoc ? <iframe title={tab.title} key={`${tab.id}-${reloadKey}`} srcDoc={tab.srcdoc}
          sandbox="allow-forms allow-scripts" className="as-work-generated-preview" /> : (
          <AbsBuildHome mascot={mascot} title="Work with AgentSam" subtitle="Prepare a request for AgentSam to build or revise an experience in your current workspace."
            onCreatePage={(prompt) => { void runBrowserBuild('create',prompt); }} />
        )}
      </AgentSamAbsBrowser>
      {mode === 'build' && (busy || buildRequested || buildError) && <section className="as-browser-build-activity" data-open={activityOpen} aria-label="Browser build activity">
        <header><strong>{busy ? 'Building with AgentSam…' : buildError ? 'Build needs attention' : 'Build complete'}</strong>
          {busy && <IconAction type="button" label="Stop browser build" onClick={() => stop(tab.id)}><Square size={13}/></IconAction>}
          <button type="button" aria-label={activityOpen ? 'Collapse build details' : 'Expand build details'} onClick={() => setActivityOpen(value => !value)}>{activityOpen ? <ChevronDown size={14}/> : <ChevronUp size={14}/>}</button>
        </header>
        {activityOpen && <div className="as-browser-build-details">
          {buildError && <p role="alert">{buildError}</p>}
          {latestReply && <pre>{latestReply.slice(-3000)}</pre>}
          {!latestReply && busy ? <p role="status">Executing this task through the AgentSam agent runtime for this browser session.</p> : null}
          {!busy && tab.srcdoc && <button type="button" onClick={() => setActivityOpen(false)}>Return to preview</button>}
        </div>}
      </section>}
    </div>
  );
}
