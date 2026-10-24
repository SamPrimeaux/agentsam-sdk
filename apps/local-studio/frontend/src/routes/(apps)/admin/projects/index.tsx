import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/admin/projects/")({
  component: () => <LocalStudioWorkPage surface="projects" />,
});
