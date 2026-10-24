import { createFileRoute, redirect } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

const isHosted = () => typeof window !== "undefined" &&
  !(window as Window & { __AGENTSAM_DESKTOP__?: boolean }).__AGENTSAM_DESKTOP__;

export const Route = createFileRoute("/(apps)/projects/$projectId")({
  beforeLoad: ({ params }) => {
    if (isHosted()) throw redirect({
      to: "/admin/projects/$projectId",
      params: { projectId: params.projectId },
      replace: true,
    });
  },
  component: ProjectDetailRoute,
});

function ProjectDetailRoute() {
  const { projectId } = Route.useParams();
  return <LocalStudioWorkPage surface="project-detail" projectId={projectId} />;
}
