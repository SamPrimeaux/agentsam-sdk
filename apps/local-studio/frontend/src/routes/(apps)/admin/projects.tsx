import { Outlet, createFileRoute } from "@tanstack/react-router";

/** One routed mount for the existing @inneranimalmedia/agentsam-work product. */
export const Route = createFileRoute("/(apps)/admin/projects")({
  component: () => <Outlet />,
});
