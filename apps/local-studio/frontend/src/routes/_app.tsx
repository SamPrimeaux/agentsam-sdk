import { createFileRoute } from "@tanstack/react-router";
import { AppShellFrame } from "@/components/shell/AppShellFrame";

export const Route = createFileRoute("/_app")({
  component: AppShellFrame,
});
