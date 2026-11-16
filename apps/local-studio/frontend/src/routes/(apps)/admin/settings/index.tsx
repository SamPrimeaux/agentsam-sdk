import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/(apps)/admin/settings/")({
  beforeLoad: () => {
    throw redirect({ to: "/settings/general" as never });
  },
});
