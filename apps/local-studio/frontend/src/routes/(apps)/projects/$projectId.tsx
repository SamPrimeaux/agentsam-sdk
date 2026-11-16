import { createFileRoute, redirect } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/projects/$projectId")({
  beforeLoad: ({ params }) => { throw redirect({
    to: "/admin/projects/$projectId",
    params: { projectId: params.projectId },
    search: true,
    replace: true,
  }); },
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  return <LocalStudioWorkPage surface="project-detail" projectId={projectId} />;
}
