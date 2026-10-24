import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { MovieModeSurface } from "@/components/media/MovieModeSurface";

export function MediaRoute() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return <MovieModeSurface screen={(path.startsWith("/media/edit") || path.startsWith("/admin/moviemode/edit")) ? "editor" : "projects"} />;
}

export const Route = createFileRoute("/(apps)/media")({ component: MediaRoute });
