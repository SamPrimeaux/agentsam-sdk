import { createFileRoute } from "@tanstack/react-router";
import { ProjectsPanel } from "@/components/shell/studio-panels";

export const Route = createFileRoute("/(apps)/projects")({
  component: ProjectsPage,
});

function ProjectsPage() {
  return (
    <div className="h-full min-h-0">
      <ProjectsPanel />
    </div>
  );
}
