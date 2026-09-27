import { createFileRoute } from "@tanstack/react-router";
import { ContentStudioPage } from "@/components/content/ContentStudioPage";

export const Route = createFileRoute("/_app/content")({
  component: ContentStudioPage,
});
