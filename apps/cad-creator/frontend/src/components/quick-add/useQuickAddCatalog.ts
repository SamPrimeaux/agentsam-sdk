import React from 'react';
import { cadCanAct, fetchQuickAddCatalog, type QuickAddFetchOptions } from './catalog';
import type { QuickAddItem, QuickAddStatus } from './types';

const CACHE_MS = 30_000;
let cachedItems: QuickAddItem[] | null = null;
let cachedAt = 0;
let pending: Promise<QuickAddItem[]> | null = null;

async function readCatalog(options: QuickAddFetchOptions): Promise<QuickAddItem[]> {
  if (cachedItems && Date.now() - cachedAt < CACHE_MS) return cachedItems;
  if (!pending) {
    pending = fetchQuickAddCatalog(fetch, undefined, options)
      .then((items) => {
        cachedItems = items;
        cachedAt = Date.now();
        return items;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

export function invalidateQuickAddCatalog(): void {
  cachedItems = null;
  cachedAt = 0;
}

export interface QuickAddCatalogState {
  items: QuickAddItem[];
  status: QuickAddStatus;
  error: string | null;
  refresh: () => void;
}

/** CAD reads the shared studio_templates catalog only. An unavailable catalog stays visibly unavailable. */
export function useQuickAddCatalog(
  enabled = true,
  options: QuickAddFetchOptions = { app: 'cad-creator', accepts: cadCanAct },
): QuickAddCatalogState {
  const [items, setItems] = React.useState<QuickAddItem[]>([]);
  const [status, setStatus] = React.useState<QuickAddStatus>(enabled ? 'loading' : 'idle');
  const [error, setError] = React.useState<string | null>(null);
  const [requestVersion, setRequestVersion] = React.useState(0);

  React.useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    let active = true;
    setStatus('loading');
    setError(null);
    readCatalog(options)
      .then((next) => {
        if (!active) return;
        setItems(next);
        setStatus(next.length ? 'ready' : 'empty');
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setItems([]);
        setStatus('error');
        setError(reason instanceof Error ? reason.message : 'Studio catalog unavailable');
      });
    return () => { active = false; };
  }, [enabled, options.app, options.accepts, requestVersion]);

  const refresh = React.useCallback(() => {
    invalidateQuickAddCatalog();
    setRequestVersion((version) => version + 1);
  }, []);

  return { items, status, error, refresh };
}
