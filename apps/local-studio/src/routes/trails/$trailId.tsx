import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { StudioShell } from "@/components/work/studio-shell";
import { TrailWorkspace } from "@/components/work/trail-workspace";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/trails/$trailId")({
  beforeLoad: ({ params }) => {
    if (params.trailId === "trail-studio") {
      throw redirect({ to: "/agentsam" });
    }
  },
  component: TrailPage,
});

function TrailPage() {
  const { trailId } = Route.useParams();
  const trail = useWorkStore((s) => s.trails.find((t) => t.id === trailId));

  if (!trail) {
    return (
      <StudioShell>
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-clay">This trail isn’t on this device.</p>
          <Link to="/trails" className="text-sm text-stone underline-offset-4 hover:underline">
            Back to chats
          </Link>
        </div>
      </StudioShell>
    );
  }

  return (
    <StudioShell>
      <TrailWorkspace trail={trail} />
    </StudioShell>
  );
}
