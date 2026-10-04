import type { BrowserTabState, PageSnapshot } from './types.js';

function makeTab(id: string): BrowserTabState {
  return {
    id,
    history: [],
    currentIndex: -1,
    loading: false,
    loadingMessage: '',
    generatedContent: '',
    breadcrumb: { sitename: '', page: '' },
    tokenCount: null,
    groundingSources: [],
    searchEntryPointHtml: '',
    navigationId: 0,
  };
}

function applySnapshot(tab: BrowserTabState, index: number): BrowserTabState {
  const page = tab.history[index];
  if (!page) return tab;
  return {
    ...tab,
    currentIndex: index,
    navigationId: tab.navigationId + 1,
    generatedContent: page.html,
    breadcrumb: page.breadcrumb,
    tokenCount: page.tokenCount,
    groundingSources: page.groundingSources,
    searchEntryPointHtml: page.searchEntryPointHtml,
  };
}

export class AgentSamBrowserClient {
  private tabs = new Map<string, BrowserTabState>();
  private activeTabId: string;
  private nextTab = 1;

  constructor() {
    this.activeTabId = 'tab-0';
    this.tabs.set(this.activeTabId, makeTab(this.activeTabId));
  }

  getActiveTab(): BrowserTabState {
    const tab = this.tabs.get(this.activeTabId);
    if (!tab) throw new Error('ABS active tab is missing');
    return tab;
  }

  listTabs(): BrowserTabState[] {
    return [...this.tabs.values()];
  }

  createTab(): BrowserTabState {
    const id = `tab-${this.nextTab++}`;
    const tab = makeTab(id);
    this.tabs.set(id, tab);
    this.activeTabId = id;
    return tab;
  }

  switchTab(id: string): BrowserTabState {
    if (!this.tabs.has(id)) throw new Error(`Unknown ABS tab: ${id}`);
    this.activeTabId = id;
    return this.getActiveTab();
  }

  closeTab(id: string): BrowserTabState {
    this.tabs.delete(id);
    if (this.tabs.size === 0) {
      const replacement = makeTab(`tab-${this.nextTab++}`);
      this.tabs.set(replacement.id, replacement);
    }
    if (this.activeTabId === id) {
      this.activeTabId = this.tabs.keys().next().value as string;
    }
    return this.getActiveTab();
  }

  pushSnapshot(snapshot: PageSnapshot): BrowserTabState {
    const tab = this.getActiveTab();
    const history = [...tab.history.slice(0, tab.currentIndex + 1), snapshot];
    const next = applySnapshot({ ...tab, history }, history.length - 1);
    this.tabs.set(next.id, next);
    return next;
  }

  replaceCurrent(snapshot: PageSnapshot): BrowserTabState {
    const tab = this.getActiveTab();
    if (tab.currentIndex < 0) return this.pushSnapshot(snapshot);
    const history = [...tab.history];
    history[tab.currentIndex] = snapshot;
    const next = applySnapshot({ ...tab, history }, tab.currentIndex);
    this.tabs.set(next.id, next);
    return next;
  }

  jumpToHistory(index: number): BrowserTabState {
    const tab = this.getActiveTab();
    if (index === -1) {
      const next: BrowserTabState = {
        ...tab,
        currentIndex: -1,
        generatedContent: '',
        breadcrumb: { sitename: '', page: '' },
        tokenCount: null,
        groundingSources: [],
        searchEntryPointHtml: '',
        navigationId: tab.navigationId + 1,
      };
      this.tabs.set(next.id, next);
      return next;
    }
    if (index < 0 || index >= tab.history.length) return tab;
    const next = applySnapshot(tab, index);
    this.tabs.set(next.id, next);
    return next;
  }

  back(): BrowserTabState {
    const tab = this.getActiveTab();
    return this.jumpToHistory(Math.max(-1, tab.currentIndex - 1));
  }

  forward(): BrowserTabState {
    const tab = this.getActiveTab();
    if (tab.currentIndex >= tab.history.length - 1) return tab;
    return this.jumpToHistory(tab.currentIndex + 1);
  }
}
