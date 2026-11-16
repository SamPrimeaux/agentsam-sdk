import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { MediaLibraryPage } from "@/components/media/MediaLibraryPage";

/**
 * /admin/media is the library index; its /images, /videos, /models and /files
 * children own their own page mounts. Do not render a second library in this
 * layout or swallow the child <Outlet />.
 */
export const Route = createFileRoute("/(apps)/admin/media")({
  component: MediaRoute,
});

function MediaRoute() {
  const atIndex = useRouterState({ select: state =>
    state.location.pathname === "/admin/media" || state.location.pathname === "/admin/media/" });
  return atIndex ? <MediaLibraryPage /> : <Outlet />;
}
