import { createFileRoute } from "@tanstack/react-router";
import { WidgetUtilitiesPage } from "@/components/widgets/WidgetUtilitiesPage";

// The utility presentation is real; widget configuration remains owned by Settings.
export const Route = createFileRoute("/(apps)/widgets")({
  component: WidgetUtilitiesPage,
});
