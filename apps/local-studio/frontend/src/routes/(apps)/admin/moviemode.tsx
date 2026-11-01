import { createFileRoute } from "@tanstack/react-router";
import { MovieModeSurface } from "@/components/media/MovieModeSurface";

/** MovieMode is the installed CoPro creative editor under Apps only. */
export const Route = createFileRoute("/(apps)/admin/moviemode")({
  component: () => <MovieModeSurface compactNav screen="projects" />,
});
