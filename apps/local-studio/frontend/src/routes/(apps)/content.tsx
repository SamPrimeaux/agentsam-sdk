import { createFileRoute } from "@tanstack/react-router";
import { ContentStudioPage } from "@/components/content/ContentStudioPage";

export const Route = createFileRoute("/(apps)/content")({
  component: ContentStudioPage,
});
