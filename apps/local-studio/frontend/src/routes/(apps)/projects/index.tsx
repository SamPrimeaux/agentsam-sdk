import { createFileRoute, redirect } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

const isHosted = () => typeof window !== "undefined" &&
  !(window as Window & { __AGENTSAM_DESKTOP__?: boolean }).__AGENTSAM_DESKTOP__;

export const Route = createFileRoute("/(apps)/projects/")({
  beforeLoad: () => {
    if (isHosted()) throw redirect({ to: "/admin/projects", replace: true });
  },
  component: ProjectsRoute,
});

function ProjectsRoute() {
  return <LocalStudioWorkPage surface="projects" />;
}
