import { createFileRoute, redirect } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/projects/")({
  beforeLoad: () => { throw redirect({ to: "/admin/projects", search: true, replace: true }); },
  component: ProjectsRoute,
});

function ProjectsRoute() {
  return <LocalStudioWorkPage surface="projects" />;
}
