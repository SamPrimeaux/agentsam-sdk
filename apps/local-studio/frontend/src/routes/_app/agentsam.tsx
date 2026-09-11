import { createFileRoute } from "@tanstack/react-router";
import { TrailWorkspace } from "@/components/shell/trail-workspace";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/_app/agentsam")({ component: AgentSamAdmin });

function AgentSamAdmin() {
  const trail = useWorkStore((s) => s.trails.find((t) => t.id === "trail-studio") ?? s.trails[0]);

  if (!trail) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No trails yet.
      </div>
    );
  }

  return <TrailWorkspace trail={trail} />;
}
