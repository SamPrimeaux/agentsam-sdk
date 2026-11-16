import { createFileRoute } from "@tanstack/react-router";
import { MediaLibraryPage } from "@/components/media/MediaLibraryPage";

export const Route = createFileRoute("/(apps)/admin/media/models")({
  component: MediaLibraryPage,
});
