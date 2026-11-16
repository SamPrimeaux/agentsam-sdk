import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/artifacts")({
  component: ArtifactsLayout,
});

function ArtifactsLayout() {
  return <Outlet />;
}
