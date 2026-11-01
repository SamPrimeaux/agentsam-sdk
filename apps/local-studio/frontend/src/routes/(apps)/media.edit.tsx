import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy MovieMode editor bookmark — creative editor lives under Apps only. */
export const Route = createFileRoute("/(apps)/media/edit")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/moviemode/edit" });
  },
  component: () => null,
});
