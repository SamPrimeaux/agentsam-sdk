import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/admin/projects/$projectId")({
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  return <LocalStudioWorkPage surface="project-detail" projectId={projectId} />;
}
