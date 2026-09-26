import { createFileRoute } from "@tanstack/react-router";
import { LocalStudioWorkPage } from "@/components/work/LocalStudioWorkPage";

export const Route = createFileRoute("/(apps)/artifacts/")({
  component: ArtifactsRoute,
});

function ArtifactsRoute() {
  return <LocalStudioWorkPage surface="artifacts" />;
}
