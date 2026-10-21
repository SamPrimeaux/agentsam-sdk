import { createFileRoute, useRouterState } from "@tanstack/react-router";
import { MovieModeSurface } from "@/components/media/MovieModeSurface";

function MediaRoute() {
  const path = useRouterState({ select: (state) => state.location.pathname });
  return <MovieModeSurface screen={path.startsWith("/media/edit") ? "editor" : "projects"} />;
}

export const Route = createFileRoute("/(apps)/media")({ component: MediaRoute });
