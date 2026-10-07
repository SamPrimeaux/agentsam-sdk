import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { createHttpWorkHost } from "@inneranimalmedia/agentsam-work/client";
import { WorkProduct } from "@inneranimalmedia/agentsam-work/frontend";
import type { WorkHost, WorkSurfaceId } from "@inneranimalmedia/agentsam-work/contracts";
import "@inneranimalmedia/agentsam-work/theme.css";

/**
 * Production / hosted default: HTTP WorkHost → GET /api/work/snapshot.
 * Fixture host only when explicitly requested (?fixture=populated|demo) —
 * never the production default, and fixtures are lazy-loaded so they stay
 * out of the cold production authority path when unused.
 */
function resolveWorkHostMode(): "http" | "fixture" {
  if (typeof window === "undefined") return "http";
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture");
  if (fixture === "populated" || fixture === "demo") return "fixture";
  if (import.meta.env?.VITE_WORK_FIXTURE === "1") return "fixture";
  return "http";
}

function useLocalStudioWorkHost(): WorkHost | null {
  const mode = useMemo(() => resolveWorkHostMode(), []);
  const [host, setHost] = useState<WorkHost | null>(() =>
    mode === "http" ? createHttpWorkHost("") : null,
  );

  useEffect(() => {
    if (mode !== "fixture") return;
    let cancelled = false;
    void import("@inneranimalmedia/agentsam-work/fixtures").then((mod) => {
      if (cancelled) return;
      setHost(mod.createFixtureWorkHost(mod.populatedWorkFixture));
    });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  return host;
}

export function LocalStudioWorkPage({
  surface,
  projectId,
  ticketId,
}: {
  surface: WorkSurfaceId;
  projectId?: string;
  ticketId?: string;
}) {
  const navigate = useNavigate();
  const host = useLocalStudioWorkHost();
  const mode = resolveWorkHostMode();

  if (!host) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center text-sm text-muted-foreground">
        Loading Work…
      </div>
    );
  }

  return (
    <div className="local-studio-work-surface h-full min-h-0" data-work-host={mode}>
      <WorkProduct
        host={host}
        surface={surface}
        projectId={projectId}
        ticketId={ticketId}
        onNavigate={(href) => {
          const url = new URL(href, window.location.origin);
          const search = Object.fromEntries(url.searchParams.entries());
          void navigate({
            to: url.pathname as never,
            search: search as never,
          });
        }}
      />
    </div>
  );
}
