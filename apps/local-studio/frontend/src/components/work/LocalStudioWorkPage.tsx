import { useEffect, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  WorkProduct,
  createFixtureWorkHost,
  populatedWorkFixture,
  type WorkSurfaceId,
} from "@inneranimalmedia/agentsam-work";

function useLocalStudioWorkHost() {
  return useMemo(
    () => createFixtureWorkHost(populatedWorkFixture),
    [],
  );
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

  return (
    <div className="h-full min-h-0">
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
