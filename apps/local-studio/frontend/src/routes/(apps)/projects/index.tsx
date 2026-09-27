import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/projects/")({
  component: ProjectsRoute,
});

function ProjectsRoute() {
  return <LocalStudioWorkPage surface="projects" />;
}
