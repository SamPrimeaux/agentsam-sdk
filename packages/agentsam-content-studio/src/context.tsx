import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type {
  ContentAsset,
  ContentQuery,
  ContentRuntime,
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

/** Reactive library query: refetches on content events. */
export function useLibrary(view: string, query?: Partial<ContentQuery>) {
  const runtime = useContentRuntime();
  const [page, setPage] = useState<ListPage>({ assets: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const queryKey = JSON.stringify(query ?? {});

  useEffect(() => {
    return runtime.events.on("*", () => setTick((t) => t + 1));
  }, [runtime]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    runtime
      .listView(view, query)
      .then((p) => {
        if (alive) {
          setPage(p);
          setLoading(false);
        }
      })
      .catch(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, view, queryKey, tick]);

  return { ...page, loading };
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
