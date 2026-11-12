import { useWorkStore } from './store';

/**
 * Browser is a workspace tool, not a primary route. The persisted Work store
 * owns browser tabs for Side Stage and its expanded/focused presentation.
 */
export function openBrowserSideStage(options?: { url?: string; srcdoc?: string; title?: string }): string {
  const store = useWorkStore.getState();
  const existing = !options ? store.sideTabs.find(tab => tab.kind === 'browser') : undefined;
  const id = existing?.id ?? store.openSideTab('browser', {
    ephemeral: false,
    ...(options?.title ? { title: options.title } : {}),
    ...(options?.srcdoc ? { srcdoc: options.srcdoc } : {}),
  });
  if (options?.url) store.setTabUrl(id, options.url);
  store.setActiveSideTab(id);
  store.setSideOpen(true);
  return id;
}
