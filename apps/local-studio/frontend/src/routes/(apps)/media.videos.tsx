import { createFileRoute } from "@tanstack/react-router";
import { MediaLibraryPage } from "@/components/media/MediaLibraryPage";

export const Route = createFileRoute("/(apps)/media/videos")({
  component: MediaLibraryPage,
});
