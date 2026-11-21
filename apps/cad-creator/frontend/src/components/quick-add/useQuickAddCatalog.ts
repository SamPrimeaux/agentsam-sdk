import React from 'react';
import { builtinQuickAddCatalog, fetchQuickAddCatalog } from './catalog';
import type { QuickAddItem, QuickAddSource } from './types';

/** Starts with the built-in catalog, then swaps in the database catalog when the host serves one. */
export function useQuickAddCatalog(enabled = true): { items: QuickAddItem[]; source: QuickAddSource } {
  const [state, setState] = React.useState<{ items: QuickAddItem[]; source: QuickAddSource }>(() => ({ items: builtinQuickAddCatalog(), source: 'builtin' }));
  React.useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchQuickAddCatalog(fetch, controller.signal)
      .then((items) => { if (items.length) setState({ items, source: 'catalog' }); })
      .catch(() => { /* host has no catalog route: keep the built-in set */ });
    return () => controller.abort();
  }, [enabled]);
  return state;
}
