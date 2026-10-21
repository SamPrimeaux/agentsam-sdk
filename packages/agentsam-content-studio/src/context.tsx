import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  ContentAsset,
  ContentQuery,
  ContentRuntime,
  ContentRuntimeCapabilities,
  ListPage,
} from "@inneranimalmedia/agentsam-content";

const RuntimeContext = createContext<ContentRuntime | null>(null);

export function ContentRuntimeProvider(props: {
  runtime: ContentRuntime;
  children: ReactNode;
}) {
  return (
    <RuntimeContext.Provider value={props.runtime}>{props.children}</RuntimeContext.Provider>
  );
}

export function useContentRuntime(): ContentRuntime {
  const runtime = useContext(RuntimeContext);
  if (!runtime) {
    throw new Error("useContentRuntime must be used inside <ContentStudio runtime={...}>");
  }
  return runtime;
}

/** Snapshot of host capabilities — UI must derive chrome from this, never hardcode providers. */
export function useRuntimeCapabilities() {
  const runtime = useContentRuntime();
  const [caps, setCaps] = useState<ContentRuntimeCapabilities | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    return runtime.events.on("*", () => setTick((t) => t + 1));
  }, [runtime]);

  useEffect(() => {
    let alive = true;
    setError(null);
    runtime.capabilities().then((c) => {
      if (alive) setCaps(c);
    }).catch((err) => {
      if (alive) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      alive = false;
    };
  }, [runtime, tick]);

  return { capabilities: caps, error };
}

export function mergeLibraryPages(current: ListPage, next: ListPage): ListPage {
  const seen = new Set(current.assets.map((asset) => asset.id));
  return {
    assets: [...current.assets, ...next.assets.filter((asset) => !seen.has(asset.id))],
    total: next.total,
    cursor: next.cursor,
  };
}

/** Reactive library query: refetches on content events. */
export function useLibrary(view: string, query?: Partial<ContentQuery>) {
  const runtime = useContentRuntime();
  const [page, setPage] = useState<ListPage>({ assets: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const queryKey = JSON.stringify(query ?? {});

  useEffect(() => {
    return runtime.events.on("*", () => setTick((t) => t + 1));
  }, [runtime]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    runtime
      .listView(view, query)
      .then((p) => {
        if (alive) {
          setPage(p);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, view, queryKey, tick]);

  const loadMore = useCallback(async () => {
    if (!page.cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const next = await runtime.listView(view, { ...(query ?? {}), cursor: page.cursor });
      setPage((current) => mergeLibraryPages(current, next));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingMore(false);
    }
  }, [runtime, view, queryKey, page.cursor, loadingMore]);

  return {
    ...page,
    loading,
    loadingMore,
    error,
    hasMore: Boolean(page.cursor),
    loadMore,
  };
}

/** Reactive single asset. */
export function useAsset(assetId: string | null) {
  const runtime = useContentRuntime();
  const [asset, setAsset] = useState<ContentAsset | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!assetId) return;
    return runtime.events.on("*", (e) => {
      if (e.assetId === assetId) setTick((t) => t + 1);
    });
  }, [runtime, assetId]);

  useEffect(() => {
    let alive = true;
    if (!assetId) {
      setAsset(null);
      return;
    }
    runtime.getAsset(assetId).then((a) => alive && setAsset(a));
    return () => {
      alive = false;
    };
  }, [runtime, assetId, tick]);

  return asset;
}

/** Simple viewport windowing so a 5,000-asset grid renders like 50. */
export function useVirtualWindow(total: number, opts: { rowHeight: number; columns: number; viewportHeight: number; overscanRows?: number }) {
  const [scrollTop, setScrollTop] = useState(0);
  const { rowHeight, columns, viewportHeight, overscanRows = 2 } = opts;
  return useMemo(() => {
    const rows = Math.ceil(total / columns);
    const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
    const visibleRows = Math.ceil(viewportHeight / rowHeight) + overscanRows * 2;
    const lastRow = Math.min(rows, firstRow + visibleRows);
    return {
      totalHeight: rows * rowHeight,
      offsetY: firstRow * rowHeight,
      startIndex: firstRow * columns,
      endIndex: Math.min(total, lastRow * columns),
      onScroll: (e: { currentTarget: { scrollTop: number } }) => setScrollTop(e.currentTarget.scrollTop),
    };
  }, [total, rowHeight, columns, viewportHeight, overscanRows, scrollTop]);
}
