import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  WorkProduct,
  applyWorkThemeTokens,
  createHttpWorkHost,
  createFixtureWorkHost,
  populatedWorkFixture,
  readStoredWorkThemeTokens,
  type WorkSurfaceId,
} from "@inneranimalmedia/agentsam-work";
import "@inneranimalmedia/agentsam-work/theme.css";

/**
 * Production / hosted default: HTTP WorkHost → GET /api/work/snapshot.
 * Fixture host only when explicitly requested (?fixture=populated|demo) or
 * VITE_WORK_FIXTURE=1 for Storybook/local preview — never the production default.
 */
function resolveWorkHostMode(): "http" | "fixture" {
  if (typeof window === "undefined") return "http";
  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture");
  if (fixture === "populated" || fixture === "demo") return "fixture";
  if (import.meta.env?.VITE_WORK_FIXTURE === "1") return "fixture";
  return "http";
}

function useLocalStudioWorkHost() {
  return useMemo(() => {
    if (resolveWorkHostMode() === "fixture") {
      return createFixtureWorkHost(populatedWorkFixture);
    }
    return createHttpWorkHost("");
  }, []);
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

  useEffect(() => {
    const stored = readStoredWorkThemeTokens();
    if (stored) applyWorkThemeTokens(stored);
  }, []);

  return (
    <div className="h-full min-h-0" data-work-host={resolveWorkHostMode()}>
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
