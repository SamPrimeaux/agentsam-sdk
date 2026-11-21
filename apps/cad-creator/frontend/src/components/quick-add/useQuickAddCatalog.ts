import React from 'react';
import { builtinQuickAddCatalog, cadCanAct, fetchQuickAddCatalog, type QuickAddFetchOptions } from './catalog';
import type { QuickAddItem, QuickAddSource } from './types';

/** Starts with the built-in catalog, then swaps in the database catalog when the host serves one. */
export function useQuickAddCatalog(enabled = true, options: QuickAddFetchOptions = { app: 'cad-creator', accepts: cadCanAct }): { items: QuickAddItem[]; source: QuickAddSource } {
  const [state, setState] = React.useState<{ items: QuickAddItem[]; source: QuickAddSource }>(() => ({ items: builtinQuickAddCatalog(), source: 'builtin' }));
  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchQuickAddCatalog(fetch, controller.signal, options)
      .then((items) => { if (items.length) setState({ items, source: 'catalog' }); })
      .catch(() => { /* host has no catalog route: keep the built-in set */ });
    return () => controller.abort();
  }, [enabled, options.app, options.accepts]);
  return state;
}
