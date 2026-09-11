import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { TrailWorkspace } from "@/components/shell/trail-workspace";
import { Button } from "@/components/ui/button";
import { useWorkStore } from "@/lib/work/store";

export const Route = createFileRoute("/_app/trails/$trailId")({
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
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">That chat is not on this device.</p>
        <Button asChild variant="secondary">
          <Link to="/trails">Back to chats</Link>
        </Button>
      </div>
    );
  }

  return <TrailWorkspace trail={trail} />;
}
