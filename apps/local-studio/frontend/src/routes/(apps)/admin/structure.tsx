import { createFileRoute, redirect } from "@tanstack/react-router";
import { resolveRetiredStructurePath } from "../../../../../shared/studio-admin-routes.mjs";

// Compatibility only: never mount the retired Website Structure experience.
export const Route = createFileRoute("/(apps)/admin/structure")({
  beforeLoad: ({ location }) => {
    const target = resolveRetiredStructurePath(location.pathname, new URLSearchParams(location.searchStr));
    throw redirect({ href: target || "/admin/preferences", replace: true });
  },
});
