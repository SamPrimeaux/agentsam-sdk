import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/artifacts/tickets")({
  component: ArtifactTicketsLayout,
});

function ArtifactTicketsLayout() {
  return <Outlet />;
}
