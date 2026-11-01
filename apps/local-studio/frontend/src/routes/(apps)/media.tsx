import { createFileRoute } from "@tanstack/react-router";
import { MediaLibraryPage } from "@/components/media/MediaLibraryPage";

/** Canonical Media Library. MovieMode lives only at /admin/moviemode. */
export const Route = createFileRoute("/(apps)/media")({
  component: MediaLibraryPage,
});
