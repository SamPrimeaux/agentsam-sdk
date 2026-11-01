import { createFileRoute } from "@tanstack/react-router";
import { MovieModeSurface } from "@/components/media/MovieModeSurface";

export const Route = createFileRoute("/(apps)/admin/moviemode/edit")({
  component: () => <MovieModeSurface compactNav screen="editor" />,
});
