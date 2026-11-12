import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Globe, Puzzle } from 'lucide-react';
import { AgentSamAbsBrowser, AbsBuildHome } from '@inneranimalmedia/agentsam-abs/react';
import type { AbsBrowserMode, BrowserTabState } from '@inneranimalmedia/agentsam-abs';
import type { SideTab } from '@inneranimalmedia/agentsam-local-shared';
import { useWorkStore } from '@/lib/work/store';
import { getTauriInvoke, isPackagedDesktop, listenTauriEvent, openAgentBrowser } from '@/lib/desktop/tauri';
import { EmbeddedBrowserViewport } from './embedded-browser-viewport';
import { toast } from 'sonner';
import { IconAction } from '@/components/ui/icon-action';
import '@inneranimalmedia/agentsam-abs/browser.css';
import './browser-stage.css';

interface BrowserNativeEvent { sessionId: string; url: string; title?: string | null }

/** The existing Side Stage and expanded Work panel both mount this same browser session. */
export function BrowserStage({ tab }: { tab: SideTab }) {
  const native = isPackagedDesktop();
  const setTabUrl = useWorkStore((state) => state.setTabUrl);
  const navigateBrowser = useWorkStore((state) => state.navigateBrowser);
  const openSideTab = useWorkStore((state) => state.openSideTab);
  const [mode, setMode] = useState<AbsBrowserMode>(tab.srcdoc ? 'build' : 'explore');
  const [reloadKey, setReloadKey] = useState(0);
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

  function prepareAgentRequest(intent: 'create' | 'edit', prompt: string) {
    const store = useWorkStore.getState();
    const context = tab.url ? ` on ${tab.url}` : '';
    store.setDraft(store.activeChatId, `Help me ${intent === 'edit' ? 'revise' : 'build'}${context}: ${prompt}`);
    toast.info('Added the request to your AgentSam chat composer. Review and send it from Work.');
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
        onNavigate={prepareAgentRequest}
        onBack={() => nativeAction('back')}
        onForward={() => nativeAction('forward')}
        onRefresh={() => nativeAction('reload')}
        onStop={() => undefined}
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
          <AbsBuildHome title="Work with AgentSam" subtitle="Prepare a request for AgentSam to build or revise an experience in your current workspace."
            onCreatePage={(prompt) => prepareAgentRequest('create', prompt)} />
        )}
      </AgentSamAbsBrowser>
    </div>
  );
}
