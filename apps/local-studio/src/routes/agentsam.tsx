import { createFileRoute } from "@tanstack/react-router";
import { StudioShell } from "@/components/work/studio-shell";
import { TrailWorkspace } from "@/components/work/trail-workspace";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/agentsam")({ component: AgentSamAdmin });

function AgentSamAdmin() {
  const trail = useWorkStore((s) => s.trails.find((t) => t.id === "trail-studio") ?? s.trails[0]);

  if (!trail) {
    return (
      <StudioShell>
        <div className="flex h-full items-center justify-center text-sm text-clay">No trails yet.</div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <TrailWorkspace trail={trail} />
    </StudioShell>
  );
}
