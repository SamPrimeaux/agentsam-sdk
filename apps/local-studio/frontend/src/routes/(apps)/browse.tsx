import { useEffect } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { Plus, X } from 'lucide-react';
import { BrowserStage } from '@/components/workbench/browser';
import { useWorkStore } from '@/lib/work/store';

export const Route = createFileRoute('/(apps)/browse')({
  component: BrowsePage,
});

/**
 * Dedicated browser session host: reuses the persisted SideStage tabs.
 * Session tabs represent AgentSam saved URLs, not a claim to control Chrome's native tabs.
 */
function BrowsePage() {
  const sideTabs = useWorkStore((state) => state.sideTabs);
  const activeId = useWorkStore((state) => state.activeSideTabId);
  const openSideTab = useWorkStore((state) => state.openSideTab);
  const setActiveSideTab = useWorkStore((state) => state.setActiveSideTab);
  const closeSideTab = useWorkStore((state) => state.closeSideTab);
  const setSideOpen = useWorkStore((state) => state.setSideOpen);
  const browsers = sideTabs.filter((item) => item.kind === 'browser');
  const active = browsers.find((item) => item.id === activeId) ?? browsers[0];

  useEffect(() => {
    if (!browsers.length) openSideTab('browser', { ephemeral: false });
    // The dedicated browser occupies the main stage, not a duplicate co-worker pane.
    setSideOpen(false);
  }, [browsers.length, openSideTab, setSideOpen]);

  const activate = (id: string) => {
    setActiveSideTab(id);
    setSideOpen(false);
  };
  const newSession = () => {
    openSideTab('browser', { ephemeral: false });
    setSideOpen(false);
  };
  const closeSession = (id: string) => {
    closeSideTab(id, true);
    setSideOpen(false);
  };

  return <div className="flex h-full min-h-0 flex-col bg-background" data-browser-sessions="true">
    <div className="flex min-h-12 flex-none items-center gap-2 overflow-x-auto border-b border-border px-3 py-2"
      role="tablist" aria-label="Saved browser sessions">
      {browsers.map((item, index) => <div key={item.id}
        className={'flex min-w-0 flex-none items-center rounded-lg border ' +
          (active?.id === item.id ? 'border-foreground/25 bg-muted' : 'border-transparent bg-muted/35')}>
        <button type="button" role="tab" aria-selected={active?.id === item.id}
          aria-controls="agentsam-browser-session-panel"
          onClick={() => activate(item.id)}
          className="min-h-10 max-w-40 min-w-24 truncate px-3 text-left text-xs">
          {item.title || 'Tab ' + (index + 1)}
        </button>
        <button type="button" aria-label={'Close ' + (item.title || 'browser session')}
          title="Close session" onClick={() => closeSession(item.id)}
          className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>)}
      <button type="button" onClick={newSession}
        aria-label="New browser session" title="New browser session"
        className="grid size-10 flex-none place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
        <Plus className="size-5" aria-hidden="true" />
      </button>
    </div>
    <section id="agentsam-browser-session-panel" role="tabpanel" aria-label="Active browser session"
      className="min-h-0 flex-1">
      {active ? <BrowserStage key={active.id} tab={active} /> : (
        <div className="grid h-full place-items-center text-sm text-muted-foreground" role="status">
          Opening browser session…
        </div>
      )}
    </section>
  </div>;
}
