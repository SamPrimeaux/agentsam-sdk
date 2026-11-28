import { useCallback, useEffect, useMemo, useState } from "react";
import { ArtifactsSurface } from "@inneranimalmedia/agentsam-work/frontend";
import type { WorkArtifact, WorkSnapshot } from "@inneranimalmedia/agentsam-work/contracts";
import type { SideTab } from "@inneranimalmedia/agentsam-local-shared";
import { sharedLiveWorkHost } from "@/components/work/LocalStudioWorkPage";
import { startArtifactCreation } from "@/lib/work/artifact-launcher";
import { useWorkStore } from "@/lib/work/store";

/**
 * Global account Library for the Side Stage.
 * Artifacts are not project files: this surface always loads the account-wide
 * Work library and never falls back to the New tab when no project is active.
 */
export function ArtifactsStage({ tab }: { tab: SideTab }) {
  const host = useMemo(() => sharedLiveWorkHost(), []);
  const openSideTab = useWorkStore((state) => state.openSideTab);
  const [artifacts, setArtifacts] = useState<WorkArtifact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const snapshot: WorkSnapshot = await host.snapshot({ surface: "artifacts" });
      setArtifacts(Array.isArray(snapshot.artifacts) ? snapshot.artifacts : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Artifacts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [host]);

  useEffect(() => {
    void refresh();
    const onRefresh = () => { void refresh(); };
    window.addEventListener("agentsam:work-refresh", onRefresh);
    return () => window.removeEventListener("agentsam:work-refresh", onRefresh);
  }, [refresh]);

  const openArtifact = useCallback((artifact: WorkArtifact) => {
    if (artifact.source === "local") {
      void host.openArtifact?.(artifact);
      return;
    }

    // Design Canvas documents have a real editor route. Reopen the stored
    // canvas ID in the existing Canvas specialist instead of showing its JSON.
    if (artifact.artifactType === "design-canvas" && artifact.providerId) {
      openSideTab("design", {
        title: artifact.name,
        ephemeral: false,
        url: "/canvas?canvas=" + encodeURIComponent(artifact.providerId),
      });
      return;
    }

    // Prefer the verified preview for formats that browsers cannot render directly (for example PPTX).
    // The original file remains available through the artifact download action.
    const target = artifact.preview || artifact.open;
    if (target) {
      openSideTab("browser", {
        title: artifact.name,
        url: target,
        history: [target],
        historyIndex: 0,
        ephemeral: false,
      });
    }
  }, [host, openSideTab]);

  return (
    <div className="agentsam-artifact-stage" data-testid="artifact-stage" data-tab-id={tab.id}>
      {error ? (
        <div className="agentsam-artifact-stage__error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void refresh()}>Retry</button>
        </div>
      ) : null}
      {loading && artifacts.length === 0 ? (
        <div className="agentsam-artifact-stage__loading" role="status">Loading Artifacts…</div>
      ) : (
        <ArtifactsSurface
          artifacts={artifacts}
          title="Artifacts"
          onCreateArtifact={startArtifactCreation}
          onOpenArtifact={openArtifact}
          onRefresh={refresh}
          openInWorkspace
          showCreateSection
          emptyMessage={error || "Your saved work will appear here."}
        />
      )}
    </div>
  );
}
