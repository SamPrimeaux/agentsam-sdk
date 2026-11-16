import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/settings/$unit")({ component: LegacySettingsUnitRoute });

function LegacySettingsUnitRoute() {
  const { unit } = Route.useParams();
  return <Navigate to="/admin/settings/$unit" params={{ unit }} search={true} replace />;
}
