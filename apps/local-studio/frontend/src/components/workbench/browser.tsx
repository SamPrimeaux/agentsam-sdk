import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, ExternalLink, Eye, MessageSquare, Puzzle, Square } from 'lucide-react';
import { AgentSamAbsBrowser } from '@inneranimalmedia/agentsam-abs/react';
import type { AbsBrowserMode, BrowserTabState } from '@inneranimalmedia/agentsam-abs';
import type { SideTab } from '@inneranimalmedia/agentsam-local-shared';
import { useWorkStore } from '@/lib/work/store';
import { getTauriInvoke, isPackagedDesktop, listenTauriEvent, openAgentBrowser } from '@/lib/desktop/tauri';
import { EmbeddedBrowserViewport } from './embedded-browser-viewport';
import { WebBrowserViewport } from './web-browser-viewport';
import { toast } from 'sonner';
import { IconAction } from '@/components/ui/icon-action';
import { useActiveCompanion } from '../../../agentsam/CompanionContext';
import { companionStateAsset } from '../../../agentsam/companions';
import '@inneranimalmedia/agentsam-abs/browser.css';
import './browser-stage.css';
import { extractRunnableHtml, buildBrowserInstruction, withBrowserAnnotationBridge } from './browser-build-result';
import { recordBrowserVisit } from '@/lib/browser-history';

interface BrowserNativeEvent { sessionId: string; url: string; title?: string | null }

/** Only the user's request is shown; implementation instructions remain internal. */
function browserRequestText(value: string) {
  const prefix = 'Build a functioning interactive webpage in the AgentSam Browser for this request:';
  if (!value.startsWith(prefix)) return value;
  return value.slice(prefix.length).split(/\n\n(?:You are editing this current browser preview|Return exactly one complete)/)[0].trim();
}

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
  const [previewOpen, setPreviewOpen] = useState(Boolean(tab.srcdoc));
  const [buildDraft, setBuildDraft] = useState('');
  const [buildRequested, setBuildRequested] = useState(Boolean(tab.messages.length));
  const send = useWorkStore(state => state.send);
  const stop = useWorkStore(state => state.stop);
  const conversationOpen = mode === 'build' && !previewOpen;
  useEffect(() => { if (tab.url) setMode('explore'); }, [tab.url]);
  // Settled page visits feed the New tab's Suggested tiles (account history, best-effort).
  useEffect(() => {
    if (!/^https?:\/\//i.test(tab.url)) return;
    const timer = window.setTimeout(() => { void recordBrowserVisit(tab.url, tab.title === 'Browser' ? '' : tab.title); }, 800);
    return () => window.clearTimeout(timer);
  }, [tab.url, tab.title]);
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
    setMode('build'); setBuildRequested(true); setPreviewOpen(false); setBuildError('');
    const source = useWorkStore.getState().sideTabs.find(item => item.id === tab.id)?.srcdoc;
    try {
      await send(tab.id, 'side', buildBrowserInstruction(request, source), { runMode: 'agent' });
      const latest = useWorkStore.getState().sideTabs.find(item => item.id === tab.id);
      const answer = [...(latest?.messages || [])].reverse().find(message => message.role === 'assistant' && message.content.trim());
      const html = answer && extractRunnableHtml(answer.content);
      if (!html) {
        const reply = answer?.content?.trim() || '';
        const codeLike = /```(?:html|htm)?\s|<!doctype\s+html|<html\b/i.test(reply);
        setBuildError(codeLike ? 'AgentSam returned an incomplete page. Ask it to finish the HTML and retry.' : reply.slice(0, 500) || 'No complete preview was returned. Try again.');
        return;
      }
      useWorkStore.getState().setBrowserSrcdoc(tab.id, html, 'Built · ' + prompt.trim().slice(0,48));
      setPreviewOpen(true);
    } catch (error) { setBuildError(error instanceof Error ? error.message : 'Browser build failed.'); }
  }

  return (
    <div className="as-work-browser-shell flex h-full min-h-0 flex-col" data-agentsam-resource={`browser:${tab.id}`}>
      <AgentSamAbsBrowser
        breadcrumb={{ sitename: tab.title, page: '' }}
        isLoading={busy}
        hasPageContent={Boolean(tab.srcdoc)}
        tabs={absTabs}
        activeTabIndex={0}
        canGoBack={canBack}
        canGoForward={canForward}
        mode={mode}
        onModeChange={setMode}
        showBuildTabs={false}
        showWindowbar={false}
        showBuildToolbar={false}
        showThemeToggle={false}
        exploreHomeExtra={mascot}
        exploreUrl={tab.url}
        exploreCanBack={canBack}
        exploreCanForward={canForward}
        onExploreNavigate={(url) => setTabUrl(tab.id, url)}
        onExploreBack={() => nativeAction('back')}
        onExploreForward={() => nativeAction('forward')}
        onExploreRefresh={() => nativeAction('reload')}
        exploreSurface={native ? <EmbeddedBrowserViewport key={`${tab.id}-${reloadKey}`} sessionId={tab.id} url={tab.url} /> : <WebBrowserViewport key={`${tab.id}-${reloadKey}`} tabId={tab.id} url={tab.url} />}
        onNavigate={(intent, prompt) => { void runBrowserBuild(intent,prompt); }}
        onBack={() => nativeAction('back')}
        onForward={() => nativeAction('forward')}
        onRefresh={() => nativeAction('reload')}
        onStop={() => stop(tab.id)}
        onHome={() => { setMode('explore'); setTabUrl(tab.id, ''); }}
        onNewTab={() => openSideTab('browser', { ephemeral: false })}
        onCloseTab={() => undefined}
        onSwitchTab={() => undefined}
        toolbarActions={<div className="as-work-browser-actions">
          {mode === 'build' && tab.srcdoc && <button type="button" className="as-browser-view-switch" onClick={() => setPreviewOpen(value => !value)} aria-label={previewOpen ? 'Open build conversation' : 'View generated page'} title={previewOpen ? 'Conversation' : 'Preview'}>{previewOpen ? <MessageSquare size={14} /> : <Eye size={14} />}<span>{previewOpen ? 'Chat' : 'Preview'}</span></button>}
          {native && <IconAction type="button" variant="ghost" label="Chrome extensions" hint="Open Chrome extensions in your separate browser profile" onClick={() => {
            void openAgentBrowser('chrome://extensions/').catch((error) => toast.error(String(error)));
          }}><Puzzle size={14} /></IconAction>}
          <IconAction type="button" variant="ghost" label="Open externally" hint="Open this website in a separate browser window" onClick={() => openExternally()} disabled={!tab.url}><ExternalLink size={14} /></IconAction>
        </div>}
      >
        <div className="as-browser-build-experience" data-view={previewOpen && tab.srcdoc ? 'preview' : 'conversation'}>
          {previewOpen && tab.srcdoc ? (
            <iframe title={tab.title} key={`${tab.id}-${reloadKey}`} srcDoc={withBrowserAnnotationBridge(tab.srcdoc)}
              sandbox="allow-forms allow-scripts" className="as-work-generated-preview" />
          ) : (
            <div className="as-browser-conversation" role="region" aria-label="Browser build conversation">
              {!buildRequested && tab.messages.length === 0 ? (
                <div className="as-browser-conversation-welcome">
                  {mascot}
                  <h2>What should we build?</h2>
                  <p>Describe a page or experience. AgentSam will build it in this browser tab.</p>
                </div>
              ) : (
                <div className="as-browser-messages" aria-live="polite">
                  {tab.messages.filter(message => message.role === 'user' || message.role === 'assistant').map(message => {
                    const userMessage = message.role === 'user';
                    const content = userMessage ? browserRequestText(message.content) : message.content;
                    const generatedCode = !userMessage && /```(?:html|htm)?\s|<!doctype\s+html|<html\b/i.test(content);
                    const rendered = generatedCode ? (tab.srcdoc ? 'Your page is ready to preview.' : '') : content.trim();
                    if (!rendered) return null;
                    return <div key={message.id} className={`as-browser-message ${userMessage ? 'is-user' : 'is-assistant'}`}>
                      {!userMessage && <strong>AgentSam</strong>}
                      <p>{rendered.length > 1000 && !userMessage ? `${rendered.slice(0, 950)}…` : rendered}</p>
                    </div>;
                  })}
                  {busy && <div className="as-browser-building" role="status"><span className="as-browser-thinking-dot" />Working on it… <button type="button" onClick={() => stop(tab.id)} aria-label="Stop build"><Square size={12} /> Stop</button></div>}
                  {buildError && !busy && <div className="as-browser-build-error" role="alert">{buildError}</div>}
                  {tab.srcdoc && !busy && <button type="button" className="as-browser-show-preview" onClick={() => setPreviewOpen(true)}><Eye size={15} /> View page</button>}
                </div>
              )}
            </div>
          )}
          {!(previewOpen && tab.srcdoc) && <form className="as-browser-chat-composer" onSubmit={(event) => {
            event.preventDefault();
            const next = buildDraft.trim();
            if (next) { setBuildDraft(''); void runBrowserBuild(tab.srcdoc ? 'edit' : 'create', next); }
          }}>
            <textarea aria-label="Build with AgentSam" placeholder={tab.srcdoc ? 'Describe a change…' : 'Ask AgentSam to build anything…'}
              rows={2} value={buildDraft} onChange={event => setBuildDraft(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
            <div className="as-browser-composer-bottom"><span>{tab.srcdoc ? 'Edit this page' : 'Build in this tab'}</span><button type="submit" aria-label="Send build request" disabled={busy || !buildDraft.trim()}><ArrowUp size={17} /></button></div>
          </form>}
        </div>
      </AgentSamAbsBrowser>
    </div>
  );
}
